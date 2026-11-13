import type { LessonRecord, VerseReview, VerseState } from '../types'

const DAY = 24 * 60 * 60 * 1000
const DELIVERY_WINDOW_MIN = 180

export interface ReminderSettings {
  /** Мастер-переключатель фоновых Web Push уведомлений */
  pushEnabled: boolean
  /** 1. Ежедневное напоминание об уроке по расписанию */
  dailyEnabled: boolean
  dailyTime: string // HH:MM
  /** 2. Защита серии (вечернее напоминание) */
  streakEnabled: boolean
  streakTime: string // HH:MM
  /** 3. Бережное возвращение после паузы (3, 7, 14 дней) */
  inactivityEnabled: boolean
  /** 4. Предложение добавить новый стих, когда очередь пуста */
  emptyQueueEnabled: boolean
  /** 5. Итоги недели (внутри приложения) */
  weeklyDigestEnabled: boolean
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  pushEnabled: false,
  dailyEnabled: true,
  dailyTime: '09:00',
  streakEnabled: true,
  streakTime: '20:30',
  inactivityEnabled: true,
  emptyQueueEnabled: true,
  weeklyDigestEnabled: true,
}

export interface VerseScheduleItem {
  strength: number
  nextReviewAt: number
}

export interface ReminderSnapshot {
  timezone: string
  /** YYYY-MM-DD последнего пройденного урока в локальной таймзоне пользователя */
  lastLessonDateKey: string | null
  /** Серия на дату lastLessonDateKey */
  streak: number
  /** Облегчённое расписание стихов, чтобы сервер точно знал due/new на будущие дни */
  verseSchedule: VerseScheduleItem[]
  updatedAt: number
}

export type PushNotificationKind = 'daily' | 'streak' | 'inactivity' | 'emptyQueue'

export interface PushMessageCandidate {
  kind: PushNotificationKind
  dedupeKey: string
  tag: string
  title: string
  body: string
  url: string
}

export interface SentNotificationEntry {
  key: string
  kind: PushNotificationKind
  dateKey: string
  sentAt: number
}

export interface PushScheduleState {
  settings: ReminderSettings
  snapshot: ReminderSnapshot
  subscribedAt: number
  sentLog: SentNotificationEntry[]
}

export interface WeeklyDigest {
  /** Ключ текущей недели YYYY-MM-DD (понедельник) */
  weekKey: string
  lessonsCount: number
  versesStrengthened: number
  versesLearnedTotal: number
  weekXp: number
  totalXp: number
  streak: number
}

export function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n))
  const mod100 = abs % 100
  const mod10 = abs % 10
  if (mod100 >= 11 && mod100 <= 19) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

function safeTimeZone(tz?: string): string {
  if (!tz) return 'UTC'
  try {
    Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(0)
    return tz
  } catch {
    return 'UTC'
  }
}

export function localDateKey(timestamp: number, timeZone?: string): string {
  const tz = safeTimeZone(timeZone)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

export function localTimeMinutes(timestamp: number, timeZone?: string): number {
  const tz = safeTimeZone(timeZone)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp))
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

export function parseHHMM(hhmm: string, fallbackMinutes = 9 * 60): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim())
  if (!m) return fallbackMinutes
  const h = Math.min(23, Math.max(0, Number(m[1])))
  const min = Math.min(59, Math.max(0, Number(m[2])))
  return h * 60 + min
}

function dateKeyToEpochDay(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return 0
  return Math.floor(Date.UTC(y, m - 1, d) / DAY)
}

