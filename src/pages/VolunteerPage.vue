<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMedkitStore } from '@/stores/medkit'
import { useFlash } from '@/composables/useFlash'
import {
  CATEGORY_LABELS,
  DELIVERY_SLA_HOURS,
  isNearExpiry,
  METHOD_LABELS,
  PICKUP_WINDOW_HOURS,
  SCENE_LABELS,
  STORAGE_LABELS,
  preUseChecks,
  validateDraft,
} from '@/rules'
import SafetyBanner from '@/components/SafetyBanner.vue'
import ExpiryBadge from '@/components/ExpiryBadge.vue'
import PhotoCapture from '@/components/PhotoCapture.vue'

const store = useMedkitStore()
const router = useRouter()
const { show } = useFlash()
const tab = ref<'review' | 'delivery' | 'exceptions' | 'waiting'>('review')
const photos = ref<Record<string, string>>({})
/** 临期物品配送完成前，志愿者确认已当面向借用人交代效期与使用前检查 */
const deliveryAck = reactive<Record<string, boolean>>({})

const reviewQueue = computed(() => store.reviewQueue)
const overdue = computed(() => store.overduePickups)
const delayed = computed(() => store.delayedDeliveries)
const waitingReqs = computed(() =>
  store.requests
    .filter((r) => r.status === 'waiting')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
)

/** 当前志愿者需要配送的任务（工作人员也可在本页兜底处理） */
const deliveryTasks = computed(() =>
  store.requests.filter((r) => r.status === 'handing' && r.method === 'volunteer_delivery'),
)

function itemOf(id: string) {
  return store.items.find((i) => i.id === id)!
}

function approve(id: string) {
  const r = store.reviewItem(id, true, '核验未拆封、效期与存放条件，符合共享范围')
  show(r.message, r.ok ? 'ok' : 'err')
}
function reject(id: string) {
  const reason = window.prompt('驳回原因（会展示给登记居民）：', '疑似药品/拆封/冷链/过期或包装不符，不能进入共享')
  if (reason === null) return
  const r = store.reviewItem(id, false, reason)
  show(r.message, r.ok ? 'ok' : 'err')
}
function completeDelivery(r: (typeof deliveryTasks.value)[number]) {
  const it = itemOf(r.itemId)
  const near = isNearExpiry(it.expiryDate, store.nowIso)
  if (near && !deliveryAck[r.id]) {
    show('临期物品：请确认已当面向借用人交代效期与使用前检查要求，并由借用人知悉后再完成送达。', 'err')
    return
  }
  const res = store.completeHandover(
    r.id,
    photos.value[r.id] ?? '',
    '志愿者送达并拍照确认',
    near ? { expiryDate: it.expiryDate, preUseCheckAck: true } : undefined,
  )
  show(res.message, res.ok ? 'ok' : 'err')
}
function delay(id: string) {
  const reason = window.prompt('延误原因（会通知借用人和社区工作人员）：', '临时有事，预计延迟 2 小时')
  if (reason === null) return
  const r = store.reportDelay(id, reason)
  show(r.message, r.ok ? 'ok' : 'err')
}
function reassign(id: string) {
  const r = store.reassignVolunteer(id, 'u_s')
  show(r.message, r.ok ? 'ok' : 'err')
}
function cancelOverdue(id: string) {
  const r = store.cancelRequest(id, `超过 ${PICKUP_WINDOW_HOURS} 小时未取，志愿者释放库存给候补邻居`, { bySystem: true })
  show(r.message, r.ok ? 'ok' : 'err')
}
function confirmWaiting(id: string) {
  const r = store.confirmRequest(id)
  show(r.message, r.ok ? 'ok' : 'err')
}
</script>

