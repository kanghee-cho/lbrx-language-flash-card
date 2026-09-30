import { liveQuery } from 'dexie'
import { getDeviceId } from '../core/deviceId'
import { newUuid } from '../core/uuid'
import type { AppDatabase } from './db'
import { notifyLocalMutation } from './mutationSignal'
import type { CardStatesRepo } from './cardStatesRepo'
import type { LocalReviewLogRecord, ReviewLogRecord, StudyMode } from './types'

export interface ReviewLogDraft {
  cardId: string
  rating: 1 | 2 | 3 | 4
  reviewTime?: string
  testType: StudyMode
  durationMs: number
}

export class ReviewLogsRepo {
  constructor(
    private readonly db: AppDatabase,
    private readonly cardStatesRepo: CardStatesRepo,
  ) {}

  watchByCard(cardId: string) {
    return liveQuery(() => this.listByCard(cardId))
  }

  async listAll(): Promise<LocalReviewLogRecord[]> {
    return this.db.reviewLogs.orderBy('reviewTime').toArray()
  }

  async listByCard(cardId: string): Promise<LocalReviewLogRecord[]> {
    return this.db.reviewLogs.where('cardId').equals(cardId).sortBy('reviewTime')
  }

  async addLocal(draft: ReviewLogDraft): Promise<LocalReviewLogRecord> {
    const reviewLog: LocalReviewLogRecord = {
      id: newUuid(),
      cardId: draft.cardId,
      rating: draft.rating,
      reviewTime: draft.reviewTime ?? new Date().toISOString(),
      testType: draft.testType,
      durationMs: draft.durationMs,
      deviceId: getDeviceId(),
      pushed: false,
    }

    await this.db.reviewLogs.put(reviewLog)
    await this.cardStatesRepo.rebuildForCard(reviewLog.cardId)
    notifyLocalMutation()
    return reviewLog
  }

  async getUnpushed(): Promise<LocalReviewLogRecord[]> {
    return (await this.db.reviewLogs.orderBy('reviewTime').toArray()).filter(
      (reviewLog) => !reviewLog.pushed,
    )
  }

  async markPushed(ids: string[]): Promise<void> {
    await this.db.transaction('rw', this.db.reviewLogs, async () => {
      for (const id of ids) {
        const existing = await this.db.reviewLogs.get(id)
        if (existing) {
          await this.db.reviewLogs.put({ ...existing, pushed: true })
        }
      }
    })
  }

  async applyRemote(record: ReviewLogRecord): Promise<void> {
    const existing = await this.db.reviewLogs.get(record.id)
    if (existing) {
      return
    }

    await this.db.reviewLogs.put({ ...record, pushed: true })
    await this.cardStatesRepo.rebuildForCard(record.cardId)
  }
}
