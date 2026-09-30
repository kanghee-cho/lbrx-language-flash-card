import { createHlcClock } from '../core/hlc.ts'
import { newUuid } from '../core/uuid.ts'
import type {
  ApiEnvelope,
  ApiResponse,
  AuthPingResponse,
  CardRecord,
  DeckRecord,
  GenericSharePayload,
  GenericShareResponse,
  MediaDownloadPayload,
  MediaDownloadResponse,
  MediaRecord,
  MediaRequestUploadPayload,
  MediaRequestUploadResponse,
  MediaUploadPayload,
  MediaUploadResponse,
  ReviewLogRecord,
  SyncPullPayload,
  SyncPullResponse,
  SyncPushPayload,
  SyncPushResponse,
} from '../data/types.ts'

interface ShareRecord {
  id: string
  ownerUserId: string
  deckId: string
  createdAt: string
  revokedAt: string | null
  payload: GenericSharePayload
}

interface StoredRow<T> {
  userId: string
  serverSeq: number
  value: T
}

interface MockUser {
  userId: string
  email: string
  firstSeen: boolean
}

const DEFAULT_LIMIT = 500
const MAX_LIMIT = 2000

function parseToken(idToken: string | null): MockUser | null {
  if (!idToken) {
    return null
  }

  const parts = idToken.split('.')
  if (parts.length === 3) {
    try {
      const normalized = parts[1]!.replace(/-/g, '+').replace(/_/g, '/')
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
      const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as {
        sub?: string
        email?: string
      }
      if (parsed.sub && parsed.email) {
        return { userId: parsed.sub, email: parsed.email, firstSeen: false }
      }
    } catch {
      // fall back to opaque token handling
    }
  }

  return {
    userId: idToken,
    email: `${idToken}@dev.local`,
    firstSeen: false,
  }
}

export class MockAppsScriptService {
  private nextServerSeq = 1
  private readonly serverClock = createHlcClock('server')
  private readonly users = new Map<string, MockUser>()
  private readonly decks = new Map<string, StoredRow<DeckRecord>>()
  private readonly cards = new Map<string, StoredRow<CardRecord>>()
  private readonly reviewLogs = new Map<string, StoredRow<ReviewLogRecord>>()
  private readonly media = new Map<string, StoredRow<MediaRecord>>()
  private readonly shares = new Map<string, ShareRecord>()
  private readonly uploadChunks = new Map<string, string[]>()

  reset(): void {
    this.nextServerSeq = 1
    this.users.clear()
    this.decks.clear()
    this.cards.clear()
    this.reviewLogs.clear()
    this.media.clear()
    this.shares.clear()
    this.uploadChunks.clear()
  }

  debugUserRows(userId: string) {
    return {
      decks: [...this.decks.values()].filter((row) => row.userId === userId),
      cards: [...this.cards.values()].filter((row) => row.userId === userId),
      reviewLogs: [...this.reviewLogs.values()].filter((row) => row.userId === userId),
      media: [...this.media.values()].filter((row) => row.userId === userId),
    }
  }

  handleEnvelope(envelope: ApiEnvelope): ApiResponse<unknown> {
    switch (envelope.action) {
      case 'auth.ping':
        return this.handleAuthPing(envelope.idToken)
      case 'sync.pull':
        return this.handleSyncPull(envelope.idToken, envelope.payload as SyncPullPayload)
      case 'sync.push':
        return this.handleSyncPush(envelope.idToken, envelope.payload as SyncPushPayload)
      case 'media.requestUpload':
        return this.handleMediaRequestUpload(
          envelope.idToken,
          envelope.payload as MediaRequestUploadPayload,
        )
      case 'media.upload':
        return this.handleMediaUpload(envelope.idToken, envelope.payload as MediaUploadPayload)
      case 'media.download':
        return this.handleMediaDownload(
          envelope.idToken,
          envelope.payload as MediaDownloadPayload,
        )
      case 'share.create':
        return this.handleShareCreate(envelope.idToken, envelope.payload as GenericSharePayload)
      case 'share.get':
        return this.handleShareGet(envelope.idToken, envelope.payload as GenericSharePayload)
      case 'share.revoke':
        return this.handleShareRevoke(envelope.idToken, envelope.payload as GenericSharePayload)
      case 'share.import':
        return this.handleShareImport(envelope.idToken, envelope.payload as GenericSharePayload)
      default:
        return {
          ok: false,
          error: {
            code: 'validation',
            message: `Unsupported action: ${String(envelope.action)}`,
          },
        }
    }
  }

