/**
 * 挑战解锁判定：当天已完成正经训练（checkins 里有今天的行）才给玩（spec §7）。
 *
 * 参数用结构类型而不 import HomeStats：这一层是纯函数，不该被 data/checkin 拖进依赖。
 * 调用方传的就是 getHomeStats(today) 的结果——它在 IndexedDB 不可用时会降级为
 * checkedInToday:false，也即"读不出来就不给玩"，方向是安全的。
 * 加载中（null）同样返回 false，避免入口卡先闪一下再消失。
 */
export function challengeUnlocked(stats: { checkedInToday: boolean } | null | undefined): boolean {
  return stats?.checkedInToday === true
}
