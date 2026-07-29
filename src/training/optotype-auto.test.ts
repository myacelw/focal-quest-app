import { describe, it, expect } from 'vitest'
import type { SessionRow } from '../data/db'
import {
  AUTO_FLOOR_MM, DEFAULT_SIZE_MM, SIZE_MAX_MM,
  sanitizeSizeMm, decideOptotypeAdjust, type OptotypeAdjust,
} from './optotype-auto'
import src from './optotype-auto.ts?raw'
import settingsSrc from '../SettingsPage.tsx?raw'
import trainingSrc from '../training/TrainingPage.tsx?raw'
import challengeSrc from '../challenge/ChallengePage.tsx?raw'

/** 造一天的节次：给定日期、正确率、若干节的反应时间 */
function day(date: string, accuracy: number, reactions: number[]): SessionRow[] {
  return reactions.map((ms, i) => ({
    date,
    startedAtMs: 0,
    eye: (i % 2 === 0 ? 'left' : 'right') as 'left' | 'right',
    answered: 100,
    correct: Math.round(accuracy * 100),
    flips: 30,
    elapsedSec: 180,
    acuity: 0.7,
    avgReactionMs: ms,
  }))
}

/** 闺女 2026-07-11 ~ 07-28 的真实数据（12 个训练日，正确率与日中位反应） */
const REAL: Array<[string, number, number[]]> = [
  ['2026-07-11', 0.95, [3757, 4291]],
  ['2026-07-12', 0.97, [2374, 1954, 1937]],
  ['2026-07-13', 0.98, [2176, 2735, 2014, 6446, 1534]],
  ['2026-07-14', 1.00, [1667, 1884, 1439]],
  ['2026-07-15', 1.00, [1787, 1837]],
  ['2026-07-16', 1.00, [1644, 1794]],
  ['2026-07-17', 1.00, [1904, 1550]],
  ['2026-07-18', 0.96, [3868, 4814]],
  ['2026-07-21', 1.00, [2794, 2300]],
  ['2026-07-26', 0.98, [1664, 1647, 4916]],
  ['2026-07-27', 0.98, [1167, 1183]],
  ['2026-07-28', 0.97, [1562, 1545]],
]

describe('sanitizeSizeMm —— 三个读取点的唯一出口', () => {
  it('脏值回默认：NaN / 0 / 负数', () => {
    expect(sanitizeSizeMm(Number('abc'))).toBe(DEFAULT_SIZE_MM)
    expect(sanitizeSizeMm(0)).toBe(DEFAULT_SIZE_MM)
    expect(sanitizeSizeMm(-1)).toBe(DEFAULT_SIZE_MM)
  })

  it('越界钳回滑块范围', () => {
    expect(sanitizeSizeMm(99)).toBe(SIZE_MAX_MM)
    expect(sanitizeSizeMm(0.05)).toBe(0.3)
  })

  it('正常值原样通过（并消掉浮点毛刺）', () => {
    expect(sanitizeSizeMm(0.7)).toBe(0.7)
    expect(sanitizeSizeMm(0.7999999999)).toBe(0.8)
  })
})

