import { describe, it, expect } from 'vitest'
import { enemyForSeq } from './SpaceStage'

describe('enemyForSeq — 敌人每题轮换', () => {
  it('第 0 题是图片型敌方战舰', () => {
    expect(enemyForSeq(0).kind).toBe('img')
    expect(enemyForSeq(0).name).toBe('enemy')
  })
  it('逐题轮换到不同敌人', () => {
    expect(enemyForSeq(1).name).toBe('ufo')
    expect(enemyForSeq(2).name).toBe('alien')
  })
  it('转满一圈（池长 6）回起点', () => {
    expect(enemyForSeq(6).name).toBe(enemyForSeq(0).name)
    expect(enemyForSeq(7).name).toBe(enemyForSeq(1).name)
  })
  it('负数兜底不越界', () => {
    expect(enemyForSeq(-6).name).toBe('enemy')
  })
})
