import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google'
import { useLiveQuery } from 'dexie-react-hooks'
import Papa from 'papaparse'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import {
  apiClient,
  appDb,
  cardsRepo,
  decksRepo,
  reviewLogsRepo,
  syncEngine,
  useSyncStatus,
} from './appServices'
import { getAuthState, setIdToken, signOut, useAuthState } from './authStore'
import { useShortcuts } from './core/shortcuts'
import type { StudyMode } from './data/types'
import { updateAppSettings, useAppSettings } from './settingsStore'

interface CardFormState {
  front: string
  back: string
  reading: string
  example: string
  memo: string
  tags: string
  sourceLang: string
  targetLang: string
}

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }
  return new Date(value).toLocaleString()
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!]
  }
  return copy
}

function AppBootstrap() {
  useEffect(() => {
    syncEngine.start()
    return () => syncEngine.stop()
  }, [])

  return null
}

function OptionalGoogleProvider({ children }: { children: ReactNode }) {
  const { googleClientId } = useAppSettings()
  return googleClientId ? (
    <GoogleOAuthProvider clientId={googleClientId}>{children}</GoogleOAuthProvider>
  ) : (
    <>{children}</>
  )
}

function SyncBadge() {
  const syncStatus = useSyncStatus()

  return (
    <div className={`sync-pill sync-pill--${syncStatus.state}`}>
      <strong>{syncStatus.state}</strong>
      <span>{syncStatus.lastError ?? `Last sync ${formatDateTime(syncStatus.lastSyncedAt)}`}</span>
    </div>
  )
}

function AppShell() {
  const location = useLocation()

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="brand-block">
          <div className="brand-mark">語</div>
          <div>
            <h1>LBRX Cards</h1>
            <p>Local-first language practice that syncs when you want it to.</p>
          </div>
        </div>
        <nav className="nav-list" aria-label="Primary">
          <NavLink to="/">Decks</NavLink>
          <NavLink to="/stats">Stats</NavLink>
          <NavLink to="/import">Import</NavLink>
          <NavLink to="/settings">Settings</NavLink>
          <NavLink to="/share/import">Share import</NavLink>
        </nav>
        <SyncBadge />
      </aside>

      <main className="page-shell">
        <header className="page-header">
          <div>
            <p className="eyebrow">Route</p>
            <h2>{location.pathname === '/' ? 'Decks' : location.pathname}</h2>
          </div>
          <Link className="button button--ghost" to="/settings">
            Account & Sync
          </Link>
        </header>

        <Routes>
          <Route path="/" element={<DecksPage />} />
          <Route path="/decks/:deckId" element={<DeckDetailPage />} />
          <Route path="/decks/:deckId/cards/new" element={<CardEditorPage mode="new" />} />
          <Route path="/cards/:cardId/edit" element={<CardEditorPage mode="edit" />} />
          <Route path="/study/:deckId" element={<StudyPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/share/import" element={<ShareImportPage />} />
        </Routes>

        <nav className="bottom-nav" aria-label="Primary mobile">
          <NavLink to="/">Decks</NavLink>
          <NavLink to="/stats">Stats</NavLink>
          <NavLink to="/import">Import</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </main>
    </div>
  )
}

