/**
 * `?raw` 是 Vite 的导入后缀（把源文件当纯文本拿）。
 *
 * functions/tsconfig.json 只装 @cloudflare/workers-types、**刻意不装 vite/client**
 * ——后者会把整套 DOM 全局塞进 Workers 的类型环境，与 workers-types 打架。
 * 所以这里单独声明这一个通配模块。
 *
 * 只有 *.test.ts 会用到；部署到 Pages 的代码里没有任何 ?raw 导入。
 */
declare module '*?raw' {
  const src: string
  export default src
}
