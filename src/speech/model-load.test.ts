import { describe, it, expect } from 'vitest'

// 用 Vite 的 ?raw 拿源文件文本：本仓 vitest 是 environment:'node'，SW 与组件都渲染不了，
// 而下面这三条是"改回去也全绿、只有 iPad 上才炸"的那类口径，只能靠源文本契约钉住。
import voskSrc from './vosk.ts?raw'
import swSrc from '../sw.ts?raw'
import trainingPage from '../training/TrainingPage.tsx?raw'

/**
 * 剥掉注释再匹配。**这一步不是洁癖**：下面几条断言的正文（`arrayBuffer()`、`res.clone()`）
 * 恰恰也会出现在"解释为什么不能用它"的注释里，不剥的话文档写得越清楚测试越红——
 * 那等于逼着文档给测试让路（本仓在 optotype-auto 的浮点余量注释上踩过同一个坑）。
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}
const vosk = stripComments(voskSrc)
const sw = stripComments(swSrc)

/**
 * 2026-09-14 的白屏现场：孩子开始训练，提示停在「🎤 语音加载中…」，一会儿整屏变白、
 * 状态栏转圈（= Safari 杀了页面进程又自动重载，不是 JS 异常）。退出重进照旧。
 *
 * 触发条件：44MB 语音模型平时躺在 SW 的运行时缓存里，那天被 iOS 清掉了（脚本可写存储
 * 7 天未访问就清理），于是走了"重新联网下载"这条路——而那条路上同一份数据在页面进程里
 * 同时存在好几份拷贝，叠上 worker 解压模型的峰值就越过了 iPad 的进程上限。
 *
 * 下面两条各消掉一份拷贝。它们都是"写回旧写法功能完全正常、只是内存翻倍"的改动，
 * 单测与类型检查都拦不住，所以在这里锚死。
 */
describe('语音模型加载：页面进程里不许出现多余的整份拷贝', () => {
  it('分片用 res.blob() 收，不许用 res.arrayBuffer()', () => {
    // arrayBuffer 把 44MB 拉进 JS 堆，new Blob([ab,...]) 再复制一份 → 峰值 88MB；
    // blob 是引用底层存储的句柄，拼接不复制数据。
    expect(vosk).toContain('await res.blob()')
    expect(vosk, 'vosk.ts 又用回了 arrayBuffer()——那是白屏的直接诱因').not.toContain('arrayBuffer()')
  })

  it('SW 缓存模型分片时不许用 res.clone()', () => {
    // clone 把 body 分两路，消费速度不同步 → 落后的那一路被整段缓冲在内存里。
    // 改成先 cache.put（边下边落盘）再 match 读回。
    const i = sw.indexOf('if (isModelOrHeavy(url))')
    expect(i, 'SW 里找不到模型分支').toBeGreaterThan(-1)
    // 分支边界用**代码**定位，不能用注释文字——上面刚把注释剥掉了，
    // 用注释当锚点会得到 -1，slice(i, -1) 一路切到文件末尾、把最后那个分支的
    // res.clone()（那是小资源回填，本就允许）也圈进来，断言于是必红。
    const end = sw.indexOf('caches.open(PRECACHE)', i)
    expect(end, 'SW 里找不到模型分支之后的通用分支').toBeGreaterThan(i)
    const branch = sw.slice(i, end)
    expect(branch).toContain('await cache.put(req, res)')
    expect(branch, '模型分支又用回了 res.clone()——20MB 分片等于凭空多一份拷贝').not.toContain('res.clone()')
  })
})

/**
 * 崩溃自愈的接线。逻辑本身在 voice-guard.test.ts 里测，这里只保证**训练页真的接上了**——
 * 漏接不会报错，只会让孩子重新陷回"进去→白屏→重进→白屏"的死循环。
 */
describe('训练页：语音崩溃自愈的接线', () => {
  it('加载前留面包屑、成败都收尾', () => {
    expect(trainingPage).toContain('noteLoadStart()')
    expect(trainingPage).toContain('noteLoadSettled(true)')
    expect(trainingPage).toContain('noteLoadSettled(false)')
  })

  it('面包屑必须写在 startVosk 之前（写在后面就永远抓不到加载途中的崩溃）', () => {
    const mark = trainingPage.indexOf('noteLoadStart()')
    const call = trainingPage.indexOf('startVosk({')
    expect(mark).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(-1)
    expect(mark).toBeLessThan(call)
  })

  it('闸门不放行时直接返回，不发起加载', () => {
    expect(trainingPage).toContain('const gate = readVoiceGate()')
    expect(trainingPage).toMatch(/if \(gate !== 'start'\)/)
  })

  it("「重试语音」只在 failed/guarded 出现，'off' 态不给——那是家长关的，不能在孩子面前一键架空", () => {
    expect(trainingPage).toContain("const canRetryVoice = voskStatus === 'failed' || voskStatus === 'guarded'")
    expect(trainingPage).not.toContain("canRetryVoice = voskStatus === 'off'")
  })
})
