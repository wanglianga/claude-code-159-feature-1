import { reactive } from 'vue'

// 全局轻提示（动作结果反馈）
const flashState = reactive<{ visible: boolean; message: string; type: 'ok' | 'err' }>({
  visible: false,
  message: '',
  type: 'ok',
})

let timer: ReturnType<typeof setTimeout> | undefined

export function useFlash() {
  function show(message: string, type: 'ok' | 'err' = 'ok', duration = 4200) {
    flashState.message = message
    flashState.type = type
    flashState.visible = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      flashState.visible = false
    }, duration)
  }
  function close() {
    flashState.visible = false
  }
  return { flashState, show, close }
}
