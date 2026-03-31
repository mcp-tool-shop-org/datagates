# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |

## Reporting a Vulnerability

Email: **64996768+mcp-tool-shop@users.noreply.github.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Version affected
- Potential impact

### Response timeline

| Action | Target |
|--------|--------|
| Acknowledge report | 48 hours |
| Assess severity | 7 days |
| Release fix | 30 days |

## Threat Model

**Data touched:**
- Local JSON files (schema, policy, gold set, data inputs)
- Local SQLite database (`datagates.db`) for zone storage
- Local JSON files for review queue, source registry, decision artifacts

**Data NOT touched:**
- No remote databases or APIs
- No user credentials or authentication tokens
- No environment variables beyond `NODE_ENV`

**Permissions required:**
- Read/write access to the project directory only

**Network:** No network egress. Datagates is fully offline — no telemetry, no phone-home, no remote calls.

**No telemetry** is collected or sent, by default or otherwise.
