import { ChevronDown, ChevronUp } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
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
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
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
    setExpandedKey((prev) => (prev === leftKey ? null : prev))
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
    if (matchedKeys.has(key)) {
      setExpandedKey((prev) => (prev === key ? null : key))
      return
    }
    if (errorPair) return
    if (selectedRight) {
      tryPair(key, selectedRight)
      return
    }
    if (selectedLeft === key) {
      setSelectedLeft(null)
      setExpandedKey((prev) => (prev === key ? null : prev))
    } else {
      setSelectedLeft(key)
      setExpandedKey(key)
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
    setExpandedKey((prev) => (prev === key ? null : key))
  }

  return (
    <div className="exwrap">
      <p className="hint">
        Соедините начало стиха слева с его ссылкой справа. Нажмите на стих, чтобы раскрыть текст целиком.
      </p>

      <div className="match-columns">
        {data.left.map((item, idx) => {
          const rightItem = data.right[idx]
          const isMatched = matchedKeys.has(item.key)
          const isSelected = selectedLeft === item.key
          const isError = errorPair?.left === item.key
          const isExpanded = expandedKey === item.key
          const leftCls = [
            'match-card',
            'match-card-left',
            isExpanded && 'expanded',
            isMatched && 'ok',
            isSelected && 'selected',
            isError && 'bad',
          ]
            .filter(Boolean)
            .join(' ')

          const rMatched = rightItem ? matchedKeys.has(rightItem.key) : false
          const rSelected = rightItem ? selectedRight === rightItem.key : false
          const rError = rightItem ? errorPair?.right === rightItem.key : false
          const rightCls = [
            'match-card',
            'match-card-right',
            rMatched && 'ok',
            rSelected && 'selected',
            rError && 'bad',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <Fragment key={item.key}>
              <div
                role="button"
                tabIndex={0}
                className={leftCls}
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

              {rightItem && (
                <button
                  type="button"
                  className={rightCls}
                  disabled={rMatched}
                  onClick={() => clickRight(rightItem.key)}
                >
                  {rightItem.ref}
                </button>
              )}
            </Fragment>
          )
        })}
      </div>

      <div className="match-footer-status">
        <span className="counter">
          Соединено: {matchedKeys.size} / {total}
        </span>
      </div>
    </div>
  )
}
