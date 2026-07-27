type SfxKind = 'correct' | 'wrong' | 'flip' | 'finish' | 'checkin' | 'badge' | 'egg' | 'timeout' | 'shiny'

let ctx: AudioContext | null = null
let muted = false

function audioCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

function tone(freq: number, startOffset: number, dur: number, gain = 0.2, type: OscillatorType = 'sine'): void {
  const c = audioCtx()
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  osc.connect(g)
  g.connect(c.destination)
  const t0 = c.currentTime + startOffset
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.start(t0)
  osc.stop(t0 + dur)
}

export function setMuted(m: boolean): void {
  muted = m
}

export function playSfx(kind: SfxKind): void {
  if (muted) return
  switch (kind) {
    case 'correct':
      tone(660, 0, 0.12)
      tone(880, 0.1, 0.14)
      break
    case 'wrong':
      tone(300, 0, 0.22, 0.15)
      break
    // 超时 = 没跟上，不是答错（spec §4.5）：用一个短促下滑音，和 wrong 那记刺耳低频区分开，
    // 好让孩子听得出自己是"看错了"还是"没跟上"——这正是结算页把两者分成两格的同一个理由。
    case 'timeout':
      tone(520, 0, 0.09, 0.13, 'triangle')
      tone(390, 0.08, 0.12, 0.11, 'triangle')
      break
    case 'flip':
      tone(400, 0, 0.05, 0.17, 'square')
      tone(600, 0.055, 0.06, 0.14, 'square')
      break
    case 'finish':
      ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.16))
      break
    case 'checkin':
      ;[523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.1, 0.18))
      break
    case 'badge':
      ;[659, 988, 1319, 1760].forEach((f, i) => tone(f, i * 0.09, 0.2))
      break
    case 'egg':
      ;[784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.08, 0.16))
      break
    // 闪卡 = 抽到最稀有的一档。**必须与普通/稀有的庆祝音区分开**：界面刚用金边分出的
    // 稀有度，若耳朵里是同一个声音就等于没分（与 'timeout' 不能沿用 'wrong' 同一个理由）。
    // 更高、更亮、多一段上冲。
    case 'shiny':
      ;[1047, 1568, 2093, 2637, 3136].forEach((f, i) => tone(f, i * 0.07, 0.24, 0.16, 'triangle'))
      break
  }
}
