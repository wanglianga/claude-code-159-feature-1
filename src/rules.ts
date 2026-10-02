import type {
  Category,
  FeedbackType,
  HandoverMethod,
  ItemDraft,
  ItemStatus,
  RequestStatus,
  Scene,
  StorageCondition,
} from '@/types'
import { daysUntil } from '@/utils/date'

// ---- 标签字典 ----
export const CATEGORY_LABELS: Record<Category, string> = {
  fever_patch: '退热贴',
  iodophor: '碘伏（棉片/棉签/消毒液）',
  gauze: '纱布',
  bandage: '创可贴',
  mask: '口罩',
  thermometer_battery: '体温计纽扣电池',
  other_consumable: '其他非处方耗材（需审核）',
}

export const CATEGORY_ICONS: Record<Category, string> = {
  fever_patch: '🧊',
  iodophor: '🧴',
  gauze: '🩹',
  bandage: '🩹',
  mask: '😷',
  thermometer_battery: '🔋',
  other_consumable: '📦',
}

export const SCENE_LABELS: Record<Scene, string> = {
  child_night_fever: '孩子夜间发烧（物理降温/测温）',
  elderly_wound: '老人小伤口处理（清洁/包扎）',
  no_mask: '临时缺口罩',
  home_care: '居家护理缺耗材',
}

export const SCENE_HINTS: Record<Scene, string> = {
  child_night_fever: '退热贴、体温计电池等辅助用品；持续高热请及时就医，共享箱不提供退烧药。',
  elderly_wound: '碘伏、纱布、创可贴仅用于浅表小伤口；伤口较深、出血不止或化脓请就医。',
  no_mask: '未拆封的一次性口罩，请注意包装完好与效期。',
  home_care: '护理耗材临时周转；不涉及注射、处方与任何拆封药品。',
}

/** 临期物品建议优先推荐范围（工作人员协调时使用，避免临期品长期闲置） */
export const SCENE_PRIORITY_SCOPE: Record<Scene, string> = {
  child_night_fever: '本社区/本楼栋当晚有发热儿童、急需物理降温的家庭，以及次日有测温需求的邻居',
  elderly_wound: '近期登记过老人换药/小伤口护理需求、行动不便的高龄家庭',
  no_mask: '次日需陪诊就医、家中口罩余量不足的家庭',
  home_care: '居家照护床位上耗材即将用尽、短期内确定会使用的邻居（不推荐给“先囤着”的家庭）',
}

export const STORAGE_LABELS: Record<StorageCondition, string> = {
  room_temp: '常温避光',
  cool_dry: '阴凉干燥',
  refrigerate: '冷藏（冷链）',
}

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  pending_review: '待志愿者审核',
  rejected: '审核未通过',
  published: '可借',
  partially_lent: '部分外借中',
  lent_out: '已借完/外借中',
  quarantined: '风险隔离待核',
  recalled: '共享人已撤回',
  scrapped: '已报废',
}

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  waiting: '候补中',
  confirmed: '已确认待交接',
  handing: '交接中',
  completed: '已取走，待归还/补充',
  closed_returned: '已闭环',
  cancelled: '已取消',
}

export const METHOD_LABELS: Record<HandoverMethod, string> = {
  self_pickup: '自取',
  volunteer_delivery: '志愿者代送',
  door_contactless: '邻居门口无接触交接',
}

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  package_damaged: '包装破损',
  adverse_reaction: '疑似使用后不适',
  other: '其他问题',
}

export const CLOSE_MODE_LABELS = {
  return_sealed: '归还原物（未拆封）',
  restock_new: '补充同规格新品',
  mutual_aid: '邻里赠予，无需归还',
  community_recycle: '社区回收剩余/到期物品',
} as const

// ---- 业务规则参数 ----
/** 效期预警阈值（天） */
export const EXPIRY_WARN_DAYS = 60
export const EXPIRY_DANGER_DAYS = 30
/** 临期优先流转阈值（天）：进入工作人员“临期清单”、借出时强制效期确认与用后追踪 */
export const NEAR_EXPIRY_PRIORITY_DAYS = 30
/** 临期且无人借用，距到期不足该天数时提醒共享人取回或报废 */
export const OWNER_RETRIEVE_REMIND_DAYS = 7
/** 临期物品借出后，约定多少小时内反馈“是否使用/是否剩余/是否需要回收” */
export const NEAR_EXPIRY_FEEDBACK_HOURS = 72
/** 确认后取走/完成交接的时限（小时） */
export const PICKUP_WINDOW_HOURS = 24
/** 志愿者配送承诺时限（小时） */
export const DELIVERY_SLA_HOURS = 6

export type ExpiryLevel = 'expired' | 'danger' | 'warn' | 'ok'

export function expiryLevel(expiryDate: string, now: string | Date): ExpiryLevel {
  const d = daysUntil(expiryDate, now)
  if (d < 0) return 'expired'
  if (d <= EXPIRY_DANGER_DAYS) return 'danger'
  if (d <= EXPIRY_WARN_DAYS) return 'warn'
  return 'ok'
}

