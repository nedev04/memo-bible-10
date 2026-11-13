import { describe, expect, it } from 'vitest'
import { DAY } from '../logic/config'
import { flattenWords } from '../logic/exercises'
import type { VerseState } from '../types'
import { buildBridgeQuiz, resolveBridgeMode } from './bridge'
import { planLesson } from './generator'
import { buildMatchPairs } from './match'
import { buildProofreadTask, parseAiProofread } from './proofread'
import type { BridgePoolItem, VerseText } from './types'

const T0 = new Date('2026-03-10T10:00:00').getTime()

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function verseState(book: string, chapter: number, n: number, strength = 3): VerseState {
  return {
    key: `rst:${book}:${chapter}:${n}`,
    translation: 'rst',
    book,
    chapter,
    verse: n,
    addedAt: T0,
    strength,
    stage: 1,
    nextReviewAt: T0 - DAY,
    updatedAt: T0,
    lastUpAt: null,
    lastPracticedAt: null,
    lastScore: null,
    lapses: 0,
  }
}

const POOL: BridgePoolItem[] = [
  { key: 'rst:jhn:3:16', book: 'jhn', chapter: 3, verse: 16, ref: 'Иоанна 3:16', text: 'Ибо так возлюбил Бог мир, что отдал Сына Своего Единородного' },
  { key: 'rst:jhn:3:17', book: 'jhn', chapter: 3, verse: 17, ref: 'Иоанна 3:17', text: 'Ибо не послал Бог Сына Своего в мир, чтобы судить мир' },
  { key: 'rst:rom:8:28', book: 'rom', chapter: 8, verse: 28, ref: 'Римлянам 8:28', text: 'Притом знаем, что любящим Бога, призванным по Его изволению, все содействует ко благу' },
  { key: 'rst:psa:22:1', book: 'psa', chapter: 22, verse: 1, ref: 'Псалтирь 22:1', text: 'Господь — Пастырь мой; я ни в чем не буду нуждаться' },
  { key: 'rst:mat:5:7', book: 'mat', chapter: 5, verse: 7, ref: 'Матфея 5:7', text: 'Блаженны милостивые, ибо они помилованы будут' },
]

const SAMPLE_VERSE: VerseText = {
  key: 'rst:jhn:3:16',
  book: 'jhn',
  chapter: 3,
  verse: 16,
  ref: 'Иоанна 3:16',
  text: 'Ибо так возлюбил Бог мир, что отдал Сына Своего Единородного, дабы всякий верующий в Него, не погиб, но имел жизнь вечную.',
  chapterText: POOL.map((p) => p.text).join(' '),
  bookChapters: 21,
  chapterVerses: 36,
  bridgePool: POOL,
}

describe('Корректор (proofread)', () => {
  it('валидирует кандидатов от ИИ и отбрасывает несовпадающие или некорректные слова', () => {
    const words = flattenWords(SAMPLE_VERSE.text)
    const parsed = parseAiProofread(
      [
        { wordIndex: 2, original: 'возлюбил', impostor: 'избрал', distractors: ['принял', 'полюбил', 'плохой знак!'] },
        { wordIndex: 3, original: 'НЕВЕРНОЕ', impostor: 'человек', distractors: [] },
        { wordIndex: 2, original: 'возлюбил', impostor: 'дубликат', distractors: [] },
        { wordIndex: 999, original: 'нет', impostor: 'да', distractors: [] },
      ],
      words,
    )
    expect(parsed).toHaveLength(1)
    expect(parsed[0].original).toBe('возлюбил')
    expect(parsed[0].impostor).toBe('избрал')
    expect(parsed[0].distractors).toEqual(['избрал', 'принял', 'полюбил'])
  })

  it('уровень 1: 1 ошибка (офлайн), текст всегда содержит ошибку', () => {
    const task = buildProofreadTask(SAMPLE_VERSE.text, SAMPLE_VERSE.chapterText, 1, undefined, seeded(1))
    expect(task.slots).toHaveLength(1)
    expect(task.slots[0].impostor).not.toBe(task.slots[0].original)
  })

  it('уровень 2: 3 варианта замены, среди которых есть верное слово и само слово-ошибка', () => {
    const task = buildProofreadTask(SAMPLE_VERSE.text, SAMPLE_VERSE.chapterText, 2, undefined, seeded(2))
    expect(task.slots).toHaveLength(1)
    const slot = task.slots[0]
    expect(slot.options).toHaveLength(3)
    expect(slot.options).toContain(slot.original)
    expect(slot.options).toContain(slot.impostor)
  })

  it('уровень 3: 4 варианта замены и 2 ошибки для длинного стиха; использует ИИ-кандидатов, если они переданы', () => {
    const words = flattenWords(SAMPLE_VERSE.text)
    const ai = parseAiProofread(
      [
        { wordIndex: 2, original: 'возлюбил', impostor: 'избрал', distractors: ['полюбил', 'принял', 'увидел'] },
        { wordIndex: 4, original: 'мир', impostor: 'свет', distractors: ['покой', 'дом', 'век'] },
      ],
      words,
    )
    const task = buildProofreadTask(SAMPLE_VERSE.text, SAMPLE_VERSE.chapterText, 3, ai, seeded(3))
    expect(task.slots).toHaveLength(2)
    expect(task.slots[0].impostor).toBe('избрал')
    expect(task.slots[0].options).toHaveLength(4)
    expect(task.slots[0].options).toContain('возлюбил')
    expect(task.slots[0].options).toContain('избрал')
    expect(task.slots[1].options).toHaveLength(4)
  })
})

