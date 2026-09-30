import { setIdToken } from '../authStore'
import { createHlcClock } from '../core/hlc'
import { ApiClient } from '../data/apiClient'
import { CardStatesRepo } from '../data/cardStatesRepo'
import { CardsRepo } from '../data/cardsRepo'
import { createAppDatabase } from '../data/db'
import { DecksRepo } from '../data/decksRepo'
import { MediaRepo } from '../data/mediaRepo'
import { ReviewLogsRepo } from '../data/reviewLogsRepo'
import type { ApiEnvelope } from '../data/types'
import { MockAppsScriptService } from '../dev/mockAppsScript'
import { SyncEngine } from './syncEngine'

function createClient(
  service: MockAppsScriptService,
  deviceId: string,
  dbName: string,
  now = 1_727_650_000_000,
) {
  const db = createAppDatabase(dbName)
  const clock = createHlcClock(deviceId.replace(/-/g, '').slice(0, 8), () => now)
  const cardStatesRepo = new CardStatesRepo(db)
  const decksRepo = new DecksRepo(db, clock)
  const cardsRepo = new CardsRepo(db, clock)
  const reviewLogsRepo = new ReviewLogsRepo(db, cardStatesRepo)
  const mediaRepo = new MediaRepo(db, clock)
  const apiClient = new ApiClient({
    getBaseUrl: () => 'http://mock.local',
    getDeviceId: () => deviceId,
    transport: {
      async request<TResponse>(_url: string, envelope: ApiEnvelope) {
        return service.handleEnvelope(envelope) as {
          ok: true
          data: TResponse
        } | {
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
      },
    },
  })
  const syncEngine = new SyncEngine({
    apiClient,
    db,
    decksRepo,
    cardsRepo,
    reviewLogsRepo,
    mediaRepo,
    getIdToken: () => 'user-1',
    getBaseUrl: () => 'http://mock.local',
    retryDelaysMs: [0],
    attachBrowserListeners: false,
  })

  return { db, decksRepo, cardsRepo, reviewLogsRepo, syncEngine }
}

describe('syncEngine', () => {
  it('pushes local edits and pulls remote edits', async () => {
    setIdToken('user-1')
    const service = new MockAppsScriptService()
    const first = createClient(
      service,
      '11111111-1111-4111-8111-111111111111',
      `sync-test-a-${crypto.randomUUID()}`,
    )
    const second = createClient(
      service,
      '22222222-2222-4222-8222-222222222222',
      `sync-test-b-${crypto.randomUUID()}`,
    )

    const deck = await first.decksRepo.create({
      name: 'Spanish',
      sourceLang: 'es',
      targetLang: 'en',
    })
    const card = await first.cardsRepo.create({
      deckId: deck.id,
      front: 'hola',
      back: 'hello',
    })

    await first.syncEngine.syncNow()
    expect(service.debugUserRows('user-1').cards).toHaveLength(1)

    await second.syncEngine.syncNow()
    expect(await second.cardsRepo.get(card.id)).toBeTruthy()

    await first.cardsRepo.update(card.id, { back: 'hi' })
    await first.syncEngine.syncNow()
    await second.syncEngine.syncNow()

    expect((await second.cardsRepo.get(card.id))?.back).toBe('hi')
    await first.db.delete()
    await second.db.delete()
  })

  it('ignores older HLC pushes and preserves concurrent review logs', async () => {
    const service = new MockAppsScriptService()
    const first = createClient(
      service,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      `sync-test-c-${crypto.randomUUID()}`,
    )
    const second = createClient(
      service,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      `sync-test-d-${crypto.randomUUID()}`,
    )

    const deck = await first.decksRepo.create({
      name: 'French',
      sourceLang: 'fr',
      targetLang: 'en',
    })
    const card = await first.cardsRepo.create({
      deckId: deck.id,
      front: 'bonjour',
      back: 'hello',
    })
    await first.syncEngine.syncNow()
    await second.syncEngine.syncNow()

    await second.db.cards.put({
      ...(await second.cardsRepo.get(card.id))!,
      back: 'salut',
      hlc: '000000000000001-00000-older001',
      dirty: true,
    })
    await second.syncEngine.syncNow()
    expect(service.debugUserRows('user-1').cards[0]?.value.back).toBe('hello')

    await first.reviewLogsRepo.addLocal({
      cardId: card.id,
      rating: 3,
      testType: 'flip',
      durationMs: 800,
      reviewTime: '2026-01-01T00:00:00.000Z',
    })
    await second.reviewLogsRepo.addLocal({
      cardId: card.id,
      rating: 4,
      testType: 'choice',
      durationMs: 700,
      reviewTime: '2026-01-01T00:00:01.000Z',
    })

    await first.syncEngine.syncNow()
    await second.syncEngine.syncNow()
    await first.syncEngine.syncNow()

    expect(service.debugUserRows('user-1').reviewLogs).toHaveLength(2)
    expect((await first.reviewLogsRepo.listByCard(card.id)).length).toBe(2)
    await first.db.delete()
    await second.db.delete()
  })
})
