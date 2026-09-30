import { useSyncExternalStore } from 'react'

export interface AuthState {
  idToken: string | null
  email: string | null
  userId: string | null
}

const TOKEN_KEY = 'lbrx.idToken'
const PROFILE_KEY = 'lbrx.authProfile'

function decodeJwtPayload(token: string): Record<string, unknown> {
  const middle = token.split('.')[1]
  if (!middle) {
    return {}
  }

  const normalized = middle.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const decoded =
    typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('utf8')
  return JSON.parse(decoded) as Record<string, unknown>
}

function readAuthState(): AuthState {
  const idToken = sessionStorage.getItem(TOKEN_KEY)
  const profileRaw = localStorage.getItem(PROFILE_KEY)
  const profile = profileRaw
    ? (JSON.parse(profileRaw) as { email?: string | null; userId?: string | null })
    : {}

  if (!idToken) {
    return {
      idToken: null,
      email: profile.email ?? null,
      userId: profile.userId ?? null,
    }
  }

  try {
    const payload = decodeJwtPayload(idToken)
    return {
      idToken,
      email: typeof payload.email === 'string' ? payload.email : (profile.email ?? null),
      userId: typeof payload.sub === 'string' ? payload.sub : (profile.userId ?? null),
    }
  } catch {
    return { idToken, email: profile.email ?? null, userId: profile.userId ?? null }
  }
}

let state = readAuthState()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

export function getAuthState(): AuthState {
  return state
}

export function setIdToken(idToken: string): void {
  const payload = decodeJwtPayload(idToken)
  state = {
    idToken,
    email: typeof payload.email === 'string' ? payload.email : null,
    userId: typeof payload.sub === 'string' ? payload.sub : null,
  }
  sessionStorage.setItem(TOKEN_KEY, idToken)
  localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({ email: state.email, userId: state.userId }),
  )
  emit()
}

export function signOut(): void {
  sessionStorage.removeItem(TOKEN_KEY)
  state = {
    idToken: null,
    email: state.email,
    userId: state.userId,
  }
  emit()
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAuthState(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthState, getAuthState)
}
