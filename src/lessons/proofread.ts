import {
  flattenWords,
  matchCase,
  normalize,
  pickDistractors,
  shuffle,
  type FlatWord,
  type Rng,
} from '../logic/exercises'
import type { ProofreadCandidate } from '../types'

/** Пары синонимов, антонимов и близких библейских слов (Синодальный перевод) для офлайн-режима «Корректора» */
const SYNODAL_GROUPS: string[][] = [
  ['господь', 'бог', 'владыка', 'творец'],
  ['господа', 'бога', 'творца', 'вседержителя'],
  ['господу', 'богу', 'отцу', 'спасителю'],
  ['господом', 'богом', 'духом', 'словом'],
  ['господи', 'боже', 'учителю', 'отче'],
  ['иисус', 'христос', 'спаситель', 'учитель'],
  ['иисуса', 'христа', 'спасителя', 'мессию'],
  ['дух', 'душа', 'сердце', 'ум'],
  ['духа', 'души', 'сердца', 'разума'],
  ['духом', 'сердцем', 'умом', 'душою'],
  ['сердце', 'душу', 'совесть', 'мысль'],
  ['сердце', 'лицо', 'око', 'слово'],
  ['небо', 'земля', 'мир', 'вселенная'],
  ['небе', 'земле', 'мире', 'храме'],
  ['небеса', 'земли', 'моря', 'горы'],
  ['свет', 'тьма', 'огонь', 'сияние'],
  ['света', 'тьмы', 'огня', 'славы'],
  ['истина', 'правда', 'мудрость', 'святость'],
  ['истины', 'правды', 'мудрости', 'веры'],
  ['истину', 'правду', 'мудрость', 'тайну'],
  ['слово', 'закон', 'заповедь', 'учение'],
  ['слова', 'закона', 'учения', 'откровения'],
  ['милость', 'благодать', 'любовь', 'милосердие'],
  ['милости', 'благодати', 'любви', 'щедрости'],
  ['путь', 'дорога', 'стезя', 'тропа'],
  ['пути', 'дороги', 'стези', 'врата'],
  ['жизнь', 'вечность', 'смерть', 'бытие'],
  ['жизни', 'вечности', 'радости', 'надежды'],
  ['вера', 'надежда', 'любовь', 'верность'],
  ['веры', 'надежды', 'любви', 'правды'],
  ['мир', 'покой', 'радость', 'тишина'],
  ['мира', 'покоя', 'земли', 'века'],
  ['сила', 'власть', 'крепость', 'мощь'],
  ['силу', 'власть', 'славу', 'честь'],
  ['слава', 'честь', 'хвала', 'величие'],
  ['день', 'час', 'время', 'век'],
  ['дни', 'годы', 'лета', 'времена'],
  ['дом', 'храм', 'жилище', 'чертог'],
  ['доме', 'храме', 'городе', 'царстве'],
  ['народ', 'люди', 'род', 'племя'],
  ['народа', 'народов', 'людей', 'языков'],
  ['человек', 'муж', 'сын', 'брат'],
  ['человека', 'мужа', 'сына', 'брата'],
  ['царь', 'князь', 'владыка', 'судья'],
  ['царство', 'царствие', 'владение', 'наследие'],
  ['грех', 'беззаконие', 'вина', 'порок'],
  ['грехи', 'беззакония', 'преступления', 'долги'],
  ['спасение', 'искупление', 'избавление', 'прощение'],
  ['праведный', 'святой', 'чистый', 'непорочный'],
  ['праведных', 'святых', 'верных', 'чистых'],
  ['благой', 'добрый', 'милостивый', 'верный'],
  ['великий', 'сильный', 'могучий', 'славный'],
  ['вечный', 'вековечный', 'неизменный', 'бесконечный'],
  ['возлюбил', 'полюбил', 'избрал', 'принял'],
  ['сказал', 'рече', 'ответил', 'возвестил'],
  ['сотворил', 'создал', 'устроил', 'основал'],
  ['помилует', 'простит', 'спасет', 'оправдает'],
  ['знает', 'ведает', 'видит', 'испытует'],
  ['хранит', 'бережет', 'защищает', 'укрепляет'],
  ['идет', 'ходит', 'шествует', 'грядет'],
  ['видит', 'смотрит', 'взирает', 'наблюдает'],
  ['слышит', 'слушает', 'внемлет', 'принимает'],
  ['придет', 'явится', 'грядет', 'настанет'],
  ['вовек', 'навеки', 'всегда', 'присно'],
  ['блажен', 'счастлив', 'радостен', 'славен'],
  ['блаженны', 'счастливы', 'праведны', 'благословенны'],
  ['ибо', 'потому', 'ведь', 'однако'],
  ['чтобы', 'дабы', 'пока', 'если'],
  ['ныне', 'теперь', 'сегодня', 'скоро'],
  ['всегда', 'непрестанно', 'ежедневно', 'вовеки'],
  ['никогда', 'никак', 'отнюдь', 'вовсе'],
  ['один', 'единый', 'первый', 'сам'],
  ['всякий', 'каждый', 'любой', 'всяк'],
]

