import { describe, it, expect } from 'vitest'
import monsterImageSrc from './MonsterImage.tsx?raw'
import trainingSrc from '../training/TrainingPage.tsx?raw'
import dexWallSrc from './DexWall.tsx?raw'

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

  it('图鉴格子的 ✨ 角标必须受 owned 门控，不能只看 shinyOwned', () => {
    // 闪光可能先于本体被抽中（两个桶各自独立掷骰），此时格子仍是未捕获的
    // 「？？？」神秘格。若角标渲染条件只写 `shinyOwned && (...)`，会出现一个
    // 孩子点不开、连名字都看不到的发光神秘格——这个状态没有渲染基建可验
    // （不加门控也不报错，只是悄悄变回误导态），只能靠源文本契约锚住。
    expect(dexWallSrc).toMatch(/\{owned && shinyOwned && \(/)
    expect(dexWallSrc).not.toMatch(/\{shinyOwned && \(/)
  })

  it('DexWall 的「全部集齐」必须同时门控本体与闪光两个计数', () => {
    // 只看 ownedCount 会在孩子约第 35 天把 82 只本体集齐、闪光才约 5 只时
    // 就误报「🎉 全部集齐！」——本分支想供给的那 77 只闪光其实一只都还没开始，
    // 等于本分支的存在理由被自己的 UI 掐掉。这个回归改回单条件不会报错，只是
    // 悄悄把「全部集齐」的语义改错，只能靠源文本契约锚住双重门控本身还在。
    expect(dexWallSrc).toMatch(/isComplete = ownedCount >= TOTAL_MONSTERS && shinyCount >= TOTAL_MONSTERS/)
  })
})
