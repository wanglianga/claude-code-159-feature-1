<script setup lang="ts">
import { computed } from 'vue'
import { EXPIRY_DANGER_DAYS, expiryLevel } from '@/rules'
import { daysUntil, fmtDate } from '@/utils/date'

const props = defineProps<{ expiryDate: string; now: string }>()

const level = computed(() => expiryLevel(props.expiryDate, props.now))
const days = computed(() => daysUntil(props.expiryDate, props.now))
const cls = computed(() => ({ expired: 'badge-red', danger: 'badge-red', warn: 'badge-amber', ok: 'badge-green' }[level.value]))
const text = computed(() => {
  if (level.value === 'expired') return `已过期（${fmtDate(props.expiryDate)}）`
  if (days.value <= EXPIRY_DANGER_DAYS) return `临近效期，剩 ${days.value} 天`
  if (level.value === 'warn') return `效期不足60天，剩 ${days.value} 天`
  return `有效期至 ${fmtDate(props.expiryDate)}`
})
</script>

<template>
  <span class="badge" :class="cls" :title="`有效期 ${expiryDate}`">{{ text }}</span>
</template>
