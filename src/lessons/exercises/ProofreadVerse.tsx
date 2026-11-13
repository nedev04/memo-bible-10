import { useEffect, useMemo, useRef, useState } from 'react'
import { flattenWords } from '../../logic/exercises'
import WordFlow from '../../exercises/WordFlow'
import { getProofreadInflight } from '../aiProofread'
import { buildProofreadTask, type ProofreadTask } from '../proofread'
import type { StepProps } from '../types'

export default function ProofreadVerse({ verse, settings, onAnswer }: StepProps) {
  const level = settings.proofLevel ?? 1
  const [task, setTask] = useState<ProofreadTask | null>(() => {
    const cached = verse.aiProofread?.[level]
    if (cached && cached.length > 0) {
      return buildProofreadTask(verse.text, verse.chapterText, level, cached)
    }
    return null
  })

  useEffect(() => {
    if (task) return
    let alive = true
    const cached = verse.aiProofread?.[level]
    if (cached && cached.length > 0) {
      setTask(buildProofreadTask(verse.text, verse.chapterText, level, cached))
      return
    }

    const inflight = getProofreadInflight(verse, level)
    if (!inflight) {
      setTask(buildProofreadTask(verse.text, verse.chapterText, level))
      return
    }

    // Если фоновый запрос ИИ почти завершился, ждём не более 900 мс, иначе сразу стартуем офлайн-вариант
    Promise.race([
      inflight,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 900)),
    ]).then((aiItems) => {
      if (!alive) return
      const finalAi = aiItems && aiItems.length > 0 ? aiItems : verse.aiProofread?.[level]
      setTask(buildProofreadTask(verse.text, verse.chapterText, level, finalAi))
    })

    return () => {
      alive = false
    }
  }, [verse, level, task])

  if (!task) {
    return (
      <div className="exwrap">
        <p className="hint">Подготавливаем текст для проверки…</p>
      </div>
    )
  }

  return <ProofreadBoard key={`${verse.key}:${level}`} verseRef={verse.ref} verseText={verse.text} level={level} task={task} onAnswer={onAnswer} />
}

interface BoardProps {
  verseRef: string
  verseText: string
  level: 1 | 2 | 3
  task: ProofreadTask
  onAnswer: StepProps['onAnswer']
}

