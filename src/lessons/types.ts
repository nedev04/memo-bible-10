import type { Tier } from '../logic/mastery'
import type { ProofreadCandidate } from '../types'

export type ExerciseKind =
  | 'reveal'
  | 'partial'
  | 'fillGaps'
  | 'assemble'
  | 'whereWritten'
  | 'orderParts'
  | 'typing'
  | 'firstLetters'
  | 'proofread'
  | 'bridge'
  | 'matchRefs'

export const KIND_TITLE: Record<ExerciseKind, string> = {
  reveal: 'Откройте стих по частям',
  partial: 'Прочитайте стих',
  fillGaps: 'Выберите пропущенное слово',
  assemble: 'Соберите стих в правильном порядке',
  whereWritten: 'Где это написано?',
  orderParts: 'Расставьте части по порядку',
  typing: 'Введите по памяти',
  firstLetters: 'Введите первые буквы слов',
  proofread: 'Корректор: найдите ошибку',
  bridge: 'Мостик: ссылка и слова',
  matchRefs: 'Соедините стих и ссылку',
}

/** В заголовке упражнения нельзя показывать ссылку, если она и есть ответ */
export const KIND_SHOWS_REF: Record<ExerciseKind, boolean> = {
  reveal: true,
  partial: true,
  fillGaps: true,
  assemble: true,
  whereWritten: false,
  orderParts: true,
  typing: true,
  firstLetters: true,
  proofread: true,
  bridge: false,
  matchRefs: false,
}

/**
 * Сложность упражнения для правил запоминания. null — учебное упражнение: оно знакомит со стихом,
 * но не проверяет его, поэтому на силу стиха не влияет.
 */
export function stepTier(step: LessonStep): Tier | null {
  switch (step.kind) {
    case 'reveal':
      return null
    case 'partial':
      return null
    case 'fillGaps':
      return (step.settings.blanks ?? 1) >= 5 ? 2 : 1
    case 'whereWritten':
      return (step.settings.levels ?? 1) >= 3 ? 2 : 1
    case 'assemble':
      return (step.settings.pieces ?? 6) >= 12 ? 3 : (step.settings.pieces ?? 6) <= 4 ? 1 : 2
    case 'orderParts':
      return 2
    case 'typing':
      // Ввод по памяти с чистого листа — вспоминание без подсказок; если часть слов показана, это вспоминание с опорой
      return (step.settings.visiblePct ?? 0) > 0 ? 2 : 3
    case 'firstLetters':
      // Слова видны целиком — узнавание; видны частично или не видны — вспоминание с опорой
      return (step.settings.hintLevel ?? 1) <= 1 ? 1 : 2
    case 'proofread': {
      const lvl = step.settings.proofLevel ?? 1
      return lvl >= 3 ? 3 : lvl === 2 ? 2 : 1
    }
    case 'bridge': {
      const lvl = step.settings.bridgeLevel ?? 1
      return lvl >= 3 ? 3 : lvl === 2 ? 2 : 1
    }
    case 'matchRefs':
      return 2
  }
}

/**
 * Уникальный тег упражнения с учётом уровня сложности:
 * например: 'firstLetters:2', 'whereWritten:1', 'assemble:6', 'fillGaps:3', 'typing:full', 'typing:assisted:35'
 */
export function exerciseDifficultyKey(kind: ExerciseKind, settings: StepSettings): string {
  switch (kind) {
    case 'firstLetters':
      return `firstLetters:${settings.hintLevel ?? 1}`
    case 'whereWritten':
      return `whereWritten:${settings.levels ?? 1}`
    case 'assemble':
      return `assemble:${settings.pieces ?? 6}`
    case 'fillGaps':
      return `fillGaps:${settings.blanks ?? 3}`
    case 'typing':
      return (settings.visiblePct ?? 0) === 0 ? 'typing:full' : `typing:assisted:${settings.visiblePct}`
    case 'partial':
      return `partial:${settings.wordPct ?? 20}`
    case 'proofread':
      return `proofread:${settings.proofLevel ?? 1}`
    case 'bridge':
      return `bridge:${settings.bridgeLevel ?? 1}:${settings.bridgeMode ?? 'auto'}`
    case 'matchRefs':
      return 'matchRefs'
    case 'orderParts':
      return 'orderParts'
    case 'reveal':
      return 'reveal'
    default:
      return kind
  }
}

