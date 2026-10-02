<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMedkitStore } from '@/stores/medkit'
import { useFlash } from '@/composables/useFlash'
import {
  CLOSE_MODE_LABELS,
  DELIVERY_SLA_HOURS,
  isNearExpiry,
  NEAR_EXPIRY_FEEDBACK_HOURS,
  PICKUP_WINDOW_HOURS,
  preUseChecks,
} from '@/rules'
import { fmtDateTime, hoursSince } from '@/utils/date'
import SafetyBanner from '@/components/SafetyBanner.vue'
import RequestCard from '@/components/RequestCard.vue'
import PhotoCapture from '@/components/PhotoCapture.vue'
import ExpiryBadge from '@/components/ExpiryBadge.vue'
import type { BorrowRequest } from '@/types'

const store = useMedkitStore()
const router = useRouter()
const { show } = useFlash()

const myRequests = computed(() => store.requests.filter((r) => r.applicantId === store.currentUserId))
const photos = ref<Record<string, string>>({})
/** 临期物品交接时借用人逐项确认 */
const ack = reactive<Record<string, boolean>>({})
const closeMode = ref<Record<string, BorrowRequest['closeMode']>>({})

/** 临期用后反馈表单（每笔借用独立） */
const fbForms = reactive<Record<string, { used: boolean; usedCount: number; remaining: number; needRecycle: boolean; note: string }>>({})
function fbForm(r: BorrowRequest) {
  if (!fbForms[r.id]) {
    fbForms[r.id] = { used: false, usedCount: 0, remaining: r.quantity, needRecycle: true, note: '' }
  }
  return fbForms[r.id]
}

function itemOf(id: string) {
  return store.items.find((i) => i.id === id)
}
function overdueHours(r: BorrowRequest) {
  return hoursSince(r.handingAt ?? r.confirmedAt ?? r.createdAt, store.nowIso)
}
function nearOf(r: BorrowRequest) {
  const it = itemOf(r.itemId)
  return it ? isNearExpiry(it.expiryDate, store.nowIso) : false
}
/** 交接时按当前效期判断是否需要强制确认（申请可能是几天前提交的） */
function handingNear(r: BorrowRequest) {
  return r.status === 'handing' && nearOf(r)
}

