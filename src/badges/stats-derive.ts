import type { SessionRow, CheckinRow } from '../data/db'
import { cpm } from '../training/cpm'

export interface BadgeStats {
  maxStreak: number
  totalSessions: number
  totalSec: number
  maxCpm: number
  maxAccuracy: number
  totalCorrect: number
}

export function deriveStats(sessions: SessionRow[], checkins: CheckinRow[]): BadgeStats {
  return {
    maxStreak: checkins.reduce((m, c) => Math.max(m, c.streak), 0),
    totalSessions: sessions.length,
    totalSec: sessions.reduce((a, s) => a + s.elapsedSec, 0),
    maxCpm: sessions.reduce((m, s) => Math.max(m, cpm(s.flips, s.elapsedSec)), 0),
    maxAccuracy: sessions.reduce((m, s) => (s.answered >= 5 ? Math.max(m, s.correct / s.answered) : m), 0),
    totalCorrect: sessions.reduce((a, s) => a + s.correct, 0),
  }
}
