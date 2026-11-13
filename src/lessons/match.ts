import { shuffle, type Rng } from '../logic/exercises'
import { snippetOf } from './bridge'
import type { VerseText } from './types'

export interface MatchLeftItem {
  key: string
  snippet: string
  fullText: string
}

export interface MatchRightItem {
  key: string
  ref: string
}

export interface MatchPairsData {
  left: MatchLeftItem[]
  right: MatchRightItem[]
}

/**
 * Формирует две колонки (4–5 строк) для упражнения на соответствие «начало стиха ↔ ссылка».
 */
export function buildMatchPairs(verses: VerseText[], rng: Rng = Math.random): MatchPairsData {
  const slice = verses.slice(0, 5)
  const left: MatchLeftItem[] = slice.map((v) => ({
    key: v.key,
    snippet: snippetOf(v.text, 4),
    fullText: v.text,
  }))
  const rightOrder = shuffle(
    slice.map((v) => ({ key: v.key, ref: v.ref })),
    rng,
  )
  return { left, right: rightOrder }
}
