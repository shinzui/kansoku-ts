# Task runner for this Bun + TypeScript project.
# Tools (bun, oxlint, oxfmt, tsc) are provided by the Nix dev shell.

# List available recipes
default:
    @just --list

# Install dependencies with Bun
install:
    bun install

# Type-check the project without emitting output
typecheck:
    tsc --noEmit

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
check: typecheck lint format-check