describe('decideOptotypeAdjust —— 真实数据回放', () => {
  // 这是最强的一条锚：把 12 个训练日按序喂进去，断言完整轨迹。
  // 期望：07-14 / 07-17 / 07-27 三次收紧，零回退，终值 0.6mm。
  // 阈值一旦被改动，这条会立刻红。
  it('三次收紧、零回退、终值 0.6mm', () => {
    let mm = 0.9
    let last: OptotypeAdjust | null = null
    const fired: Array<[string, string, number]> = []
    const acc: SessionRow[] = []

    for (const [date, accuracy, reactions] of REAL) {
      acc.push(...day(date, accuracy, reactions))
      const d = decideOptotypeAdjust(acc, mm, last, date)
      if (d.action === 'none') continue
      fired.push([date, d.action, d.to])
      last = {
        from: d.from, to: d.to, atDate: date, kind: d.action,
        baselineReactionMs: d.action === 'tighten' ? d.baselineReactionMs : 0,
      }
      mm = d.to
    }

    expect(fired).toEqual([
      ['2026-07-14', 'tighten', 0.8],
      ['2026-07-17', 'tighten', 0.7],
      ['2026-07-27', 'tighten', 0.6],
    ])
    expect(mm).toBe(AUTO_FLOOR_MM)
  })

  it('07-21 是"擦边不回退"：2547ms 差一点点没到 1727×1.5≈2591 —— 别把它改成"任一天即回退"', () => {
    // 07-17 收紧后基线 1727。07-18 破线（4341），07-21 未破线（2547 < 2591）。
    // 规则是"两天都破线才回退"，所以不回退。若改成"任一天"，07-18 就会触发回退、
    // 把之后 4 个训练日锁进 10 天长冷却，而 07-18 只是个 22:43 开练的孤立疲劳日。
    const acc: SessionRow[] = []
    for (const [date, accuracy, reactions] of REAL.slice(0, 9)) acc.push(...day(date, accuracy, reactions))
    const last: OptotypeAdjust = {
      from: 0.8, to: 0.7, atDate: '2026-07-17', kind: 'tighten', baselineReactionMs: 1727,
    }
    expect(decideOptotypeAdjust(acc, 0.7, last, '2026-07-21').action).toBe('none')
  })
})

describe('decideOptotypeAdjust —— 边界', () => {
  const three = (r: number) => [
    ...day('2026-07-01', 1, [r]), ...day('2026-07-02', 1, [r]), ...day('2026-07-03', 1, [r]),
  ]

  it('到下限就不再收紧', () => {
    expect(decideOptotypeAdjust(three(1000), AUTO_FLOOR_MM, null, '2026-07-03').action).toBe('none')
  })

  it('有效训练日不足窗口 → none（宁可不调，不瞎调）', () => {
    const two = [...day('2026-07-01', 1, [1000]), ...day('2026-07-02', 1, [1000])]
    expect(decideOptotypeAdjust(two, 0.9, null, '2026-07-02').action).toBe('none')
  })

  it('缺 avgReactionMs 的节次不计入；整天都缺 → 该天不算有效训练日', () => {
    const rows = three(1000).map((r) => ({ ...r, avgReactionMs: undefined }))
    expect(decideOptotypeAdjust(rows, 0.9, null, '2026-07-03').action).toBe('none')
  })

  it('任一天正确率低于 0.95 → 不收紧', () => {
    const rows = [
      ...day('2026-07-01', 1, [1000]), ...day('2026-07-02', 0.9, [1000]), ...day('2026-07-03', 1, [1000]),
    ]
    expect(decideOptotypeAdjust(rows, 0.9, null, '2026-07-03').action).toBe('none')
  })

  it('反应中位数超阈值 → 不收紧', () => {
    expect(decideOptotypeAdjust(three(2500), 0.9, null, '2026-07-03').action).toBe('none')
  })

  it('冷却未满 → 不收紧（上次调整距今只有 2 个训练日）', () => {
    const last: OptotypeAdjust = {
      from: 1, to: 0.9, atDate: '2026-07-01', kind: 'tighten', baselineReactionMs: 1000,
    }
    expect(decideOptotypeAdjust(three(1000), 0.9, last, '2026-07-03').action).toBe('none')
  })

  it('手动改动也重置冷却（kind:manual）', () => {
    const last: OptotypeAdjust = {
      from: 0.7, to: 0.9, atDate: '2026-07-02', kind: 'manual', baselineReactionMs: 0,
    }
    expect(decideOptotypeAdjust(three(1000), 0.9, last, '2026-07-03').action).toBe('none')
  })

  it('收紧后连着两天都破线 → 回退，并且 from/to 反向', () => {
    const rows = [
      ...day('2026-07-01', 1, [1000]),   // 收紧当天
      ...day('2026-07-02', 0.5, [9000]), // 观察 1：破线
      ...day('2026-07-03', 0.5, [9000]), // 观察 2：破线
    ]
    const last: OptotypeAdjust = {
      from: 0.8, to: 0.7, atDate: '2026-07-01', kind: 'tighten', baselineReactionMs: 1000,
    }
    const d = decideOptotypeAdjust(rows, 0.7, last, '2026-07-03')
    expect(d).toEqual({ action: 'revert', from: 0.7, to: 0.8 })
  })

  it('只有一个观察日破线 → 继续观察，不回退', () => {
    const rows = [
      ...day('2026-07-01', 1, [1000]),
      ...day('2026-07-02', 0.5, [9000]),
      ...day('2026-07-03', 1, [1000]),
    ]
    const last: OptotypeAdjust = {
      from: 0.8, to: 0.7, atDate: '2026-07-01', kind: 'tighten', baselineReactionMs: 1000,
    }
    expect(decideOptotypeAdjust(rows, 0.7, last, '2026-07-03').action).toBe('none')
  })

  it('回退后进 10 个训练日的长冷却，不会立刻又收紧', () => {
    const rows: SessionRow[] = []
    for (let i = 1; i <= 6; i++) rows.push(...day(`2026-07-0${i}`, 1, [1000]))
    const last: OptotypeAdjust = {
      from: 0.7, to: 0.8, atDate: '2026-07-02', kind: 'revert', baselineReactionMs: 0,
    }
    expect(decideOptotypeAdjust(rows, 0.8, last, '2026-07-06').action).toBe('none')
  })

  it('currentMm 是唯一真相：localStorage 与 last.to 不一致时以 currentMm 为准', () => {
    // 备份恢复 / 手工改键会造成这种不一致，不报错、不纠正，照 currentMm 往下算。
    const last: OptotypeAdjust = {
      from: 1, to: 0.9, atDate: '2026-06-01', kind: 'tighten', baselineReactionMs: 1000,
    }
    const d = decideOptotypeAdjust(three(1000), 1.2, last, '2026-07-03')
    expect(d).toEqual({ action: 'tighten', from: 1.2, to: 1.1, baselineReactionMs: 1000 })
  })
})

