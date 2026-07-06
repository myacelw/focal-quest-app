import { describe, it, expect } from 'vitest'
import { parseAnswer, isCorrect, labelOf } from './answer-mapping'

describe('parseAnswer', () => {
  it('maps chinese digits to numbers', () => {
    expect(parseAnswer('三')).toEqual({ kind: 'digit', value: 3 })
  })
  it('maps arabic digits', () => {
    expect(parseAnswer('7')).toEqual({ kind: 'digit', value: 7 })
  })
  it('maps directions', () => {
    expect(parseAnswer('上')).toEqual({ kind: 'direction', value: 'up' })
    expect(parseAnswer('右')).toEqual({ kind: 'direction', value: 'right' })
  })
  it('ignores surrounding noise and whitespace', () => {
    expect(parseAnswer('  嗯 五 ')).toEqual({ kind: 'digit', value: 5 })
  })
  it('takes the first recognizable token', () => {
    expect(parseAnswer('上三')).toEqual({ kind: 'direction', value: 'up' })
  })
  it('returns null when nothing matches', () => {
    expect(parseAnswer('你好')).toBeNull()
  })
})

describe('isCorrect', () => {
  it('true when kind and value match', () => {
    expect(isCorrect({ kind: 'digit', value: 3 }, { kind: 'digit', value: 3 })).toBe(true)
  })
  it('false on mismatch or null', () => {
    expect(isCorrect({ kind: 'digit', value: 3 }, { kind: 'digit', value: 4 })).toBe(false)
    expect(isCorrect(null, { kind: 'digit', value: 3 })).toBe(false)
  })
})

describe('labelOf', () => {
  it('renders digits and directions', () => {
    expect(labelOf({ kind: 'digit', value: 8 })).toBe('8')
    expect(labelOf({ kind: 'direction', value: 'down' })).toBe('下')
  })
})
