import { liveQuery } from 'dexie'
import { type HlcClock, compareHlc } from '../core/hlc'
import { newUuid } from '../core/uuid'
import type { AppDatabase } from './db'
import { notifyLocalMutation } from './mutationSignal'
import type { CardStateRecord, CardRecord, LocalCardRecord } from './types'

export interface CardDraft {
  deckId: string
  front: string
  back: string
  reading?: string | null
  example?: string | null
  memo?: string | null
  tags?: string[]
  imageMediaId?: string | null
}

function normalizeTags(tags?: string[]): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))].sort()
}

function isDue(state: CardStateRecord | undefined, nowIso: string): boolean {
  return !state?.due || state.due <= nowIso
}

export class CardsRepo {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: HlcClock,
  ) {}

  watchCards(deckId: string) {
    return liveQuery(() => this.listByDeck(deckId))
  }

  async get(id: string): Promise<LocalCardRecord | undefined> {
    const card = await this.db.cards.get(id)
    return card?.deletedAt ? undefined : card
  }

  async listByDeck(deckId: string): Promise<LocalCardRecord[]> {
    return (await this.db.cards.where('deckId').equals(deckId).sortBy('createdAt')).filter(
      (card) => !card.deletedAt,
    )
  }

  async listDueByDeck(deckId: string, now = new Date()): Promise<LocalCardRecord[]> {
    const cards = await this.listByDeck(deckId)
    const states = await this.db.cardStates.bulkGet(cards.map((card) => card.id))
    const byId = new Map(
      states.filter((state): state is CardStateRecord => Boolean(state)).map((state) => [state.cardId, state]),
    )
    const nowIso = now.toISOString()
    return cards.filter((card) => isDue(byId.get(card.id), nowIso))
  }

  async create(draft: CardDraft): Promise<LocalCardRecord> {
    const now = new Date().toISOString()
    const card: LocalCardRecord = {
      id: newUuid(),
      deckId: draft.deckId,
      front: draft.front.trim(),
      back: draft.back.trim(),
      reading: draft.reading?.trim() || null,
      example: draft.example?.trim() || null,
      memo: draft.memo?.trim() || null,
      tags: normalizeTags(draft.tags),
      imageMediaId: draft.imageMediaId ?? null,
      hlc: this.clock.send(),
      createdAt: now,
      deletedAt: null,
      dirty: true,
    }

    await this.db.cards.put(card)
    notifyLocalMutation()
    return card
  }

  async update(id: string, patch: Partial<CardDraft>): Promise<LocalCardRecord> {
    const existing = await this.db.cards.get(id)
    if (!existing) {
      throw new Error('Card not found')
    }

    const card: LocalCardRecord = {
      ...existing,
      ...patch,
      front: patch.front?.trim() ?? existing.front,
      back: patch.back?.trim() ?? existing.back,
      reading:
        patch.reading === undefined ? existing.reading ?? null : patch.reading?.trim() || null,
      example:
        patch.example === undefined ? existing.example ?? null : patch.example?.trim() || null,
      memo: patch.memo === undefined ? existing.memo ?? null : patch.memo?.trim() || null,
      tags: patch.tags ? normalizeTags(patch.tags) : existing.tags,
      imageMediaId:
        patch.imageMediaId === undefined
          ? existing.imageMediaId ?? null
          : patch.imageMediaId,
      hlc: this.clock.send(),
      dirty: true,
    }

    await this.db.cards.put(card)
    notifyLocalMutation()
    return card
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.db.cards.get(id)
    if (!existing || existing.deletedAt) {
      return
    }

    await this.db.cards.put({
      ...existing,
      deletedAt: new Date().toISOString(),
      hlc: this.clock.send(),
      dirty: true,
    })
    notifyLocalMutation()
  }

  async getDirty(): Promise<LocalCardRecord[]> {
    return (await this.db.cards.toArray()).filter((card) => card.dirty)
  }

  async markClean(idsToHlc: Record<string, string>): Promise<void> {
    await this.db.transaction('rw', this.db.cards, async () => {
      for (const [id, pushedHlc] of Object.entries(idsToHlc)) {
        const existing = await this.db.cards.get(id)
        if (existing && existing.hlc === pushedHlc) {
          await this.db.cards.put({ ...existing, dirty: false })
        }
      }
    })
  }

  async applyRemote(record: CardRecord): Promise<void> {
    this.clock.receive(record.hlc)
    const existing = await this.db.cards.get(record.id)
    if (!existing || compareHlc(record.hlc, existing.hlc) > 0) {
      await this.db.cards.put({ ...record, dirty: false })
    }
  }
}
