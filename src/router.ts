import { createRouter, createWebHashHistory } from 'vue-router'
import { useMedkitStore } from '@/stores/medkit'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/hall' },
    { path: '/hall', name: 'hall', component: () => import('@/pages/ItemHallPage.vue'), meta: { title: '邻里药箱' } },
    { path: '/items/:id', name: 'item-detail', component: () => import('@/pages/ItemDetailPage.vue'), meta: { title: '物品详情' } },
    { path: '/register', name: 'register', component: () => import('@/pages/RegisterItemPage.vue'), meta: { title: '登记共享物品' } },
    { path: '/my-shares', name: 'my-shares', component: () => import('@/pages/MySharesPage.vue'), meta: { title: '我的共享' } },
    { path: '/my-borrows', name: 'my-borrows', component: () => import('@/pages/MyBorrowsPage.vue'), meta: { title: '我的借用' } },
    { path: '/volunteer', name: 'volunteer', component: () => import('@/pages/VolunteerPage.vue'), meta: { title: '志愿者工作台', roles: ['volunteer', 'staff'] } },
    { path: '/staff', name: 'staff', component: () => import('@/pages/StaffPage.vue'), meta: { title: '社区工作台', roles: ['staff'] } },
    { path: '/guide', name: 'guide', component: () => import('@/pages/GuidePage.vue'), meta: { title: '互助边界与规则' } },
    { path: '/:pathMatch(.*)*', redirect: '/hall' },
  ],
})

// 角色越权访问时回到大厅（视图重点按角色区分：居民/志愿者/工作人员）
router.beforeEach((to) => {
  const roles = to.meta.roles as string[] | undefined
  if (!roles) return true
  const store = useMedkitStore()
  return roles.includes(store.currentUser.role) ? true : { name: 'hall' }
})
