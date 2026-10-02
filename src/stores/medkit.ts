import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import type {
  BorrowRequest,
  Feedback,
  FeedbackType,
  HandoverMethod,
  Item,
  ItemDraft,
  NearExpiryAck,
  RequestStatus,
  Scene,
  TimelineEvent,
  UseFeedback,
  UseFeedbackUsed,
} from '@/types'
import {
  DELIVERY_SLA_HOURS,
  EXPIRY_PRIORITY_DAYS,
  NEAR_EXPIRY_FOLLOWUP_GRACE_HOURS,
  NEAR_EXPIRY_FOLLOWUP_HOURS,
  NEAR_EXPIRY_OWNER_NOTICE_DAYS,
  PICKUP_WINDOW_HOURS,
  STOCK_LOCKING_STATUSES,
  isNearExpiry,
  validateDraft,
} from '@/rules'
import { addHours, daysUntil, hoursSince } from '@/utils/date'
import { BASE_NOW, DEMO_USERS, freshState, rebuildTimeline, uid } from '@/data/seed'

const STORAGE_KEY = 'medkit-share-state-v2'

interface PersistShape {
  nowIso: string
  currentUserId: string
  items: Item[]
  requests: BorrowRequest[]
  feedbacks: Feedback[]
  useFeedbacks: UseFeedback[]
  timeline: TimelineEvent[]
}

interface ActionResult {
  ok: boolean
  message: string
}

export class ActionError extends Error {}

function load(): PersistShape | null {
  // 优先读 v2；v1 旧演示数据做一次结构迁移（补 useFeedbacks 并按快照重建时间线）
  for (const key of [STORAGE_KEY, 'medkit-share-state-v1']) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const data = JSON.parse(raw) as PersistShape
      if (!Array.isArray(data.items) || !Array.isArray(data.requests)) continue
      if (!Array.isArray(data.useFeedbacks)) data.useFeedbacks = []
      if (!Array.isArray(data.feedbacks)) data.feedbacks = []
      if (key === 'medkit-share-state-v1' || !Array.isArray(data.timeline)) {
        data.timeline = rebuildTimeline(data.items, data.requests, data.feedbacks, data.useFeedbacks)
      }
      return data
    } catch {
      // 损坏数据忽略，落到种子数据
    }
  }
  return null
}

