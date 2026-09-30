import { newUuid } from '../core/uuid'
import type { ApiClient } from './apiClient'
import type { AppDatabase } from './db'
import type { MediaRepo } from './mediaRepo'

// Apps Script requestBody size limits are what shape this: keep raw chunks well
// under the ~50 MB request ceiling and comfortably inside a single execution.
const RAW_CHUNK_BYTES = 64 * 1024
const MAX_MEDIA_BYTES = 2 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface AttachImageResult {
  mediaId: string
  objectUrl: string
}

/**
 * Stores a picked image locally (so it previews immediately and works offline)
 * and creates the sync-tracked media metadata row. Actual bytes reach the
 * backend later via {@link uploadPendingMedia}.
 */
export async function attachImageFile(
  db: AppDatabase,
  mediaRepo: MediaRepo,
  file: File,
): Promise<AttachImageResult> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error(`Unsupported image type: ${file.type || 'unknown'}`)
  }
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error('Image is larger than the 2 MiB limit.')
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const sha256 = await sha256Hex(bytes)
  const id = newUuid()

  await db.mediaBlobs.put({ id, blob: file })
  await mediaRepo.upsertLocal({
    id,
    sha256,
    mime: file.type,
    size: file.size,
    uploaded: false,
  })

  return { mediaId: id, objectUrl: URL.createObjectURL(file) }
}

/**
 * Best-effort upload of a locally attached image to Drive via the Apps
 * Script media.* actions. Safe to call multiple times; a no-op once uploaded.
 * Failures are left for a later retry (e.g. next sync/online event) rather
 * than surfaced as fatal, matching the app's offline-first behavior.
 */
export async function uploadPendingMedia(
  db: AppDatabase,
  mediaRepo: MediaRepo,
  apiClient: ApiClient,
  idToken: string,
  mediaId: string,
): Promise<void> {
  const local = await db.mediaBlobs.get(mediaId)
  const record = await db.media.get(mediaId)
  if (!local || !record || record.uploaded) {
    return
  }

  const bytes = new Uint8Array(await local.blob.arrayBuffer())
  const requested = await apiClient.mediaRequestUpload(idToken, {
    id: mediaId,
    sha256: record.sha256,
    mime: record.mime,
    size: record.size,
  })

  if (!requested.alreadyUploaded) {
    const totalChunks = Math.max(1, Math.ceil(bytes.length / RAW_CHUNK_BYTES))
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const start = chunkIndex * RAW_CHUNK_BYTES
      const chunk = bytes.slice(start, start + RAW_CHUNK_BYTES)
      await apiClient.mediaUpload(idToken, {
        id: mediaId,
        base64Chunk: bytesToBase64(chunk),
        chunkIndex,
        totalChunks,
        sha256: record.sha256,
      })
    }
  }

  await mediaRepo.upsertLocal({ ...record, uploaded: true })
}

const objectUrlCache = new Map<string, string>()

/**
 * Resolves a viewable object URL for a media id: local blob cache first,
 * then a network download (requires sign-in) with the result cached for the
 * session. Returns null when the image cannot be shown yet (e.g. offline and
 * never downloaded before).
 */
export async function resolveMediaObjectUrl(
  db: AppDatabase,
  apiClient: ApiClient,
  idToken: string | null,
  mediaId: string,
): Promise<string | null> {
  const cached = objectUrlCache.get(mediaId)
  if (cached) {
    return cached
  }

  const local = await db.mediaBlobs.get(mediaId)
  if (local) {
    const url = URL.createObjectURL(local.blob)
    objectUrlCache.set(mediaId, url)
    return url
  }

  const record = await db.media.get(mediaId)
  if (!record || !record.uploaded || !idToken) {
    return null
  }

  const downloaded = await apiClient.mediaDownload(idToken, { id: mediaId })
  const bytes = base64ToBytes(downloaded.base64)
  const blob = new Blob([bytes.slice().buffer], { type: downloaded.mime })
  await db.mediaBlobs.put({ id: mediaId, blob })
  const url = URL.createObjectURL(blob)
  objectUrlCache.set(mediaId, url)
  return url
}
