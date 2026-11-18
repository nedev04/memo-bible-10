import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import ConfirmModal from '../components/ConfirmModal'
import { clearAll, countLiveVerses } from '../db/db'
import CloudSection from './CloudSection'

export default function DataPage() {
  const verseCount = useLiveQuery(() => countLiveVerses(), [])
  const [message, setMessage] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  async function doClear() {
    setConfirmClear(false)
    await clearAll()
    setMessage('Все данные удалены.')
  }

  return (
    <>
      <h1>Профиль</h1>

      <CloudSection />

      {message && <p className="notice ok" role="status">{message}</p>}

      <h2>Удаление</h2>
      <p className="muted-block">Стереть все стихи и прогресс. Если вы вошли в облако, удаление распространится и на другие устройства.</p>
      <button className="btn danger" onClick={() => setConfirmClear(true)} disabled={!verseCount}>
        Удалить все данные
      </button>

      <ConfirmModal
        isOpen={confirmClear}
        title="Удалить все данные?"
        description="Удалить все стихи и весь прогресс? Это нельзя отменить. Если вы вошли в облако, они удалятся и на других устройствах."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        tone="danger"
        icon={<Trash2 size={22} />}
        onConfirm={() => void doClear()}
        onCancel={() => setConfirmClear(false)}
      />
    </>
  )
}
