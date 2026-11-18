import { formatRange } from '../bible/refs'
import { PASS_SCORE } from './config'
import { computeStreak, localDateKey, localDayDiff, shiftDateKey } from '../reminders/engine'
import type { LessonRecord, VerseReview, VerseState } from '../types'

export const HEATMAP_WEEKS = 12
const DAY_MS = 24 * 60 * 60 * 1000

const SHORT_MONTHS_RU = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
] as const

const GENITIVE_MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
] as const

export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export interface HeatmapDay {
  dateKey: string
  /** 0 = Пн ... 6 = Вс */
  weekday: number
  /** 0..11 слева направо */
  weekIndex: number
  xp: number
  lessons: number
  /** 0 = нет активности, 1..4 = интенсивность */
  level: 0 | 1 | 2 | 3 | 4
  isToday: boolean
  isFuture: boolean
}

export interface HeatmapMonthLabel {
  weekIndex: number
  label: string
}

export interface ActivityStats {
  currentStreak: number
  bestStreak: number
  practicedToday: boolean
  todayKey: string
  todayXp: number
  todayLessons: number
  activeDaysTotal: number
  heatmapDays: HeatmapDay[]
  monthLabels: HeatmapMonthLabel[]
}

export interface TodayActivitySummary {
  currentStreak: number
  practicedToday: boolean
  todayKey: string
  todayXp: number
}

export interface HardVerseItem {
  verse: VerseState
  refLabel: string
}

