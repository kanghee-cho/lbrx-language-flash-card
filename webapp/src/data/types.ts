export type StudyMode = 'flip' | 'typing' | 'choice'
export type FsrsState = 'New' | 'Learning' | 'Review' | 'Relearning'

export interface DeckRecord {
  id: string
  name: string
  description?: string | null
  sourceLang: string
  targetLang: string
  tags: string[]
  hlc: string
  createdAt: string
  deletedAt?: string | null
}

export interface CardRecord {
  id: string
  deckId: string
  front: string
  back: string
  reading?: string | null
  example?: string | null
  memo?: string | null
  tags: string[]
  imageMediaId?: string | null
  hlc: string
  createdAt: string
  deletedAt?: string | null
}

export interface ReviewLogRecord {
  id: string
  cardId: string
  rating: 1 | 2 | 3 | 4
  reviewTime: string
  testType: StudyMode
  durationMs: number
  deviceId: string
}

export interface MediaRecord {
  id: string
  sha256: string
  mime: string
  size: number
  uploaded: boolean
  hlc: string
  createdAt: string
  deletedAt?: string | null
}

export interface LocalDeckRecord extends DeckRecord {
  dirty: boolean
}

export interface LocalCardRecord extends CardRecord {
  dirty: boolean
}

export interface LocalMediaRecord extends MediaRecord {
  dirty: boolean
}

export interface LocalReviewLogRecord extends ReviewLogRecord {
  pushed: boolean
}

export interface CardStateRecord {
  cardId: string
  due: string | null
  stability: number | null
  difficulty: number | null
  elapsedDays: number | null
  scheduledDays: number | null
  reps: number
  lapses: number
  state: FsrsState
  lastReview: string | null
}

export interface SyncMetaRecord {
  key: 'pullCursor' | 'lastSyncAt' | 'lastError'
  value: string | null
}

export interface SyncChanges {
  decks: DeckRecord[]
  cards: CardRecord[]
  reviewLogs: ReviewLogRecord[]
  media: MediaRecord[]
}

export interface ApiEnvelope<TPayload = unknown> {
  action:
    | 'auth.ping'
    | 'sync.pull'
    | 'sync.push'
    | 'media.requestUpload'
    | 'media.upload'
    | 'media.download'
    | 'share.create'
    | 'share.get'
    | 'share.revoke'
    | 'share.import'
  idToken: string | null
  deviceId: string
  payload: TPayload
}

export interface ApiSuccess<TData> {
  ok: true
  data: TData
}

export interface ApiFailure {
  ok: false
  error: {
    code:
      | 'unauthorized'
      | 'forbidden'
      | 'validation'
      | 'not_found'
      | 'rate_limited'
      | 'internal'
    message: string
  }
}

export type ApiResponse<TData> = ApiSuccess<TData> | ApiFailure

export interface AuthPingResponse {
  userId: string
  email: string
  isNew: boolean
}

export interface SyncPullPayload {
  cursor: number
  limit?: number
}

export interface SyncPullResponse extends SyncChanges {
  nextCursor: number
  hasMore: boolean
}

export interface SyncPushPayload {
  changes: SyncChanges
}

export interface SyncPushResponse {
  accepted: number
  ignored: number
  rejected: Array<{
    entity: keyof SyncChanges
    id: string
    reason: string
  }>
}

export interface MediaRequestUploadPayload {
  id: string
  sha256: string
  mime: string
  size: number
}

export interface MediaRequestUploadResponse {
  uploadUrl?: string
  driveFileId?: string
  alreadyUploaded: boolean
}

export interface MediaUploadPayload {
  id: string
  base64Chunk: string
  chunkIndex: number
  totalChunks: number
  sha256: string
}

export interface MediaUploadResponse {
  complete: boolean
}

export interface MediaDownloadPayload {
  id: string
}

export interface MediaDownloadResponse {
  base64: string
  mime: string
}

export type GenericSharePayload = Record<string, unknown>
export type GenericShareResponse = Record<string, unknown>

export interface ShareCreatePayload {
  deckId: string
}

export interface ShareRecord {
  id: string
  code: string
  deckId: string
  createdAt: string
  revokedAt: string | null
}

export interface ShareCodePayload {
  code: string
}

export interface SharePreview {
  code: string
  deckId: string
  name: string
  description: string | null
  sourceLang: string
  targetLang: string
  cardCount: number
}

export interface ShareRevokeResponse {
  code: string
  revokedAt: string | null
}

export interface ShareImportResponse {
  deckId: string
  importedCardCount: number
  importedMediaCount: number
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error'
  lastError: string | null
  lastSyncedAt: string | null
}
