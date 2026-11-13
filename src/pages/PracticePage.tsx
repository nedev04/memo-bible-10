import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { compareVerses, formatRange, groupVerses, parseKey } from '../bible/refs'
import { liveVerses, saveLesson } from '../db/db'
import LessonRunner, { type LessonSummary } from '../lessons/LessonRunner'
import { loadAiGaps, loadCachedAiGaps } from '../lessons/aiGaps'
import { loadCachedProofread, prefetchAiProofread } from '../lessons/aiProofread'
import { loadTexts } from '../lessons/loadTexts'
import { planVersePractice } from '../lessons/practice'
import { recordStep } from '../lessons/record'
import type { LessonStep, VerseText } from '../lessons/types'
import type { VerseState } from '../types'

interface LoadedPractice {
  steps: LessonStep[]
  texts: Map<string, VerseText>
}

/**
 * Персональная тренировка отдельного стиха (или выбранного отрывка).
 * Упражнения подобраны автоматически под текущий уровень силы стиха (5–8 разнообразных заданий),
 * как в обычном уроке, без промежуточного экрана выбора упражнений.
 */
export default function PracticePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [round, setRound] = useState(0)
  const [state, setState] = useState<'loading' | 'empty' | 'error' | LoadedPractice>('loading')
  const [label, setLabel] = useState('')
  const saving = useRef<Promise<void>>(Promise.resolve())

  const rawKeys = useMemo(() => (params.get('keys') ?? '').split(',').filter(Boolean), [params])

  useEffect(() => {
    let alive = true
    setState('loading')

    ;(async () => {
      try {
        const allVerses: VerseState[] = await liveVerses()
        const liveMap = new Map(allVerses.map((v) => [v.key, v]))

        // Оставляем только существующие стихи
        const targetKeys = rawKeys
          .filter((k) => liveMap.has(k))
          .map((k) => ({ key: k, ref: parseKey(k) }))
          .filter((x): x is { key: string; ref: NonNullable<ReturnType<typeof parseKey>> } => x.ref !== null)
          .sort((a, b) => compareVerses(a.ref, b.ref))
          .map((x) => x.key)

        if (targetKeys.length === 0) {
          if (alive) setState('empty')
          return
        }

        const targetVerses = targetKeys.map((k) => liveMap.get(k)!).filter(Boolean)
        const computedLabel = groupVerses(targetKeys.map(parseKey).filter((p): p is NonNullable<typeof p> => p !== null))
          .map(formatRange)
          .join(', ')
        if (alive) setLabel(computedLabel)

        // Генерируем 5–8 адаптированных упражнений
        const steps = planVersePractice(targetVerses, allVerses, Math.random)
        if (steps.length === 0) {
          if (alive) setState('empty')
          return
        }

        // Загружаем тексты стихов и пул для «Мостика»
        const neededKeys = [...new Set(steps.flatMap((s) => s.verseKeys))]
        const texts = await loadTexts(neededKeys, allVerses)

        const gapVerses = [...new Set(steps.filter((s) => s.kind === 'fillGaps').flatMap((s) => s.verseKeys))]
          .map((k) => texts.get(k))
          .filter((v): v is VerseText => v !== undefined)
        const proofTargets = steps
          .filter((s) => s.kind === 'proofread')
          .flatMap((s) =>
            s.verseKeys
              .map((k) => texts.get(k))
              .filter((v): v is VerseText => v !== undefined)
              .map((verse) => ({ verse, level: (s.settings.proofLevel ?? 1) as 1 | 2 | 3 })),
          )

        await Promise.all([
          loadCachedAiGaps(gapVerses),
          ...([1, 2, 3] as const).map((lvl) =>
            loadCachedProofread(
              proofTargets.filter((t) => t.level === lvl).map((t) => t.verse),
              lvl,
            ),
          ),
        ])

        const playable = steps.filter((s) => s.verseKeys.every((k) => texts.has(k)))
        if (!alive) return

        if (playable.length === 0) {
          setState('error')
        } else {
          void loadAiGaps(gapVerses)
          void prefetchAiProofread(proofTargets)
          setState({ steps: playable, texts })
        }
      } catch {
        if (alive) setState('error')
      }
    })()

    return () => {
      alive = false
    }
  }, [round, rawKeys])

  function onFinish(summary: LessonSummary) {
    if (state === 'loading' || state === 'empty' || state === 'error') return
    saving.current = saveLesson({ verseKeys: summary.keys, xp: summary.xp, mistakes: summary.mistakes })
  }

  async function handleAnother() {
    await saving.current
    setRound((r) => r + 1)
  }

  if (state === 'loading') {
    return <p className="muted-block" style={{ padding: '2rem 1rem', textAlign: 'center' }}>Готовим тренировку…</p>
  }

  if (state === 'empty') {
    return (
      <div style={{ padding: '1.5rem 1rem', textAlign: 'center' }}>
        <Link to="/verses" className="back">← К стихам</Link>
        <h1 style={{ marginTop: '1rem' }}>Тренировка стиха</h1>
        <p className="empty" style={{ margin: '1.5rem 0' }}>
          Стихи для тренировки не найдены. Выберите стих на вкладке «Стихи» кнопкой «Тренировать».
        </p>
        <button className="btn primary" onClick={() => navigate('/verses')}>
          К моим стихам
        </button>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={{ padding: '1.5rem 1rem' }}>
        <Link to="/verses" className="back">← К стихам</Link>
        <h1 style={{ marginTop: '1rem' }}>Тренировка</h1>
        <p className="notice error" role="status">
          Не удалось подготовить тренировку: текст стихов не загрузился. Проверьте соединение и попробуйте ещё раз.
        </p>
        <button className="btn primary" onClick={() => setRound((r) => r + 1)}>
          Повторить попытку
        </button>
      </div>
    )
  }

  return (
    <LessonRunner
      key={`${round}:${rawKeys.join('+')}`}
      steps={state.steps}
      texts={state.texts}
      record={recordStep}
      retries={true}
      title={label ? `Тренировка: ${label}` : 'Тренировка завершена'}
      anotherLabel="Ещё раз"
      closeLabel="К стихам"
      onAnother={handleAnother}
      onClose={() => navigate('/verses')}
      onFinish={onFinish}
    />
  )
}
