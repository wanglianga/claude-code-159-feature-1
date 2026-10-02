// 演示用户：居民 / 志愿者 / 社区工作人员
import type { BorrowRequest, DemoUser, Feedback, Item, TimelineEvent, UseFeedback } from '@/types'
import { addDays, addHours } from '@/utils/date'

export type { DemoUser }

export const DEMO_USERS: DemoUser[] = [
  { id: 'u_a', name: '王秀兰', role: 'resident', address: '幸福里小区 3号楼1单元' },
  { id: 'u_b', name: '李建国', role: 'resident', address: '幸福里小区 2号楼2单元' },
  { id: 'u_c', name: '周敏', role: 'resident', address: '幸福里小区 5号楼3单元' },
  { id: 'u_v', name: '陈芳（志愿者）', role: 'volunteer', address: '幸福里小区 1号楼' },
  { id: 'u_s', name: '赵磊（社区工作人员）', role: 'staff', address: '幸福里社区居委会' },
]

// 演示“当前时间”基准，时钟可在页面底部快进，用于演示效期/超时
export const BASE_NOW = '2026-09-27T09:00:00'

let seq = 0
export function uid(prefix: string): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}_${seq}_${Math.random().toString(36).slice(2, 6)}`
}

function buildSeed(now: string): { items: Item[]; requests: BorrowRequest[]; feedbacks: Feedback[]; useFeedbacks: UseFeedback[] } {
  const items: Item[] = [
    {
      id: 'i1',
      ownerId: 'u_a',
      ownerName: '王秀兰',
      name: '医用退热贴',
      category: 'fever_patch',
      spec: '4贴/盒',
      expiryDate: addDays(now, 180).slice(0, 10),
      storage: 'cool_dry',
      sealed: true,
      quantity: 2,
      location: '3号楼1单元一楼“邻里药箱”共享柜 A格',
      sceneTags: ['child_night_fever'],
      note: '家里备多了，未拆封，夜间急用可先取。',
      status: 'published',
      createdAt: addDays(now, -10),
      publishedAt: addDays(now, -9),
    },
    {
      id: 'i2',
      ownerId: 'u_c',
      ownerName: '周敏',
      name: '碘伏棉片',
      category: 'iodophor',
      spec: '独立包装 20片/盒',
      expiryDate: addDays(now, 45).slice(0, 10),
      storage: 'room_temp',
      sealed: true,
      quantity: 5,
      location: '5号楼3单元门口便民架',
      sceneTags: ['elderly_wound', 'home_care'],
      note: '效期不足两个月，页面会显著提示，请按需借用。',
      status: 'published',
      createdAt: addDays(now, -6),
      publishedAt: addDays(now, -6),
    },
    {
      id: 'i4',
      ownerId: 'u_c',
      ownerName: '周敏',
      name: '创可贴',
      category: 'bandage',
      spec: '100片/盒',
      expiryDate: addDays(now, 300).slice(0, 10),
      storage: 'room_temp',
      sealed: true,
      quantity: 4,
      location: '5号楼3单元门口便民架',
      sceneTags: ['elderly_wound', 'home_care'],
      status: 'published',
      createdAt: addDays(now, -15),
      publishedAt: addDays(now, -14),
    },
    {
      id: 'i5',
      ownerId: 'u_a',
      ownerName: '王秀兰',
      name: '一次性使用医用口罩',
      category: 'mask',
      spec: '50只/盒（灭菌级）',
      expiryDate: addDays(now, 400).slice(0, 10),
      storage: 'room_temp',
      sealed: true,
      quantity: 20,
      location: '3号楼1单元一楼“邻里药箱”共享柜 B格',
      sceneTags: ['no_mask', 'home_care'],
      status: 'published',
      createdAt: addDays(now, -8),
      publishedAt: addDays(now, -8),
    },
    {
      id: 'i6',
      ownerId: 'u_c',
      ownerName: '周敏',
      name: '体温计纽扣电池',
      category: 'thermometer_battery',
      spec: 'LR41 2粒/板',
      expiryDate: addDays(now, 700).slice(0, 10),
      storage: 'room_temp',
      sealed: true,
      quantity: 2,
      location: '5号楼3单元门口便民架',
      sceneTags: ['child_night_fever', 'home_care'],
      note: '电子体温计没电时应急更换。',
      status: 'published',
      createdAt: addDays(now, -12),
      publishedAt: addDays(now, -12),
    },
    {
      id: 'i7',
      ownerId: 'u_b',
      ownerName: '李建国',
      name: '儿童退热贴',
      category: 'fever_patch',
      spec: '6贴/盒',
      expiryDate: addDays(now, 240).slice(0, 10),
      storage: 'cool_dry',
      sealed: true,
      quantity: 1,
      location: '2号楼2单元201门口挂袋',
      sceneTags: ['child_night_fever'],
      status: 'pending_review',
      createdAt: addHours(now, -2),
    },
    {
      id: 'i8',
      ownerId: 'u_a',
      ownerName: '王秀兰',
      name: '碘伏消毒液',
      category: 'iodophor',
      spec: '100ml/瓶 带密封盖',
      expiryDate: addDays(now, 20).slice(0, 10),
      storage: 'room_temp',
      sealed: true,
      quantity: 2,
      location: '3号楼1单元一楼“邻里药箱”共享柜 A格',
      sceneTags: ['elderly_wound'],
      note: '临近效期，请志愿者审核时重点确认。',
      status: 'pending_review',
      createdAt: addDays(now, -1),
    },
    {
      id: 'i9',
      ownerId: 'u_a',
      ownerName: '王秀兰',
      name: '防水创可贴',
      category: 'bandage',
      spec: '20片/盒',
      expiryDate: addDays(now, 200).slice(0, 10),
      storage: 'room_temp',
      sealed: true,
      quantity: 1,
      location: '3号楼1单元一楼“邻里药箱”共享柜 A格',
      sceneTags: ['elderly_wound'],
      status: 'quarantined',
      createdAt: addDays(now, -5),
      publishedAt: addDays(now, -5),
      closeReason: '借用反馈包装破损，已隔离待工作人员核查',
    },
    {
      id: 'i3',
      ownerId: 'u_a',
      ownerName: '王秀兰',
      name: '无菌纱布块',
      category: 'gauze',
      spec: '5片/袋（独立灭菌）',
      expiryDate: addDays(now, 12).slice(0, 10),
      storage: 'room_temp',
      sealed: true,
      quantity: 3,
      location: '3号楼1单元一楼“邻里药箱”共享柜 A格',
      sceneTags: ['elderly_wound', 'home_care'],
      note: '临近效期，且收到疑似不适反馈已隔离。',
      status: 'quarantined',
      createdAt: addDays(now, -7),
      publishedAt: addDays(now, -7),
      closeReason: '借用人反馈使用后伤口周围发红，疑似不适，已隔离',
    },
    {
      id: 'i10',
      ownerId: 'u_c',
      ownerName: '周敏',
      name: '儿童防护口罩',
      category: 'mask',
      spec: '10只/包',
      expiryDate: addDays(now, 300).slice(0, 10),
      storage: 'room_temp',
      sealed: true,
      quantity: 1,
      location: '5号楼3单元门口便民架',
      sceneTags: ['no_mask'],
      status: 'recalled',
      createdAt: addDays(now, -9),
      publishedAt: addDays(now, -8),
      closeReason: '家中孩子也要用，共享人主动撤回',
    },
    {
      id: 'i11',
      ownerId: 'u_a',
      ownerName: '王秀兰',
      name: '老式脱脂纱布（旧）',
      category: 'gauze',
      spec: '散装旧包装',
      expiryDate: addDays(now, -200).slice(0, 10),
      storage: 'room_temp',
      sealed: true,
      quantity: 1,
      location: '社区库房',
      sceneTags: [],
      status: 'scrapped',
      createdAt: addDays(now, -60),
      publishedAt: addDays(now, -59),
      closeReason: '已过期，工作人员报废并按医疗垃圾处理',
    },
    {
      id: 'i12',
      ownerId: 'u_c',
      ownerName: '周敏',
      name: '一次性防护口罩（库存遗留）',
      category: 'mask',
      spec: '20只/盒',
      expiryDate: addDays(now, -3).slice(0, 10),
      storage: 'room_temp',
      sealed: true,
      quantity: 6,
      location: '5号楼3单元门口便民架',
      sceneTags: ['no_mask'],
      note: '已过期：大厅不可借用，等待工作人员报废。',
      status: 'published',
      createdAt: addDays(now, -200),
      publishedAt: addDays(now, -199),
    },
    // ---- 临期优先流转专题种子 ----
    {
      // 题目主场景：王秀兰共享的退热贴还有 10 天到期
      id: 'i13',
      ownerId: 'u_a',
      ownerName: '王秀兰',
      name: '儿童退热贴（临期）',
      category: 'fever_patch',
      spec: '4贴/盒',
      expiryDate: addDays(now, 10).slice(0, 10),
      storage: 'cool_dry',
      sealed: true,
      quantity: 2,
      location: '3号楼1单元一楼“邻里药箱”共享柜 A格',
      sceneTags: ['child_night_fever'],
      note: '还剩 10 天到期，夜间急用可先取一贴；请在到期日前使用，不要囤放。',
      status: 'published',
      createdAt: addDays(now, -30),
      publishedAt: addDays(now, -29),
    },
    {
      // 剩 3 天：1 盒已临期借出，借用人回访已逾期
      id: 'i14',
      ownerId: 'u_a',
      ownerName: '王秀兰',
      name: '碘伏棉签（独立包装）',
      category: 'iodophor',
      spec: '20支/盒',
      expiryDate: addDays(now, 3).slice(0, 10),
      storage: 'room_temp',
      sealed: true,
      quantity: 2,
      location: '3号楼1单元一楼“邻里药箱”共享柜 A格',
      sceneTags: ['elderly_wound', 'home_care'],
      note: '临期优先流转：已借出 1 盒，剩余 1 盒请工作人员优先推荐。',
      status: 'partially_lent',
      createdAt: addDays(now, -20),
      publishedAt: addDays(now, -19),
    },
    {
      // 剩 6 天：已临期借出，借用人已回访反馈“未使用、需要社区回收”，待工作人员闭环
      id: 'i15',
      ownerId: 'u_c',
      ownerName: '周敏',
      name: '无菌纱布块（临期）',
      category: 'gauze',
      spec: '5片/袋（独立灭菌）',
      expiryDate: addDays(now, 6).slice(0, 10),
      storage: 'room_temp',
      sealed: true,
      quantity: 1,
      location: '5号楼3单元门口便民架',
      sceneTags: ['elderly_wound', 'home_care'],
      note: '临期借出：借用人反馈未使用，约好自行送到居委会回收。',
      status: 'lent_out',
      createdAt: addDays(now, -15),
      publishedAt: addDays(now, -14),
    },
  ]

  const requests: BorrowRequest[] = [
    {
      id: 'r1',
      itemId: 'i4',
      applicantId: 'u_b',
      applicantName: '李建国',
      scene: 'elderly_wound',
      quantity: 1,
      method: 'volunteer_delivery',
      note: '老人在家不方便下楼，麻烦志愿者送一下。',
      status: 'completed',
      createdAt: addDays(now, -3),
      confirmedAt: addDays(now, -3),
      handingAt: addDays(now, -3),
      completedAt: addDays(now, -2),
      confirmerId: 'u_c',
      confirmerName: '周敏',
      volunteerId: 'u_v',
      volunteerName: '陈芳（志愿者）',
      handoverPhoto: 'handover-r1.jpg（演示凭证：志愿者送达后拍照）',
      handoverNote: '已交到本人手中，外包装完好。',
    },
    {
      id: 'r2',
      itemId: 'i6',
      applicantId: 'u_b',
      applicantName: '李建国',
      scene: 'child_night_fever',
      quantity: 2,
      method: 'self_pickup',
      status: 'completed',
      createdAt: addDays(now, -1),
      confirmedAt: addDays(now, -1),
      handingAt: addDays(now, -1),
      completedAt: addDays(now, -1),
      confirmerId: 'u_c',
      confirmerName: '周敏',
      handoverPhoto: 'handover-r2.jpg（演示凭证：共享柜取件自拍）',
      handoverNote: '从共享柜取走，封签完好。',
    },
    {
      id: 'r3',
      itemId: 'i1',
      applicantId: 'u_c',
      applicantName: '周敏',
      scene: 'child_night_fever',
      quantity: 1,
      method: 'self_pickup',
      note: '孩子夜里烧起来了，先物理降温观察。',
      status: 'confirmed',
      createdAt: addHours(now, -27),
      confirmedAt: addHours(now, -26),
      confirmerId: 'u_a',
      confirmerName: '王秀兰',
    },
    {
      id: 'r4',
      itemId: 'i6',
      applicantId: 'u_a',
      applicantName: '王秀兰',
      scene: 'home_care',
      quantity: 1,
      method: 'door_contactless',
      note: '家里体温计没电，排队等归还。',
      status: 'waiting',
      createdAt: addHours(now, -5),
    },
    {
      id: 'r5',
      itemId: 'i5',
      applicantId: 'u_c',
      applicantName: '周敏',
      scene: 'no_mask',
      quantity: 5,
      method: 'volunteer_delivery',
      note: '家里口罩用完了，明天要陪老人去医院。',
      status: 'handing',
      createdAt: addHours(now, -9),
      confirmedAt: addHours(now, -9),
      handingAt: addHours(now, -8),
      confirmerId: 'u_a',
      confirmerName: '王秀兰',
      volunteerId: 'u_v',
      volunteerName: '陈芳（志愿者）',
    },
    // ---- 临期优先流转专题种子 ----
    {
      // i14：临期碘伏已借出，约定回访时间已过，借用人尚未反馈（看板红色催收）
      id: 'r6',
      itemId: 'i14',
      applicantId: 'u_b',
      applicantName: '李建国',
      scene: 'elderly_wound',
      quantity: 1,
      method: 'self_pickup',
      note: '老人换药应急，今天就会用。',
      status: 'completed',
      createdAt: addHours(now, -44),
      confirmedAt: addHours(now, -43),
      handingAt: addHours(now, -42),
      completedAt: addHours(now, -40),
      confirmerId: 'u_a',
      confirmerName: '王秀兰',
      handoverPhoto: 'handover-r6.jpg（演示凭证：共享柜取件自拍）',
      handoverNote: '取件人已当面核对效期与封签。',
      nearExpiry: true,
      nearExpiryAck: {
        at: addHours(now, -40),
        actorId: 'u_b',
        actorName: '李建国',
        expiryConfirmed: true,
        sealConfirmed: true,
        appearanceConfirmed: true,
        withinDateUse: true,
        statement: '已核对到期日、封签与外观完好，承诺到期日前使用，到期后不再使用。',
      },
      followUpAt: addHours(now, -16),
    },
    {
      // i15：临期纱布已借出，借用人已回访反馈“未使用+需要社区回收”，待工作人员闭环
      id: 'r7',
      itemId: 'i15',
      applicantId: 'u_a',
      applicantName: '王秀兰',
      scene: 'home_care',
      quantity: 1,
      method: 'volunteer_delivery',
      note: '家里护理临时备用。',
      status: 'completed',
      createdAt: addHours(now, -32),
      confirmedAt: addHours(now, -31),
      handingAt: addHours(now, -31),
      completedAt: addHours(now, -30),
      confirmerId: 'u_c',
      confirmerName: '周敏',
      volunteerId: 'u_v',
      volunteerName: '陈芳（志愿者）',
      handoverPhoto: 'handover-r7.jpg（演示凭证：志愿者送达拍照）',
      handoverNote: '志愿者当面与借用人逐项核对效期和使用前检查。',
      nearExpiry: true,
      nearExpiryAck: {
        at: addHours(now, -30),
        actorId: 'u_a',
        actorName: '王秀兰',
        submittedBy: '陈芳（志愿者）代送当面核验后代提交',
        expiryConfirmed: true,
        sealConfirmed: true,
        appearanceConfirmed: true,
        withinDateUse: true,
        statement: '已核对到期日、封签与外观完好，承诺到期日前使用，到期后不再使用。',
      },
      followUpAt: addHours(now, -6),
      useFeedbackId: 'uf1',
    },
  ]

  const useFeedbacks: UseFeedback[] = [
    {
      id: 'uf1',
      requestId: 'r7',
      itemId: 'i15',
      borrowerId: 'u_a',
      borrowerName: '王秀兰',
      at: addHours(now, -5),
      used: 'unused',
      needRecycle: true,
      recycleMethod: 'self_dropoff',
      note: '后来没用上，包装完好未拆封，今晚散步时送到居委会回收箱。',
    },
  ]

  const feedbacks: Feedback[] = [
    {
      id: 'f1',
      itemId: 'i9',
      reporterId: 'u_b',
      reporterName: '李建国',
      type: 'package_damaged',
      detail: '盒子被压裂，里面两片创可贴的密封纸翘起，不敢使用。',
      createdAt: addHours(now, -6),
      status: 'open',
    },
    {
      id: 'f2',
      itemId: 'i3',
      requestId: undefined,
      reporterId: 'u_c',
      reporterName: '周敏',
      type: 'adverse_reaction',
      detail: '使用纱布包扎后伤口周围发红发痒，已取下并用清水冲洗。不确定是否与物品有关，先报备。',
      createdAt: addHours(now, -3),
      status: 'open',
    },
  ]

  return { items, requests, feedbacks, useFeedbacks }
}

/** 由物品/申请/反馈/回访快照重建全流程时间线（种子数据与数据修复共用） */
export function rebuildTimeline(items: Item[], requests: BorrowRequest[], feedbacks: Feedback[], useFeedbacks: UseFeedback[] = []): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const push = (e: TimelineEvent) => events.push(e)

  for (const it of items) {
    push({ id: `${it.id}_reg`, itemId: it.id, at: it.createdAt, actorId: it.ownerId, actorName: it.ownerName, kind: 'registered', detail: `登记「${it.name} ${it.spec}」×${it.quantity}` })
    if (it.review) {
      push({ id: `${it.id}_review`, itemId: it.id, at: it.review.at, actorId: it.review.reviewerId, actorName: it.review.reviewerName, kind: 'reviewed', detail: it.review.approved ? `审核通过${it.review.reason ? `：${it.review.reason}` : ''}` : `审核驳回：${it.review.reason ?? '不符合共享范围'}` })
    }
    if (it.publishedAt) {
      push({ id: `${it.id}_pub`, itemId: it.id, at: it.publishedAt, actorId: 'u_v', actorName: '志愿者', kind: 'published', detail: '发布到邻里药箱大厅' })
    }
    if (it.status === 'recalled') {
      push({ id: `${it.id}_recall`, itemId: it.id, at: it.publishedAt ?? it.createdAt, actorId: it.ownerId, actorName: it.ownerName, kind: 'recalled', detail: it.closeReason ?? '共享人撤回' })
    }
    if (it.status === 'scrapped') {
      push({ id: `${it.id}_scrap`, itemId: it.id, at: it.publishedAt ?? it.createdAt, actorId: 'u_s', actorName: '社区工作人员', kind: 'scrapped', detail: it.closeReason ?? '报废处理' })
    }
    if (it.status === 'quarantined') {
      push({ id: `${it.id}_quar`, itemId: it.id, at: it.publishedAt ?? it.createdAt, actorId: 'u_s', actorName: '社区工作人员', kind: 'quarantined', detail: it.closeReason ?? '风险隔离' })
    }
  }

  for (const r of requests) {
    const item = items.find((i) => i.id === r.itemId)
    const name = item ? `${item.name}` : r.itemId
    push({ id: `${r.id}_apply`, itemId: r.itemId, requestId: r.id, at: r.createdAt, actorId: r.applicantId, actorName: r.applicantName, kind: r.status === 'waiting' ? 'waitlisted' : 'applied', detail: `申请借用「${name}」×${r.quantity}` })
    if (r.confirmedAt) push({ id: `${r.id}_confirm`, itemId: r.itemId, requestId: r.id, at: r.confirmedAt, actorId: r.confirmerId ?? 'u_v', actorName: r.confirmerName ?? '志愿者', kind: 'confirmed', detail: `确认申请并锁定库存 ×${r.quantity}` })
    if (r.handingAt) push({ id: `${r.id}_handing`, itemId: r.itemId, requestId: r.id, at: r.handingAt, actorId: r.volunteerId ?? r.confirmerId ?? 'u_v', actorName: r.volunteerName ?? r.confirmerName ?? '志愿者', kind: 'handover_started', detail: r.method === 'volunteer_delivery' ? '志愿者出发代送' : r.method === 'door_contactless' ? '已放到约定门口位置' : '物品已备好，等待自取' })
    if (r.completedAt) push({ id: `${r.id}_done`, itemId: r.itemId, requestId: r.id, at: r.completedAt, actorId: r.applicantId, actorName: r.applicantName, kind: 'handover_confirmed', detail: `交接拍照确认：${r.handoverPhoto ?? '已上传照片'}${r.handoverNote ? `；${r.handoverNote}` : ''}` })
    if (r.nearExpiry && r.nearExpiryAck) {
      push({ id: `${r.id}_nack`, itemId: r.itemId, requestId: r.id, at: r.nearExpiryAck.at, actorId: r.nearExpiryAck.actorId, actorName: r.nearExpiryAck.actorName, kind: 'near_expiry_ack', detail: `借用人逐项确认效期与使用前检查：${r.nearExpiryAck.statement}${r.nearExpiryAck.submittedBy ? `（${r.nearExpiryAck.submittedBy}）` : ''}` })
    }
    if (r.status === 'closed_returned' && r.closedAt) {
      if (r.closeMode === 'community_recycle') {
        push({ id: `${r.id}_close`, itemId: r.itemId, requestId: r.id, at: r.closedAt, actorId: r.applicantId, actorName: r.applicantName, kind: 'recycled', detail: `社区回收剩余物品并闭环${r.closeNote ? `：${r.closeNote}` : ''}` })
      } else {
        push({ id: `${r.id}_close`, itemId: r.itemId, requestId: r.id, at: r.closedAt, actorId: r.applicantId, actorName: r.applicantName, kind: r.closeMode === 'restock_new' ? 'restocked' : 'returned', detail: r.closeMode === 'mutual_aid' ? '邻里赠予，无需归还' : r.closeMode === 'restock_new' ? '已补充同规格新品' : '已归还原物（未拆封）' })
      }
    }
    if (r.status === 'cancelled') {
      push({ id: `${r.id}_cancel`, itemId: r.itemId, requestId: r.id, at: r.closedAt ?? r.createdAt, actorId: r.applicantId, actorName: r.applicantName, kind: 'cancelled', detail: r.cancelReason ?? '申请取消，库存释放' })
    }
  }

  for (const f of feedbacks) {
    push({ id: `${f.id}_fb`, itemId: f.itemId, requestId: f.requestId, at: f.createdAt, actorId: f.reporterId, actorName: f.reporterName, kind: 'feedback', detail: `${f.type === 'package_damaged' ? '包装破损反馈' : f.type === 'adverse_reaction' ? '疑似不适反应反馈' : '其他反馈'}：${f.detail}` })
  }

  for (const uf of useFeedbacks) {
    const usedText = uf.used === 'used' ? '已全部使用，无剩余' : uf.used === 'partial' ? '用了一部分，还有剩余' : '完全未使用'
    push({
      id: `${uf.id}_ufb`,
      itemId: uf.itemId,
      requestId: uf.requestId,
      at: uf.at,
      actorId: uf.borrowerId,
      actorName: uf.borrowerName,
      kind: 'use_feedback',
      detail: `借出回访反馈：${usedText}；${uf.needRecycle ? '需要社区回收' : '无需社区回收'}${uf.note ? `；${uf.note}` : ''}`,
    })
    if (uf.resolvedAt) {
      push({ id: `${uf.id}_rec`, itemId: uf.itemId, requestId: uf.requestId, at: uf.resolvedAt, actorId: uf.resolverId ?? 'u_s', actorName: uf.resolverName ?? '社区工作人员', kind: 'recycled', detail: `社区回收完成：${uf.resolveNote ?? '剩余物品已收回处理'}` })
    }
  }

  return events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}

export function freshState(now: string) {
  const { items, requests, feedbacks, useFeedbacks } = buildSeed(now)
  return { items, requests, feedbacks, useFeedbacks, timeline: rebuildTimeline(items, requests, feedbacks, useFeedbacks) }
}
