import { describe, it, expect } from 'vitest'
import { SKINS, getSkin, skinUnlockCost, isSkinUnlocked, newlyUnlockedSkins } from './registry'

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
  it('太空 1000 / 神庙 2500 分档，边界严格 >=', () => {
    expect(skinUnlockCost('space')).toBe(1000)
    expect(skinUnlockCost('shrine')).toBe(2500)
    expect(isSkinUnlocked('space', 999)).toBe(false)
    expect(isSkinUnlocked('space', 1000)).toBe(true)
    expect(isSkinUnlocked('shrine', 2499)).toBe(false)
    expect(isSkinUnlocked('shrine', 2500)).toBe(true)
    // 分档：到 1000 只解锁太空，神庙仍锁
    expect(isSkinUnlocked('shrine', 1000)).toBe(false)
  })
  it('未知皮肤视为免费解锁（安全兜底）', () => {
    expect(skinUnlockCost('nope')).toBe(0)
    expect(isSkinUnlocked('nope', 0)).toBe(true)
  })
})

describe('newlyUnlockedSkins — 本次打卡跨门槛新解锁', () => {
  it('999→1000 只解锁太空（分档，不再一起解锁）', () => {
    expect(newlyUnlockedSkins(999, 1000).map((s) => s.id)).toEqual(['space'])
  })
  it('2499→2500 只解锁神庙', () => {
    expect(newlyUnlockedSkins(2499, 2500).map((s) => s.id)).toEqual(['shrine'])
  })
  it('一次大涨跨过两档：太空+神庙都新解锁', () => {
    expect(newlyUnlockedSkins(0, 3000).map((s) => s.id)).toEqual(['space', 'shrine'])
  })
  it('已在门槛之上再涨分，不重复解锁', () => {
    expect(newlyUnlockedSkins(1000, 1200)).toEqual([])
  })
  it('免费的朴素(0分)不算“新解锁”', () => {
    expect(newlyUnlockedSkins(0, 0)).toEqual([])
  })
})
