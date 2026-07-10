/**
 * 生成每日重复的日历提醒文件（.ics 文本）。
 * 用浮动本地时间（无 TZID）——每天按墙钟同一时刻触发，无时区漂移，适合"每天晚上 7 点"。
 * @param startDate YYYY-MM-DD（今天）
 * @param time      HH:MM
 */
export function buildReminderIcs(startDate: string, time: string, summary: string, description: string): string {
  const dt = `${startDate.replace(/-/g, '')}T${time.replace(/:/g, '')}00`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FocalQuest//Reminder//EN',
    'BEGIN:VEVENT',
    'UID:focalquest-daily-reminder',
    `DTSTART:${dt}`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${summary}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n') + '\r\n'
}
