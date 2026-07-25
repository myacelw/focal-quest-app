/**
 * 注册/登录表单的本地前置校验。
 *
 * **客户端是唯一能校验密码强度的地方**：服务端只收到 PBKDF2 输出的 64 位 hex
 * （`functions/api/auth/register.ts` 只做形状校验，注释也把这件事推给客户端）。
 * spec §5.2 拿"310k 次拉伸"当防泄库屏障，前提是密码有熵——密码 "1" 走 31 万次迭代
 * 同样秒破，而这是儿童敏感个人信息的唯一屏障（一期无邮箱验证、无找回密码）。
 *
 * 邮箱也在本地先判：否则一个笔误要白跑一次 31 万次 PBKDF2 再吃服务端一个 400。
 */
export const MIN_PASSWORD_LENGTH = 8

export type CredentialError = 'badEmail' | 'badPassword'

/** 与服务端 functions/lib/crypto.ts 的 isValidEmail **逐字一致**：一个 @、两侧非空、无空白、域名含点 */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/** 通过返回 null，否则返回第一个问题（邮箱优先——一次只提示一个，家长不用猜） */
export function validateCredentials(email: string, password: string): CredentialError | null {
  const e = email.trim()
  if (e.length === 0 || e.length > 254 || !EMAIL_RE.test(e)) return 'badEmail'
  if (password.length < MIN_PASSWORD_LENGTH) return 'badPassword'
  return null
}
