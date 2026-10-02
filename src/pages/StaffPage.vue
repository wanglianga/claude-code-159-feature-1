<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMedkitStore } from '@/stores/medkit'
import { useFlash } from '@/composables/useFlash'
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  FEEDBACK_TYPE_LABELS,
  ITEM_STATUS_LABELS,
  NEAR_EXPIRY_PRIORITY_HINTS,
  NEAR_EXPIRY_SCENE_HINTS,
  RECYCLE_METHOD_LABELS,
  SCENE_LABELS,
  USE_FEEDBACK_USED_LABELS,
} from '@/rules'
import SafetyBanner from '@/components/SafetyBanner.vue'
import ExpiryBadge from '@/components/ExpiryBadge.vue'
import ItemStatusBadge from '@/components/ItemStatusBadge.vue'
import TimelineView from '@/components/TimelineView.vue'
import { fmtDateTime } from '@/utils/date'
import type { UseFeedbackUsed } from '@/types'

const store = useMedkitStore()
const router = useRouter()
const { show } = useFlash()
const tab = ref<'near' | 'risk' | 'expiry' | 'review2' | 'trace'>('near')
const traceId = ref('')

const stats = computed(() => store.stats)
const secondReviewQueue = computed(() => store.items.filter((i) => i.status === 'pending_review' && i.category === 'other_consumable' && i.review?.approved))
const quarantined = computed(() => store.items.filter((i) => i.status === 'quarantined'))

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

// ---- 临期优先流转 ----
function notifyOwner(itemId: string) {
  const r = store.remindNearExpiryOwner(itemId)
  show(r.message, r.ok ? 'ok' : 'err')
}
function remindFollow(requestId: string) {
  const r = store.remindFollowUp(requestId)
  show(r.message, r.ok ? 'ok' : 'err')
}
function completeRecycle(ufId: string) {
  const note = window.prompt('回收确认说明（剩余物品回收后不再流通）：', '已按约定收回剩余物品，统一按医疗/有害垃圾或社区回收流程处理')
  if (note === null) return
  const r = store.resolveRecycle(ufId, note || '社区回收完成')
  show(r.message, r.ok ? 'ok' : 'err')
}

/** 电话回访代登记表单 */
const proxyOpen = ref<Record<string, boolean>>({})
const proxyForm = reactive<Record<string, { used: UseFeedbackUsed; needRecycle: boolean; recycleMethod: 'volunteer_pickup' | 'self_dropoff'; note: string }>>({})
function proxyFormOf(id: string) {
  if (!proxyForm[id]) proxyForm[id] = { used: 'used', needRecycle: false, recycleMethod: 'volunteer_pickup', note: '' }
  return proxyForm[id]
}
function submitProxy(requestId: string) {
  const f = proxyFormOf(requestId)
  const r = store.submitUseFeedback(requestId, f.used, f.needRecycle, f.needRecycle ? f.recycleMethod : undefined, f.note || '电话回访已联系本人')
  show(r.message, r.ok ? 'ok' : 'err')
  if (r.ok) proxyOpen.value[requestId] = false
}
function fmtDue(iso: string) {
  return fmtDateTime(iso)
}
</script>