function ProofreadBoard({ level, task, verseText, onAnswer }: BoardProps) {
  const { words, slots } = task
  const slotByWordIdx = useMemo(() => new Map(slots.map((s, idx) => [s.wordIndex, idx])), [slots])

  const [solved, setSolved] = useState<boolean[]>(() => slots.map(() => false))
  const [wrongReplaced, setWrongReplaced] = useState<boolean[]>(() => slots.map(() => false))
  const [activeSlot, setActiveSlot] = useState<number | null>(null)
  const [wrongTapCount, setWrongTapCount] = useState(0)
  const [flashWrongWord, setFlashWrongWord] = useState<number | null>(null)
  const answered = useRef(false)

  const done = slots.length > 0 && solved.every(Boolean)
  const solvedCount = solved.filter(Boolean).length

  useEffect(() => {
    if (answered.current) return
    if (slots.length === 0) {
      answered.current = true
      onAnswer({ score: 100, neutral: true })
      return
    }
    if (done) {
      answered.current = true
      const replaceFails = wrongReplaced.filter(Boolean).length
      const tapPenalty = wrongTapCount * 20
      const replacePenalty = Math.round((replaceFails / slots.length) * 60)
      const score = Math.max(0, Math.min(100, 100 - tapPenalty - replacePenalty))
      onAnswer({ score, detail: score < 100 ? verseText : undefined })
    }
  }, [done, slots.length, wrongReplaced, wrongTapCount, verseText, onAnswer])

  function handleWordClick(wordIdx: number) {
    if (done || activeSlot !== null) return
    const slotIdx = slotByWordIdx.get(wordIdx)
    if (slotIdx === undefined) {
      // Нажато правильное слово — мягкий сигнал ошибки
      setWrongTapCount((n) => n + 1)
      setFlashWrongWord(wordIdx)
      setTimeout(() => {
        setFlashWrongWord((prev) => (prev === wordIdx ? null : prev))
      }, 550)
      return
    }

    if (solved[slotIdx]) return

    if (level === 1) {
      // На 1 уровне достаточно найти ошибочное слово
      setSolved((prev) => prev.map((v, i) => (i === slotIdx ? true : v)))
    } else {
      // На 2–3 уровне открываем выбор замены из 3–4 вариантов
      setActiveSlot(slotIdx)
    }
  }

  function chooseReplacement(option: string) {
    if (activeSlot === null || done) return
    const slot = slots[activeSlot]
    if (option !== slot.original) {
      setWrongReplaced((prev) => prev.map((v, i) => (i === activeSlot ? true : v)))
    }
    setSolved((prev) => prev.map((v, i) => (i === activeSlot ? true : v)))
    setActiveSlot(null)
  }

  function hintError() {
    if (done || activeSlot !== null) return
    const nextUnsolved = solved.findIndex((s) => !s)
    if (nextUnsolved === -1) return
    setWrongTapCount((n) => n + 2)
    if (level === 1) {
      setWrongReplaced((prev) => prev.map((v, i) => (i === nextUnsolved ? true : v)))
      setSolved((prev) => prev.map((v, i) => (i === nextUnsolved ? true : v)))
    } else {
      setActiveSlot(nextUnsolved)
    }
  }

  const hintText =
    activeSlot !== null
      ? 'Выберите слово, которое должно стоять на этом месте:'
      : level === 1
      ? 'В стихе допущена 1 ошибка. Нажмите на неверное слово.'
      : slots.length > 1
      ? `В стихе скрыты ошибки (${slots.length}). Найдите их и выберите верную замену.`
      : 'Найдите ошибку в стихе, нажмите на неверное слово и выберите верную замену.'

  // Если текст очень короткий, flattenWords безопасен
  const safeWords = words.length > 0 ? words : flattenWords(verseText)

  return (
    <div className="exwrap">
      <p className="hint">{hintText}</p>

      <WordFlow
        words={safeWords}
        renderWord={(w, i) => {
          const slotIdx = slotByWordIdx.get(i)
          if (slotIdx === undefined) {
            const isFlashed = flashWrongWord === i
            return (
              <span className="proof-word-wrap">
                {w.lead}
                <button
                  type="button"
                  className={isFlashed ? 'proof-word genuine-bad' : 'proof-word'}
                  onClick={() => handleWordClick(i)}
                  disabled={done || activeSlot !== null}
                >
                  {w.core}
                </button>
                {w.trail}
              </span>
            )
          }

          const slot = slots[slotIdx]
          if (solved[slotIdx]) {
            return (
              <span>
                {w.lead}
                <span className={wrongReplaced[slotIdx] ? 'filled bad' : 'filled'}>{slot.original}</span>
                {w.trail}
              </span>
            )
          }

          const isCur = activeSlot === slotIdx
          return (
            <span className="proof-word-wrap">
              {w.lead}
              <button
                type="button"
                className={isCur ? 'proof-word cur' : 'proof-word'}
                onClick={() => handleWordClick(i)}
                disabled={done || (activeSlot !== null && !isCur)}
              >
                {slot.impostor}
              </button>
              {w.trail}
            </span>
          )
        }}
      />

      {!done && activeSlot !== null && (
        <div className="reveal-bar col">
          <div className="options">
            {slots[activeSlot].options.map((opt) => (
              <button key={opt} type="button" className="btn option-choice-btn" onClick={() => chooseReplacement(opt)}>
                {opt}
              </button>
            ))}
          </div>
          <span className="counter">
            Найдено: {solvedCount} / {slots.length}
          </span>
        </div>
      )}

      {!done && activeSlot === null && slots.length > 0 && (
        <div className="reveal-bar">
          <span className="counter">
            Ошибок исправлено: {solvedCount} / {slots.length}
          </span>
          <button type="button" className="btn ghost" onClick={hintError}>
            Подсказать
          </button>
        </div>
      )}
    </div>
  )
}
