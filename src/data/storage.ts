/**
 * 安全读写 localStorage。某些上下文（隐私模式、storage 分区、自动化沙箱）访问 storage
 * 会抛 "Access to storage is not allowed"，直接调用会崩；这里 try/catch 兜底，storage
 * 不可用时静默降级（读返回 null、写忽略），app 仍能跑（只是设置不持久）。
 */
export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage 不可用：静默降级 */
  }
}
