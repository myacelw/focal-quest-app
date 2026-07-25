/**
 * 同步引擎的"唤一下"钩子。单独成文件是为了**打断循环依赖**：
 * data/api.ts 入队后要唤引擎，而引擎要调 api.ts 的 pushCheckin 写回重算后的打卡行。
 * 让 api 只依赖这个零依赖的小注册表，引擎启动时把实现注册进来即可。
 */
type Kick = () => void

let impl: Kick | null = null

export function setKick(f: Kick): void {
  impl = f
}

/** 引擎未启动（没登录、纯本地部署、单测）时是空操作 */
export function kickSync(): void {
  impl?.()
}
