<script setup lang="ts">
// 全站安全边界横幅：共享物品不替代就医；禁入品类说明
withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  { compact: false },
)
</script>

<template>
  <div class="banner banner-danger" role="note">
    <div class="banner-row">
      <span>⚠️</span>
      <div>
        <strong>共享药箱只做邻里物品周转，不替代就医、不提供诊断与用药建议</strong>
        <template v-if="!compact">
          处方药、已拆封药品、冷链/冷藏药品、过期或包装破损物品<strong>一律不能进入共享</strong>；
          症状加重、持续高热、出血不止或使用后不适，请立即就医并拨打 120。
          <RouterLink to="/guide">查看互助边界与规则 →</RouterLink>
        </template>
        <template v-else>
          处方药 / 拆封药品 / 冷链药品 / 过期物品禁入共享；不替代就医。
          <RouterLink to="/guide">规则</RouterLink>
        </template>
      </div>
    </div>
  </div>
</template>
