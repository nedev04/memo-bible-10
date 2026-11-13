import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildMatchPairs } from '../match'
import type { StepProps } from '../types'

/**
 * Упражнение на соответствие: 2 колонки по 4–5 строк.
 * В левой — начало стиха (по клику раскрывается целиком), в правой — место в Библии (Иоанна 4:1).
 */
export default function MatchRefs({ verses, onAnswer }: StepProps) {
  const data = useMemo(() => buildMatchPairs(verses), [verses])
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null)
  const [selectedRight, setSelectedRight] = useState<string | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set())
  const [matchedKeys, setMatchedKeys] = useState<Set<string>>(() => new Set())
  const [errorPair, setErrorPair] = useState<{ left: string; right: string } | null>(null)
  const [mistakesByKey, setMistakesByKey] = useState<Record<string, number>>({})
  const answered = useRef(false)

  const total = data.left.length
  const done = total > 0 && matchedKeys.size === total

  useEffect(() => {
    if (answered.current) return
    if (total < 2) {
      answered.current = true
      onAnswer({ score: 100, neutral: true })
      return
    }
    if (done) {
      answered.current = true
      const perVerse: Record<string, number> = {}
      let sum = 0
      for (const item of data.left) {
        const m = mistakesByKey[item.key] ?? 0
        const s = m === 0 ? 100 : m === 1 ? 75 : 40
        perVerse[item.key] = s
        sum += s
      }
      const score = Math.round(sum / total)
      onAnswer({ score, perVerse })
    }
  }, [done, total, data.left, mistakesByKey, onAnswer])

  function tryPair(leftKey: string, rightKey: string) {
    if (leftKey === rightKey) {
      setMatchedKeys((prev) => new Set(prev).add(leftKey))
      setSelectedLeft(null)
      setSelectedRight(null)
      setErrorPair(null)
    } else {
      setMistakesByKey((prev) => ({
        ...prev,
        [leftKey]: (prev[leftKey] ?? 0) + 1,
        [rightKey]: (prev[rightKey] ?? 0) + 1,
      }))
      setErrorPair({ left: leftKey, right: rightKey })
      setSelectedLeft(null)
      setSelectedRight(null)
      setTimeout(() => {
        setErrorPair(null)
      }, 550)
    }
  }

  function clickLeft(key: string) {
    // По клику на строку стиха он раскрывается целиком (если уже открыт — можно свернуть кнопкой, либо остаётся читаемым)
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key) && selectedLeft === key) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })

    if (matchedKeys.has(key) || errorPair) return
    if (selectedRight) {
      tryPair(key, selectedRight)
    } else {
      setSelectedLeft((prev) => (prev === key ? null : key))
    }
  }

  function clickRight(key: string) {
    if (matchedKeys.has(key) || errorPair) return
    if (selectedLeft) {
      tryPair(selectedLeft, key)
    } else {
      setSelectedRight((prev) => (prev === key ? null : key))
    }
  }

  function toggleExpandOnly(e: React.MouseEvent, key: string) {
    e.stopPropagation()
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="exwrap">
      <p className="hint">
        Соедините начало стиха слева с его ссылкой справа. Нажмите на стих, чтобы раскрыть текст целиком.
      </p>

      <div className="match-columns">
        <div className="match-col">
          {data.left.map((item) => {
            const isMatched = matchedKeys.has(item.key)
            const isSelected = selectedLeft === item.key
            const isError = errorPair?.left === item.key
            const isExpanded = expandedKeys.has(item.key)
            const cls = [
              'match-card',
              'match-card-left',
              isMatched && 'ok',
              isSelected && 'selected',
              isError && 'bad',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <div
                key={item.key}
                role="button"
                tabIndex={0}
                className={cls}
                onClick={() => clickLeft(item.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    clickLeft(item.key)
                  }
                }}
              >
                <div className="match-card-text">
                  {isExpanded ? item.fullText : item.snippet}
                </div>
                <button
                  type="button"
                  className="match-expand-btn"
                  onClick={(e) => toggleExpandOnly(e, item.key)}
                  aria-label={isExpanded ? 'Свернуть стих' : 'Раскрыть стих целиком'}
                >
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            )
          })}
        </div>

        <div className="match-col">
          {data.right.map((item) => {
            const isMatched = matchedKeys.has(item.key)
            const isSelected = selectedRight === item.key
            const isError = errorPair?.right === item.key
            const cls = [
              'match-card',
              'match-card-right',
              isMatched && 'ok',
              isSelected && 'selected',
              isError && 'bad',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <button
                key={item.key}
                type="button"
                className={cls}
                disabled={isMatched}
                onClick={() => clickRight(item.key)}
              >
                {item.ref}
              </button>
            )
          })}
        </div>
      </div>

      <div className="match-footer-status">
        <span className="counter">
          Соединено: {matchedKeys.size} / {total}
        </span>
      </div>
    </div>
  )
}