export type BridgeMode = 'refToStart' | 'textToRef' | 'refToLetters' | 'textToBuildRef'

export interface StepSettings {
  /** Сколько слов открывается за одно касание */
  chunk?: number
  /** Доля скрытых слов, % (0–50) */
  wordPct?: number
  /** Доля скрытых букв в остальных словах, % (0–100) */
  letterPct?: number
  /** Сколько пропусков */
  blanks?: number
  /** Сколько вариантов ответа */
  options?: number
  /** На сколько частей разбивается стих при сборке */
  pieces?: number
  /** Сколько вопросов «где написано»: 1 — книга, 2 — и глава, 3 — и стих */
  levels?: 1 | 2 | 3
  /** Первые буквы: 1 — слова видны, 2 — видны не все, 3 — видны только пробелы */
  hintLevel?: 1 | 2 | 3
  /** Ввод по памяти: сколько процентов слов уже стоит на месте (0 — чистый лист) */
  visiblePct?: number
  /** Уровень сложности «Корректора»: 1 — заметная ошибка, 2 — тонкая + 3 варианта замены, 3 — 1–2 тонкие + 4 варианта */
  proofLevel?: 1 | 2 | 3
  /** Уровень сложности «Мостика»: 1 — ссылка→начало, 2 — фрагмент↔ссылка (соседние ловушки), 3 — без вариантов */
  bridgeLevel?: 1 | 2 | 3
  /** Конкретный режим «Мостика» */
  bridgeMode?: BridgeMode
}

export interface LessonStep {
  id: string
  kind: ExerciseKind
  verseKeys: string[]
  settings: StepSettings
  /** Повтор после ошибки в конце урока */
  retry?: boolean
}

export interface BridgePoolItem {
  key: string
  book: string
  chapter: number
  verse: number
  ref: string
  text: string
}

/** Стих с текстом, готовый к показу */
export interface VerseText {
  key: string
  book: string
  chapter: number
  verse: number
  /** «Матфея 5:7» */
  ref: string
  text: string
  /** Текст всей главы: из него берутся неверные варианты ответа */
  chapterText: string
  /** Сколько глав в книге и сколько стихов в этой главе (для вопросов «где написано») */
  bookChapters: number
  chapterVerses: number
  /** Варианты ответов от ИИ для пропущенных слов: номер слова в стихе → неверные варианты (если удалось получить) */
  aiGaps?: Record<number, string[]>
  /** Подмены от ИИ для упражнения «Корректор» по уровням (1..3) */
  aiProofread?: Partial<Record<1 | 2 | 3, ProofreadCandidate[]>>
  /** Другие стихи из библиотеки пользователя (для «Мостика» и «Соответствия») */
  bridgePool?: BridgePoolItem[]
}

export interface StepResult {
  /** Точность 0–100 */
  score: number
  /** Учебное упражнение: без оценки, урок идёт дальше сразу */
  neutral?: boolean
  /** Пояснение под оценкой, например правильный ответ */
  detail?: string
  /** Если в шаге несколько стихов, у каждого может быть свой результат (ключ стиха → точность) */
  perVerse?: Record<string, number>
}

export interface StepOutcome {
  xp: number
  changes: { key: string; change: 'up' | 'down' | 'same' }[]
}

/** Что получает компонент упражнения */
export interface StepProps {
  /** Первый (или единственный) стих шага */
  verse: VerseText
  /** Все стихи шага: больше одного бывает в «Расставьте части» */
  verses: VerseText[]
  settings: StepSettings
  onAnswer: (result: StepResult) => void
}
