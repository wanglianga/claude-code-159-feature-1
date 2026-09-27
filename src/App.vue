<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useMedkitStore } from '@/stores/medkit'
import { useFlash } from '@/composables/useFlash'
import { fmtDateTime } from '@/utils/date'

const store = useMedkitStore()
const route = useRoute()
const { flashState, close } = useFlash()

const roleTag = computed(() => ({ resident: '居民', volunteer: '志愿者', staff: '社区工作人员' }[store.currentUser.role]))

function advance(h: number) {
  store.advanceHours(h)
}
</script>

<template>
  <header class="app-header">
    <div class="container">
      <div class="logo">
        🧰 邻里药箱<small>共享借用 · 效期提醒 · 邻里互助（演示）</small>
      </div>
      <nav class="nav-links">
        <RouterLink to="/hall">药箱大厅</RouterLink>
        <RouterLink to="/register">登记共享</RouterLink>
        <RouterLink to="/my-shares">我的共享</RouterLink>
        <RouterLink to="/my-borrows">我的借用</RouterLink>
        <RouterLink v-if="store.isVolunteer" to="/volunteer">志愿者工作台</RouterLink>
        <RouterLink v-if="store.isStaff" to="/staff">社区工作台</RouterLink>
        <RouterLink to="/guide">互助边界</RouterLink>
      </nav>
      <div class="header-spacer"></div>
      <div class="session-box">
        <span>当前身份</span>
        <select :value="store.currentUserId" @change="store.switchUser(($event.target as HTMLSelectElement).value)">
          <option v-for="u in store.users" :key="u.id" :value="u.id">{{ u.name }}</option>
        </select>
        <span class="badge badge-amber">{{ roleTag }}</span>
      </div>
    </div>
  </header>

  <main class="container">
    <RouterView v-slot="{ Component }">
      <component :is="Component" :key="route.fullPath" />
    </RouterView>
  </main>

  <footer class="footer-bar">
    <div class="container">
      <div>
        演示时钟：<strong>{{ fmtDateTime(store.nowIso) }}</strong>
        <span class="muted" style="margin-left: 8px">快进用于演示效期临近、超时未取、配送延误</span>
      </div>
      <div>
        <button class="btn btn-sm" @click="advance(6)">+6小时</button>
        <button class="btn btn-sm" @click="advance(24)">+1天</button>
        <button class="btn btn-sm" @click="advance(72)">+3天</button>
        <button class="btn btn-sm" @click="advance(720)">+30天</button>
        <button class="btn btn-sm btn-warn" @click="store.resetDemo()">重置演示数据</button>
      </div>
    </div>
  </footer>

  <Transition>
    <div v-if="flashState.visible" class="flash">
      <div class="banner" :class="flashState.type === 'ok' ? 'banner-success' : 'banner-danger'" style="margin: 0">
        <div class="banner-row">
          <span>{{ flashState.type === 'ok' ? '✅' : '⚠️' }}</span>
          <div style="flex: 1">{{ flashState.message }}</div>
          <button class="btn btn-sm" @click="close">知道了</button>
        </div>
      </div>
    </div>
  </Transition>
</template>
