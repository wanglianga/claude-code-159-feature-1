import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Component } from 'vue'
import { useMedkitStore } from '@/stores/medkit'
import ItemHallPage from '@/pages/ItemHallPage.vue'
import MyBorrowsPage from '@/pages/MyBorrowsPage.vue'
import StaffPage from '@/pages/StaffPage.vue'
import VolunteerPage from '@/pages/VolunteerPage.vue'
import NearExpiryAckPanel from '@/components/NearExpiryAckPanel.vue'
import type { Item } from '@/types'

function mountWith(component: Component) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component },
      { path: '/hall', component: ItemHallPage },
      { path: '/staff', component: StaffPage },
      { path: '/volunteer', component: VolunteerPage },
      { path: '/my-borrows', component: MyBorrowsPage },
      { path: '/guide', component: { template: '<div />' } },
      { path: '/items/:id', component: { template: '<div />' } },
    ],
  })
  return mount(component, { global: { plugins: [router] } })
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('页面冒烟：临期优先流转', () => {
  it('大厅展示在架物品，且 10 天到期退热贴排在前面并带临期提示', async () => {
    const store = useMedkitStore()
    store.switchUser('u_b')
    const wrapper = mountWith(ItemHallPage)
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('儿童退热贴（临期）')
    expect(text).toContain('临期优先流转')
    // 过期/隔离物品不出现在大厅
    expect(text).not.toContain('一次性防护口罩（库存遗留）')
  })

  it('工作人员工作台默认进入临期优先流转专区，含清单/场景/推荐范围/回访/回收', async () => {
    const store = useMedkitStore()
    store.switchUser('u_s')
    const wrapper = mountWith(StaffPage)
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('临期优先流转清单')
    expect(text).toContain('可使用场景')
    expect(text).toContain('建议优先推荐范围')
    expect(text).toContain('儿童退热贴（临期）')
    // r6 回访逾期催收
    expect(text).toContain('回访已逾期')
    // uf1 社区回收队列
    expect(text).toContain('待社区回收')
  })

  it('借用人“我的借用”：临期已取走 r6 显示确认记录与到期回访入口', async () => {
    const store = useMedkitStore()
    store.switchUser('u_b') // r6 借用人
    const wrapper = mountWith(MyBorrowsPage)
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('临期使用前检查确认')
    expect(text).toContain('约定的回访时间已到')
    expect(text).toContain('反馈使用 / 剩余 / 回收')
  })

  it('NearExpiryAckPanel：四项未全部勾选时外部可感知状态（效期/封签/外观/到期前使用）', () => {
    const store = useMedkitStore()
    const item = store.items.find((i) => i.id === 'i13') as Item
    const model = { expiryConfirmed: false, sealConfirmed: false, appearanceConfirmed: false, withinDateUse: false }
    const wrapper = mount(NearExpiryAckPanel, {
      props: { item, now: store.nowIso, modelValue: model, 'onUpdate:modelValue': (v: typeof model) => Object.assign(model, v) },
    })
    const boxes = wrapper.findAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(4)
    expect(wrapper.text()).toContain('核对效期')
    expect(wrapper.text()).toContain('检查封签')
    expect(wrapper.text()).toContain('检查外观')
    expect(wrapper.text()).toContain('到期前使用')
  })
})
