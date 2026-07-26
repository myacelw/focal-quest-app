import { describe, it, expect } from 'vitest'
import {
  PHONE_MAX_W_PX, SHORT_MAX_H_PX, CANVAS_MAX_PX,
  DPAD_MAX_PX_PHONE, DPAD_MAX_PX_WIDE, DPAD_VW_PHONE, DPAD_VW_WIDE,
  DPAD_DVH_PHONE, DPAD_DVH_SHORT, TRAIN_WARN_MAX_H_PX,
} from './layout-budget'

// 用 Vite 的 ?raw 拿源文件文本（而非 node:fs）：本仓没装 @types/node，
// tsconfig 的 types 又只放了 vitest/globals，node:fs 会让 tsc 报 TS2307。
import css from '../index.css?raw'
import training from '../training/TrainingPage.tsx?raw'

/** CSS 不可单测，但"CSS 里的数字必须等于 layout-budget 的常量"可以。
 *  这个文件是防 TS 与 CSS 漂移的闸门——改了常量忘改 CSS（或反之）立刻红。 */
describe('index.css 与布局预算常量的契约', () => {
  it('声明了手机窄屏断点', () => {
    expect(css).toContain(`@media (max-width: ${PHONE_MAX_W_PX}px)`)
  })

  it('声明了矮屏断点', () => {
    expect(css).toContain(`@media (max-height: ${SHORT_MAX_H_PX}px)`)
  })

  it('方向盘三档宽度与常量一致', () => {
    expect(css).toContain(`width: min(${DPAD_MAX_PX_WIDE}px, ${DPAD_VW_WIDE}vw)`)
    expect(css).toContain(`width: min(${DPAD_MAX_PX_PHONE}px, ${DPAD_VW_PHONE}vw, ${DPAD_DVH_PHONE}dvh)`)
    expect(css).toContain(`width: min(${DPAD_MAX_PX_WIDE}px, ${DPAD_VW_WIDE}vw, ${DPAD_DVH_SHORT}dvh)`)
  })

  it('皮肤画布用容器查询单位兜住舞台剩余高度', () => {
    expect(css).toContain(`width: min(100%, ${CANVAS_MAX_PX}px, 100cqh)`)
    expect(css).toContain('container-type: size')
  })

  it('"屏幕太矮"提示的阈值与常量一致', () => {
    expect(css).toContain(`@media (max-height: ${TRAIN_WARN_MAX_H_PX}px)`)
  })

  it('应用外壳存在且内容区可滚（导航高度不再靠猜）', () => {
    expect(css).toMatch(/\.fq-app\s*\{[^}]*height:\s*100dvh/)
    expect(css).toMatch(/\.fq-app-main\s*\{[^}]*overflow-y:\s*auto/)
  })

  it('全站不再出现写死的导航高度 calc(100vh - 57px)', () => {
    expect(css).not.toContain('calc(100vh - 57px)')
    expect(training).not.toContain('calc(100vh - 57px)')
  })

  it('每个 env(safe-area-inset-*) 都带兜底值（无兜底会让整条声明在旧内核失效）', () => {
    const bare = css.match(/env\(safe-area-inset-[a-z]+\s*\)/g)
    expect(bare).toBeNull()
    expect(css).toContain('env(safe-area-inset-top, 0px)')
  })
})