function weekdayMon0(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return 0
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

function shortMonthRu(dateKey: string): string {
  const m = Number(dateKey.slice(5, 7))
  return SHORT_MONTHS_RU[m - 1] ?? ''
}

export function formatDateKeyRu(dateKey: string): string {
  const m = Number(dateKey.slice(5, 7))
  const d = Number(dateKey.slice(8, 10))
  const monthName = GENITIVE_MONTHS_RU[m - 1]
  if (!d || !monthName) return dateKey
  return `${d} ${monthName}`
}

function xpToHeatLevel(xp: number, lessons: number): 0 | 1 | 2 | 3 | 4 {
  if (xp <= 0 && lessons <= 0) return 0
  if (xp < 20) return 1
  if (xp < 45) return 2
  if (xp < 80) return 3
  return 4
}

/** Быстрая сводка только для главного экрана (без построения 84-дневной теплокарты) */
export function computeTodayActivity(
  lessons: Pick<LessonRecord, 'createdAt' | 'verseKeys' | 'xp'>[],
  recentReviews: Pick<VerseReview, 'createdAt' | 'xp'>[],
  now: number,
  timeZone = getUserTimeZone(),
): TodayActivitySummary {
  const todayKey = localDateKey(now, timeZone)
  const { streak: currentStreak, practicedToday } = computeStreak(lessons, now, timeZone)
  const cutoff = now - 36 * 60 * 60 * 1000

  let lessonXpToday = 0
  for (const l of lessons) {
    if (l.verseKeys.length === 0 || l.createdAt < cutoff) continue
    if (localDateKey(l.createdAt, timeZone) === todayKey) {
      lessonXpToday += l.xp || 0
    }
  }

  let reviewXpToday = 0
  for (const r of recentReviews) {
    if (r.createdAt < cutoff) continue
    if (localDateKey(r.createdAt, timeZone) === todayKey) {
      reviewXpToday += r.xp || 0
    }
  }

  return {
    currentStreak,
    practicedToday,
    todayKey,
    todayXp: Math.max(reviewXpToday, lessonXpToday),
  }
}

export function computeActivityStats(
  lessons: Pick<LessonRecord, 'createdAt' | 'verseKeys' | 'xp'>[],
  reviews: Pick<VerseReview, 'createdAt' | 'xp'>[],
  now: number,
  timeZone = getUserTimeZone(),
): ActivityStats {
  const todayKey = localDateKey(now, timeZone)
  const { streak: currentStreak, practicedToday } = computeStreak(lessons, now, timeZone)

  const lessonsByDay = new Map<string, number>()
  const lessonXpByDay = new Map<string, number>()
  const reviewXpByDay = new Map<string, number>()

  for (const l of lessons) {
    if (l.verseKeys.length === 0) continue
    const key = localDateKey(l.createdAt, timeZone)
    lessonsByDay.set(key, (lessonsByDay.get(key) ?? 0) + 1)
    lessonXpByDay.set(key, (lessonXpByDay.get(key) ?? 0) + (l.xp || 0))
  }

  // Для теплокарты и сегодняшнего XP нужны только записи в пределах окна 12 недель (+ буфер 2 дня)
  const reviewWindowCutoff = now - (HEATMAP_WEEKS * 7 + 2) * DAY_MS
  for (const r of reviews) {
    if (r.createdAt < reviewWindowCutoff) continue
    const key = localDateKey(r.createdAt, timeZone)
    reviewXpByDay.set(key, (reviewXpByDay.get(key) ?? 0) + (r.xp || 0))
  }

  const dayXp = (key: string): number =>
    Math.max(reviewXpByDay.get(key) ?? 0, lessonXpByDay.get(key) ?? 0)

  // Лучшая серия за всё время по дням с завершёнными уроками
  const sortedActiveDays = Array.from(lessonsByDay.keys()).sort()
  let bestStreak = 0
  let run = 0
  let prevDay: string | null = null
  for (const day of sortedActiveDays) {
    if (prevDay && localDayDiff(day, prevDay) === 1) {
      run += 1
    } else {
      run = 1
    }
    if (run > bestStreak) bestStreak = run
    prevDay = day
  }
  if (currentStreak > bestStreak) bestStreak = currentStreak

  // Сетка календаря: HEATMAP_WEEKS недель, выровненных по Пн–Вс
  const todayWd = weekdayMon0(todayKey)
  const endSundayKey = shiftDateKey(todayKey, 6 - todayWd)
  const totalDays = HEATMAP_WEEKS * 7
  const startMondayKey = shiftDateKey(endSundayKey, -(totalDays - 1))

  const heatmapDays: HeatmapDay[] = []
  const monthLabels: HeatmapMonthLabel[] = []
  let lastLabeledMonth = ''

  for (let i = 0; i < totalDays; i++) {
    const dateKey = shiftDateKey(startMondayKey, i)
    const weekIndex = Math.floor(i / 7)
    const weekday = i % 7
    const isFuture = localDayDiff(dateKey, todayKey) > 0
    const xp = isFuture ? 0 : dayXp(dateKey)
    const dayLessons = isFuture ? 0 : (lessonsByDay.get(dateKey) ?? 0)

    if (weekday === 0 && !isFuture) {
      const month = dateKey.slice(0, 7)
      if (month !== lastLabeledMonth) {
        monthLabels.push({ weekIndex, label: shortMonthRu(dateKey) })
        lastLabeledMonth = month
      }
    }

    heatmapDays.push({
      dateKey,
      weekday,
      weekIndex,
      xp,
      lessons: dayLessons,
      level: isFuture ? 0 : xpToHeatLevel(xp, dayLessons),
      isToday: dateKey === todayKey,
      isFuture,
    })
  }

  return {
    currentStreak,
    bestStreak,
    practicedToday,
    todayKey,
    todayXp: dayXp(todayKey),
    todayLessons: lessonsByDay.get(todayKey) ?? 0,
    activeDaysTotal: lessonsByDay.size,
    heatmapDays,
    monthLabels,
  }
}

export function getHardestVerses(verses: VerseState[], limit = 3): HardVerseItem[] {
  return verses
    .filter((v) => v.lapses > 0 || (v.lastScore !== null && v.lastScore < PASS_SCORE))
    .sort((a, b) => {
      if (b.lapses !== a.lapses) return b.lapses - a.lapses
      const scoreA = a.lastScore ?? 100
      const scoreB = b.lastScore ?? 100
      if (scoreA !== scoreB) return scoreA - scoreB
      return a.strength - b.strength
    })
    .slice(0, limit)
    .map((verse) => ({
      verse,
      refLabel: formatRange({
        book: verse.book,
        chapter: verse.chapter,
        from: verse.verse,
        to: verse.verse,
      }),
    }))
}
