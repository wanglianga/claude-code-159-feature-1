import { describe, expect, it } from 'vitest'
import {
  EXPIRY_DANGER_DAYS,
  EXPIRY_PRIORITY_DAYS,
  EXPIRY_WARN_DAYS,
  expiryLevel,
  isNearExpiry,
  validateDraft,
} from '@/rules'
import { addDays } from '@/utils/date'
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
  it('按自然日划分 expired/priority/danger/warn/ok 五档', () => {
    expect(expiryLevel(addDays(NOW, -1).slice(0, 10), NOW)).toBe('expired')
    expect(expiryLevel(addDays(NOW, EXPIRY_PRIORITY_DAYS).slice(0, 10), NOW)).toBe('priority')
    expect(expiryLevel(addDays(NOW, EXPIRY_PRIORITY_DAYS + 1).slice(0, 10), NOW)).toBe('danger')
    expect(expiryLevel(addDays(NOW, EXPIRY_DANGER_DAYS).slice(0, 10), NOW)).toBe('danger')
    expect(expiryLevel(addDays(NOW, EXPIRY_WARN_DAYS).slice(0, 10), NOW)).toBe('warn')
    expect(expiryLevel(addDays(NOW, EXPIRY_WARN_DAYS + 1).slice(0, 10), NOW)).toBe('ok')
  })

  it('isNearExpiry 仅在 0~10 天区间为真', () => {
    expect(isNearExpiry(addDays(NOW, 0).slice(0, 10), NOW)).toBe(true)
    expect(isNearExpiry(addDays(NOW, 10).slice(0, 10), NOW)).toBe(true)
    expect(isNearExpiry(addDays(NOW, 11).slice(0, 10), NOW)).toBe(false)
    expect(isNearExpiry(addDays(NOW, -1).slice(0, 10), NOW)).toBe(false)
  })
})

describe('登记校验 validateDraft', () => {
  it('合格未拆封物品无错误', () => {
    const { errors } = validateDraft(baseDraft(), NOW)
    expect(errors).toHaveLength(0)
  })

  it('过期物品禁入', () => {
    const { errors } = validateDraft(baseDraft({ expiryDate: addDays(NOW, -2).slice(0, 10) }), NOW)
    expect(errors.join(' ')).toContain('已过期')
  })

  it('拆封物品禁入', () => {
    const { errors } = validateDraft(baseDraft({ sealed: false }), NOW)
    expect(errors.join(' ')).toContain('拆封')
  })

  it('冷链物品禁入', () => {
    const { errors } = validateDraft(baseDraft({ storage: 'refrigerate' }), NOW)
    expect(errors.join(' ')).toContain('冷链')
  })

  it('处方药/口服药关键词禁入', () => {
    for (const name of ['布洛芬缓释胶囊', '阿莫西林颗粒', '头孢注射液', '退烧药']) {
      const { errors } = validateDraft(baseDraft({ name }), NOW)
      expect(errors.length, name).toBeGreaterThan(0)
    }
  })

  it('数量非法拦截', () => {
    expect(validateDraft(baseDraft({ quantity: 0 }), NOW).errors.join(' ')).toContain('数量')
    expect(validateDraft(baseDraft({ quantity: 10000 }), NOW).errors.join(' ')).toContain('数量异常')
  })

  it('≤10 天登记给出临期优先流转警示文案', () => {
    const w = validateDraft(baseDraft({ expiryDate: addDays(NOW, 10).slice(0, 10) }), NOW).warnings.join(' ')
    expect(w).toContain('临期优先流转')
  })
})
