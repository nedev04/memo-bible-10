import type { Rng } from '../logic/exercises'
import type { VerseState } from '../types'
import { gapSettings, partialSettings, typingVisiblePct } from './generator'
import type { ExerciseKind, LessonStep, StepSettings } from './types'

export interface PracticeLevel {
  label: string
  settings: StepSettings
}

export interface PracticeOption {
  kind: ExerciseKind
  title: string
  description: string
  /** Учебные упражнения без оценки не меняют силу стихов и не дают опыта */
  scored: boolean
  levels: PracticeLevel[]
}

/** Упражнения, которые можно пройти вручную, и их варианты сложности */
export const PRACTICE_OPTIONS: PracticeOption[] = [
  {
    kind: 'reveal', title: 'Открытие по тапу', scored: false,
    description: 'Стих открывается по частям при касании.',
    levels: [{ label: 'Начать', settings: { chunk: 2 } }],
  },
  {
    kind: 'partial', title: 'Частично скрытый текст', scored: false,
    description: 'Часть слов и букв скрыта; два ползунка меняют, сколько.',
    levels: [{ label: 'Начать', settings: { wordPct: 20, letterPct: 40 } }],
  },
  {
    kind: 'fillGaps', title: 'Пропущенные слова', scored: true,
    description: 'Выбрать пропущенные слова из вариантов.',
    levels: [
      { label: '3 пропуска', settings: { blanks: 3, options: 4 } },
      { label: '5 пропусков', settings: { blanks: 5, options: 5 } },
      { label: '8 пропусков', settings: { blanks: 8, options: 5 } },
    ],
  },
  {
    kind: 'firstLetters', title: 'Первые буквы', scored: true,
    description: 'Вводить первую букву каждого слова.',
    levels: [
      { label: 'Слова видны', settings: { hintLevel: 1 } },
      { label: 'Видны не все', settings: { hintLevel: 2 } },
      { label: 'Только пробелы', settings: { hintLevel: 3 } },
    ],
  },
  {
    kind: 'assemble', title: 'Соберите стих', scored: true,
    description: 'Собрать стих из слов и фраз в правильном порядке.',
    levels: [
      { label: '4 части', settings: { pieces: 4 } },
      { label: '8 частей', settings: { pieces: 8 } },
      { label: '14 частей', settings: { pieces: 14 } },
    ],
  },
  {
    kind: 'orderParts', title: 'Расставьте части', scored: true,
    description: 'Расставить по порядку несколько стихов подряд (или части одного стиха).',
    levels: [{ label: 'Начать', settings: {} }],
  },
  {
    kind: 'whereWritten', title: 'Где написано', scored: true,
    description: 'Выбрать, где написан стих.',
    levels: [
      { label: 'Книга', settings: { levels: 1 } },
      { label: 'Книга и глава', settings: { levels: 2 } },
      { label: 'Книга, глава, стих', settings: { levels: 3 } },
    ],
  },
  {
    kind: 'typing', title: 'Ввод по памяти', scored: true,
    description: 'Ввести стих (до трёх подряд) по памяти.',
    levels: [
      { label: 'Много подсказок', settings: { visiblePct: 60 } },
      { label: 'Немного подсказок', settings: { visiblePct: 35 } },
      { label: 'Чистый лист', settings: { visiblePct: 0 } },
    ],
  },
]

/** Сколько стихов берётся для упражнений по одному стиху, для расстановки частей и для ввода по памяти */
export const MAX_PER_VERSE = 6
export const MAX_ORDER_VERSES = 5
export const MAX_TYPING_VERSES = 3

/** Подряд идущий кусок списка не длиннее size, со случайным началом, если список длиннее */
export function windowOf<T>(list: T[], size: number, rng: Rng = Math.random): T[] {
  if (list.length <= size) return list
  const start = Math.floor(rng() * (list.length - size + 1))
  return list.slice(start, start + size)
}

/**
 * Шаги тренировки по выбранным стихам (keys идут по порядку Библии, подряд).
 * Упражнения по одному стиху: по шагу на каждый стих (не больше шести); «Расставьте части» и ввод по памяти:
 * одно задание на несколько стихов подряд.
 */
export function buildPracticeSteps(
  option: PracticeOption,
  levelIndex: number,
  keys: string[],
  rng: Rng = Math.random,
): LessonStep[] {
  const settings = option.levels[Math.min(levelIndex, option.levels.length - 1)].settings
  const step = (verseKeys: string[], n: number): LessonStep => ({
    id: `${option.kind}:${verseKeys.join('+')}:${n}`,
    kind: option.kind,
    verseKeys,
    settings,
  })

  if (option.kind === 'orderParts') return [step(windowOf(keys, MAX_ORDER_VERSES, rng), 0)]
  if (option.kind === 'typing') return [step(windowOf(keys, MAX_TYPING_VERSES, rng), 0)]
  return windowOf(keys, MAX_PER_VERSE, rng).map((k, i) => step([k], i))
}

