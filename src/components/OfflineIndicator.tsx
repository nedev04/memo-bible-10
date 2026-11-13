import React, { useEffect, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'

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

interface OfflineIndicatorProps {
  className?: string
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ className = '' }) => {
  const isOnline = useOnlineStatus()
  const [showNotification, setShowNotification] = useState(!isOnline)
  const [isOrange, setIsOrange] = useState(true)

  useEffect(() => {
    if (!isOnline) {
      setShowNotification(true)
      setIsOrange(true)
      // Первые ~3.5 секунды подсвечивается оранжевым, затем становится спокойным серым
      const timer = setTimeout(() => {
        setIsOrange(false)
      }, 3500)
      return () => clearTimeout(timer)
    } else {
      // Когда интернет возвращается, скрываем через 2 секунды
      if (showNotification) {
        setIsOrange(false)
        const t = setTimeout(() => setShowNotification(false), 2000)
        return () => clearTimeout(t)
      }
    }
  }, [isOnline, showNotification])

  if (!showNotification && isOnline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`offline-notice-badge ${
        isOnline
          ? 'offline-notice-online'
          : isOrange
          ? 'offline-notice-orange'
          : 'offline-notice-gray'
      } ${className}`}
    >
      {isOnline ? (
        <>
          <Wifi size={14} className="shrink-0" />
          <span>Связь восстановлена</span>
        </>
      ) : (
        <>
          <WifiOff size={14} className={`shrink-0 ${isOrange ? 'animate-pulse' : 'opacity-70'}`} />
          <span>Офлайн-режим — все стихи доступны</span>
        </>
      )}
    </div>
  )
}
