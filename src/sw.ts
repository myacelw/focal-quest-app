/// <reference lib="webworker" />
/*
 * 变焦大冒险 · 自定义 Service Worker（vite-plugin-pwa injectManifest 模式）
 *
 * 它同时干两件事：
 *  1) 离线缓存：装成 PWA 后完全离线可用（首屏 shell 预缓存 + vosk 模型运行时缓存）。
 *  2) 跨域隔离补头：GitHub Pages 等静态托管无法自定义响应头，而 vosk 依赖
 *     SharedArrayBuffer → 需要 COOP+COEP。本 SW 给每个自己经手的响应补上
 *     COOP/COEP/CORP 头，使 crossOriginIsolated 变 true，vosk 才能加载。
 *
 * 为什么手写而不用 Workbox 的 precacheAndRoute：那套会抢先 respondWith、把缓存响应
 * 直接返回，绕过我们的“补头”逻辑；跨域隔离就废了。所以自己掌控每一个响应。
 */
const sw = self as unknown as ServiceWorkerGlobalScope

type ManifestEntry = { url: string; revision: string | null }
// vite-plugin-pwa 构建时会把下面这个连续的 self.__WB_MANIFEST 字面量替换成预缓存清单
// （含内容 hash 作 revision）。字面量必须连续出现，否则 workbox 找不到注入点会报错。
// @ts-ignore __WB_MANIFEST 由构建注入，非标准全局属性
const WB_MANIFEST: ManifestEntry[] = (self.__WB_MANIFEST as ManifestEntry[]) || []

// 由清单内容派生版本号：任一资源变了 → 版本变 → 旧预缓存被清、新的重建。
// （不依赖 Date/随机，纯内容决定，幂等可复现）
function hashManifest(entries: typeof WB_MANIFEST): string {
  let h = 0
  const s = entries.map((e) => e.url + (e.revision ?? '')).join('|')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
const VERSION = hashManifest(WB_MANIFEST)
const PRECACHE = `fq-precache-${VERSION}`
const RUNTIME = 'fq-runtime' // vosk 模型/大文件运行时缓存，跨版本保留（模型不变，别重下 42MB）

const BASE = new URL(sw.registration.scope).pathname // 部署子路径，如 /focal-quest-app/
const INDEX_URL = BASE + 'index.html'

// 预缓存的 URL 集合（清单 url 是相对 base 的，补成绝对路径）
const PRECACHE_URLS = WB_MANIFEST.map((e) => new URL(e.url, sw.registration.scope).href)

// —— 补上跨域隔离三件套的响应头（对可读响应才包，opaque/status 0 原样返回）——
function withCoiHeaders(res: Response): Response {
  if (!res || res.status === 0 || res.type === 'opaqueredirect') return res
  const h = new Headers(res.headers)
  h.set('Cross-Origin-Opener-Policy', 'same-origin')
  h.set('Cross-Origin-Embedder-Policy', 'require-corp')
  h.set('Cross-Origin-Resource-Policy', 'cross-origin')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
}

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE)
      // 逐个 add，个别失败（如某资源 404）不至于让整包 addAll 失败
      await Promise.all(
        PRECACHE_URLS.map((u) => cache.add(u).catch(() => undefined)),
      )
      await sw.skipWaiting() // autoUpdate：新版本立即待命
    })(),
  )
})

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 清掉旧版本预缓存；保留当前预缓存和运行时缓存
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k.startsWith('fq-precache-') && k !== PRECACHE)
          .map((k) => caches.delete(k)),
      )
      await sw.clients.claim() // 立即接管所有页面
    })(),
  )
})

function isModelOrHeavy(url: URL): boolean {
  return url.pathname.includes('/models/') || url.pathname.endsWith('.tar.gz')
}

sw.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== sw.location.origin) return // 跨域资源不经手（本项目本无跨域）

  // 导航请求：SPA 一律回 index.html（补头后返回），离线也能开
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PRECACHE)
        const cached = await cache.match(INDEX_URL)
        if (cached) return withCoiHeaders(cached)
        try {
          return withCoiHeaders(await fetch(req))
        } catch {
          const fallback = await cache.match(INDEX_URL)
          return fallback ? withCoiHeaders(fallback) : new Response('offline', { status: 503 })
        }
      })(),
    )
    return
  }

  // vosk 模型/大文件：cache-first 存进跨版本保留的运行时缓存（首次联网下载，之后离线）
  if (isModelOrHeavy(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME)
        const cached = await cache.match(req)
        if (cached) return withCoiHeaders(cached)
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return withCoiHeaders(res)
      })(),
    )
    return
  }

  // 其它同源资源：cache-first（预缓存优先），未命中走网络并回填
  event.respondWith(
    (async () => {
      const pre = await caches.open(PRECACHE)
      const hit = await pre.match(req)
      if (hit) return withCoiHeaders(hit)
      try {
        const res = await fetch(req)
        if (res.ok && res.type === 'basic') {
          const rt = await caches.open(RUNTIME)
          rt.put(req, res.clone())
        }
        return withCoiHeaders(res)
      } catch {
        const rt = await caches.open(RUNTIME)
        const rtHit = await rt.match(req)
        if (rtHit) return withCoiHeaders(rtHit)
        return new Response('offline', { status: 503 })
      }
    })(),
  )
})
