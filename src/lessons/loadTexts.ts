import { loadBook } from '../bible/bible'
import { formatRange, parseKey, TRANSLATION } from '../bible/refs'
import type { VerseState } from '../types'
import type { BridgePoolItem, VerseText } from './types'

/** Подгружает тексты стихов (и главы целиком, из неё берутся неверные варианты ответа). Стихи без текста пропускаются. */
export async function loadTexts(keys: string[], allVerses?: VerseState[]): Promise<Map<string, VerseText>> {
  const out = new Map<string, VerseText>()
  for (const key of keys) {
    const p = parseKey(key)
    if (!p) continue
    const chapters = await loadBook(TRANSLATION, p.book)
    const verses = chapters[p.chapter - 1] ?? []
    const text = verses[p.verse - 1]
    if (!text) continue
    out.set(key, {
      key, book: p.book, chapter: p.chapter, verse: p.verse,
      ref: formatRange({ book: p.book, chapter: p.chapter, from: p.verse, to: p.verse }),
      text,
      chapterText: verses.filter(Boolean).join(' '),
      bookChapters: chapters.length,
      chapterVerses: verses.length,
    })
  }

  if (allVerses && allVerses.length >= 2) {
    // Собираем пул стихов пользователя (уже загруженные + до 12 дополнительных из библиотеки) для «Мостика»
    const poolMap = new Map<string, BridgePoolItem>()
    for (const v of out.values()) {
      poolMap.set(v.key, {
        key: v.key, book: v.book, chapter: v.chapter, verse: v.verse, ref: v.ref, text: v.text,
      })
    }
    const extraKeys = allVerses.filter((v) => !poolMap.has(v.key)).slice(0, 12)
    for (const v of extraKeys) {
      try {
        const chapters = await loadBook(TRANSLATION, v.book)
        const text = chapters[v.chapter - 1]?.[v.verse - 1]
        if (!text) continue
        poolMap.set(v.key, {
          key: v.key,
          book: v.book,
          chapter: v.chapter,
          verse: v.verse,
          ref: formatRange({ book: v.book, chapter: v.chapter, from: v.verse, to: v.verse }),
          text,
        })
      } catch {
        /* пропускаем, если книга не загрузилась */
      }
    }
    const pool = [...poolMap.values()]
    for (const v of out.values()) {
      v.bridgePool = pool
    }
  }

  return out
}
