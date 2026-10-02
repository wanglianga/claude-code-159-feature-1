<script setup lang="ts">
import { computed } from 'vue'
import { EXPIRY_DANGER_DAYS, EXPIRY_PRIORITY_DAYS, expiryLevel } from '@/rules'
import { daysUntil, fmtDate } from '@/utils/date'

const props = defineProps<{ expiryDate: string; now: string }>()

const level = computed(() => expiryLevel(props.expiryDate, props.now))
const days = computed(() => daysUntil(props.expiryDate, props.now))
const cls = computed(
  () => ({ expired: 'badge-red', priority: 'badge-red', danger: 'badge-red', warn: 'badge-amber', ok: 'badge-green' })[level.value],
)
const text = computed(() => {
  if (level.value === 'expired') return `已过期（${fmtDate(props.expiryDate)}）`
  if (level.value === 'priority') return `临期优先流转，剩 ${days.value} 天`
  if (days.value <= EXPIRY_DANGER_DAYS) return `临近效期，剩 ${days.value} 天`
  if (level.value === 'warn') return `效期不足60天，剩 ${days.value} 天`
  return `有效期至 ${fmtDate(props.expiryDate)}`
})
const title = computed(() => (level.value === 'priority' ? `距到期 ${days.value} 天（≤${EXPIRY_PRIORITY_DAYS} 天临期优先流转线），到期日前使用` : `有效期 ${props.expiryDate}`))
</script>

<template>
  <span class="badge" :class="[cls, { 'badge-priority': level === 'priority' }]" :title="title">{{ text }}</span>
</template>

<style scoped>
.badge-priority {
  animation: priority-pulse 1.6s ease-in-out infinite;
}
@keyframes priority-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(185, 28, 28, 0.35);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(185, 28, 28, 0);
  }
}
</style>