export const EXPIRY_LEVEL_TEXT: Record<ExpiryLevel, string> = {
  expired: '已过期',
  danger: '临近效期（≤30天）',
  warn: '效期不足60天',
  ok: '效期正常',
}

/** 是否按“临期优先流转”处理（未过期且 ≤30 天到期） */
export function isNearExpiry(expiryDate: string, now: string | Date): boolean {
  const d = daysUntil(expiryDate, now)
  return d >= 0 && d <= NEAR_EXPIRY_PRIORITY_DAYS
}

/** 交接/使用前检查清单（按品类与存放条件给出，临期物品必须逐项确认） */
export function preUseChecks(input: { category: Category; storage: StorageCondition }): string[] {
  const checks = [
    '整盒/整包未开封，外包装封签完好、无压裂、无受潮水渍',
    '在标注有效期内使用；过期立即停用并按社区指引报废/回收，不得继续使用或转赠',
  ]
  if (input.storage === 'cool_dry') checks.push('按“阴凉干燥”条件保存，避免暴晒、高温与潮湿')
  if (input.category === 'fever_patch') checks.push('退热贴凝胶无干涸、无异味、无变色，衬膜完整')
  if (input.category === 'iodophor') checks.push('碘伏棉片/液体无渗漏、无浑浊变色、独立包装无胀气')
  if (input.category === 'gauze' || input.category === 'bandage') checks.push('灭菌包装无破损胀气，敷料无霉点、无污染')
  if (input.category === 'mask') checks.push('口罩无受潮、无明显异味，鼻夹与耳带完好')
  return checks
}

// ---- 禁入规则：处方药 / 拆封药品 / 冷链药品 不能进入共享 ----
/** 名称中出现这些词，判定为疑似药品（含处方药），一律禁入 */
const FORBIDDEN_NAME_KEYWORDS = [
  '处方',
  '胶囊',
  '颗粒',
  '口服液',
  '混悬',
  '注射液',
  '输液',
  '抗生素',
  '头孢',
  '阿莫西林',
  '布洛芬',
  '对乙酰氨基酚',
  '退烧药',
  '降压',
  '降糖',
  '药片',
]

export interface DraftValidation {
  errors: string[]
  warnings: string[]
}

export function validateDraft(draft: ItemDraft, now: string | Date): DraftValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (!draft.name.trim()) errors.push('请填写品名。')
  if (!draft.spec.trim()) errors.push('请填写规格（如 4片/盒、50只/盒）。')
  if (!draft.expiryDate) {
    errors.push('请选择有效期。')
  } else {
    const d = daysUntil(draft.expiryDate, now)
    if (d < 0) errors.push('该物品已过期（超过有效期），不能登记共享，应按有害/医疗垃圾处理。')
    else if (d <= EXPIRY_DANGER_DAYS) warnings.push(`距有效期不足 ${EXPIRY_DANGER_DAYS} 天，属临期物品：仅在能于到期前流转并使用完时发布，工作人员会列入临期清单优先协调。`)
    else if (d <= EXPIRY_WARN_DAYS) warnings.push(`距有效期不足 ${EXPIRY_WARN_DAYS} 天，借用页面会显著提示效期。`)
  }
  if (!draft.location.trim()) errors.push('请填写取用地点（如 3号楼1单元门口共享柜）。')
  if (!draft.quantity || draft.quantity <= 0) errors.push('可借数量需大于 0。')
  if (draft.quantity > 999) errors.push('数量异常，请确认后重新填写。')
  if (draft.sealed === false) {
    errors.push('拆封物品不能进入共享：请只登记整盒/整包未开封的物品。')
  }
  if (draft.storage === 'refrigerate') {
    errors.push('冷链/冷藏药品不能进入共享，脱离冷链存在安全风险。')
  }
  const hit = FORBIDDEN_NAME_KEYWORDS.find((k) => draft.name.includes(k))
  if (hit) {
    errors.push(`「${draft.name}」疑似药品/处方药（命中“${hit}”）。共享箱仅限未拆封非处方耗材，处方药与口服/注射药品一律不能进入。`)
  }
  if (draft.category === 'other_consumable') {
    warnings.push('“其他非处方耗材”需要志愿者与社区工作人员双重确认后才能发布。')
  }
  if (draft.sceneTags.length === 0) warnings.push('未选择适用场景，将较难被有需要的邻居检索到。')
  return { errors, warnings }
}

/** 占用库存的申请状态：确认后即锁定，直到取消或闭环（归还/补充/赠予/回收）才释放 */
export const STOCK_LOCKING_STATUSES: RequestStatus[] = ['confirmed', 'handing', 'completed']

export function isTerminalItemStatus(status: ItemStatus): boolean {
  return status === 'rejected' || status === 'recalled' || status === 'scrapped'
}
