import { ApiError, ServerUnreachableError } from '../data/apiClient'
import type { CardsRepo } from '../data/cardsRepo'
import type { AppDatabase } from '../data/db'
import type { DecksRepo } from '../data/decksRepo'
import type { MediaRepo } from '../data/mediaRepo'
import { subscribeToLocalMutations } from '../data/mutationSignal'
import type { ReviewLogsRepo } from '../data/reviewLogsRepo'
import type { ApiClient } from '../data/apiClient'
import type { SyncStatus } from '../data/types'

const FIVE_MINUTES_MS = 5 * 60 * 1000

function stripDirty<T extends { dirty: boolean }>(record: T): Omit<T, 'dirty'> {
  const copy = { ...record }
  delete (copy as { dirty?: boolean }).dirty
  return copy
}

function stripPushed<T extends { pushed: boolean }>(record: T): Omit<T, 'pushed'> {
  const copy = { ...record }
  delete (copy as { pushed?: boolean }).pushed
  return copy
}

export interface SyncEngineDependencies {
  apiClient: ApiClient
  db: AppDatabase
  decksRepo: DecksRepo
  cardsRepo: CardsRepo
  reviewLogsRepo: ReviewLogsRepo
  mediaRepo: MediaRepo
  getIdToken: () => string | null
  getBaseUrl: () => string
  retryDelaysMs?: number[]
  foregroundIntervalMs?: number
  attachBrowserListeners?: boolean
}

export class SyncEngine {
  private status: SyncStatus = {
    state: 'idle',
    lastError: null,
    lastSyncedAt: null,
  }
  private readonly listeners = new Set<() => void>()
  private readonly retryDelaysMs: number[]
  private readonly foregroundIntervalMs: number
  private readonly attachBrowserListeners: boolean
  private started = false
  private inFlight: Promise<void> | null = null
  private queued = false
  private intervalId: number | null = null
  private mutationTimeoutId: number | null = null
  private cleanupMutation?: () => void

  constructor(private readonly dependencies: SyncEngineDependencies) {
    this.retryDelaysMs = dependencies.retryDelaysMs ?? [250, 500, 1000]
    this.foregroundIntervalMs = dependencies.foregroundIntervalMs ?? FIVE_MINUTES_MS
    this.attachBrowserListeners = dependencies.attachBrowserListeners ?? true
    void this.loadPersistedStatus()
  }

