<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMedkitStore } from '@/stores/medkit'
import { useFlash } from '@/composables/useFlash'
import { CATEGORY_LABELS, SCENE_LABELS, STORAGE_LABELS, validateDraft } from '@/rules'
import { fmtDate } from '@/utils/date'
import type { Category, Scene, StorageCondition } from '@/types'
import SafetyBanner from '@/components/SafetyBanner.vue'

const store = useMedkitStore()
const router = useRouter()
const { show } = useFlash()

const form = reactive({
  name: '',
  category: 'fever_patch' as Category,
  spec: '',
  expiryDate: '',
  storage: 'room_temp' as StorageCondition,
  sealed: true,
  quantity: 1,
  location: '',
  sceneTags: [] as Scene[],
  note: '',
})
const submitted = ref(false)

const today = computed(() => fmtDate(store.nowIso))
const validation = computed(() => validateDraft({ ...form }, store.nowIso))

function toggleScene(s: Scene) {
  const idx = form.sceneTags.indexOf(s)
  if (idx >= 0) form.sceneTags.splice(idx, 1)
  else form.sceneTags.push(s)
}

function submit() {
  submitted.value = true
  if (validation.value.errors.length) {
    show(validation.value.errors[0], 'err')
    return
  }
  const r = store.register({ ...form })
  show(r.message, r.ok ? 'ok' : 'err')
  if (r.ok) router.push('/my-shares')
}
</script>

<template>
  <SafetyBanner compact />

  <div class="card">
    <h2 style="margin-bottom: 4px">登记共享物品</h2>
    <div class="muted">
      仅限<strong>整盒/整包未拆封</strong>的常备非处方耗材（退热贴、碘伏、纱布、创可贴、口罩、体温计电池等）。
      处方药、口服/注射药、拆封品、冷链品、过期或包装破损物品不能登记。
    </div>

    <label class="field" style="margin-top: 14px">
      <span>品名</span>
      <input v-model="form.name" type="text" placeholder="如：医用退热贴" />
    </label>
    <label class="field">
      <span>品类</span>
      <select v-model="form.category">
        <option v-for="[k, v] in Object.entries(CATEGORY_LABELS)" :key="k" :value="k">{{ v }}</option>
      </select>
    </label>
    <label class="field">
      <span>规格</span>
      <input v-model="form.spec" type="text" placeholder="如：4贴/盒、50只/盒" />
    </label>
    <label class="field">
      <span>有效期（最后使用日期）</span>
      <input v-model="form.expiryDate" type="date" :min="today" />
    </label>
    <label class="field">
      <span>存放条件</span>
      <select v-model="form.storage">
        <option value="room_temp">{{ STORAGE_LABELS.room_temp }}</option>
        <option value="cool_dry">{{ STORAGE_LABELS.cool_dry }}</option>
        <option value="refrigerate">{{ STORAGE_LABELS.refrigerate }}（冷链物品禁入共享）</option>
      </select>
    </label>
    <label class="check-row">
      <input v-model="form.sealed" type="checkbox" />
      我确认该物品<strong>整盒/整包未开封</strong>，封签完好
    </label>
    <label class="field">
      <span>可借数量</span>
      <input v-model.number="form.quantity" type="number" min="1" max="999" />
    </label>
    <label class="field">
      <span>取用地点</span>
      <input v-model="form.location" type="text" placeholder="如：3号楼1单元一楼共享柜 A格" />
    </label>
    <div class="field">
      <span>适用场景（可多选）</span>
      <label v-for="[k, v] in Object.entries(SCENE_LABELS)" :key="k" class="check-row">
        <input type="checkbox" :checked="form.sceneTags.includes(k as Scene)" @change="toggleScene(k as Scene)" />
        {{ v }}
      </label>
    </div>
    <label class="field">
      <span>给邻居的留言（可选）</span>
      <textarea v-model="form.note" placeholder="如：家里备多了，未拆封，夜间急用可先取"></textarea>
    </label>

    <template v-if="submitted || form.expiryDate">
      <div v-for="(e, i) in validation.errors" :key="`e${i}`" class="banner banner-danger">⛔ {{ e }}</div>
    </template>
    <template v-if="form.expiryDate">
      <div v-for="(w, i) in validation.warnings" :key="`w${i}`" class="banner banner-warn">⚠️ {{ w }}</div>
    </template>

    <div class="card-actions">
      <button class="btn btn-primary" @click="submit">提交登记，等待审核</button>
      <button class="btn" @click="router.push('/hall')">取消</button>
    </div>
  </div>
</template>
