<script setup lang="ts">
import { ITEM_STATUS_LABELS } from '@/rules'
import type { ItemStatus } from '@/types'

const props = defineProps<{ status: ItemStatus }>()

const cls: Record<ItemStatus, string> = {
  pending_review: 'badge-amber',
  rejected: 'badge-red',
  published: 'badge-green',
  partially_lent: 'badge-blue',
  lent_out: 'badge-gray',
  quarantined: 'badge-red',
  recalled: 'badge-gray',
  scrapped: 'badge-gray',
}
</script>

<template>
  <span class="badge" :class="cls[props.status]">{{ ITEM_STATUS_LABELS[props.status] }}</span>
</template>
