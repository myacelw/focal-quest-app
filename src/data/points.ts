/** 连续加成系数：streak 1→1.0，每多一天 +0.1，封顶 2.0（streak≥11） */
export function coef(streak: number): number {
  return 1 + Math.min(Math.max(streak - 1, 0), 10) * 0.1
}

/** 当日积分 = floor((答对数×5 + 打卡奖励30) × 连续系数) */
export function dailyPoints(correct: number, streak: number): number {
  return Math.floor((correct * 5 + 30) * coef(streak))
}