export function localDayDiff(newerDateKey: string, olderDateKey: string): number {
  return dateKeyToEpochDay(newerDateKey) - dateKeyToEpochDay(olderDateKey)
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const epochDay = dateKeyToEpochDay(dateKey) + deltaDays
  const dt = new Date(epochDay * DAY)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Вычисляет текущую серию дней (streak) на основе завершённых уроков.
 */
export function computeStreak(
  lessons: Pick<LessonRecord, 'createdAt' | 'verseKeys'>[],
  now: number,
  timeZone?: string,
): {
  streak: number
  practicedToday: boolean
  lastLessonDateKey: string | null
  daysSinceLastLesson: number | null
} {
  const completed = lessons.filter((l) => l.verseKeys.length > 0)
  if (completed.length === 0) {
    return { streak: 0, practicedToday: false, lastLessonDateKey: null, daysSinceLastLesson: null }
  }

  const daySet = new Set<string>()
  let latestTs = 0
  for (const l of completed) {
    daySet.add(localDateKey(l.createdAt, timeZone))
    if (l.createdAt > latestTs) latestTs = l.createdAt
  }

  const todayKey = localDateKey(now, timeZone)
  const lastLessonDateKey = localDateKey(latestTs, timeZone)
  const daysSinceLastLesson = localDayDiff(todayKey, lastLessonDateKey)
  const practicedToday = daySet.has(todayKey)

  let cursor = practicedToday ? todayKey : shiftDateKey(todayKey, -1)
  if (!daySet.has(cursor)) {
    return { streak: 0, practicedToday, lastLessonDateKey, daysSinceLastLesson }
  }

  let streak = 0
  while (daySet.has(cursor)) {
    streak++
    cursor = shiftDateKey(cursor, -1)
  }

  return { streak, practicedToday, lastLessonDateKey, daysSinceLastLesson }
}

export function buildReminderSnapshot(
  verses: Pick<VerseState, 'strength' | 'nextReviewAt'>[],
  lessons: Pick<LessonRecord, 'createdAt' | 'verseKeys'>[],
  now: number,
  timeZone?: string,
): ReminderSnapshot {
  const tz = safeTimeZone(timeZone)
  const streakInfo = computeStreak(lessons, now, tz)
  return {
    timezone: tz,
    lastLessonDateKey: streakInfo.lastLessonDateKey,
    streak: streakInfo.streak,
    verseSchedule: verses.map((v) => ({
      strength: v.strength,
      nextReviewAt: v.nextReviewAt,
    })),
    updatedAt: now,
  }
}

export function computeQueueCounts(verseSchedule: VerseScheduleItem[], now: number): {
  totalCount: number
  dueCount: number
  newCount: number
} {
  let dueCount = 0
  let newCount = 0
  for (const v of verseSchedule) {
    if (v.strength === 0) newCount++
    else if (now >= v.nextReviewAt) dueCount++
  }
  return { totalCount: verseSchedule.length, dueCount, newCount }
}

export function formatDailyBody(dueCount: number, newCount: number): string {
  if (dueCount > 0 && newCount > 0) {
    const dueLabel = pluralRu(dueCount, 'стих', 'стиха', 'стихов')
    const newVerb = newCount % 10 === 1 && newCount % 100 !== 11 ? 'новый ждёт' : 'новых ждут'
    return `Пора повторить ${dueCount} ${dueLabel}, а ещё ${newCount} ${newVerb} старта`
  }
  if (dueCount > 0) {
    return `Пора повторить ${dueCount} ${pluralRu(dueCount, 'стих', 'стиха', 'стихов')} — ваш ежедневный урок готов`
  }
  const verb = newCount % 10 === 1 && newCount % 100 !== 11 ? 'новый стих ждёт' : `${pluralRu(newCount, 'новый стих', 'новых стиха', 'новых стихов')} ждут`
  return newCount === 1
    ? 'Вас ждёт 1 новый стих — самое время начать урок'
    : `${newCount} ${verb.replace(/^\d+\s*/, '')} старта — начнём урок?`
}

/**
 * Определяет, какие push-уведомления должны быть отправлены в момент `now`.
 */
export function evaluateDuePushNotifications(
  state: PushScheduleState,
  now: number,
): PushMessageCandidate[] {
  const { settings, snapshot, sentLog, subscribedAt } = state
  if (!settings.pushEnabled) return []

  const tz = safeTimeZone(snapshot.timezone)
  const todayKey = localDateKey(now, tz)
  const nowMinutes = localTimeMinutes(now, tz)
  const subscribedDateKey = localDateKey(subscribedAt, tz)
  const subscribedMinutes = localTimeMinutes(subscribedAt, tz)

  const practicedToday = snapshot.lastLessonDateKey === todayKey
  if (practicedToday) {
    // Пользователь уже занимался сегодня — ни утреннее, ни вечернее напоминание не нужно.
    return []
  }

  const daysSinceLastLesson = snapshot.lastLessonDateKey
    ? localDayDiff(todayKey, snapshot.lastLessonDateKey)
    : null

  const { totalCount, dueCount, newCount } = computeQueueCounts(snapshot.verseSchedule, now)
  const sentKeys = new Set(sentLog.map((e) => e.key))
  const out: PushMessageCandidate[] = []

  const isInTimeWindow = (targetHHMM: string, fallbackMin: number): boolean => {
    const targetMin = parseHHMM(targetHHMM, fallbackMin)
    const elapsed = nowMinutes - targetMin
    if (elapsed < 0 || elapsed > DELIVERY_WINDOW_MIN) return false
    // Если подписку только что включили уже после наступления времени напоминания сегодня,
    // не шлём «вдогонку» сразу в ту же минуту (подождём следующего окна / завтра).
    if (subscribedDateKey === todayKey && subscribedMinutes > targetMin) return false
    return true
  }

  // 1. Бережное возвращение после паузы (3, 7, 14 дней)
  const isInactivityMilestone =
    daysSinceLastLesson === 3 || daysSinceLastLesson === 7 || daysSinceLastLesson === 14
  let firedInactivityToday = false

  if (
    settings.inactivityEnabled &&
    totalCount > 0 &&
    isInactivityMilestone &&
    isInTimeWindow(settings.dailyTime, 9 * 60)
  ) {
    const dedupeKey = `inactivity:${todayKey}:${daysSinceLastLesson}d`
    if (!sentKeys.has(dedupeKey)) {
      const body =
        dueCount > 0
          ? `Давно не заглядывали — освежите ${dueCount} ${pluralRu(dueCount, 'стих', 'стиха', 'стихов')} за пару минут, чтобы интервалы не сбились`
          : 'Давно не заглядывали — уделите пару минут повторению, чтобы интервалы не сбились'
      out.push({
        kind: 'inactivity',
        dedupeKey,
        tag: `inactivity-${todayKey}`,
        title: 'Скучаем по вашим занятиям',
        body,
        url: '/#/lesson',
      })
      firedInactivityToday = true
    } else {
      firedInactivityToday = true
    }
  }

  // 2. Очередь пуста — предложить добавить новый стих (не чаще раза в 3 дня)
  if (
    settings.emptyQueueEnabled &&
    totalCount > 0 &&
    dueCount === 0 &&
    newCount === 0 &&
    !firedInactivityToday &&
    isInTimeWindow(settings.dailyTime, 9 * 60)
  ) {
    const dedupeKey = `emptyQueue:${todayKey}`
    const lastEmpty = [...sentLog]
      .filter((e) => e.kind === 'emptyQueue')
      .sort((a, b) => b.sentAt - a.sentAt)[0]
    const cooledDown = !lastEmpty || localDayDiff(todayKey, lastEmpty.dateKey) >= 3
    if (!sentKeys.has(dedupeKey) && cooledDown) {
      out.push({
        kind: 'emptyQueue',
        dedupeKey,
        tag: `empty-queue-${todayKey}`,
        title: 'Очередь повторений пуста',
        body: 'Все ваши стихи закреплены на сегодня. Хотите добавить новый отрывок из Библии?',
        url: '/#/add',
      })
    }
  }

  // 3. Ежедневное напоминание об уроке по расписанию
  if (
    settings.dailyEnabled &&
    (dueCount > 0 || newCount > 0) &&
    !firedInactivityToday &&
    isInTimeWindow(settings.dailyTime, 9 * 60)
  ) {
    const dedupeKey = `daily:${todayKey}`
    if (!sentKeys.has(dedupeKey)) {
      out.push({
        kind: 'daily',
        dedupeKey,
        tag: `daily-${todayKey}`,
        title: 'Время для урока',
        body: formatDailyBody(dueCount, newCount),
        url: '/#/lesson',
      })
    }
  }

  // 4. Защита серии (вечернее напоминание, если занимался вчера/подряд и ещё не заходил сегодня)
  if (
    settings.streakEnabled &&
    snapshot.streak >= 1 &&
    daysSinceLastLesson === 1 &&
    isInTimeWindow(settings.streakTime, 20 * 60 + 30)
  ) {
    const dedupeKey = `streak:${todayKey}`
    if (!sentKeys.has(dedupeKey)) {
      const body =
        snapshot.streak >= 2
          ? `Не потеряйте серию в ${snapshot.streak} ${pluralRu(snapshot.streak, 'день', 'дня', 'дней')} — достаточно 1 короткого урока`
          : 'Закрепите серию: вы занимались вчера, пройдите короткий урок сегодня'
      out.push({
        kind: 'streak',
        dedupeKey,
        tag: `streak-${todayKey}`,
        title: 'Сохраните серию занятий',
        body,
        url: '/#/lesson',
      })
    }
  }

  return out
}

/**
 * Формирует реалистичное тестовое push-уведомление по текущему состоянию базы пользователя.
 */
export function buildTestPushPayload(snapshot: ReminderSnapshot, now: number): {
  title: string
  body: string
  url: string
  tag: string
} {
  const { totalCount, dueCount, newCount } = computeQueueCounts(snapshot.verseSchedule, now)
  if (dueCount > 0 || newCount > 0) {
    return {
      title: 'Напоминание об уроке',
      body: formatDailyBody(dueCount, newCount),
      url: '/#/lesson',
      tag: 'memo-bible-test',
    }
  }
  if (totalCount > 0) {
    return {
      title: 'Очередь повторений пуста',
      body: 'Все ваши стихи закреплены на сегодня. Хотите добавить новый отрывок из Библии?',
      url: '/#/add',
      tag: 'memo-bible-test',
    }
  }
  return {
    title: 'Уведомления работают!',
    body: 'Добавьте первые стихи из Библии, и мы напомним, когда придёт время повторения.',
    url: '/#/add',
    tag: 'memo-bible-test',
  }
}

/**
 * Считает итоги недели для внутриигрового/внутриприложенческого дайджеста.
 */
export function computeWeeklyDigest(
  verses: Pick<VerseState, 'key' | 'strength' | 'lastUpAt'>[],
  lessons: Pick<LessonRecord, 'createdAt' | 'verseKeys' | 'xp'>[],
  reviews: Pick<VerseReview, 'createdAt' | 'xp'>[],
  now: number,
  timeZone?: string,
): WeeklyDigest {
  const tz = safeTimeZone(timeZone)
  const todayKey = localDateKey(now, tz)
  const epochDay = dateKeyToEpochDay(todayKey)
  // 1970-01-01 был четвергом (индекс дня недели 3 при Пн=0). Сдвиг к понедельнику:
  const weekdayMon0 = (epochDay + 3) % 7
  const weekKey = shiftDateKey(todayKey, -weekdayMon0)
  const weekWindowStart = now - 7 * DAY

  const completed = lessons.filter((l) => l.verseKeys.length > 0)
  const weekLessons = completed.filter((l) => l.createdAt >= weekWindowStart)
  const weekReviews = reviews.filter((r) => r.createdAt >= weekWindowStart)

  const weekXpFromReviews = weekReviews.reduce((s, r) => s + (r.xp || 0), 0)
  const weekXpFromLessons = weekLessons.reduce((s, l) => s + (l.xp || 0), 0)
  const weekXp = Math.max(weekXpFromReviews, weekXpFromLessons)

  const totalXpReviews = reviews.reduce((s, r) => s + (r.xp || 0), 0)
  const totalXpLessons = completed.reduce((s, l) => s + (l.xp || 0), 0)
  const totalXp = Math.max(totalXpReviews, totalXpLessons)

  const versesStrengthened = verses.filter((v) => v.lastUpAt !== null && v.lastUpAt >= weekWindowStart).length
  const versesLearnedTotal = verses.filter((v) => v.strength >= 6).length
  const { streak } = computeStreak(lessons, now, tz)

  return {
    weekKey,
    lessonsCount: weekLessons.length,
    versesStrengthened,
    versesLearnedTotal,
    weekXp,
    totalXp,
    streak,
  }
}
