import { describe, it, expect } from 'vitest'
import monsterImageSrc from './MonsterImage.tsx?raw'
import trainingSrc from '../training/TrainingPage.tsx?raw'

describe('闪光视觉的源文本契约', () => {
  it('MonsterImage 不许用 hue-rotate 做闪光', () => {
    // 82 只怪配色各异，同一个色相旋转角度必然在其中一部分身上翻车，且没法逐只调。
    // 统一的加亮 + 金色描边光可预期得多，对像素风与插画风都成立。
    // 正则只锚「真实语法形态」hue-rotate(，不锚任意提及——这样 SHINY_FILTER
    // 上方的说明注释可以坦率写出这个词，与 css-contract.test.ts 锚 calc(100vh - 57px) 同一套路。
    expect(monsterImageSrc).not.toMatch(/hue-rotate\(/)
  })

  it('MonsterImage 的 shiny 与调用方传入的 filter 是叠加，不是互相覆盖', () => {
    // 未捕获剪影传的是 brightness(0)；若 shiny 直接顶掉 filter，
    // 图鉴里没捕到的格子会在某些路径上露出彩色原图。
    // 数出现次数而不是只看「定义了 fx」：只检查 `shiny ? SHINY_FILTER : ''` 这行
    // 存在，拦不住「fx 只在部分分支用上、另一处仍是裸 filter 简写」这种回归——
    // 真实的组件里回落 div / sprite div / img 三处都必须用 `filter: fx`。
    expect(monsterImageSrc).toMatch(/shiny \? SHINY_FILTER : ''/)
    expect((monsterImageSrc.match(/filter: fx\b/g) ?? []).length).toBe(3)
  })

  it('闪光揭示卡不复用普通捕获音（egg / badge）', () => {
    // 与"超时音不能沿用答错音"同理：界面刚用金边分出的稀有度，
    // 若耳朵里是同一个声音就等于没分。
    expect(trainingSrc).toMatch(/playSfx\(\s*shiny \? 'shiny'/)
  })
})
