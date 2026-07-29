import { describe, it, expect } from 'vitest'
import monsterImageSrc from './MonsterImage.tsx?raw'
import trainingSrc from '../training/TrainingPage.tsx?raw'

describe('闪光视觉的源文本契约', () => {
  it('MonsterImage 不许用 hue-rotate 做闪光', () => {
    // 82 只怪配色各异，同一个色相旋转角度必然在其中一部分身上翻车，且没法逐只调。
    // 统一的加亮 + 金色描边光可预期得多，对像素风与插画风都成立。
    expect(monsterImageSrc).not.toMatch(/hue-rotate/)
  })

  it('MonsterImage 的 shiny 与调用方传入的 filter 是叠加，不是互相覆盖', () => {
    // 未捕获剪影传的是 brightness(0)；若 shiny 直接顶掉 filter，
    // 图鉴里没捕到的格子会在某些路径上露出彩色原图。
    expect(monsterImageSrc).toMatch(/shiny \? SHINY_FILTER : ''/)
    expect(monsterImageSrc).not.toMatch(/filter: filter\b/)
  })

  it('闪光揭示卡不复用普通捕获音（egg / badge）', () => {
    // 与"超时音不能沿用答错音"同理：界面刚用金边分出的稀有度，
    // 若耳朵里是同一个声音就等于没分。
    expect(trainingSrc).toMatch(/playSfx\(\s*shiny \? 'shiny'/)
  })
})
