import { asset } from '../data/asset'

export type World = 'space' | 'shrine' | 'forest'
export type Rarity = 'common' | 'rare' | 'epic'

/**
 * 世界清单。**加世界只改这一个数组**——下游的分世界 Record 与图鉴分组渲染全部由它派生。
 *
 * 曾经散落 6 处 `{ space: …, shrine: … }` 字面量，其中 TrainingPage 那条
 * `=== 'space' ? … : === 'shrine' ? … : []` 三元链带 `: []` 兜底，漏改不报错，
 * 只会让新皮肤永远吃不到储备怪、静默失效。
 */
export const WORLDS: readonly World[] = ['space', 'shrine', 'forest']

/**
 * 按世界建一个 Record，每个世界一个**独立**初值。
 * `make` 是工厂而不是直接传值：传值的话 `emptyByWorld([])` 会让三个世界共享同一个数组。
 */
export function emptyByWorld<T>(make: () => T): Record<World, T> {
  return Object.fromEntries(WORLDS.map((w) => [w, make()])) as Record<World, T>
}

/** 皮肤 id 是否同时是一个世界名（plain / random 不是），供按 id 取分世界数据用 */
export function isWorld(id: string): id is World {
  return (WORLDS as readonly string[]).includes(id)
}

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
function forest(slug: string, rarity: Rarity, img: string): MonsterDef {
  return { id: `forest-${slug}`, world: 'forest', rarity, img: asset(img), nameKey: `forest.spirit.${slug}` }
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
  // ↓ 2026-07 扩池新增 10 只（全部非 common，才能进储备池 → 捕获后进训练轮换）
  space('star_whale', 'rare', '/skins/space/reserve/star_whale.webp'),
  space('ion_moth', 'rare', '/skins/space/reserve/ion_moth.webp'),
  space('drone_swarm', 'rare', '/skins/space/reserve/drone_swarm.webp'),
  space('meteor_hound', 'rare', '/skins/space/reserve/meteor_hound.webp'),
  space('plasma_ray', 'rare', '/skins/space/reserve/plasma_ray.webp'),
  space('void_crab', 'rare', '/skins/space/reserve/void_crab.webp'),
  space('satellite_owl', 'rare', '/skins/space/reserve/satellite_owl.webp'),
  space('comet_fox', 'rare', '/skins/space/reserve/comet_fox.webp'),
  space('nebula_slug', 'rare', '/skins/space/reserve/nebula_slug.webp'),
  space('radar_bat', 'rare', '/skins/space/reserve/radar_bat.webp'),
]
const SPACE_EPIC: MonsterDef[] = [
  space('gravity_orb', 'epic', '/skins/space/reserve/gravity_orb.webp'),
  space('quantum_ghost', 'epic', '/skins/space/reserve/quantum_ghost.webp'),
  space('void_serpent', 'epic', '/skins/space/reserve/void_serpent.webp'),
  // ↓ 2026-07 扩池新增 6 只
  space('black_hole', 'epic', '/skins/space/reserve/black_hole.webp'),
  space('star_forge', 'epic', '/skins/space/reserve/star_forge.webp'),
  space('cosmic_titan', 'epic', '/skins/space/reserve/cosmic_titan.webp'),
  space('solar_dragon', 'epic', '/skins/space/reserve/solar_dragon.webp'),
  space('quantum_king', 'epic', '/skins/space/reserve/quantum_king.webp'),
  space('galaxy_serpent', 'epic', '/skins/space/reserve/galaxy_serpent.webp'),
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
  // ↓ 2026-07 扩池新增 10 只
  shrine('bone_archer', 'rare', '/skins/shrine/reserve/bone_archer.webp'),
  shrine('cursed_knight', 'rare', '/skins/shrine/reserve/cursed_knight.webp'),
  shrine('swamp_hag', 'rare', '/skins/shrine/reserve/swamp_hag.webp'),
  shrine('shadow_wolf', 'rare', '/skins/shrine/reserve/shadow_wolf.webp'),
  shrine('ember_moth', 'rare', '/skins/shrine/reserve/ember_moth.webp'),
  shrine('tomb_spider', 'rare', '/skins/shrine/reserve/tomb_spider.webp'),
  shrine('rune_sentinel', 'rare', '/skins/shrine/reserve/rune_sentinel.webp'),
  shrine('frost_shade', 'rare', '/skins/shrine/reserve/frost_shade.webp'),
  shrine('grave_bat', 'rare', '/skins/shrine/reserve/grave_bat.webp'),
  shrine('lantern_ghost', 'rare', '/skins/shrine/reserve/lantern_ghost.webp'),
]
const SHRINE_EPIC: MonsterDef[] = [
  shrine('golem', 'epic', '/skins/shrine/reserve/golem.webp'),
  shrine('minotaur', 'epic', '/skins/shrine/reserve/minotaur.webp'),
  shrine('wraith', 'epic', '/skins/shrine/reserve/wraith.webp'),
  // ↓ 2026-07 扩池新增 6 只
  shrine('bone_dragon', 'epic', '/skins/shrine/reserve/bone_dragon.webp'),
  shrine('shadow_king', 'epic', '/skins/shrine/reserve/shadow_king.webp'),
  shrine('stone_titan', 'epic', '/skins/shrine/reserve/stone_titan.webp'),
  shrine('flame_phoenix', 'epic', '/skins/shrine/reserve/flame_phoenix.webp'),
  shrine('spirit_warden', 'epic', '/skins/shrine/reserve/spirit_warden.webp'),
  shrine('ancient_guardian', 'epic', '/skins/shrine/reserve/ancient_guardian.webp'),
]

/** 森林 6 只基础精灵（common），与 ForestStage 的 BASE_SPIRITS 对齐 */
const FOREST_COMMON: MonsterDef[] = [
  forest('sprout', 'common', '/skins/forest/sprout.webp'),
  forest('mushroom', 'common', '/skins/forest/mushroom.webp'),
  forest('firefly', 'common', '/skins/forest/firefly.webp'),
  forest('acorn', 'common', '/skins/forest/acorn.webp'),
  forest('fawn', 'common', '/skins/forest/fawn.webp'),
  forest('bluebird', 'common', '/skins/forest/bluebird.webp'),
]
const FOREST_RARE: MonsterDef[] = [
  forest('moss_golem', 'rare', '/skins/forest/reserve/moss_golem.webp'),
  forest('vine_serpent', 'rare', '/skins/forest/reserve/vine_serpent.webp'),
  forest('owl_sage', 'rare', '/skins/forest/reserve/owl_sage.webp'),
  forest('crystal_stag', 'rare', '/skins/forest/reserve/crystal_stag.webp'),
  forest('fox_spirit', 'rare', '/skins/forest/reserve/fox_spirit.webp'),
  forest('petal_fairy', 'rare', '/skins/forest/reserve/petal_fairy.webp'),
  forest('bark_treant', 'rare', '/skins/forest/reserve/bark_treant.webp'),
]
const FOREST_EPIC: MonsterDef[] = [
  forest('elder_tree', 'epic', '/skins/forest/reserve/elder_tree.webp'),
  forest('moon_deer', 'epic', '/skins/forest/reserve/moon_deer.webp'),
  forest('forest_king', 'epic', '/skins/forest/reserve/forest_king.webp'),
]

export const MONSTER_DEFS: MonsterDef[] = [
  ...SPACE_COMMON, ...SPACE_RARE, ...SPACE_EPIC,
  ...SHRINE_COMMON, ...SHRINE_RARE, ...SHRINE_EPIC,
  ...FOREST_COMMON, ...FOREST_RARE, ...FOREST_EPIC,
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
