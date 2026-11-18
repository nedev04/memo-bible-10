import { useEffect, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  hideCancel?: boolean
  tone?: 'primary' | 'danger'
  icon?: ReactNode
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  hideCancel = false,
  tone = 'primary',
  icon,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (hideCancel) onConfirm()
        else onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, hideCancel, onCancel, onConfirm])

  if (!isOpen) return null

  return (
    <div
      className="confirm-modal-overlay"
      onClick={hideCancel ? onConfirm : onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="confirm-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className={`confirm-modal-icon ${tone === 'primary' ? 'tone-primary' : ''}`} aria-hidden="true">
          {icon ?? <AlertTriangle size={22} />}
        </div>
        <h2 id="confirm-modal-title" className="confirm-modal-title">
          {title}
        </h2>
        <p className="confirm-modal-desc">{description}</p>
        <div className={`confirm-modal-actions ${hideCancel ? 'single' : ''}`}>
          {!hideCancel && (
            <button type="button" className="btn ghost" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'danger' : 'primary'}`}
            autoFocus
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
