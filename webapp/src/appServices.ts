import { useSyncExternalStore } from 'react'
import { getAuthState } from './authStore'
import { getDeviceId, getNodeId } from './core/deviceId'
import { createHlcClock } from './core/hlc'
import { ApiClient } from './data/apiClient'
import { CardStatesRepo } from './data/cardStatesRepo'
import { CardsRepo } from './data/cardsRepo'
import { createAppDatabase } from './data/db'
import { DecksRepo } from './data/decksRepo'
import { MediaRepo } from './data/mediaRepo'
import { ReviewLogsRepo } from './data/reviewLogsRepo'
import { getAppSettings } from './settingsStore'
import { SyncEngine } from './sync/syncEngine'

export const appDb = createAppDatabase()
export const hlcClock = createHlcClock(getNodeId())
export const cardStatesRepo = new CardStatesRepo(appDb)
export const decksRepo = new DecksRepo(appDb, hlcClock)
export const cardsRepo = new CardsRepo(appDb, hlcClock)
export const reviewLogsRepo = new ReviewLogsRepo(appDb, cardStatesRepo)
export const mediaRepo = new MediaRepo(appDb, hlcClock)
export const apiClient = new ApiClient({
  getBaseUrl: () => getAppSettings().serverBaseUrl,
  getDeviceId,
})
export const syncEngine = new SyncEngine({
  apiClient,
  db: appDb,
  decksRepo,
  cardsRepo,
  reviewLogsRepo,
  mediaRepo,
  getIdToken: () => getAuthState().idToken,
  getBaseUrl: () => getAppSettings().serverBaseUrl,
})

export function useSyncStatus() {
  return useSyncExternalStore(
    (listener) => syncEngine.subscribe(listener),
    () => syncEngine.getStatus(),
    () => syncEngine.getStatus(),
  )
}
