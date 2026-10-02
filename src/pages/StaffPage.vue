<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMedkitStore } from '@/stores/medkit'
import { useFlash } from '@/composables/useFlash'
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  FEEDBACK_TYPE_LABELS,
  ITEM_STATUS_LABELS,
  NEAR_EXPIRY_FEEDBACK_HOURS,
  OWNER_RETRIEVE_REMIND_DAYS,
  SCENE_LABELS,
  SCENE_PRIORITY_SCOPE,
} from '@/rules'
import { fmtDateTime } from '@/utils/date'
import SafetyBanner from '@/components/SafetyBanner.vue'
import ExpiryBadge from '@/components/ExpiryBadge.vue'
import ItemStatusBadge from '@/components/ItemStatusBadge.vue'
import TimelineView from '@/components/TimelineView.vue'

const store = useMedkitStore()
const router = useRouter()
const { show } = useFlash()
const tab = ref<'risk' | 'near' | 'expiry' | 'review2' | 'trace'>('near')
const traceId = ref('')

const stats = computed(() => store.stats)
const secondReviewQueue = computed(() => store.items.filter((i) => i.status === 'pending_review' && i.category === 'other_consumable' && i.review?.approved))
const quarantined = computed(() => store.items.filter((i) => i.status === 'quarantined'))

/** 临期清单：≤30 天且仍有余量可流转；≤7 天的标红，需尽快决定推荐还是提醒取回/报废 */
const nearIdle = computed(() => store.nearExpiryIdle)
const tracking = computed(() => store.nearExpiryTracking)

const TRACKING_STATE_TEXT: Record<string, string> = {
  feedback_pending: '约定反馈时间未到',
  feedback_due: '已到约定反馈时间，未反馈',
  pending_recycle: '已反馈，待社区回收',
  feedback_done: '已反馈，无需回收',
  recycled: '社区已回收闭环',
}

function feedbackItem(itemId: string) {
  return store.items.find((i) => i.id === itemId)
}

function scrapFeedback(fid: string) {
  const note = window.prompt('核查与报废说明：', '确认包装/安全性不合格，报废并按医疗垃圾流程处理')
  if (note === null) return
  const r = store.resolveFeedback(fid, 'scrap', note || '核查报废')
  show(r.message, r.ok ? 'ok' : 'err')
}
function republishFeedback(fid: string) {
  const note = window.prompt('核查后重新发布的依据：', '现场核验包装封签完好，反馈问题排除，恢复共享')
  if (note === null) return
  const r = store.resolveFeedback(fid, 'republish', note || '核查无误')
  show(r.message, r.ok ? 'ok' : 'err')
}
function scrapItem(id: string, reason: string) {
  const r = store.scrapItem(id, reason)
  show(r.message, r.ok ? 'ok' : 'err')
}
function approve2(id: string) {
  const r = store.secondReview(id, true, '工作人员复核符合共享范围')
  show(r.message, r.ok ? 'ok' : 'err')
}
function reject2(id: string) {
  const reason = window.prompt('复核驳回原因：', '无法确认安全性，不予共享')
  if (reason === null) return
  const r = store.secondReview(id, false, reason || '复核不通过')
  show(r.message, r.ok ? 'ok' : 'err')
}

function remindOwner(id: string) {
  const r = store.remindNearExpiryOwner(id)
  show(r.message, r.ok ? 'ok' : 'err')
}
function remindBorrower(rid: string) {
  const r = store.remindBorrowerFeedback(rid)
  show(r.message, r.ok ? 'ok' : 'err')
}
function recycle(rid: string) {
  const note = window.prompt('回收方式与处理说明：', '志愿者上门回收剩余物品，统一按医疗/有害垃圾报废')
  if (note === null) return
  const r = store.recycleCompleted(rid, note || '社区回收并统一报废')
  show(r.message, r.ok ? 'ok' : 'err')
}
function confirmOwnerScrap(id: string) {
  const it = store.items.find((x) => x.id === id)
  const r = store.scrapItem(id, `确认共享人报废申请：${it?.scrapRequestReason ?? '临期无人借用'}，按医疗/有害垃圾处理`)
  show(r.message, r.ok ? 'ok' : 'err')
}
</script>

