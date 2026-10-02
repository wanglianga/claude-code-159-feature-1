import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMedkitStore } from '@/stores/medkit'
import { addHours } from '@/utils/date'

function newStore() {
  localStorage.clear()
  setActivePinia(createPinia())
  return useMedkitStore()
}

/** 居民申请 → 共享人确认 → 自取开始交接（停在 handing，供各用例完成交接） */
function prepareNearHandover(store: ReturnType<typeof useMedkitStore>, method: 'self_pickup' | 'volunteer_delivery' = 'self_pickup') {
  // i13：王秀兰共享的退热贴，BASE 时间点恰好 10 天后到期，数量 2
  store.switchUser('u_b')
  const apply = store.apply('i13', 1, 'child_night_fever', method, '夜里急用')
  expect(apply.ok).toBe(true)
  const req = store.requests.find((r) => r.itemId === 'i13' && r.applicantId === 'u_b')!
  store.switchUser('u_a')
  expect(store.confirmRequest(req.id).ok).toBe(true)
  if (method === 'volunteer_delivery') {
    store.switchUser('u_v')
  } else {
    store.switchUser('u_b')
  }
  expect(store.startHandover(req.id).ok).toBe(true)
  return req.id
}

const FULL_ACK = { expiryConfirmed: true, sealConfirmed: true, appearanceConfirmed: true, withinDateUse: true }

describe('临期清单与优先推荐（工作人员视角）', () => {
  it('≤10 天到期的在架物品进入临期清单，附场景与盯办状态', () => {
    const store = newStore()
    const ids = store.nearExpiryList.map((x) => x.item.id)
    expect(ids).toContain('i13') // 10 天
    expect(ids).toContain('i14') // 3 天
    expect(ids).toContain('i15') // 6 天
    expect(ids).not.toContain('i2') // 45 天不进入
    const row = store.nearExpiryList.find((x) => x.item.id === 'i13')!
    expect(row.days).toBe(10)
    expect(row.item.sceneTags).toContain('child_night_fever')
    expect(row.noBorrower).toBe(true)
    expect(row.ownerNoticeDue).toBe(false) // 10 天，未到 5 天提醒线
  })

  it('为临期物品匹配同场景候补邻居作为优先推荐对象', () => {
    const store = newStore()
    // i14（碘伏，home_care 场景）：r4 王秀兰在 i6（体温计电池）候补，而 i6 余量为 0
    const row = store.nearExpiryList.find((x) => x.item.id === 'i14')!
    expect(row.candidates.some((c) => c.req.id === 'r4')).toBe(true)
    // i14 已有一笔临期借出 r6 需要盯办
    expect(row.lentRequests.some((r) => r.id === 'r6')).toBe(true)
  })

  it('到期前 5 天仍无人借用，清单标记应提醒共享人；提醒动作写入时间线', () => {
    const store = newStore()
    store.advanceHours(24 * 5) // i13：10 天 → 5 天
    const row = store.nearExpiryList.find((x) => x.item.id === 'i13')!
    expect(row.noBorrower).toBe(true)
    expect(row.ownerNoticeDue).toBe(true)

    store.switchUser('u_s')
    const r = store.remindNearExpiryOwner('i13')
    expect(r.ok).toBe(true)
    const ev = store.itemTimeline('i13').find((e) => e.kind === 'near_expiry_notified')
    expect(ev?.detail).toContain('取回')
  })
})

describe('临期交接：效期 + 使用前检查强制确认', () => {
  it('未传确认或未逐项勾选时不能完成交接', () => {
    const store = newStore()
    const id = prepareNearHandover(store)
    expect(store.completeHandover(id, 'photo.jpg').ok).toBe(false)
    expect(store.completeHandover(id, 'photo.jpg', undefined, { ...FULL_ACK, sealConfirmed: false }).ok).toBe(false)
    const req = store.requests.find((r) => r.id === id)!
    expect(req.status).toBe('handing')
  })

  it('逐项确认 + 拍照后完成交接，记录借用人确认快照并设定 24h 回访', () => {
    const store = newStore()
    const id = prepareNearHandover(store)
    const r = store.completeHandover(id, 'handover-x.jpg', '包装完好', FULL_ACK)
    expect(r.ok).toBe(true)
    expect(r.message).toContain('回访')
    const req = store.requests.find((x) => x.id === id)!
    expect(req.status).toBe('completed')
    expect(req.nearExpiry).toBe(true)
    expect(req.nearExpiryAck?.actorId).toBe('u_b')
    expect(req.nearExpiryAck?.expiryConfirmed && req.nearExpiryAck?.withinDateUse).toBe(true)
    expect(req.followUpAt).toBeDefined()
    expect(addHours(req.completedAt!, 24)).toBe(req.followUpAt)
    expect(store.itemTimeline('i13').some((e) => e.kind === 'near_expiry_ack')).toBe(true)
  })

  it('志愿者代送完成临期交接：确认记录记在借用人名下，标注代提交', () => {
    const store = newStore()
    const id = prepareNearHandover(store, 'volunteer_delivery')
    // 当前身份为志愿者 u_v
    expect(store.currentUser.id).toBe('u_v')
    expect(store.completeHandover(id, 'delivery.jpg', '送达', FULL_ACK).ok).toBe(true)
    const req = store.requests.find((x) => x.id === id)!
    expect(req.nearExpiryAck?.actorId).toBe('u_b')
    expect(req.nearExpiryAck?.submittedBy).toContain('陈芳')
  })

  it('非临期物品交接不需要确认，也不设定回访', () => {
    const store = newStore()
    // i1 退热贴 180 天后到期；r3 已确认超时，直接走它
    store.switchUser('u_c')
    expect(store.startHandover('r3').ok).toBe(true)
    expect(store.completeHandover('r3', 'p.jpg').ok).toBe(true)
    const r3 = store.requests.find((x) => x.id === 'r3')!
    expect(r3.nearExpiry).toBeUndefined()
    expect(r3.followUpAt).toBeUndefined()
  })
})

