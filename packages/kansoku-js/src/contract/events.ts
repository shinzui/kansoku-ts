import { GOVERNED_TRAIT_VERSIONS } from "../generated/trait-schema.js"

export const PAGE_VIEW = "page_view"
export const SESSION_START = "session_start"
export const EXPERIMENT_VIEWED = "experiment_viewed"
export const IDENTIFY = "identify"
export const IDENTIFY_ONCE = "identify_once"
export const ALIAS = "alias"
export const GROUP = "group"
export const BUILT_IN_SCHEMA_VERSIONS: Readonly<Record<string, number>> = Object.freeze({
  [PAGE_VIEW]: 1,
  [SESSION_START]: 1,
  [EXPERIMENT_VIEWED]: 1,
  [IDENTIFY]: GOVERNED_TRAIT_VERSIONS.identify,
  [IDENTIFY_ONCE]: GOVERNED_TRAIT_VERSIONS.identify_once,
})
export { IDENTIFIER_KINDS } from "../generated/identifier-kinds.js"
export const MIN_SCHEMA_VERSION = 1
export const MAX_SCHEMA_VERSION = 65535
export const EXPERIMENT_NAME_PATTERN = /^[a-z0-9_.:-]{1,128}$/
