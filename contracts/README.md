# Vendored Kansoku contracts

These are byte-for-byte copies of `docs/api/openapi.json` and
`docs/contracts/events.json` in `mori://shinzui/kansoku` (artifact-level URIs pending).
`KANSOKU_COMMIT` records the full source commit. Builds need only this repository.

Refresh deliberately with `just sync-contracts --from <checkout> --ref <commit>`, then
`just generate-schema`. Review and commit the contracts, pin, and generated types together.
`just check-contracts` detects uncommitted contract or generated-type drift.
