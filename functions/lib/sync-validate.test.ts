import { describe, it, expect } from 'vitest'
import { validatePushRecords, KINDS } from './sync-validate'

function rec(over: Record<string, unknown> = {}) {
  return { uuid: 'checkin:2026-07-25', kind: 'checkin', payload: { date: '2026-07-25' }, updatedAt: 1_700_000_000_000, ...over }
}

describe('KINDS', () => {
  it('覆盖全部 8 类业务记录（与 Dexie 八张业务表一一对应）', () => {
    expect([...KINDS].sort()).toEqual(['badge', 'card', 'checkin', 'exam', 'monster', 'redemption', 'reward', 'session'])
  })
})

describe('validatePushRecords', () => {
  it('接受合法批次', () => {
    const r = validatePushRecords({ records: [rec()] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.records[0].uuid).toBe('checkin:2026-07-25')
  })

  it('profileId 缺省填 default（3c 才有多档案）', () => {
    const r = validatePushRecords({ records: [rec()] })
    expect(r.ok && r.records[0].profileId).toBe('default')
  })

  it('拒绝非数组或缺字段', () => {
    expect(validatePushRecords({}).ok).toBe(false)
    expect(validatePushRecords({ records: 'x' }).ok).toBe(false)
    expect(validatePushRecords({ records: [{ kind: 'checkin' }] }).ok).toBe(false)
  })

  it('拒绝未知 kind（白名单，防塞垃圾数据）', () => {
    const r = validatePushRecords({ records: [rec({ kind: 'evil' })] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('bad_kind')
  })

  it('拒绝超过条数上限的批次', () => {
    const many = Array.from({ length: 501 }, (_, i) => rec({ uuid: 'u' + i }))
    const r = validatePushRecords({ records: many })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('too_many')
  })

  it('拒绝单条 payload 过大的记录（16KB 上限）', () => {
    const r = validatePushRecords({ records: [rec({ payload: { blob: 'x'.repeat(20_000) } })] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('payload_too_large')
  })

  it('拒绝 uuid 过长或为空', () => {
    expect(validatePushRecords({ records: [rec({ uuid: '' })] }).ok).toBe(false)
    expect(validatePushRecords({ records: [rec({ uuid: 'x'.repeat(200) })] }).ok).toBe(false)
  })

  it('拒绝 updatedAt 非数字或为未来过远的时间（防投毒让 LWW 永久锁死）', () => {
    expect(validatePushRecords({ records: [rec({ updatedAt: 'now' })] }).ok).toBe(false)
    const farFuture = Date.now() + 400 * 86400_000
    const r = validatePushRecords({ records: [rec({ updatedAt: farFuture })] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('bad_updated_at')
  })

  it('容忍适度的时钟偏差（设备时间常有几分钟误差）', () => {
    const slightlyAhead = Date.now() + 5 * 60_000
    expect(validatePushRecords({ records: [rec({ updatedAt: slightlyAhead })] }).ok).toBe(true)
  })

  it('接受墓碑 payload', () => {
    const r = validatePushRecords({ records: [rec({ kind: 'exam', uuid: 'e1', payload: { _deleted: true } })] })
    expect(r.ok).toBe(true)
  })
})
