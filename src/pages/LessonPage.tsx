import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { liveLessons, liveVerses, recentPassedExercises, recentWhereBooks, saveLesson } from '../db/db'
import { planLesson } from '../lessons/generator'
import { loadAiGaps, loadCachedAiGaps } from '../lessons/aiGaps'
import { loadCachedProofread, prefetchAiProofread } from '../lessons/aiProofread'
import { loadTexts } from '../lessons/loadTexts'
import { recordStep } from '../lessons/record'
import LessonRunner, { type LessonSummary } from '../lessons/LessonRunner'
import type { LessonStep, VerseText } from '../lessons/types'

interface Loaded {
  steps: LessonStep[]
  texts: Map<string, VerseText>
  replay: boolean
}

export default function LessonPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const replayUid = params.get('replay')
  const [round, setRound] = useState(0)
  const [state, setState] = useState<'loading' | 'empty' | 'error' | Loaded>('loading')
  const saving = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let alive = true
    setState('loading')
    ;(async () => {
      try {
        const [verses, lessons, recentWhere, recentPassed] = await Promise.all([
          liveVerses(),
          liveLessons(),
          recentWhereBooks(),
          recentPassedExercises(),
        ])
        let only: Set<string> | undefined
        if (replayUid) {
          const l = lessons.find((x) => x.uid === replayUid)
          if (!l || l.verseKeys.length === 0) return alive && setState('empty')
          only = new Set(l.verseKeys)
        }
        const steps = planLesson(verses, Date.now(), Math.random, only, {
          recentWhere,
          recentPassedExercises: recentPassed,
        })
        if (steps.length === 0) return alive && setState('empty')
        const texts = await loadTexts([...new Set(steps.flatMap((s) => s.verseKeys))], verses)

        // Быстрая подгрузка уже закэшированных на устройстве вариантов ИИ (без ожидания сети)
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

        // Фоновая догрузка от ИИ: не задерживает показ первого упражнения
        if (playable.length > 0) {
          void loadAiGaps(gapVerses)
          void prefetchAiProofread(proofTargets)
        }

        setState(playable.length === 0 ? 'error' : { steps: playable, texts, replay: !!replayUid })
      } catch {
        if (alive) setState('error')
      }
    })()
    return () => { alive = false }
  }, [round, replayUid])

  function onFinish(summary: LessonSummary) {
    if (state === 'loading' || state === 'empty' || state === 'error' || state.replay) return // повтор урока в историю не записывается
    saving.current = saveLesson({ verseKeys: summary.keys, xp: summary.xp, mistakes: summary.mistakes })
  }

  async function another() {
    await saving.current
    if (replayUid) navigate('/lesson', { replace: true })
    else setRound((r) => r + 1)
  }

  if (state === 'loading') return <p className="muted-block">Готовим урок…</p>
  if (state === 'empty') {
    return (
      <>
        <h1>Урок</h1>
        <p className="empty">
          {replayUid
            ? 'Для этого урока не нашлось подходящих стихов: возможно, они удалены из списка.'
            : 'Сначала добавьте стихи, которые хотите учить.'}
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => navigate('/add')}>Добавить стихи</button>
          <Link className="btn ghost" to="/">На главную</Link>
        </div>
      </>
    )
  }
  if (state === 'error') {
    return (
      <>
        <h1>Урок</h1>
        <p className="notice error" role="status">Не удалось подготовить урок: текст стихов не загрузился. Проверьте соединение и попробуйте ещё раз.</p>
        <button className="btn primary" onClick={() => setRound((r) => r + 1)}>Повторить</button>
      </>
    )
  }

  return (
    <LessonRunner
      key={`${round}:${replayUid ?? ''}`}
      steps={state.steps}
      texts={state.texts}
      record={recordStep}
      onClose={() => navigate('/')}
      onAnother={another}
      onFinish={onFinish}
    />
  )
}
