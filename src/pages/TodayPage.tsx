import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadBook } from '../bible/bible'
import { formatRange, groupVerses, parseKey, TRANSLATION } from '../bible/refs'
import { OfflineIndicator } from '../components/OfflineIndicator'
import { PWAInstallButton } from '../components/PWAInstallButton'
import VerseReaderModal from '../components/VerseReaderModal'
import { db, liveLessons, liveVerses } from '../db/db'
import { DAILY_XP_OPTIONS, usePreferences } from '../lib/preferences'
import { computeTodayActivity } from '../logic/activity'
import { buildLibrary, type LibraryGroup } from '../logic/library'
import { isDue } from '../logic/mastery'
import { pluralRu } from '../reminders/engine'

const HISTORY_SHOWN = 5

function refsOf(keys: string[]): string {
  const refs = keys.map(parseKey).filter((p): p is NonNullable<typeof p> => p !== null)
  return groupVerses(refs).map(formatRange).join(', ')
}

const fmtDate = (t: number) =>
  new Date(t).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function TodayPage() {
  const verses = useLiveQuery(() => liveVerses(), [])
  const lessons = useLiveQuery(() => liveLessons(), [])
  const [recentCutoff] = useState(() => Date.now() - 48 * 60 * 60 * 1000)
  const recentReviews = useLiveQuery(
    () => db.reviews.where('createdAt').above(recentCutoff).toArray(),
    [recentCutoff],
  )
  const { dailyXpGoal, setDailyXpGoal } = usePreferences()
  const [search, setSearch] = useState('')
  const [goalPickerOpen, setGoalPickerOpen] = useState(false)
  const [verseTexts, setVerseTexts] = useState<Record<string, string>>({})

  // Выбранный стих для модального окна чтения
  const [readerVerse, setReaderVerse] = useState<{
    reference: string
    text: string
    strength: number
    level: any
    keys: string[]
  } | null>(null)

  const library = useMemo(() => buildLibrary(verses ?? []), [verses])

  // Предзагрузка текстов для всех стихов
  useEffect(() => {
    if (!verses || verses.length === 0) return
    let active = true

    const bookSet = new Set(verses.map((v) => v.book))

    Promise.all(
      Array.from(bookSet).map(async (bookId) => {
        try {
          const chapters = await loadBook(TRANSLATION, bookId)
          return { bookId, chapters }
        } catch {
          return null
        }
      })
    ).then((results) => {
      if (!active) return
      const map: Record<string, string> = {}
      for (const res of results) {
        if (!res) continue
        const { bookId, chapters } = res
        verses
          .filter((v) => v.book === bookId)
          .forEach((v) => {
            const chVerses = chapters[v.chapter - 1] ?? []
            map[v.key] = chVerses[v.verse - 1] ?? ''
          })
      }
      setVerseTexts(map)
    })

    return () => {
      active = false
    }
  }, [verses])

  function getGroupSnippet(g: LibraryGroup): string {
    const combined = g.keys
      .map((k) => verseTexts[k])
      .filter(Boolean)
      .join(' ')
    return combined || 'Загрузка текста…'
  }

  const activity = useMemo(() => {
    if (!lessons || !recentReviews) return null
    return computeTodayActivity(lessons, recentReviews, Date.now())
  }, [lessons, recentReviews])

  if (!verses || !lessons || !recentReviews || !activity) return null

  const now = Date.now()
  const done = lessons.filter((l) => l.verseKeys.length > 0)
  const newCount = verses.filter((v) => v.strength === 0).length
  const dueCount = verses.filter((v) => v.strength > 0 && isDue(v, now)).length
  const recentLessons = done.slice(-HISTORY_SHOWN).reverse()

  const goalPct = Math.min(100, Math.round((activity.todayXp / dailyXpGoal) * 100))
  const goalReached = activity.todayXp >= dailyXpGoal

  const trimmedSearch = search.trim()
  const searchResults = trimmedSearch
    ? library.filter((g) => {
        const refStr = formatRange(g).toLowerCase()
        const textStr = getGroupSnippet(g).toLowerCase()
        const q = trimmedSearch.toLowerCase()
        return refStr.includes(q) || textStr.includes(q)
      })
    : []

  // Недавно открытые / активные стихи (первые 6 групп)
  const recentGroups = library.slice(0, 6)
  // Стихи к повторению
  const dueGroups = library.filter((g) => isDue({ nextReviewAt: g.soonest }, now)).slice(0, 8)
  const queueCaughtUp = dueGroups.length === 0 && newCount === 0

  function openReader(group: LibraryGroup) {
    const ref = formatRange(group)
    const text = getGroupSnippet(group)
    setReaderVerse({
      reference: ref,
      text: text,
      strength: group.minStrength,
      level: group.level,
      keys: group.keys,
    })
  }

  return (
    <div className="home-page">
      {/* Модальное окно чтения стиха */}
      {readerVerse && (
        <VerseReaderModal
          isOpen={true}
          onClose={() => setReaderVerse(null)}
          reference={readerVerse.reference}
          text={readerVerse.text}
          strength={readerVerse.strength}
          level={readerVerse.level}
          keys={readerVerse.keys}
        />
      )}

      {/* Поисковая строка */}
      <div className="search-bar-wrap">
        <div className="search-bar">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Поиск по стиху, книге или тексту..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="search-clear-btn"
              onClick={() => setSearch('')}
              aria-label="Очистить поиск"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Офлайн-статус и кнопка установки PWA под поиском */}
      <div className="home-subbar">
        <OfflineIndicator />
        <PWAInstallButton />
      </div>

      {/* Если стихов вообще нет */}
      {verses.length === 0 ? (
        <div className="home-empty-card">
          <div className="home-empty-icon">
            <BookOpen size={36} />
          </div>
          <h2 className="home-empty-title">Начните с первых стихов</h2>
          <p className="home-empty-desc">
            Выберите любимые отрывки из Библии. Приложение подготовит персональный урок с
            упражнениями.
          </p>
          <Link to="/add" className="btn primary-accent">
            <Sparkles size={18} />
            <span>Добавить стихи из Библии</span>
          </Link>
        </div>
      ) : trimmedSearch ? (
        /* Поиск по всей библиотеке стихов */
        <div className="home-section">
          <div className="home-section-header">
            <div className="flex items-center gap-2">
              <Search size={18} className="text-blue-400" />
              <h3 className="home-section-title">Результаты поиска</h3>
            </div>
            <span className="home-search-count">Найдено: {searchResults.length}</span>
          </div>

          {searchResults.length === 0 ? (
            <div className="home-search-empty">
              <p className="home-search-empty-text">
                По запросу «{trimmedSearch}» ничего не найдено.
              </p>
              <button type="button" className="btn ghost" onClick={() => setSearch('')}>
                Сбросить поиск
              </button>
            </div>
          ) : (
            <div className="home-due-list">
              {searchResults.map((g) => {
                const label = formatRange(g)
                const text = getGroupSnippet(g)
                return (
                  <div key={label} className="home-due-item">
                    <div
                      className="home-due-item-clickable"
                      onClick={() => openReader(g)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openReader(g)
                        }
                      }}
                    >
                      <div className="home-due-badge" data-strength={g.minStrength}>
                        {g.minStrength}
                      </div>
                      <div className="home-due-content">
                        <div className="home-due-title">{label}</div>
                        <div className="home-due-snippet">{text}</div>
                      </div>
                    </div>
                    <Link
                      to={`/practice?keys=${g.keys.join(',')}`}
                      className="home-due-action"
                      title="Тренировать"
                      aria-label={`Тренировать ${label}`}
                    >
                      <Play size={15} />
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Главная карточка: Урок сегодня + Серия + Дневная цель */}
          <div className="today-lesson-card">
            <div className="today-lesson-header">
              <div className="today-lesson-info">
                <div className="today-lesson-badges-row">
                  <span className="today-lesson-badge">Урок {done.length + 1}</span>
                  <span
                    className={`today-streak-pill ${activity.currentStreak > 0 ? 'active' : ''} ${activity.practicedToday ? 'lit' : ''}`}
                    title={
                      activity.practicedToday
                        ? 'Серия на сегодня засчитана'
                        : 'Пройдите урок, чтобы продлить серию'
                    }
                  >
                    <Flame size={13} />
                    <span>
                      {activity.currentStreak} {pluralRu(activity.currentStreak, 'день', 'дня', 'дней')}
                    </span>
                  </span>
                </div>
                <h2 className="today-lesson-title">Ежедневное повторение</h2>
              </div>

              <Link to="/lesson" className="today-lesson-btn" aria-label="Начать урок">
                <Play size={18} fill="currentColor" />
                <span>Начать</span>
              </Link>
            </div>

            {/* Полоска со статистикой */}
            <div className="today-lesson-stats-bar">
              <div className="today-stat-item">
                <span className="today-stat-label">Новых:</span>
                <span className="today-stat-num new-val">{newCount}</span>
              </div>
              <div className="today-stat-divider" />
              <div className="today-stat-item">
                <span className="today-stat-label">К повторению:</span>
                <span className={`today-stat-num ${dueCount > 0 ? 'due-val' : 'due-zero'}`}>
                  {dueCount}
                </span>
              </div>
            </div>

            {/* Прогресс дневной цели */}
            <div className="today-goal-wrap">
              <button
                type="button"
                className="today-goal-row"
                onClick={() => setGoalPickerOpen((v) => !v)}
                aria-expanded={goalPickerOpen}
                title="Нажмите, чтобы изменить дневную цель"
              >
                <span className="today-goal-label">
                  <Target size={14} />
                  <span>{goalReached ? 'Цель дня достигнута!' : 'Дневная цель'}</span>
                </span>
                <span className={`today-goal-xp ${goalReached ? 'done' : ''}`}>
                  {activity.todayXp} / {dailyXpGoal} XP
                </span>
              </button>
              <div className="today-goal-track" aria-hidden="true">
                <div
                  className={`today-goal-fill ${goalReached ? 'done' : ''}`}
                  style={{ width: `${goalPct}%` }}
                />
              </div>
              {goalPickerOpen && (
                <div className="today-goal-picker" role="group" aria-label="Выберите дневную цель XP">
                  {DAILY_XP_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`today-goal-chip ${dailyXpGoal === opt ? 'active' : ''}`}
                      onClick={() => {
                        setDailyXpGoal(opt)
                        setGoalPickerOpen(false)
                      }}
                    >
                      {opt} XP
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Секция: Активные стихи (Сетка 2x3) */}
          <div className="home-section">
            <div className="home-section-header">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-blue-400" />
                <h3 className="home-section-title">Активные стихи</h3>
              </div>
              <Link to="/verses" className="home-section-link">
                <span>Все ({verses.length})</span>
                <ChevronRight size={16} />
              </Link>
            </div>

            <div className="verse-cards-grid">
              {recentGroups.map((g) => {
                const label = formatRange(g)
                const text = getGroupSnippet(g)
                const firstVerseMatch = label.match(/:(\d+)/)
                const badgeNum = firstVerseMatch ? firstVerseMatch[1] : g.minStrength

                return (
                  <button
                    key={label}
                    className="home-verse-card"
                    onClick={() => openReader(g)}
                    aria-label={`Открыть ${label}`}
                  >
                    <div className="home-verse-badge">{badgeNum}</div>
                    <div className="home-verse-ref">{label}</div>
                    <div className="home-verse-snippet">{text}</div>
                  </button>
                )
              })}
            </div>
            <div className="home-hint-text">
              * Нажмите на плитку для чтения или быстрой тренировки стиха
            </div>
          </div>

          {/* Секция: Стихи к повторению ИЛИ карточка при пустой очереди */}
          {dueGroups.length > 0 ? (
            <div className="home-section">
              <div className="home-section-header">
                <div className="flex items-center gap-2">
                  <RotateCcw size={18} className="text-amber-400" />
                  <h3 className="home-section-title">Пора повторить сегодня</h3>
                </div>
                <Link to="/lesson" className="home-section-link">
                  <span>В урок</span>
                  <ArrowRight size={16} />
                </Link>
              </div>

              <div className="home-due-list">
                {dueGroups.map((g) => {
                  const label = formatRange(g)
                  const text = getGroupSnippet(g)

                  return (
                    <div key={label} className="home-due-item">
                      <div
                        className="home-due-item-clickable"
                        onClick={() => openReader(g)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openReader(g)
                          }
                        }}
                      >
                        <div className="home-due-badge" data-strength={g.minStrength}>
                          {g.minStrength}
                        </div>
                        <div className="home-due-content">
                          <div className="home-due-title">{label}</div>
                          <div className="home-due-snippet">{text}</div>
                        </div>
                      </div>
                      <Link
                        to={`/practice?keys=${g.keys.join(',')}`}
                        className="home-due-action"
                        title="Тренировать"
                        aria-label={`Тренировать ${label}`}
                      >
                        <Play size={15} />
                      </Link>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            queueCaughtUp && (
              <div className="home-caughtup-card">
                <div className="home-caughtup-top">
                  <div className="home-caughtup-icon" aria-hidden="true">
                    <CheckCircle2 size={22} />
                  </div>
                  <div className="home-caughtup-text">
                    <h3 className="home-caughtup-title">На сегодня всё повторено</h3>
                    <p className="home-caughtup-desc">
                      Все стихи закреплены вовремя. Можно добавить новый отрывок или устроить
                      дополнительную тренировку.
                    </p>
                  </div>
                </div>
                <div className="home-caughtup-actions">
                  <Link to="/add" className="btn primary">
                    <Plus size={16} />
                    <span>Добавить стихи</span>
                  </Link>
                  <Link to="/lesson" className="btn ghost">
                    <Play size={15} />
                    <span>Свободная тренировка</span>
                  </Link>
                </div>
              </div>
            )
          )}

          {/* Секция: Пройденные уроки */}
          {recentLessons.length > 0 && (
            <div className="home-section">
              <div className="home-section-header">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-purple-400" />
                  <h3 className="home-section-title">Пройденные уроки</h3>
                </div>
              </div>

              <div className="home-history-list">
                {recentLessons.map((l, i) => (
                  <div key={l.uid} className="home-history-item">
                    <div className="home-history-info">
                      <div className="home-history-num">Урок {done.length - i}</div>
                      <div className="home-history-meta">
                        {fmtDate(l.createdAt)} · +{l.xp} XP
                        {l.mistakes > 0 && ` · ошибок: ${l.mistakes}`}
                      </div>
                      <div className="home-history-refs">{refsOf(l.verseKeys)}</div>
                    </div>
                    <Link
                      to={`/lesson?replay=${l.uid}`}
                      className="home-history-repeat-btn"
                      aria-label="Повторить урок"
                    >
                      <RotateCcw size={14} />
                      <span>Повторить</span>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
