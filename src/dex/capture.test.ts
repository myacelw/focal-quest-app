import { describe, it, expect } from 'vitest'
import {
  pickCapture, shouldDailyCapture, canEggCapture, DAILY_EGG_CAPTURE_MAX,
} from './capture'
import { MONSTER_DEFS, monstersOfWorld } from './monster-defs'

describe('pickCapture', () => {
  it('全集已拥有时返回 null', () => {
    const allIds = MONSTER_DEFS.map((m) => m.id)
    expect(pickCapture(allIds, 'daily', 0.5)).toBeNull()
    expect(pickCapture(allIds, 'egg', 0.99)).toBeNull()
  })

  it('不重复：从未拥有的怪兽里抽', () => {
    const owned = MONSTER_DEFS.slice(0, 20).map((m) => m.id)
    for (let i = 0; i < 50; i++) {
      const picked = pickCapture(owned, 'daily', i / 50)
      expect(picked).not.toBeNull()
      expect(owned).not.toContain(picked!.id)
    }
  })

  it('保底源：rand=0 抽到普通池（daily 权重 70% 最大）', () => {
    const picked = pickCapture([], 'daily', 0)
    expect(picked?.rarity).toBe('common')
  })

  it('保底源：rand 接近 1 抽到普通池尾部（daily 权重全部在 common）', () => {
    // daily 总权重 100，common 70 → common 覆盖 [0, 70)
    const picked = pickCapture([], 'daily', 0.69)
    expect(picked?.rarity).toBe('common')
  })

  it('保底源：rand=0.99 抽到史诗池（epic 权重 5）', () => {
    // [70+25, 100) = epic
    const picked = pickCapture([], 'daily', 0.99)
    expect(picked?.rarity).toBe('epic')
  })

  it('彩蛋源：rand=0.29 抽到普通（egg common 30）', () => {
    const picked = pickCapture([], 'egg', 0.29)
    expect(picked?.rarity).toBe('common')
  })

  it('彩蛋源：rand=0.3 抽到稀有（egg rare 45，覆盖 [30, 75)）', () => {
    const picked = pickCapture([], 'egg', 0.5)
    expect(picked?.rarity).toBe('rare')
  })

  it('彩蛋源：rand=0.99 抽到史诗（egg epic 25，覆盖 [75, 100)）', () => {
    const picked = pickCapture([], 'egg', 0.99)
    expect(picked?.rarity).toBe('epic')
  })

  it('池空归一化：抽光所有普通+稀有后，保底 rand=0 也只能抽史诗', () => {
    // 太空 17 只：6 普 + 8 稀 + 3 史；神庙同。把所有 common+rare 全占满
    const owned: string[] = []
    for (const w of ['space', 'shrine'] as const) {
      for (const m of monstersOfWorld(w)) {
        if (m.rarity !== 'epic') owned.push(m.id)
      }
    }
    // daily: common 70 / rare 25 / epic 5 → 仅 epic 池非空 → 总权重=5 → 任 rand 抽 epic
    expect(pickCapture(owned, 'daily', 0)?.rarity).toBe('epic')
    expect(pickCapture(owned, 'daily', 0.9)?.rarity).toBe('epic')
  })

  it('池空归一化：仅剩普通池时，彩蛋也只抽普通', () => {
    const owned = MONSTER_DEFS.filter((m) => m.rarity !== 'common').map((m) => m.id)
    expect(pickCapture(owned, 'egg', 0)?.rarity).toBe('common')
    expect(pickCapture(owned, 'egg', 0.99)?.rarity).toBe('common')
  })

  it('确定性：相同 rand + ownedIds 抽到相同怪兽', () => {
    const a = pickCapture([], 'daily', 0.42)
    const b = pickCapture([], 'daily', 0.42)
    expect(a).toEqual(b)
  })

  it('池内均匀：细扫 rand 能抽到每一只（不再固定偏置到池尾）', () => {
    // 旧实现复用 rand 取池内下标，史诗只能抽到最后 1~2 只、稀有只能抽到中段；
    // 细扫 rand 应能覆盖全部 34 只，否则说明池内映射有偏置。
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const picked = pickCapture([], 'daily', i / 2000)
      if (picked) seen.add(picked.id)
    }
    expect(seen.size).toBe(34)
  })
})

describe('shouldDailyCapture', () => {
  it('当天首次打卡返回 true', () => {
    expect(shouldDailyCapture(false)).toBe(true)
  })
  it('已打过卡返回 false', () => {
    expect(shouldDailyCapture(true)).toBe(false)
  })
})

describe('canEggCapture', () => {
  it('当天彩蛋捕获未达上限返回 true', () => {
    expect(canEggCapture(0)).toBe(true)
    expect(canEggCapture(DAILY_EGG_CAPTURE_MAX - 1)).toBe(true)
  })
  it('达到上限返回 false', () => {
    expect(canEggCapture(DAILY_EGG_CAPTURE_MAX)).toBe(false)
    expect(canEggCapture(DAILY_EGG_CAPTURE_MAX + 1)).toBe(false)
  })
})
