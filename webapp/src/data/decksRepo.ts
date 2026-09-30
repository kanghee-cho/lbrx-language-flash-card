import { liveQuery } from 'dexie'
import { type HlcClock, compareHlc } from '../core/hlc'
import { newUuid } from '../core/uuid'
import type { AppDatabase } from './db'
import { notifyLocalMutation } from './mutationSignal'
import type { DeckRecord, LocalDeckRecord } from './types'

export interface DeckDraft {
  name: string
  description?: string | null
  sourceLang: string
  targetLang: string
  tags?: string[]
}

export interface DeckSummary extends LocalDeckRecord {
  totalCards: number
  dueCards: number
}

function normalizeTags(tags?: string[]): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))].sort()
}

function isDue(due: string | null): boolean {
  return !due || due <= new Date().toISOString()
}

export class DecksRepo {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: HlcClock,
  ) {}

  watchDecks() {
    return liveQuery(() => this.listSummaries())
  }

  async listSummaries(): Promise<DeckSummary[]> {
    const [decks, cards, cardStates] = await Promise.all([
      this.db.decks.toCollection().sortBy('name'),
      this.db.cards.toArray(),
      this.db.cardStates.toArray(),
    ])

    const statesByCardId = new Map(cardStates.map((state) => [state.cardId, state]))

    return decks
      .filter((deck) => !deck.deletedAt)
      .map((deck) => {
        const activeCards = cards.filter(
          (card) => card.deckId === deck.id && !card.deletedAt,
        )
        const dueCards = activeCards.filter((card) =>
          isDue(statesByCardId.get(card.id)?.due ?? null),
        ).length

        return {
          ...deck,
          totalCards: activeCards.length,
          dueCards,
        }
      })
  }

  async list(): Promise<LocalDeckRecord[]> {
    return (await this.db.decks.toCollection().sortBy('name')).filter((deck) => !deck.deletedAt)
  }

  async get(id: string): Promise<LocalDeckRecord | undefined> {
    const deck = await this.db.decks.get(id)
    return deck?.deletedAt ? undefined : deck
  }

  async create(draft: DeckDraft): Promise<LocalDeckRecord> {
    const now = new Date().toISOString()
    const deck: LocalDeckRecord = {
      id: newUuid(),
      name: draft.name.trim(),
      description: draft.description?.trim() || null,
      sourceLang: draft.sourceLang.trim(),
      targetLang: draft.targetLang.trim(),
      tags: normalizeTags(draft.tags),
      hlc: this.clock.send(),
      createdAt: now,
      deletedAt: null,
      dirty: true,
    }

    await this.db.decks.put(deck)
    notifyLocalMutation()
    return deck
  }

  async update(id: string, patch: Partial<DeckDraft>): Promise<LocalDeckRecord> {
    const existing = await this.db.decks.get(id)
    if (!existing) {
      throw new Error('Deck not found')
    }

    const updated: LocalDeckRecord = {
      ...existing,
      ...patch,
      description:
        patch.description === undefined
          ? existing.description ?? null
          : patch.description?.trim() || null,
      tags: patch.tags ? normalizeTags(patch.tags) : existing.tags,
      hlc: this.clock.send(),
      dirty: true,
    }

    await this.db.decks.put(updated)
    notifyLocalMutation()
    return updated
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.db.decks.get(id)
    if (!existing || existing.deletedAt) {
      return
    }

    await this.db.decks.put({
      ...existing,
      deletedAt: new Date().toISOString(),
      hlc: this.clock.send(),
      dirty: true,
    })
    notifyLocalMutation()
  }

  async getDirty(): Promise<LocalDeckRecord[]> {
    return (await this.db.decks.toArray()).filter((deck) => deck.dirty)
  }

  async markClean(idsToHlc: Record<string, string>): Promise<void> {
    await this.db.transaction('rw', this.db.decks, async () => {
      for (const [id, pushedHlc] of Object.entries(idsToHlc)) {
        const existing = await this.db.decks.get(id)
        if (existing && existing.hlc === pushedHlc) {
          await this.db.decks.put({ ...existing, dirty: false })
        }
      }
    })
  }

  async applyRemote(record: DeckRecord): Promise<void> {
    this.clock.receive(record.hlc)
    const existing = await this.db.decks.get(record.id)
    if (!existing || compareHlc(record.hlc, existing.hlc) > 0) {
      await this.db.decks.put({ ...record, dirty: false })
    }
  }
}
