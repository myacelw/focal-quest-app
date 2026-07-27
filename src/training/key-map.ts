import type { Direction } from '../speech/answer-mapping'

/**
 * 键盘作答映射：方向键最直观；1-4 / asdf / jkl; 按屏幕按钮顺序（上下左右）映射，
 * 方便电脑调试与无语音场景。训练页与挑战页共用一份——两处各写一份必然漂移。
 * 若将来出现数字视标，同样把 1-9 对到对应选项即可。
 */
export const KEY_MAP: Record<string, Direction> = {
  arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
  '1': 'up', '2': 'down', '3': 'left', '4': 'right',
  a: 'up', s: 'down', d: 'left', f: 'right',
  j: 'up', k: 'down', l: 'left', ';': 'right',
}

/** KeyboardEvent.key → 方向；不认识的键返回 null */
export function dirForKey(key: string): Direction | null {
  return KEY_MAP[key.toLowerCase()] ?? null
}
