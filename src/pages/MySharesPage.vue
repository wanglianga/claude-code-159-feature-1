<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMedkitStore } from '@/stores/medkit'
import { useFlash } from '@/composables/useFlash'
import { CATEGORY_ICONS, METHOD_LABELS, SCENE_LABELS } from '@/rules'
import SafetyBanner from '@/components/SafetyBanner.vue'
import ItemStatusBadge from '@/components/ItemStatusBadge.vue'
import RequestStatusBadge from '@/components/RequestStatusBadge.vue'
import PhotoCapture from '@/components/PhotoCapture.vue'
import { fmtDateTime } from '@/utils/date'

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

function itemName(id: string) {
  return store.items.find((i) => i.id === id)?.name ?? id
}
function available(id: string) {
  return store.availableQty(id)
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
  const r = store.completeHandover(id, photos.value[id] ?? '', '交接现场拍照确认')
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
</script>

<template>
  <SafetyBanner compact />

  <div class="card">
    <h2 style="margin-bottom: 4px">我的共享</h2>
    <div class="muted">登记、审核进度、借出余量、交接与归还记录在这里连在一起。</div>
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
        </div>
        <ItemStatusBadge :status="it.status" />
      </div>
      <div v-if="it.status === 'pending_review'" class="banner banner-warn" style="margin-top: 8px">
        {{ it.category === 'other_consumable' && it.review?.approved ? '志愿者已初审，等待社区工作人员复核。' : '等待社区志愿者审核，审核通过后才会出现在大厅。' }}
      </div>
      <div v-if="it.status === 'rejected'" class="banner banner-danger" style="margin-top: 8px">
        审核未通过：{{ it.review?.reason || it.closeReason || '不符合共享范围' }}
      </div>
      <div v-if="it.closeReason && ['quarantined', 'recalled', 'scrapped'].includes(it.status)" class="banner banner-info" style="margin-top: 8px">
        {{ it.closeReason }}
      </div>
      <div class="card-actions">
        <button class="btn btn-sm" @click="router.push(`/items/${it.id}`)">查看全流程记录</button>
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
        <strong>{{ itemName(r.itemId) }} × {{ r.quantity }}</strong>
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
        <div class="banner banner-info" style="margin-top: 8px">已确认，请在 24 小时内完成交接；逾期未取系统会标红提醒。</div>
        <div class="card-actions">
          <button class="btn btn-primary btn-sm" @click="startHandover(r.id)">
            {{ r.method === 'volunteer_delivery' ? '通知志愿者开始配送' : r.method === 'door_contactless' ? '我已放到门口位置' : '我已放到取件点，等待自取' }}
          </button>
          <button class="btn btn-sm btn-danger" @click="cancelReq(r.id)">取消本次借用</button>
        </div>
      </template>

      <template v-else>
        <div class="banner banner-info" style="margin-top: 8px">交接进行中，完成后请由取件人拍照确认（双方均可上传）。</div>
        <PhotoCapture @captured="(p) => (photos[r.id] = p)" />
        <div class="card-actions">
          <button class="btn btn-primary btn-sm" :disabled="!photos[r.id]" @click="completeHandover(r.id)">凭照片确认交接完成</button>
        </div>
      </template>
    </div>
  </template>
</template>
