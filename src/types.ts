// 社区药箱共享 —— 领域类型定义

/** 可共享品类（白名单：仅限未拆封常备非处方耗材） */
export type Category =
  | 'fever_patch' // 退热贴
  | 'iodophor' // 碘伏（棉片/棉签/消毒液）
  | 'gauze' // 纱布
  | 'bandage' // 创可贴
  | 'mask' // 口罩
  | 'thermometer_battery' // 体温计纽扣电池
  | 'other_consumable' // 其他经审核的非处方耗材

/** 症状/使用场景 */
export type Scene =
  | 'child_night_fever' // 孩子夜间发烧
  | 'elderly_wound' // 老人小伤口处理
  | 'no_mask' // 临时缺口罩
  | 'home_care' // 居家护理缺耗材

/** 存放条件 */
export type StorageCondition = 'room_temp' | 'cool_dry' | 'refrigerate'

/** 物品全流程状态 */
export type ItemStatus =
  | 'pending_review' // 待审核
  | 'rejected' // 审核驳回（不进入共享）
  | 'published' // 已发布，可借
  | 'partially_lent' // 部分借出，仍有可借余量
  | 'lent_out' // 可借余量为 0（外借中，待归还/补充）
  | 'quarantined' // 风险隔离（包装破损/疑似不适反应待核）
  | 'recalled' // 共享人撤回
  | 'scrapped' // 报废（过期/破损/核查不合格）

/** 交接方式 */
export type HandoverMethod = 'self_pickup' | 'volunteer_delivery' | 'door_contactless'

/** 借用申请状态 */
export type RequestStatus =
  | 'waiting' // 排队候补（暂无余量，等待他人取消或归还）
  | 'confirmed' // 已确认并锁定数量，等待交接
  | 'handing' // 交接中（自取待取 / 配送中 / 已放门口）
  | 'completed' // 已完成（拍照确认）
  | 'closed_returned' // 已闭环：归还/补充完成
  | 'cancelled' // 已取消（超时未取 / 共享人撤回 / 主动取消 / 配送失败）

/** 反馈类型 */
export type FeedbackType = 'package_damaged' | 'adverse_reaction' | 'other'
export type FeedbackStatus = 'open' | 'resolved_scrap' | 'resolved_republish'

/** 物品登记内容 */
export interface ItemDraft {
  name: string
  category: Category
  spec: string // 规格
  expiryDate: string // YYYY-MM-DD
  storage: StorageCondition
  sealed: boolean // 是否整盒未开封
  quantity: number // 可借数量
  location: string // 取用地点
  sceneTags: Scene[] // 适用场景
  note?: string
}

export interface Item extends ItemDraft {
  id: string
  ownerId: string
  ownerName: string
  status: ItemStatus
  createdAt: string
  publishedAt?: string
  /** 审核记录 */
  review?: { reviewerId: string; reviewerName: string; at: string; approved: boolean; reason?: string }
  /** 最近一次报废/撤回原因 */
  closeReason?: string
}

export interface BorrowRequest {
  id: string
  itemId: string
  applicantId: string
  applicantName: string
  scene: Scene
  quantity: number
  method: HandoverMethod
  note?: string
  status: RequestStatus
  createdAt: string
  confirmedAt?: string
  handingAt?: string
  completedAt?: string
  closedAt?: string
  /** 确认人（共享人/志愿者） */
  confirmerId?: string
  confirmerName?: string
  /** 交接拍照凭证（演示环境用文件名/dataURL 占位） */
  handoverPhoto?: string
  handoverNote?: string
  /** 志愿者配送相关 */
  volunteerId?: string
  volunteerName?: string
  delayReason?: string
  cancelReason?: string
  /** 归还/补充方式 */
  closeMode?: 'return_sealed' | 'restock_new' | 'mutual_aid' | 'community_recycle'
  closeNote?: string
  /** 完成交接时是否处于临期优先流转期（≤10 天到期） */
  nearExpiry?: boolean
  /** 借用人对临期物品效期与使用前检查的逐项确认记录 */
  nearExpiryAck?: NearExpiryAck
  /** 约定的借出后使用回访时间（临期物品交接完成时间 + 回访时限） */
  followUpAt?: string
  /** 借用人提交的使用回访反馈 ID */
  useFeedbackId?: string
}

/** 临期物品交接时借用人的逐项确认（明确效期 + 使用前检查要求，留痕可追溯） */
export interface NearExpiryAck {
  at: string
  /** 确认人（借用人；志愿者代送当面核验后代提交时仍记录借用人） */
  actorId: string
  actorName: string
  /** 提交人（志愿者代送时可能与借用人不同） */
  submittedBy?: string
  /** 已核对包装标注的具体到期日 */
  expiryConfirmed: boolean
  /** 已检查整盒/整包及独立小包装封签完好、无拆封痕迹 */
  sealConfirmed: boolean
  /** 已检查无受潮、变色、污渍、渗漏、破损、异味 */
  appearanceConfirmed: boolean
  /** 承诺到期日前使用，到期当日及之后不再使用 */
  withinDateUse: boolean
  /** 确认文案快照 */
  statement: string
}

/** 借出后使用回访：是否使用 */
export type UseFeedbackUsed = 'used' | 'partial' | 'unused'

/** 临期物品借出后，借用人按约定时间反馈的使用情况 */
export interface UseFeedback {
  id: string
  requestId: string
  itemId: string
  borrowerId: string
  borrowerName: string
  at: string
  /** 是否使用：已全部使用 / 用了一部分 / 完全未使用 */
  used: UseFeedbackUsed
  /** 是否需要社区回收剩余物品 */
  needRecycle: boolean
  /** 回收方式：志愿者上门取 / 借用人自行送到共享柜 */
  recycleMethod?: 'volunteer_pickup' | 'self_dropoff'
  note?: string
  /** 社区回收完成闭环信息 */
  resolvedAt?: string
  resolverId?: string
  resolverName?: string
  resolveNote?: string
}

export interface Feedback {
  id: string
  itemId: string
  requestId?: string
  reporterId: string
  reporterName: string
  type: FeedbackType
  detail: string
  createdAt: string
  status: FeedbackStatus
  handledAt?: string
  handlerId?: string
  handlerName?: string
  handleNote?: string
}

/** 与物品串联的全流程时间线事件 */
export interface DemoUser {
  id: string
  name: string
  role: 'resident' | 'volunteer' | 'staff'
  address: string
}

export interface TimelineEvent {
  id: string
  itemId: string
  requestId?: string
  at: string
  actorId: string
  actorName: string
  kind:
    | 'registered'
    | 'reviewed'
    | 'published'
    | 'applied'
    | 'waitlisted'
    | 'confirmed'
    | 'handover_started'
    | 'handover_confirmed'
    | 'returned'
    | 'restocked'
    | 'recalled'
    | 'scrapped'
    | 'quarantined'
    | 'feedback'
    | 'overdue_flagged'
    | 'delay_flagged'
    | 'cancelled'
    | 'near_expiry_notified' // 无人借用：提醒共享人取回或报废（兼回访催收）
    | 'near_expiry_ack' // 交接：借用人确认效期与使用前检查
    | 'use_feedback' // 借出后回访反馈（是否使用/剩余/回收）
    | 'recycled' // 社区回收剩余物品并闭环
  detail?: string
}

export interface DemoUser {
  id: string
  name: string
  role: 'resident' | 'volunteer' | 'staff'
  address: string
}
