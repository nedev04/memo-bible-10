import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertCircle,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  Play,
  Sparkles,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBook } from '../bible/books'
import { db, liveLessons, liveVerses } from '../db/db'
import { usePreferences } from '../lib/preferences'
import { computeActivityStats, formatDateKeyRu, getHardestVerses, HEATMAP_WEEKS } from '../logic/activity'
import { isDue } from '../logic/mastery'
import { pluralRu } from '../reminders/engine'

const WEEKDAY_SHORT = ['Пн', '', 'Ср', '', 'Пт', '', '']

export default function StatsPage() {
  const verses = useLiveQuery(() => liveVerses(), [])
  const lessons = useLiveQuery(() => liveLessons(), [])
  const reviews = useLiveQuery(() => db.reviews.toArray(), [])
  const { dailyXpGoal } = usePreferences()
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)

  const stats = useMemo(() => {
    if (!verses || !lessons || !reviews) return null

    const now = Date.now()
    const totalVerses = verses.length
    const learned = verses.filter((v) => v.strength >= 6).length
    const strong = verses.filter((v) => v.strength >= 4 && v.strength < 6).length
    const learning = verses.filter((v) => v.strength > 0 && v.strength < 4).length
    const unstarted = verses.filter((v) => v.strength === 0).length
    const dueCount = verses.filter((v) => v.strength > 0 && isDue(v, now)).length

    const totalXp = reviews.reduce((sum, r) => sum + (r.xp || 0), 0)
    const totalLessons = lessons.filter((l) => l.verseKeys.length > 0).length
    const totalMistakes = lessons.reduce((sum, l) => sum + (l.mistakes || 0), 0)

    const activity = computeActivityStats(lessons, reviews, now)
    const hardest = getHardestVerses(verses, 3)

    // Распределение по силе 0..7
    const strengthDist = Array.from({ length: 8 }, (_, s) => {
      const count = verses.filter((v) => v.strength === s).length
      const pct = totalVerses > 0 ? Math.round((count / totalVerses) * 100) : 0
      return { strength: s, count, pct }
    })

    // Статистика по книгам
    const bookMap = new Map<string, { total: number; learned: number }>()
    for (const v of verses) {
      const b = v.book
      const cur = bookMap.get(b) || { total: 0, learned: 0 }
      cur.total += 1
      if (v.strength >= 6) cur.learned += 1
      bookMap.set(b, cur)
    }

    const booksList = Array.from(bookMap.entries()).map(([bookId, data]) => {
      const info = getBook(bookId)
      return {
        id: bookId,
        name: info?.name || bookId,
        total: data.total,
        learned: data.learned,
        pct: Math.round((data.learned / data.total) * 100),
      }
    })

    return {
      totalVerses,
      learned,
      strong,
      learning,
      unstarted,
      dueCount,
      totalXp,
      totalLessons,
      totalMistakes,
      activity,
      hardest,
      strengthDist,
      booksList,
    }
  }, [verses, lessons, reviews])

  if (!stats) return null

  const { activity, hardest } = stats
  const activeDateKey = selectedDayKey ?? activity.todayKey
  const inspectedDay =
    activity.heatmapDays.find((d) => d.dateKey === activeDateKey && !d.isFuture) ??
    activity.heatmapDays.find((d) => d.isToday)

  return (
    <div className="stats-page">
      <h1 className="stats-page-title">Статистика</h1>

      {/* Верхние 4 карточки показателей */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon blue">
            <BookOpen size={20} />
          </div>
          <div className="stat-val">{stats.totalVerses}</div>
          <div className="stat-label">Всего стихов</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon emerald">
            <CheckCircle2 size={20} />
          </div>
          <div className="stat-val">{stats.learned}</div>
          <div className="stat-label">Наизусть (сила 6–7)</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon amber">
            <Clock size={20} />
          </div>
          <div className="stat-val">{stats.dueCount}</div>
          <div className="stat-label">К повторению</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon purple">
            <Sparkles size={20} />
          </div>
          <div className="stat-val">{stats.totalXp}</div>
          <div className="stat-label">Опыт (XP)</div>
        </div>
      </div>

      {/* Серия дней и календарь активности */}
      <div className="stats-section">
        <div className="stats-section-header">СЕРИЯ И АКТИВНОСТЬ</div>
        <div className="stats-card-group activity-card">
          <div className="activity-summary-row">
            <div className="activity-metric">
              <div className={`activity-metric-icon ${activity.practicedToday ? 'lit' : 'flame'}`}>
                <Flame size={17} />
              </div>
              <div>
                <div className="activity-metric-val">
                  {activity.currentStreak} {pluralRu(activity.currentStreak, 'день', 'дня', 'дней')}
                </div>
                <div className="activity-metric-label">Текущая серия</div>
              </div>
            </div>

            <div className="activity-metric-divider" />

            <div className="activity-metric">
              <div className="activity-metric-icon trophy">
                <Trophy size={16} />
              </div>
              <div>
                <div className="activity-metric-val">
                  {activity.bestStreak} {pluralRu(activity.bestStreak, 'день', 'дня', 'дней')}
                </div>
                <div className="activity-metric-label">Рекорд</div>
              </div>
            </div>

            <div className="activity-metric-divider" />

            <div className="activity-metric">
              <div className="activity-metric-icon cal">
                <CalendarDays size={16} />
              </div>
              <div>
                <div className="activity-metric-val">{activity.activeDaysTotal}</div>
                <div className="activity-metric-label">Активных дн.</div>
              </div>
            </div>
          </div>

          <div className="activity-today-goal">
            <span>
              Сегодня: <strong>{activity.todayXp}</strong> / {dailyXpGoal} XP
            </span>
            {activity.todayXp >= dailyXpGoal && (
              <span className="activity-goal-done-tag">Цель выполнена</span>
            )}
          </div>

          {/* 12-недельный календарь (сетка по дням недели и неделям) */}
          <div className="heatmap-wrap">
            <div className="heatmap-months" style={{ gridTemplateColumns: `22px repeat(${HEATMAP_WEEKS}, minmax(0, 1fr))` }}>
              <span />
              {Array.from({ length: HEATMAP_WEEKS }, (_, wIdx) => {
                const m = activity.monthLabels.find((x) => x.weekIndex === wIdx)
                return (
                  <span key={wIdx} className="heatmap-month-cell">
                    {m ? m.label : ''}
                  </span>
                )
              })}
            </div>

            <div className="heatmap-body">
              <div className="heatmap-weekdays" aria-hidden="true">
                {WEEKDAY_SHORT.map((lbl, idx) => (
                  <span key={idx} className="heatmap-weekday-lbl">
                    {lbl}
                  </span>
                ))}
              </div>

              <div
                className="heatmap-grid"
                style={{ gridTemplateColumns: `repeat(${HEATMAP_WEEKS}, minmax(0, 1fr))` }}
                role="grid"
                aria-label="Календарь активности за 12 недель"
              >
                {activity.heatmapDays.map((cell) => {
                  const isSelected = inspectedDay?.dateKey === cell.dateKey
                  return (
                    <button
                      key={cell.dateKey}
                      type="button"
                      disabled={cell.isFuture}
                      onClick={() => setSelectedDayKey(cell.dateKey)}
                      className={`heatmap-cell level-${cell.level} ${cell.isToday ? 'today' : ''} ${cell.isFuture ? 'future' : ''} ${isSelected ? 'selected' : ''}`}
                      style={{
                        gridColumnStart: cell.weekIndex + 1,
                        gridRowStart: cell.weekday + 1,
                      }}
                      title={
                        cell.isFuture
                          ? ''
                          : `${formatDateKeyRu(cell.dateKey)}: ${cell.lessons} ур., ${cell.xp} XP`
                      }
                      aria-label={
                        cell.isFuture
                          ? undefined
                          : `${formatDateKeyRu(cell.dateKey)}: ${cell.xp} XP`
                      }
                    />
                  )
                })}
              </div>
            </div>

            <div className="heatmap-footer">
              <div className="heatmap-selected-info">
                {inspectedDay && (
                  <>
                    <strong>{formatDateKeyRu(inspectedDay.dateKey)}:</strong>{' '}
                    {inspectedDay.lessons > 0
                      ? `${inspectedDay.lessons} ${pluralRu(inspectedDay.lessons, 'урок', 'урока', 'уроков')} · +${inspectedDay.xp} XP`
                      : inspectedDay.xp > 0
                      ? `+${inspectedDay.xp} XP`
                      : 'занятий не было'}
                  </>
                )}
              </div>
              <div className="heatmap-legend" aria-hidden="true">
                <span>Меньше</span>
                <span className="heatmap-cell level-0" />
                <span className="heatmap-cell level-1" />
                <span className="heatmap-cell level-2" />
                <span className="heatmap-cell level-3" />
                <span className="heatmap-cell level-4" />
                <span>Больше</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Дополнительные достижения */}
      <div className="stats-section">
        <div className="stats-section-header">ПРОГРЕСС ОБУЧЕНИЯ</div>
        <div className="stats-card-group">
          <div className="stat-row">
            <div className="stat-row-left">
              <Award size={18} className="text-amber-400" />
              <span>Пройдено уроков</span>
            </div>
            <strong className="stat-row-val">{stats.totalLessons}</strong>
          </div>

          <div className="stat-row-divider" />

          <div className="stat-row">
            <div className="stat-row-left">
              <TrendingUp size={18} className="text-blue-400" />
              <span>Стихов в процессе запоминания</span>
            </div>
            <strong className="stat-row-val">{stats.learning + stats.strong}</strong>
          </div>

          <div className="stat-row-divider" />

          <div className="stat-row">
            <div className="stat-row-left">
              <Flame size={18} className="text-rose-400" />
              <span>Новых, ожидающих изучения</span>
            </div>
            <strong className="stat-row-val">{stats.unstarted}</strong>
          </div>
        </div>
      </div>

      {/* Сложные стихи */}
      {hardest.length > 0 && (
        <div className="stats-section">
          <div className="stats-section-header">СЛОЖНЫЕ СТИХИ</div>
          <div className="stats-card-group">
            {hardest.map(({ verse, refLabel }, idx) => {
              const details: string[] = []
              if (verse.lapses > 0) {
                details.push(`сбросов: ${verse.lapses}`)
              }
              if (verse.lastScore !== null) {
                details.push(`посл. результат: ${Math.round(verse.lastScore)}%`)
              }
              return (
                <div key={verse.key}>
                  {idx > 0 && <div className="stat-row-divider" />}
                  <div className="hard-verse-row">
                    <div className="hard-verse-left">
                      <div className="home-due-badge" data-strength={verse.strength}>
                        {verse.strength}
                      </div>
                      <div className="hard-verse-info">
                        <div className="hard-verse-ref">
                          <AlertCircle size={13} className="hard-verse-alert-icon" />
                          <span>{refLabel}</span>
                        </div>
                        <div className="hard-verse-meta">{details.join(' · ')}</div>
                      </div>
                    </div>
                    <Link
                      to={`/practice?keys=${verse.key}`}
                      className="hard-verse-btn"
                      aria-label={`Повторить ${refLabel}`}
                    >
                      <Play size={14} />
                      <span>Повторить</span>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Распределение силы памяти */}
      <div className="stats-section">
        <div className="stats-section-header">РАСПРЕДЕЛЕНИЕ ПО СИЛЕ ПАМЯТИ</div>
        <div className="stats-card-group">
          <div className="strength-bars">
            {stats.strengthDist.map((item) => {
              const label =
                item.strength === 0
                  ? 'Новые'
                  : item.strength <= 5
                  ? `Сила ${item.strength}`
                  : `Сила ${item.strength} ★`
              return (
                <div key={item.strength} className="strength-bar-row">
                  <span className="strength-bar-label">{label}</span>
                  <div className="strength-bar-track">
                    <div
                      className={`strength-bar-fill strength-${item.strength}`}
                      style={{ width: `${Math.max(item.pct, item.count > 0 ? 8 : 0)}%` }}
                    />
                  </div>
                  <span className="strength-bar-count">
                    {item.count} <small className="text-slate-400">({item.pct}%)</small>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Книги в изучении */}
      {stats.booksList.length > 0 && (
        <div className="stats-section">
          <div className="stats-section-header">СТИХИ ПО КНИГАМ БИБЛИИ</div>
          <div className="stats-card-group">
            {stats.booksList.map((b, i) => (
              <div key={b.id}>
                {i > 0 && <div className="stat-row-divider" />}
                <div className="stat-row">
                  <div>
                    <div className="font-medium text-sm">{b.name}</div>
                    <div className="text-xs text-slate-400">
                      Выучено {b.learned} из {b.total} стихов ({b.pct}%)
                    </div>
                  </div>
                  <div className="book-pct-badge">{b.pct}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Мотивационный блок внизу */}
      <div className="stats-quote-card">
        <p className="stats-quote-text">
          «В сердце моем сокрыл я слово Твое, чтобы не грешить пред Тобою.»
        </p>
        <span className="stats-quote-author">Псалом 118:11</span>
      </div>
    </div>
  )
}
