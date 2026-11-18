import { describe, expect, it } from 'vitest'
import { computeActivityStats, computeTodayActivity, getHardestVerses, HEATMAP_WEEKS } from './activity'
import type { VerseState } from '../types'

const DAY = 24 * 60 * 60 * 1000

function ts(isoDate: string): number {
  return Date.parse(`${isoDate}T12:00:00Z`)
}

function makeVerse(partial: Partial<VerseState> & Pick<VerseState, 'key' | 'book' | 'chapter' | 'verse'>): VerseState {
  return {
    translation: 'rst',
    addedAt: 0,
    strength: 3,
    stage: 2,
    nextReviewAt: 0,
    lastUpAt: null,
    lastPracticedAt: null,
    lastScore: 100,
    lapses: 0,
    updatedAt: 0,
    ...partial,
  }
}

describe('computeActivityStats', () => {
  it('calculates current streak, best streak, today XP, and 12-week Monday-aligned heatmap', () => {
    // 2026-11-18 is a Wednesday (UTC)
    const now = ts('2026-11-18')
    const lessons = [
      // Past 4-day streak (Oct 10..13)
      { createdAt: ts('2026-10-10'), verseKeys: ['rst:mat:5:5'], xp: 20 },
      { createdAt: ts('2026-10-11'), verseKeys: ['rst:mat:5:5'], xp: 20 },
      { createdAt: ts('2026-10-12'), verseKeys: ['rst:mat:5:5'], xp: 20 },
      { createdAt: ts('2026-10-13'), verseKeys: ['rst:mat:5:5'], xp: 20 },
      // Current 2-day streak (Nov 17..18)
      { createdAt: ts('2026-11-17'), verseKeys: ['rst:jhn:3:16'], xp: 25 },
      { createdAt: ts('2026-11-18'), verseKeys: ['rst:jhn:3:16'], xp: 45 },
      // Empty lesson should be ignored
      { createdAt: ts('2026-11-15'), verseKeys: [], xp: 0 },
    ]
    const reviews = [
      { createdAt: ts('2026-11-18'), xp: 50 },
    ]

    const stats = computeActivityStats(lessons, reviews, now, 'UTC')

    expect(stats.currentStreak).toBe(2)
    expect(stats.bestStreak).toBe(4)
    expect(stats.practicedToday).toBe(true)
    expect(stats.todayKey).toBe('2026-11-18')
    expect(stats.todayXp).toBe(50)
    expect(stats.todayLessons).toBe(1)
    expect(stats.activeDaysTotal).toBe(6)
    expect(stats.heatmapDays).toHaveLength(HEATMAP_WEEKS * 7)

    const todayCell = stats.heatmapDays.find((d) => d.dateKey === '2026-11-18')
    expect(todayCell?.isToday).toBe(true)
    expect(todayCell?.isFuture).toBe(false)
    expect(todayCell?.xp).toBe(50)
    expect(todayCell?.level).toBe(3) // 45..79 XP -> level 3

    // Thursday Nov 19..Sun Nov 22 are future days of the last week
    const futureDays = stats.heatmapDays.filter((d) => d.isFuture)
    expect(futureDays).toHaveLength(4)
    expect(stats.monthLabels.length).toBeGreaterThanOrEqual(2)
  })

  it('tracks live review XP today even before lesson completion', () => {
    const now = ts('2026-11-18')
    const stats = computeActivityStats(
      [],
      [{ createdAt: now - 1000, xp: 18 }],
      now,
      'UTC',
    )
    expect(stats.todayXp).toBe(18)
    expect(stats.currentStreak).toBe(0)
    const todayCell = stats.heatmapDays.find((d) => d.dateKey === '2026-11-18')
    expect(todayCell?.level).toBe(1)
  })

  it('computeTodayActivity matches computeActivityStats for today and runs fast on large histories', () => {
    const now = ts('2026-11-18')
    const lessons = Array.from({ length: 200 }, (_, i) => ({
      createdAt: now - i * DAY,
      verseKeys: ['rst:mat:5:5'],
      xp: 25,
    }))
    const reviews = Array.from({ length: 4000 }, (_, i) => ({
      createdAt: now - (i % 365) * DAY,
      xp: 5,
    }))

    const t0 = performance.now()
    const stats = computeActivityStats(lessons, reviews, now, 'Europe/Moscow')
    const today = computeTodayActivity(lessons, reviews.slice(0, 40), now, 'Europe/Moscow')
    const elapsedMs = performance.now() - t0

    expect(today.currentStreak).toBe(stats.currentStreak)
    expect(today.practicedToday).toBe(stats.practicedToday)
    expect(elapsedMs).toBeLessThan(200)
  })
})

describe('getHardestVerses', () => {
  it('ranks verses by lapses descending, then lowest score, then strength', () => {
    const verses: VerseState[] = [
      makeVerse({ key: 'rst:mat:5:5', book: 'mat', chapter: 5, verse: 5, lapses: 0, lastScore: 100, strength: 6 }),
      makeVerse({ key: 'rst:jhn:3:16', book: 'jhn', chapter: 3, verse: 16, lapses: 1, lastScore: 70, strength: 2 }),
      makeVerse({ key: 'rst:rom:8:28', book: 'rom', chapter: 8, verse: 28, lapses: 3, lastScore: 60, strength: 1 }),
      makeVerse({ key: 'rst:psa:23:1', book: 'psa', chapter: 23, verse: 1, lapses: 0, lastScore: 55, strength: 3 }),
      makeVerse({ key: 'rst:gen:1:1', book: 'gen', chapter: 1, verse: 1, lapses: 1, lastScore: 40, strength: 4 }),
    ]

    const top = getHardestVerses(verses, 3)
    expect(top.map((t) => t.verse.key)).toEqual([
      'rst:rom:8:28', // 3 lapses
      'rst:gen:1:1',  // 1 lapse, score 40
      'rst:jhn:3:16', // 1 lapse, score 70
    ])
    expect(top[0].refLabel).toContain('8:28')
    // Make sure clean verse is never included
    expect(getHardestVerses(verses, 10).some((t) => t.verse.key === 'rst:mat:5:5')).toBe(false)
    void DAY
  })
})
