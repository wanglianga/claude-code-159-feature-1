<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMedkitStore } from '@/stores/medkit'
import { useFlash } from '@/composables/useFlash'
import { CATEGORY_LABELS, SCENE_LABELS, SCENE_HINTS, STORAGE_LABELS, validateDraft } from '@/rules'
import SafetyBanner from '@/components/SafetyBanner.vue'
import type { Category, ItemDraft, Scene } from '@/types'
import { addDays } from '@/utils/date'

const store = useMedkitStore()
const router = useRouter()
const { show } = useFlash()

const today = computed(() => store.nowIso.slice(0, 10))
const maxDate = computed(() => addDays(store.nowIso, 730).slice(0, 10))

const form = reactive<ItemDraft>({
  name: '',
  category: 'fever_patch',
  spec: '',
  expiryDate: '',
  storage: 'room_temp',
  sealed: true,
  quantity: 1,
  location: '',
  sceneTags: [],
  note: '',
})
const submitted = ref(false)

const categories = Object.entries(CATEGORY_LABELS) as [Category, string][]
const scenes = Object.entries(SCENE_LABELS) as [Scene, string][]

const check = computed(() => validateDraft(form, store.nowIso))

function toggleScene(s: Scene) {
  const i = form.sceneTags.indexOf(s)
  if (i >= 0) form.sceneTags.splice(i, 1)
  else form.sceneTags.push(s)
}

function submit() {
  submitted.value = true
  const { errors, warnings } = check.value
  if (errors.length) {
    show(errors.join(' '), 'err')
    return
  }
  const r = store.register(form)
  show(r.message, r.ok ? 'ok' : 'err')
  if (r.ok) {
    if (warnings.length) show(warnings.join(' '), 'ok')
    router.push('/my-shares')
  }
}
</script>

<template>
  <SafetyBanner compact />

  <div class="card">
    <h2 style="margin-bottom: 4px">登记共享物品</h2>
    <div class="muted">
      仅限<strong>整盒/整包未开封</strong>的常备非处方耗材。处方药/口服注射药、拆封、冷链、过期或包装破损物品不能登记；
      效期 ≤30 天的物品审核会重点确认，≤10 天的在架物品会自动进入社区“临期优先流转”。
    </div>

    <label class="field">
      <span>品名</span>
      <input v-model="form.name" type="text" placeholder="如：医用退热贴、碘伏棉片、无菌纱布、一次性医用口罩" />
    </label>

    <label class="field">
      <span>品类</span>
      <select v-model="form.category">
        <option v-for="[k, v] in categories" :key="k" :value="k">{{ v }}</option>
      </select>
      <span v-if="form.category === 'other_consumable'" class="hint">“其他非处方耗材”需志愿者初审 + 社区工作人员复核。</span>
    </label>

    <label class="field">
      <span>规格</span>
      <input v-model="form.spec" type="text" placeholder="如：4贴/盒、20片/盒、50只/盒" />
    </label>

    <div class="form-row">
      <label class="field">
        <span>有效期（包装标注到期日）</span>
        <input v-model="form.expiryDate" type="date" :min="today" :max="maxDate" />
      </label>
      <label class="field">
        <span>可借数量</span>
        <input v-model.number="form.quantity" type="number" min="1" max="999" />
      </label>
    </div>

    <label class="field">
      <span>存放条件</span>
      <select v-model="form.storage">
        <option value="room_temp">{{ STORAGE_LABELS.room_temp }}</option>
        <option value="cool_dry">{{ STORAGE_LABELS.cool_dry }}</option>
        <option value="refrigerate">{{ STORAGE_LABELS.refrigerate }}（冷链禁入）</option>
      </select>
    </label>

    <label class="check-row">
      <input type="checkbox" v-model="form.sealed" />
      <span>我确认该物品<strong>整盒/整包未开封、封签完好</strong>，愿意接受志愿者现场或照片核验。</span>
    </label>

    <label class="field">
      <span>取用地点</span>
      <input v-model="form.location" type="text" placeholder="如：3号楼1单元一楼“邻里药箱”共享柜 A格" />
    </label>

    <div class="field">
      <span>适用场景（可多选，便于邻居按场景检索）</span>
      <label v-for="[k, v] in scenes" :key="k" class="check-row">
        <input type="checkbox" :checked="form.sceneTags.includes(k)" @change="toggleScene(k)" />
        <span>{{ v }}<span class="muted"> —— {{ SCENE_HINTS[k] }}</span></span>
      </label>
    </div>

    <label class="field">
      <span>给邻居的留言（可选）</span>
      <textarea v-model="form.note" placeholder="如：家里备多了，未拆封，夜间急用可先取。"></textarea>
    </label>

    <!-- 实时规则校验提示 -->
    <template v-if="submitted || form.name || form.spec || form.expiryDate">
      <div v-for="(e, i) in check.errors" :key="`e${i}`" class="banner banner-danger">⛔ {{ e }}</div>
      <div v-for="(w, i) in check.warnings" :key="`w${i}`" class="banner banner-warn">⚠️ {{ w }}</div>
    </template>

    <div class="card-actions">
      <button class="btn btn-primary" @click="submit">提交登记，等待审核</button>
      <button class="btn" @click="router.push('/hall')">取消</button>
    </div>
  </div>
</template>

<style scoped>
.form-row {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.form-row .field {
  flex: 1;
  min-width: 200px;
}
</style>
