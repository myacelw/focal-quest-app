import { describe, it, expect } from 'vitest'
import { directionToRotation } from './TumblingE'

describe('directionToRotation', () => {
  it('right is the 0° baseline (E opening faces right)', () => {
    expect(directionToRotation('right')).toBe(0)
  })
  it('rotates clockwise for down/left/up', () => {
    expect(directionToRotation('down')).toBe(90)
    expect(directionToRotation('left')).toBe(180)
    expect(directionToRotation('up')).toBe(270)
  })
})
