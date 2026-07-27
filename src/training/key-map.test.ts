import { describe, it, expect } from 'vitest'
import { KEY_MAP, dirForKey } from './key-map'

describe('dirForKey', () => {
  it('方向键四向都认（最直观的那套）', () => {
    expect(dirForKey('ArrowUp')).toBe('up')
    expect(dirForKey('ArrowDown')).toBe('down')
    expect(dirForKey('ArrowLeft')).toBe('left')
    expect(dirForKey('ArrowRight')).toBe('right')
  })

  it('三套兜底键都按屏幕按钮顺序（上下左右）映射', () => {
    expect(['1', '2', '3', '4'].map(dirForKey)).toEqual(['up', 'down', 'left', 'right'])
    expect(['a', 's', 'd', 'f'].map(dirForKey)).toEqual(['up', 'down', 'left', 'right'])
    expect(['j', 'k', 'l', ';'].map(dirForKey)).toEqual(['up', 'down', 'left', 'right'])
  })

  it('大写也认（KeyboardEvent.key 受 Shift/CapsLock 影响）', () => {
    expect(dirForKey('A')).toBe('up')
    expect(dirForKey('L')).toBe('left')
  })

  it('不认识的键返回 null，而不是 undefined（调用方靠它决定是否 preventDefault）', () => {
    expect(dirForKey('Enter')).toBeNull()
    expect(dirForKey('z')).toBeNull()
  })

  it('一共 16 个键，四向各 4 个（改表时别把某一向漏掉）', () => {
    expect(Object.keys(KEY_MAP).length).toBe(16)
    for (const d of ['up', 'down', 'left', 'right']) {
      expect(Object.values(KEY_MAP).filter((v) => v === d).length, d).toBe(4)
    }
  })
})
