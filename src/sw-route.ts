/*
 * Service Worker 的路由判定纯函数。
 *
 * 单独成文件而不写在 src/sw.ts 里，是因为 sw.ts 在模块顶层就访问 self /
 * sw.registration.scope / addEventListener，在 vitest 的 node 环境里 import 它会直接
 * ReferenceError；把纯逻辑摘出来才能单测（且本文件不在 tsconfig 的 exclude 里，顺带被 tsc 覆盖）。
 */

/**
 * 是否绕过 SW 直连网络。云同步接口（/api/*）必须每次真发请求：
 * 本 SW 对同源 GET 一律 cache-first，若接管了 pull 请求，客户端会反复读到过期响应。
 * 用路径段匹配而非 includes('api')，避免把 /assets/api-helper.js 之类静态资源误判。
 */
export function shouldBypass(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/')
}
