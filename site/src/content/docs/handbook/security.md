---
title: Security
description: Threat model, data boundaries, and security guarantees.
sidebar:
  order: 6
---

## Threat model

Datagates is a **local-only** tool. It does not make network calls, collect telemetry, or handle authentication credentials.

### Data touched

- **Local JSON files**: schema, policy, gold set, data inputs, review queue, source registry
- **Local SQLite database**: `datagates.db` for zone storage (raw, candidate, approved, quarantine)
- **Local artifact files**: decision evidence written to the `artifacts/` directory

### Data NOT touched

- No remote databases or APIs
- No user credentials or authentication tokens
- No environment variables beyond `NODE_ENV`
- No temporary files outside the project directory

### Permissions required

- Read/write access to the project directory only
- No elevated permissions needed
- No system-level access

## Network

Datagates makes **zero network calls**. There is no telemetry, no phone-home, no remote validation. All processing happens locally against local files and a local SQLite database.

## Error handling

- Stack traces are suppressed by default — only the error message is shown
- Use `--debug` to see full stack traces for debugging
- Errors use deterministic exit codes (see [CLI reference](/datagates/handbook/reference/#exit-codes))
- No sensitive data is included in error output

## Reporting vulnerabilities

Email: **64996768+mcp-tool-shop@users.noreply.github.com**

See [SECURITY.md](https://github.com/mcp-tool-shop-org/datagates/blob/main/SECURITY.md) for the full reporting process and response timeline.