export const useMedkitStore = defineStore('medkit', () => {
  const persisted = load()
  const seed = persisted ?? { ...freshState(BASE_NOW), nowIso: BASE_NOW, currentUserId: 'u_b' }

  const nowIso = ref<string>(persisted?.nowIso ?? BASE_NOW)
  const currentUserId = ref<string>(persisted?.currentUserId ?? 'u_b')
  const items = ref<Item[]>(seed.items)
  const requests = ref<BorrowRequest[]>(seed.requests)
  const feedbacks = ref<Feedback[]>(seed.feedbacks)
  const useFeedbacks = ref<UseFeedback[]>(seed.useFeedbacks)
  const timeline = ref<TimelineEvent[]>(seed.timeline)

  function persist() {
    const data: PersistShape = {
      nowIso: nowIso.value,
      currentUserId: currentUserId.value,
      items: items.value,
      requests: requests.value,
      feedbacks: feedbacks.value,
      useFeedbacks: useFeedbacks.value,
      timeline: timeline.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  function addEvent(e: Omit<TimelineEvent, 'id'>) {
    timeline.value.push({ ...e, id: uid('ev') })
  }

  // ---- 时钟与会话 ----
  function advanceHours(hours: number) {
    nowIso.value = addHours(nowIso.value, hours)
    persist()
  }
  function resetDemo() {
    const f = freshState(BASE_NOW)
    items.value = f.items
    requests.value = f.requests
    feedbacks.value = f.feedbacks
    useFeedbacks.value = f.useFeedbacks
    timeline.value = f.timeline
    nowIso.value = BASE_NOW
    currentUserId.value = 'u_b'
    persist()
  }
  function switchUser(id: string) {
    currentUserId.value = id
    persist()
  }

  const users = DEMO_USERS
  const currentUser = computed(() => DEMO_USERS.find((u) => u.id === currentUserId.value) ?? DEMO_USERS[0])
  const isVolunteer = computed(() => currentUser.value.role === 'volunteer' || currentUser.value.role === 'staff')
  const isStaff = computed(() => currentUser.value.role === 'staff')

  // ---- 库存与状态派生 ----
  const itemsById = computed(() => new Map(items.value.map((i) => [i.id, i])))

  function lockedList(itemId: string): BorrowRequest[] {
    return requests.value.filter((r) => r.itemId === itemId && STOCK_LOCKING_STATUSES.includes(r.status))
  }
  function lockedQty(itemId: string): number {
    return lockedList(itemId).reduce((s, r) => s + r.quantity, 0)
  }
  function availableQty(itemId: string): number {
    const it = itemsById.value.get(itemId)
    if (!it) return 0
    return Math.max(0, it.quantity - lockedQty(itemId))
  }
  function waitingList(itemId: string): BorrowRequest[] {
    return requests.value
      .filter((r) => r.itemId === itemId && r.status === 'waiting')
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  }

  /** 根据库存占用重算 可借/部分外借/借完 三态（其他状态不动） */
  function refreshItemStatus(itemId: string) {
    const it = itemsById.value.get(itemId)
    if (!it) return
    if (it.status !== 'published' && it.status !== 'partially_lent' && it.status !== 'lent_out') return
    const locked = lockedQty(itemId)
    if (locked <= 0) {
      // 数量已核销完（赠予/社区回收）且无在途借用：保持“借完”，不以 0 余量回到大厅可借列表
      it.status = it.quantity <= 0 ? 'lent_out' : 'published'
    } else if (locked < it.quantity) it.status = 'partially_lent'
    else it.status = 'lent_out'
  }

  function requireItem(itemId: string): Item {
    const it = itemsById.value.get(itemId)
    if (!it) throw new ActionError('物品不存在或已被删除。')
    return it
  }

  // ---- 居民：登记 ----
  function register(draft: ItemDraft): ActionResult {
    const { errors, warnings } = validateDraft(draft, nowIso.value)
    if (errors.length) return { ok: false, message: errors.join(' ') }

    const it: Item = reactive({
      ...draft,
      id: uid('i'),
      ownerId: currentUserId.value,
      ownerName: currentUser.value.name,
      status: 'pending_review',
      createdAt: nowIso.value,
    })
    items.value.unshift(it)
    addEvent({
      itemId: it.id,
      at: nowIso.value,
      actorId: currentUserId.value,
      actorName: currentUser.value.name,
      kind: 'registered',
      detail: `登记「${it.name} ${it.spec}」×${it.quantity}`,
    })
    persist()
    return { ok: true, message: warnings.length ? warnings.join(' ') : '登记成功，等待志愿者审核后发布。' }
  }

  // ---- 志愿者：审核 ----
  function reviewItem(itemId: string, approved: boolean, reason?: string): ActionResult {
    if (!isVolunteer.value) return { ok: false, message: '只有志愿者可以审核物品。' }
    const it = requireItem(itemId)
    if (it.status !== 'pending_review') return { ok: false, message: '该物品不在待审核状态。' }

    if (approved) {
      if (daysUntil(it.expiryDate, nowIso.value) < 0) return { ok: false, message: '物品已过期，不能发布，应驳回并引导报废。' }
      it.review = { reviewerId: currentUserId.value, reviewerName: currentUser.value.name, at: nowIso.value, approved: true, reason }
      if (it.category === 'other_consumable') {
        it.review.reason = `志愿者初审通过，待社区工作人员复核${reason ? `：${reason}` : ''}`
        addEvent({ itemId, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'reviewed', detail: '志愿者初审通过，待工作人员复核' })
        persist()
        return { ok: true, message: '初审通过，已转社区工作人员复核。' }
      }
      it.status = 'published'
      it.publishedAt = nowIso.value
      addEvent({ itemId, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'reviewed', detail: `审核通过${reason ? `：${reason}` : ''}` })
      addEvent({ itemId, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'published', detail: '发布到邻里药箱大厅' })
    } else {
      it.status = 'rejected'
      it.review = { reviewerId: currentUserId.value, reviewerName: currentUser.value.name, at: nowIso.value, approved: false, reason: reason || '不符合共享范围' }
      it.closeReason = reason
      addEvent({ itemId, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'reviewed', detail: `审核驳回：${reason || '不符合共享范围（处方药/拆封/冷链/过期等）'}` })
    }
    persist()
    return { ok: true, message: approved ? '已审核通过并发布。' : '已驳回，居民可在“我的共享”看到原因。' }
  }

  /** 工作人员复核“其他非处方耗材” */
  function secondReview(itemId: string, approved: boolean, reason?: string): ActionResult {
    if (!isStaff.value) return { ok: false, message: '需要社区工作人员复核。' }
    const it = requireItem(itemId)
    if (it.status !== 'pending_review' || it.category !== 'other_consumable' || !it.review?.approved) {
      return { ok: false, message: '该物品不需要复核或状态不正确。' }
    }
    if (!approved) {
      it.status = 'rejected'
      it.closeReason = reason
      addEvent({ itemId, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'reviewed', detail: `工作人员复核驳回：${reason ?? '不予共享'}` })
      persist()
      return { ok: true, message: '已复核驳回。' }
    }
    it.status = 'published'
    it.publishedAt = nowIso.value
    addEvent({ itemId, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'published', detail: '工作人员复核通过，发布到大厅' })
    persist()
    return { ok: true, message: '复核通过，已发布。' }
  }

  // ---- 居民：申请借用 ----
  function apply(itemId: string, quantity: number, scene: Scene, method: HandoverMethod, note?: string): ActionResult {
    const it = requireItem(itemId)
    if (!['published', 'partially_lent', 'lent_out'].includes(it.status)) return { ok: false, message: '该物品当前不可申请。' }
    if (daysUntil(it.expiryDate, nowIso.value) < 0) {
      return { ok: false, message: '该物品已过期（超过有效期），不能借用，已提示工作人员报废。' }
    }
    if (quantity <= 0) return { ok: false, message: '借用数量需大于 0。' }
    const avail = availableQty(itemId)
    if (quantity > it.quantity) return { ok: false, message: '申请数量超过登记总量。' }

    const req: BorrowRequest = reactive({
      id: uid('r'),
      itemId,
      applicantId: currentUserId.value,
      applicantName: currentUser.value.name,
      scene,
      quantity,
      method,
      note,
      status: 'waiting',
      createdAt: nowIso.value,
    })
    requests.value.unshift(req)
    const ahead = waitingList(itemId).length - 1
    addEvent({
      itemId,
      requestId: req.id,
      at: nowIso.value,
      actorId: currentUserId.value,
      actorName: currentUser.value.name,
      kind: 'waitlisted',
      detail: `提交借用申请「${it.name}」×${quantity}；当前余量 ${avail}，排队候补${ahead ? `，前面还有 ${ahead} 人` : ''}，需共享人/志愿者确认后锁定`,
    })
    persist()
    return {
      ok: true,
      message:
        avail >= quantity
          ? '申请已提交，等待共享人或志愿者确认（先确认者先得）。'
          : `当前余量仅 ${avail}，已进入候补；他人取消或归还后会按顺序递补。`,
    }
  }

  /** 确认申请并锁定库存（余量不足则保持候补） */
  function confirmRequest(requestId: string): ActionResult {
    const r = requests.value.find((x) => x.id === requestId)
    if (!r) return { ok: false, message: '申请不存在。' }
    if (r.status !== 'waiting') return { ok: false, message: '该申请不在候补中。' }
    const it = requireItem(r.itemId)
    if (it.status === 'recalled' || it.status === 'scrapped' || it.status === 'rejected') {
      return { ok: false, message: '物品已不可借，不能确认。' }
    }
    if (availableQty(r.itemId) < r.quantity) {
      return { ok: false, message: '余量不足，保持候补；可联系申请人协商数量，或等待归还/补充。' }
    }
    r.status = 'confirmed'
    r.confirmedAt = nowIso.value
    r.confirmerId = currentUserId.value
    r.confirmerName = currentUser.value.name
    if (r.method === 'volunteer_delivery' && currentUser.value.role === 'volunteer') {
      r.volunteerId = currentUserId.value
      r.volunteerName = currentUser.value.name
    }
    refreshItemStatus(r.itemId)
    addEvent({ itemId: r.itemId, requestId: r.id, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'confirmed', detail: `确认申请并锁定库存 ×${r.quantity}，${PICKUP_WINDOW_HOURS}小时内需完成交接` })
    persist()
    return { ok: true, message: '已确认并锁定库存，请尽快安排交接。' }
  }

  // ---- 交接 ----
  function startHandover(requestId: string): ActionResult {
    const r = requests.value.find((x) => x.id === requestId)
    if (!r) return { ok: false, message: '申请不存在。' }
    if (r.status !== 'confirmed') return { ok: false, message: '需先确认申请才能开始交接。' }
    const it = requireItem(r.itemId)
    if (it.status === 'quarantined') return { ok: false, message: '物品已被风险隔离，暂停交接。' }
    r.status = 'handing'
    r.handingAt = nowIso.value
    if (r.method === 'volunteer_delivery' && !r.volunteerId && isVolunteer.value) {
      r.volunteerId = currentUserId.value
      r.volunteerName = currentUser.value.name
    }
    const detail =
      r.method === 'volunteer_delivery' ? '志愿者出发代送' : r.method === 'door_contactless' ? '已放到约定门口位置（无接触）' : '物品已放到约定取件点，等待自取'
    addEvent({ itemId: r.itemId, requestId: r.id, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'handover_started', detail })
    persist()
    return { ok: true, message: detail }
  }

  /** 临期交接确认输入（借用人逐项确认效期与使用前检查） */
  interface AckInput {
    expiryConfirmed: boolean
    sealConfirmed: boolean
    appearanceConfirmed: boolean
    withinDateUse: boolean
  }

  function completeHandover(requestId: string, photo: string, note?: string, ackInput?: AckInput): ActionResult {
    const r = requests.value.find((x) => x.id === requestId)
    if (!r) return { ok: false, message: '申请不存在。' }
    if (r.status !== 'handing') return { ok: false, message: '交接尚未开始。' }
    if (!photo.trim()) return { ok: false, message: '请先拍照上传交接凭证再确认。' }
    const it = requireItem(r.itemId)
    if (it.status === 'quarantined') return { ok: false, message: '物品已被风险隔离，不能完成交接。' }

    const near = isNearExpiry(it.expiryDate, nowIso.value)
    let ack: NearExpiryAck | undefined
    if (near) {
      if (!ackInput) return { ok: false, message: '该物品已进入临期优先流转期，须由借用人逐项确认效期与使用前检查后才能完成交接。' }
      if (!(ackInput.expiryConfirmed && ackInput.sealConfirmed && ackInput.appearanceConfirmed && ackInput.withinDateUse)) {
        return { ok: false, message: '请让借用人逐项勾选：核对效期、检查封签、检查外观、到期日前使用；任一项不满足请当场拒收。' }
      }
      ack = reactive({
        at: nowIso.value,
        actorId: r.applicantId,
        actorName: r.applicantName,
        submittedBy: currentUserId.value === r.applicantId ? undefined : `${currentUser.value.name}${r.method === 'volunteer_delivery' ? '代送当面核验后代提交' : '代为确认'}`,
        expiryConfirmed: true,
        sealConfirmed: true,
        appearanceConfirmed: true,
        withinDateUse: true,
        statement: '已核对到期日、封签与外观完好，承诺到期日前使用，到期后不再使用。',
      })
    }

    r.status = 'completed'
    r.completedAt = nowIso.value
    r.handoverPhoto = photo
    r.handoverNote = note
    if (near && ack) {
      r.nearExpiry = true
      r.nearExpiryAck = ack
      r.followUpAt = addHours(nowIso.value, NEAR_EXPIRY_FOLLOWUP_HOURS)
    }
    addEvent({ itemId: r.itemId, requestId: r.id, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'handover_confirmed', detail: `交接拍照确认：${note ?? '包装外观完好'}` })
    if (near && ack) {
      addEvent({
        itemId: r.itemId,
        requestId: r.id,
        at: nowIso.value,
        actorId: r.applicantId,
        actorName: r.applicantName,
        kind: 'near_expiry_ack',
        detail: `临期交接：借用人逐项确认效期与使用前检查（到期日 ${it.expiryDate}，剩 ${daysUntil(it.expiryDate, nowIso.value)} 天）${ack.submittedBy ? `；${ack.submittedBy}` : ''}；约定 ${NEAR_EXPIRY_FOLLOWUP_HOURS} 小时内回访使用情况`,
      })
    }
    persist()
    return {
      ok: true,
      message: near
        ? `交接完成，临期使用前检查确认已留痕。该物品剩 ${daysUntil(it.expiryDate, nowIso.value)} 天到期，系统将于 ${NEAR_EXPIRY_FOLLOWUP_HOURS} 小时后提醒借用人回访反馈是否使用、是否剩余、是否需要社区回收。`
        : '交接完成。请按约定归还或补充。',
    }
  }

  /** 志愿者报备配送延误 */
  function reportDelay(requestId: string, reason: string): ActionResult {
    const r = requests.value.find((x) => x.id === requestId)
    if (!r) return { ok: false, message: '申请不存在。' }
    if (r.status !== 'handing' || r.method !== 'volunteer_delivery') return { ok: false, message: '仅配送中的申请可以报备延误。' }
    r.delayReason = reason || '志愿者临时有事，正在协调改派'
    addEvent({ itemId: r.itemId, requestId: r.id, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'delay_flagged', detail: `配送延误：${r.delayReason}` })
    persist()
    return { ok: true, message: '延误已报备，借用人与工作人员会看到提醒，可改派其他志愿者。' }
  }

  function reassignVolunteer(requestId: string, volunteerId: string): ActionResult {
    const r = requests.value.find((x) => x.id === requestId)
    if (!r) return { ok: false, message: '申请不存在。' }
    if (r.status !== 'handing' || r.method !== 'volunteer_delivery') return { ok: false, message: '仅配送中的申请可以改派。' }
    const v = DEMO_USERS.find((u) => u.id === volunteerId && (u.role === 'volunteer' || u.role === 'staff'))
    if (!v) return { ok: false, message: '未找到可改派的志愿者。' }
    const old = r.volunteerName ?? '原志愿者'
    r.volunteerId = v.id
    r.volunteerName = v.name
    r.delayReason = undefined
    addEvent({ itemId: r.itemId, requestId: r.id, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'handover_started', detail: `配送改派：${old} → ${v.name}` })
    persist()
    return { ok: true, message: `已改派给 ${v.name}。` }
  }

  // ---- 取消 / 超时未取 ----
  function cancelRequest(requestId: string, reason: string, opts: { bySystem?: boolean } = {}): ActionResult {
    const r = requests.value.find((x) => x.id === requestId)
    if (!r) return { ok: false, message: '申请不存在。' }
    if (!['waiting', 'confirmed', 'handing'].includes(r.status)) return { ok: false, message: '该申请已结束，不能取消。' }
    const actor = opts.bySystem ? '系统' : currentUser.value.name
    r.status = 'cancelled'
    r.closedAt = nowIso.value
    r.cancelReason = reason
    refreshItemStatus(r.itemId)
    addEvent({ itemId: r.itemId, requestId: r.id, at: nowIso.value, actorId: opts.bySystem ? 'system' : currentUserId.value, actorName: actor, kind: 'cancelled', detail: `申请取消，库存释放：${reason}` })
    persist()
    const next = waitingList(r.itemId)[0]
    return { ok: true, message: next ? `库存已释放，候补队列首位「${next.applicantName}」可确认递补。` : '申请已取消，库存已释放。' }
  }

  // ---- 闭环：归还 / 补充 / 赠予 / 社区回收 ----
  function closeBorrow(requestId: string, mode: BorrowRequest['closeMode'], note?: string): ActionResult {
    const r = requests.value.find((x) => x.id === requestId)
    if (!r) return { ok: false, message: '申请不存在。' }
    if (r.status !== 'completed') return { ok: false, message: '仅已取走的借用可以登记归还/补充。' }
    const it = requireItem(r.itemId)
    r.status = 'closed_returned'
    r.closedAt = nowIso.value
    r.closeMode = mode
    r.closeNote = note

    if (mode === 'restock_new') {
      it.quantity += r.quantity
    } else if (mode === 'mutual_aid' || mode === 'community_recycle') {
      // 赠予核销 / 社区回收剩余：余量不再回到流通库存
      it.quantity = Math.max(0, it.quantity - r.quantity)
    }
    // return_sealed：数量不变，申请离开锁定集合，余量自然恢复
    refreshItemStatus(r.itemId)

    if (mode === 'community_recycle') {
      // 同步闭环对应的使用回访回收单
      const uf = useFeedbacks.value.find((x) => x.id === r.useFeedbackId)
      if (uf && uf.needRecycle && !uf.resolvedAt) {
        uf.resolvedAt = nowIso.value
        uf.resolverId = currentUserId.value
        uf.resolverName = currentUser.value.name
        uf.resolveNote = note
      }
      addEvent({
        itemId: r.itemId,
        requestId: r.id,
        at: nowIso.value,
        actorId: currentUserId.value,
        actorName: currentUser.value.name,
        kind: 'recycled',
        detail: `社区回收临期物品剩余 ×${r.quantity} 并闭环，不再回到流通${note ? `：${note}` : ''}`,
      })
    } else {
      addEvent({
        itemId: r.itemId,
        requestId: r.id,
        at: nowIso.value,
        actorId: currentUserId.value,
        actorName: currentUser.value.name,
        kind: mode === 'restock_new' ? 'restocked' : 'returned',
        detail:
          mode === 'restock_new'
            ? `已补充同规格新品 ×${r.quantity}${note ? `：${note}` : ''}`
            : mode === 'mutual_aid'
              ? `邻里赠予，无需归还（库存核销 ×${r.quantity}）`
              : `已归还原物（未拆封）×${r.quantity}${note ? `：${note}` : ''}`,
      })
    }
    persist()
    if (mode === 'community_recycle') return { ok: true, message: '社区回收已完成，该笔临期借用闭环，剩余物品不再流通。' }
    const next = waitingList(r.itemId)[0]
    return { ok: true, message: next ? `本次借用已闭环，候补首位「${next.applicantName}」可递补。` : '本次借用已闭环，感谢你的守信与互助。' }
  }

  // ---- 临期物品借出后：使用回访 / 社区回收 ----
  /** 借用人（或工作人员电话回访时代为）反馈：是否使用、是否剩余、是否需要社区回收 */
  function submitUseFeedback(
    requestId: string,
    used: UseFeedbackUsed,
    needRecycle: boolean,
    recycleMethod?: UseFeedback['recycleMethod'],
    note?: string,
  ): ActionResult {
    const r = requests.value.find((x) => x.id === requestId)
    if (!r) return { ok: false, message: '申请不存在。' }
    if (r.status !== 'completed') return { ok: false, message: '仅已取走、尚未闭环的临期借用需要回访反馈。' }
    if (!r.nearExpiry) return { ok: false, message: '该笔借用不是临期物品，无需临期使用回访。' }
    if (r.useFeedbackId) return { ok: false, message: '该笔借用已提交过回访反馈。' }
    if (needRecycle && !recycleMethod) return { ok: false, message: '需要社区回收时，请选择回收方式（上门取 / 自行送到共享柜）。' }

    const onBehalf = currentUserId.value !== r.applicantId && (isVolunteer.value || isStaff.value)
    const uf: UseFeedback = reactive({
      id: uid('uf'),
      requestId: r.id,
      itemId: r.itemId,
      borrowerId: r.applicantId,
      borrowerName: r.applicantName,
      at: nowIso.value,
      used,
      needRecycle,
      recycleMethod: needRecycle ? recycleMethod : undefined,
      note: onBehalf ? `【${currentUser.value.name}电话回访代登记】${note ?? ''}`.trim() : note,
    })
    useFeedbacks.value.unshift(uf)
    r.useFeedbackId = uf.id

    const usedText = used === 'used' ? '已全部使用，无剩余' : used === 'partial' ? '用了一部分，还有剩余' : '完全未使用'
    addEvent({
      itemId: r.itemId,
      requestId: r.id,
      at: nowIso.value,
      actorId: r.applicantId,
      actorName: r.applicantName,
      kind: 'use_feedback',
      detail: `借出回访反馈：${usedText}；${needRecycle ? `需要社区回收（${recycleMethod === 'volunteer_pickup' ? '志愿者上门取' : '自行送到共享柜/居委会'}）` : '无需社区回收'}${uf.note ? `；${uf.note}` : ''}`,
    })

    // 已全部使用：无剩余、无回收，直接按赠予核销闭环，避免临期物品挂在个人名下
    if (used === 'used' && !needRecycle) {
      r.status = 'closed_returned'
      r.closedAt = nowIso.value
      r.closeMode = 'mutual_aid'
      r.closeNote = '临期物品已全部使用，回访后自动核销'
      const it = itemsById.value.get(r.itemId)
      if (it) {
        it.quantity = Math.max(0, it.quantity - r.quantity)
        refreshItemStatus(it.id)
      }
      addEvent({ itemId: r.itemId, requestId: r.id, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'returned', detail: '回访确认已全部使用，库存核销，借用闭环' })
      persist()
      return { ok: true, message: '回访已记录：已全部使用，该笔临期借用自动核销闭环。' }
    }

    persist()
    return {
      ok: true,
      message: needRecycle
        ? '回访已记录，已进入社区回收清单，工作人员会按你选择的方式安排回收。'
        : '回访已记录。剩余未拆封部分请尽快走“归还原物/补充新品”闭环，到期日后不得继续使用。',
    }
  }

  /** 工作人员完成社区回收闭环（剩余物品回收后不再流通） */
  function resolveRecycle(feedbackId: string, note: string): ActionResult {
    if (!isStaff.value) return { ok: false, message: '只有社区工作人员可以确认社区回收闭环。' }
    const uf = useFeedbacks.value.find((x) => x.id === feedbackId)
    if (!uf) return { ok: false, message: '回收记录不存在。' }
    if (uf.resolvedAt) return { ok: false, message: '该回收记录已闭环。' }
    const r = requests.value.find((x) => x.id === uf.requestId)
    if (r && r.status === 'completed') {
      return closeBorrow(r.id, 'community_recycle', note || '工作人员确认剩余物品已收回')
    }
    uf.resolvedAt = nowIso.value
    uf.resolverId = currentUserId.value
    uf.resolverName = currentUser.value.name
    uf.resolveNote = note
    addEvent({ itemId: uf.itemId, requestId: uf.requestId, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'recycled', detail: `社区回收完成：${note}` })
    persist()
    return { ok: true, message: '社区回收已完成。' }
  }

  /** 工作人员/志愿者提醒共享人：临期物品无人借用，请取回或报废（留痕） */
  function remindNearExpiryOwner(itemId: string): ActionResult {
    if (!isVolunteer.value) return { ok: false, message: '只有志愿者或工作人员可以发起临期提醒。' }
    const it = requireItem(itemId)
    const d = daysUntil(it.expiryDate, nowIso.value)
    addEvent({
      itemId,
      at: nowIso.value,
      actorId: currentUserId.value,
      actorName: currentUser.value.name,
      kind: 'near_expiry_notified',
      detail: `临期物品暂无人借用（剩 ${d} 天）：已提醒共享人 ${it.ownerName} 尽快取回自行使用，或交由社区按报废流程处理，避免过期后积压。`,
    })
    persist()
    return { ok: true, message: `已提醒共享人 ${it.ownerName}：物品 ${d} 天后到期且暂无借用，请取回或交社区报废。` }
  }

  /** 工作人员/志愿者催办借用人提交使用回访（留痕） */
  function remindFollowUp(requestId: string): ActionResult {
    if (!isVolunteer.value) return { ok: false, message: '只有志愿者或工作人员可以催办回访。' }
    const r = requests.value.find((x) => x.id === requestId)
    if (!r) return { ok: false, message: '申请不存在。' }
    if (!r.nearExpiry || r.status !== 'completed' || r.useFeedbackId) return { ok: false, message: '该申请不需要回访催办。' }
    const it = itemsById.value.get(r.itemId)
    addEvent({
      itemId: r.itemId,
      requestId: r.id,
      at: nowIso.value,
      actorId: currentUserId.value,
      actorName: currentUser.value.name,
      kind: 'near_expiry_notified',
      detail: `临期借出回访催收：已提醒借用人 ${r.applicantName} 反馈是否使用、是否剩余、是否需要社区回收（物品 ${it?.name ?? ''}，${it ? daysUntil(it.expiryDate, nowIso.value) : '-'} 天后到期）`,
    })
    persist()
    return { ok: true, message: `已催办借用人 ${r.applicantName} 尽快反馈使用/剩余/回收情况。` }
  }

  // ---- 共享人撤回 ----
  function recallItem(itemId: string, reason: string): ActionResult {
    const it = requireItem(itemId)
    if (it.ownerId !== currentUserId.value && !isStaff.value) return { ok: false, message: '只有共享人本人可以撤回。' }
    if (it.status === 'scrapped' || it.status === 'recalled') return { ok: false, message: '物品已结束流转。' }
    it.status = 'recalled'
    it.closeReason = reason
    // 已确认/交接中的借用继续履行；候补中申请全部取消
    const waiting = requests.value.filter((r) => r.itemId === itemId && r.status === 'waiting')
    for (const r of waiting) {
      r.status = 'cancelled'
      r.closedAt = nowIso.value
      r.cancelReason = '共享人撤回物品，候补自动取消'
      addEvent({ itemId, requestId: r.id, at: nowIso.value, actorId: 'system', actorName: '系统', kind: 'cancelled', detail: '共享人撤回，候补申请取消' })
    }
    const inflight = requests.value.filter((r) => r.itemId === itemId && ['confirmed', 'handing', 'completed'].includes(r.status)).length
    addEvent({ itemId, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'recalled', detail: `共享人撤回：${reason}${inflight ? `；${inflight} 笔进行中的借用继续完成` : ''}` })
    persist()
    return { ok: true, message: inflight ? `已撤回，不再接受新申请；${inflight} 笔进行中的借用将继续完成交接与归还。` : '物品已撤回，候补申请已通知取消。' }
  }

  // ---- 反馈：包装破损 / 疑似不适 ----
  function reportFeedback(itemId: string, type: FeedbackType, detail: string, requestId?: string): ActionResult {
    const it = requireItem(itemId)
    if (!detail.trim()) return { ok: false, message: '请填写具体情况描述。' }
    const fb: Feedback = reactive({
      id: uid('f'),
      itemId,
      requestId,
      reporterId: currentUserId.value,
      reporterName: currentUser.value.name,
      type,
      detail,
      createdAt: nowIso.value,
      status: 'open',
    })
    feedbacks.value.unshift(fb)
    addEvent({ itemId, requestId, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'feedback', detail: `${type === 'package_damaged' ? '包装破损反馈' : type === 'adverse_reaction' ? '疑似使用后不适反馈' : '反馈'}：${detail}` })

    // 安全优先：破损/疑似不适立即隔离，停止新借用与交接
    if ((type === 'package_damaged' || type === 'adverse_reaction') && !['scrapped', 'recalled', 'rejected'].includes(it.status)) {
      it.status = 'quarantined'
      it.closeReason = type === 'package_damaged' ? '收到包装破损反馈，已隔离待核查' : '收到疑似不适反应反馈，已隔离待核查'
      for (const r of requests.value.filter((x) => x.itemId === itemId && ['waiting', 'confirmed', 'handing'].includes(x.status))) {
        const label: RequestStatus = r.status
        r.status = 'cancelled'
        r.closedAt = nowIso.value
        r.cancelReason = type === 'package_damaged' ? '物品包装破损被隔离，暂停交接' : '物品收到疑似不适反馈被隔离，暂停交接'
        addEvent({ itemId, requestId: r.id, at: nowIso.value, actorId: 'system', actorName: '系统', kind: 'cancelled', detail: `风险隔离，${label === 'waiting' ? '候补' : '交接中'}申请取消` })
      }
      addEvent({ itemId, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'quarantined', detail: type === 'package_damaged' ? '包装破损：物品已隔离，待工作人员核查' : '疑似不适反应：物品已隔离，建议反馈人就医并保留包装' })
    }
    persist()
    return {
      ok: true,
      message:
        type === 'adverse_reaction'
          ? '已记录并隔离该物品。如不适持续或加重，请立即就医；社区仅做物品流转与风险提醒，不提供诊断。'
          : '已记录反馈，物品已隔离，待社区工作人员核查处理。',
    }
  }

  /** 工作人员处置反馈：报废 或 核查后重新发布 */
  function resolveFeedback(feedbackId: string, action: 'scrap' | 'republish', note: string): ActionResult {
    if (!isStaff.value) return { ok: false, message: '只有社区工作人员可以处置风险反馈。' }
    const fb = feedbacks.value.find((f) => f.id === feedbackId)
    if (!fb || fb.status !== 'open') return { ok: false, message: '反馈不存在或已处置。' }
    const it = requireItem(fb.itemId)
    fb.handledAt = nowIso.value
    fb.handlerId = currentUserId.value
    fb.handlerName = currentUser.value.name
    fb.handleNote = note

    if (action === 'scrap') {
      fb.status = 'resolved_scrap'
      it.status = 'scrapped'
      it.closeReason = `工作人员核查后报废：${note}`
      for (const r of requests.value.filter((x) => x.itemId === it.id && ['waiting', 'confirmed', 'handing'].includes(x.status))) {
        r.status = 'cancelled'
        r.closedAt = nowIso.value
        r.cancelReason = '物品报废，申请取消'
      }
      addEvent({ itemId: it.id, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'scrapped', detail: `核查报废：${note}` })
    } else {
      fb.status = 'resolved_republish'
      it.status = 'published'
      it.closeReason = undefined
      refreshItemStatus(it.id)
      addEvent({ itemId: it.id, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'published', detail: `核查后重新发布：${note}` })
    }
    persist()
    return { ok: true, message: action === 'scrap' ? '已报废并记录，按医疗/有害垃圾流程处理。' : '已解除隔离并重新发布。' }
  }

  /** 工作人员直接报废（过期物品清理等） */
  function scrapItem(itemId: string, reason: string): ActionResult {
    if (!isStaff.value) return { ok: false, message: '只有社区工作人员可以报废物品。' }
    const it = requireItem(itemId)
    if (it.status === 'scrapped') return { ok: false, message: '物品已报废。' }
    it.status = 'scrapped'
    it.closeReason = reason
    for (const r of requests.value.filter((x) => x.itemId === itemId && ['waiting', 'confirmed', 'handing'].includes(x.status))) {
      r.status = 'cancelled'
      r.closedAt = nowIso.value
      r.cancelReason = '物品报废，申请取消'
    }
    addEvent({ itemId, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'scrapped', detail: reason })
    persist()
    return { ok: true, message: '已报废，相关进行中申请已取消。' }
  }

  // ---- 看板派生数据 ----
  const reviewQueue = computed(() => items.value.filter((i) => i.status === 'pending_review'))
  const openFeedbackList = computed(() =>
    feedbacks.value
      .filter((f) => f.status === 'open')
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
  )

  /** 已过期但仍挂在可借状态（大厅会禁借并提示，工作人员应尽快报废） */
  const expiredListed = computed(() =>
    items.value.filter((i) => ['published', 'partially_lent', 'lent_out', 'quarantined'].includes(i.status) && daysUntil(i.expiryDate, nowIso.value) < 0),
  )

  /** 效期临近（60天内）且仍在流转 */
  const expiringSoon = computed(() =>
    items.value
      .filter((i) => ['published', 'partially_lent', 'lent_out'].includes(i.status))
      .map((i) => ({ item: i, days: daysUntil(i.expiryDate, nowIso.value) }))
      .filter((x) => x.days >= 0 && x.days <= 60)
      .sort((a, b) => a.days - b.days),
  )

  // ---- 临期优先流转（≤10 天）----
  interface NearExpiryRow {
    item: Item
    days: number
    available: number
    waitingCount: number
    /** 已临期借出、尚未闭环的申请（completed：等回访 / 已回访待回收） */
    lentRequests: BorrowRequest[]
    /** 是否无人借用：没有锁定库存中的借用，也没有候补 */
    noBorrower: boolean
    /** 是否到了提醒共享人取回或报废的时点（≤ NEAR_EXPIRY_OWNER_NOTICE_DAYS 天且无人借用） */
    ownerNoticeDue: boolean
    /** 建议优先推荐的候补邻居：本物品候补 + 同场景在别处候补且取不到的人 */
    candidates: { req: BorrowRequest; item: Item }[]
  }

  /** 工作人员“临期优先流转”清单：≤10 天到期、仍有存量且仍在流转的物品，附场景/推荐范围/盯办状态 */
  const nearExpiryList = computed<NearExpiryRow[]>(() => {
    const active = items.value.filter((i) => ['published', 'partially_lent', 'lent_out'].includes(i.status) && i.quantity > 0)
    return active
      .map((item) => {
        const days = daysUntil(item.expiryDate, nowIso.value)
        const lentRequests = requests.value.filter(
          (r) => r.itemId === item.id && ['confirmed', 'handing', 'completed'].includes(r.status),
        )
        const itemWaiting = waitingList(item.id)
        // 同场景、在别的物品处候补且该物品已无余量的邻居，可优先推荐这件临期品
        const candidates = itemWaiting
          .map((req) => ({ req, item }))
          .concat(
            requests.value
              .filter(
                (r) =>
                  r.status === 'waiting' &&
                  r.itemId !== item.id &&
                  item.sceneTags.includes(r.scene) &&
                  availableQty(r.itemId) === 0,
              )
              .map((req) => ({ req, item: itemsById.value.get(req.itemId) ?? item })),
          )
        const noBorrower = lockedList(item.id).length === 0 && itemWaiting.length === 0
        return {
          item,
          days,
          available: availableQty(item.id),
          waitingCount: itemWaiting.length,
          lentRequests,
          noBorrower,
          ownerNoticeDue: noBorrower && days <= NEAR_EXPIRY_OWNER_NOTICE_DAYS,
          candidates,
        }
      })
      .filter((x) => x.days >= 0 && x.days <= EXPIRY_PRIORITY_DAYS)
      .sort((a, b) => a.days - b.days)
  })

  interface FollowUpRow {
    req: BorrowRequest
    item?: Item
    /** 距约定回访时间的小时数（负=已逾期） */
    hoursToDue: number
    overdue: boolean
    feedback?: UseFeedback
  }

  /** 临期借出后的回访队列：约定时间到未反馈的；overdue 表示超过宽限期仍未反馈 */
  const followUpQueue = computed<FollowUpRow[]>(() =>
    requests.value
      .filter((r) => r.nearExpiry && r.followUpAt && r.status === 'completed' && !r.useFeedbackId)
      .map((r) => {
        const hoursToDue = -hoursSince(r.followUpAt!, nowIso.value)
        return {
          req: r,
          item: itemsById.value.get(r.itemId),
          hoursToDue,
          overdue: -hoursToDue > NEAR_EXPIRY_FOLLOWUP_GRACE_HOURS,
        }
      })
      .sort((a, b) => a.hoursToDue - b.hoursToDue),
  )

  /** 待社区回收：借用人回访表示需要回收、尚未闭环的记录 */
  const recycleQueue = computed(() =>
    useFeedbacks.value
      .filter((uf) => uf.needRecycle && !uf.resolvedAt)
      .map((uf) => ({ uf, req: requests.value.find((r) => r.id === uf.requestId), item: itemsById.value.get(uf.itemId) })),
  )

  function useFeedbackOf(requestId?: string): UseFeedback | undefined {
    if (!requestId) return undefined
    return useFeedbacks.value.find((uf) => uf.id === requestId)
  }

  interface OverduePickup {
    req: BorrowRequest
    hours: number
  }
  /** 超时未取：确认后超过时限仍未完成交接 */
  const overduePickups = computed<OverduePickup[]>(() =>
    requests.value
      .filter((r) => r.status === 'confirmed' || (r.status === 'handing' && r.method === 'self_pickup'))
      .map((r) => ({ req: r, hours: hoursSince(r.handingAt ?? r.confirmedAt ?? r.createdAt, nowIso.value) }))
      .filter((x) => x.hours > PICKUP_WINDOW_HOURS)
      .sort((a, b) => b.hours - a.hours),
  )

  interface DelayedDelivery {
    req: BorrowRequest
    hours: number
  }
  /** 志愿者配送延误：交接开始后超过 SLA 未完成 */
  const delayedDeliveries = computed<DelayedDelivery[]>(() =>
    requests.value
      .filter((r) => r.status === 'handing' && r.method === 'volunteer_delivery')
      .map((r) => ({ req: r, hours: hoursSince(r.handingAt ?? r.confirmedAt ?? r.createdAt, nowIso.value) }))
      .filter((x) => x.hours > DELIVERY_SLA_HOURS)
      .sort((a, b) => b.hours - a.hours),
  )

  const stats = computed(() => {
    const active = items.value.filter((i) => ['published', 'partially_lent', 'lent_out'].includes(i.status))
    return {
      activeCount: active.length,
      reviewCount: reviewQueue.value.length,
      inFlight: requests.value.filter((r) => ['confirmed', 'handing'].includes(r.status)).length,
      waiting: requests.value.filter((r) => r.status === 'waiting').length,
      completedOpen: requests.value.filter((r) => r.status === 'completed').length,
      openFeedback: openFeedbackList.value.length,
      expired: expiredListed.value.length,
      quarantined: items.value.filter((i) => i.status === 'quarantined').length,
      scrapped: items.value.filter((i) => i.status === 'scrapped').length,
      nearExpiry: nearExpiryList.value.length,
      nearExpiryNoBorrower: nearExpiryList.value.filter((x) => x.noBorrower).length,
      followUpDue: followUpQueue.value.length,
      followUpOverdue: followUpQueue.value.filter((x) => x.overdue).length,
      recyclePending: recycleQueue.value.length,
    }
  })

  function itemTimeline(itemId: string): TimelineEvent[] {
    return timeline.value.filter((e) => e.itemId === itemId).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  }
  function itemRequests(itemId: string): BorrowRequest[] {
    return requests.value.filter((r) => r.itemId === itemId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }

  return {
    // state
    nowIso,
    currentUserId,
    users,
    items,
    requests,
    feedbacks,
    useFeedbacks,
    timeline,
    // getters
    currentUser,
    isVolunteer,
    isStaff,
    reviewQueue,
    openFeedbackList,
    expiredListed,
    expiringSoon,
    nearExpiryList,
    followUpQueue,
    recycleQueue,
    overduePickups,
    delayedDeliveries,
    stats,
    // actions
    advanceHours,
    resetDemo,
    switchUser,
    availableQty,
    lockedQty,
    lockedList,
    waitingList,
    refreshItemStatus,
    register,
    reviewItem,
    secondReview,
    apply,
    confirmRequest,
    startHandover,
    completeHandover,
    reportDelay,
    reassignVolunteer,
    cancelRequest,
    closeBorrow,
    recallItem,
    reportFeedback,
    resolveFeedback,
    scrapItem,
    submitUseFeedback,
    resolveRecycle,
    remindNearExpiryOwner,
    remindFollowUp,
    useFeedbackOf,
    itemTimeline,
    itemRequests,
  }
})
