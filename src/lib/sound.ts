import { isSoundEnabled } from './preferences'

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!audioCtx) {
    audioCtx = new Ctx()
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  gainPeak: number,
  type: OscillatorType = 'sine',
): void {
  const t0 = ctx.currentTime + startOffset
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)

  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

/** Мягкий восходящий звук при верном ответе */
export function playSuccessSound(): void {
  if (!isSoundEnabled()) return
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    playTone(ctx, 523.25, 0, 0.13, 0.08, 'sine') // C5
    playTone(ctx, 659.25, 0.07, 0.18, 0.09, 'sine') // E5
  } catch {
    // ignore audio failures
  }
}

/** Спокойный приглушённый отклик при ошибке */
export function playErrorSound(): void {
  if (!isSoundEnabled()) return
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    playTone(ctx, 220, 0, 0.12, 0.07, 'triangle') // A3
    playTone(ctx, 185, 0.08, 0.16, 0.06, 'triangle') // F#3
  } catch {
    // ignore audio failures
  }
}

/** Светлый аккорд завершения урока */
export function playCompleteSound(): void {
  if (!isSoundEnabled()) return
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    playTone(ctx, 523.25, 0, 0.14, 0.075, 'sine') // C5
    playTone(ctx, 659.25, 0.08, 0.15, 0.075, 'sine') // E5
    playTone(ctx, 783.99, 0.16, 0.18, 0.08, 'sine') // G5
    playTone(ctx, 1046.5, 0.25, 0.34, 0.09, 'sine') // C6
  } catch {
    // ignore audio failures
  }
}