  private async loadPersistedStatus(): Promise<void> {
    const [lastSyncAt, lastError] = await Promise.all([
      this.dependencies.db.syncMeta.get('lastSyncAt'),
      this.dependencies.db.syncMeta.get('lastError'),
    ])

    this.status = {
      ...this.status,
      lastSyncedAt: lastSyncAt?.value ?? null,
      lastError: lastError?.value ?? null,
    }
    this.emit()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getStatus(): SyncStatus {
    return this.status
  }

  start(): void {
    if (this.started) {
      return
    }

    this.started = true
    this.cleanupMutation = subscribeToLocalMutations(() => {
      if (this.mutationTimeoutId) {
        window.clearTimeout(this.mutationTimeoutId)
      }
      this.mutationTimeoutId = window.setTimeout(() => {
        void this.requestSync(false)
      }, 2000)
    })

    if (this.attachBrowserListeners && typeof window !== 'undefined') {
      window.addEventListener('focus', this.handleFocus)
      document.addEventListener('visibilitychange', this.handleVisibility)
      this.intervalId = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          void this.requestSync(false)
        }
      }, this.foregroundIntervalMs)
    }
  }

  stop(): void {
    if (!this.started) {
      return
    }

    this.started = false
    this.cleanupMutation?.()
    if (this.mutationTimeoutId) {
      window.clearTimeout(this.mutationTimeoutId)
      this.mutationTimeoutId = null
    }
    if (this.intervalId) {
      window.clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.attachBrowserListeners && typeof window !== 'undefined') {
      window.removeEventListener('focus', this.handleFocus)
      document.removeEventListener('visibilitychange', this.handleVisibility)
    }
  }

  async syncNow(): Promise<void> {
    await this.requestSync(true)
  }

  private readonly handleFocus = () => {
    void this.requestSync(false)
  }

  private readonly handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      void this.requestSync(false)
    }
  }

  private async requestSync(manual: boolean): Promise<void> {
    if (this.inFlight) {
      this.queued = true
      return this.inFlight
    }

    this.inFlight = this.performSync(manual)
    try {
      await this.inFlight
    } finally {
      this.inFlight = null
      if (this.queued) {
        this.queued = false
        await this.requestSync(false)
      }
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private async setStatus(next: SyncStatus): Promise<void> {
    this.status = next
    await this.dependencies.db.syncMeta.bulkPut([
      { key: 'lastSyncAt', value: next.lastSyncedAt },
      { key: 'lastError', value: next.lastError },
    ])
    this.emit()
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  private async withBackoff<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt += 1) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        if (
          attempt === this.retryDelaysMs.length ||
          (error instanceof ApiError && error.code === 'validation')
        ) {
          throw error
        }
        await this.delay(this.retryDelaysMs[attempt] ?? 0)
      }
    }
    throw lastError
  }

  private async performSync(manual: boolean): Promise<void> {
    const idToken = this.dependencies.getIdToken()
    const baseUrl = this.dependencies.getBaseUrl().trim()

    if (!baseUrl && !import.meta.env.DEV) {
      if (manual) {
        await this.setStatus({
          state: 'error',
          lastError: 'Server base URL is not configured.',
          lastSyncedAt: this.status.lastSyncedAt,
        })
      }
      return
    }

    if (!idToken) {
      if (manual) {
        await this.setStatus({
          state: 'error',
          lastError: 'Sign in to sync with the shared server.',
          lastSyncedAt: this.status.lastSyncedAt,
        })
      }
      return
    }

    await this.setStatus({
      state: 'syncing',
      lastError: this.status.lastError,
      lastSyncedAt: this.status.lastSyncedAt,
    })

    try {
      const [dirtyDecks, dirtyCards, unpushedReviewLogs, dirtyMedia] = await Promise.all([
        this.dependencies.decksRepo.getDirty(),
        this.dependencies.cardsRepo.getDirty(),
        this.dependencies.reviewLogsRepo.getUnpushed(),
        this.dependencies.mediaRepo.getDirty(),
      ])

      if (dirtyDecks.length || dirtyCards.length || unpushedReviewLogs.length || dirtyMedia.length) {
        const pushResponse = await this.withBackoff(() =>
          this.dependencies.apiClient.syncPush(idToken, {
            changes: {
              decks: dirtyDecks.map(stripDirty),
              cards: dirtyCards.map(stripDirty),
              reviewLogs: unpushedReviewLogs.map(stripPushed),
              media: dirtyMedia.map(stripDirty),
            },
          }),
        )

        const rejectedKeys = new Set(
          pushResponse.rejected.map((entry) => `${entry.entity}:${entry.id}`),
        )

        await Promise.all([
          this.dependencies.decksRepo.markClean(
            Object.fromEntries(
              dirtyDecks
                .filter((deck) => !rejectedKeys.has(`decks:${deck.id}`))
                .map((deck) => [deck.id, deck.hlc]),
            ),
          ),
          this.dependencies.cardsRepo.markClean(
            Object.fromEntries(
              dirtyCards
                .filter((card) => !rejectedKeys.has(`cards:${card.id}`))
                .map((card) => [card.id, card.hlc]),
            ),
          ),
          this.dependencies.reviewLogsRepo.markPushed(
            unpushedReviewLogs
              .filter((reviewLog) => !rejectedKeys.has(`reviewLogs:${reviewLog.id}`))
              .map((reviewLog) => reviewLog.id),
          ),
          this.dependencies.mediaRepo.markClean(
            Object.fromEntries(
              dirtyMedia
                .filter((media) => !rejectedKeys.has(`media:${media.id}`))
                .map((media) => [media.id, media.hlc]),
            ),
          ),
        ])
      }

      let cursor = Number((await this.dependencies.db.syncMeta.get('pullCursor'))?.value ?? '0')
      while (true) {
        const pullResponse = await this.withBackoff(() =>
          this.dependencies.apiClient.syncPull(idToken, { cursor, limit: 500 }),
        )

        await Promise.all([
          ...pullResponse.decks.map((deck) => this.dependencies.decksRepo.applyRemote(deck)),
          ...pullResponse.cards.map((card) => this.dependencies.cardsRepo.applyRemote(card)),
          ...pullResponse.reviewLogs.map((reviewLog) =>
            this.dependencies.reviewLogsRepo.applyRemote(reviewLog),
          ),
          ...pullResponse.media.map((media) => this.dependencies.mediaRepo.applyRemote(media)),
        ])

        cursor = pullResponse.nextCursor
        await this.dependencies.db.syncMeta.put({
          key: 'pullCursor',
          value: String(cursor),
        })

        if (!pullResponse.hasMore) {
          break
        }
      }

      await this.setStatus({
        state: 'idle',
        lastError: null,
        lastSyncedAt: new Date().toISOString(),
      })
    } catch (error) {
      const message =
        error instanceof ServerUnreachableError
          ? error.message
          : error instanceof ApiError
            ? `${error.code}: ${error.message}`
            : error instanceof Error
              ? error.message
              : 'Sync failed'

      await this.setStatus({
        state: 'error',
        lastError: message,
        lastSyncedAt: this.status.lastSyncedAt,
      })

      if (manual) {
        throw error
      }
    }
  }
}
