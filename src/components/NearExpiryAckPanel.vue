<script setup lang="ts">
import { computed } from 'vue'
import { NEAR_EXPIRY_CHECKS } from '@/rules'
import { daysUntil, fmtDate } from '@/utils/date'
import type { Item } from '@/types'

const props = defineProps<{ item: Item; now: string }>()

interface AckState {
  expiryConfirmed: boolean
  sealConfirmed: boolean
  appearanceConfirmed: boolean
  withinDateUse: boolean
}
const model = defineModel<AckState>({ required: true })

const days = computed(() => daysUntil(props.item.expiryDate, props.now))

function checkValue(key: string): boolean {
  if (key === 'expiry') return model.value.expiryConfirmed
  if (key === 'seal') return model.value.sealConfirmed
  if (key === 'appearance') return model.value.appearanceConfirmed
  return model.value.withinDateUse
}
function setCheck(key: string, v: boolean) {
  if (key === 'expiry') model.value.expiryConfirmed = v
  else if (key === 'seal') model.value.sealConfirmed = v
  else if (key === 'appearance') model.value.appearanceConfirmed = v
  else model.value.withinDateUse = v
}
</script>

<template>
  <div class="banner banner-danger near-expiry-panel">
    <div class="panel-title">🔖 该物品已进入<strong>临期优先流转期</strong>（剩 {{ days }} 天到期），交接前必须完成以下确认</div>
    <p class="panel-line">
      包装标注到期日：<strong class="expiry-date">{{ fmtDate(item.expiryDate) }}</strong>。到期当日及之后<strong>一律不得使用</strong>；
      交接后系统会在约定时间提醒借用人反馈使用、剩余与回收情况，避免临期物品长期留在个人家中。
    </p>
    <div class="check-list">
      <label v-for="c in NEAR_EXPIRY_CHECKS" :key="c.key" class="check-row">
        <input type="checkbox" :checked="checkValue(c.key)" @change="setCheck(c.key, ($event.target as HTMLInputElement).checked)" />
        <span><strong>{{ c.label }}</strong>：{{ c.detail }}</span>
      </label>
    </div>
    <p class="muted panel-tip">任一项不满足（日期看不清/封签破损/外观异常），请当场拒收并拍照反馈，不要带走。</p>
  </div>
</template>

<style scoped>
.near-expiry-panel {
  margin: 10px 0;
}
.panel-title {
  font-size: 0.95rem;
}
.panel-line {
  margin: 6px 0;
  font-size: 0.9rem;
}
.expiry-date {
  font-size: 1.02rem;
  text-decoration: underline wavy;
}
.check-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}
.panel-tip {
  margin: 8px 0 0;
}
</style>
