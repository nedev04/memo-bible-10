import { recordVerseResult } from '../db/db'
import { exerciseDifficultyKey, stepTier, type LessonStep, type StepOutcome, type StepResult } from './types'

/**
 * Записывает результат упражнения: меняет силу и срок повторения стихов по общим правилам и начисляет опыт.
 * Учебные упражнения (открытие, скрытый текст) ничего не меняют.
 */
export async function recordStep(step: LessonStep, result: StepResult): Promise<StepOutcome> {
  const tier = stepTier(step)
  if (result.neutral || tier === null) return { xp: 0, changes: [] }
  let xp = 0
  const changes: StepOutcome['changes'] = []
  const exerciseTag = exerciseDifficultyKey(step.kind, step.settings)
  for (const key of step.verseKeys) {
    const score = result.perVerse?.[key] ?? result.score
    const r = await recordVerseResult(key, { exercise: exerciseTag, tier, score })
    xp += r.xp
    changes.push({ key, change: r.change })
  }
  return { xp, changes }
}
