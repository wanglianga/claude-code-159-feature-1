import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import type { Component } from 'vue'
import { useMedkitStore } from '@/stores/medkit'
import ItemHallPage from '@/pages/ItemHallPage.vue'
import ItemDetailPage from '@/pages/ItemDetailPage.vue'
import RegisterItemPage from '@/pages/RegisterItemPage.vue'
import MyBorrowsPage from '@/pages/MyBorrowsPage.vue'
import MySharesPage from '@/pages/MySharesPage.vue'
import VolunteerPage from '@/pages/VolunteerPage.vue'
import StaffPage from '@/pages/StaffPage.vue'
import GuidePage from '@/pages/GuidePage.vue'

const routes = [
  { path: '/hall', component: ItemHallPage },
  { path: '/items/:id', component: ItemDetailPage },
  { path: '/my-borrows', component: MyBorrowsPage },
  { path: '/my-shares', component: MySharesPage },
  { path: '/volunteer', component: VolunteerPage },
  { path: '/staff', component: StaffPage },
  { path: '/guide', component: GuidePage },
]

async function mountPage(page: Component, path: string, userId?: string) {
  const pinia: Pinia = createPinia()
  setActivePinia(pinia)
  if (userId) useMedkitStore().switchUser(userId)
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.push(path)
  await router.isReady()
  const wrapper = mount(page, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, store: useMedkitStore() }
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('页面冒烟', () => {
  it('大厅：安全横幅、过期物品隐藏、临期物品优先流转提示', async () => {
    const { wrapper } = await mountPage(ItemHallPage, '/hall')
    const html = wrapper.html()
    expect(html).toContain('不替代就医')
    expect(html).not.toContain('库存遗留') // 过期口罩 i12 隐藏
    expect(html).toContain('儿童退热贴（临期分享）') // i13
    expect(html).toContain('临期优先流转')
  })

  it('登记页：疑似药品提交即拦截', async () => {
    const { wrapper } = await mountPage(RegisterItemPage, '/hall', 'u_a')
    const inputs = wrapper.findAll('input[type="text"]')
    ;(inputs[0].element as HTMLInputElement).value = '布洛芬胶囊'
    await inputs[0].trigger('input')
    await wrapper.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(wrapper.html()).toContain('处方')
  })

  it('物品详情：临期物品显示使用前检查与优先推荐范围', async () => {
    const { wrapper } = await mountPage(ItemDetailPage, '/items/i13')
    const html = wrapper.html()
    expect(html).toContain('使用前检查要求')
    expect(html).toContain('优先推荐')
    expect(html).toContain('发热儿童')
  })

  it('我的借用：周敏可见 r6 临期追踪与反馈表单', async () => {
    const { wrapper } = await mountPage(MyBorrowsPage, '/my-borrows', 'u_c')
    const html = wrapper.html()
    expect(html).toContain('临期物品用后追踪')
    expect(html).toContain('需要社区上门或定点回收')
  })

  it('我的借用：李建国可见 r7 已反馈待社区回收状态', async () => {
    const { wrapper } = await mountPage(MyBorrowsPage, '/my-borrows', 'u_b')
    expect(wrapper.html()).toContain('等待社区联系回收')
  })

  it('我的共享：王秀兰看到临期优先流转说明', async () => {
    const { wrapper } = await mountPage(MySharesPage, '/my-shares', 'u_a')
    const html = wrapper.html()
    expect(html).toContain('临期优先流转')
    expect(html).toContain('儿童退热贴（临期分享）')
  })

  it('志愿者页可加载，审核队列含临期碘伏', async () => {
    const { wrapper } = await mountPage(VolunteerPage, '/volunteer', 'u_v')
    expect(wrapper.html()).toContain('碘伏消毒液')
  })

  it('工作人员页：默认展示临期优先流转清单与借出追踪', async () => {
    const { wrapper } = await mountPage(StaffPage, '/staff', 'u_s')
    const html = wrapper.html()
    expect(html).toContain('临期优先流转')
    expect(html).toContain('儿童退热贴（临期分享）')
    expect(html).toContain('建议优先推荐范围')
    expect(html).toContain('周敏') // r6 逾期未反馈借用人
    expect(html).toContain('待社区回收') // r7
  })

  it('互助边界页包含临期交接与用后追踪规则', async () => {
    const { wrapper } = await mountPage(GuidePage, '/guide')
    const html = wrapper.html()
    expect(html).toContain('临期优先流转')
    expect(html).toContain('使用前检查')
    expect(html).toContain('社区回收')
  })
})
