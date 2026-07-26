import { describe, it, expect } from 'vitest'
import { metricLabel, kindLabelKey, shortDate, isoDate } from './format'

describe('metricLabel', () => {
  it('已知 metric 映射到专属文案键', () => {
    expect(metricLabel('register.ok')).toEqual({ key: 'admin.metric.register.ok' })
    expect(metricLabel('login.ratelimit')).toEqual({ key: 'admin.metric.login.ratelimit' })
    expect(metricLabel('active.user')).toEqual({ key: 'admin.metric.active.user' })
  })

  it('push.reject.<reason> 是一族动态 metric，用同一个键 + reason 参数', () => {
    expect(metricLabel('push.reject.bad_kind')).toEqual({
      key: 'admin.metric.pushReject', params: { reason: 'bad_kind' },
    })
    expect(metricLabel('push.reject.quota')).toEqual({
      key: 'admin.metric.pushReject', params: { reason: 'quota' },
    })
  })

  it('未知 metric 返回 null（界面直接显示原始 metric，不吞掉新指标）', () => {
    expect(metricLabel('something.new')).toBe(null)
  })

  it('rl.* 也返回 null——服务端本就不下发它，这里是第三道保险', () => {
    expect(metricLabel('rl.login.a@b.com.1.2.3.4.487000')).toBe(null)
  })
})

describe('kindLabelKey', () => {
  it('7 类记录各有文案键', () => {
    expect(kindLabelKey('session')).toBe('admin.kind.session')
    expect(kindLabelKey('redemption')).toBe('admin.kind.redemption')
  })

  it('未知 kind 返回 null（界面显示原始 kind）', () => {
    expect(kindLabelKey('profile')).toBe(null)
  })
})

describe('shortDate', () => {
  it('YYYY-MM-DD 截成 MM-DD（曲线标签只有两端有空间）', () => {
    expect(shortDate('2026-07-26')).toBe('07-26')
  })

  it('非法输入原样返回，不抛错（后台不该因为一条脏数据白屏）', () => {
    expect(shortDate('')).toBe('')
    expect(shortDate('whatever')).toBe('whatever')
  })
})

describe('isoDate', () => {
  it('毫秒转东八区日期串（与服务端 tzDate 的分日口径一致，同一屏不出现两套时区）', () => {
    expect(isoDate(Date.UTC(2026, 6, 26, 23, 59))).toBe('2026-07-27') // 北京 7/27 07:59
  })

  it('日界在 16:00Z：15:59Z 还是前一天，16:00Z 起是新一天', () => {
    expect(isoDate(Date.UTC(2026, 6, 25, 15, 59))).toBe('2026-07-25')
    expect(isoDate(Date.UTC(2026, 6, 25, 16, 0))).toBe('2026-07-26')
  })

  it('非法毫秒返回 —，不抛错', () => {
    expect(isoDate(Number.NaN)).toBe('—')
  })
})
