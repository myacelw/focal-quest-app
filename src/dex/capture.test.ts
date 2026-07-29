import { describe, it, expect } from 'vitest'
import {
  pickCapture, shouldDailyCapture, canEggCapture, DAILY_EGG_CAPTURE_MAX, SHINY_CHANCE,
} from './capture'
import { MONSTER_DEFS, monstersOfWorld, shinyIdOf } from './monster-defs'

describe('pickCapture', () => {
  it('全集已拥有时返回 null', () => {
    // 两步掷骰后「全集」= 普通 + 闪光都拥有（164 个收集品），只拥有普通桶不再算
    // 全集——闪光桶仍非空，会回落抽到闪光。只传 allIds 会让本用例失败（已用
    // vitest 实测验证），故补上闪光 id，语义与新增的「两个桶都空」用例对齐。
    const allIds = [...MONSTER_DEFS.map((m) => m.id), ...MONSTER_DEFS.map((m) => shinyIdOf(m.id))]
    expect(pickCapture(allIds, 'daily', 0.5)).toBeNull()
    expect(pickCapture(allIds, 'egg', 0.99)).toBeNull()
  })

  it('不重复：从未拥有的怪兽里抽', () => {
    const owned = MONSTER_DEFS.slice(0, 20).map((m) => m.id)
    for (let i = 0; i < 50; i++) {
      const picked = pickCapture(owned, 'daily', i / 50, 1)
      expect(picked).not.toBeNull()
      expect(owned).not.toContain(picked!.def.id)
    }
  })

  it('保底源：rand=0 抽到普通池（daily 权重 70% 最大）', () => {
    const picked = pickCapture([], 'daily', 0, 1)
    expect(picked?.def.rarity).toBe('common')
  })

  it('保底源：rand 接近 1 抽到普通池尾部（daily 权重全部在 common）', () => {
    // daily 总权重 100，common 70 → common 覆盖 [0, 70)
    const picked = pickCapture([], 'daily', 0.69, 1)
    expect(picked?.def.rarity).toBe('common')
  })

  it('保底源：rand=0.99 抽到史诗池（epic 权重 5）', () => {
    // [70+25, 100) = epic
    const picked = pickCapture([], 'daily', 0.99, 1)
    expect(picked?.def.rarity).toBe('epic')
  })

  it('彩蛋源：rand=0.29 抽到普通（egg common 30）', () => {
    const picked = pickCapture([], 'egg', 0.29, 1)
    expect(picked?.def.rarity).toBe('common')
  })

  it('彩蛋源：rand=0.3 抽到稀有（egg rare 45，覆盖 [30, 75)）', () => {
    const picked = pickCapture([], 'egg', 0.5, 1)
    expect(picked?.def.rarity).toBe('rare')
  })

  it('彩蛋源：rand=0.99 抽到史诗（egg epic 25，覆盖 [75, 100)）', () => {
    const picked = pickCapture([], 'egg', 0.99, 1)
    expect(picked?.def.rarity).toBe('epic')
  })

  it('池空归一化：抽光所有普通+稀有后，保底 rand=0 也只能抽史诗', () => {
    // space/shrine 各 33 只（6 普 + 18 稀 + 9 史）、forest 16 只（6 普 + 7 稀 + 3 史）；
    // 把三个世界的 common+rare 全占满，只剩 21 只 epic 未拥有
    const owned: string[] = []
    for (const w of ['space', 'shrine', 'forest'] as const) {
      for (const m of monstersOfWorld(w)) {
        if (m.rarity !== 'epic') owned.push(m.id)
      }
    }
    // daily: common 70 / rare 25 / epic 5 → 仅 epic 池非空 → 总权重=5 → 任 rand 抽 epic
    expect(pickCapture(owned, 'daily', 0, 1)?.def.rarity).toBe('epic')
    expect(pickCapture(owned, 'daily', 0.9, 1)?.def.rarity).toBe('epic')
  })

  it('池空归一化：仅剩普通池时，彩蛋也只抽普通', () => {
    const owned = MONSTER_DEFS.filter((m) => m.rarity !== 'common').map((m) => m.id)
    expect(pickCapture(owned, 'egg', 0, 1)?.def.rarity).toBe('common')
    expect(pickCapture(owned, 'egg', 0.99, 1)?.def.rarity).toBe('common')
  })

  it('确定性：相同 rand + ownedIds 抽到相同怪兽', () => {
    const a = pickCapture([], 'daily', 0.42, 1)
    const b = pickCapture([], 'daily', 0.42, 1)
    expect(a).toEqual(b)
  })

  it('池内均匀：细扫 rand 能抽到每一只（不再固定偏置到池尾）', () => {
    // 旧实现复用 rand 取池内下标，史诗只能抽到最后 1~2 只、稀有只能抽到中段；
    // 细扫 rand 应能覆盖全部 82 只，否则说明池内映射有偏置。
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const picked = pickCapture([], 'daily', i / 2000, 1)
      if (picked) seen.add(picked.def.id)
    }
    expect(seen.size).toBe(82)
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

describe('两步掷骰：闪光变体', () => {
  const ALL_NORMAL = MONSTER_DEFS.map((m) => m.id)
  const ALL_SHINY = MONSTER_DEFS.map((m) => shinyIdOf(m.id))

  it('闪光概率是 1/16', () => {
    expect(SHINY_CHANCE).toBe(1 / 16)
  })

  it('shinyRand 落在门槛内 → 出闪光；落在门槛外 → 出普通', () => {
    expect(pickCapture([], 'daily', 0, 0)!.shiny).toBe(true)
    expect(pickCapture([], 'daily', 0, SHINY_CHANCE - 0.001)!.shiny).toBe(true)
    expect(pickCapture([], 'daily', 0, SHINY_CHANCE)!.shiny).toBe(false)
    expect(pickCapture([], 'daily', 0, 1)!.shiny).toBe(false)
  })

  it('两个桶各自只出未拥有的：普通全拥有后，即使掷不中闪光也回落到闪光桶', () => {
    const r = pickCapture(ALL_NORMAL, 'daily', 0, 1)
    expect(r).not.toBeNull()
    expect(r!.shiny).toBe(true)
  })

  it('闪光全拥有后，即使掷中闪光也回落到普通桶', () => {
    const r = pickCapture(ALL_SHINY, 'daily', 0, 0)
    expect(r).not.toBeNull()
    expect(r!.shiny).toBe(false)
  })

  it('两个桶都空 → null（全图鉴 164 个收集品集齐）', () => {
    expect(pickCapture([...ALL_NORMAL, ...ALL_SHINY], 'daily', 0, 0)).toBeNull()
    expect(pickCapture([...ALL_NORMAL, ...ALL_SHINY], 'daily', 0, 1)).toBeNull()
  })

  it('闪光桶按"闪光是否已拥有"判定，与本体是否拥有无关', () => {
    // 已有本体、没有闪光 → 仍能抽到它的闪光
    const owned = [...ALL_NORMAL]
    const r = pickCapture(owned, 'daily', 0, 0)
    expect(r!.shiny).toBe(true)
    expect(ALL_NORMAL).toContain(r!.def.id) // def 仍是本体 def，闪光只是一个标记
  })

  it('桶内仍按稀有度权重抽（沿用 pickWeighted，不因闪光而改变手感）', () => {
    // daily 权重 common 70：rand=0 落在 common 段
    expect(pickCapture([], 'daily', 0, 0)!.def.rarity).toBe('common')
    // egg 权重 epic 25，覆盖 [75,100)：rand=0.99 落在 epic 段
    expect(pickCapture([], 'egg', 0.99, 0)!.def.rarity).toBe('epic')
  })
})