const WORD_TO_ALT = new Map<string, string[]>()
for (const group of SYNODAL_GROUPS) {
  for (const w of group) {
    const existing = WORD_TO_ALT.get(w) ?? []
    for (const other of group) {
      if (other !== w && !existing.includes(other)) existing.push(other)
    }
    WORD_TO_ALT.set(w, existing)
  }
}

export interface ProofreadSlot {
  wordIndex: number
  original: string
  impostor: string
  /** Варианты замены (для уровня 2 — 3 шт, для уровня 3 — 4 шт; на уровне 1 не требуются) */
  options: string[]
}

export interface ProofreadTask {
  words: FlatWord[]
  slots: ProofreadSlot[]
}

/**
 * Проверяет список кандидатов от ИИ против фактических слов стиха и оставляет только корректные.
 */
export function parseAiProofread(raw: unknown, words: FlatWord[]): ProofreadCandidate[] {
  if (!Array.isArray(raw)) return []
  const out: ProofreadCandidate[] = []
  const usedIdx = new Set<number>()

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as {
      wordIndex?: unknown
      original?: unknown
      impostor?: unknown
      distractors?: unknown
    }
    const idx = rec.wordIndex
    if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= words.length) continue
    if (usedIdx.has(idx)) continue

    const actual = words[idx].core
    if (typeof rec.original !== 'string' || normalize(rec.original) !== normalize(actual)) continue
    if (typeof rec.impostor !== 'string') continue

    const impostor = rec.impostor.trim()
    if (!/^[\p{L}\p{N}-]{2,}$/u.test(impostor)) continue
    if (normalize(impostor) === normalize(actual)) continue

    const seen = new Set<string>([normalize(actual)])
    const distractors: string[] = [matchCase(impostor, actual)]
    seen.add(normalize(impostor))

    if (Array.isArray(rec.distractors)) {
      for (const d of rec.distractors) {
        if (typeof d !== 'string') continue
        const clean = d.trim()
        if (!/^[\p{L}\p{N}-]{2,}$/u.test(clean)) continue
        const n = normalize(clean)
        if (seen.has(n)) continue
        seen.add(n)
        distractors.push(matchCase(clean, actual))
      }
    }

    usedIdx.add(idx)
    out.push({
      wordIndex: idx,
      original: actual,
      impostor: matchCase(impostor, actual),
      distractors,
    })
  }
  return out
}

function buildOptionsForSlot(
  original: string,
  impostor: string,
  distractors: string[],
  chapterWords: FlatWord[],
  optionCount: number,
  rng: Rng,
): string[] {
  const seen = new Set<string>([normalize(original)])
  const wrong: string[] = []

  const pushWrong = (rawWord: string) => {
    const clean = rawWord.trim()
    if (!/^[\p{L}\p{N}-]{2,}$/u.test(clean)) return
    const norm = normalize(clean)
    if (seen.has(norm)) return
    seen.add(norm)
    wrong.push(matchCase(clean, original))
  }

  // Первым в ложные варианты добавляем само подставленное слово (частый выбор при сомнениях)
  pushWrong(impostor)
  for (const d of distractors) {
    if (wrong.length >= optionCount - 1) break
    pushWrong(d)
  }

  const dictAlts = WORD_TO_ALT.get(normalize(original)) ?? []
  for (const d of dictAlts) {
    if (wrong.length >= optionCount - 1) break
    pushWrong(d)
  }

  if (wrong.length < optionCount - 1) {
    const extra = pickDistractors(chapterWords, original, optionCount + 4, 3, rng)
    for (const d of extra) {
      if (wrong.length >= optionCount - 1) break
      pushWrong(d)
    }
  }

  return shuffle([original, ...wrong.slice(0, optionCount - 1)], rng)
}

