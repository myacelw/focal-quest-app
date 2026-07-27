import { db, type CardRow, type RedemptionRow } from '../data/db'
import { CARD_SETS, cardSetById, type CardDef } from './card-defs'
import { PACK_COST, pickCard } from './pack'
import { getAvailablePoints } from '../rewards/rewards-service'
import { pushCards, pushRedemptions } from '../data/api'
import { toDateStr } from '../data/date-utils'

export async function getOwnedCardIds(): Promise<Set<string>> {
  return new Set((await db.cards.toArray()).map((c) => c.id))
}

export async function getOwnedCards(): Promise<CardRow[]> {
  return (await db.cards.toArray()).sort((a, b) => a.obtainedAt - b.obtainedAt)
}

export interface SetProgress {
  setId: string
  owned: number
  total: number
  complete: boolean
}

export async function getSetProgress(): Promise<SetProgress[]> {
  const owned = await getOwnedCardIds()
  return CARD_SETS.map((s) => {
    const n = s.cards.filter((c) => owned.has(c.id)).length
    return { setId: s.id, owned: n, total: s.cards.length, complete: n >= s.cards.length }
  })
}

export type OpenPackResult =
  | { ok: true; card: CardDef }
  | { ok: false; reason: 'no-points' | 'complete' }

/**
 * 开一包：抽一张该套未拥有的卡，同时记一条积分消耗。
 *
 * **两张表的写入必须在同一个事务里。** 不包事务时中间失败会出现"扣了 500 分却没拿到卡"
 * （孩子会哭，而且账本对不上没法自动修）或"拿了卡没扣分"（白得）。push 放事务之后，
 * 与项目既有"先落库再 push、失败靠 outbox 补扫 + rescanOrphans 兜底"的模式一致。
 *
 * `rand` 可注入，供确定性测试；生产走 Math.random()。
 */
export async function openPack(setId: string, now: number, rand = Math.random()): Promise<OpenPackResult> {
  const set = cardSetById(setId)
  // 未知套：当已集齐处理。UI 只从 CARD_SETS 渲染按钮，正常路径到不了这里
  if (!set) return { ok: false, reason: 'complete' }

  const owned = await getOwnedCardIds()
  const ownedInSet = set.cards.filter((c) => owned.has(c.id)).map((c) => c.id)
  if (ownedInSet.length >= set.cards.length) return { ok: false, reason: 'complete' }

  if ((await getAvailablePoints()) < PACK_COST) return { ok: false, reason: 'no-points' }

  const card = pickCard(ownedInSet, set, rand)
  if (!card) return { ok: false, reason: 'complete' }

  const row: CardRow = { id: card.id, obtainedAt: now }
  // status 恒为 'fulfilled'：卡当场到手，没有"待家长确认"的中间态，
  // 也**永不可撤销**——退分而不收回卡等于白得一张（撤销按钮只对 pending 渲染）。
  const redemption: RedemptionRow = {
    kind: 'pack', title: 'pack', cost: PACK_COST,
    createdAt: now, createdDate: toDateStr(new Date(now)),
    status: 'fulfilled', fulfilledAt: now,
  }

  let id = 0
  await db.transaction('rw', db.cards, db.redemptions, async () => {
    await db.cards.put(row)
    id = await db.redemptions.add(redemption)
  })

  pushCards([row])
  pushRedemptions([{ ...redemption, id }])
  return { ok: true, card }
}