  private requireUser(idToken: string | null): MockUser | ApiResponse<never> {
    const parsed = parseToken(idToken)
    if (!parsed) {
      return {
        ok: false,
        error: { code: 'unauthorized', message: 'Missing or invalid idToken' },
      }
    }

    const existing = this.users.get(parsed.userId)
    if (existing) {
      existing.firstSeen = false
      return existing
    }

    const created = { ...parsed, firstSeen: true }
    this.users.set(created.userId, created)
    return created
  }

  private nextSeq(): number {
    const current = this.nextServerSeq
    this.nextServerSeq += 1
    return current
  }

  private success<T>(data: T): ApiResponse<T> {
    return { ok: true, data }
  }

  private handleAuthPing(idToken: string | null): ApiResponse<AuthPingResponse> {
    const user = this.requireUser(idToken)
    if ('ok' in user) {
      return user
    }

    const response = {
      userId: user.userId,
      email: user.email,
      isNew: user.firstSeen,
    }
    user.firstSeen = false
    return this.success(response)
  }

  private takeRows<T>(
    rows: StoredRow<T>[],
    limit: number,
  ): { returned: StoredRow<T>[]; hasMore: boolean } {
    return {
      returned: rows.slice(0, limit),
      hasMore: rows.length > limit,
    }
  }

