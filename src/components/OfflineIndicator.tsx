import React, { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true
  })

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus()
  const [showNotification, setShowNotification] = useState(false)

  useEffect(() => {
    if (!isOnline) {
      setShowNotification(true)
    } else {
      // Когда интернет возвращается, скрываем через 2 секунды
      const t = setTimeout(() => setShowNotification(false), 2000)
      return () => clearTimeout(t)
    }
  }, [isOnline])

  if (!showNotification && isOnline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium backdrop-blur-md shadow-lg transition-all duration-300 ${
        isOnline
          ? 'bg-emerald-600/90 text-white'
          : 'bg-amber-600/90 text-white border border-amber-400/30'
      }`}
    >
      {isOnline ? (
        <>
          <span className="h-2 w-2 rounded-full bg-white" />
          <span>Связь восстановлена</span>
        </>
      ) : (
        <>
          <WifiOff size={14} className="animate-pulse" />
          <span>Офлайн-режим — все стихи доступны</span>
        </>
      )}
    </div>
  )
}
