<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMedkitStore } from '@/stores/medkit'
import { useFlash } from '@/composables/useFlash'
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  FEEDBACK_TYPE_LABELS,
  isNearExpiry,
  METHOD_LABELS,
  NEAR_EXPIRY_FEEDBACK_HOURS,
  SCENE_HINTS,
  SCENE_LABELS,
  SCENE_PRIORITY_SCOPE,
  STORAGE_LABELS,
  preUseChecks,
} from '@/rules'
import { daysUntil } from '@/utils/date'
import type { FeedbackType, HandoverMethod, Scene } from '@/types'
import SafetyBanner from '@/components/SafetyBanner.vue'
import ExpiryBadge from '@/components/ExpiryBadge.vue'
import ItemStatusBadge from '@/components/ItemStatusBadge.vue'
import TimelineView from '@/components/TimelineView.vue'
import RequestCard from '@/components/RequestCard.vue'

const route = useRoute()
const router = useRouter()
const store = useMedkitStore()
const { show } = useFlash()

const item = computed(() => store.items.find((i) => i.id === route.params.id))
const available = computed(() => (item.value ? store.availableQty(item.value.id) : 0))
const waiting = computed(() => (item.value ? store.waitingList(item.value.id) : []))
const relatedRequests = computed(() => (item.value ? store.itemRequests(item.value.id) : []))
const itemFeedback = computed(() => (item.value ? store.feedbacks.filter((f) => f.itemId === item.value!.id) : []))

// ---- 申请表单 ----
const showApply = ref(false)
const form = reactive<{ quantity: number; scene: Scene; method: HandoverMethod; note: string }>({
  quantity: 1,
  scene: 'child_night_fever',
  method: 'self_pickup',
  note: '',
})
const agreed = reactive({ source: false, expiry: false, package: false, limit: false })
const agreeAll = computed(() => agreed.source && agreed.expiry && agreed.package && agreed.limit)

const expired = computed(() => (item.value ? daysUntil(item.value.expiryDate, store.nowIso) < 0 : false))
const near = computed(() => (item.value ? isNearExpiry(item.value.expiryDate, store.nowIso) : false))
const checks = computed(() => (item.value ? preUseChecks({ category: item.value.category, storage: item.value.storage }) : []))
const blocked = computed(() => !item.value || ['rejected', 'recalled', 'scrapped', 'quarantined', 'pending_review'].includes(item.value.status))

function openApply() {
  if (!item.value) return
  form.quantity = Math.min(1, item.value.quantity) || 1
  form.scene = item.value.sceneTags[0] ?? 'home_care'
  showApply.value = true
}

function submitApply() {
  if (!item.value) return
  if (!agreeAll.value) {
    show('请先逐项确认来源、效期、包装状态与适用限制。', 'err')
    return
  }
  const r = store.apply(item.value.id, form.quantity, form.scene, form.method, form.note || undefined)
  show(r.message, r.ok ? 'ok' : 'err')
  if (r.ok) {
    showApply.value = false
    router.push('/my-borrows')
  }
}

// ---- 反馈 ----
const showFeedback = ref(false)
const fbForm = reactive<{ type: FeedbackType; detail: string }>({ type: 'package_damaged', detail: '' })
function submitFeedback() {
  if (!item.value) return
  const r = store.reportFeedback(item.value.id, fbForm.type, fbForm.detail)
  show(r.message, r.ok ? 'ok' : 'err')
  if (r.ok) {
    showFeedback.value = false
    fbForm.detail = ''
  }
}
</script>

