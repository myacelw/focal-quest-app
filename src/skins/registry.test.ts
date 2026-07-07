import { describe, it, expect } from 'vitest'
import { SKINS, getSkin, skinUnlockCost, isSkinUnlocked } from './registry'

describe('skin registry', () => {
  it('has plain, space and shrine', () => {
    expect(SKINS.map((s) => s.id)).toEqual(['plain', 'space', 'shrine'])
  })
  it('getSkin returns the matching skin', () => {
    expect(getSkin('space').name).toBe('太空射击')
  })
  it('getSkin falls back to first (plain) on unknown id', () => {
    expect(getSkin('nope').id).toBe('plain')
  })
})

describe('皮肤积分解锁（门槛派生）', () => {
  it('朴素免费：0 分即解锁', () => {
    expect(skinUnlockCost('plain')).toBe(0)
    expect(isSkinUnlocked('plain', 0)).toBe(true)
  })
  it('太空/神庙需 300 分，边界严格 >=', () => {
    expect(skinUnlockCost('space')).toBe(300)
    expect(skinUnlockCost('shrine')).toBe(300)
    expect(isSkinUnlocked('space', 299)).toBe(false)
    expect(isSkinUnlocked('space', 300)).toBe(true)
    expect(isSkinUnlocked('shrine', 500)).toBe(true)
  })
  it('未知皮肤视为免费解锁（安全兜底）', () => {
    expect(skinUnlockCost('nope')).toBe(0)
    expect(isSkinUnlocked('nope', 0)).toBe(true)
  })
})
