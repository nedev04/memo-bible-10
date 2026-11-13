import { useMemo, useRef, useState } from 'react'
import FirstLetters from '../../exercises/FirstLetters'
import { vibrateError } from '../../lib/haptics'
import { buildBridgeQuiz } from '../bridge'
import type { StepProps } from '../types'

export default function BridgeVerse({ verse, settings, onAnswer }: StepProps) {
  const level = settings.bridgeLevel ?? 1
  const quiz = useMemo(
    () => buildBridgeQuiz(verse, level, settings.bridgeMode),
    [verse, level, settings.bridgeMode],
  )
  const answered = useRef(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // Для режима сборки ссылки (уровень 3, вариант Б)
  const [stepField, setStepField] = useState<'book' | 'chapter' | 'verse' | 'done'>('book')
  const [pickedLog, setPickedLog] = useState<{ label: string; ok: boolean }[]>([])

  function submit(score: number, detail?: string) {
    if (answered.current) return
    answered.current = true
    onAnswer({ score, detail })
  }

  if (quiz.kind === 'letters') {
    return (
      <div className="exwrap">
        <div className="bridge-ref-hero">{quiz.refLabel}</div>
        <p className="hint">Вспомните начало стиха и введите первые буквы первых слов.</p>
        <FirstLetters
          content={quiz.openingText}
          difficulty={3}
          embedded
          onComplete={(score) => submit(score, score < 100 ? verse.text : undefined)}
        />
      </div>
    )
  }

  if (quiz.kind === 'buildRef') {
    const pickBuild = (value: string | number, label: string) => {
      if (stepField === 'done' || answered.current) return
      let isOk = false
      let nextField: 'book' | 'chapter' | 'verse' | 'done' = 'done'

      if (stepField === 'book') {
        isOk = value === quiz.answerBook
        nextField = quiz.chapterOptions.length > 1 ? 'chapter' : quiz.verseOptions.length > 1 ? 'verse' : 'done'
      } else if (stepField === 'chapter') {
        isOk = Number(value) === quiz.answerChapter
        nextField = quiz.verseOptions.length > 1 ? 'verse' : 'done'
      } else if (stepField === 'verse') {
        isOk = Number(value) === quiz.answerVerse
        nextField = 'done'
      }

      if (!isOk) vibrateError()
      const nextLog = [...pickedLog, { label, ok: isOk }]
      setPickedLog(nextLog)
      setStepField(nextField)

      if (nextField === 'done') {
        const correctCount = nextLog.filter((x) => x.ok).length
        const score = Math.round((correctCount / nextLog.length) * 100)
        submit(score, score < 100 ? verse.ref : undefined)
      }
    }

    return (
      <div className="exwrap">
        <p className="hint">Определите по отрывку, где написаны эти слова.</p>
        <blockquote className="cue">{quiz.fragment}</blockquote>

        {pickedLog.map((entry, idx) => (
          <p key={idx} className={entry.ok ? 'where-line ok' : 'where-line bad'}>
            {entry.ok ? '✓' : '✗'} {entry.label}
          </p>
        ))}

        {stepField === 'book' && (
          <>
            <h2>Выберите книгу</h2>
            <div className="options">
              {quiz.bookOptions.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  className="btn option-choice-btn"
                  onClick={() => pickBuild(b.value, `Книга: ${b.label}`)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </>
        )}

        {stepField === 'chapter' && (
          <>
            <h2>Выберите главу</h2>
            <div className="options">
              {quiz.chapterOptions.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  className="btn option-choice-btn"
                  onClick={() => pickBuild(ch, `Глава: ${ch}`)}
                >
                  {ch}
                </button>
              ))}
            </div>
          </>
        )}

        {stepField === 'verse' && (
          <>
            <h2>Выберите номер стиха</h2>
            <div className="options">
              {quiz.verseOptions.map((vNum) => (
                <button
                  key={vNum}
                  type="button"
                  className="btn option-choice-btn"
                  onClick={() => pickBuild(vNum, `Стих: ${vNum}`)}
                >
                  {vNum}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // Выбор из 4 вариантов (refToStart / textToRef)
  function chooseOption(key: string) {
    if (quiz.kind !== 'choice' || answered.current || selectedKey !== null) return
    setSelectedKey(key)
    const ok = key === quiz.answerKey
    if (!ok) vibrateError()
    const correctLabel = quiz.options.find((o) => o.key === quiz.answerKey)?.label ?? verse.ref
    submit(ok ? 100 : 0, ok ? undefined : `${verse.ref}: «${correctLabel}»`)
  }

  return (
    <div className="exwrap">
      <p className="hint">{quiz.promptLabel}</p>

      {quiz.mode === 'refToStart' ? (
        <div className="bridge-ref-hero">{quiz.promptText}</div>
      ) : (
        <blockquote className="cue">{quiz.promptText}</blockquote>
      )}

      <div className="bridge-options-list">
        {quiz.options.map((o) => {
          const isPicked = selectedKey === o.key
          const isAnswer = o.key === quiz.answerKey
          const cls =
            selectedKey === null
              ? 'bridge-option-card'
              : isAnswer
              ? 'bridge-option-card ok'
              : isPicked
              ? 'bridge-option-card bad'
              : 'bridge-option-card'
          return (
            <button
              key={o.key}
              type="button"
              className={cls}
              disabled={selectedKey !== null}
              onClick={() => chooseOption(o.key)}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
