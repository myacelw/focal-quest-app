/**
 * 归属制邀请码：每个账号一个专属码，注册时记录 invited_by，注册来源可追溯。
 * 字符表去掉 O/0/I/1/L —— 家长常要手抄或电话口述给亲友，易混字符会变成支持负担。
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // 无 O 0 I 1 L
const LENGTH = 8

export function genInviteCode(rand: () => number = Math.random): string {
  let out = ''
  for (let i = 0; i < LENGTH; i++) {
    const idx = Math.floor(rand() * ALPHABET.length) % ALPHABET.length
    out += ALPHABET[idx]
  }
  return out
}

/** 只校验形状，不查库。输入先 trim+大写再判，容忍用户手抄时的空格与小写。 */
export function isValidInviteCodeShape(code: string): boolean {
  const s = code.trim().toUpperCase()
  if (s.length !== LENGTH) return false
  return [...s].every((c) => ALPHABET.includes(c))
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase()
}
