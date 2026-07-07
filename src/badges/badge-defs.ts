export type Rarity = 'bronze' | 'silver' | 'gold' | 'rainbow'
export type Metric = 'maxStreak' | 'totalSessions' | 'totalSec' | 'maxCpm' | 'maxAccuracy' | 'totalCorrect'

export interface BadgeDef {
  id: string
  name: string
  emoji: string
  metric: Metric
  threshold: number
  rarity: Rarity
}

export const BADGES: BadgeDef[] = [
  { id: 'streak-2', name: '小火苗', emoji: '🌟', metric: 'maxStreak', threshold: 2, rarity: 'bronze' },
  { id: 'streak-3', name: '闪闪萤火虫', emoji: '✨', metric: 'maxStreak', threshold: 3, rarity: 'bronze' },
  { id: 'streak-5', name: '暖暖小太阳', emoji: '🔆', metric: 'maxStreak', threshold: 5, rarity: 'bronze' },
  { id: 'streak-7', name: '一周小火龙', emoji: '🔥', metric: 'maxStreak', threshold: 7, rarity: 'bronze' },
  { id: 'streak-10', name: '十日星星侠', emoji: '⭐', metric: 'maxStreak', threshold: 10, rarity: 'silver' },
  { id: 'streak-15', name: '半月月亮猫', emoji: '🎖️', metric: 'maxStreak', threshold: 15, rarity: 'silver' },
  { id: 'streak-21', name: '习惯小水晶', emoji: '💠', metric: 'maxStreak', threshold: 21, rarity: 'silver' },
  { id: 'streak-30', name: '月度小皇冠', emoji: '👑', metric: 'maxStreak', threshold: 30, rarity: 'gold' },
  { id: 'streak-60', name: '双月钻石龙', emoji: '💎', metric: 'maxStreak', threshold: 60, rarity: 'gold' },
  { id: 'streak-100', name: '百日彩虹凤凰', emoji: '🏵️', metric: 'maxStreak', threshold: 100, rarity: 'rainbow' },
  { id: 'sessions-1', name: '破土小芽', emoji: '🌱', metric: 'totalSessions', threshold: 1, rarity: 'bronze' },
  { id: 'sessions-5', name: '冒险小苗', emoji: '🌿', metric: 'totalSessions', threshold: 5, rarity: 'bronze' },
  { id: 'sessions-10', name: '大力小勇士', emoji: '💪', metric: 'totalSessions', threshold: 10, rarity: 'silver' },
  { id: 'sessions-25', name: '机灵小工匠', emoji: '🔧', metric: 'totalSessions', threshold: 25, rarity: 'silver' },
  { id: 'sessions-50', name: '半百小冠军', emoji: '🏆', metric: 'totalSessions', threshold: 50, rarity: 'gold' },
  { id: 'sessions-100', name: '百炼小铁人', emoji: '⚙️', metric: 'totalSessions', threshold: 100, rarity: 'gold' },
  { id: 'sessions-200', name: '训练大师石像', emoji: '🗿', metric: 'totalSessions', threshold: 200, rarity: 'rainbow' },
  { id: 'time-30m', name: '小闹钟卫士', emoji: '⏱️', metric: 'totalSec', threshold: 1800, rarity: 'bronze' },
  { id: 'time-2h', name: '沙漏小精灵', emoji: '⌛', metric: 'totalSec', threshold: 7200, rarity: 'silver' },
  { id: 'time-10h', name: '时光老爷爷钟', emoji: '🕰️', metric: 'totalSec', threshold: 36000, rarity: 'gold' },
  { id: 'cpm-6', name: '稳稳小乌龟', emoji: '🐢', metric: 'maxCpm', threshold: 6, rarity: 'bronze' },
  { id: 'cpm-8', name: '蹦跳小兔子', emoji: '🐰', metric: 'maxCpm', threshold: 8, rarity: 'bronze' },
  { id: 'cpm-10', name: '疾风小猎豹', emoji: '🐆', metric: 'maxCpm', threshold: 10, rarity: 'silver' },
  { id: 'cpm-12', name: '冲天小火箭', emoji: '🚀', metric: 'maxCpm', threshold: 12, rarity: 'gold' },
  { id: 'cpm-15', name: '闪电小超人', emoji: '⚡', metric: 'maxCpm', threshold: 15, rarity: 'rainbow' },
  { id: 'acc-90', name: '神箭小射手', emoji: '🎯', metric: 'maxAccuracy', threshold: 0.9, rarity: 'silver' },
  { id: 'acc-100', name: '火眼金睛', emoji: '💯', metric: 'maxAccuracy', threshold: 1.0, rarity: 'rainbow' },
  { id: 'correct-100', name: '百题小学霸', emoji: '✅', metric: 'totalCorrect', threshold: 100, rarity: 'silver' },
  { id: 'correct-500', name: '五百智慧星', emoji: '📗', metric: 'totalCorrect', threshold: 500, rarity: 'gold' },
  { id: 'correct-1000', name: '千题大博士', emoji: '📚', metric: 'totalCorrect', threshold: 1000, rarity: 'rainbow' },
]
