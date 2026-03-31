<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/datagates/readme.png" width="400" alt="datagates" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/datagates/actions"><img src="https://github.com/mcp-tool-shop-org/datagates/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mcp-tool-shop-org/datagates/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/datagates/"><img src="https://img.shields.io/badge/docs-landing%20page-blue" alt="Landing Page" /></a>
</p>

Sistema di promozione dei dati controllato. I dati acquisiscono fiducia attraverso livelli di controllo, non attraverso una pulizia silenziosa.

## Cosa fa

Datagates considera la pulizia dei dataset come un **problema di promozione**. I record non diventano affidabili semplicemente passando attraverso del codice; diventano affidabili guadagnando una promozione sotto una legge esplicita, versionata e verificabile.

Quattro livelli di fiducia, ognuno con il proprio controllo:

| Livello | Controllo | Cosa rileva |
|-------|------|-----------------|
| **Row trust** | Validazione dello schema, normalizzazione, rimozione precisa dei duplicati | Struttura errata, valori non validi, duplicati |
| **Semantic trust** | Regole tra campi, rilevamento di duplicati approssimativi | Contraddizioni, duplicati approssimativi, livello di confidenza |
| **Batch trust** | Metriche, rilevamento di derive, sovrapposizione con il set di test | Variazione della distribuzione, perdita di dati dal set di test, contaminazione della fonte |
| **Governance trust** | Registro delle politiche, calibrazione, modalità di test, sovrascritture | Modifiche alle politiche non testate, eccezioni silenziose, fonti non verificate |

Ogni decisione di quarantena include motivazioni esplicite. Ogni sovrascrittura richiede una ricevuta permanente. Ogni decisione a livello di batch può essere ricostruita dai suoi artefatti.

## Installazione

```bash
npm install datagates
```

## Guida rapida

```bash
# Initialize a project
npx datagates init --name my-project

# Edit schema.json and policy.json to match your data

# Ingest a batch
npx datagates run --input data.json

# Calibrate against a gold set
npx datagates calibrate

# Compare policies in shadow mode
npx datagates shadow --input data.json

# Review quarantined items
npx datagates review list
```

## Comandi CLI

| Comando | Descrizione |
|---------|-------------|
| `datagates init` | Inizializza il progetto con configurazione, schema, politica, set di riferimento |
| `datagates run` | Importa un batch, esegui tutti i controlli, emetti il verdetto |
| `datagates calibrate` | Esegui il set di riferimento, misura FP/FN/F1, rileva regressioni |
| `datagates shadow` | Confronta la politica attiva con quella candidata senza modificare i dati |
| `datagates review` | Elenca, conferma, rifiuta o sovrascrivi gli elementi in fase di revisione |
| `datagates source` | Registra, ispeziona, attiva o sospendi le fonti di dati |
| `datagates artifact` | Esporta o ispeziona gli artefatti delle decisioni a livello di batch |
| `datagates promote-policy` | Attiva una politica solo dopo che la calibrazione è stata completata |
| `datagates packs` | Elenca i pacchetti di politiche iniziali disponibili |

## Pacchetti di politiche

Inizia con una politica predefinita invece di crearne una da zero:

- **strict-structured** — Soglie rigide per dati strutturati puliti
- **text-dedupe** — Rilevamento aggressivo di duplicati approssimativi per dataset di testo
- **classification-basic** — Rilevamento di derive delle etichette e scomparsa delle classi
- **source-probation-first** — Ingestione conservativa da più fonti con recupero parziale

```bash
npx datagates init --pack strict-structured
```

## Architettura a tre zone

```
Raw (immutable) --> Candidate --> Approved
                        |
                    Quarantine
```

- **Raw**: input immutabile, mai modificato
- **Candidate**: riga passata attraverso i controlli a livello di riga, in attesa del verdetto a livello di batch
- **Approved**: promosso dopo il superamento dei controlli a livello di batch
- **Quarantine**: fallito uno o più controlli, con motivazioni esplicite

## API programmatica

```typescript
import { Pipeline, ZoneStore } from 'datagates';

const store = new ZoneStore('datagates.db');
const pipeline = new Pipeline(schema, policy, store);
const result = pipeline.ingest(records);

console.log(result.summary.verdict);
// { disposition: 'approve', reasons: [], warnings: [], ... }
```

## Codici di uscita

| Codice | Significato |
|------|---------|
| 0 | Successo |
| 1 | Batch in quarantena |
| 2 | Regressione della calibrazione |
| 3 | Verdetto in modalità di test modificato |
| 10 | Errore di configurazione |
| 11 | File mancante |
| 12 | Errore di validazione |

## Documentazione

- [Guida rapida](docs/QUICKSTART.md) — Prima esecuzione completa
- [Politiche](docs/POLICIES.md) — Leggi, ereditarietà, ciclo di vita
- [Calibrazione](docs/CALIBRATION.md) — Set di riferimento e regressioni
- [Revisione](docs/REVIEW.md) — Coda e ricevute di sovrascrittura
- [Onboarding](docs/ONBOARDING.md) — Modello di prova della fonte
- [Artefatti](docs/ARTIFACTS.md) — Evidenze delle decisioni
- [Glossario](docs/GLOSSARY.md) — Termini e concetti

## Sicurezza

Datagates opera **solo localmente**. Legge e scrive file all'interno della directory del tuo progetto: configurazioni JSON, un database SQLite e artefatti delle decisioni. Non effettua chiamate di rete, non raccoglie dati di telemetria e non gestisce credenziali. Consulta [SECURITY.md](SECURITY.md) per il modello di minaccia completo e le istruzioni per la segnalazione.

## Licenza

MIT

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