<template>
  <SafetyBanner compact />

  <div class="card">
    <h2 style="margin-bottom: 4px">社区工作人员工作台 · 风险看板</h2>
    <div class="muted">
      工作人员的重点：守住安全底线——<strong>临期物品优先流转与借出回访</strong>、风险反馈处置、过期报废、双重复核与全链路追溯。社区只做<strong>物品流转和风险提醒</strong>，不做诊断建议。
    </div>
    <div class="stat-cards" style="margin-top: 12px; margin-bottom: 0">
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-danger)' }">{{ stats.nearExpiry }}</div><div class="lbl">≤10天临期在架</div></div>
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-warn)' }">{{ stats.nearExpiryNoBorrower }}</div><div class="lbl">临期无人借用</div></div>
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-danger)' }">{{ stats.followUpDue }}</div><div class="lbl">临期待回访{{ stats.followUpOverdue ? `（${stats.followUpOverdue} 逾期）` : '' }}</div></div>
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-warn)' }">{{ stats.recyclePending }}</div><div class="lbl">待社区回收</div></div>
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-danger)' }">{{ stats.openFeedback }}</div><div class="lbl">待处置风险反馈</div></div>
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-danger)' }">{{ stats.quarantined }}</div><div class="lbl">风险隔离中</div></div>
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-warn)' }">{{ stats.expired }}</div><div class="lbl">已过期待报废</div></div>
      <div class="stat-card"><div class="num">{{ stats.scrapped }}</div><div class="lbl">累计报废</div></div>
    </div>
    <div class="tabs" style="margin-top: 14px; margin-bottom: 0">
      <button class="chip" :class="{ active: tab === 'near' }" @click="tab = 'near'">
        🔖 临期优先流转（{{ stats.nearExpiry + stats.followUpDue + stats.recyclePending }}）
      </button>
      <button class="chip" :class="{ active: tab === 'risk' }" @click="tab = 'risk'">风险反馈与隔离（{{ stats.openFeedback + stats.quarantined }}）</button>
      <button class="chip" :class="{ active: tab === 'expiry' }" @click="tab = 'expiry'">效期与报废</button>
      <button class="chip" :class="{ active: tab === 'review2' }" @click="tab = 'review2'">复核（{{ secondReviewQueue.length }}）</button>
      <button class="chip" :class="{ active: tab === 'trace' }" @click="tab = 'trace'">全链路追溯</button>
    </div>
  </div>

  <!-- 临期优先流转 -->
  <template v-if="tab === 'near'">
    <div class="card" style="border-left: 4px solid var(--c-danger)">
      <h3 style="margin-bottom: 4px">🔖 临期优先流转清单（≤10 天到期）</h3>
      <div class="muted">
        目标：让临期物品在到期日前流转到<strong>近期确定要用的人</strong>手里；有人借用就盯紧交接确认与到期回访，无人借用就提醒共享人取回或报废——
        <strong>不让临期物品过期滞留在共享柜或居民家中</strong>。
      </div>
    </div>

    <div v-if="!store.nearExpiryList.length" class="card empty">当前没有进入 10 天临期线的物品。</div>

    <div v-for="x in store.nearExpiryList" :key="x.item.id" class="card" :style="{ borderLeft: x.days <= 5 ? '4px solid var(--c-danger)' : '4px solid var(--c-warn)' }">
      <div style="display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap">
        <strong>{{ CATEGORY_ICONS[x.item.category] }} {{ x.item.name }} · {{ x.item.spec }}</strong>
        <ExpiryBadge :expiry-date="x.item.expiryDate" :now="store.nowIso" />
      </div>
      <div class="muted" style="margin: 6px 0">
        共享人：{{ x.item.ownerName }} · 可借 <strong>{{ x.available }}</strong>/{{ x.item.quantity }} · 已借出盯办 {{ x.lentRequests.length }} 笔 · 候补 {{ x.waitingCount }} 人 · 地点：{{ x.item.location }}
      </div>

      <!-- 可使用场景 -->
      <div class="sub-block">
        <div class="sub-title">✅ 可使用场景（临期优先推荐话术）</div>
        <div v-for="s in x.item.sceneTags" :key="s" class="scene-line">
          <span class="badge badge-blue">{{ SCENE_LABELS[s] }}</span>
          <span class="muted">{{ NEAR_EXPIRY_SCENE_HINTS[s] }}</span>
        </div>
        <div v-if="!x.item.sceneTags.length" class="muted">该物品未标注场景，按品类一般用途尽快流转。</div>
      </div>

      <!-- 建议优先推荐范围 -->
      <div class="sub-block">
        <div class="sub-title">🎯 建议优先推荐范围</div>
        <ul class="hint-list">
          <li v-for="(h, i) in NEAR_EXPIRY_PRIORITY_HINTS" :key="i">{{ h }}</li>
        </ul>
        <div v-if="x.candidates.length" class="cand-box">
          <strong>系统匹配到可优先推荐的邻居：</strong>
          <div v-for="(c, i) in x.candidates" :key="i" class="cand-line">
            👤 {{ c.req.applicantName }}（{{ SCENE_LABELS[c.req.scene] }}，
            <template v-if="c.req.itemId === x.item.id">本物品候补中</template>
            <template v-else>在「{{ c.item.name }}」候补中且该物品暂无余量</template>
            ）
          </div>
        </div>
      </div>

      <!-- 借出盯办状态 -->
      <div v-if="x.lentRequests.length" class="sub-block">
        <div class="sub-title">📤 已借出盯办（避免滞留个人家中）</div>
        <div v-for="r in x.lentRequests" :key="r.id" class="lent-line">
          <span>借用人 {{ r.applicantName }} ×{{ r.quantity }}</span>
          <span v-if="r.nearExpiryAck" class="badge badge-green">已完成临期确认</span>
          <span v-else-if="['confirmed', 'handing'].includes(r.status)" class="badge badge-amber">交接中，待临期确认</span>
          <span v-if="r.status === 'completed' && r.followUpAt" class="muted">
            · 约定回访 {{ fmtDue(r.followUpAt) }}
            <span v-if="r.useFeedbackId" class="badge badge-green">已回访</span>
            <span v-else class="badge badge-red">待回访</span>
          </span>
        </div>
      </div>

      <div class="card-actions">
        <button v-if="x.noBorrower" class="btn btn-sm btn-warn" @click="notifyOwner(x.item.id)">
          📞 {{ x.ownerNoticeDue ? `仅剩 ${x.days} 天，提醒共享人取回或报废` : '提醒共享人：无人借用请尽快取回/报废' }}
        </button>
        <button v-if="x.available > 0" class="btn btn-sm btn-primary" @click="router.push(`/items/${x.item.id}`)">打开物品，协助登记/确认申请</button>
        <button class="btn btn-sm" @click="router.push(`/items/${x.item.id}`)">查看全流程时间线</button>
      </div>
    </div>

    <!-- 借出回访队列 -->
    <h3 class="section-title">🔔 临期借出回访（约定时间未反馈：是否使用 / 是否剩余 / 是否回收）</h3>
    <div v-if="!store.followUpQueue.length" class="card empty">没有待回访的临期借用。</div>
    <div v-for="row in store.followUpQueue" :key="row.req.id" class="card" :style="{ borderLeft: row.overdue ? '4px solid var(--c-danger)' : '4px solid var(--c-warn)' }">
      <div style="display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap">
        <strong>{{ row.item?.name ?? row.req.itemId }} ×{{ row.req.quantity }}</strong>
        <span v-if="row.overdue" class="badge badge-red">回访已逾期 {{ Math.round(-row.hoursToDue) }} 小时（{{ row.item?.expiryDate }} 到期）</span>
        <span v-else class="badge badge-amber">{{ Math.round(row.hoursToDue) }} 小时后到约定回访时间</span>
      </div>
      <div class="muted" style="margin: 6px 0">
        借用人：{{ row.req.applicantName }} · 场景：{{ SCENE_LABELS[row.req.scene] }} · 交接确认：
        {{ row.req.nearExpiryAck ? `已完成（${fmtDateTime(row.req.nearExpiryAck.at)}）` : '—' }}
      </div>
      <div class="card-actions">
        <button class="btn btn-sm btn-warn" @click="remindFollow(row.req.id)">📞 催办借用人反馈</button>
        <button class="btn btn-sm btn-primary" @click="proxyOpen[row.req.id] = !proxyOpen[row.req.id]">
          {{ proxyOpen[row.req.id] ? '收起电话回访登记' : '电话回访，代为登记' }}
        </button>
      </div>
      <div v-if="proxyOpen[row.req.id]" style="margin-top: 10px">
        <label class="field">
          <span>本人反馈：使用情况</span>
          <select v-model="proxyFormOf(row.req.id).used">
            <option value="used">{{ USE_FEEDBACK_USED_LABELS.used }}</option>
            <option value="partial">{{ USE_FEEDBACK_USED_LABELS.partial }}</option>
            <option value="unused">{{ USE_FEEDBACK_USED_LABELS.unused }}</option>
          </select>
        </label>
        <label class="check-row">
          <input type="checkbox" v-model="proxyFormOf(row.req.id).needRecycle" />
          <span>剩余物品需要社区回收</span>
        </label>
        <label v-if="proxyFormOf(row.req.id).needRecycle" class="field">
          <span>回收方式</span>
          <select v-model="proxyFormOf(row.req.id).recycleMethod">
            <option value="volunteer_pickup">{{ RECYCLE_METHOD_LABELS.volunteer_pickup }}</option>
            <option value="self_dropoff">{{ RECYCLE_METHOD_LABELS.self_dropoff }}</option>
          </select>
        </label>
        <label class="field">
          <span>回访备注</span>
          <textarea v-model="proxyFormOf(row.req.id).note" placeholder="电话联系情况、对方何时在家、剩余数量等"></textarea>
        </label>
        <button class="btn btn-primary btn-sm" @click="submitProxy(row.req.id)">提交代登记回访</button>
      </div>
    </div>

    <!-- 社区回收队列 -->
    <h3 class="section-title">♻️ 待社区回收（借用人反馈有剩余，约好回收方式）</h3>
    <div v-if="!store.recycleQueue.length" class="card empty">没有待回收的临期物品。</div>
    <div v-for="row in store.recycleQueue" :key="row.uf.id" class="card" style="border-left: 4px solid var(--c-primary)">
      <div style="display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap">
        <strong>{{ row.item?.name ?? row.uf.itemId }} ×{{ row.req?.quantity ?? 1 }}</strong>
        <span class="badge badge-amber">
          {{ row.uf.used === 'partial' ? '部分使用有剩余' : '完全未使用' }} ·
          {{ row.uf.recycleMethod === 'volunteer_pickup' ? '预约上门取' : '借用人自行送到共享柜/居委会' }}
        </span>
      </div>
      <div class="muted" style="margin: 6px 0">
        借用人：{{ row.uf.borrowerName }} · 反馈时间：{{ fmtDateTime(row.uf.at) }}
        <span v-if="row.item"> · 物品 {{ row.item.expiryDate }} 到期</span>
      </div>
      <div v-if="row.uf.note" class="muted">说明：{{ row.uf.note }}</div>
      <div class="card-actions">
        <button class="btn btn-primary btn-sm" @click="completeRecycle(row.uf.id)">✅ 已收回，确认回收闭环</button>
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

    <h3 class="section-title">⏳ 效期 60 天内（10 天内请到「临期优先流转」专区盯办）</h3>
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
        <button v-if="x.days <= 10" class="btn btn-sm btn-primary" @click="tab = 'near'">去临期优先流转专区处理</button>
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
        <span>选择一件物品，查看从登记到报废的完整链路（含临期确认、借出回访与社区回收记录）</span>
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
      <div v-else class="empty">选择物品后，这里展示登记 → 审核 → 发布 → 申请/候补 → 锁定 → 临期交接确认 → 回访/回收 → 归还/报废的全部记录。</div>
    </div>
  </template>
</template>

<style scoped>
.sub-block {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--c-gray-200);
}
.sub-title {
  font-weight: 700;
  font-size: 0.9rem;
  margin-bottom: 6px;
}
.scene-line {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 4px 0;
  flex-wrap: wrap;
}
.hint-list {
  margin: 0;
  padding-left: 18px;
  font-size: 0.88rem;
  color: var(--c-gray-700);
}
.hint-list li {
  margin: 3px 0;
}
.cand-box {
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--c-primary-soft);
  border-radius: 8px;
  font-size: 0.88rem;
}
.cand-line {
  margin: 3px 0;
}
.lent-line {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 0.88rem;
  margin: 4px 0;
}
</style>