<template>
  <SafetyBanner compact />

  <div v-if="!item" class="card empty">
    物品不存在或已被清理。<RouterLink to="/hall">回到药箱大厅</RouterLink>
  </div>

  <template v-else>
    <button class="btn btn-sm" @click="router.push('/hall')">← 返回大厅</button>

    <div v-if="expired" class="banner banner-danger">
      <strong>该物品已过有效期，禁止借用与交接。</strong>
      系统已提示社区工作人员尽快报废，请选择其他在效期内的物品。
    </div>
    <div v-if="item.status === 'quarantined'" class="banner banner-danger">
      <strong>该物品因风险反馈已被隔离，暂停一切借用与交接。</strong>
      {{ item.closeReason }}
    </div>
    <div v-if="item.status === 'recalled'" class="banner banner-warn">
      <strong>共享人已撤回该物品。</strong>{{ item.closeReason }}
    </div>
    <div v-if="near && !expired" class="banner banner-warn">
      <strong>⏳ 该物品临近效期，按“临期优先流转”处理。</strong>
      请仅在<strong>近期确定会使用</strong>时借用，不要领回囤放；交接时必须逐项核对效期与使用前检查要求并确认留痕，
      取走后请在 <strong>{{ NEAR_EXPIRY_FEEDBACK_HOURS }} 小时</strong>内反馈<strong>是否使用、是否剩余、是否需要社区回收</strong>，
      未使用或用剩的余量由社区回收统一报废，到期后不得继续使用或转赠。
    </div>

    <div class="card">
      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
        <span style="font-size: 1.8rem">{{ CATEGORY_ICONS[item.category] }}</span>
        <h2 style="margin: 0">{{ item.name }}</h2>
        <ItemStatusBadge :status="item.status" />
        <ExpiryBadge :expiry-date="item.expiryDate" :now="store.nowIso" />
      </div>

      <dl class="kv" style="margin-top: 14px">
        <dt>品类</dt><dd>{{ CATEGORY_LABELS[item.category] }}</dd>
        <dt>规格</dt><dd>{{ item.spec }}</dd>
        <dt>有效期</dt><dd>{{ item.expiryDate }}</dd>
        <dt>存放条件</dt><dd>{{ STORAGE_LABELS[item.storage] }}</dd>
        <dt>包装状态</dt><dd>整盒/整包<strong>未开封</strong>（登记人承诺，志愿者已现场/照片核验）</dd>
        <dt>登记数量</dt><dd>{{ item.quantity }}</dd>
        <dt>当前可借</dt>
        <dd>
          <strong :style="{ color: available > 0 ? 'var(--c-primary-dark)' : 'var(--c-warn)' }">{{ available }}</strong>
          <span v-if="waiting.length" class="badge badge-amber" style="margin-left: 8px">{{ waiting.length }} 人候补中</span>
        </dd>
        <dt>来源</dt><dd>邻居 {{ item.ownerName }}（{{ item.review ? `志愿者 ${item.review.reviewerName} 已审核` : '待志愿者审核' }}）</dd>
        <dt>取用地点</dt><dd>{{ item.location }}</dd>
        <dt>适用场景</dt>
        <dd>
          <span v-for="s in item.sceneTags" :key="s" class="badge badge-blue" style="margin: 2px">{{ SCENE_LABELS[s] }}</span>
          <span v-if="!item.sceneTags.length" class="muted">未标注</span>
        </dd>
      </dl>
      <p v-if="item.note" class="muted" style="margin-top: 8px">共享人留言：{{ item.note }}</p>

      <div class="banner banner-info" style="margin-top: 12px">
        <strong>适用限制（借用前必读）</strong>
        仅用于对应场景下的临时辅助：物理降温、浅表小伤口清洁包扎、口罩应急与居家护理耗材周转。
        本物品<strong>不是药品、不能替代药物与医生诊治</strong>；儿童高热不退、老人伤口较深/出血不止/化脓、呼吸困难等情况请立即就医。
      </div>

      <!-- 临期物品：使用前检查要求 + 建议优先推荐范围 -->
      <div v-if="near" class="banner banner-warn" style="margin-top: 12px">
        <strong>使用前检查要求（交接时逐项核对，异常当场拒收并拍照反馈）</strong>
        <ul style="margin: 6px 0; padding-left: 20px">
          <li v-for="(c, i) in checks" :key="i">{{ c }}</li>
        </ul>
        <strong>建议优先推荐范围：</strong>
        <ul style="margin: 6px 0 0; padding-left: 20px">
          <li v-for="s in item.sceneTags" :key="s">{{ SCENE_PRIORITY_SCOPE[s] }}</li>
        </ul>
      </div>

      <div class="card-actions" style="margin-top: 12px">
        <button v-if="!blocked && !expired" class="btn btn-primary" @click="openApply">我要申请借用</button>
        <button class="btn btn-danger btn-sm" @click="showFeedback = true">反馈包装破损 / 疑似不适</button>
      </div>
    </div>

    <!-- 申请弹窗 -->
    <div v-if="showApply" class="card" style="border: 2px solid var(--c-primary)">
      <h3>申请借用「{{ item.name }}」</h3>
      <label class="field">
        <span>使用场景</span>
        <select v-model="form.scene">
          <option v-for="[k, v] in Object.entries(SCENE_LABELS)" :key="k" :value="k">{{ v }}</option>
        </select>
        <span class="hint">{{ SCENE_HINTS[form.scene] }}</span>
      </label>
      <label class="field">
        <span>借用数量（当前可借 {{ available }}）</span>
        <input v-model.number="form.quantity" type="number" min="1" :max="item.quantity" />
      </label>
      <label class="field">
        <span>交接方式</span>
        <select v-model="form.method">
          <option value="self_pickup">{{ METHOD_LABELS.self_pickup }}：自行到 {{ item.location }} 取</option>
          <option value="volunteer_delivery">{{ METHOD_LABELS.volunteer_delivery }}：志愿者按约定时限代送</option>
          <option value="door_contactless">{{ METHOD_LABELS.door_contactless }}：放到约定门口位置</option>
        </select>
      </label>
      <label class="field">
        <span>备注（可选）</span>
        <textarea v-model="form.note" placeholder="例如：老人行动不便、希望今晚 8 点后送达"></textarea>
      </label>

      <div class="banner banner-warn">
        <strong>请逐项确认后再提交（每次借用都必须看到这四项）</strong>
        <label class="check-row"><input type="checkbox" v-model="agreed.source" /> 我已知晓<strong>来源</strong>：{{ item.ownerName }} 共享、志愿者审核，社区只做物品流转，不做担保与诊断。</label>
        <label class="check-row"><input type="checkbox" v-model="agreed.expiry" /> 我已核对<strong>效期</strong>：{{ item.expiryDate }}，临期物品会显著标注，过期不得使用。<template v-if="near">本物品为临期物品，交接时还会逐项确认效期与使用前检查要求并留存确认记录，取走后 {{ NEAR_EXPIRY_FEEDBACK_HOURS }} 小时内反馈使用/剩余/回收需求。</template></label>
        <label class="check-row"><input type="checkbox" v-model="agreed.package" /> 我将在交接时检查<strong>包装状态</strong>：须整盒/整包未开封、封签完好；破损当场拒收并拍照反馈。</label>
        <label class="check-row"><input type="checkbox" v-model="agreed.limit" /> 我了解<strong>适用限制</strong>：仅限临时辅助，不替代就医；如症状加重或使用后不适立即就医并反馈。</label>
      </div>

      <div>
        <button class="btn btn-primary" :disabled="!agreeAll" @click="submitApply">确认无误，提交申请</button>
        <button class="btn" @click="showApply = false">取消</button>
      </div>
    </div>

    <!-- 反馈弹窗 -->
    <div v-if="showFeedback" class="card" style="border: 2px solid var(--c-danger)">
      <h3>问题反馈（包装破损 / 疑似使用后不适）</h3>
      <label class="field">
        <span>问题类型</span>
        <select v-model="fbForm.type">
          <option value="package_damaged">{{ FEEDBACK_TYPE_LABELS.package_damaged }}</option>
          <option value="adverse_reaction">{{ FEEDBACK_TYPE_LABELS.adverse_reaction }}</option>
          <option value="other">{{ FEEDBACK_TYPE_LABELS.other }}</option>
        </select>
      </label>
      <label class="field">
        <span>具体情况</span>
        <textarea v-model="fbForm.detail" placeholder="请描述发现时间、包装/身体反应具体表现、是否保留包装与照片"></textarea>
      </label>
      <div v-if="fbForm.type === 'adverse_reaction'" class="banner banner-danger">
        如出现皮疹、红肿加重、呼吸不畅等情况，请<strong>立即停止使用并就医</strong>，保留物品与包装备查；社区会同步隔离同批次物品。
      </div>
      <button class="btn btn-danger" @click="submitFeedback">提交反馈并隔离该物品</button>
      <button class="btn" @click="showFeedback = false">取消</button>
    </div>

    <!-- 同物品的借用记录 -->
    <h3 class="section-title">🔗 该物品的借用/候补记录（与登记审核串联）</h3>
    <template v-if="relatedRequests.length">
      <RequestCard v-for="r in relatedRequests" :key="r.id" :req="r" :item-name="item.name" />
    </template>
    <div v-else class="empty">暂无借用记录</div>

    <!-- 反馈记录 -->
    <template v-if="itemFeedback.length">
      <h3 class="section-title">⚠️ 风险反馈（{{ itemFeedback.length }}）</h3>
      <div v-for="f in itemFeedback" :key="f.id" class="banner" :class="f.status === 'open' ? 'banner-danger' : 'banner-info'">
        <strong>{{ FEEDBACK_TYPE_LABELS[f.type] }} · {{ f.status === 'open' ? '待工作人员核查' : '已处置' }}</strong>
        {{ f.detail }}<br />
        <span class="muted">{{ f.reporterName }} 报告 · {{ f.handleNote ? `处置：${f.handleNote}` : '' }}</span>
      </div>
    </template>

    <h3 class="section-title">📋 全流程时间线（登记 → 审核 → 借出 → 交接 → 归还/报废 → 反馈）</h3>
    <div class="card">
      <TimelineView :events="store.itemTimeline(item.id)" />
    </div>
  </template>
</template>
