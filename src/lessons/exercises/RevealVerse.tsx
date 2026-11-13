import { useMemo, useState } from 'react'
import type { StepProps } from '../types'

/** Учебное упражнение: стих открывается по частям при касании экрана */
export default function RevealVerse({ verse, settings, onAnswer }: StepProps) {
  const size = Math.max(1, settings.chunk ?? 2)

  // Разделяем стих на строки, а строки на куски (chunks), чтобы кусок не пересекал строки
  // и слова одного куска не разрывались переносом строки (inline-block + nowrap)
  const lines = useMemo(() => {
    const rawLines = verse.text.split(/\r?\n/)
    let counter = 0
    return rawLines.map((line) => {
      const words = line.split(/\s+/).filter(Boolean)
      const lineChunks: { id: number; text: string }[] = []
      for (let i = 0; i < words.length; i += size) {
        lineChunks.push({ id: counter++, text: words.slice(i, i + size).join(' ') })
      }
      return lineChunks
    })
  }, [verse.text, size])

  const totalChunks = useMemo(() => lines.reduce((acc, line) => acc + line.length, 0), [lines])
  const [shown, setShown] = useState(0)
  const done = shown >= totalChunks

  return (
    <div className="reveal" onClick={() => !done && setShown((s) => s + 1)}>
      <div className="reveal-text">
        {shown === 0 && <p className="hint">Касайтесь экрана, чтобы стих открывался по частям.</p>}
        {lines.map((lineChunks, lineIdx) => {
          const visible = lineChunks.filter((c) => c.id < shown)
          if (visible.length === 0) return null
          return (
            <div key={lineIdx} className="reveal-line">
              {visible.map((c) => {
                const isFresh = c.id === shown - 1 && !done
                return (
                  <span
                    key={c.id}
                    className={`reveal-chunk ${isFresh ? 'fresh' : ''}`}
                  >
                    {c.text}
                  </span>
                )
              })}
            </div>
          )
        })}
      </div>
      <div className="reveal-bar" onClick={(e) => e.stopPropagation()}>
        <button className="btn ghost" disabled={shown === 0} onClick={() => setShown((s) => Math.max(0, s - 1))}>Назад</button>
        <span className="counter">{shown} / {totalChunks}</span>
        {done ? (
          <button className="btn primary" onClick={() => onAnswer({ score: 100, neutral: true })}>Дальше</button>
        ) : (
          <button className="btn ghost" onClick={() => setShown(totalChunks)}>Весь стих</button>
        )}
      </div>
    </div>
  )
}

