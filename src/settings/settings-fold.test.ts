import { describe, it, expect } from 'vitest'

// 用 Vite 的 ?raw 拿源文件文本：本仓 vitest 是 environment:'node'、没有 jsdom，组件不可渲染；
// 也没装 @types/node，用 node:fs 会让 tsc 报 TS2307。同 src/challenge/challenge-shell.test.ts。
import page from '../SettingsPage.tsx?raw'

const OPEN_TAG = "<Collapsible title={t('settings.trainingLoad')}>"

/**
 * 折叠卡开合标签之间那一段源文本。
 * 折叠区内部没有嵌套 Collapsible，所以它后面第一个 </Collapsible> 就是它的收尾
 * （用 indexOf + slice 而不是正则：`{t(...)}` 里的 `}` 与箭头函数里的 `>`
 *  会让 /<Collapsible[^>]*>/ 这类写法在意想不到的地方截断）。
 */
function foldRegion(): string {
  const i = page.indexOf(OPEN_TAG)
  expect(i, '设置页里找不到「📐 视标与时长」折叠卡').toBeGreaterThan(-1)
  const j = page.indexOf('</Collapsible>', i)
  expect(j, '折叠卡没有收尾标签').toBeGreaterThan(i)
  return page.slice(i, j)
}

function countOf(text: string, needle: string): number {
  return text.split(needle).length - 1
}

/**
 * 设置页把「影响训练量的两项」收进折叠区（spec §7.7，用户 2026-07-27 拍板）。
 *
 * ⚠️ 定性是**降低可达性、不是权限闸门**：孩子展开一样能改，这是已知且接受的。
 * 门槛按时长**等比缩放**（医学口径不可动摇，固定门槛会惩罚调节慢的孩子），
 * 代价就是"随手把单眼时长点到 1 分 → 训练量与门槛一起砍到 1/3"。
 * 「事后」改档追溯降低当天门槛那一半由 goalForDay 堵死（spec §3.5）；
 * 「练之前就调低」这一半只能靠可达性，也就是这张折叠卡。
 */
describe('设置页：影响训练量的两项收进折叠区（spec §7.7）', () => {
  it('「👁️ 视标大小」与「⏱️ 单眼时长」两张卡都在折叠区内', () => {
    const region = foldRegion()
    expect(region, '视标大小没进折叠区').toContain("t('settings.optotype')")
    expect(region, '单眼时长没进折叠区').toContain("t('settings.duration')")
  })

  it('两项在整份源文本里各只出现一次（没有一份留在折叠区外）', () => {
    // 防"复制一份进折叠区、原处忘了删"——那样孩子照样能在折叠区外随手改。
    expect(countOf(page, "t('settings.optotype')"), '视标大小卡出现了不止一处').toBe(1)
    expect(countOf(page, "t('settings.duration')"), '单眼时长卡出现了不止一处').toBe(1)
  })

  it('折叠默认收起——不许传 defaultOpen（传 true 等于什么都没做）', () => {
    expect(page).toContain(OPEN_TAG)
    const i = page.indexOf(OPEN_TAG)
    const tag = page.slice(i, i + OPEN_TAG.length)
    expect(tag).not.toContain('defaultOpen')
  })

  it('内层两块不再套 className="fq-card"（Collapsible 自身就是一张卡，套娃出双层圆角与内边距）', () => {
    expect(foldRegion()).not.toContain('className="fq-card"')
  })

  it('折叠区顶部有那行「配一次就好」的说明（家长展开后知道这是干什么的）', () => {
    expect(foldRegion()).toContain("t('settings.trainingLoadHint')")
  })

  it('只折叠这两项：屏幕标定 / 翻拍速度 / 拍子度数 / 皮肤都留在折叠区外', () => {
    // 判据是"改了会不会改变训练量或难度"：
    // 标定首次必做（藏起来会让新用户卡住）；翻拍速度只改节奏观感；
    // 拍子度数软件只记录不参与计算；皮肤是给孩子的奖励，本来就该显眼。
    const region = foldRegion()
    for (const k of ['settings.calib', 'settings.flipSpeed', 'settings.flipperD', 'settings.skin']) {
      expect(region, `${k} 不该被折叠`).not.toContain(`t('${k}')`)
    }
  })

  it('门槛提示行（goal.settingsHint）若已存在，必须与时长档位同在折叠区内', () => {
    // 这行由「首页第三态 + 设置页门槛说明」那个任务加进时长档位卡（spec §7.4）。
    // 本条不要求它现在就存在，只锚定"一旦出现就必须落在折叠区内"——它本来就是给家长看的，
    // 也不能被拆到折叠区外去（那等于把门槛数值和它对应的档位按钮分了家）。
    const needle = "t('goal.settingsHint'"
    expect(countOf(foldRegion(), needle)).toBe(countOf(page, needle))
  })
})