<template>
  <SafetyBanner compact />

  <div class="card">
    <h2 style="margin-bottom: 4px">志愿者工作台</h2>
    <div class="muted">
      志愿者的重点：把好入口审核关、保障配送履约、盯住超时与候补。<strong>不判断病情、不推荐药品</strong>，发现破损/不适反馈立即转工作人员隔离核查。
    </div>
    <div class="tabs" style="margin-top: 12px">
      <button class="chip" :class="{ active: tab === 'review' }" @click="tab = 'review'">
        待审物品（{{ reviewQueue.length }}）
      </button>
      <button class="chip" :class="{ active: tab === 'delivery' }" @click="tab = 'delivery'">
        配送任务（{{ deliveryTasks.length }}）<span v-if="delayed.length" class="badge badge-red" style="margin-left: 4px">{{ delayed.length }} 延误</span>
      </button>
      <button class="chip" :class="{ active: tab === 'exceptions' }" @click="tab = 'exceptions'">
        超时未取（{{ overdue.length }}）
      </button>
      <button class="chip" :class="{ active: tab === 'waiting' }" @click="tab = 'waiting'">
        候补协调（{{ waitingReqs.length }}）
      </button>
    </div>
  </div>

  <!-- 审核 -->
  <template v-if="tab === 'review'">
    <div v-if="!reviewQueue.length" class="card empty">没有待审核物品，辛苦啦 🎉</div>
    <div v-for="it in reviewQueue" :key="it.id" class="card">
      <div style="display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap">
        <strong>{{ it.name }} · {{ it.spec }}</strong>
        <ExpiryBadge :expiry-date="it.expiryDate" :now="store.nowIso" />
      </div>
      <dl class="kv" style="margin-top: 8px">
        <dt>登记人</dt><dd>{{ it.ownerName }}</dd>
        <dt>品类</dt><dd>{{ CATEGORY_LABELS[it.category] }}</dd>
        <dt>数量</dt><dd>{{ it.quantity }}</dd>
        <dt>存放</dt><dd>{{ STORAGE_LABELS[it.storage] }}</dd>
        <dt>未开封</dt><dd>{{ it.sealed ? '是，承诺整盒未拆封' : '否' }}</dd>
        <dt>地点</dt><dd>{{ it.location }}</dd>
        <dt>场景</dt><dd>{{ it.sceneTags.map((s) => SCENE_LABELS[s]).join('、') || '未标注' }}</dd>
      </dl>
      <p v-if="it.note" class="muted">留言：{{ it.note }}</p>

      <!-- 规则复核提示：再次机器校验，辅助志愿者把关 -->
      <template v-if="validateDraft(it, store.nowIso).errors.length">
        <div v-for="(e, i) in validateDraft(it, store.nowIso).errors" :key="i" class="banner banner-danger" style="margin-top: 8px">⛔ 规则拦截：{{ e }}</div>
      </template>
      <template v-if="validateDraft(it, store.nowIso).warnings.length">
        <div v-for="(w, i) in validateDraft(it, store.nowIso).warnings" :key="`w${i}`" class="banner banner-warn" style="margin-top: 8px">⚠️ {{ w }}</div>
      </template>

      <div class="card-actions">
        <button class="btn btn-primary btn-sm" @click="approve(it.id)">核验通过，发布</button>
        <button class="btn btn-danger btn-sm" @click="reject(it.id)">驳回（处方药/拆封/冷链等）</button>
        <button class="btn btn-sm" @click="router.push(`/items/${it.id}`)">打开物品页</button>
      </div>
    </div>
  </template>

  <!-- 配送 -->
  <template v-else-if="tab === 'delivery'">
    <div v-if="!deliveryTasks.length" class="card empty">当前没有配送中的任务。</div>
    <div v-for="r in deliveryTasks" :key="r.id" class="card">
      <div style="display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap">
        <strong>代送：{{ itemOf(r.itemId).name }} ×{{ r.quantity }}</strong>
        <span v-if="delayed.some((d) => d.req.id === r.id)" class="badge badge-red">
          已延误 {{ Math.round(delayed.find((d) => d.req.id === r.id)!.hours) }} 小时（承诺 {{ DELIVERY_SLA_HOURS }}h）
        </span>
        <span v-else class="badge badge-blue">配送中（承诺 {{ DELIVERY_SLA_HOURS }} 小时内）</span>
      </div>
      <div class="muted" style="margin: 6px 0">
        收件人：{{ r.applicantName }} · 场景：{{ SCENE_LABELS[r.scene] }} · 取件点：{{ itemOf(r.itemId).location }}
      </div>
      <div v-if="r.note" class="muted">留言：{{ r.note }}</div>
      <div v-if="isNearExpiry(itemOf(r.itemId).expiryDate, store.nowIso)" class="banner banner-warn" style="margin-top: 8px">
        <strong>⏳ 临期物品（有效期至 {{ itemOf(r.itemId).expiryDate }}），送达时请当面向借用人交代：</strong>
        <ul style="margin: 4px 0; padding-left: 20px">
          <li v-for="(c, i) in preUseChecks({ category: itemOf(r.itemId).category, storage: itemOf(r.itemId).storage })" :key="i">{{ c }}</li>
        </ul>
        <label class="check-row">
          <input type="checkbox" v-model="deliveryAck[r.id]" />
          借用人已知悉效期与使用前检查要求（确认记录会以借用人名义留存，并约定 72 小时内反馈使用/剩余/回收）
        </label>
      </div>
      <div v-if="r.delayReason" class="banner banner-warn" style="margin-top: 8px">延误说明：{{ r.delayReason }}</div>

      <PhotoCapture @captured="(p) => (photos[r.id] = p)" />
      <div class="card-actions">
        <button class="btn btn-primary btn-sm" :disabled="!photos[r.id] || (isNearExpiry(itemOf(r.itemId).expiryDate, store.nowIso) && !deliveryAck[r.id])" @click="completeDelivery(r)">送达拍照，完成交接</button>
        <button class="btn btn-warn btn-sm" @click="delay(r.id)">报备配送延误</button>
        <button class="btn btn-sm" @click="reassign(r.id)">改派工作人员兜底</button>
      </div>
    </div>
  </template>

  <!-- 超时未取 -->
  <template v-else-if="tab === 'exceptions'">
    <div v-if="!overdue.length" class="card empty">没有超时未取的申请。</div>
    <div v-for="x in overdue" :key="x.req.id" class="card">
      <div style="display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap">
        <strong>{{ itemOf(x.req.itemId).name }} ×{{ x.req.quantity }}</strong>
        <span class="badge badge-red">超时 {{ Math.round(x.hours) }} 小时未取</span>
      </div>
      <div class="muted" style="margin: 6px 0">
        借用人：{{ x.req.applicantName }} · 方式：{{ METHOD_LABELS[x.req.method] }} · 已锁定库存，影响 {{ store.waitingList(x.req.itemId).length }} 位候补
      </div>
      <div class="card-actions">
        <button class="btn btn-sm" @click="show(`已提醒 ${x.req.applicantName} 尽快取件（演示消息）`)">📞 催办提醒</button>
        <button class="btn btn-danger btn-sm" @click="cancelOverdue(x.req.id)">仍未取，取消并释放给候补</button>
      </div>
    </div>
  </template>

  <!-- 候补协调 -->
  <template v-else>
    <div v-if="!waitingReqs.length" class="card empty">没有候补中 的申请。</div>
    <div v-for="r in waitingReqs" :key="r.id" class="card">
      <div style="display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap">
        <strong>{{ itemOf(r.itemId).name }} ×{{ r.quantity }}</strong>
        <span class="badge badge-amber">候补中</span>
      </div>
      <div class="muted" style="margin: 6px 0">
        申请人：{{ r.applicantName }} · 当前可借 {{ store.availableQty(r.itemId) }}/{{ itemOf(r.itemId).quantity }}
        · 候补 {{ store.waitingList(r.itemId).findIndex((w) => w.id === r.id) + 1 }} 号位
      </div>
      <div class="card-actions">
        <button class="btn btn-primary btn-sm" :disabled="store.availableQty(r.itemId) < r.quantity" @click="confirmWaiting(r.id)">
          {{ store.availableQty(r.itemId) >= r.quantity ? '余量已恢复，确认递补' : '余量不足，继续等待' }}
        </button>
        <button class="btn btn-sm" @click="router.push(`/items/${r.itemId}`)">查看物品与队列</button>
      </div>
    </div>
  </template>
</template>