describe('临期借出后的回访与回收', () => {
  it('种子数据：r6 回访已逾期进入看板（超过 12h 宽限），r7 已回访不进入', () => {
    const store = newStore()
    const ids = store.followUpQueue.map((x) => x.req.id)
    expect(ids).toContain('r6')
    expect(ids).not.toContain('r7')
    const row = store.followUpQueue.find((x) => x.req.id === 'r6')!
    expect(row.overdue).toBe(true)
  })

  it('借用人反馈“已全部使用、无需回收”后自动核销闭环', () => {
    const store = newStore()
    const id = prepareNearHandover(store)
    store.completeHandover(id, 'p.jpg', undefined, FULL_ACK)
    store.switchUser('u_b')
    const r = store.submitUseFeedback(id, 'used', false, undefined, '用完了')
    expect(r.ok).toBe(true)
    const req = store.requests.find((x) => x.id === id)!
    expect(req.status).toBe('closed_returned')
    expect(req.closeMode).toBe('mutual_aid')
    // 已从回访队列消失
    expect(store.followUpQueue.some((x) => x.req.id === id)).toBe(false)
    expect(store.itemTimeline('i13').some((e) => e.kind === 'use_feedback')).toBe(true)
  })

  it('反馈“部分使用 + 需要社区回收”进入回收队列，工作人员确认后按社区回收闭环', () => {
    const store = newStore()
    const id = prepareNearHandover(store)
    store.completeHandover(id, 'p.jpg', undefined, FULL_ACK)
    store.switchUser('u_b')
    expect(store.submitUseFeedback(id, 'partial', true, 'volunteer_pickup', '还剩 2 贴').ok).toBe(true)

    const ufId = store.requests.find((x) => x.id === id)!.useFeedbackId!
    expect(store.recycleQueue.some((x) => x.uf.id === ufId)).toBe(true)

    store.switchUser('u_s')
    expect(store.resolveRecycle(ufId, '志愿者已上门取回').ok).toBe(true)
    const req = store.requests.find((x) => x.id === id)!
    expect(req.status).toBe('closed_returned')
    expect(req.closeMode).toBe('community_recycle')
    expect(store.recycleQueue.some((x) => x.uf.id === ufId)).toBe(false)
    expect(store.itemTimeline('i13').some((e) => e.kind === 'recycled')).toBe(true)
  })

  it('需要回收但未选回收方式时拒绝提交', () => {
    const store = newStore()
    const id = prepareNearHandover(store)
    store.completeHandover(id, 'p.jpg', undefined, FULL_ACK)
    store.switchUser('u_b')
    expect(store.submitUseFeedback(id, 'unused', true).ok).toBe(false)
  })

  it('工作人员可电话回访代登记，记录代登记备注', () => {
    const store = newStore()
    store.switchUser('u_s')
    const r = store.submitUseFeedback('r6', 'unused', true, 'self_dropoff', '电话已联系，本人今晚送到居委会')
    expect(r.ok).toBe(true)
    const uf = store.useFeedbacks.find((x) => x.requestId === 'r6')!
    expect(uf.borrowerId).toBe('u_b') // 记录仍归借用人
    expect(uf.note).toContain('电话回访代登记')
    // 催办动作留痕
    const fresh = newStore()
    fresh.switchUser('u_s')
    expect(fresh.remindFollowUp('r6').ok).toBe(true)
    expect(fresh.itemTimeline('i14').some((e) => e.kind === 'near_expiry_notified')).toBe(true)
  })

  it('种子 uf1：i15 借用人已约“自行送到居委会”，待工作人员回收闭环', () => {
    const store = newStore()
    const rows = store.recycleQueue
    const uf1 = rows.find((x) => x.uf.id === 'uf1')
    expect(uf1).toBeDefined()
    expect(uf1!.uf.recycleMethod).toBe('self_dropoff')
    store.switchUser('u_s')
    expect(store.resolveRecycle('uf1', '已在居委会回收箱签收').ok).toBe(true)
    const r7 = store.requests.find((x) => x.id === 'r7')!
    expect(r7.closeMode).toBe('community_recycle')
  })
})

describe('普通物品流程回归', () => {
  it('非临期物品可正常申请/确认/交接/归还，余量恢复', () => {
    const store = newStore()
    // i4 创可贴：周敏共享，数量 4，r1 已锁定 1 → 可借 3
    expect(store.availableQty('i4')).toBe(3)
    store.switchUser('u_b')
    const apply = store.apply('i4', 1, 'elderly_wound', 'self_pickup')
    expect(apply.ok).toBe(true)
    const id = store.requests.find((r) => r.itemId === 'i4' && r.status === 'waiting')!.id
    store.switchUser('u_c')
    store.confirmRequest(id)
    store.switchUser('u_b')
    store.startHandover(id)
    expect(store.completeHandover(id, 'p.jpg').ok).toBe(true)
    expect(store.availableQty('i4')).toBe(2)
    expect(store.closeBorrow(id, 'return_sealed').ok).toBe(true)
    expect(store.availableQty('i4')).toBe(3)
  })
})
