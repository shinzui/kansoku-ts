--| Shared bug-report profile. Bump the tag and semantic hash together when upgrading.
--
-- A bug report is a broken provision claim: something this repository already says it does,
-- observably does not do, with one reproduction per report. Behavior that was never provided
-- is an improvement request, not a bug.
--
-- The profile targets Open Knowledge Format v0.2 and declares its own `status` lifecycle
-- (`reported`, `confirmed`, `in-progress`, `fixed`, `wont-fix`, `duplicate`, `not-a-bug`,
-- `cannot-reproduce`); the five terminal statuses require `resolution` under `--strict`.
-- Loading a v0.22.0 descriptor requires `okf` 0.9.0.0 or later.
--
-- The integrity hash below is the semantic hash of the v0.22.0 profile. When bumping to a
-- future release, change the tag, delete the hash line, and re-run
-- `dhall freeze --inplace docs/bug-reports/profile.dhall`. Never hand-write a `sha256:` value.
https://raw.githubusercontent.com/shinzui/okf-profiles/v0.22.0/profiles/coordination/bug-reports.dhall
  sha256:665b70b070ae74ee0c22b8ec65d92e3876693ca5dda2a8aa91674948dcfe3acc
