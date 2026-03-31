# Review

The review queue provides a structured workflow for inspecting quarantined items, shadow deltas, and periodic approved samples.

## Review item types

| Type | Created when |
|------|-------------|
| `quarantined_row` | A record fails one or more gates |
| `quarantined_batch` | An entire batch is rejected |
| `source_quarantine` | A source exceeds its quarantine threshold |
| `shadow_delta` | Shadow and active policy produce different verdicts |
| `approved_sample` | Periodic sampling of approved records for spot-checking |

## Workflow

```bash
# List pending items
datagates review list

# Confirm a quarantine decision was correct
datagates review confirm <reviewId> reviewer@team.com

# Dismiss a false positive
datagates review dismiss <reviewId> reviewer@team.com

# Override with an explicit receipt
datagates review override <reviewId> reviewer@team.com
```

## Review statuses

| Status | Meaning |
|--------|---------|
| `pending` | Awaiting review |
| `confirmed` | Reviewer verified the decision was correct |
| `dismissed` | Reviewer determined this was a false positive |
| `overridden` | Reviewer created an override receipt to change the outcome |

## Override receipts

Every override requires:
- **Actor**: who made the override
- **Reason**: why (free text, but required)
- **Policy version**: which policy was in effect

Overrides are immutable once created. They cannot be silently patched or deleted. They appear in decision artifacts.

```typescript
const receipt = overrides.create({
  action: 'waive_row',
  targetId: 'record-id',
  targetType: 'record',
  actor: 'admin@team.com',
  reason: 'Known vendor format, false positive from schema validation',
  policyVersion: '1.0.0',
});
```

## Approved sampling

Periodic sampling of approved records catches:
- Records that were approved but shouldn't have been (false negatives)
- Gradual quality degradation that batch-level metrics miss

Configure sample rate programmatically:

```typescript
const queue = new ReviewQueue();
queue.sampleApproved(approvedRecords, 0.05); // 5% sample rate
```
