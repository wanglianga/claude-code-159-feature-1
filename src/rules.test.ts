import { describe, expect, it } from 'vitest'
import { addDays } from '@/utils/date'
import {
  EXPIRY_DANGER_DAYS,
  EXPIRY_WARN_DAYS,
  expiryLevel,
  isNearExpiry,
  preUseChecks,
  validateDraft,
} from '@/rules'
import type { ItemDraft } from '@/types'

const NOW = '2026-09-27T09:00:00'

function baseDraft(over: Partial<ItemDraft> = {}): ItemDraft {
  return {
    name: '医用退热贴',
    category: 'fever_patch',
    spec: '4贴/盒',
    expiryDate: addDays(NOW, 180).slice(0, 10),
    storage: 'cool_dry',
    sealed: true,
    quantity: 2,
    location: '3号楼1单元共享柜',
    sceneTags: ['child_night_fever'],
    ...over,
  }
}

describe('效期分级', () => {
  it('过期 / ≤30天 / ≤60天 / 正常 四级', () => {
    expect(expiryLevel(addDays(NOW, -1).slice(0, 10), NOW)).toBe('expired')
    expect(expiryLevel(addDays(NOW, EXPIRY_DANGER_DAYS).slice(0, 10), NOW)).toBe('danger')
    expect(expiryLevel(addDays(NOW, EXPIRY_DANGER_DAYS + 1).slice(0, 10), NOW)).toBe('warn')
    expect(expiryLevel(addDays(NOW, EXPIRY_WARN_DAYS).slice(0, 10), NOW)).toBe('warn')
    expect(expiryLevel(addDays(NOW, EXPIRY_WARN_DAYS + 1).slice(0, 10), NOW)).toBe('ok')
  })

  it('isNearExpiry：未过期且 ≤30 天', () => {
    expect(isNearExpiry(addDays(NOW, 10).slice(0, 10), NOW)).toBe(true)
    expect(isNearExpiry(addDays(NOW, 30).slice(0, 10), NOW)).toBe(true)
    expect(isNearExpiry(addDays(NOW, 31).slice(0, 10), NOW)).toBe(false)
    expect(isNearExpiry(addDays(NOW, -1).slice(0, 10), NOW)).toBe(false)
  })
})

describe('使用前检查清单', () => {
  it('退热贴包含通用封签/效期检查与品类专项检查', () => {
    const checks = preUseChecks({ category: 'fever_patch', storage: 'cool_dry' })
    expect(checks.some((c) => c.includes('封签完好'))).toBe(true)
    expect(checks.some((c) => c.includes('过期'))).toBe(true)
    expect(checks.some((c) => c.includes('退热贴凝胶'))).toBe(true)
    expect(checks.some((c) => c.includes('阴凉干燥'))).toBe(true)
  })

  it('纱布给出灭菌包装检查', () => {
    const checks = preUseChecks({ category: 'gauze', storage: 'room_temp' })
    expect(checks.some((c) => c.includes('灭菌包装'))).toBe(true)
  })
})

describe('登记校验', () => {
  it('过期物品直接拦截', () => {
    const r = validateDraft(baseDraft({ expiryDate: addDays(NOW, -1).slice(0, 10) }), NOW)
    expect(r.errors.join(' ')).toContain('已过期')
  })

  it('≤30 天临期为警告而非拦截，文案提示优先流转', () => {
    const r = validateDraft(baseDraft({ expiryDate: addDays(NOW, 10).slice(0, 10) }), NOW)
    expect(r.errors).toHaveLength(0)
    expect(r.warnings.join(' ')).toContain('临期')
  })

  it('拆封 / 冷链 / 疑似药品 / 数量异常均拦截', () => {
    expect(validateDraft(baseDraft({ sealed: false }), NOW).errors.join()).toContain('拆封')
    expect(validateDraft(baseDraft({ storage: 'refrigerate' }), NOW).errors.join()).toContain('冷链')
    expect(validateDraft(baseDraft({ name: '布洛芬缓释胶囊' }), NOW).errors.join()).toContain('处方')
    expect(validateDraft(baseDraft({ quantity: 0 }), NOW).errors.join()).toContain('数量')
  })
})
