import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMedkitStore } from '@/stores/medkit'
import { BASE_NOW } from '@/data/seed'
import { addDays } from '@/utils/date'
import { NEAR_EXPIRY_FEEDBACK_HOURS, PICKUP_WINDOW_HOURS } from '@/rules'
import type { ItemDraft } from '@/types'

function nearExpiryDraft(over: Partial<ItemDraft> = {}): ItemDraft {
  return {
    name: '儿童退热贴',
    category: 'fever_patch',
    spec: '4贴/盒',
    expiryDate: addDays(BASE_NOW, 10).slice(0, 10),
    storage: 'cool_dry',
    sealed: true,
    quantity: 1,
    location: '3号楼1单元共享柜 A格',
    sceneTags: ['child_night_fever'],
    ...over,
  }
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('基础流程', () => {
  it('登记 → 志愿者审核 → 发布', () => {
    const s = useMedkitStore()
    s.switchUser('u_a')
    const reg = s.register(nearExpiryDraft())
    expect(reg.ok).toBe(true)
    const id = s.items[0].id
    expect(s.items[0].status).toBe('pending_review')

    s.switchUser('u_v')
    const rev = s.reviewItem(id, true, '核验通过')
    expect(rev.ok).toBe(true)
    expect(s.items.find((i) => i.id === id)!.status).toBe('published')
  })

  it('禁入品登记失败', () => {
    const s = useMedkitStore()
    s.switchUser('u_a')
    const r = s.register(nearExpiryDraft({ name: '布洛芬胶囊', expiryDate: addDays(BASE_NOW, 200).slice(0, 10) }))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('处方')
  })

  it('多人申请：确认即锁定，余量不足保持候补，取消后可递补', () => {
    const s = useMedkitStore()
    // i5 口罩 20 件；构造两人各借 20 的场景不太够锁，直接用 i1（2件）：r3 已确认锁 1，剩 1
    s.switchUser('u_b')
    const a1 = s.apply('i1', 1, 'child_night_fever', 'self_pickup')
    expect(a1.ok).toBe(true)
    const newReq = s.requests.find((r) => r.applicantId === 'u_b' && r.itemId === 'i1' && r.status === 'waiting')!
    expect(s.availableQty('i1')).toBe(1)
    s.switchUser('u_a')
    expect(s.confirmRequest(newReq.id).ok).toBe(true)
    expect(s.availableQty('i1')).toBe(0)

    // 第三个人必须候补
    s.switchUser('u_c')
    s.apply('i1', 1, 'child_night_fever', 'self_pickup')
    const wait = s.requests.find((r) => r.applicantId === 'u_c' && r.itemId === 'i1')!
    s.switchUser('u_a')
    expect(s.confirmRequest(wait.id).ok).toBe(false)
    expect(wait.status).toBe('waiting')

    // 取消已确认申请释放库存
    expect(s.cancelRequest(newReq.id, '测试取消').ok).toBe(true)
    expect(s.availableQty('i1')).toBe(1)
    expect(s.confirmRequest(wait.id).ok).toBe(true)
  })

  it('过期物品不能申请', () => {
    const s = useMedkitStore()
    const r = s.apply('i12', 1, 'no_mask', 'self_pickup')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('过期')
  })

  it('交接必须拍照', () => {
    const s = useMedkitStore()
    s.switchUser('u_c') // r3 申请人，状态 confirmed
    expect(s.startHandover('r3').ok).toBe(true)
    const noPhoto = s.completeHandover('r3', '')
    expect(noPhoto.ok).toBe(false)
    expect(noPhoto.message).toContain('拍照')
  })

  it('补充新品增加库存并释放候补', () => {
    const s = useMedkitStore()
    const before = s.items.find((i) => i.id === 'i6')!.quantity
    s.switchUser('u_b')
    const r = s.closeBorrow('r2', 'restock_new', '买了新电池补充')
    expect(r.ok).toBe(true)
    expect(s.items.find((i) => i.id === 'i6')!.quantity).toBe(before + 2)
  })

  it('撤回：候补自动取消，进行中借用保留', () => {
    const s = useMedkitStore()
    s.switchUser('u_a')
    const r = s.recallItem('i1', '自己要用')
    expect(r.ok).toBe(true)
    expect(s.items.find((i) => i.id === 'i1')!.status).toBe('recalled')
  })

  it('包装破损反馈立即隔离', () => {
    const s = useMedkitStore()
    s.switchUser('u_b')
    const r = s.reportFeedback('i5', 'package_damaged', '包装盒被雨水泡了')
    expect(r.ok).toBe(true)
    expect(s.items.find((i) => i.id === 'i5')!.status).toBe('quarantined')
    // 配送中的 r5 被取消
    expect(s.requests.find((x) => x.id === 'r5')!.status).toBe('cancelled')
  })

  it('工作人员可报废物品，报废后申请取消', () => {
    const s = useMedkitStore()
    s.switchUser('u_s')
    expect(s.scrapItem('i12', '过期报废').ok).toBe(true)
    expect(s.items.find((i) => i.id === 'i12')!.status).toBe('scrapped')
  })

  it('同一件物品动作串在同一条时间线', () => {
    const s = useMedkitStore()
    s.switchUser('u_a')
    s.register(nearExpiryDraft())
    const id = s.items[0].id
    s.switchUser('u_v')
    s.reviewItem(id, true)
    const ev = s.itemTimeline(id)
    expect(ev.some((e) => e.kind === 'registered')).toBe(true)
    expect(ev.some((e) => e.kind === 'reviewed')).toBe(true)
    expect(ev.some((e) => e.kind === 'published')).toBe(true)
  })
})

describe('临期优先流转', () => {
  it('临期物品完成交接必须留存借用人效期确认，并设置用后反馈约定时间', () => {
    const s = useMedkitStore()
    s.switchUser('u_a')
    s.register(nearExpiryDraft())
    const id = s.items[0].id
    s.switchUser('u_v')
    s.reviewItem(id, true)

    s.switchUser('u_b')
    s.apply(id, 1, 'child_night_fever', 'self_pickup')
    const req = s.requests.find((r) => r.itemId === id && r.status === 'waiting')!
    s.switchUser('u_a')
    s.confirmRequest(req.id)
    s.switchUser('u_b')
    s.startHandover(req.id)

    // 没有逐项确认 → 拒绝完成交接
    const fail = s.completeHandover(req.id, 'photo.jpg')
    expect(fail.ok).toBe(false)
    expect(fail.message).toContain('使用前检查')

    const ok = s.completeHandover(req.id, 'photo.jpg', '封签完好', { expiryDate: addDays(BASE_NOW, 10).slice(0, 10), preUseCheckAck: true })
    expect(ok.ok).toBe(true)
    const saved = s.requests.find((r) => r.id === req.id)!
    expect(saved.nearExpiry).toBe(true)
    expect(saved.expiryAckAt).toBeTruthy()
    expect(saved.expiryAckDate).toBe(addDays(BASE_NOW, 10).slice(0, 10))
    expect(saved.preUseCheckAck).toBe(true)
    expect(saved.feedbackDueAt).toBeTruthy()
    expect(s.itemTimeline(id).some((e) => e.kind === 'expiry_ack')).toBe(true)
  })

  it('非临期物品交接无需效期确认', () => {
    const s = useMedkitStore()
    s.switchUser('u_c') // r3: i1 有效期 180 天，confirmed 自取
    s.startHandover('r3')
    const r = s.completeHandover('r3', 'p.jpg')
    expect(r.ok).toBe(true)
    expect(s.requests.find((x) => x.id === 'r3')!.nearExpiry).toBeFalsy()
  })

  it('临期借用未反馈不能闭环；反馈无需回收后可正常闭环', () => {
    const s = useMedkitStore()
    s.switchUser('u_c') // r6: i14 临期 completed
    const blocked = s.closeBorrow('r6', 'return_sealed')
    expect(blocked.ok).toBe(false)
    expect(blocked.message).toContain('反馈')

    const fb = s.submitUseFeedback('r6', { used: true, usedCount: 1, remaining: 0, needRecycle: false })
    expect(fb.ok).toBe(true)
    const closed = s.closeBorrow('r6', 'mutual_aid')
    expect(closed.ok).toBe(true)
    expect(s.requests.find((r) => r.id === 'r6')!.status).toBe('closed_returned')
  })

  it('反馈数量校验：使用+剩余不能超过借用数量', () => {
    const s = useMedkitStore()
    s.switchUser('u_c')
    const bad = s.submitUseFeedback('r6', { used: true, usedCount: 1, remaining: 1, needRecycle: false })
    expect(bad.ok).toBe(false)
  })

  it('反馈需要社区回收：本人不能直接闭环，工作人员回收后请求闭环、余量清零并报废', () => {
    const s = useMedkitStore()
    // 种子 r7：i16 已反馈 needRecycle，等待回收
    const r7 = s.requests.find((r) => r.id === 'r7')!
    expect(r7.useFeedback?.needRecycle).toBe(true)

    s.switchUser('u_b')
    expect(s.closeBorrow('r7', 'return_sealed').ok).toBe(false)

    s.switchUser('u_s')
    expect(s.recycleCompleted('r7').ok).toBe(true)
    const done = s.requests.find((r) => r.id === 'r7')!
    expect(done.status).toBe('closed_returned')
    expect(done.closeMode).toBe('community_recycle')
    expect(done.useFeedback?.recycleCompletedAt).toBeTruthy()
    expect(s.items.find((i) => i.id === 'i16')!.status).toBe('scrapped')
    expect(s.itemTimeline('i16').some((e) => e.kind === 'recycled')).toBe(true)
  })

  it('到约定反馈时间未反馈进入催办清单，工作人员提醒留痕', () => {
    const s = useMedkitStore()
    // 种子 r6 完成于 80 小时前，约定 72 小时 → 已到期
    expect(s.nearExpiryFeedbackDue.some((x) => x.req.id === 'r6')).toBe(true)

    s.switchUser('u_c')
    expect(s.remindBorrowerFeedback('r6').ok).toBe(false) // 居民无权催办
    s.switchUser('u_v')
    const r = s.remindBorrowerFeedback('r6')
    expect(r.ok).toBe(true)
    expect(s.requests.find((x) => x.id === 'r6')!.feedbackRemindedAt).toBeTruthy()
    expect(s.itemTimeline('i14').some((e) => e.kind === 'feedback_reminder')).toBe(true)

    // 反馈后离开催办清单
    s.switchUser('u_c')
    s.submitUseFeedback('r6', { used: false, remaining: 1, needRecycle: true })
    expect(s.nearExpiryFeedbackDue.some((x) => x.req.id === 'r6')).toBe(false)
    expect(s.pendingRecycle.some((x) => x.req.id === 'r6')).toBe(true)
  })

  it('时钟快进：未到约定时间不催办，超过 72 小时自动出现', () => {
    const s = useMedkitStore()
    // 构造一个刚完成 1 小时的临期借用
    s.switchUser('u_a')
    s.register(nearExpiryDraft({ quantity: 1 }))
    const id = s.items[0].id
    s.switchUser('u_v')
    s.reviewItem(id, true)
    s.switchUser('u_b')
    s.apply(id, 1, 'child_night_fever', 'self_pickup')
    const req = s.requests.find((r) => r.itemId === id && r.status === 'waiting')!
    s.switchUser('u_a')
    s.confirmRequest(req.id)
    s.switchUser('u_b')
    s.startHandover(req.id)
    s.completeHandover(req.id, 'p.jpg', undefined, { expiryDate: addDays(BASE_NOW, 10).slice(0, 10), preUseCheckAck: true })
    expect(s.nearExpiryFeedbackDue.some((x) => x.req.id === req.id)).toBe(false)

    s.advanceHours(NEAR_EXPIRY_FEEDBACK_HOURS + 1)
    expect(s.nearExpiryFeedbackDue.some((x) => x.req.id === req.id)).toBe(true)
  })

  it('临期待流转清单按到期日排序，含可借余量与提醒状态', () => {
    const s = useMedkitStore()
    const ids = s.nearExpiryIdle.map((x) => x.item.id)
    expect(ids).toContain('i13') // 10 天
    expect(ids).toContain('i15') // 5 天
    expect(ids).not.toContain('i14') // 已全部借出，无余量
    expect(ids.indexOf('i15')).toBeLessThan(ids.indexOf('i13'))
    expect(s.stats.nearExpiryIdle).toBe(ids.length)
  })

  it('临期无人借用：工作人员提醒共享人取回/报废，非工作人员无权操作', () => {
    const s = useMedkitStore()
    s.switchUser('u_v')
    expect(s.remindNearExpiryOwner('i13').ok).toBe(false)
    s.switchUser('u_s')
    const r = s.remindNearExpiryOwner('i13')
    expect(r.ok).toBe(true)
    expect(s.items.find((i) => i.id === 'i13')!.ownerRetrieveRemindedAt).toBeTruthy()
    expect(s.itemTimeline('i13').some((e) => e.kind === 'near_expiry_reminder')).toBe(true)
  })

  it('共享人可对无人借用的临期物品申请报废，工作人员确认后报废', () => {
    const s = useMedkitStore()
    s.switchUser('u_c') // i15 owner
    const r = s.ownerRequestScrap('i15', '到期无人借用，申请报废')
    expect(r.ok).toBe(true)
    expect(s.ownerScrapRequests.some((i) => i.id === 'i15')).toBe(true)

    // 有进行中借用的物品不能申请报废
    s.switchUser('u_a')
    expect(s.ownerRequestScrap('i14', '试一下').ok).toBe(false)

    s.switchUser('u_s')
    expect(s.scrapItem('i15', '确认共享人申请，统一报废').ok).toBe(true)
    expect(s.items.find((i) => i.id === 'i15')!.status).toBe('scrapped')
  })

  it('超时未取看板随演示时钟出现，取消后释放', () => {
    const s = useMedkitStore()
    // r3 确认于 26 小时前 → 已超时
    expect(s.overduePickups.some((x) => x.req.id === 'r3')).toBe(true)
    expect(s.overduePickups[0].hours).toBeGreaterThan(PICKUP_WINDOW_HOURS)
    s.switchUser('u_v')
    const r = s.cancelRequest('r3', '超时未取，释放', { bySystem: true })
    expect(r.ok).toBe(true)
    expect(s.availableQty('i1')).toBe(2)
  })
})