function DecksPage() {
  const navigate = useNavigate()
  const decks = useLiveQuery(() => decksRepo.listSummaries(), [], [])
  const [showForm, setShowForm] = useState(false)
  const [formState, setFormState] = useState({
    name: '',
    description: '',
    sourceLang: 'ja',
    targetLang: 'en',
    tags: '',
  })

  async function handleCreateDeck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const created = await decksRepo.create({
      name: formState.name,
      description: formState.description,
      sourceLang: formState.sourceLang,
      targetLang: formState.targetLang,
      tags: parseTags(formState.tags),
    })
    setFormState({
      name: '',
      description: '',
      sourceLang: 'ja',
      targetLang: 'en',
      tags: '',
    })
    setShowForm(false)
    void navigate(`/decks/${created.id}`)
  }

  return (
    <section className="stack">
      <div className="card card--hero">
        <div>
          <p className="eyebrow">Deck workspace</p>
          <h3>Build decks that keep working offline.</h3>
          <p>
            Create a deck, add cards locally, then sign in later to sync against the Apps Script
            backend.
          </p>
        </div>
        <button className="button" type="button" onClick={() => setShowForm((value) => !value)}>
          {showForm ? 'Close deck form' : 'Create deck'}
        </button>
      </div>

      {showForm ? (
        <form className="card form-grid" onSubmit={handleCreateDeck}>
          <label>
            <span>Name</span>
            <input
              required
              value={formState.name}
              onChange={(event) =>
                setFormState((current) => ({ ...current, name: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              rows={3}
              value={formState.description}
              onChange={(event) =>
                setFormState((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Source language</span>
            <input
              value={formState.sourceLang}
              onChange={(event) =>
                setFormState((current) => ({ ...current, sourceLang: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Target language</span>
            <input
              value={formState.targetLang}
              onChange={(event) =>
                setFormState((current) => ({ ...current, targetLang: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Tags</span>
            <input
              placeholder="travel, verbs"
              value={formState.tags}
              onChange={(event) =>
                setFormState((current) => ({ ...current, tags: event.target.value }))
              }
            />
          </label>
          <div className="form-actions">
            <button className="button" type="submit">
              Save deck
            </button>
          </div>
        </form>
      ) : null}

      <div className="deck-grid">
        {decks?.length ? (
          decks.map((deck) => (
            <article className="card deck-card" key={deck.id}>
              <div>
                <p className="eyebrow">
                  {deck.sourceLang} → {deck.targetLang}
                </p>
                <h3>{deck.name}</h3>
                <p>{deck.description || 'No description yet.'}</p>
              </div>
              <dl className="metric-row">
                <div>
                  <dt>Cards</dt>
                  <dd>{deck.totalCards}</dd>
                </div>
                <div>
                  <dt>Due</dt>
                  <dd>{deck.dueCards}</dd>
                </div>
              </dl>
              <div className="inline-actions">
                <Link className="button button--ghost" to={`/decks/${deck.id}`}>
                  Open
                </Link>
                <Link className="button" to={`/study/${deck.id}`}>
                  Study
                </Link>
              </div>
            </article>
          ))
        ) : (
          <div className="card empty-state">
            <h3>No decks yet</h3>
            <p>Create your first deck to start building a local-first study library.</p>
          </div>
        )}
      </div>
    </section>
  )
}

function DeckDetailPage() {
  const navigate = useNavigate()
  const { deckId = '' } = useParams()
  const deck = useLiveQuery(() => decksRepo.get(deckId), [deckId], undefined)
  const cards = useLiveQuery(() => cardsRepo.listByDeck(deckId), [deckId], [])

  useShortcuts(
    useMemo(
      () => [
        {
          key: 'n',
          ctrlOrMeta: true,
          handler: () => void navigate(`/decks/${deckId}/cards/new`),
        },
      ],
      [deckId, navigate],
    ),
  )

  if (!deck) {
    return (
      <section className="card empty-state">
        <h3>Deck not found</h3>
      </section>
    )
  }

  return (
    <section className="stack">
      <div className="card card--hero">
        <div>
          <p className="eyebrow">
            {deck.sourceLang} → {deck.targetLang}
          </p>
          <h3>{deck.name}</h3>
          <p>{deck.description || 'No deck description yet.'}</p>
        </div>
        <div className="inline-actions">
          <Link className="button" to={`/decks/${deckId}/cards/new`}>
            New card
          </Link>
          <Link className="button button--ghost" to={`/study/${deckId}`}>
            Study
          </Link>
          <button
            className="button button--danger"
            type="button"
            onClick={async () => {
              await decksRepo.softDelete(deckId)
              void navigate('/')
            }}
          >
            Delete deck
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <h3>Cards</h3>
          <p>Ctrl/Cmd+N opens the new-card form from this page.</p>
        </div>
        {cards.length ? (
          <ul className="entity-list">
            {cards.map((card) => (
              <li key={card.id}>
                <div>
                  <strong>{card.front}</strong>
                  <p>{card.back}</p>
                  <small>{card.tags.join(', ') || 'No tags'}</small>
                </div>
                <div className="inline-actions">
                  <Link className="button button--ghost" to={`/cards/${card.id}/edit`}>
                    Edit
                  </Link>
                  <button
                    className="button button--danger"
                    type="button"
                    onClick={() => void cardsRepo.softDelete(card.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No cards yet. Add one to start studying.</p>
        )}
      </div>
    </section>
  )
}

function CardEditorPage({ mode }: { mode: 'new' | 'edit' }) {
  const navigate = useNavigate()
  const params = useParams()
  const cardId = params.cardId ?? ''
  const deckIdFromRoute = params.deckId ?? ''
  const card = useLiveQuery(
    () => (mode === 'edit' && cardId ? cardsRepo.get(cardId) : Promise.resolve(undefined)),
    [cardId, mode],
    undefined,
  )
  const activeDeckId = card?.deckId ?? deckIdFromRoute
  const deck = useLiveQuery(
    () => (activeDeckId ? decksRepo.get(activeDeckId) : Promise.resolve(undefined)),
    [activeDeckId],
    undefined,
  )
  const [formState, setFormState] = useState<CardFormState>({
    front: '',
    back: '',
    reading: '',
    example: '',
    memo: '',
    tags: '',
    sourceLang: 'ja',
    targetLang: 'en',
  })
  const formRef = useRef<HTMLFormElement | null>(null)

  useEffect(() => {
    if (card && deck) {
      setFormState({
        front: card.front,
        back: card.back,
        reading: card.reading ?? '',
        example: card.example ?? '',
        memo: card.memo ?? '',
        tags: card.tags.join(', '),
        sourceLang: deck.sourceLang,
        targetLang: deck.targetLang,
      })
    } else if (!card && deck) {
      setFormState((current) => ({
        ...current,
        sourceLang: deck.sourceLang,
        targetLang: deck.targetLang,
      }))
    }
  }, [card, deck])

  const save = useCallback(async () => {
    const deckId = activeDeckId
    if (!deckId) {
      return
    }

    await decksRepo.update(deckId, {
      sourceLang: formState.sourceLang,
      targetLang: formState.targetLang,
    })

    if (mode === 'edit' && card) {
      await cardsRepo.update(card.id, {
        front: formState.front,
        back: formState.back,
        reading: formState.reading,
        example: formState.example,
        memo: formState.memo,
        tags: parseTags(formState.tags),
      })
    } else {
      await cardsRepo.create({
        deckId,
        front: formState.front,
        back: formState.back,
        reading: formState.reading,
        example: formState.example,
        memo: formState.memo,
        tags: parseTags(formState.tags),
      })
    }

    void navigate(`/decks/${deckId}`)
  }, [activeDeckId, card, formState, mode, navigate])

  useShortcuts(
    useMemo(
      () => [
        { key: 'Enter', ctrlOrMeta: true, handler: () => void save() },
        {
          key: 'n',
          ctrlOrMeta: true,
          handler: () => {
            if (activeDeckId) {
              void navigate(`/decks/${activeDeckId}/cards/new`)
            }
          },
        },
      ],
      [activeDeckId, navigate, save],
    ),
  )

  if (!activeDeckId) {
    return (
      <section className="card empty-state">
        <h3>Deck not found</h3>
      </section>
    )
  }

  return (
    <section className="card">
      <div className="section-header">
        <div>
          <p className="eyebrow">{mode === 'edit' ? 'Edit card' : 'New card'}</p>
          <h3>{deck?.name ?? 'Card editor'}</h3>
        </div>
        <p>Ctrl/Cmd+Enter saves. Ctrl/Cmd+N opens a fresh card for this deck.</p>
      </div>
      <form
        ref={formRef}
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <label>
          <span>Front</span>
          <input
            autoFocus
            required
            value={formState.front}
            onChange={(event) =>
              setFormState((current) => ({ ...current, front: event.target.value }))
            }
          />
        </label>
        <label>
          <span>Back</span>
          <textarea
            required
            rows={4}
            value={formState.back}
            onChange={(event) =>
              setFormState((current) => ({ ...current, back: event.target.value }))
            }
          />
        </label>
        <label>
          <span>Reading</span>
          <input
            value={formState.reading}
            onChange={(event) =>
              setFormState((current) => ({ ...current, reading: event.target.value }))
            }
          />
        </label>
        <label>
          <span>Example</span>
          <textarea
            rows={3}
            value={formState.example}
            onChange={(event) =>
              setFormState((current) => ({ ...current, example: event.target.value }))
            }
          />
        </label>
        <label>
          <span>Memo</span>
          <textarea
            rows={3}
            value={formState.memo}
            onChange={(event) =>
              setFormState((current) => ({ ...current, memo: event.target.value }))
            }
          />
        </label>
        <label>
          <span>Tags</span>
          <input
            value={formState.tags}
            onChange={(event) =>
              setFormState((current) => ({ ...current, tags: event.target.value }))
            }
          />
        </label>
        <label>
          <span>Source language</span>
          <input
            value={formState.sourceLang}
            onChange={(event) =>
              setFormState((current) => ({ ...current, sourceLang: event.target.value }))
            }
          />
        </label>
        <label>
          <span>Target language</span>
          <input
            value={formState.targetLang}
            onChange={(event) =>
              setFormState((current) => ({ ...current, targetLang: event.target.value }))
            }
          />
        </label>
        <div className="form-actions">
          <button className="button" type="submit">
            Save card
          </button>
          <Link className="button button--ghost" to={`/decks/${activeDeckId}`}>
            Cancel
          </Link>
        </div>
      </form>
    </section>
  )
}

function StudyPage() {
  const { deckId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = (searchParams.get('mode') as StudyMode | null) ?? 'flip'
  const deck = useLiveQuery(() => decksRepo.get(deckId), [deckId], undefined)
  const dueCards = useLiveQuery(() => cardsRepo.listDueByDeck(deckId), [deckId], [])
  const allCards = useLiveQuery(() => cardsRepo.listByDeck(deckId), [deckId], [])
  const [revealed, setRevealed] = useState(false)
  const [typedAnswer, setTypedAnswer] = useState('')
  const [startedAt, setStartedAt] = useState(Date.now())

  const currentCard = dueCards[0]
  const choiceOptions = useMemo(() => {
    if (!currentCard) {
      return []
    }
    const distractors = allCards
      .filter((card) => card.id !== currentCard.id)
      .map((card) => card.back)
      .filter(Boolean)
    return shuffle([currentCard.back, ...distractors.slice(0, 3)]).slice(0, 4)
  }, [allCards, currentCard])

  useEffect(() => {
    setRevealed(false)
    setTypedAnswer('')
    setStartedAt(Date.now())
  }, [currentCard?.id, mode])

  function speak(text: string) {
    if (!('speechSynthesis' in window)) {
      return
    }
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }

  async function logReview(rating: 1 | 2 | 3 | 4) {
    if (!currentCard) {
      return
    }
    await reviewLogsRepo.addLocal({
      cardId: currentCard.id,
      rating,
      testType: mode,
      durationMs: Date.now() - startedAt,
    })
    setRevealed(false)
    setTypedAnswer('')
    setStartedAt(Date.now())
  }

  if (!deck) {
    return (
      <section className="card empty-state">
        <h3>Deck not found</h3>
      </section>
    )
  }

  return (
    <section className="stack">
      <div className="card card--hero">
        <div>
          <p className="eyebrow">{deck.name}</p>
          <h3>Study mode</h3>
          <p>{dueCards.length} cards currently due.</p>
        </div>
        <div className="inline-actions">
          {(['flip', 'typing', 'choice'] as StudyMode[]).map((item) => (
            <button
              key={item}
              className={`button ${mode === item ? '' : 'button--ghost'}`}
              type="button"
              onClick={() => setSearchParams({ mode: item })}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {!currentCard ? (
        <div className="card empty-state">
          <h3>Nothing due right now</h3>
          <p>Add cards or come back when your next review is scheduled.</p>
        </div>
      ) : (
        <div className="card study-card">
          <div className="study-surface">
            <p className="eyebrow">Prompt</p>
            <h3>{currentCard.front}</h3>
            {currentCard.reading ? <p>Reading: {currentCard.reading}</p> : null}
            <div className="inline-actions">
              <button className="button button--ghost" type="button" onClick={() => speak(currentCard.front)}>
                Speak prompt
              </button>
              {revealed ? (
                <button className="button button--ghost" type="button" onClick={() => speak(currentCard.back)}>
                  Speak answer
                </button>
              ) : null}
            </div>
          </div>

          {mode === 'typing' && !revealed ? (
            <div className="stack">
              <label>
                <span>Type your answer</span>
                <textarea
                  rows={3}
                  value={typedAnswer}
                  onChange={(event) => setTypedAnswer(event.target.value)}
                />
              </label>
              <button className="button" type="button" onClick={() => setRevealed(true)}>
                Check answer
              </button>
            </div>
          ) : null}

          {mode === 'choice' && !revealed ? (
            <div className="choice-grid">
              {choiceOptions.map((option) => (
                <button
                  key={option}
                  className="button button--ghost"
                  type="button"
                  onClick={() => {
                    setTypedAnswer(option)
                    setRevealed(true)
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}

          {mode === 'flip' && !revealed ? (
            <button className="button" type="button" onClick={() => setRevealed(true)}>
              Reveal answer
            </button>
          ) : null}

          {revealed ? (
            <div className="answer-panel">
              <p className="eyebrow">Answer</p>
              <h3>{currentCard.back}</h3>
              {mode !== 'flip' ? (
                <p>
                  Your response:{' '}
                  <strong>
                    {typedAnswer || '—'} {typedAnswer.trim().toLowerCase() === currentCard.back.trim().toLowerCase() ? '✓' : ''}
                  </strong>
                </p>
              ) : null}
              {currentCard.example ? <p>Example: {currentCard.example}</p> : null}
              {currentCard.memo ? <p>Memo: {currentCard.memo}</p> : null}
              <div className="rating-grid">
                <button className="button button--danger" type="button" onClick={() => logReview(1)}>
                  Again
                </button>
                <button className="button button--ghost" type="button" onClick={() => logReview(2)}>
                  Hard
                </button>
                <button className="button" type="button" onClick={() => logReview(3)}>
                  Good
                </button>
                <button className="button button--success" type="button" onClick={() => logReview(4)}>
                  Easy
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

function StatsPage() {
  const stats = useLiveQuery(async () => {
    const logs = await reviewLogsRepo.listAll()
    const states = await appDb.cardStates.toArray()
    const dailyCounts = new Map<string, number>()

    for (const log of logs) {
      const day = log.reviewTime.slice(0, 10)
      dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1)
    }

    let streak = 0
    const cursor = new Date()
    while (true) {
      const key = cursor.toISOString().slice(0, 10)
      if (!dailyCounts.get(key)) {
        break
      }
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    }

    const dueForecast = Array.from({ length: 7 }, (_, offset) => {
      const target = new Date()
      target.setHours(23, 59, 59, 999)
      target.setDate(target.getDate() + offset)
      const count = states.filter((state) => !state.due || state.due <= target.toISOString()).length
      return {
        label: target.toISOString().slice(0, 10),
        count,
      }
    })

    return {
      recentDays: [...dailyCounts.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .slice(-14),
      dueForecast,
      streak,
      totalReviews: logs.length,
    }
  }, [])

  return (
    <section className="stack">
      <div className="metric-grid">
        <article className="card metric-card">
          <span>Total reviews</span>
          <strong>{stats?.totalReviews ?? 0}</strong>
        </article>
        <article className="card metric-card">
          <span>Current streak</span>
          <strong>{stats?.streak ?? 0} day(s)</strong>
        </article>
      </div>

      <div className="card">
        <h3>Reviews per day</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Reviews</th>
            </tr>
          </thead>
          <tbody>
            {stats?.recentDays.map(([day, count]) => (
              <tr key={day}>
                <td>{day}</td>
                <td>{count}</td>
              </tr>
            )) ?? null}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Due forecast</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Due by end of day</th>
            </tr>
          </thead>
          <tbody>
            {stats?.dueForecast.map((entry) => (
              <tr key={entry.label}>
                <td>{entry.label}</td>
                <td>{entry.count}</td>
              </tr>
            )) ?? null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ImportPage() {
  const navigate = useNavigate()
  const decks = useLiveQuery(() => decksRepo.list(), [], [])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [selectedDeckId, setSelectedDeckId] = useState('new')
  const [deckName, setDeckName] = useState('Imported deck')
  const [sourceLang, setSourceLang] = useState('ja')
  const [targetLang, setTargetLang] = useState('en')
  const [mapping, setMapping] = useState({
    front: '',
    back: '',
    reading: '',
    example: '',
    memo: '',
    tags: '',
  })

  async function handleFileChange(file: File | null) {
    if (!file) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete(results) {
          setRows(results.data)
          setHeaders(results.meta.fields ?? [])
          const [first, second, third, fourth, fifth, sixth] = results.meta.fields ?? []
          setMapping({
            front: first ?? '',
            back: second ?? '',
            reading: third ?? '',
            example: fourth ?? '',
            memo: fifth ?? '',
            tags: sixth ?? '',
          })
          resolve()
        },
        error(error) {
          reject(error)
        },
      })
    })
  }

  async function handleImport() {
    if (!mapping.front || !mapping.back) {
      return
    }

    let deckId = selectedDeckId
    if (deckId === 'new') {
      const created = await decksRepo.create({
        name: deckName,
        sourceLang,
        targetLang,
      })
      deckId = created.id
    }

    for (const row of rows) {
      await cardsRepo.create({
        deckId,
        front: row[mapping.front] ?? '',
        back: row[mapping.back] ?? '',
        reading: mapping.reading ? row[mapping.reading] ?? '' : '',
        example: mapping.example ? row[mapping.example] ?? '' : '',
        memo: mapping.memo ? row[mapping.memo] ?? '' : '',
        tags: mapping.tags ? parseTags(row[mapping.tags] ?? '') : [],
      })
    }

    void navigate(`/decks/${deckId}`)
  }

  return (
    <section className="stack">
      <div className="card">
        <h3>CSV import</h3>
        <p>
          CSV import is fully implemented. Anki .apkg import is intentionally left as a follow-up
          extension point.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void handleFileChange(event.target.files?.[0] ?? null)}
        />
      </div>

      {headers.length ? (
        <div className="card stack">
          <label>
            <span>Import into</span>
            <select value={selectedDeckId} onChange={(event) => setSelectedDeckId(event.target.value)}>
              <option value="new">Create new deck</option>
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </label>

          {selectedDeckId === 'new' ? (
            <div className="form-grid">
              <label>
                <span>Deck name</span>
                <input value={deckName} onChange={(event) => setDeckName(event.target.value)} />
              </label>
              <label>
                <span>Source language</span>
                <input value={sourceLang} onChange={(event) => setSourceLang(event.target.value)} />
              </label>
              <label>
                <span>Target language</span>
                <input value={targetLang} onChange={(event) => setTargetLang(event.target.value)} />
              </label>
            </div>
          ) : null}

          <div className="form-grid">
            {Object.keys(mapping).map((field) => (
              <label key={field}>
                <span>{field}</span>
                <select
                  value={mapping[field as keyof typeof mapping]}
                  onChange={(event) =>
                    setMapping((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }))
                  }
                >
                  <option value="">Skip</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <button className="button" type="button" onClick={() => void handleImport()}>
            Import {rows.length} row(s)
          </button>
        </div>
      ) : null}

      <div className="card">
        <h3>Next import step</h3>
        <p>Anki .apkg import is TODO. Add it later next to this CSV flow.</p>
      </div>
    </section>
  )
}

function SettingsPage() {
  const settings = useAppSettings()
  const auth = useAuthState()
  const syncStatus = useSyncStatus()
  const [pingResult, setPingResult] = useState<string>('')

  return (
    <section className="stack">
      <div className="card form-grid">
        <div className="section-header">
          <div>
            <p className="eyebrow">Account & Sync</p>
            <h3>Configure the real backend later, keep working locally now.</h3>
          </div>
        </div>
        <label>
          <span>Google OAuth Client ID</span>
          <input
            placeholder="Blank until the human creates it"
            value={settings.googleClientId}
            onChange={(event) => updateAppSettings({ googleClientId: event.target.value })}
          />
        </label>
        <label>
          <span>Apps Script base URL</span>
          <input
            placeholder="Blank means dev mock in npm run dev; not configured in production"
            value={settings.serverBaseUrl}
            onChange={(event) => updateAppSettings({ serverBaseUrl: event.target.value })}
          />
        </label>
        <div className="stack">
          <p>
            Signed in as: <strong>{auth.email ?? 'Signed out'}</strong>
          </p>
          {settings.googleClientId ? (
            <GoogleLogin
              onSuccess={(credentialResponse) => {
                if (credentialResponse.credential) {
                  setIdToken(credentialResponse.credential)
                }
              }}
              onError={() => setPingResult('Google sign-in failed.')}
            />
          ) : (
            <p>Add a Google Client ID to enable the GIS sign-in button.</p>
          )}
          <div className="inline-actions">
            <button
              className="button"
              type="button"
              onClick={() => void syncEngine.syncNow().catch(() => undefined)}
            >
              Sync now
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={async () => {
                if (!getAuthState().idToken) {
                  setPingResult('Sign in first.')
                  return
                }
                try {
                  const ping = await apiClient.authPing(getAuthState().idToken)
                  setPingResult(`${ping.email} (${ping.userId})`)
                } catch (error) {
                  setPingResult(error instanceof Error ? error.message : 'Ping failed')
                }
              }}
            >
              Verify token
            </button>
            <button className="button button--danger" type="button" onClick={() => signOut()}>
              Sign out
            </button>
          </div>
          <p>Sync status: {syncStatus.lastError ?? syncStatus.state}</p>
          {pingResult ? <p>Auth ping: {pingResult}</p> : null}
        </div>
      </div>

      <div className="card">
        <h3>Transport invariants</h3>
        <ul>
          <li>POST body uses text/plain;charset=utf-8 with a JSON string.</li>
          <li>No Authorization header or custom headers.</li>
          <li>ID token lives in the JSON body.</li>
          <li>Fetch redirects must stay on the default follow behavior.</li>
        </ul>
      </div>
    </section>
  )
}

function ShareImportPage() {
  return (
    <section className="card empty-state">
      <h3>Share import UI</h3>
      <p>
        TODO: wire a real share import flow to share.create/get/revoke/import once the backend
        payload shapes are finalized in the parallel backend workstream.
      </p>
    </section>
  )
}

function App() {
  return (
    <OptionalGoogleProvider>
      <AppBootstrap />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AppShell />
      </BrowserRouter>
    </OptionalGoogleProvider>
  )
}

export default App