function startHandover(id: string) {
  const r = store.startHandover(id)
  show(r.message, r.ok ? 'ok' : 'err')
}
function completeHandover(r: BorrowRequest) {
  const it = itemOf(r.itemId)
  const near = it ? isNearExpiry(it.expiryDate, store.nowIso) : false
  if (near && !ack[r.id]) {
    show('临期物品：请先逐项勾选“已核对效期、已阅读使用前检查要求”，再确认收到。', 'err')
    return
  }
  const res = store.completeHandover(
    r.id,
    photos.value[r.id] ?? '',
    '取件人拍照确认，包装外观完好',
    it && near ? { expiryDate: it.expiryDate, preUseCheckAck: true } : undefined,
  )
  show(res.message, res.ok ? 'ok' : 'err')
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
function submitFb(r: BorrowRequest) {
  const f = fbForm(r)
  const res = store.submitUseFeedback(r.id, {
    used: f.used,
    usedCount: f.used ? f.usedCount : undefined,
    remaining: f.remaining,
    needRecycle: f.needRecycle,
    note: f.note || undefined,
  })
  show(res.message, res.ok ? 'ok' : 'err')
}
</script>

<template>
  <SafetyBanner compact />

  <div class="card">
    <h2 style="margin-bottom: 4px">我的借用</h2>
    <div class="muted">
      申请、候补、交接拍照、归还/补充约定都在这里。请在确认后 {{ PICKUP_WINDOW_HOURS }} 小时内取走；志愿者配送承诺 {{ DELIVERY_SLA_HOURS }} 小时内送达。
      临期物品交接时需<strong>逐项确认效期与使用前检查要求</strong>，并在取走后约定时间（{{ NEAR_EXPIRY_FEEDBACK_HOURS }} 小时）内反馈<strong>是否使用、是否剩余、是否需要社区回收</strong>。
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
      <div v-if="overdueHours(r) > PICKUP_WINDOW_HOURS" class="banner banner-danger" style="margin-top: 8px">
        ⏰ 已超过 {{ PICKUP_WINDOW_HOURS }} 小时取走时限，共享人/志愿者可能取消申请并释放库存给候补邻居，请尽快联系。
      </div>
      <div v-else-if="nearOf(r)" class="banner banner-warn" style="margin-top: 8px">
        ⏳ 该物品临近效期：交接时你需要逐项核对效期与使用前检查要求并确认留痕；取走后请在 {{ NEAR_EXPIRY_FEEDBACK_HOURS }} 小时内反馈使用/剩余/回收需求。
      </div>
      <div v-else class="banner banner-info" style="margin-top: 8px">
        已为你锁定库存，请按时取走；自取请在取件点检查包装封签。
      </div>
      <div class="card-actions">
        <button v-if="r.method === 'self_pickup'" class="btn btn-primary btn-sm" @click="startHandover(r.id)">我已到取件点，开始取件</button>
        <button class="btn btn-sm btn-danger" @click="cancelMine(r.id)">去不了，取消释放给他人</button>
      </div>
    </template>

    <!-- 交接中：临期物品必须逐项确认效期与使用前检查 -->
    <template v-else-if="r.status === 'handing'">
      <div v-if="handingNear(r) && itemOf(r.itemId)" class="banner banner-warn" style="margin-top: 8px">
        <strong>该物品临近效期（有效期至 {{ itemOf(r.itemId)!.expiryDate }}），确认收到前请逐项核对：</strong>
        <label class="check-row">
          <input type="checkbox" v-model="ack[r.id]" />
          我已核对<strong>效期</strong>，并阅读/满足以下<strong>使用前检查要求</strong>：
        </label>
        <ul style="margin: 4px 0 0; padding-left: 20px">
          <li v-for="(c, i) in preUseChecks(itemOf(r.itemId)!)" :key="i">{{ c }}</li>
        </ul>
        <div class="muted" style="margin-top: 6px">
          确认记录会保留在物品时间线中；到期未用完请不要继续使用或转赠，社区将按约定提醒你反馈并安排回收。
        </div>
      </div>
      <PhotoCapture @captured="(p) => (photos[r.id] = p)" />
      <div class="card-actions">
        <button class="btn btn-primary btn-sm" :disabled="!photos[r.id] || (handingNear(r) && !ack[r.id])" @click="completeHandover(r)">
          照片已拍，{{ handingNear(r) ? '已逐项确认效期与检查要求，' : '' }}确认收到
        </button>
      </div>
      <div v-if="r.method === 'door_contactless'" class="muted" style="margin-top: 6px">无接触交接：取走后请拍照，便于共享人确认。</div>
    </template>

    <!-- 已取走：临期物品先用后反馈，再闭环 -->
    <template v-else-if="r.status === 'completed'">
      <!-- 临期追踪条 -->
      <div v-if="r.nearExpiry" class="banner banner-warn" style="margin-top: 8px">
        <strong>⏳ 临期物品用后追踪</strong>
        交接时你已于 {{ r.expiryAckAt ? fmtDateTime(r.expiryAckAt) : '—' }} 确认效期（至 {{ r.expiryAckDate }}）与使用前检查要求；
        约定反馈截止时间：<strong>{{ r.feedbackDueAt ? fmtDateTime(r.feedbackDueAt) : '—' }}</strong>。
        <template v-if="r.feedbackDueAt && hoursSince(r.feedbackDueAt, store.nowIso) >= 0 && !r.useFeedback">
          <br /><span style="color: var(--c-danger)">已超过约定反馈时间，请尽快反馈，避免临期物品滞留家中；社区工作人员也会提醒你。</span>
        </template>
      </div>

      <!-- 已反馈结果 -->
      <div v-if="r.useFeedback" class="banner" :class="r.useFeedback.needRecycle ? 'banner-warn' : 'banner-success'" style="margin-top: 8px">
        <strong>你的用后反馈已记录（{{ fmtDateTime(r.useFeedback.at) }}）</strong>
        {{ r.useFeedback.used ? `已使用 ${r.useFeedback.usedCount} 片/件` : '未使用' }}；剩余 {{ r.useFeedback.remaining }}；{{ r.useFeedback.needRecycle ? '等待社区联系回收，请保持包装完好、不要自行使用或转赠' : '无需社区回收，可办理归还/补充闭环' }}。
        <span v-if="r.useFeedback.recycleCompletedAt"><br />♻️ {{ r.useFeedback.recycleHandlerName }} 已于 {{ fmtDateTime(r.useFeedback.recycleCompletedAt) }} 完成回收：{{ r.useFeedback.recycleNote }}</span>
      </div>

      <!-- 临期反馈表单 -->
      <div v-else-if="r.nearExpiry" class="card" style="border: 1px solid var(--c-warn); margin-top: 8px">
        <strong>按约定反馈（是否使用 / 是否剩余 / 是否需要社区回收）</strong>
        <label class="check-row" style="margin-top: 6px">
          <input type="radio" :value="false" v-model="fbForm(r).used" /> 没有使用（整盒/整包仍未开封）
        </label>
        <label class="check-row">
          <input type="radio" :value="true" v-model="fbForm(r).used" /> 已经使用
        </label>
        <label v-if="fbForm(r).used" class="field" style="margin-bottom: 8px">
          <span>实际使用数量（片/件）</span>
          <input v-model.number="fbForm(r).usedCount" type="number" min="1" :max="r.quantity" />
        </label>
        <label class="field" style="margin-bottom: 8px">
          <span>剩余数量（未使用/用剩）</span>
          <input v-model.number="fbForm(r).remaining" type="number" min="0" :max="r.quantity" />
        </label>
        <label class="check-row">
          <input type="checkbox" v-model="fbForm(r).needRecycle" />
          需要社区上门或定点回收剩余物品（临期余量不建议继续放在家中）
        </label>
        <label class="field" style="margin-bottom: 8px">
          <span>备注（可选）</span>
          <textarea v-model="fbForm(r).note" placeholder="如：孩子没烧起来一盒没拆、剩 2 片未独立包装等"></textarea>
        </label>
        <div class="card-actions">
          <button class="btn btn-primary btn-sm" @click="submitFb(r)">提交用后反馈</button>
        </div>
      </div>

      <!-- 非临期：常规闭环提示 -->
      <div v-else class="banner banner-success" style="margin-top: 8px">
        已取走并拍照确认。请与共享人约定的方式闭环：<strong>归还原物（须仍未拆封）</strong>、<strong>补充同规格新品</strong>，或经共享人同意作为邻里赠予。
      </div>

      <!-- 闭环方式（待回收的由工作人员登记回收，本人不能直接关闭） -->
      <template v-if="!r.useFeedback || !r.useFeedback.needRecycle">
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

    <!-- 已闭环（含社区回收） -->
    <template v-else-if="r.status === 'closed_returned'">
      <div v-if="r.closeMode === 'community_recycle'" class="banner banner-success" style="margin-top: 8px">
        ♻️ 剩余临期物品已由社区回收并统一报废处理，感谢配合，物品没有滞留在你家中。
      </div>
    </template>
  </div>
</template>
