import { type HlcClock, compareHlc } from '../core/hlc'
import type { AppDatabase } from './db'
import { notifyLocalMutation } from './mutationSignal'
import type { LocalMediaRecord, MediaRecord } from './types'

export class MediaRepo {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: HlcClock,
  ) {}

  async upsertLocal(
    record: Omit<LocalMediaRecord, 'hlc' | 'dirty' | 'createdAt'> & {
      createdAt?: string
    },
  ): Promise<LocalMediaRecord> {
    const existing = await this.db.media.get(record.id)
    const next: LocalMediaRecord = {
      ...existing,
      ...record,
      createdAt: existing?.createdAt ?? record.createdAt ?? new Date().toISOString(),
      deletedAt: record.deletedAt ?? existing?.deletedAt ?? null,
      hlc: this.clock.send(),
      dirty: true,
    }

    await this.db.media.put(next)
    notifyLocalMutation()
    return next
  }

  async getDirty(): Promise<LocalMediaRecord[]> {
    return (await this.db.media.toArray()).filter((media) => media.dirty)
  }

  async markClean(idsToHlc: Record<string, string>): Promise<void> {
    await this.db.transaction('rw', this.db.media, async () => {
      for (const [id, pushedHlc] of Object.entries(idsToHlc)) {
        const existing = await this.db.media.get(id)
        if (existing && existing.hlc === pushedHlc) {
          await this.db.media.put({ ...existing, dirty: false })
        }
      }
    })
  }

  async applyRemote(record: MediaRecord): Promise<void> {
    this.clock.receive(record.hlc)
    const existing = await this.db.media.get(record.id)
    if (!existing || compareHlc(record.hlc, existing.hlc) > 0) {
      await this.db.media.put({ ...record, dirty: false })
    }
  }
}
