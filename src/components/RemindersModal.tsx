import { Bell, CheckCircle2, Send, Smartphone, X } from 'lucide-react'
import { useState } from 'react'
import type { ReminderSettings } from '../reminders/engine'
import {
  disableWebPush,
  enableWebPush,
  getPushEnvironment,
  saveReminderSettings,
  sendTestPush,
  syncPushSnapshot,
} from '../reminders/pushClient'

interface Props {
  isOpen: boolean
  onClose: () => void
  settings: ReminderSettings
  onSettingsChange: (next: ReminderSettings) => void
}

export default function RemindersModal({ isOpen, onClose, settings, onSettingsChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  if (!isOpen) return null

  const env = getPushEnvironment()

  async function togglePush() {
    if (busy) return
    setFeedback(null)
    setBusy(true)
    try {
      if (settings.pushEnabled) {
        const next = await disableWebPush(settings)
        onSettingsChange(next)
        setFeedback({ kind: 'ok', text: 'Фоновые уведомления выключены.' })
      } else {
        const next = await enableWebPush(settings)
        onSettingsChange(next)
        setFeedback({ kind: 'ok', text: 'Фоновые уведомления включены! Можно проверить кнопкой ниже.' })
      }
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Не удалось переключить уведомления.',
      })
    } finally {
      setBusy(false)
    }
  }

  function updateSetting<K extends keyof ReminderSettings>(key: K, value: ReminderSettings[K]) {
    const next: ReminderSettings = { ...settings, [key]: value }
    onSettingsChange(next)
    saveReminderSettings(next)
    if (next.pushEnabled) {
      void syncPushSnapshot(next)
    }
  }

  async function handleTestPush() {
    if (testBusy) return
    setFeedback(null)
    setTestBusy(true)
    try {
      await sendTestPush()
      setFeedback({ kind: 'ok', text: 'Тестовое уведомление отправлено! Проверьте экран устройства.' })
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Ошибка отправки тестового уведомления.',
      })
    } finally {
      setTestBusy(false)
    }
  }

  return (
    <div className="modal-sheet-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="reminders-modal-title">
      <div className="modal-sheet large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-sheet-header">
          <h3 id="reminders-modal-title">Напоминания и уведомления</h3>
          <button className="modal-close-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <div className="modal-sheet-body reminders-modal-body">
          {env.needsHomeScreenInstall && (
            <div className="reminder-info-banner">
              <Smartphone size={18} />
              <span>
                На iPhone фоновые Push-уведомления работают после установки приложения: нажмите «Поделиться» и выберите «На экран “Домой”».
              </span>
            </div>
          )}

          {env.permission === 'denied' && (
            <div className="reminder-info-banner error">
              <Bell size={18} />
              <span>
                Уведомления заблокированы в настройках браузера. Разрешите их для этого сайта, чтобы получать фоновые напоминания.
              </span>
            </div>
          )}

          {/* Главный переключатель Web Push */}
          <div className="reminder-master-card">
            <div className="reminder-row">
              <div className="reminder-row-text">
                <div className="reminder-row-title">Фоновые Web Push</div>
                <div className="reminder-row-desc">
                  Приходят на экран телефона или ПК, даже когда приложение полностью закрыто
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.pushEnabled}
                aria-label="Включить фоновые Web Push"
                disabled={busy}
                className={`reminder-switch ${settings.pushEnabled ? 'on' : ''}`}
                onClick={togglePush}
              >
                <span className="reminder-switch-thumb" />
              </button>
            </div>

            {settings.pushEnabled && (
              <div className="reminder-test-row">
                <button
                  type="button"
                  className="btn small"
                  disabled={testBusy}
                  onClick={handleTestPush}
                >
                  <Send size={15} />
                  <span>{testBusy ? 'Отправка…' : 'Проверить Push'}</span>
                </button>
                <span className="reminder-test-hint">Пришлёт тестовое уведомление прямо сейчас</span>
              </div>
            )}
          </div>

          {feedback && (
            <div className={`reminder-feedback ${feedback.kind}`}>
              {feedback.kind === 'ok' && <CheckCircle2 size={16} />}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Типы напоминаний */}
          <div className="reminder-section-label">ТИПЫ НАПОМИНАНИЙ</div>
          <div className="reminder-list-card">
            {/* 1. Ежедневное напоминание */}
            <div className="reminder-item">
              <div className="reminder-row">
                <div className="reminder-row-text">
                  <div className="reminder-row-title">Ежедневное напоминание об уроке</div>
                  <div className="reminder-row-desc">
                    Сколько стихов к повторению и новых ждут старта. Пропускается, если вы уже занимались сегодня.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.dailyEnabled}
                  aria-label="Ежедневное напоминание об уроке"
                  className={`reminder-switch ${settings.dailyEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting('dailyEnabled', !settings.dailyEnabled)}
                >
                  <span className="reminder-switch-thumb" />
                </button>
              </div>
              {settings.dailyEnabled && (
                <label className="reminder-time-row">
                  <span>Время напоминания</span>
                  <input
                    type="time"
                    className="reminder-time-input"
                    value={settings.dailyTime}
                    onChange={(e) => e.target.value && updateSetting('dailyTime', e.target.value)}
                  />
                </label>
              )}
            </div>

            <div className="settings-row-divider" />

            {/* 2. Защита серии */}
            <div className="reminder-item">
              <div className="reminder-row">
                <div className="reminder-row-text">
                  <div className="reminder-row-title">Защита серии (Streak)</div>
                  <div className="reminder-row-desc">
                    Мягкое вечернее напоминание, если вы занимались подряд, но сегодня ещё не открывали урок.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.streakEnabled}
                  aria-label="Защита серии"
                  className={`reminder-switch ${settings.streakEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting('streakEnabled', !settings.streakEnabled)}
                >
                  <span className="reminder-switch-thumb" />
                </button>
              </div>
              {settings.streakEnabled && (
                <label className="reminder-time-row">
                  <span>Вечернее время</span>
                  <input
                    type="time"
                    className="reminder-time-input"
                    value={settings.streakTime}
                    onChange={(e) => e.target.value && updateSetting('streakTime', e.target.value)}
                  />
                </label>
              )}
            </div>

            <div className="settings-row-divider" />

            {/* 3. Бережное возвращение */}
            <div className="reminder-item">
              <div className="reminder-row">
                <div className="reminder-row-text">
                  <div className="reminder-row-title">Бережное возвращение после паузы</div>
                  <div className="reminder-row-desc">
                    Напоминание через 3, 7 и 14 дней без занятий, чтобы интервалы повторений не сбились.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.inactivityEnabled}
                  aria-label="Бережное возвращение после паузы"
                  className={`reminder-switch ${settings.inactivityEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting('inactivityEnabled', !settings.inactivityEnabled)}
                >
                  <span className="reminder-switch-thumb" />
                </button>
              </div>
            </div>

            <div className="settings-row-divider" />

            {/* 4. Очередь пуста */}
            <div className="reminder-item">
              <div className="reminder-row">
                <div className="reminder-row-text">
                  <div className="reminder-row-title">«Очередь пуста — добавьте стих»</div>
                  <div className="reminder-row-desc">
                    Если все ваши стихи закреплены и на сегодня нечего повторять, предложит выбрать новый отрывок.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.emptyQueueEnabled}
                  aria-label="Предложение добавить новый стих при пустой очереди"
                  className={`reminder-switch ${settings.emptyQueueEnabled ? 'on' : ''}`}
                  onClick={() => updateSetting('emptyQueueEnabled', !settings.emptyQueueEnabled)}
                >
                  <span className="reminder-switch-thumb" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
