let lastVibrateAt = 0
const DEBOUNCE_MS = 250

/**
 * Короткий тактильный отклик (40 мс) при неверном ответе.
 * Не срабатывает чаще одного раза в 250 мс и уважает prefers-reduced-motion.
 */
export function vibrateError(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return
  }
  const now = Date.now()
  if (now - lastVibrateAt < DEBOUNCE_MS) return
  lastVibrateAt = now
  try {
    navigator.vibrate(40)
  } catch {
    // ignore unsupported environments
  }
}
