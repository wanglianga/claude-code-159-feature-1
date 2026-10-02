<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMedkitStore } from '@/stores/medkit'
import { useFlash } from '@/composables/useFlash'
import { CATEGORY_ICONS, METHOD_LABELS, SCENE_LABELS, isNearExpiry } from '@/rules'
import SafetyBanner from '@/components/SafetyBanner.vue'
import ItemStatusBadge from '@/components/ItemStatusBadge.vue'
import RequestStatusBadge from '@/components/RequestStatusBadge.vue'
import PhotoCapture from '@/components/PhotoCapture.vue'
import NearExpiryAckPanel from '@/components/NearExpiryAckPanel.vue'
import { daysUntil, fmtDateTime } from '@/utils/date'

const store = useMedkitStore()
const router = useRouter()
const { show } = useFlash()
const tab = ref<'items' | 'requests'>('items')

const myItems = computed(() => store.items.filter((i) => i.ownerId === store.currentUserId))

/** 发生在我的物品上、需要我确认/交接的申请 */
const incoming = computed(() =>
  store.requests
    .filter((r) => {
      const it = store.items.find((x) => x.id === r.itemId)
      return it?.ownerId === store.currentUserId && ['waiting', 'confirmed', 'handing'].includes(r.status)
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
)

const photos = ref<Record<string, string>>({})
const acks = reactive<Record<string, { expiryConfirmed: boolean; sealConfirmed: boolean; appearanceConfirmed: boolean; withinDateUse: boolean }>>({})
function ackOf(id: string) {
  if (!acks[id]) acks[id] = { expiryConfirmed: false, sealConfirmed: false, appearanceConfirmed: false, withinDateUse: false }
  return acks[id]
}

function itemOf(id: string) {
  return store.items.find((i) => i.id === id)
}
function available(id: string) {
  return store.availableQty(id)
}
/** 社区发来的最近一条临期提醒（取回/报废/回访催收） */
function ownerNotice(itemId: string): string | undefined {
  const ev = store.itemTimeline(itemId).find((e) => e.kind === 'near_expiry_notified')
  return ev ? `${fmtDateTime(ev.at)} · ${ev.actorName}：${ev.detail ?? ''}` : undefined
}

function confirmReq(id: string) {
  const r = store.confirmRequest(id)
  show(r.message, r.ok ? 'ok' : 'err')
}
function startHandover(id: string) {
  const r = store.startHandover(id)
  show(r.message, r.ok ? 'ok' : 'err')
}
function completeHandover(id: string) {
  const r0 = store.requests.find((x) => x.id === id)
  const it = r0 ? itemOf(r0.itemId) : undefined
  const near = !!it && isNearExpiry(it.expiryDate, store.nowIso)
  const a = ackOf(id)
  const r = store.completeHandover(
    id,
    photos.value[id] ?? '',
    '交接现场拍照确认',
    near
      ? { expiryConfirmed: a.expiryConfirmed, sealConfirmed: a.sealConfirmed, appearanceConfirmed: a.appearanceConfirmed, withinDateUse: a.withinDateUse }
      : undefined,
  )
  show(r.message, r.ok ? 'ok' : 'err')
}
function cancelReq(id: string) {
  const reason = window.prompt('取消原因（会通知申请人并释放库存）：', '暂时无法安排交接')
  if (reason === null) return
  const r = store.cancelRequest(id, reason || '共享人取消')
  show(r.message, r.ok ? 'ok' : 'err')
}
function recall(id: string) {
  const reason = window.prompt('撤回原因（候补中申请将自动取消，进行中的借用继续完成）：', '家中自己需要使用')
  if (reason === null) return
  const r = store.recallItem(id, reason || '共享人主动撤回')
  show(r.message, r.ok ? 'ok' : 'err')
}
/** 共享人自行取回临期物品：撤回并按指引处理 */
function takeBack(id: string) {
  const r = store.recallItem(id, '临期无人借用，共享人自行取回，在到期日前使用或按有害/医疗垃圾处理')
  show(r.message, r.ok ? 'ok' : 'err')
}
</script>

<template>
  <SafetyBanner compact />

  <div class="card">
    <h2 style="margin-bottom: 4px">我的共享</h2>
    <div class="muted">登记、审核进度、借出余量、交接与归还记录在这里连在一起。临期物品请配合社区优先流转、到期前取回。</div>
    <div class="tabs" style="margin-top: 12px">
      <button class="chip" :class="{ active: tab === 'items' }" @click="tab = 'items'">我登记的物品（{{ myItems.length }}）</button>
      <button class="chip" :class="{ active: tab === 'requests' }" @click="tab = 'requests'">待我处理的借用申请（{{ incoming.length }}）</button>
    </div>
  </div>

  <template v-if="tab === 'items'">
    <div v-if="!myItems.length" class="card empty">
      你还没有登记过物品。<RouterLink to="/register">去登记家中多余的未拆封用品 →</RouterLink>
    </div>
    <div v-for="it in myItems" :key="it.id" class="card">
      <div style="display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center">
        <div>
          <strong>{{ CATEGORY_ICONS[it.category] }} {{ it.name }}</strong>
          <span class="muted"> · {{ it.spec }} · 总量 {{ it.quantity }} · 可借 {{ available(it.id) }}</span>
          <span v-if="['published', 'partially_lent', 'lent_out'].includes(it.status) && daysUntil(it.expiryDate, store.nowIso) >= 0 && daysUntil(it.expiryDate, store.nowIso) <= 10" class="badge badge-red" style="margin-left: 6px">临期剩 {{ daysUntil(it.expiryDate, store.nowIso) }} 天</span>
        </div>
        <ItemStatusBadge :status="it.status" />
      </div>
      <div v-if="it.status === 'pending_review'" class="banner banner-warn" style="margin-top: 8px">
        {{ it.category === 'other_consumable' && it.review?.approved ? '志愿者已初审，等待社区工作人员复核。' : '等待社区志愿者审核，审核通过后才会出现在大厅。' }}
      </div>
      <div v-if="it.status === 'rejected'" class="banner banner-danger" style="margin-top: 8px">
        审核未通过：{{ it.review?.reason || it.closeReason || '不符合共享范围' }}
      </div>
      <!-- 临期优先流转：社区提醒取回/报废 -->
      <div v-if="['published', 'partially_lent', 'lent_out'].includes(it.status) && isNearExpiry(it.expiryDate, store.nowIso)" class="banner banner-warn" style="margin-top: 8px">
        <strong>🔖 该物品已进入临期优先流转期（{{ it.expiryDate }} 到期）。</strong>
        社区会优先推荐给近期确定要用的邻居；若无人借用，请你<strong>取回在到期日前自行使用</strong>，或交社区按报废流程处理，<strong>不要让它过期后留在共享柜或邻居家中</strong>。
        <div v-if="ownerNotice(it.id)" class="muted" style="margin-top: 4px">📣 {{ ownerNotice(it.id) }}</div>
      </div>
      <div v-if="it.closeReason && ['quarantined', 'recalled', 'scrapped'].includes(it.status)" class="banner banner-info" style="margin-top: 8px">
        {{ it.closeReason }}
      </div>
      <div class="card-actions">
        <button class="btn btn-sm" @click="router.push(`/items/${it.id}`)">查看全流程记录</button>
        <button
          v-if="['published', 'partially_lent'].includes(it.status) && isNearExpiry(it.expiryDate, store.nowIso)"
          class="btn btn-sm btn-warn"
          @click="takeBack(it.id)"
        >
          无人借用，我取回自行处理
        </button>
        <button
          v-if="!['recalled', 'scrapped', 'rejected'].includes(it.status)"
          class="btn btn-sm btn-danger"
          @click="recall(it.id)"
        >
          撤回共享
        </button>
      </div>
    </div>
  </template>

  <template v-else>
    <div v-if="!incoming.length" class="card empty">目前没有需要你处理的申请。</div>
    <div v-for="r in incoming" :key="r.id" class="card">
      <div style="display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap">
        <strong>{{ itemOf(r.itemId)?.name ?? r.itemId }} × {{ r.quantity }}</strong>
        <RequestStatusBadge :status="r.status" />
      </div>
      <div class="muted" style="margin: 6px 0">
        申请人：{{ r.applicantName }} · 场景：{{ SCENE_LABELS[r.scene] }} · 方式：{{ METHOD_LABELS[r.method] }}
        · 申请于 {{ fmtDateTime(r.createdAt) }}
      </div>
      <div v-if="r.note" class="muted">留言：{{ r.note }}</div>

      <div v-if="r.status === 'waiting'" class="card-actions">
        <button class="btn btn-primary btn-sm" :disabled="available(r.itemId) < r.quantity" @click="confirmReq(r.id)">
          {{ available(r.itemId) >= r.quantity ? '确认并锁定库存' : `余量不足（${available(r.itemId)}/${r.quantity}），等待归还` }}
        </button>
        <button class="btn btn-sm btn-danger" @click="cancelReq(r.id)">婉拒/取消</button>
        <button class="btn btn-sm" @click="router.push(`/items/${r.itemId}`)">查看物品</button>
      </div>

      <template v-else-if="r.status === 'confirmed'">
        <div v-if="itemOf(r.itemId) && isNearExpiry(itemOf(r.itemId)!.expiryDate, store.nowIso)" class="banner banner-warn" style="margin-top: 8px">
          🔖 临期物品：交接时请与借用人<strong>当面逐项核对效期、封签与外观</strong>，由借用人确认后再完成交接。
        </div>
        <div class="banner banner-info" style="margin-top: 8px">已确认，请在 24 小时内完成交接；逾期未取系统会标红提醒。</div>
        <div class="card-actions">
          <button class="btn btn-primary btn-sm" @click="startHandover(r.id)">
            {{ r.method === 'volunteer_delivery' ? '通知志愿者开始配送' : r.method === 'door_contactless' ? '我已放到门口位置' : '我已放到取件点，等待自取' }}
          </button>
          <button class="btn btn-sm btn-danger" @click="cancelReq(r.id)">取消本次借用</button>
        </div>
      </template>

      <template v-else>
        <NearExpiryAckPanel v-if="itemOf(r.itemId) && isNearExpiry(itemOf(r.itemId)!.expiryDate, store.nowIso)" :model-value="ackOf(r.id)" @update:model-value="(v) => Object.assign(ackOf(r.id), v)" :item="itemOf(r.itemId)!" :now="store.nowIso" />
        <div v-if="itemOf(r.itemId) && isNearExpiry(itemOf(r.itemId)!.expiryDate, store.nowIso)" class="muted" style="margin: -4px 0 8px">
          你正在代借用人 {{ r.applicantName }} 操作，确认记录仍记在借用人名下；无接触交接请通过留言/电话先与对方逐项核对。
        </div>
        <div class="banner banner-info" style="margin-top: 8px">交接进行中，完成后请由取件人拍照确认（双方均可上传）。</div>
        <PhotoCapture @captured="(p) => (photos[r.id] = p)" />
        <div class="card-actions">
          <button
            class="btn btn-primary btn-sm"
            :disabled="!photos[r.id] || (!!itemOf(r.itemId) && isNearExpiry(itemOf(r.itemId)!.expiryDate, store.nowIso) && !(ackOf(r.id).expiryConfirmed && ackOf(r.id).sealConfirmed && ackOf(r.id).appearanceConfirmed && ackOf(r.id).withinDateUse))"
            @click="completeHandover(r.id)"
          >
            凭照片{{ itemOf(r.itemId) && isNearExpiry(itemOf(r.itemId)!.expiryDate, store.nowIso) ? '与借用人临期逐项确认' : '' }}确认交接完成
          </button>
        </div>
      </template>
    </div>
  </template>
</template>
