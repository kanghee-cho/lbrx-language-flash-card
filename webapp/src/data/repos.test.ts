import { createHlcClock } from '../core/hlc'
import { CardStatesRepo } from './cardStatesRepo'
import { CardsRepo } from './cardsRepo'
import { createAppDatabase } from './db'
import { DecksRepo } from './decksRepo'
import { ReviewLogsRepo } from './reviewLogsRepo'

describe('repositories', () => {
  it('marks dirty records clean only when the HLC still matches', async () => {
    const db = createAppDatabase(`repo-test-${crypto.randomUUID()}`)
    const clock = createHlcClock('testnode', () => 1_727_650_000_000)
    const decks = new DecksRepo(db, clock)
    const cards = new CardsRepo(db, clock)

    const deck = await decks.create({
      name: 'Japanese',
      sourceLang: 'ja',
      targetLang: 'en',
    })
    const card = await cards.create({
      deckId: deck.id,
      front: '猫',
      back: 'cat',
    })

    await decks.markClean({ [deck.id]: deck.hlc })
    await cards.markClean({ [card.id]: card.hlc })

    expect((await db.decks.get(deck.id))?.dirty).toBe(false)
    expect((await db.cards.get(card.id))?.dirty).toBe(false)
    await db.delete()
  })

  it('ignores older remote HLCs and rebuilds card state from review logs', async () => {
    const db = createAppDatabase(`repo-test-${crypto.randomUUID()}`)
    const clock = createHlcClock('testnode', () => 1_727_650_000_000)
    const decks = new DecksRepo(db, clock)
    const cards = new CardsRepo(db, clock)
    const cardStates = new CardStatesRepo(db)
    const reviewLogs = new ReviewLogsRepo(db, cardStates)

    const deck = await decks.create({
      name: 'Kana',
      sourceLang: 'ja',
      targetLang: 'en',
    })
    const card = await cards.create({
      deckId: deck.id,
      front: 'いぬ',
      back: 'dog',
    })

    const { dirty: _dirty, ...remoteCard } = card
    void _dirty
    await cards.applyRemote({
      ...remoteCard,
      hlc: '000000000000001-00000-older001',
    })
    expect((await db.cards.get(card.id))?.front).toBe('いぬ')

    await reviewLogs.addLocal({
      cardId: card.id,
      rating: 3,
      testType: 'flip',
      durationMs: 1200,
      reviewTime: '2026-01-01T00:00:00.000Z',
    })

    const state = await db.cardStates.get(card.id)
    expect(state?.reps).toBe(1)
    expect(state?.state).not.toBe('New')
    await db.delete()
  })
})
