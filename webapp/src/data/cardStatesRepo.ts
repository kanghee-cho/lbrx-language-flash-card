import { createEmptyCardState, rebuildState } from '../domain/fsrsEngine'
import type { AppDatabase } from './db'
import type { CardStateRecord, ReviewLogRecord } from './types'

export class CardStatesRepo {
  constructor(private readonly db: AppDatabase) {}

  async get(cardId: string): Promise<CardStateRecord | undefined> {
    return this.db.cardStates.get(cardId)
  }

  async bulkGet(cardIds: string[]): Promise<CardStateRecord[]> {
    const states = await this.db.cardStates.bulkGet(cardIds)
    return states.filter((state): state is CardStateRecord => Boolean(state))
  }

  async put(state: CardStateRecord): Promise<void> {
    await this.db.cardStates.put(state)
  }

  async rebuildForCard(cardId: string, logs?: ReviewLogRecord[]): Promise<CardStateRecord> {
    const reviewLogs =
      logs ??
      ((await this.db.reviewLogs.where('cardId').equals(cardId).sortBy('reviewTime')) as ReviewLogRecord[])
    const nextState =
      reviewLogs.length > 0 ? rebuildState(cardId, reviewLogs) : createEmptyCardState(cardId)
    await this.put(nextState)
    return nextState
  }
}
