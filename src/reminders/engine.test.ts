import { describe, expect, it } from 'vitest'
import {
  buildReminderSnapshot,
  buildTestPushPayload,
  computeStreak,
  computeWeeklyDigest,
  DEFAULT_REMINDER_SETTINGS,
  evaluateDuePushNotifications,
  formatDailyBody,
  localDateKey,
  pluralRu,
  type PushScheduleState,
} from './engine'

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

describe('reminders engine', () => {
  it('pluralRu склоняет существительные корректно', () => {
    expect(pluralRu(1, 'стих', 'стиха', 'стихов')).toBe('стих')
    expect(pluralRu(2, 'стих', 'стиха', 'стихов')).toBe('стиха')
    expect(pluralRu(5, 'стих', 'стиха', 'стихов')).toBe('стихов')
    expect(pluralRu(11, 'стих', 'стиха', 'стихов')).toBe('стихов')
    expect(pluralRu(21, 'день', 'дня', 'дней')).toBe('день')
    expect(pluralRu(14, 'день', 'дня', 'дней')).toBe('дней')
  })

  it('formatDailyBody формирует умное сообщение по количеству к повторению и новых', () => {
    expect(formatDailyBody(4, 2)).toBe('Пора повторить 4 стиха, а ещё 2 новых ждут старта')
    expect(formatDailyBody(1, 1)).toBe('Пора повторить 1 стих, а ещё 1 новый ждёт старта')
    expect(formatDailyBody(5, 0)).toBe('Пора повторить 5 стихов — ваш ежедневный урок готов')
  })

  it('computeStreak корректно считает серию дней и пропуски в заданной таймзоне', () => {
    const tz = 'UTC'
    const now = Date.UTC(2026, 10, 13, 18, 0) // 2026-11-13
    const lessons = [
      { createdAt: Date.UTC(2026, 10, 10, 10, 0), verseKeys: ['a'] },
      { createdAt: Date.UTC(2026, 10, 11, 12, 0), verseKeys: ['a'] },
      { createdAt: Date.UTC(2026, 10, 12, 15, 0), verseKeys: ['a'] },
    ]
    const s = computeStreak(lessons, now, tz)
    expect(s.streak).toBe(3)
    expect(s.practicedToday).toBe(false)
    expect(s.daysSinceLastLesson).toBe(1)

    const withToday = [...lessons, { createdAt: Date.UTC(2026, 10, 13, 8, 0), verseKeys: ['a'] }]
    const s2 = computeStreak(withToday, now, tz)
    expect(s2.streak).toBe(4)
    expect(s2.practicedToday).toBe(true)
    expect(s2.daysSinceLastLesson).toBe(0)
  })

  it('не отправляет ежедневное и streak-напоминание, если сегодня уже был урок', () => {
    const now = Date.UTC(2026, 10, 13, 20, 45)
    const state: PushScheduleState = {
      settings: { ...DEFAULT_REMINDER_SETTINGS, pushEnabled: true },
      snapshot: buildReminderSnapshot(
        [{ strength: 2, nextReviewAt: now - HOUR }],
        [{ createdAt: Date.UTC(2026, 10, 13, 8, 0), verseKeys: ['rst:mat:5:7'] }],
        now,
        'UTC',
      ),
      subscribedAt: now - 5 * DAY,
      sentLog: [],
    }
    expect(evaluateDuePushNotifications(state, now)).toEqual([])
  })

  it('отправляет ежедневное напоминание в нужное время и дедуплицирует повторную проверку', () => {
    const now = Date.UTC(2026, 10, 13, 9, 15)
    const snapshot = buildReminderSnapshot(
      [
        { strength: 2, nextReviewAt: now - HOUR },
        { strength: 3, nextReviewAt: now - HOUR },
        { strength: 4, nextReviewAt: now - HOUR },
        { strength: 1, nextReviewAt: now - HOUR },
        { strength: 0, nextReviewAt: now },
        { strength: 0, nextReviewAt: now },
      ],
      [{ createdAt: Date.UTC(2026, 10, 12, 11, 0), verseKeys: ['rst:mat:5:7'] }],
      now,
      'UTC',
    )
    const state: PushScheduleState = {
      settings: { ...DEFAULT_REMINDER_SETTINGS, pushEnabled: true, dailyTime: '09:00' },
      snapshot,
      subscribedAt: now - 2 * DAY,
      sentLog: [],
    }
    const msgs = evaluateDuePushNotifications(state, now)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].kind).toBe('daily')
    expect(msgs[0].body).toBe('Пора повторить 4 стиха, а ещё 2 новых ждут старта')
    expect(msgs[0].url).toBe('/#/lesson')

    const afterSent = evaluateDuePushNotifications(
      {
        ...state,
        sentLog: [{ key: msgs[0].dedupeKey, kind: 'daily', dateKey: localDateKey(now, 'UTC'), sentAt: now }],
      },
      now + 60_000,
    )
    expect(afterSent).toEqual([])
  })

  it('отправляет защиту серии вечером, если пользователь занимался вчера, но не сегодня', () => {
    const now = Date.UTC(2026, 10, 13, 20, 35)
    const state: PushScheduleState = {
      settings: { ...DEFAULT_REMINDER_SETTINGS, pushEnabled: true, streakTime: '20:30' },
      snapshot: buildReminderSnapshot(
        [{ strength: 3, nextReviewAt: now + DAY }],
        [
          { createdAt: Date.UTC(2026, 10, 10, 12, 0), verseKeys: ['a'] },
          { createdAt: Date.UTC(2026, 10, 11, 12, 0), verseKeys: ['a'] },
          { createdAt: Date.UTC(2026, 10, 12, 12, 0), verseKeys: ['a'] },
        ],
        now,
        'UTC',
      ),
      subscribedAt: now - 4 * DAY,
      sentLog: [],
    }
    const msgs = evaluateDuePushNotifications(state, now)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].kind).toBe('streak')
    expect(msgs[0].body).toContain('3 дня')
  })

  it('отправляет бережное возвращение ровно через 3, 7 и 14 дней паузы', () => {
    const baseLesson = Date.UTC(2026, 10, 10, 12, 0)
    const day3 = Date.UTC(2026, 10, 13, 9, 5)
    const day4 = Date.UTC(2026, 10, 14, 9, 5)
    const snapshot = buildReminderSnapshot(
      [
        { strength: 2, nextReviewAt: baseLesson + DAY },
        { strength: 3, nextReviewAt: baseLesson + DAY },
        { strength: 1, nextReviewAt: baseLesson + DAY },
      ],
      [{ createdAt: baseLesson, verseKeys: ['a'] }],
      day3,
      'UTC',
    )
    const baseState: PushScheduleState = {
      settings: { ...DEFAULT_REMINDER_SETTINGS, pushEnabled: true, dailyTime: '09:00' },
      snapshot,
      subscribedAt: baseLesson,
      sentLog: [],
    }

    const msgs3 = evaluateDuePushNotifications(baseState, day3)
    expect(msgs3.map((m) => m.kind)).toEqual(['inactivity'])
    expect(msgs3[0].body).toContain('освежите 3 стиха')

    const msgs4 = evaluateDuePushNotifications(baseState, day4)
    expect(msgs4.map((m) => m.kind)).toEqual(['daily'])
  })

  it('отправляет уведомление об пустой очереди и перенаправляет в добавление стихов', () => {
    const now = Date.UTC(2026, 10, 13, 9, 10)
    const state: PushScheduleState = {
      settings: { ...DEFAULT_REMINDER_SETTINGS, pushEnabled: true, dailyTime: '09:00' },
      snapshot: buildReminderSnapshot(
        [{ strength: 6, nextReviewAt: now + 5 * DAY }],
        [{ createdAt: Date.UTC(2026, 10, 12, 12, 0), verseKeys: ['a'] }],
        now,
        'UTC',
      ),
      subscribedAt: now - 3 * DAY,
      sentLog: [],
    }
    const msgs = evaluateDuePushNotifications(state, now)
    expect(msgs.some((m) => m.kind === 'emptyQueue')).toBe(true)
    const emptyMsg = msgs.find((m) => m.kind === 'emptyQueue')!
    expect(emptyMsg.url).toBe('/#/add')
  })

  it('buildTestPushPayload и computeWeeklyDigest возвращают корректные метрики', () => {
    const now = Date.UTC(2026, 10, 13, 15, 0)
    const snapshot = buildReminderSnapshot(
      [{ strength: 6, nextReviewAt: now + 3 * DAY }],
      [{ createdAt: now - DAY, verseKeys: ['a'] }],
      now,
      'UTC',
    )
    const testPayload = buildTestPushPayload(snapshot, now)
    expect(testPayload.url).toBe('/#/add')

    const digest = computeWeeklyDigest(
      [
        { key: 'a', strength: 6, lastUpAt: now - DAY },
        { key: 'b', strength: 2, lastUpAt: now - 10 * DAY },
      ],
      [
        { createdAt: now - DAY, verseKeys: ['a'], xp: 45 },
        { createdAt: now - 2 * DAY, verseKeys: ['a'], xp: 30 },
        { createdAt: now - 12 * DAY, verseKeys: ['b'], xp: 20 },
      ],
      [
        { createdAt: now - DAY, xp: 45 },
        { createdAt: now - 2 * DAY, xp: 30 },
        { createdAt: now - 12 * DAY, xp: 20 },
      ],
      now,
      'UTC',
    )
    expect(digest.lessonsCount).toBe(2)
    expect(digest.versesStrengthened).toBe(1)
    expect(digest.versesLearnedTotal).toBe(1)
    expect(digest.weekXp).toBe(75)
    expect(digest.totalXp).toBe(95)
    expect(digest.streak).toBe(2)
  })
})
