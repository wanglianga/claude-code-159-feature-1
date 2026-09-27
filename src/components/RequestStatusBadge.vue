<script setup lang="ts">
import { REQUEST_STATUS_LABELS } from '@/rules'
import type { RequestStatus } from '@/types'

const props = defineProps<{ status: RequestStatus }>()

const cls: Record<RequestStatus, string> = {
  waiting: 'badge-amber',
  confirmed: 'badge-blue',
  handing: 'badge-purple',
  completed: 'badge-green',
  closed_returned: 'badge-gray',
  cancelled: 'badge-gray',
}
</script>

<template>
  <span class="badge" :class="cls[props.status]">{{ REQUEST_STATUS_LABELS[props.status] }}</span>
</template>
