import {
  Rating,
  State,
  createEmptyCard,
  fsrs,
  type Card,
  type CardInput,
} from 'ts-fsrs'
import type { CardStateRecord, FsrsState, ReviewLogRecord } from '../data/types'

const scheduler = fsrs({ enable_fuzz: false })

function toStateName(state: State): FsrsState {
  switch (state) {
    case State.Learning:
      return 'Learning'
    case State.Review:
      return 'Review'
    case State.Relearning:
      return 'Relearning'
    default:
      return 'New'
  }
}

function toStateEnum(state: FsrsState): State {
  switch (state) {
    case 'Learning':
      return State.Learning
    case 'Review':
      return State.Review
    case 'Relearning':
      return State.Relearning
    default:
      return State.New
  }
}

function toRatingEnum(
  rating: ReviewLogRecord['rating'],
): Rating.Again | Rating.Hard | Rating.Good | Rating.Easy {
  if (rating === 1) return Rating.Again
  if (rating === 2) return Rating.Hard
  if (rating === 3) return Rating.Good
  return Rating.Easy
}

function mapCardState(cardId: string, card: Card): CardStateRecord {
  return {
    cardId,
    due: card.due.toISOString(),
    stability: Number.isFinite(card.stability) ? card.stability : null,
    difficulty: Number.isFinite(card.difficulty) ? card.difficulty : null,
    elapsedDays: Number.isFinite(card.elapsed_days) ? card.elapsed_days : null,
    scheduledDays: Number.isFinite(card.scheduled_days) ? card.scheduled_days : null,
    reps: card.reps,
    lapses: card.lapses,
    state: toStateName(card.state),
    lastReview: card.last_review?.toISOString() ?? null,
  }
}

function toFsrsCard(cardState: CardStateRecord, now: Date): CardInput {
  return {
    due: cardState.due ?? now.toISOString(),
    stability: cardState.stability ?? 0,
    difficulty: cardState.difficulty ?? 0,
    elapsed_days: cardState.elapsedDays ?? 0,
    scheduled_days: cardState.scheduledDays ?? 0,
    reps: cardState.reps,
    lapses: cardState.lapses,
    learning_steps: 0,
    state: toStateEnum(cardState.state),
    last_review: cardState.lastReview,
  }
}

export function createEmptyCardState(cardId: string): CardStateRecord {
  return {
    cardId,
    due: null,
    stability: null,
    difficulty: null,
    elapsedDays: null,
    scheduledDays: null,
    reps: 0,
    lapses: 0,
    state: 'New',
    lastReview: null,
  }
}

export function scheduleReview(
  cardId: string,
  cardState: CardStateRecord | null,
  rating: ReviewLogRecord['rating'],
  now = new Date(),
): CardStateRecord {
  const baseCard = cardState ? toFsrsCard(cardState, now) : createEmptyCard(now)
  const result = scheduler.next(baseCard, now, toRatingEnum(rating))
  return mapCardState(cardId, result.card)
}

export function rebuildState(
  cardId: string,
  reviewLogs: ReviewLogRecord[],
): CardStateRecord {
  if (reviewLogs.length === 0) {
    return createEmptyCardState(cardId)
  }

  const ordered = [...reviewLogs].sort((left, right) => {
    if (left.reviewTime !== right.reviewTime) {
      return left.reviewTime.localeCompare(right.reviewTime)
    }
    return left.id.localeCompare(right.id)
  })

  let card = createEmptyCard(new Date(ordered[0]!.reviewTime))
  for (const review of ordered) {
    const result = scheduler.next(card, new Date(review.reviewTime), toRatingEnum(review.rating))
    card = result.card
  }

  return mapCardState(cardId, card)
}
