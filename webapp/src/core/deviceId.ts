import { newUuid } from './uuid'

const STORAGE_KEY = 'lbrx.deviceId'
let memoryDeviceId: string | null = null

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function getDeviceId(): string {
  if (memoryDeviceId) {
    return memoryDeviceId
  }

  const storage = getStorage()
  const stored = storage?.getItem(STORAGE_KEY)
  if (stored) {
    memoryDeviceId = stored
    return stored
  }

  const created = newUuid()
  memoryDeviceId = created
  storage?.setItem(STORAGE_KEY, created)
  return created
}

export function getNodeId(deviceId = getDeviceId()): string {
  return deviceId.replace(/-/g, '').slice(0, 8).toLowerCase()
}

export function resetDeviceIdForTests(): void {
  memoryDeviceId = null
  getStorage()?.removeItem(STORAGE_KEY)
}
