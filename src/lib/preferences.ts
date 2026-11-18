import { useEffect, useState } from 'react'

export const DAILY_XP_OPTIONS = [15, 30, 50, 100] as const
export type DailyXpOption = (typeof DAILY_XP_OPTIONS)[number]

const KEY_DAILY_XP = 'memo_daily_xp_goal'
const KEY_VIBRATION = 'memo_vibration_enabled'
const KEY_SOUND = 'memo_sound_enabled'
const PREFS_EVENT = 'memo:prefs-changed'

const DEFAULT_DAILY_XP = 30

function notifyPrefsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PREFS_EVENT))
  }
}

export function getDailyXpGoal(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_DAILY_XP
  try {
    const raw = Number(localStorage.getItem(KEY_DAILY_XP))
    return (DAILY_XP_OPTIONS as readonly number[]).includes(raw) ? raw : DEFAULT_DAILY_XP
  } catch {
    return DEFAULT_DAILY_XP
  }
}

export function setDailyXpGoal(xp: number): void {
  const normalized = (DAILY_XP_OPTIONS as readonly number[]).includes(xp) ? xp : DEFAULT_DAILY_XP
  try {
    localStorage.setItem(KEY_DAILY_XP, String(normalized))
  } catch {
    // ignore storage quota errors
  }
  notifyPrefsChanged()
}

export function isVibrationEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true
  try {
    return localStorage.getItem(KEY_VIBRATION) !== 'false'
  } catch {
    return true
  }
}

export function setVibrationEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(KEY_VIBRATION, enabled ? 'true' : 'false')
  } catch {
    // ignore
  }
  notifyPrefsChanged()
}

export function isSoundEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true
  try {
    return localStorage.getItem(KEY_SOUND) !== 'false'
  } catch {
    return true
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(KEY_SOUND, enabled ? 'true' : 'false')
  } catch {
    // ignore
  }
  notifyPrefsChanged()
}

export function usePreferences() {
  const [dailyXpGoal, setDailyXpState] = useState<number>(() => getDailyXpGoal())
  const [vibrationEnabled, setVibrationState] = useState<boolean>(() => isVibrationEnabled())
  const [soundEnabled, setSoundState] = useState<boolean>(() => isSoundEnabled())

  useEffect(() => {
    const sync = () => {
      setDailyXpState(getDailyXpGoal())
      setVibrationState(isVibrationEnabled())
      setSoundState(isSoundEnabled())
    }
    window.addEventListener(PREFS_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(PREFS_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return {
    dailyXpGoal,
    setDailyXpGoal,
    vibrationEnabled,
    setVibrationEnabled,
    soundEnabled,
    setSoundEnabled,
  }
}
