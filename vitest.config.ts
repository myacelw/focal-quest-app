import { defineConfig } from 'vitest/config'

/**
 * 此前项目没有这个文件，测试全跑 vite.config.ts 的默认值。
 * 现在需要 setupFiles 装 fake-indexeddb，故独立出来。
 *
 * ⚠️ 本文件一旦存在就**完全取代** vite.config.ts（vitest 不再读它、也不合并），
 * 所以把测试真正依赖的两项显式补回来：
 *   - define.__APP_VERSION__：SettingsPage 等模块引用这个编译期常量，缺了会在 import 时炸；
 *   - esbuild.jsx：既有测试会 import .tsx 模块（只取其中的纯函数导出），需要自动 JSX 运行时。
 * 反过来，vite.config.ts 里的 PWA 插件、COOP/COEP 头、dev proxy 与测试无关，不必带过来。
 */
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    // 与既有测试保持一致：node 环境、不开 globals（每个测试文件显式 import vitest）
    environment: 'node',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    // 显式列出两处测试根目录，避免将来把 dist/ 或 scripts/ 里的文件误当测试收进来
    include: ['src/**/*.test.ts', 'functions/**/*.test.ts'],
  },
})