  private handleSyncPull(
    idToken: string | null,
    payload: SyncPullPayload,
  ): ApiResponse<SyncPullResponse> {
    const user = this.requireUser(idToken)
    if ('ok' in user) {
      return user
    }

    const limit = Math.min(payload.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
    const decks = [...this.decks.values()]
      .filter((row) => row.userId === user.userId && row.serverSeq > payload.cursor)
      .sort((left, right) => left.serverSeq - right.serverSeq)
    const cards = [...this.cards.values()]
      .filter((row) => row.userId === user.userId && row.serverSeq > payload.cursor)
      .sort((left, right) => left.serverSeq - right.serverSeq)
    const reviewLogs = [...this.reviewLogs.values()]
      .filter((row) => row.userId === user.userId && row.serverSeq > payload.cursor)
      .sort((left, right) => left.serverSeq - right.serverSeq)
    const media = [...this.media.values()]
      .filter((row) => row.userId === user.userId && row.serverSeq > payload.cursor)
      .sort((left, right) => left.serverSeq - right.serverSeq)

    const deckSlice = this.takeRows(decks, limit)
    const cardSlice = this.takeRows(cards, limit)
    const reviewSlice = this.takeRows(reviewLogs, limit)
    const mediaSlice = this.takeRows(media, limit)

    const truncatedLastSeqs = [deckSlice, cardSlice, reviewSlice, mediaSlice]
      .filter((slice) => slice.hasMore && slice.returned.length > 0)
      .map((slice) => slice.returned.at(-1)!.serverSeq)
    const allReturnedSeqs = [
      ...deckSlice.returned,
      ...cardSlice.returned,
      ...reviewSlice.returned,
      ...mediaSlice.returned,
    ].map((row) => row.serverSeq)

    const nextCursor =
      truncatedLastSeqs.length > 0
        ? Math.min(...truncatedLastSeqs)
        : allReturnedSeqs.length > 0
          ? Math.max(...allReturnedSeqs)
          : payload.cursor

    return this.success({
      decks: deckSlice.returned.map((row) => row.value),
      cards: cardSlice.returned.map((row) => row.value),
      reviewLogs: reviewSlice.returned.map((row) => row.value),
      media: mediaSlice.returned.map((row) => row.value),
      nextCursor,
      hasMore:
        deckSlice.hasMore || cardSlice.hasMore || reviewSlice.hasMore || mediaSlice.hasMore,
    })
  }

  private upsertMutable<T extends { id: string; hlc: string }>(
    store: Map<string, StoredRow<T>>,
    userId: string,
    incoming: T,
  ): 'accepted' | 'ignored' {
    const existing = store.get(incoming.id)
    if (!existing) {
      store.set(incoming.id, {
        userId,
        serverSeq: this.nextSeq(),
        value: incoming,
      })
      return 'accepted'
    }

    if (existing.userId !== userId) {
      return 'ignored'
    }

    if (incoming.hlc > existing.value.hlc) {
      store.set(incoming.id, {
        userId,
        serverSeq: this.nextSeq(),
        value: incoming,
      })
      return 'accepted'
    }

    return 'ignored'
  }

  private handleSyncPush(
    idToken: string | null,
    payload: SyncPushPayload,
  ): ApiResponse<SyncPushResponse> {
    const user = this.requireUser(idToken)
    if ('ok' in user) {
      return user
    }

    let accepted = 0
    let ignored = 0
    const rejected: SyncPushResponse['rejected'] = []

    for (const deck of payload.changes.decks) {
      const result = this.upsertMutable(this.decks, user.userId, deck)
      if (result === 'accepted') accepted += 1
      else ignored += 1
    }

    for (const card of payload.changes.cards) {
      const deck = this.decks.get(card.deckId)
      if (!deck || deck.userId !== user.userId) {
        rejected.push({ entity: 'cards', id: card.id, reason: 'Missing deck' })
        continue
      }
      const result = this.upsertMutable(this.cards, user.userId, card)
      if (result === 'accepted') accepted += 1
      else ignored += 1
    }

    for (const media of payload.changes.media) {
      const result = this.upsertMutable(this.media, user.userId, media)
      if (result === 'accepted') accepted += 1
      else ignored += 1
    }

    for (const reviewLog of payload.changes.reviewLogs) {
      if (this.reviewLogs.has(reviewLog.id)) {
        ignored += 1
        continue
      }

      this.reviewLogs.set(reviewLog.id, {
        userId: user.userId,
        serverSeq: this.nextSeq(),
        value: reviewLog,
      })
      accepted += 1
    }

    return this.success({ accepted, ignored, rejected })
  }

  private handleMediaRequestUpload(
    idToken: string | null,
    payload: MediaRequestUploadPayload,
  ): ApiResponse<MediaRequestUploadResponse> {
    const user = this.requireUser(idToken)
    if ('ok' in user) {
      return user
    }

    const existing = this.media.get(payload.id)
    if (existing?.value.uploaded) {
      return this.success({ alreadyUploaded: true, driveFileId: payload.id })
    }

    this.upsertMutable(this.media, user.userId, {
      id: payload.id,
      sha256: payload.sha256,
      mime: payload.mime,
      size: payload.size,
      uploaded: false,
      hlc: this.serverClock.send(),
      createdAt: new Date().toISOString(),
      deletedAt: null,
    })

    return this.success({
      alreadyUploaded: false,
      uploadUrl: 'mock://upload',
      driveFileId: payload.id,
    })
  }

  private handleMediaUpload(
    idToken: string | null,
    payload: MediaUploadPayload,
  ): ApiResponse<MediaUploadResponse> {
    const user = this.requireUser(idToken)
    if ('ok' in user) {
      return user
    }

    const key = `${user.userId}:${payload.id}`
    const chunks = this.uploadChunks.get(key) ?? []
    chunks[payload.chunkIndex] = payload.base64Chunk
    this.uploadChunks.set(key, chunks)

    if (payload.chunkIndex + 1 === payload.totalChunks) {
      const existing = this.media.get(payload.id)
      if (existing) {
        this.media.set(payload.id, {
          userId: existing.userId,
          serverSeq: this.nextSeq(),
          value: {
            ...existing.value,
            uploaded: true,
            hlc: this.serverClock.send(),
          },
        })
      }
      return this.success({ complete: true })
    }

    return this.success({ complete: false })
  }

  private handleMediaDownload(
    idToken: string | null,
    payload: MediaDownloadPayload,
  ): ApiResponse<MediaDownloadResponse> {
    const user = this.requireUser(idToken)
    if ('ok' in user) {
      return user
    }

    const media = this.media.get(payload.id)
    if (!media || media.userId !== user.userId) {
      return {
        ok: false,
        error: { code: 'not_found', message: 'Media not found' },
      }
    }

    const chunks = this.uploadChunks.get(`${user.userId}:${payload.id}`) ?? ['']
    return this.success({ base64: chunks.join(''), mime: media.value.mime })
  }

  private handleShareCreate(
    idToken: string | null,
    payload: GenericSharePayload,
  ): ApiResponse<GenericShareResponse> {
    const user = this.requireUser(idToken)
    if ('ok' in user) {
      return user
    }

    const deckId = typeof payload.deckId === 'string' ? payload.deckId : null
    if (!deckId) {
      return {
        ok: false,
        error: { code: 'validation', message: 'deckId is required' },
      }
    }

    const shareId = newUuid()
    this.shares.set(shareId, {
      id: shareId,
      ownerUserId: user.userId,
      deckId,
      createdAt: new Date().toISOString(),
      revokedAt: null,
      payload,
    })
    return this.success({ shareId, deckId })
  }

  private handleShareGet(
    idToken: string | null,
    payload: GenericSharePayload,
  ): ApiResponse<GenericShareResponse> {
    const user = this.requireUser(idToken)
    if ('ok' in user) {
      return user
    }

    const shareId = typeof payload.shareId === 'string' ? payload.shareId : null
    const share = shareId ? this.shares.get(shareId) : undefined
    if (!share) {
      return {
        ok: false,
        error: { code: 'not_found', message: 'Share not found' },
      }
    }

    return this.success({
      shareId: share.id,
      deckId: share.deckId,
      revokedAt: share.revokedAt,
      ownerUserId: share.ownerUserId,
    })
  }

  private handleShareRevoke(
    idToken: string | null,
    payload: GenericSharePayload,
  ): ApiResponse<GenericShareResponse> {
    const user = this.requireUser(idToken)
    if ('ok' in user) {
      return user
    }

    const shareId = typeof payload.shareId === 'string' ? payload.shareId : null
    const share = shareId ? this.shares.get(shareId) : undefined
    if (!share || share.ownerUserId !== user.userId) {
      return {
        ok: false,
        error: { code: 'not_found', message: 'Share not found' },
      }
    }

    share.revokedAt = new Date().toISOString()
    return this.success({ shareId, revokedAt: share.revokedAt })
  }

  private handleShareImport(
    idToken: string | null,
    payload: GenericSharePayload,
  ): ApiResponse<GenericShareResponse> {
    const user = this.requireUser(idToken)
    if ('ok' in user) {
      return user
    }

    const shareId = typeof payload.shareId === 'string' ? payload.shareId : null
    const share = shareId ? this.shares.get(shareId) : undefined
    if (!share || share.revokedAt) {
      return {
        ok: false,
        error: { code: 'not_found', message: 'Share not available' },
      }
    }

    const sourceDeck = this.decks.get(share.deckId)
    if (!sourceDeck) {
      return {
        ok: false,
        error: { code: 'not_found', message: 'Source deck missing' },
      }
    }

    const newDeckId = newUuid()
    this.decks.set(newDeckId, {
      userId: user.userId,
      serverSeq: this.nextSeq(),
      value: {
        ...sourceDeck.value,
        id: newDeckId,
        hlc: this.serverClock.send(),
        createdAt: new Date().toISOString(),
      },
    })

    for (const card of this.cards.values()) {
      if (card.userId === share.ownerUserId && card.value.deckId === share.deckId) {
        const newCardId = newUuid()
        this.cards.set(newCardId, {
          userId: user.userId,
          serverSeq: this.nextSeq(),
          value: {
            ...card.value,
            id: newCardId,
            deckId: newDeckId,
            hlc: this.serverClock.send(),
            createdAt: new Date().toISOString(),
          },
        })
      }
    }

    return this.success({ shareId, importedDeckId: newDeckId })
  }
}
