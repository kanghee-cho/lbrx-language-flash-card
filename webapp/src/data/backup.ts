import { compareHlc } from '../core/hlc'
import type { AppDatabase } from './db'
import { notifyLocalMutation } from './mutationSignal'
import type { CardStatesRepo } from './cardStatesRepo'
import type { LocalCardRecord, LocalDeckRecord, LocalMediaRecord, LocalReviewLogRecord } from './types'

export const BACKUP_VERSION = 1

export interface BackupPayload {
  version: typeof BACKUP_VERSION
  exportedAt: string
  decks: LocalDeckRecord[]
  cards: LocalCardRecord[]
  reviewLogs: LocalReviewLogRecord[]
  media: LocalMediaRecord[]
}

export interface RestoreSummary {
  decks: number
  cards: number
  reviewLogs: number
  media: number
}

/**
 * Snapshots all local data (decks, cards, review history, media metadata —
 * not image bytes) to a downloadable JSON file. This is the app's manual
 * backup/export path, since IndexedDB alone is not a durable backup.
 */
export async function exportBackup(db: AppDatabase): Promise<Blob> {
  const payload: BackupPayload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    decks: await db.decks.toArray(),
    cards: await db.cards.toArray(),
    reviewLogs: await db.reviewLogs.toArray(),
    media: await db.media.toArray(),
  }
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}

function isBackupPayload(value: unknown): value is BackupPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    Array.isArray((value as BackupPayload).decks) &&
    Array.isArray((value as BackupPayload).cards)
  )
}

/**
 * Restores a previously exported backup, merging by hybrid-logical-clock so
 * this device's newer edits are never clobbered by an older backup file.
 * Restored rows are marked dirty so they push back to the server on the next
 * sync. Review logs are append-only/idempotent and skip existing ids.
 */
export async function importBackup(
  db: AppDatabase,
  cardStatesRepo: CardStatesRepo,
  file: File,
): Promise<RestoreSummary> {
  const parsed: unknown = JSON.parse(await file.text())
  if (!isBackupPayload(parsed)) {
    throw new Error('That file is not a recognized backup export.')
  }

  const summary: RestoreSummary = { decks: 0, cards: 0, reviewLogs: 0, media: 0 }
  const affectedCardIds = new Set<string>()

  await db.transaction('rw', [db.decks, db.cards, db.reviewLogs, db.media], async () => {
    for (const deck of parsed.decks) {
      const existing = await db.decks.get(deck.id)
      if (!existing || compareHlc(deck.hlc, existing.hlc) > 0) {
        await db.decks.put({ ...deck, dirty: true })
        summary.decks += 1
      }
    }

    for (const card of parsed.cards) {
      const existing = await db.cards.get(card.id)
      if (!existing || compareHlc(card.hlc, existing.hlc) > 0) {
        await db.cards.put({ ...card, dirty: true })
        summary.cards += 1
        affectedCardIds.add(card.id)
      }
    }

    for (const media of parsed.media ?? []) {
      const existing = await db.media.get(media.id)
      if (!existing || compareHlc(media.hlc, existing.hlc) > 0) {
        await db.media.put({ ...media, dirty: true })
        summary.media += 1
      }
    }

    for (const reviewLog of parsed.reviewLogs ?? []) {
      const existing = await db.reviewLogs.get(reviewLog.id)
      if (!existing) {
        await db.reviewLogs.put({ ...reviewLog, pushed: false })
        summary.reviewLogs += 1
        affectedCardIds.add(reviewLog.cardId)
      }
    }
  })

  for (const cardId of affectedCardIds) {
    await cardStatesRepo.rebuildForCard(cardId)
  }

  if (summary.decks || summary.cards || summary.reviewLogs || summary.media) {
    notifyLocalMutation()
  }

  return summary
}
