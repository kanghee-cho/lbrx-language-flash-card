import type {
  ApiEnvelope,
  ApiResponse,
  AuthPingResponse,
  MediaDownloadPayload,
  MediaDownloadResponse,
  MediaRequestUploadPayload,
  MediaRequestUploadResponse,
  MediaUploadPayload,
  MediaUploadResponse,
  ShareCodePayload,
  ShareCreatePayload,
  ShareImportResponse,
  ShareRecord,
  ShareRevokeResponse,
  SharePreview,
  SyncPullPayload,
  SyncPullResponse,
  SyncPushPayload,
  SyncPushResponse,
} from './types'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'unauthorized'
      | 'forbidden'
      | 'validation'
      | 'not_found'
      | 'rate_limited'
      | 'internal',
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class ServerUnreachableError extends Error {
  constructor(message = 'Server unreachable — check deployment or CORS configuration.') {
    super(message)
    this.name = 'ServerUnreachableError'
  }
}

export interface ApiTransport {
  request<TResponse>(url: string, envelope: ApiEnvelope): Promise<ApiResponse<TResponse>>
}

export interface ApiClientOptions {
  getBaseUrl: () => string
  getDeviceId: () => string
  transport?: ApiTransport
}

class FetchTransport implements ApiTransport {
  async request<TResponse>(url: string, envelope: ApiEnvelope): Promise<ApiResponse<TResponse>> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(envelope),
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        redirect: 'follow',
      })
      return (await response.json()) as ApiResponse<TResponse>
    } catch (error) {
      if (error instanceof TypeError) {
        throw new ServerUnreachableError()
      }
      throw error
    }
  }
}

export class ApiClient {
  private readonly transport: ApiTransport

  constructor(private readonly options: ApiClientOptions) {
    this.transport = options.transport ?? new FetchTransport()
  }

  private resolveUrl(): string {
    const configured = this.options.getBaseUrl().trim()
    if (configured) {
      return configured
    }

    if (import.meta.env.DEV) {
      return '/__mock-appsscript__'
    }

    throw new ServerUnreachableError('Server base URL is not configured.')
  }

  private async post<TResponse, TPayload>(
    action: ApiEnvelope<TPayload>['action'],
    payload: TPayload,
    idToken: string | null,
  ): Promise<TResponse> {
    const envelope: ApiEnvelope<TPayload> = {
      action,
      idToken,
      deviceId: this.options.getDeviceId(),
      payload,
    }
    const response = await this.transport.request<TResponse>(this.resolveUrl(), envelope)
    if (!response.ok) {
      throw new ApiError(response.error.message, response.error.code)
    }
    return response.data
  }

  async authPing(idToken: string | null): Promise<AuthPingResponse> {
    return this.post('auth.ping', {}, idToken)
  }

  async syncPull(idToken: string, payload: SyncPullPayload): Promise<SyncPullResponse> {
    return this.post('sync.pull', payload, idToken)
  }

  async syncPush(idToken: string, payload: SyncPushPayload): Promise<SyncPushResponse> {
    return this.post('sync.push', payload, idToken)
  }

  async mediaRequestUpload(
    idToken: string,
    payload: MediaRequestUploadPayload,
  ): Promise<MediaRequestUploadResponse> {
    return this.post('media.requestUpload', payload, idToken)
  }

  async mediaUpload(idToken: string, payload: MediaUploadPayload): Promise<MediaUploadResponse> {
    return this.post('media.upload', payload, idToken)
  }

  async mediaDownload(
    idToken: string,
    payload: MediaDownloadPayload,
  ): Promise<MediaDownloadResponse> {
    return this.post('media.download', payload, idToken)
  }

  async shareCreate(idToken: string, payload: ShareCreatePayload): Promise<ShareRecord> {
    return this.post('share.create', payload, idToken)
  }

  /** Unauthenticated preview by share code — mirrors the backend's public `share.get` action. */
  async shareGet(payload: ShareCodePayload): Promise<SharePreview> {
    return this.post('share.get', payload, null)
  }

  async shareRevoke(idToken: string, payload: ShareCodePayload): Promise<ShareRevokeResponse> {
    return this.post('share.revoke', payload, idToken)
  }

  async shareImport(idToken: string, payload: ShareCodePayload): Promise<ShareImportResponse> {
    return this.post('share.import', payload, idToken)
  }
}
