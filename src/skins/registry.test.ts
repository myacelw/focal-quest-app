import { describe, it, expect } from 'vitest'
import { SKINS, getSkin } from './registry'

describe('skin registry', () => {
  it('has plain and space', () => {
    expect(SKINS.map((s) => s.id)).toEqual(['plain', 'space'])
  })
  it('getSkin returns the matching skin', () => {
    expect(getSkin('space').name).toBe('太空射击')
  })
  it('getSkin falls back to first (plain) on unknown id', () => {
    expect(getSkin('nope').id).toBe('plain')
  })
})
