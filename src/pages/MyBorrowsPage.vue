<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMedkitStore } from '@/stores/medkit'
import { useFlash } from '@/composables/useFlash'
import {
  CLOSE_MODE_LABELS,
  DELIVERY_SLA_HOURS,
  NEAR_EXPIRY_FOLLOWUP_HOURS,
  PICKUP_WINDOW_HOURS,
  RECYCLE_METHOD_LABELS,
  USE_FEEDBACK_USED_LABELS,
  isNearExpiry,
} from '@/rules'
import SafetyBanner from '@/components/SafetyBanner.vue'
import RequestCard from '@/components/RequestCard.vue'
import PhotoCapture from '@/components/PhotoCapture.vue'
import ExpiryBadge from '@/components/ExpiryBadge.vue'
import NearExpiryAckPanel from '@/components/NearExpiryAckPanel.vue'
import { daysUntil, fmtDateTime, hoursSince } from '@/utils/date'
import type { BorrowRequest, UseFeedbackUsed } from '@/types'

const store = useMedkitStore()
const router = useRouter()
const { show } = useFlash()

const myRequests = computed(() => store.requests.filter((r) => r.applicantId === store.currentUserId))
const photos = ref<Record<string, string>>({})
const closeMode = ref<Record<string, BorrowRequest['closeMode']>>({})

/** 每个交接请求一份临期确认勾选状态 */
const acks = reactive<Record<string, { expiryConfirmed: boolean; sealConfirmed: boolean; appearanceConfirmed: boolean; withinDateUse: boolean }>>({})
function ackOf(id: string) {
  if (!acks[id]) acks[id] = { expiryConfirmed: false, sealConfirmed: false, appearanceConfirmed: false, withinDateUse: false }
  return acks[id]
}

/** 回访表单显隐与内容 */
const fbOpen = ref<Record<string, boolean>>({})
const fbForm = reactive<Record<string, { used: UseFeedbackUsed; needRecycle: boolean; recycleMethod: 'volunteer_pickup' | 'self_dropoff'; note: string }>>({})
function formOf(id: string) {
  if (!fbForm[id]) fbForm[id] = { used: 'used', needRecycle: false, recycleMethod: 'self_dropoff', note: '' }
  return fbForm[id]
}

function itemOf(id: string) {
  return store.items.find((i) => i.id === id)
}
function overdueHours(r: BorrowRequest) {
  return hoursSince(r.handingAt ?? r.confirmedAt ?? r.createdAt, store.nowIso)
}
/** 距约定回访时间的小时数（负=已到点/逾期） */
function followDueIn(r: BorrowRequest): number {
  if (!r.followUpAt) return Number.POSITIVE_INFINITY
  return (new Date(r.followUpAt).getTime() - new Date(store.nowIso).getTime()) / 3_600_000
}

function startHandover(id: string) {
  const r = store.startHandover(id)
  show(r.message, r.ok ? 'ok' : 'err')
}
function completeHandover(id: string) {
  const r0 = store.requests.find((x) => x.id === id)
  const it = r0 ? itemOf(r0.itemId) : undefined
  const a = ackOf(id)
  const near = !!it && isNearExpiry(it.expiryDate, store.nowIso)
  const r = store.completeHandover(
    id,
    photos.value[id] ?? '',
    '取件人拍照确认，包装外观完好',
    near
      ? { expiryConfirmed: a.expiryConfirmed, sealConfirmed: a.sealConfirmed, appearanceConfirmed: a.appearanceConfirmed, withinDateUse: a.withinDateUse }
      : undefined,
  )
  show(r.message, r.ok ? 'ok' : 'err')
}
function cancelMine(id: string) {
  const r = store.cancelRequest(id, '借用人主动取消')
  show(r.message, r.ok ? 'ok' : 'err')
}
function closeBorrow(id: string) {
  const mode = closeMode.value[id] ?? 'return_sealed'
  const r = store.closeBorrow(id, mode, mode === 'return_sealed' ? '原物未拆封归还至共享柜' : mode === 'restock_new' ? '已购买同规格新品补充' : '共享人同意赠予')
  show(r.message, r.ok ? 'ok' : 'err')
}

