import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import type {
  BorrowRequest,
  Feedback,
  FeedbackType,
  HandoverMethod,
  Item,
  ItemDraft,
  RequestStatus,
  Scene,
  TimelineEvent,
  UseFeedback,
} from '@/types'
import {
  DELIVERY_SLA_HOURS,
  isNearExpiry,
  NEAR_EXPIRY_FEEDBACK_HOURS,
  PICKUP_WINDOW_HOURS,
  STOCK_LOCKING_STATUSES,
  validateDraft,
} from '@/rules'
import { addHours, daysUntil, hoursSince } from '@/utils/date'
import { BASE_NOW, DEMO_USERS, freshState, uid } from '@/data/seed'

const STORAGE_KEY = 'medkit-share-state-v2'

interface PersistShape {
  nowIso: string
  currentUserId: string
  items: Item[]
  requests: BorrowRequest[]
  feedbacks: Feedback[]
  timeline: TimelineEvent[]
}

interface ActionResult {
  ok: boolean
  message: string
}

export class ActionError extends Error {}

function load(): PersistShape | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as PersistShape
    if (!Array.isArray(data.items) || !Array.isArray(data.requests)) return null
    return data
  } catch {
    return null
  }
}

export const useMedkitStore = defineStore('medkit', () => {
  const persisted = load()
  const seed = persisted ?? { ...freshState(BASE_NOW), nowIso: BASE_NOW, currentUserId: 'u_b' }

  const nowIso = ref<string>(persisted?.nowIso ?? BASE_NOW)
  const currentUserId = ref<string>(persisted?.currentUserId ?? 'u_b')
  const items = ref<Item[]>(seed.items)
  const requests = ref<BorrowRequest[]>(seed.requests)
  const feedbacks = ref<Feedback[]>(seed.feedbacks)
  const timeline = ref<TimelineEvent[]>(seed.timeline)

  function persist() {
    const data: PersistShape = {
      nowIso: nowIso.value,
      currentUserId: currentUserId.value,
      items: items.value,
      requests: requests.value,
      feedbacks: feedbacks.value,
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
    if (locked <= 0) it.status = 'published'
    else if (locked < it.quantity) it.status = 'partially_lent'
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
      detail: `登记「${it.name} ${it.spec}」×${it.quantity}${isNearExpiry(it.expiryDate, nowIso.value) ? '（临期物品，将进入优先流转清单）' : ''}`,
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
      addEvent({ itemId, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'reviewed', detail: `审核通过${reason ? `：${reason}` : ''}${isNearExpiry(it.expiryDate, nowIso.value) ? '（临期物品，列入工作人员优先流转清单）' : ''}` })
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
          ? isNearExpiry(it.expiryDate, nowIso.value)
            ? '申请已提交（临期物品）：交接时需逐项确认效期与使用前检查，并在约定时间反馈使用/剩余/回收情况。'
            : '申请已提交，等待共享人或志愿者确认（先确认者先得）。'
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

  /**
   * 完成交接（拍照强制）。
   * 临期物品（≤30 天到期）必须同时留存借用人对“效期 + 使用前检查要求”的确认记录，
   * 并约定取走后 NEAR_EXPIRY_FEEDBACK_HOURS 小时内反馈使用/剩余/回收需求。
   */
  function completeHandover(
    requestId: string,
    photo: string,
    note?: string,
    ack?: { expiryDate: string; preUseCheckAck: boolean },
  ): ActionResult {
    const r = requests.value.find((x) => x.id === requestId)
    if (!r) return { ok: false, message: '申请不存在。' }
    if (r.status !== 'handing') return { ok: false, message: '交接尚未开始。' }
    if (!photo.trim()) return { ok: false, message: '请先拍照上传交接凭证再确认。' }
    const it = requireItem(r.itemId)
    if (it.status === 'quarantined') return { ok: false, message: '物品已被风险隔离，不能完成交接。' }

    const near = isNearExpiry(it.expiryDate, nowIso.value)
    if (near) {
      if (!ack?.preUseCheckAck) {
        return { ok: false, message: '临期物品交接前，借用人必须逐项确认效期与使用前检查要求（未开封封签完好、过期停用等）。' }
      }
      r.nearExpiry = true
      r.expiryAckAt = nowIso.value
      r.expiryAckDate = it.expiryDate
      r.preUseCheckAck = true
      r.feedbackDueAt = addHours(nowIso.value, NEAR_EXPIRY_FEEDBACK_HOURS)
      addEvent({
        itemId: r.itemId,
        requestId: r.id,
        at: nowIso.value,
        actorId: r.applicantId,
        actorName: r.applicantName,
        kind: 'expiry_ack',
        detail: `交接确认：借用人已核对有效期至 ${it.expiryDate}（剩 ${daysUntil(it.expiryDate, nowIso.value)} 天），逐项确认使用前检查要求；约定取走后 ${NEAR_EXPIRY_FEEDBACK_HOURS} 小时内反馈是否使用、是否剩余、是否需要社区回收。`,
      })
    }

    r.status = 'completed'
    r.completedAt = nowIso.value
    r.handoverPhoto = photo
    r.handoverNote = note
    addEvent({ itemId: r.itemId, requestId: r.id, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'handover_confirmed', detail: `交接拍照确认：${note ?? '包装外观完好'}${near ? '；临期物品，效期与使用前检查已由借用人确认留痕' : ''}` })
    persist()
    return {
      ok: true,
      message: near
        ? `交接完成。该物品临近效期，请在取走后 ${NEAR_EXPIRY_FEEDBACK_HOURS} 小时内反馈是否使用、是否剩余、是否需要社区回收。`
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

  // ---- 闭环：归还 / 补充 / 赠予（临期借用需先用后反馈） ----
  function closeBorrow(requestId: string, mode: BorrowRequest['closeMode'], note?: string): ActionResult {
    const r = requests.value.find((x) => x.id === requestId)
    if (!r) return { ok: false, message: '申请不存在。' }
    if (r.status !== 'completed') return { ok: false, message: '仅已取走的借用可以登记归还/补充。' }
    if (r.nearExpiry && !r.useFeedback) {
      return { ok: false, message: '该物品临近效期，请先按约定反馈“是否使用、是否剩余、是否需要社区回收”，再办理归还/补充。' }
    }
    if (r.useFeedback?.needRecycle && mode !== 'community_recycle') {
      return { ok: false, message: '借用人已申请社区回收剩余物品，请由社区工作人员完成回收闭环。' }
    }
    const it = requireItem(r.itemId)
    r.status = 'closed_returned'
    r.closedAt = nowIso.value
    r.closeMode = mode
    r.closeNote = note

    if (mode === 'restock_new') {
      it.quantity += r.quantity
    } else if (mode === 'mutual_aid') {
      it.quantity = Math.max(0, it.quantity - r.quantity)
    }
    // return_sealed：数量不变，申请离开锁定集合，余量自然恢复
    refreshItemStatus(r.itemId)
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
    persist()
    const next = waitingList(r.itemId)[0]
    return { ok: true, message: next ? `本次借用已闭环，候补首位「${next.applicantName}」可递补。` : '本次借用已闭环，感谢你的守信与互助。' }
  }

  // ---- 临期优先流转：用后反馈 / 回收 / 提醒 ----
  /** 借用人按约定反馈：是否使用、是否剩余、是否需要社区回收 */
  function submitUseFeedback(
    requestId: string,
    fb: { used: boolean; usedCount?: number; remaining: number; needRecycle: boolean; note?: string },
  ): ActionResult {
    const r = requests.value.find((x) => x.id === requestId)
    if (!r) return { ok: false, message: '申请不存在。' }
    if (r.applicantId !== currentUserId.value) return { ok: false, message: '只有借用人本人可以提交用后反馈。' }
    if (r.status !== 'completed') return { ok: false, message: '仅已取走的临期借用需要提交用后反馈。' }
    if (!r.nearExpiry) return { ok: false, message: '该物品不在临期追踪范围。' }
    if (fb.remaining < 0 || fb.remaining > r.quantity) return { ok: false, message: `剩余数量需在 0 ~ ${r.quantity} 之间。` }
    const usedCount = fb.used ? fb.usedCount ?? 0 : 0
    if (fb.used && usedCount <= 0) return { ok: false, message: '请填写实际使用数量。' }
    if (usedCount > r.quantity) return { ok: false, message: '使用数量不能超过借用数量。' }
    if (usedCount + fb.remaining > r.quantity) return { ok: false, message: '使用数量 + 剩余数量不能超过借用数量。' }

    const data: UseFeedback = {
      at: nowIso.value,
      used: fb.used,
      usedCount,
      remaining: fb.remaining,
      needRecycle: fb.needRecycle,
      note: fb.note?.trim() || undefined,
    }
    r.useFeedback = data
    addEvent({
      itemId: r.itemId,
      requestId: r.id,
      at: nowIso.value,
      actorId: currentUserId.value,
      actorName: currentUser.value.name,
      kind: 'use_feedback',
      detail: `用后反馈：${data.used ? `已使用 ${data.usedCount} 片/件` : '未使用'}，剩余 ${data.remaining}，${data.needRecycle ? '需要社区回收' : '无需社区回收'}${data.note ? `；${data.note}` : ''}`,
    })
    persist()
    return {
      ok: true,
      message: data.needRecycle
        ? '反馈已记录，社区工作人员会尽快联系你上门或定点回收剩余物品，到期前请保持包装完好、不要自行使用或转赠。'
        : '反馈已记录，感谢配合；可继续办理归还/补充闭环。',
    }
  }

  /** 到约定时间仍未反馈：工作人员/系统提醒借用人（避免临期物品长期滞留个人家中） */
  function remindBorrowerFeedback(requestId: string): ActionResult {
    const r = requests.value.find((x) => x.id === requestId)
    if (!r) return { ok: false, message: '申请不存在。' }
    if (!isVolunteer.value) return { ok: false, message: '只有志愿者或社区工作人员可以催办用后反馈。' }
    if (!r.nearExpiry || r.status !== 'completed') return { ok: false, message: '该申请不在临期反馈提醒范围。' }
    if (r.useFeedback) return { ok: false, message: '借用人已提交反馈，无需再次提醒。' }
    r.feedbackRemindedAt = nowIso.value
    addEvent({ itemId: r.itemId, requestId: r.id, at: nowIso.value, actorId: 'u_s', actorName: currentUser.value.name, kind: 'feedback_reminder', detail: `已到约定反馈时间（取走后 ${NEAR_EXPIRY_FEEDBACK_HOURS} 小时），提醒借用人 ${r.applicantName} 反馈是否使用、是否剩余、是否需要社区回收` })
    persist()
    return { ok: true, message: `已提醒借用人 ${r.applicantName}（演示消息）：请尽快反馈使用/剩余/回收需求。` }
  }

  /** 临期且无人借用：提醒共享人取回或报废 */
  function remindNearExpiryOwner(itemId: string): ActionResult {
    if (!isStaff.value) return { ok: false, message: '只有社区工作人员可以发起临期取回/报废提醒。' }
    const it = requireItem(itemId)
    if (!['published', 'partially_lent', 'lent_out'].includes(it.status)) return { ok: false, message: '该物品当前不在流转中。' }
    if (!isNearExpiry(it.expiryDate, nowIso.value)) return { ok: false, message: '该物品尚未进入临期（≤30天）范围。' }
    it.ownerRetrieveRemindedAt = nowIso.value
    addEvent({ itemId, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'near_expiry_reminder', detail: `临期无人借用（剩 ${daysUntil(it.expiryDate, nowIso.value)} 天）：已提醒共享人 ${it.ownerName} 取回继续自用，或申请由社区报废` })
    persist()
    return { ok: true, message: `已提醒共享人 ${it.ownerName}（演示消息）：物品临期无人借用，请取回或申请报废。` }
  }

  /** 共享人对临期物品申请报废（工作人员确认后执行） */
  function ownerRequestScrap(itemId: string, reason: string): ActionResult {
    const it = requireItem(itemId)
    if (it.ownerId !== currentUserId.value) return { ok: false, message: '只有共享人本人可以申请报废。' }
    if (!['published', 'partially_lent', 'lent_out'].includes(it.status)) return { ok: false, message: '该物品当前不能申请报废。' }
    if (lockedList(itemId).some((r) => ['confirmed', 'handing', 'completed'].includes(r.status))) {
      return { ok: false, message: '仍有进行中或已借出的借用，请在这些借用闭环后再报废；也可以联系工作人员协助。' }
    }
    it.scrapRequestedAt = nowIso.value
    it.scrapRequestReason = reason || '临期无人借用，共享人申请报废'
    addEvent({ itemId, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'scrap_requested', detail: `共享人申请报废：${it.scrapRequestReason}` })
    persist()
    return { ok: true, message: '报废申请已提交，社区工作人员确认后统一按医疗/有害垃圾处理。' }
  }

  /** 社区回收借用人手中的临期剩余物品并闭环（含到期/未使用余量统一报废） */
  function recycleCompleted(requestId: string, note?: string): ActionResult {
    if (!isStaff.value) return { ok: false, message: '只有社区工作人员可以登记社区回收。' }
    const r = requests.value.find((x) => x.id === requestId)
    if (!r) return { ok: false, message: '申请不存在。' }
    if (r.status !== 'completed') return { ok: false, message: '该申请不在待回收状态。' }
    if (!r.useFeedback) return { ok: false, message: '请先取得借用人的用后反馈再回收。' }
    const it = requireItem(r.itemId)
    const remaining = r.useFeedback.remaining
    r.status = 'closed_returned'
    r.closedAt = nowIso.value
    r.closeMode = 'community_recycle'
    r.closeNote = note || `社区回收剩余 ${remaining} 件并统一报废处理`
    // 已使用与已回收的数量都不会回到共享库存；余量全部回收完毕则物品同步报废
    it.quantity = Math.max(0, it.quantity - r.quantity)
    r.useFeedback.recycleCompletedAt = nowIso.value
    r.useFeedback.recycleHandlerId = currentUserId.value
    r.useFeedback.recycleHandlerName = currentUser.value.name
    r.useFeedback.recycleNote = r.closeNote
    addEvent({ itemId: r.itemId, requestId: r.id, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'recycled', detail: `${r.closeNote}；临期物品未滞留居民家中，回收链路闭环` })
    if (it.quantity === 0 && lockedList(it.id).length === 0) {
      it.status = 'scrapped'
      it.closeReason = '临期余量已由社区回收完毕，统一报废处理'
      addEvent({ itemId: r.itemId, at: nowIso.value, actorId: currentUserId.value, actorName: currentUser.value.name, kind: 'scrapped', detail: it.closeReason })
    } else {
      refreshItemStatus(r.itemId)
    }
    persist()
    return { ok: true, message: `已回收剩余 ${remaining} 件并登记闭环，物品统一报废处理。` }
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

  /** 工作人员直接报废（过期物品清理、共享人报废申请确认等） */
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

  interface NearExpiryIdleRow {
    item: Item
    days: number
    available: number
    locked: number
    waiting: number
    /** 已提醒共享人取回/报废 */
    reminded: boolean
    /** 共享人已申请报废待确认 */
    scrapRequested: boolean
  }
  /** 临期（≤30天）且仍有余量在架、可优先推荐的清单（按到期急迫度排序） */
  const nearExpiryIdle = computed<NearExpiryIdleRow[]>(() =>
    items.value
      .filter((i) => ['published', 'partially_lent', 'lent_out'].includes(i.status))
      .map((i) => ({
        item: i,
        days: daysUntil(i.expiryDate, nowIso.value),
        available: availableQty(i.id),
        locked: lockedQty(i.id),
        waiting: waitingList(i.id).length,
        reminded: !!i.ownerRetrieveRemindedAt,
        scrapRequested: !!i.scrapRequestedAt,
      }))
      .filter((x) => x.days >= 0 && x.days <= 30 && x.available > 0)
      .sort((a, b) => a.days - b.days),
  )

  type NearExpiryTrackingState = 'feedback_pending' | 'feedback_due' | 'pending_recycle' | 'feedback_done' | 'recycled'
  interface NearExpiryTrackingRow {
    req: BorrowRequest
    item: Item
    days: number
    dueInHours: number
    state: NearExpiryTrackingState
  }
  /** 临期物品借出后的用后追踪：到期未反馈→提醒；反馈要回收→社区回收闭环 */
  const nearExpiryTracking = computed<NearExpiryTrackingRow[]>(() =>
    requests.value
      .filter((r) => r.nearExpiry && (r.status === 'completed' || r.status === 'closed_returned'))
      .map((r) => {
        const item = itemsById.value.get(r.itemId)
        const days = item ? daysUntil(item.expiryDate, nowIso.value) : -999
        let state: NearExpiryTrackingState
        if (r.status === 'closed_returned' && r.closeMode === 'community_recycle') state = 'recycled'
        else if (r.useFeedback?.needRecycle) state = 'pending_recycle'
        else if (r.useFeedback) state = 'feedback_done'
        else if (r.feedbackDueAt && hoursSince(r.feedbackDueAt, nowIso.value) >= 0) state = 'feedback_due'
        else state = 'feedback_pending'
        return { req: r, item: item!, days, dueInHours: r.feedbackDueAt ? hoursSince(r.feedbackDueAt, nowIso.value) : 0, state }
      })
      .filter((x) => x.item)
      .sort((a, b) => (a.req.completedAt ?? '') < (b.req.completedAt ?? '') ? -1 : 1),
  )

  /** 到约定反馈时间仍未反馈的临期借用 */
  const nearExpiryFeedbackDue = computed(() => nearExpiryTracking.value.filter((x) => x.state === 'feedback_due'))
  /** 借用人反馈需要社区回收、等待工作人员上门/定点回收 */
  const pendingRecycle = computed(() => nearExpiryTracking.value.filter((x) => x.state === 'pending_recycle'))
  /** 共享人已申请报废、待工作人员确认的物品 */
  const ownerScrapRequests = computed(() => items.value.filter((i) => i.scrapRequestedAt && i.status !== 'scrapped'))

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
      nearExpiryIdle: nearExpiryIdle.value.length,
      nearExpiryFeedbackDue: nearExpiryFeedbackDue.value.length,
      pendingRecycle: pendingRecycle.value.length,
      ownerScrapRequests: ownerScrapRequests.value.length,
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
    timeline,
    // getters
    currentUser,
    isVolunteer,
    isStaff,
    reviewQueue,
    openFeedbackList,
    expiredListed,
    expiringSoon,
    nearExpiryIdle,
    nearExpiryTracking,
    nearExpiryFeedbackDue,
    pendingRecycle,
    ownerScrapRequests,
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
    submitUseFeedback,
    remindBorrowerFeedback,
    remindNearExpiryOwner,
    ownerRequestScrap,
    recycleCompleted,
    recallItem,
    reportFeedback,
    resolveFeedback,
    scrapItem,
    itemTimeline,
    itemRequests,
  }
})