describe('源文本契约', () => {
  it('自动逻辑不许出现比 AUTO_FLOOR_MM 更小的毫米字面量', () => {
    // 这条防的是"顺手把下限写死成 0.4 试试"这类绕过。SIZE_MIN_MM=0.3 是滑块的
    // 手动下限、允许出现；除它之外不该有 0.1~0.5 之间的裸小数（AUTO_STEP_MM=0.1 除外）。
    const allowed = new Set(['0.3', '0.1'])
    const found = [...src.matchAll(/(?<![\d.])0\.[0-5]\d*/g)].map((m) => m[0])
    expect(found.filter((f) => !allowed.has(f))).toEqual([])
  })

  it('回退必须是两天都破线（&&），不是任一天（||）', () => {
    expect(src).toMatch(/breached\(a, last\.baselineReactionMs\) && breached\(b, last\.baselineReactionMs\)/)
  })

  it('三个读取点全部走 sanitize，不许再有裸 Number(lsGet(...))', () => {
    // Number('abc') 是 NaN，训练页 heightPx = NaN × pxPerMm 会让视标直接渲染不出来。
    // 本迭代开始程序化写入这个键，脏值后果更严重，所以收口成唯一出口。
    for (const [name, s] of [['Settings', settingsSrc], ['Training', trainingSrc], ['Challenge', challengeSrc]] as const) {
      expect(s.includes('optotypeSizeMm'), `${name} 应改为从 optotype-auto 取值`).toBe(false)
    }
    expect(trainingSrc).toMatch(/readSizeMm\(\)/)
    expect(challengeSrc).toMatch(/readSizeMm\(\)/)
    expect(settingsSrc).toMatch(/useState\(readSizeMm\)/)
  })
})
