<script setup lang="ts">
import type { BorrowRequest } from '@/types'
import { METHOD_LABELS, SCENE_LABELS } from '@/rules'
import { fmtDateTime } from '@/utils/date'
import RequestStatusBadge from './RequestStatusBadge.vue'

defineProps<{ req: BorrowRequest; itemName: string }>()
</script>

<template>
  <div class="request-row">
    <div class="row-head">
      <strong>{{ itemName }} × {{ req.quantity }}</strong>
      <RequestStatusBadge :status="req.status" />
    </div>
    <div class="muted" style="margin: 4px 0">
      场景：{{ SCENE_LABELS[req.scene] }} · 交接方式：{{ METHOD_LABELS[req.method] }}
      <template v-if="req.volunteerName"> · 配送志愿者：{{ req.volunteerName }}</template>
      <template v-if="req.nearExpiry"> · <span class="badge badge-red">临期流转</span></template>
    </div>
    <div class="muted">申请时间：{{ fmtDateTime(req.createdAt) }}</div>
    <div v-if="req.note" class="muted">备注：{{ req.note }}</div>
    <div v-if="req.nearExpiry && req.expiryAckAt" class="banner banner-info" style="margin-top: 8px">
      🗓️ 借用人已于 {{ fmtDateTime(req.expiryAckAt) }} 确认效期（有效期至 {{ req.expiryAckDate }}）与使用前检查要求；
      约定反馈截止：{{ req.feedbackDueAt ? fmtDateTime(req.feedbackDueAt) : '—' }}（反馈是否使用、是否剩余、是否需要社区回收）。
    </div>
    <div v-if="req.delayReason" class="banner banner-warn" style="margin-top: 8px">配送延误：{{ req.delayReason }}</div>
    <div v-if="req.cancelReason" class="banner banner-warn" style="margin-top: 8px">{{ req.cancelReason }}</div>
    <div v-if="req.status === 'completed' && req.handoverPhoto" class="banner banner-info" style="margin-top: 8px">
      📷 交接凭证：{{ req.handoverPhoto }}
      <span v-if="req.handoverNote">（{{ req.handoverNote }}）</span>
    </div>
    <div v-if="req.status === 'closed_returned'" class="banner banner-success" style="margin-top: 8px">
      已闭环：{{ req.closeMode === 'restock_new' ? '补充同规格新品' : req.closeMode === 'mutual_aid' ? '邻里赠予，无需归还' : req.closeMode === 'community_recycle' ? '社区回收剩余物品并统一报废' : '已归还原物（未拆封）' }}
      <span v-if="req.closeNote">（{{ req.closeNote }}）</span>
    </div>
  </div>
</template>