function submitFb(id: string) {
  const f = formOf(id)
  const r = store.submitUseFeedback(id, f.used, f.needRecycle, f.needRecycle ? f.recycleMethod : undefined, f.note || undefined)
  show(r.message, r.ok ? 'ok' : 'err')
  if (r.ok) fbOpen.value[id] = false
}
</script>

<template>
  <SafetyBanner compact />

  <div class="card">
    <h2 style="margin-bottom: 4px">我的借用</h2>
    <div class="muted">
      申请、候补、交接拍照、归还/补充约定都在这里。请在确认后 {{ PICKUP_WINDOW_HOURS }} 小时内取走；志愿者配送承诺 {{ DELIVERY_SLA_HOURS }} 小时内送达。
      临期物品借出后，请按约定在 {{ NEAR_EXPIRY_FOLLOWUP_HOURS }} 小时内反馈是否使用、是否剩余、是否需要社区回收。
    </div>
  </div>

  <div v-if="!myRequests.length" class="card empty">
    你还没有借用记录。<RouterLink to="/hall">去药箱大厅看看邻居分享了什么 →</RouterLink>
  </div>

  <div v-for="r in myRequests" :key="r.id" class="card">
    <RequestCard :req="r" :item-name="itemOf(r.itemId)?.name ?? r.itemId" />

    <div v-if="itemOf(r.itemId)" class="muted" style="margin: 6px 0">
      物品效期：<ExpiryBadge :expiry-date="itemOf(r.itemId)!.expiryDate" :now="store.nowIso" />
      · 取用地点：{{ itemOf(r.itemId)!.location }}
    </div>

    <!-- 候补 -->
    <div v-if="r.status === 'waiting'" class="card-actions">
      <span class="muted">余量不足时按申请顺序候补，他人取消或归还后可递补。</span>
      <button class="btn btn-sm btn-danger" @click="cancelMine(r.id)">取消候补</button>
      <button class="btn btn-sm" @click="router.push(`/items/${r.itemId}`)">查看物品</button>
    </div>

    <!-- 已确认，等待交接 -->
    <template v-else-if="r.status === 'confirmed'">
      <div v-if="itemOf(r.itemId) && isNearExpiry(itemOf(r.itemId)!.expiryDate, store.nowIso)" class="banner banner-warn" style="margin-top: 8px">
        🔖 这是<strong>临期物品</strong>（{{ itemOf(r.itemId)!.expiryDate }} 到期）：交接时必须逐项核对效期、封签与外观，并承诺到期日前使用。
      </div>
      <div v-if="overdueHours(r) > PICKUP_WINDOW_HOURS" class="banner banner-danger" style="margin-top: 8px">
        ⏰ 已超过 {{ PICKUP_WINDOW_HOURS }} 小时取走时限，共享人/志愿者可能取消申请并释放库存给候补邻居，请尽快联系。
      </div>
      <div v-else class="banner banner-info" style="margin-top: 8px">
        已为你锁定库存，请按时取走；自取请在取件点检查包装封签。
      </div>
      <div class="card-actions">
        <button v-if="r.method === 'self_pickup'" class="btn btn-primary btn-sm" @click="startHandover(r.id)">我已到取件点，开始取件</button>
        <button class="btn btn-sm btn-danger" @click="cancelMine(r.id)">去不了，取消释放给他人</button>
      </div>
    </template>

    <!-- 交接中：临期物品强制效期+使用前检查确认 -->
    <template v-else-if="r.status === 'handing'">
      <NearExpiryAckPanel v-if="itemOf(r.itemId) && isNearExpiry(itemOf(r.itemId)!.expiryDate, store.nowIso)" :model-value="ackOf(r.id)" @update:model-value="(v) => Object.assign(ackOf(r.id), v)" :item="itemOf(r.itemId)!" :now="store.nowIso" />
      <PhotoCapture @captured="(p) => (photos[r.id] = p)" />
      <div class="card-actions">
        <button
          class="btn btn-primary btn-sm"
          :disabled="!photos[r.id] || (!!itemOf(r.itemId) && isNearExpiry(itemOf(r.itemId)!.expiryDate, store.nowIso) && !(ackOf(r.id).expiryConfirmed && ackOf(r.id).sealConfirmed && ackOf(r.id).appearanceConfirmed && ackOf(r.id).withinDateUse))"
          @click="completeHandover(r.id)"
        >
          照片已拍{{ itemOf(r.itemId) && isNearExpiry(itemOf(r.itemId)!.expiryDate, store.nowIso) ? '，并完成临期逐项确认' : '' }}，确认收到
        </button>
      </div>
      <div v-if="r.method === 'door_contactless'" class="muted" style="margin-top: 6px">无接触交接：取走后请拍照，便于共享人确认。</div>
    </template>

    <!-- 已取走：临期物品展示确认记录 + 到期使用回访 -->
    <template v-else-if="r.status === 'completed'">
      <!-- 临期借出：确认留痕 + 回访提醒/表单 -->
      <template v-if="r.nearExpiry && itemOf(r.itemId)">
        <div class="banner banner-success" style="margin-top: 8px">
          ✅ 你已于 {{ r.nearExpiryAck ? fmtDateTime(r.nearExpiryAck.at) : '' }} 完成<strong>临期使用前检查确认</strong>：
          到期日 {{ itemOf(r.itemId)!.expiryDate }}、封签完好、外观无异常，并承诺到期日前使用。
          <span class="muted" style="display: block; margin-top: 2px">该确认记录与交接照片一并留痕，社区、共享人与你三方可查。</span>
        </div>

        <!-- 尚未回访 -->
        <template v-if="!r.useFeedbackId">
          <div v-if="itemOf(r.itemId) && daysUntil(itemOf(r.itemId)!.expiryDate, store.nowIso) < 0" class="banner banner-danger" style="margin-top: 8px">
            🛑 该物品<strong>已经过期</strong>：无论是否拆封都<strong>不得再使用</strong>，请立即反馈，并将剩余物品交<strong>社区回收/按报废处理</strong>，不要自行丢弃到普通垃圾或继续留存。
          </div>
          <div v-else-if="followDueIn(r) <= 0" class="banner banner-danger" style="margin-top: 8px">
            🔔 约定的回访时间已到（交接后 {{ NEAR_EXPIRY_FOLLOWUP_HOURS }} 小时）。请反馈<strong>是否已使用、是否有剩余、是否需要社区回收</strong>，
            避免临期物品长期停放在家中；到期日后未拆封物品也不能再使用。
          </div>
          <div v-else class="banner banner-info" style="margin-top: 8px">
            系统将在 {{ fmtDateTime(r.followUpAt!) }} 提醒你回访使用情况。如已用完或确定用不上，也可以现在提前反馈。
          </div>

          <div v-if="fbOpen[r.id]">
            <label class="field" style="margin-top: 8px">
              <span>使用情况</span>
              <select v-model="formOf(r.id).used">
                <option value="used">{{ USE_FEEDBACK_USED_LABELS.used }}</option>
                <option value="partial">{{ USE_FEEDBACK_USED_LABELS.partial }}</option>
                <option value="unused">{{ USE_FEEDBACK_USED_LABELS.unused }}</option>
              </select>
            </label>
            <label class="check-row">
              <input type="checkbox" v-model="formOf(r.id).needRecycle" />
              <span>剩余物品需要<strong>社区回收</strong>（志愿者上门取 / 我送到共享柜，回收后不再流通、不占我家地方）</span>
            </label>
            <label v-if="formOf(r.id).needRecycle" class="field">
              <span>回收方式</span>
              <select v-model="formOf(r.id).recycleMethod">
                <option value="volunteer_pickup">{{ RECYCLE_METHOD_LABELS.volunteer_pickup }}</option>
                <option value="self_dropoff">{{ RECYCLE_METHOD_LABELS.self_dropoff }}</option>
              </select>
            </label>
            <label class="field">
              <span>补充说明（可选）</span>
              <textarea v-model="formOf(r.id).note" placeholder="例如：孩子退烧了没用上、还剩 2 贴未拆封；希望明晚 7 点后上门"></textarea>
            </label>
            <div class="card-actions">
              <button class="btn btn-primary btn-sm" @click="submitFb(r.id)">提交回访反馈</button>
              <button class="btn btn-sm" @click="fbOpen[r.id] = false">暂不反馈</button>
            </div>
          </div>
          <div v-else class="card-actions">
            <button class="btn btn-primary btn-sm" @click="fbOpen[r.id] = true">反馈使用 / 剩余 / 回收</button>
          </div>
        </template>

        <!-- 已回访 -->
        <div v-else class="banner banner-info" style="margin-top: 8px">
          📋 回访反馈已提交：{{ store.useFeedbackOf(r.useFeedbackId)?.used === 'used' ? USE_FEEDBACK_USED_LABELS.used : store.useFeedbackOf(r.useFeedbackId)?.used === 'partial' ? USE_FEEDBACK_USED_LABELS.partial : USE_FEEDBACK_USED_LABELS.unused }}
          <template v-if="store.useFeedbackOf(r.useFeedbackId)?.needRecycle">
            ；已约社区回收（{{ store.useFeedbackOf(r.useFeedbackId)?.recycleMethod === 'volunteer_pickup' ? RECYCLE_METHOD_LABELS.volunteer_pickup : RECYCLE_METHOD_LABELS.self_dropoff }}）
            <span v-if="store.useFeedbackOf(r.useFeedbackId)?.resolvedAt">，✅ 已于 {{ fmtDateTime(store.useFeedbackOf(r.useFeedbackId)!.resolvedAt!) }} 回收闭环</span>
            <span v-else>，等待工作人员安排</span>
          </template>
          。
        </div>

        <!-- 有剩余且未走社区回收：仍可通过归还/补充闭环 -->
        <template v-if="store.useFeedbackOf(r.useFeedbackId) && !store.useFeedbackOf(r.useFeedbackId)?.needRecycle && store.useFeedbackOf(r.useFeedbackId)?.used !== 'used'">
          <label class="field" style="margin-top: 8px">
            <span>剩余物品闭环方式</span>
            <select v-model="closeMode[r.id]">
              <option value="return_sealed">{{ CLOSE_MODE_LABELS.return_sealed }}</option>
              <option value="restock_new">{{ CLOSE_MODE_LABELS.restock_new }}</option>
            </select>
          </label>
          <div class="card-actions">
            <button class="btn btn-primary btn-sm" @click="closeBorrow(r.id)">归还剩余 / 补充新品，完成闭环</button>
          </div>
        </template>
      </template>

      <!-- 普通物品：原有归还/补充流程 -->
      <template v-else>
        <div class="banner banner-success" style="margin-top: 8px">
          已取走并拍照确认。请与共享人约定的方式闭环：<strong>归还原物（须仍未拆封）</strong>、<strong>补充同规格新品</strong>，或经共享人同意作为邻里赠予。
        </div>
        <label class="field" style="margin-top: 8px">
          <span>归还 / 补充方式</span>
          <select v-model="closeMode[r.id]">
            <option value="return_sealed">{{ CLOSE_MODE_LABELS.return_sealed }}</option>
            <option value="restock_new">{{ CLOSE_MODE_LABELS.restock_new }}</option>
            <option value="mutual_aid">{{ CLOSE_MODE_LABELS.mutual_aid }}</option>
          </select>
        </label>
        <div class="card-actions">
          <button class="btn btn-primary btn-sm" @click="closeBorrow(r.id)">登记归还 / 补充完成</button>
          <button class="btn btn-sm btn-danger" @click="router.push(`/items/${r.itemId}`)">使用中发现问题？去反馈</button>
        </div>
      </template>
    </template>
  </div>
</template>
