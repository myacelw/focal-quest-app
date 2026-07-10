import { describe, it, expect } from 'vitest'
import { buildReminderIcs } from './ics'

describe('buildReminderIcs', () => {
  const ics = buildReminderIcs('2026-07-10', '19:00', '该练视力啦', '打开变焦大冒险，练几分钟')

  it('每日重复 + DTSTART 拼接（去分隔符）', () => {
    expect(ics).toContain('RRULE:FREQ=DAILY')
    expect(ics).toContain('DTSTART:20260710T190000')
  })
  it('注入 SUMMARY / DESCRIPTION 与提醒 VALARM', () => {
    expect(ics).toContain('SUMMARY:该练视力啦')
    expect(ics).toContain('DESCRIPTION:打开变焦大冒险，练几分钟')
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain('TRIGGER:PT0M')
  })
  it('合法日历骨架 + CRLF 行尾', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('\r\n')
  })
})
