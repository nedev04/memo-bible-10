import { db } from '../db/db'
import { flattenWords } from '../logic/exercises'
import { textHash } from './aiParse'
import { parseAiProofread } from './proofread'
import type { ProofreadCandidate } from '../types'
import type { VerseText } from './types'

const cacheId = (v: VerseText, level: 1 | 2 | 3) => `${v.key}#${textHash(v.text)}#L${level}`

/** Реестр активных фоновых запросов, чтобы упражнение могло дождаться уже запущенной загрузки */
const inflight = new Map<string, Promise<ProofreadCandidate[]>>()

/** Мгновенное чтение из локального кэша IndexedDB без сетевых запросов */
export async function loadCachedProofread(verses: VerseText[], level: 1 | 2 | 3 = 2): Promise<void> {
  for (const v of verses) {
    const id = cacheId(v, level)
    const row = await db.proofreadOptions.get(id).catch(() => undefined)
    if (row && row.items.length > 0) {
      v.aiProofread = { ...(v.aiProofread ?? {}), [level]: row.items }
    }
  }
}

/** Возвращает текущий фоновый промис для стиха и уровня, если запрос ещё идёт */
export function getProofreadInflight(verse: VerseText, level: 1 | 2 | 3): Promise<ProofreadCandidate[]> | null {
  return inflight.get(cacheId(verse, level)) ?? null
}

/**
 * Фоновая загрузка заданий «Корректор» с сервера Gemini API (/api/ai/proofread).
 * Не блокирует запуск урока; при ошибке или офлайн-режиме тихо завершается.
 */
export async function prefetchAiProofread(
  targets: { verse: VerseText; level: 1 | 2 | 3 }[],
): Promise<void> {
  if (targets.length === 0) return

  // Сначала подставляем всё, что уже есть в локальном кэше
  const todo: { verse: VerseText; level: 1 | 2 | 3; id: string }[] = []
  const seenIds = new Set<string>()

  for (const { verse, level } of targets) {
    const id = cacheId(verse, level)
    if (seenIds.has(id)) continue
    seenIds.add(id)

    if (verse.aiProofread?.[level]?.length) continue
    const cached = await db.proofreadOptions.get(id).catch(() => undefined)
    if (cached && cached.items.length > 0) {
      verse.aiProofread = { ...(verse.aiProofread ?? {}), [level]: cached.items }
      continue
    }
    if (!inflight.has(id)) {
      todo.push({ verse, level, id })
    }
  }

  if (todo.length === 0) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return

  const batchPromise = (async () => {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 12_000)
      const resp = await fetch('/api/ai/proofread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          items: todo.map((t) => ({
            key: `${t.verse.key}|L${t.level}`,
            ref: t.verse.ref,
            text: t.verse.text,
            level: t.level,
          })),
        }),
      }).finally(() => clearTimeout(timer))

      if (!resp.ok) return new Map<string, ProofreadCandidate[]>()
      const data = (await resp.json()) as {
        results?: { key: string; errors: unknown }[]
      }

      const byReqKey = new Map<string, ProofreadCandidate[]>()
      for (const row of data.results ?? []) {
        const target = todo.find((t) => `${t.verse.key}|L${t.level}` === row.key)
        if (!target) continue
        const valid = parseAiProofread(row.errors, flattenWords(target.verse.text))
        if (valid.length > 0) {
          byReqKey.set(target.id, valid)
          target.verse.aiProofread = { ...(target.verse.aiProofread ?? {}), [target.level]: valid }
          await db.proofreadOptions.put({ id: target.id, items: valid, savedAt: Date.now() }).catch(() => {})
        }
      }
      return byReqKey
    } catch {
      return new Map<string, ProofreadCandidate[]>()
    }
  })()

  for (const item of todo) {
    const p = batchPromise
      .then((map) => map.get(item.id) ?? [])
      .finally(() => {
        inflight.delete(item.id)
      })
    inflight.set(item.id, p)
  }

  await batchPromise
}
