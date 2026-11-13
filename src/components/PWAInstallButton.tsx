import React from 'react'
import { Download } from 'lucide-react'
import { usePWAInstall } from './usePWAInstall'

interface PWAInstallButtonProps {
  className?: string
  showWhenInstalled?: boolean
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  showWhenInstalled = false,
}) => {
  const { isInstallable, isInstalled, install } = usePWAInstall()

  if ((isInstalled && !showWhenInstalled) || !isInstallable) {
    return null
  }

  return (
    <button
      type="button"
      onClick={() => void install()}
      className={`home-install-btn ${className}`}
      aria-label="Установить приложение на телефон"
    >
      <Download size={14} className="shrink-0" />
      <span>Установить приложение</span>
    </button>
  )
}
