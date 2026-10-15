import type { AnalyticsEvent, JsonObject } from "./contract/wire.js"

export type { AnalyticsEvent, JsonObject, JsonValue } from "./contract/wire.js"
export type IdentifierKind = "cookie" | "device" | "fingerprint" | "email_sha256"
export interface StorageAdapter {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}
export interface KansokuOptions {
  baseUrl: string
  writeKey: string
  sourceService?: string
  autoStart?: boolean
  flushAt?: number
  flushIntervalMs?: number
  maxQueueSize?: number
  maxBatchEvents?: number
  maxBatchBytes?: number
  maxRetries?: number
  retryBaseDelayMs?: number
  requestTimeoutMs?: number
  persistQueue?: boolean
  storage?: "localStorage" | "cookie" | "memory" | StorageAdapter
  storageKeyPrefix?: string
  cookieDomain?: string
  sessionTimeoutMs?: number
  schemaVersions?: Record<string, number>
  autocapture?: { pageViews?: boolean; sessions?: boolean }
  optOut?: boolean
  respectDoNotTrack?: boolean
  respectGlobalPrivacyControl?: boolean
  beforeSend?: (event: AnalyticsEvent) => AnalyticsEvent | null
  onDrop?: (info: DropInfo) => void
  fetch?: typeof globalThis.fetch
  now?: () => number
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
  debug?: boolean
}
export type ResolvedKansokuOptions = Readonly<
  Required<Omit<KansokuOptions, "beforeSend" | "onDrop" | "cookieDomain">> &
    Pick<KansokuOptions, "beforeSend" | "onDrop" | "cookieDomain">
>
export type DropReason =
  | "queue_full"
  | "rejected"
  | "permanent_error"
  | "retries_exhausted"
  | "before_send"
  | "opted_out"
  | "invalid"
export interface DropInfo {
  reason: DropReason
  events: AnalyticsEvent[]
  detail?: string
}
export interface TrackOptions {
  schemaVersion?: number
  occurredAt?: Date
  context?: JsonObject
}
export interface KansokuStats {
  queued: number
  accepted: number
  rejected: number
  dropped: number
}
export interface KansokuClient {
  page(properties?: JsonObject, options?: TrackOptions): void
  identify(userId: string, traits?: JsonObject): void
  alias(previousId: string, newId: string, properties?: JsonObject): void
  group(organizationId: string, properties?: JsonObject): void
  experiment(
    experiment: string,
    variant: string,
    properties?: JsonObject,
    options?: ExperimentOptions,
  ): void
  setIdentifiers(identifiers: Partial<Record<IdentifierKind, string>>): void
  reset(): void
  track(eventName: string, properties?: JsonObject, options?: TrackOptions): void
  flush(): Promise<void>
  start(): void
  stop(): void
  shutdown(): Promise<void>
  optOut(): void
  optIn(): void
  isOptedOut(): boolean
  getAnonymousId(): string
  getUserId(): string | undefined
  getSessionId(): string
  readonly stats: Readonly<KansokuStats>
  readonly config: ResolvedKansokuOptions
}
export interface ExperimentOptions {
  force?: boolean
}
