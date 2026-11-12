import { Fragment, type ReactNode } from 'react'
import type { FlatWord } from '../logic/exercises'

interface Props {
  words: FlatWord[]
  /** Что нарисовать вместо слова. Возвращайте строку или элемент. */
  renderWord: (w: FlatWord, index: number) => ReactNode
}

/** Выводит слова подряд с учётом переносов строк и разрывов строф */
export default function WordFlow({ words, renderWord }: Props) {
  return (
    <div className="flow">
      {words.map((w, i) => (
        <Fragment key={i}>
          {w.blankBefore && <br className="flow-break-blank" />}
          {w.newLine && <br className="flow-break-line" />}
          <span className="flow-word-unit">{renderWord(w, i)}</span>{' '}
        </Fragment>
      ))}
    </div>
  )
}

