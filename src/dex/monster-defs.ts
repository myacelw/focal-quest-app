import { asset } from '../data/asset'

export type World = 'space' | 'shrine'
export type Rarity = 'common' | 'rare' | 'epic'

export interface MonsterDef {
  /** 主键，如 'space-ufo'、'shrine-golem' */
  id: string
  world: World
  rarity: Rarity
  /** 经 asset() 处理的图片 URL */
  img: string
  /** 完整 i18n key，渲染时 t(nameKey)，如 'space.enemy.ufo' / 'shrine.guardian.golem' */
  nameKey: string
  /** 横向精灵条素材（N 帧）。图鉴/开箱只取第 0 帧静态显示，避免整条胶片被拉伸渲染。 */
  sprite?: { frames: number }
}

/** 现役 12 只与皮肤池 ENEMIES/GUARDIANS 的 name slug 严格对齐 */
function space(slug: string, rarity: Rarity, img: string): MonsterDef {
  return { id: `space-${slug}`, world: 'space', rarity, img: asset(img), nameKey: `space.enemy.${slug}` }
}
function shrine(slug: string, rarity: Rarity, img: string): MonsterDef {
  return { id: `shrine-${slug}`, world: 'shrine', rarity, img: asset(img), nameKey: `shrine.guardian.${slug}` }
}

const SPACE_COMMON: MonsterDef[] = [
  space('enemy', 'common', '/skins/space/enemy.png'),
  space('ufo', 'common', '/skins/space/ufo.webp'),
  space('alien', 'common', '/skins/space/alien.webp'),
  space('meteor', 'common', '/skins/space/meteor.webp'),
  space('sentinel', 'common', '/skins/space/sentinel.webp'),
  space('darkring', 'common', '/skins/space/darkring.webp'),
]

const SHRINE_COMMON: MonsterDef[] = [
  { ...shrine('skeleton', 'common', '/skins/shrine/guardian-strip8.png'), sprite: { frames: 8 } },
  shrine('dragon', 'common', '/skins/shrine/dragon.webp'),
  shrine('oni', 'common', '/skins/shrine/oni.webp'),
  shrine('statue', 'common', '/skins/shrine/statue.webp'),
  shrine('void', 'common', '/skins/shrine/void.webp'),
  shrine('scorpion', 'common', '/skins/shrine/scorpion.webp'),
]

/** 储备 22 只：每世界 8 稀有 + 3 史诗，slug 取自素材文件名。哪 3 只当史诗按素材观感定。 */
const SPACE_RARE: MonsterDef[] = [
  space('comet_rider', 'rare', '/skins/space/reserve/comet_rider.webp'),
  space('cyber_wasp', 'rare', '/skins/space/reserve/cyber_wasp.webp'),
  space('ice_comet', 'rare', '/skins/space/reserve/ice_comet.webp'),
  space('laser_owl', 'rare', '/skins/space/reserve/laser_owl.webp'),
  space('nano_swarm', 'rare', '/skins/space/reserve/nano_swarm.webp'),
  space('plasma_jelly', 'rare', '/skins/space/reserve/plasma_jelly.webp'),
  space('solar_moth', 'rare', '/skins/space/reserve/solar_moth.webp'),
  space('star_crab', 'rare', '/skins/space/reserve/star_crab.webp'),
]
const SPACE_EPIC: MonsterDef[] = [
  space('gravity_orb', 'epic', '/skins/space/reserve/gravity_orb.webp'),
  space('quantum_ghost', 'epic', '/skins/space/reserve/quantum_ghost.webp'),
  space('void_serpent', 'epic', '/skins/space/reserve/void_serpent.webp'),
]

const SHRINE_RARE: MonsterDef[] = [
  shrine('chimera_cub', 'rare', '/skins/shrine/reserve/chimera_cub.webp'),
  shrine('crystal_bat', 'rare', '/skins/shrine/reserve/crystal_bat.webp'),
  shrine('flame_imp', 'rare', '/skins/shrine/reserve/flame_imp.webp'),
  shrine('gargoyle', 'rare', '/skins/shrine/reserve/gargoyle.webp'),
  shrine('harpy', 'rare', '/skins/shrine/reserve/harpy.webp'),
  shrine('specter', 'rare', '/skins/shrine/reserve/specter.webp'),
  shrine('stone_serpent', 'rare', '/skins/shrine/reserve/stone_serpent.webp'),
  shrine('wisp', 'rare', '/skins/shrine/reserve/wisp.webp'),
]
const SHRINE_EPIC: MonsterDef[] = [
  shrine('golem', 'epic', '/skins/shrine/reserve/golem.webp'),
  shrine('minotaur', 'epic', '/skins/shrine/reserve/minotaur.webp'),
  shrine('wraith', 'epic', '/skins/shrine/reserve/wraith.webp'),
]

export const MONSTER_DEFS: MonsterDef[] = [
  ...SPACE_COMMON, ...SPACE_RARE, ...SPACE_EPIC,
  ...SHRINE_COMMON, ...SHRINE_RARE, ...SHRINE_EPIC,
]

export const TOTAL_MONSTERS = MONSTER_DEFS.length

/** 图鉴排序权重：史诗 > 稀有 > 普通（组内更靠前 = 稀有感更强） */
const RARITY_ORDER: Record<Rarity, number> = { epic: 0, rare: 1, common: 2 }

export function monstersOfWorld(world: World): MonsterDef[] {
  return MONSTER_DEFS
    .filter((m) => m.world === world)
    .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.id.localeCompare(b.id))
}

/** 给定世界+稀有度的储备怪（rarity !== common），用于皮肤池联动 */
export function reserveMonstersOfWorld(world: World): MonsterDef[] {
  return MONSTER_DEFS
    .filter((m) => m.world === world && m.rarity !== 'common')
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function getMonsterDef(id: string): MonsterDef | undefined {
  return MONSTER_DEFS.find((m) => m.id === id)
}
