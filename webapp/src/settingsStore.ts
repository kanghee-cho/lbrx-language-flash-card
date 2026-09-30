import { useSyncExternalStore } from 'react'

export interface AppSettings {
  serverBaseUrl: string
  googleClientId: string
}

const STORAGE_KEY = 'lbrx.settings'

const defaultSettings: AppSettings = {
  serverBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
}

function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return defaultSettings
    }

    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    return defaultSettings
  }
}

let state = readSettings()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

export function getAppSettings(): AppSettings {
  return state
}

export function updateAppSettings(patch: Partial<AppSettings>): void {
  state = { ...state, ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  emit()
}

export function subscribeAppSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppSettings(): AppSettings {
  return useSyncExternalStore(subscribeAppSettings, getAppSettings, getAppSettings)
}
