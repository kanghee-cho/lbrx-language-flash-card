import Dexie, { type EntityTable } from 'dexie'
import type {
  CardStateRecord,
  LocalCardRecord,
  LocalDeckRecord,
  LocalMediaRecord,
  LocalReviewLogRecord,
  SyncMetaRecord,
} from './types'

export interface MediaBlobRecord {
  id: string
  blob: Blob
}

export class AppDatabase extends Dexie {
  decks!: EntityTable<LocalDeckRecord, 'id'>
  cards!: EntityTable<LocalCardRecord, 'id'>
  reviewLogs!: EntityTable<LocalReviewLogRecord, 'id'>
  media!: EntityTable<LocalMediaRecord, 'id'>
  cardStates!: EntityTable<CardStateRecord, 'cardId'>
  syncMeta!: EntityTable<SyncMetaRecord, 'key'>
  mediaBlobs!: EntityTable<MediaBlobRecord, 'id'>

  constructor(name = 'lbrx-language-flash-card') {
    super(name)

    this.version(1).stores({
      decks: 'id, dirty, hlc, deletedAt, createdAt, sourceLang, targetLang, *tags',
      cards:
        'id, deckId, dirty, hlc, deletedAt, createdAt, imageMediaId, *tags, [deckId+deletedAt]',
      reviewLogs: 'id, cardId, pushed, reviewTime, deviceId, testType, [cardId+reviewTime]',
      media: 'id, dirty, hlc, uploaded, deletedAt, createdAt',
      cardStates: 'cardId, due, lastReview, state',
      syncMeta: 'key',
    })

    this.version(2).stores({
      mediaBlobs: 'id',
    })
  }
}

export function createAppDatabase(name?: string): AppDatabase {
  return new AppDatabase(name)
}
