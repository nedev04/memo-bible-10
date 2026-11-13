import { BOOKS, bookOrder, getBook } from '../bible/books'
import { splitToken } from '../logic/parser'
import { flattenWords, shuffle, type Rng } from '../logic/exercises'
import { nearNumbers } from './where'
import type { BridgeMode, BridgePoolItem, VerseText } from './types'

/** Первые N слов текста (для превью в «Мостике» и «Соответствии») */
export function snippetOf(text: string, maxWords = 5): string {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  if (tokens.length <= maxWords) return tokens.join(' ')
  return `${tokens.slice(0, maxWords).join(' ')}…`
}

/** Фрагмент текста: начало или конец стиха (для уровня 2–3) */
export function fragmentOf(text: string, part: 'start' | 'end', maxWords = 7): string {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  if (tokens.length <= maxWords + 2) return tokens.join(' ')
  if (part === 'start') return `${tokens.slice(0, maxWords).join(' ')}…`
  return `…${tokens.slice(-maxWords).join(' ')}`
}

export interface BridgeChoice {
  key: string
  label: string
}

export type BridgeQuiz =
  | {
      kind: 'choice'
      mode: 'refToStart' | 'textToRef'
      promptLabel: string
      promptText: string
      answerKey: string
      options: BridgeChoice[]
    }
  | {
      kind: 'letters'
      mode: 'refToLetters'
      refLabel: string
      openingText: string
    }
  | {
      kind: 'buildRef'
      mode: 'textToBuildRef'
      fragment: string
      answerBook: string
      answerChapter: number
      answerVerse: number
      bookOptions: { value: string; label: string }[]
      chapterOptions: number[]
      verseOptions: number[]
    }

function pickDistractorVerses(
  verse: VerseText,
  pool: BridgePoolItem[],
  count: number,
  preferSameBook: boolean,
  rng: Rng,
): BridgePoolItem[] {
  const others = pool.filter((p) => p.key !== verse.key && p.text.trim().length > 0)
  if (others.length === 0) return []

  const scored = others.map((item) => {
    const sameBook = item.book === verse.book
    const sameChapter = sameBook && item.chapter === verse.chapter
    let priority = rng() * 2
    if (preferSameBook) {
      if (sameChapter) priority += 10
      else if (sameBook) priority += 6
    } else {
      if (!sameBook) priority += 8
      else if (!sameChapter) priority += 4
    }
    return { item, priority }
  })

  scored.sort((a, b) => b.priority - a.priority)
  return scored.slice(0, count).map((x) => x.item)
}

/** Определяет конкретный режим «Мостика» с учётом уровня */
export function resolveBridgeMode(
  level: 1 | 2 | 3,
  explicitMode?: BridgeMode,
  rng: Rng = Math.random,
): BridgeMode {
  if (explicitMode) return explicitMode
  if (level === 1) return 'refToStart'
  if (level === 2) return rng() < 0.5 ? 'refToStart' : 'textToRef'
  return rng() < 0.5 ? 'refToLetters' : 'textToBuildRef'
}

/**
 * Строит задание «Мостик» для одного стиха.
 * - Уровень 1: по ссылке выбрать начало стиха из 4 разных книг/стихов.
 * - Уровень 2: чередует «Ссылка → фрагмент» и «Фрагмент → ссылка», подбирая ловушки из той же книги/главы.
 * - Уровень 3: чередует «Ссылка → первые буквы начала» и «Фрагмент → собери ссылку (книга/глава/стих)».
 */
export function buildBridgeQuiz(
  verse: VerseText,
  level: 1 | 2 | 3,
  explicitMode?: BridgeMode,
  rng: Rng = Math.random,
): BridgeQuiz {
  const pool = verse.bridgePool ?? []
  const mode = resolveBridgeMode(level, explicitMode, rng)

  if (mode === 'refToLetters') {
    const words = flattenWords(verse.text)
    const count = Math.min(words.length, Math.max(3, Math.min(5, words.length)))
    const openingText = words
      .slice(0, count)
      .map((w) => w.raw)
      .join(' ')
    return {
      kind: 'letters',
      mode: 'refToLetters',
      refLabel: verse.ref,
      openingText,
    }
  }

  if (mode === 'textToBuildRef') {
    const fragment = fragmentOf(verse.text, rng() < 0.5 ? 'end' : 'start', 7)
    const libBookIds = [...new Set([verse.book, ...pool.map((p) => p.book)])]
    const extraBooks = shuffle(
      BOOKS.filter((b) => !libBookIds.includes(b.id)).map((b) => b.id),
      rng,
    )
    while (libBookIds.length < 4 && extraBooks.length > 0) {
      libBookIds.push(extraBooks.shift()!)
    }
    const bookOptions = libBookIds
      .slice(0, 6)
      .sort((a, b) => bookOrder(a) - bookOrder(b))
      .map((id) => ({ value: id, label: getBook(id)?.name ?? id }))

    const chapterOptions =
      verse.bookChapters > 1
        ? nearNumbers(verse.chapter, verse.bookChapters, Math.min(5, verse.bookChapters), rng)
        : [verse.chapter]

    const verseOptions =
      verse.chapterVerses > 1
        ? nearNumbers(verse.verse, verse.chapterVerses, Math.min(5, verse.chapterVerses), rng)
        : [verse.verse]

    return {
      kind: 'buildRef',
      mode: 'textToBuildRef',
      fragment,
      answerBook: verse.book,
      answerChapter: verse.chapter,
      answerVerse: verse.verse,
      bookOptions,
      chapterOptions,
      verseOptions,
    }
  }

  const distractors = pickDistractorVerses(verse, pool, 3, level >= 2, rng)

  if (mode === 'textToRef') {
    const useEnd = level >= 2 && rng() < 0.45 && verse.text.split(/\s+/).length >= 10
    const promptText = fragmentOf(verse.text, useEnd ? 'end' : 'start', 7)
    const options: BridgeChoice[] = shuffle(
      [
        { key: verse.key, label: verse.ref },
        ...distractors.map((d) => ({ key: d.key, label: d.ref })),
      ],
      rng,
    )
    return {
      kind: 'choice',
      mode: 'textToRef',
      promptLabel: useEnd ? 'Какому стиху принадлежит это окончание?' : 'Где написаны эти слова?',
      promptText,
      answerKey: verse.key,
      options,
    }
  }

  // refToStart
  const useSnippet = (t: string) => {
    const clean = t.trim()
    const tokens = clean.split(/\s+/).filter(Boolean)
    if (tokens.length <= 5) return clean
    return `${tokens.slice(0, 5).map((tok) => splitToken(tok).lead + splitToken(tok).core + splitToken(tok).trail).join(' ')}…`
  }

  const options: BridgeChoice[] = shuffle(
    [
      { key: verse.key, label: useSnippet(verse.text) },
      ...distractors.map((d) => ({ key: d.key, label: useSnippet(d.text) })),
    ],
    rng,
  )

  return {
    kind: 'choice',
    mode: 'refToStart',
    promptLabel: 'С каких слов начинается этот стих?',
    promptText: verse.ref,
    answerKey: verse.key,
    options,
  }
}
