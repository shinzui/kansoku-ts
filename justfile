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
typecheck: build
    tsc --noEmit -p tsconfig.json
    tsc --noEmit -p packages/kansoku-js/tsconfig.json
    tsc --noEmit -p packages/kansoku-react/tsconfig.json
    tsc --noEmit -p examples/vanilla-vite/tsconfig.json
    tsc --noEmit -p examples/react-vite/tsconfig.json

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
check: typecheck lint format-check ssr-smoke check-contracts check-packages check-size adr-check

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
    #!/usr/bin/env bash
    set -euo pipefail
    if command -v okf >/dev/null; then
      okf validate docs/adr --strict --profile docs/adr/profile.dhall --profile-enforce --log-enforce
    else
      nix run github:shinzui/okf/beb89ab3bcbb705276397060d95f5580f72fbe83#okf-cli -- validate docs/adr --strict --profile docs/adr/profile.dhall --profile-enforce --log-enforce
    fi

ci: install-frozen check test build check-contracts adr-check

dev-vanilla: build
    bun run --cwd examples/vanilla-vite dev

dev-react: build
    bun run --cwd examples/react-vite dev

test-live:
    KANSOKU_TEST_NO_DOM=1 bun test test/live

test-smoke: build
    node node_modules/@playwright/test/cli.js test --config test/smoke/playwright.config.ts

check-packages: build
    bun x --no-install publint packages/kansoku-js
    bun x --no-install publint packages/kansoku-react
    bun x --no-install attw --pack --profile esm-only packages/kansoku-js
    bun x --no-install attw --pack --profile esm-only packages/kansoku-react

check-size: build
    bun scripts/check-size.ts
