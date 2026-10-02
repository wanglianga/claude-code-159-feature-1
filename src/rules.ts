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
  community_recycle: '社区回收剩余（临期物品）',
} as const

/** 借出后使用回访选项 */
export const USE_FEEDBACK_USED_LABELS = {
  used: '已全部使用，无剩余',
  partial: '用了一部分，还有剩余',
  unused: '完全未使用',
} as const

export const RECYCLE_METHOD_LABELS = {
  volunteer_pickup: '请志愿者上门取回',
  self_dropoff: '我自行送到共享柜/居委会',
} as const

// ---- 业务规则参数 ----
/** 效期预警阈值（天） */
export const EXPIRY_WARN_DAYS = 60
export const EXPIRY_DANGER_DAYS = 30
/** 临期优先流转阈值（天）：≤10 天进入工作人员“临期优先流转”清单，优先推荐、专人盯办 */
export const EXPIRY_PRIORITY_DAYS = 10
/** 临期物品无人借用时，距到期多少天提醒共享人取回或报废 */
export const NEAR_EXPIRY_OWNER_NOTICE_DAYS = 5
/** 临期物品借出后，约定多少小时内回访借用人使用情况 */
export const NEAR_EXPIRY_FOLLOWUP_HOURS = 24
/** 借用人回访逾期未反馈多少小时，工作人员看板标红催收 */
export const NEAR_EXPIRY_FOLLOWUP_GRACE_HOURS = 12
/** 确认后取走/完成交接的时限（小时） */
export const PICKUP_WINDOW_HOURS = 24
/** 志愿者配送承诺时限（小时） */
export const DELIVERY_SLA_HOURS = 6

export type ExpiryLevel = 'expired' | 'priority' | 'danger' | 'warn' | 'ok'

export function expiryLevel(expiryDate: string, now: string | Date): ExpiryLevel {
  const d = daysUntil(expiryDate, now)
  if (d < 0) return 'expired'
  if (d <= EXPIRY_PRIORITY_DAYS) return 'priority'
  if (d <= EXPIRY_DANGER_DAYS) return 'danger'
  if (d <= EXPIRY_WARN_DAYS) return 'warn'
  return 'ok'
}

export const EXPIRY_LEVEL_TEXT: Record<ExpiryLevel, string> = {
  expired: '已过期',
  priority: '临期优先流转（≤10天）',
  danger: '临近效期（≤30天）',
  warn: '效期不足60天',
  ok: '效期正常',
}

/** 临期物品交接时，借用人必须逐项确认的使用前检查要求 */
export interface NearExpiryCheckItem {
  key: 'expiry' | 'seal' | 'appearance' | 'within_date'
  label: string
  detail: string
}
export const NEAR_EXPIRY_CHECKS: NearExpiryCheckItem[] = [
  { key: 'expiry', label: '核对效期', detail: '已逐字核对包装标注的生产日期与有效期（失效期），确认到期日为交接页红字显示的日期。' },
  { key: 'seal', label: '检查封签', detail: '整盒/整包未开封，独立小包装封签完好、无拆封与重新粘贴痕迹。' },
  { key: 'appearance', label: '检查外观', detail: '无受潮、变色、污渍、渗漏、挤压破损与异常气味；退热贴凝胶无干涸。' },
  { key: 'within_date', label: '到期前使用', detail: '承诺仅在到期日之前使用；到期当日及之后绝不使用，按社区指引交回或处理。' },
]

/** 临期物品可使用场景提示（按场景给安全话术，仍不做诊断） */
export const NEAR_EXPIRY_SCENE_HINTS: Record<Scene, string> = {
  child_night_fever: '夜间物理降温、测温应急：请当天或次日尽快使用；孩子持续高热/精神差请立即就医，不要因“东西快到期”而拖延就医。',
  elderly_wound: '老人浅表小伤口的临时清洁包扎：开封后立即使用，不留存到到期日后；伤口较深、出血不止或化脓请就医。',
  no_mask: '近期 1–2 次就医、陪诊、外出必需佩戴场景，不建议领取后长期存放。',
  home_care: '居家护理 48 小时内确定要用的耗材周转；不确定近期会用就不要申领，避免临期物品积压在个人家中。',
}

/** 工作人员“建议优先推荐范围” */
export const NEAR_EXPIRY_PRIORITY_HINTS: string[] = [
  '优先推荐给登记过对应急用场景（如孩子夜间发烧、老人换药、近日陪诊就医）的居民，而非泛群公告。',
  '优先推荐给本小区近 7 天提交过该物品/同品类候补申请的邻居，可在志愿者候补协调页直接确认递补。',
  '优先支持 24–48 小时内确定使用的家庭（夜间发热、次日就医陪诊、约定换药），不推荐给“先囤着备用”的居民。',
  '可优先安排志愿者代送或门口无接触交接，压缩交接耗时；自取需在 24 小时取件时限内完成。',
  '临近到期仍无人能在到期前用掉的，不再硬推，提醒共享人取回或由工作人员按报废流程处理，避免流入个人家中过期。',
]

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
    else if (d <= EXPIRY_PRIORITY_DAYS)
      warnings.push(`距有效期仅剩 ${d} 天（≤${EXPIRY_PRIORITY_DAYS} 天临期优先流转线）：新登记原则上不再发布；已在架物品进入此区间会自动列入工作人员临期清单，到期前优先推荐、盯办回访与回收。`)
    else if (d <= EXPIRY_DANGER_DAYS) warnings.push(`距有效期不足 ${EXPIRY_DANGER_DAYS} 天，审核时将重点确认，可能无法发布；在架期间进入 10 天内会自动转入临期优先流转。`)
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

/** 占用库存的申请状态：确认后即锁定，直到取消或闭环（归还/补充/赠予）才释放 */
export const STOCK_LOCKING_STATUSES: RequestStatus[] = ['confirmed', 'handing', 'completed']

export function isTerminalItemStatus(status: ItemStatus): boolean {
  return status === 'rejected' || status === 'recalled' || status === 'scrapped'
}

/** 是否进入临期优先流转区间（0 ≤ 剩余天数 ≤ EXPIRY_PRIORITY_DAYS） */
export function isNearExpiry(expiryDate: string, now: string | Date): boolean {
  const d = daysUntil(expiryDate, now)
  return d >= 0 && d <= EXPIRY_PRIORITY_DAYS
}
