<script setup lang="ts">
// 演示用“拍照”组件：真实环境应调用相机/上传接口，这里生成凭证占位名
import { ref } from 'vue'

const emit = defineEmits<{ captured: [photo: string] }>()
const photo = ref('')

function capture() {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  photo.value = `handover-${stamp}.jpg（演示凭证：交接现场照片）`
  emit('captured', photo.value)
}
</script>

<template>
  <div>
    <div class="photo-box" :class="{ 'has-photo': !!photo }" style="margin-bottom: 8px">
      <template v-if="photo">📷 {{ photo }}</template>
      <template v-else>尚未拍照：交接双方需在交接点/门口/送达时拍照留存</template>
    </div>
    <button type="button" class="btn btn-sm" @click="capture">📷 拍照上传交接凭证</button>
  </div>
</template>
