# Task runner for this Bun + TypeScript project.
# Tools (bun, oxlint, oxfmt, tsc) are provided by the Nix dev shell.

# List available recipes
default:
    @just --list

# Install dependencies with Bun
install:
    bun install

install-frozen:
    bun install --frozen-lockfile

# Type-check the project without emitting output
typecheck:
    tsc --noEmit -p tsconfig.json
    tsc --noEmit -p packages/kansoku-js/tsconfig.json
    tsc --noEmit -p packages/kansoku-react/tsconfig.json

# Format sources in place (strips semicolons, sorts imports)
format:
    oxfmt --write .

# Verify formatting without writing (CI mode)
format-check:
    oxfmt --check .

# Lint sources with oxlint
lint:
    oxlint

# Lint and auto-fix where possible
lint-fix:
    oxlint --fix

# Run all checks: typecheck, lint, and formatting
check: typecheck lint format-check ssr-smoke

ssr-smoke:
    bun scripts/ssr-smoke.ts

build:
    bun scripts/build.ts packages/kansoku-js
    bun scripts/build.ts packages/kansoku-react

test:
    bun test
    just test-no-dom test/ssr packages/kansoku-js/test/ssr packages/kansoku-react/test/ssr

test-no-dom +paths:
    KANSOKU_TEST_NO_DOM=1 bun test {{paths}}

sync-contracts *args:
    bun scripts/sync-contracts.ts {{args}}

generate-schema:
    bun x --no-install openapi-typescript contracts/openapi.json -o packages/kansoku-js/src/generated/schema.ts

check-contracts: generate-schema
    git diff --exit-code HEAD -- contracts packages/kansoku-js/src/generated

adr-check:
    okf validate docs/adr --strict --profile docs/adr/profile.dhall --profile-enforce --log-enforce

ci: install-frozen check test build check-contracts adr-check
