/**
 * 把 public/ 下的资源路径转成 base 相对，兼容 GitHub Pages 子路径部署
 * （如部署在 https://user.github.io/focal-quest-app/ 时 BASE_URL = '/focal-quest-app/'）。
 * 传入以 '/' 开头的绝对路径，返回带 base 前缀的可用 URL。
 */
export function asset(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, '')
}
