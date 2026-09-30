import { rebuildState } from './fsrsEngine'
import type { ReviewLogRecord } from '../data/types'

const logs: ReviewLogRecord[] = [
  {
    id: 'a',
    cardId: 'card-1',
    rating: 3,
    reviewTime: '2026-01-01T00:00:00.000Z',
    testType: 'flip',
    durationMs: 1000,
    deviceId: 'device-a',
  },
  {
    id: 'b',
    cardId: 'card-1',
    rating: 4,
    reviewTime: '2026-01-02T00:00:00.000Z',
    testType: 'flip',
    durationMs: 900,
    deviceId: 'device-b',
  },
  {
    id: 'c',
    cardId: 'card-1',
    rating: 2,
    reviewTime: '2026-01-02T00:00:00.000Z',
    testType: 'choice',
    durationMs: 800,
    deviceId: 'device-a',
  },
]

describe('fsrsEngine', () => {
  it('rebuilds deterministically regardless of merge order', () => {
    const left = rebuildState('card-1', logs)
    const right = rebuildState('card-1', [logs[2]!, logs[0]!, logs[1]!])

    expect(right).toEqual(left)
  })
})