/**
 * Собирает задание «Корректор» для стиха.
 * Уровень 1: 1 заметная ошибка (найти слово тапом).
 * Уровень 2: 1 тонкая ошибка → выбор правильной замены из 3 вариантов.
 * Уровень 3: 1–2 тонкие ошибки → выбор правильной замены из 4 вариантов.
 */
export function buildProofreadTask(
  text: string,
  chapterText: string,
  level: 1 | 2 | 3,
  aiCandidates?: ProofreadCandidate[],
  rng: Rng = Math.random,
): ProofreadTask {
  const words = flattenWords(text)
  const chapterWords = flattenWords(chapterText || text)
  const contentIndices = words
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => /^[\p{L}]{3,}$/u.test(w.core))
    .map(({ i }) => i)

  if (contentIndices.length === 0) {
    return { words, slots: [] }
  }

  const wantedErrors = level === 3 && words.length >= 16 ? 2 : 1
  const optionCount = level === 1 ? 3 : level === 2 ? 3 : 4
  const slots: ProofreadSlot[] = []
  const usedIdx = new Set<number>()

  // 1. Используем валидированные кандидаты от ИИ, если есть
  if (aiCandidates && aiCandidates.length > 0) {
    for (const cand of aiCandidates) {
      if (slots.length >= wantedErrors) break
      if (cand.wordIndex < 0 || cand.wordIndex >= words.length) continue
      if (usedIdx.has(cand.wordIndex)) continue
      const actual = words[cand.wordIndex].core
      if (normalize(cand.original) !== normalize(actual)) continue
      usedIdx.add(cand.wordIndex)
      slots.push({
        wordIndex: cand.wordIndex,
        original: actual,
        impostor: matchCase(cand.impostor, actual),
        options: buildOptionsForSlot(
          actual,
          cand.impostor,
          cand.distractors,
          chapterWords,
          optionCount,
          rng,
        ),
      })
    }
  }

  // 2. Офлайн-генерация: сперва слова из словаря синодальных пар, затем слова главы
  if (slots.length < wantedErrors) {
    const dictCandidates = shuffle(
      contentIndices.filter((i) => !usedIdx.has(i) && WORD_TO_ALT.has(normalize(words[i].core))),
      rng,
    )
    for (const idx of dictCandidates) {
      if (slots.length >= wantedErrors) break
      const actual = words[idx].core
      const alts = WORD_TO_ALT.get(normalize(actual)) ?? []
      if (alts.length === 0) continue
      // На уровне 1 берём дальний вариант (из конца списка), на 2–3 — ближайший синоним
      const pickedAlt = level === 1 ? alts[alts.length - 1] : alts[Math.floor(rng() * Math.min(2, alts.length))]
      const impostor = matchCase(pickedAlt, actual)
      usedIdx.add(idx)
      slots.push({
        wordIndex: idx,
        original: actual,
        impostor,
        options: buildOptionsForSlot(actual, impostor, alts, chapterWords, optionCount, rng),
      })
    }
  }

  // 3. Добор из слов главы (если в словаре пар не нашлось)
  if (slots.length < wantedErrors) {
    const remaining = shuffle(
      contentIndices.filter((i) => !usedIdx.has(i)),
      rng,
    )
    for (const idx of remaining) {
      if (slots.length >= wantedErrors) break
      const actual = words[idx].core
      const dists = pickDistractors(chapterWords, actual, optionCount + 2, level, rng)
      if (dists.length === 0) continue
      const impostor = dists[0]
      usedIdx.add(idx)
      slots.push({
        wordIndex: idx,
        original: actual,
        impostor,
        options: buildOptionsForSlot(actual, impostor, dists.slice(1), chapterWords, optionCount, rng),
      })
    }
  }

  slots.sort((a, b) => a.wordIndex - b.wordIndex)
  return { words, slots }
}