<template>
  <SafetyBanner compact />

  <div class="card">
    <h2 style="margin-bottom: 4px">社区工作人员工作台 · 风险与临期流转看板</h2>
    <div class="muted">
      工作人员的重点：守住安全底线——<strong>临期物品优先流转与到期回收</strong>、风险反馈处置、过期报废、双重复核与全链路追溯。社区只做<strong>物品流转和风险提醒</strong>，不做诊断建议。
    </div>
    <div class="stat-cards" style="margin-top: 12px; margin-bottom: 0">
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-danger)' }">{{ stats.nearExpiryIdle }}</div><div class="lbl">临期待流转（≤30天有余量）</div></div>
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-danger)' }">{{ stats.nearExpiryFeedbackDue }}</div><div class="lbl">借出后到期待反馈</div></div>
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-warn)' }">{{ stats.pendingRecycle }}</div><div class="lbl">待社区回收</div></div>
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-warn)' }">{{ stats.ownerScrapRequests }}</div><div class="lbl">共享人报废申请</div></div>
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-danger)' }">{{ stats.openFeedback }}</div><div class="lbl">待处置风险反馈</div></div>
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-danger)' }">{{ stats.quarantined }}</div><div class="lbl">风险隔离中物品</div></div>
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-warn)' }">{{ stats.expired }}</div><div class="lbl">已过期待报废</div></div>
      <div class="stat-card"><div class="num">{{ stats.scrapped }}</div><div class="lbl">累计报废</div></div>
    </div>
    <div class="tabs" style="margin-top: 14px; margin-bottom: 0">
      <button class="chip" :class="{ active: tab === 'near' }" @click="tab = 'near'">
        临期优先流转（{{ stats.nearExpiryIdle + stats.nearExpiryFeedbackDue + stats.pendingRecycle + stats.ownerScrapRequests }}）
      </button>
      <button class="chip" :class="{ active: tab === 'risk' }" @click="tab = 'risk'">风险反馈与隔离（{{ stats.openFeedback + stats.quarantined }}）</button>
      <button class="chip" :class="{ active: tab === 'expiry' }" @click="tab = 'expiry'">效期与报废</button>
      <button class="chip" :class="{ active: tab === 'review2' }" @click="tab = 'review2'">复核（{{ secondReviewQueue.length }}）</button>
      <button class="chip" :class="{ active: tab === 'trace' }" @click="tab = 'trace'">全链路追溯</button>
    </div>
  </div>

  <!-- 临期优先流转 -->
  <template v-if="tab === 'near'">
    <div class="card" style="border-left: 4px solid var(--c-warn)">
      <h3 style="margin-bottom: 6px">⏳ 临期清单：可优先推荐的物品（有效期 ≤30 天且仍有余量）</h3>
      <div class="muted">
        协调原则：优先推荐给<strong>短期内确定会使用</strong>的家庭，确保到期前能用完；不要推荐给“先领回去囤着”的居民。
        物品距到期不足 {{ OWNER_RETRIEVE_REMIND_DAYS }} 天仍无人借用时，提醒共享人<strong>取回继续自用或由社区报废</strong>，避免放到过期。
      </div>
    </div>

    <div v-if="!nearIdle.length" class="card empty">当前没有有效期 ≤30 天且有余量的物品。</div>

    <div v-for="x in nearIdle" :key="x.item.id" class="card" :style="{ borderLeft: x.days <= OWNER_RETRIEVE_REMIND_DAYS ? '4px solid var(--c-danger)' : '4px solid var(--c-warn)' }">
      <div style="display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap">
        <strong>{{ CATEGORY_ICONS[x.item.category] }} {{ x.item.name }} · {{ x.item.spec }}</strong>
        <ExpiryBadge :expiry-date="x.item.expiryDate" :now="store.nowIso" />
      </div>
      <div class="muted" style="margin: 6px 0">
        共享人：{{ x.item.ownerName }} · 可借 <strong>{{ x.available }}</strong>/总量 {{ x.item.quantity }}
        <span v-if="x.locked"> · 已借出/锁定 {{ x.locked }}</span>
        <span v-if="x.waiting"> · {{ x.waiting }} 人候补</span>
        · 地点：{{ x.item.location }}
      </div>

      <!-- 可使用场景 + 建议优先推荐范围 -->
      <div class="banner banner-info" style="margin-top: 8px">
        <strong>可使用场景与建议优先推荐范围</strong>
        <ul style="margin: 6px 0 0; padding-left: 18px">
          <li v-for="s in x.item.sceneTags" :key="s">
            {{ SCENE_LABELS[s] }} → <strong>优先推荐：</strong>{{ SCENE_PRIORITY_SCOPE[s] }}
          </li>
          <li v-if="!x.item.sceneTags.length" class="muted">登记时未标注场景，建议先联系共享人补充后再推荐。</li>
        </ul>
      </div>

      <div v-if="x.item.note" class="muted">共享人留言：{{ x.item.note }}</div>

      <div v-if="x.scrapRequested" class="banner banner-warn" style="margin-top: 8px">
        共享人已提交报废申请：{{ x.item.scrapRequestReason }}，请尽快确认报废。
      </div>
      <div v-else-if="x.reminded" class="banner banner-success" style="margin-top: 8px">
        ✅ 已提醒共享人 {{ x.item.ownerName }} 取回或申请报废；到期仍无借用的，按报废流程清理。
      </div>
      <div v-else-if="x.days <= OWNER_RETRIEVE_REMIND_DAYS" class="banner banner-danger" style="margin-top: 8px">
        仅剩 {{ x.days }} 天且仍有 {{ x.available }} 件余量：建议立即定向推荐；若仍无人借用，请提醒共享人取回或报废。
      </div>

      <div class="card-actions">
        <button class="btn btn-primary btn-sm" @click="show(`已按「${x.item.sceneTags.map((s) => SCENE_PRIORITY_SCOPE[s]).join('；') || '近期确有使用需求的家庭'}」定向推荐（演示消息）`)">
          📣 按建议范围定向推荐
        </button>
        <button v-if="!x.reminded && !x.scrapRequested" class="btn btn-warn btn-sm" @click="remindOwner(x.item.id)">
          📞 无人借用，提醒共享人{{ x.days <= OWNER_RETRIEVE_REMIND_DAYS ? '立即' : '' }}取回/报废
        </button>
        <button v-if="x.scrapRequested" class="btn btn-danger btn-sm" @click="confirmOwnerScrap(x.item.id)">确认共享人报废申请</button>
        <button class="btn btn-sm" @click="router.push(`/items/${x.item.id}`)">查看物品与时间线</button>
      </div>
    </div>

    <!-- 借出后的用后追踪 -->
    <h3 class="section-title">🔁 临期物品借出后的用后追踪（约定取走后 {{ NEAR_EXPIRY_FEEDBACK_HOURS }} 小时内反馈）</h3>
    <div class="card">
      <div class="muted">
        借用人交接时已留下<strong>效期与使用前检查确认记录</strong>；到约定时间系统提醒反馈三件事：<strong>是否使用、是否剩余、是否需要社区回收</strong>。
        反馈未使用/有剩余的，由社区回收统一报废，避免临期物品长期滞留在居民家中。
      </div>
    </div>

    <div v-if="!tracking.length" class="card empty">当前没有临期物品的借出追踪记录。</div>
    <div v-for="x in tracking" :key="x.req.id" class="card">
      <div style="display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap">
        <strong>{{ CATEGORY_ICONS[x.item.category] }} {{ x.item.name }} ×{{ x.req.quantity }}（借用人：{{ x.req.applicantName }}）</strong>
        <span class="badge" :class="{ 'badge-red': x.state === 'feedback_due', 'badge-amber': x.state === 'pending_recycle', 'badge-green': ['feedback_done', 'recycled'].includes(x.state), 'badge-blue': x.state === 'feedback_pending' }">
          {{ TRACKING_STATE_TEXT[x.state] }}
        </span>
      </div>
      <div class="muted" style="margin: 6px 0">
        物品效期：<ExpiryBadge :expiry-date="x.item.expiryDate" :now="store.nowIso" />
        · 交接时间：{{ x.req.completedAt ? fmtDateTime(x.req.completedAt) : '—' }}
        · 约定反馈截止：{{ x.req.feedbackDueAt ? fmtDateTime(x.req.feedbackDueAt) : '—' }}
      </div>

      <div v-if="x.req.expiryAckAt" class="banner banner-info" style="margin-top: 8px">
        ✅ 借用人确认留痕：{{ fmtDateTime(x.req.expiryAckAt) }} 已核对有效期至 {{ x.req.expiryAckDate }}，并逐项确认使用前检查要求（未开封封签完好、过期停用等）。
      </div>

      <div v-if="x.state === 'feedback_due'" class="banner banner-danger" style="margin-top: 8px">
        已超过约定反馈时间 {{ Math.round(x.dueInHours) }} 小时，借用人尚未反馈，临期物品可能滞留家中，请立即提醒。
      </div>

      <div v-if="x.req.useFeedback" class="banner" :class="x.req.useFeedback.needRecycle ? 'banner-warn' : 'banner-success'" style="margin-top: 8px">
        <strong>借用人用后反馈（{{ fmtDateTime(x.req.useFeedback.at) }}）</strong>
        是否使用：{{ x.req.useFeedback.used ? `是，已用 ${x.req.useFeedback.usedCount} 片/件` : '否，未使用' }}；
        剩余：{{ x.req.useFeedback.remaining }}；是否需要社区回收：{{ x.req.useFeedback.needRecycle ? '是' : '否' }}
        <span v-if="x.req.useFeedback.note"><br />备注：{{ x.req.useFeedback.note }}</span>
        <span v-if="x.req.useFeedback.recycleCompletedAt"><br />♻️ {{ x.req.useFeedback.recycleHandlerName }} 已于 {{ fmtDateTime(x.req.useFeedback.recycleCompletedAt) }} 完成回收：{{ x.req.useFeedback.recycleNote }}</span>
      </div>

      <div class="card-actions">
        <button v-if="x.state === 'feedback_due'" class="btn btn-danger btn-sm" @click="remindBorrower(x.req.id)">📞 提醒借用人立即反馈</button>
        <button v-if="x.state === 'pending_recycle'" class="btn btn-primary btn-sm" @click="recycle(x.req.id)">♻️ 登记社区回收并闭环</button>
        <button class="btn btn-sm" @click="router.push(`/items/${x.item.id}`)">查看物品全流程</button>
      </div>
    </div>
  </template>

  <!-- 风险反馈处置 -->
  <template v-else-if="tab === 'risk'">
    <div v-if="!store.openFeedbackList.length && !quarantined.length" class="card empty">没有待处置的风险反馈与隔离物品。</div>

    <div v-for="f in store.openFeedbackList" :key="f.id" class="card" style="border-left: 4px solid var(--c-danger)">
      <div style="display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap">
        <strong>{{ FEEDBACK_TYPE_LABELS[f.type] }}：{{ feedbackItem(f.itemId)?.name ?? f.itemId }}</strong>
        <span class="badge badge-red">待核查</span>
      </div>
      <p style="margin: 8px 0">{{ f.detail }}</p>
      <div class="muted">报告人：{{ f.reporterName }} · 时间：{{ f.createdAt.replace('T', ' ').slice(0, 16) }}</div>
      <div v-if="f.type === 'adverse_reaction'" class="banner banner-danger" style="margin-top: 8px">
        处置要求：① 电话回访身体情况并<strong>提醒就医</strong>；② 同批次物品全部隔离暂停借用；③ 保留包装凭证，必要时上报市场监管/卫健部门。
      </div>
      <div v-if="feedbackItem(f.itemId)" class="muted" style="margin-top: 6px">
        当前物品状态：<ItemStatusBadge :status="feedbackItem(f.itemId)!.status" />
      </div>
      <div class="card-actions">
        <button class="btn btn-danger btn-sm" @click="scrapFeedback(f.id)">核查后报废同批次</button>
        <button class="btn btn-primary btn-sm" @click="republishFeedback(f.id)">核验无问题，解除隔离重新发布</button>
        <button class="btn btn-sm" @click="router.push(`/items/${f.itemId}`)">打开物品全流程</button>
      </div>
    </div>

    <h3 v-if="quarantined.length" class="section-title">已隔离物品（暂停一切借用与交接）</h3>
    <div v-for="it in quarantined" :key="it.id" class="card">
      <div style="display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap">
        <strong>{{ CATEGORY_ICONS[it.category] }} {{ it.name }} · {{ it.spec }}</strong>
        <ItemStatusBadge :status="it.status" />
      </div>
      <div class="muted" style="margin: 6px 0">{{ it.closeReason }}</div>
      <div class="card-actions">
        <button class="btn btn-danger btn-sm" @click="scrapItem(it.id, '工作人员核查后报废：隔离物品复核不合格')">直接报废</button>
        <button class="btn btn-sm" @click="router.push(`/items/${it.id}`)">查看反馈与时间线</button>
      </div>
    </div>
  </template>

  <!-- 效期与报废 -->
  <template v-else-if="tab === 'expiry'">
    <h3 class="section-title">🚮 已过期仍挂在系统中（大厅已自动禁借，需报废清理）</h3>
    <div v-if="!store.expiredListed.length" class="card empty">没有过期物品。</div>
    <div v-for="it in store.expiredListed" :key="it.id" class="card">
      <div style="display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap">
        <strong>{{ CATEGORY_ICONS[it.category] }} {{ it.name }}</strong>
        <ExpiryBadge :expiry-date="it.expiryDate" :now="store.nowIso" />
      </div>
      <div class="muted" style="margin: 6px 0">状态：{{ ITEM_STATUS_LABELS[it.status] }} · 地点：{{ it.location }}</div>
      <div class="card-actions">
        <button class="btn btn-danger btn-sm" @click="scrapItem(it.id, '已过有效期，工作人员报废并按医疗/有害垃圾处理')">确认报废</button>
      </div>
    </div>

    <h3 class="section-title">⏳ 效期 60 天内（30 天内的临期物品请在“临期优先流转”页协调）</h3>
    <div v-if="!store.expiringSoon.length" class="card empty">近期没有临近效期的物品。</div>
    <div v-for="x in store.expiringSoon" :key="x.item.id" class="card">
      <div style="display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap">
        <strong>{{ CATEGORY_ICONS[x.item.category] }} {{ x.item.name }} · {{ x.item.spec }}</strong>
        <ExpiryBadge :expiry-date="x.item.expiryDate" :now="store.nowIso" />
      </div>
      <div class="muted" style="margin: 6px 0">
        共享人：{{ x.item.ownerName }} · 可借 {{ store.availableQty(x.item.id) }}/{{ x.item.quantity }}
      </div>
      <div class="card-actions">
        <button v-if="x.days <= 30 && store.availableQty(x.item.id) > 0" class="btn btn-primary btn-sm" @click="tab = 'near'">去临期优先流转处理</button>
        <button class="btn btn-sm" @click="show(`已提醒共享人 ${x.item.ownerName}：物品 ${x.days} 天后到期（演示消息）`)">📞 提醒共享人</button>
        <button class="btn btn-sm" @click="router.push(`/items/${x.item.id}`)">查看物品</button>
      </div>
    </div>
  </template>

  <!-- 双重复核 -->
  <template v-else-if="tab === 'review2'">
    <div v-if="!secondReviewQueue.length" class="card empty">没有需要工作人员复核的“其他非处方耗材”。</div>
    <div v-for="it in secondReviewQueue" :key="it.id" class="card">
      <strong>{{ it.name }} · {{ it.spec }}</strong>
      <div class="muted" style="margin: 6px 0">
        登记人：{{ it.ownerName }} · 志愿者 {{ it.review?.reviewerName }} 已初审：{{ it.review?.reason }}
      </div>
      <p class="muted">{{ CATEGORY_LABELS[it.category] }}：请确认确属未拆封非处方耗材、无药品成分、无需冷链且效期合规。</p>
      <div class="card-actions">
        <button class="btn btn-primary btn-sm" @click="approve2(it.id)">复核通过，发布</button>
        <button class="btn btn-danger btn-sm" @click="reject2(it.id)">复核驳回</button>
      </div>
    </div>
  </template>

  <!-- 全链路追溯 -->
  <template v-else>
    <div class="card">
      <label class="field" style="margin-bottom: 8px">
        <span>选择一件物品，查看从登记到报废的完整链路</span>
        <select v-model="traceId">
          <option value="" disabled>请选择物品…</option>
          <option v-for="it in [...store.items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))" :key="it.id" :value="it.id">
            {{ it.name }} · {{ it.spec }}（{{ it.ownerName }} / {{ ITEM_STATUS_LABELS[it.status] }}）
          </option>
        </select>
      </label>
      <div v-if="traceId">
        <TimelineView :events="store.itemTimeline(traceId)" />
      </div>
      <div v-else class="empty">选择物品后，这里展示登记 → 审核 → 发布 → 临期推荐/提醒 → 申请/候补 → 锁定 → 交接拍照与效期确认 → 用后反馈 → 社区回收/归还/报废的全部记录。</div>
    </div>
  </template>
</template>
