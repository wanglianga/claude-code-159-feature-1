<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMedkitStore } from '@/stores/medkit'
import { useFlash } from '@/composables/useFlash'
import { CATEGORY_ICONS, CATEGORY_LABELS, FEEDBACK_TYPE_LABELS, ITEM_STATUS_LABELS } from '@/rules'
import SafetyBanner from '@/components/SafetyBanner.vue'
import ExpiryBadge from '@/components/ExpiryBadge.vue'
import ItemStatusBadge from '@/components/ItemStatusBadge.vue'
import TimelineView from '@/components/TimelineView.vue'

const store = useMedkitStore()
const router = useRouter()
const { show } = useFlash()
const tab = ref<'risk' | 'expiry' | 'review2' | 'trace'>('risk')
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
</script>

<template>
  <SafetyBanner compact />

  <div class="card">
    <h2 style="margin-bottom: 4px">社区工作人员工作台 · 风险看板</h2>
    <div class="muted">
      工作人员的重点：守住安全底线——风险反馈处置、过期报废、双重复核与全链路追溯。社区只做<strong>物品流转和风险提醒</strong>，不做诊断建议。
    </div>
    <div class="stat-cards" style="margin-top: 12px; margin-bottom: 0">
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-danger)' }">{{ stats.openFeedback }}</div><div class="lbl">待处置风险反馈</div></div>
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-danger)' }">{{ stats.quarantined }}</div><div class="lbl">风险隔离中物品</div></div>
      <div class="stat-card"><div class="num" :style="{ color: 'var(--c-warn)' }">{{ stats.expired }}</div><div class="lbl">已过期待报废</div></div>
      <div class="stat-card"><div class="num">{{ stats.reviewCount }}</div><div class="lbl">志愿者待审</div></div>
      <div class="stat-card"><div class="num">{{ stats.inFlight }}</div><div class="lbl">交接中</div></div>
      <div class="stat-card"><div class="num">{{ stats.waiting }}</div><div class="lbl">候补中</div></div>
      <div class="stat-card"><div class="num">{{ stats.activeCount }}</div><div class="lbl">在架物品</div></div>
      <div class="stat-card"><div class="num">{{ stats.scrapped }}</div><div class="lbl">累计报废</div></div>
    </div>
    <div class="tabs" style="margin-top: 14px; margin-bottom: 0">
      <button class="chip" :class="{ active: tab === 'risk' }" @click="tab = 'risk'">风险反馈与隔离（{{ stats.openFeedback + stats.quarantined }}）</button>
      <button class="chip" :class="{ active: tab === 'expiry' }" @click="tab = 'expiry'">效期与报废</button>
      <button class="chip" :class="{ active: tab === 'review2' }" @click="tab = 'review2'">复核（{{ secondReviewQueue.length }}）</button>
      <button class="chip" :class="{ active: tab === 'trace' }" @click="tab = 'trace'">全链路追溯</button>
    </div>
  </div>

  <!-- 风险反馈处置 -->
  <template v-if="tab === 'risk'">
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

    <h3 class="section-title">⏳ 效期 60 天内（提醒共享人优先流转或到期前报废）</h3>
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
      <div v-else class="empty">选择物品后，这里展示登记 → 审核 → 发布 → 申请/候补 → 锁定 → 交接拍照 → 归还/补充 → 反馈/隔离/报废的全部记录。</div>
    </div>
  </template>
</template>
