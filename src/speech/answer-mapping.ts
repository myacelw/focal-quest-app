export type Direction = 'up' | 'down' | 'left' | 'right'

export type Answer =
  | { kind: 'digit'; value: number }
  | { kind: 'direction'; value: Direction }

const DIGIT_MAP: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  幺: 1, 两: 2,
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
}

const DIRECTION_MAP: Record<string, Direction> = {
  上: 'up', 下: 'down', 左: 'left', 右: 'right',
}

const DIRECTION_LABEL: Record<Direction, string> = {
  up: '上', down: '下', left: '左', right: '右',
}

/**
 * 从语音识别的原始文本中提取第一个可识别的答案。
 * 去掉空白，按字符顺序取首个命中的数字或方向；都不命中返回 null。
 */
export function parseAnswer(raw: string): Answer | null {
  const text = raw.replace(/\s+/g, '')
  for (const ch of text) {
    if (ch in DIGIT_MAP) return { kind: 'digit', value: DIGIT_MAP[ch] }
    if (ch in DIRECTION_MAP) return { kind: 'direction', value: DIRECTION_MAP[ch] }
  }
  return null
}

export function isCorrect(parsed: Answer | null, expected: Answer): boolean {
  if (parsed === null) return false
  return parsed.kind === expected.kind && parsed.value === expected.value
}

export function labelOf(a: Answer): string {
  return a.kind === 'digit' ? String(a.value) : DIRECTION_LABEL[a.value]
}