/**
 * Автоматический подбор 5–8 разнообразных упражнений для персональной тренировки
 * одного стиха (или выбранной группы стихов), точно подогнанных под его силу (0–7).
 */
export function planVersePractice(
  targetVerses: VerseState[],
  allVerses: VerseState[] = targetVerses,
  rng: Rng = Math.random,
): LessonStep[] {
  if (targetVerses.length === 0) return []
  const v = targetVerses[0]
  const s = v.strength
  const keys = targetVerses.map((x) => x.key)
  const isMulti = targetVerses.length > 1
  const out: { kind: ExerciseKind; settings: StepSettings; verseKeys: string[] }[] = []

  const step = (kind: ExerciseKind, settings: StepSettings, verseKeys: string[] = [v.key]) => ({
    kind,
    settings,
    verseKeys,
  })

  if (!isMulti) {
    if (s === 0) {
      // Новый стих (сила 0): Знакомство -> Разбор -> Первые тренировки (7-8 упражнений)
      out.push(step('reveal', { chunk: 2 }))
      out.push(step('partial', partialSettings(0)))
      out.push(step('fillGaps', { blanks: 2, options: 4 }))
      out.push(step('assemble', { pieces: 4 }))
      out.push(step('firstLetters', { hintLevel: 1 }))
      out.push(step('partial', partialSettings(1)))
      out.push(step('fillGaps', { blanks: 3, options: 4 }))
      out.push(step('whereWritten', { levels: 1 }))
    } else if (s <= 2) {
      // Начальный уровень (сила 1-2): Разминка -> Усложнение -> Закрепление (7-8 упражнений)
      out.push(step('partial', partialSettings(s)))
      out.push(step('whereWritten', { levels: s === 1 ? 1 : 2 }))
      out.push(step('fillGaps', gapSettings(s)))
      out.push(step('assemble', { pieces: s === 1 ? 4 : 6 }))
      out.push(step('firstLetters', { hintLevel: 1 }))
      out.push(step('fillGaps', gapSettings(s + 1)))
      out.push(step('assemble', { pieces: s === 1 ? 6 : 8 }))
      out.push(step('firstLetters', { hintLevel: 2 }))
    } else if (s <= 4) {
      // Средний уровень (сила 3-4): Активное воспроизведение с подсказками (7-8 упражнений)
      out.push(step('partial', partialSettings(s)))
      out.push(step('whereWritten', { levels: s === 3 ? 2 : 3 }))
      out.push(step('fillGaps', gapSettings(s)))
      out.push(step('assemble', { pieces: s === 3 ? 8 : 10 }))
      out.push(step('firstLetters', { hintLevel: 2 }))
      const nextNeighbor = allVerses.find(
        (x) => x.book === v.book && x.chapter === v.chapter && x.verse === v.verse + 1 && x.strength >= 1,
      )
      if (nextNeighbor && rng() < 0.6) {
        out.push(step('orderParts', {}, [v.key, nextNeighbor.key]))
      } else {
        out.push(step('assemble', { pieces: s === 3 ? 10 : 12 }))
      }
      out.push(step('firstLetters', { hintLevel: 3 }))
      out.push(step('typing', { visiblePct: typingVisiblePct(s, 1) }))
    } else {
      // Высокий уровень (сила 5-7): Сложные задания, минимум подсказок (7 упражнений)
      out.push(step('whereWritten', { levels: 3 }))
      out.push(step('fillGaps', gapSettings(s)))
      out.push(step('assemble', { pieces: 12 }))
      out.push(step('partial', partialSettings(s)))
      out.push(step('firstLetters', { hintLevel: 3 }))
      const nextNeighbor = allVerses.find(
        (x) => x.book === v.book && x.chapter === v.chapter && x.verse === v.verse + 1 && x.strength >= 1,
      )
      if (nextNeighbor && rng() < 0.6) {
        out.push(step('orderParts', {}, [v.key, nextNeighbor.key]))
      } else {
        out.push(step('assemble', { pieces: 14 }))
      }
      out.push(step('typing', { visiblePct: 0 }))
    }
  } else {
    // Несколько стихов подряд
    const minStrength = Math.min(...targetVerses.map((x) => x.strength))
    targetVerses.forEach((verse) => {
      out.push(step('partial', partialSettings(verse.strength), [verse.key]))
    })
    targetVerses.forEach((verse) => {
      out.push(step('fillGaps', gapSettings(verse.strength), [verse.key]))
    })
    targetVerses.forEach((verse) => {
      out.push(step('firstLetters', { hintLevel: verse.strength >= 3 ? 2 : 1 }, [verse.key]))
    })
    if (keys.length >= 2) {
      out.push(step('orderParts', {}, keys.slice(0, 4)))
    }
    if (minStrength >= 2) {
      out.push(step('typing', { visiblePct: typingVisiblePct(minStrength, keys.length) }, keys.slice(0, 3)))
    }
  }

  const trimmed = out.slice(0, 8)
  return trimmed.map((c, n) => ({
    id: `practice:${c.kind}:${c.verseKeys.join('+')}:${n}`,
    ...c,
  }))
}
