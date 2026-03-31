# datagates

ML-grade dataset cleaning as a layered gate system. Data earns promotion.

## Philosophy

Data cleaning is not a cleanup script — it is a **promotion system**. Raw data becomes trusted only by passing a sequence of gates with traceable reasons.

## Architecture

```
Raw → Validate → Normalize → Dedupe → Score → Quarantine/Review → Approve
```

Three storage zones enforce the boundary between "touched" and "trusted":

- **raw** — immutable intake, never modified
- **candidate** — transformed but not yet trusted
- **approved** — eligible for training/eval/use

## Status

Phase 1 — Intake Truth + Hard Gate (in progress)

## License

MIT