describe('Мостик (bridge)', () => {
  it('уровень 1: ссылка → 4 варианта начала стихов', () => {
    const quiz = buildBridgeQuiz(SAMPLE_VERSE, 1, undefined, seeded(1))
    expect(quiz.kind).toBe('choice')
    if (quiz.kind === 'choice') {
      expect(quiz.mode).toBe('refToStart')
      expect(quiz.options).toHaveLength(4)
      expect(quiz.options.map((o) => o.key)).toContain(SAMPLE_VERSE.key)
    }
  })

  it('уровень 2: чередует refToStart и textToRef и приоритетно берёт ловушки из той же книги/главы', () => {
    const modes = new Set<string>()
    for (let i = 1; i <= 20; i++) modes.add(resolveBridgeMode(2, undefined, seeded(i)))
    expect([...modes].sort()).toEqual(['refToStart', 'textToRef'])

    const quiz = buildBridgeQuiz(SAMPLE_VERSE, 2, 'textToRef', seeded(5))
    expect(quiz.kind).toBe('choice')
    if (quiz.kind === 'choice') {
      expect(quiz.mode).toBe('textToRef')
      expect(quiz.options).toHaveLength(4)
      // Иоанна 3:17 из той же главы должен попасть в ловушки
      expect(quiz.options.some((o) => o.key === 'rst:jhn:3:17')).toBe(true)
    }
  })

  it('уровень 3: оба варианта — первые буквы начала стиха и пошаговая сборка ссылки', () => {
    const modes = new Set<string>()
    for (let i = 1; i <= 20; i++) modes.add(resolveBridgeMode(3, undefined, seeded(i)))
    expect([...modes].sort()).toEqual(['refToLetters', 'textToBuildRef'])

    const lettersQuiz = buildBridgeQuiz(SAMPLE_VERSE, 3, 'refToLetters', seeded(1))
    expect(lettersQuiz.kind).toBe('letters')
    if (lettersQuiz.kind === 'letters') {
      expect(lettersQuiz.refLabel).toBe('Иоанна 3:16')
      expect(lettersQuiz.openingText.split(/\s+/).length).toBeGreaterThanOrEqual(3)
    }

    const buildQuiz = buildBridgeQuiz(SAMPLE_VERSE, 3, 'textToBuildRef', seeded(2))
    expect(buildQuiz.kind).toBe('buildRef')
    if (buildQuiz.kind === 'buildRef') {
      expect(buildQuiz.bookOptions.map((b) => b.value)).toContain('jhn')
      expect(buildQuiz.chapterOptions).toContain(3)
      expect(buildQuiz.verseOptions).toContain(16)
    }
  })
})

describe('Соответствие (matchRefs)', () => {
  it('формирует 2 колонки по 4–5 строк с перемешанной правой колонкой', () => {
    const items: VerseText[] = POOL.map((p) => ({
      ...SAMPLE_VERSE,
      key: p.key,
      book: p.book,
      chapter: p.chapter,
      verse: p.verse,
      ref: p.ref,
      text: p.text,
    }))
    const data = buildMatchPairs(items, seeded(7))
    expect(data.left).toHaveLength(5)
    expect(data.right).toHaveLength(5)
    expect(new Set(data.right.map((r) => r.key))).toEqual(new Set(data.left.map((l) => l.key)))
    expect(data.left[0].fullText).toBe(POOL[0].text)
    expect(data.left[0].snippet.length).toBeLessThanOrEqual(POOL[0].text.length)
  })
})

describe('Планировщик: ИИ-упражнения не первые, Мостик и Соответствие при 4+ стихах, урок не раздувается', () => {
  it('первый шаг урока не использует ИИ (proofread / fillGaps), даже если стихи в повторении', () => {
    const fourVerses = [
      verseState('jhn', 3, 16, 3),
      verseState('rom', 8, 28, 4),
      verseState('psa', 22, 1, 2),
      verseState('mat', 5, 7, 5),
    ]
    let sawBridge = false
    let sawMatch = false
    for (let i = 1; i <= 50; i++) {
      const steps = planLesson(fourVerses, T0, seeded(i))
      expect(['proofread', 'fillGaps']).not.toContain(steps[0].kind)
      expect(steps.length).toBeLessThanOrEqual(13)
      if (steps.some((s) => s.kind === 'bridge')) sawBridge = true
      if (steps.some((s) => s.kind === 'matchRefs')) sawMatch = true
    }
    expect(sawBridge).toBe(true)
    expect(sawMatch).toBe(true)
  })

  it('при одном повторяющемся стихе первый шаг тоже не использует ИИ', () => {
    for (const s of [1, 2, 3, 4, 5]) {
      for (let i = 1; i <= 30; i++) {
        const steps = planLesson([verseState('mat', 5, 7, s)], T0, seeded(i))
        expect(['proofread', 'fillGaps']).not.toContain(steps[0].kind)
      }
    }
  })

  it('если стихов меньше 4, «Мостик» и «Соответствие» не предлагаются', () => {
    const twoVerses = [verseState('jhn', 3, 16, 3), verseState('rom', 8, 28, 4)]
    for (let i = 1; i <= 25; i++) {
      const steps = planLesson(twoVerses, T0, seeded(i))
      expect(steps.some((s) => s.kind === 'bridge' || s.kind === 'matchRefs')).toBe(false)
    }
  })
})
