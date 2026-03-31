<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/datagates/readme.png" width="400" alt="datagates" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/datagates/actions"><img src="https://github.com/mcp-tool-shop-org/datagates/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mcp-tool-shop-org/datagates/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/datagates/"><img src="https://img.shields.io/badge/docs-landing%20page-blue" alt="Landing Page" /></a>
</p>

Système de promotion des données gouverné. Les données acquièrent la confiance grâce à des mécanismes de contrôle progressifs, et non par un nettoyage silencieux.

## Ce que cela fait

Datagates considère le nettoyage des ensembles de données comme un **problème de promotion**. Les enregistrements ne gagnent pas la confiance simplement en passant par un code ; ils gagnent la confiance en obtenant une promotion selon des règles explicites, versionnées et auditables.

Quatre niveaux de confiance, chacun avec sa propre étape de contrôle :

| Niveau | Étape de contrôle | Ce qu'il détecte |
|-------|------|-----------------|
| **Row trust** | Validation du schéma, normalisation, suppression exacte des doublons | Structures incorrectes, valeurs invalides, doublons |
| **Semantic trust** | Règles inter-champs, détection de quasi-doublons | Contradictions, quasi-doublons, niveau de confiance |
| **Batch trust** | Métriques, détection de dérive, chevauchement de l'ensemble de test | Déplacement de la distribution, fuite de l'ensemble de test, contamination de la source |
| **Governance trust** | Registre des politiques, calibrage, mode "ombre", remplacements | Modifications de politiques non testées, exceptions silencieuses, sources non vérifiées |

Chaque décision de mise en quarantaine inclut des raisons explicites. Chaque remplacement nécessite un accusé de réception permanent. Chaque décision par lot peut être reconstruite à partir de ses artefacts.

## Installation

```bash
npm install datagates
```

## Démarrage rapide

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

## Commandes de l'interface en ligne de commande (CLI)

| Commande | Description |
|---------|-------------|
| `datagates init` | Initialise un projet avec la configuration, le schéma, la politique et l'ensemble de référence (gold set) |
| `datagates run` | Importe un lot, exécute toutes les étapes de contrôle, émet le verdict |
| `datagates calibrate` | Exécute l'ensemble de référence, mesure les taux de faux positifs/négatifs/précision, détecte les régressions |
| `datagates shadow` | Compare la politique active à la politique candidate sans affecter les données |
| `datagates review` | Liste, confirme, rejette ou remplace les éléments en cours d'examen |
| `datagates source` | Enregistre, inspecte, active ou suspend les sources de données |
| `datagates artifact` | Exporte ou inspecte les artefacts des décisions par lot |
| `datagates promote-policy` | Active une politique uniquement après que le calibrage a réussi |
| `datagates packs` | Liste les ensembles de politiques de démarrage disponibles |

## Ensembles de politiques

Commencez avec un ensemble de politiques préconfiguré au lieu de créer une gouvernance à partir de zéro :

- **strict-structured** — Seuils stricts pour les données structurées propres
- **text-dedupe** — Détection agressive des quasi-doublons pour les ensembles de données textuels
- **classification-basic** — Détection de la dérive des étiquettes et de la disparition des classes
- **source-probation-first** — Importation conservatrice de sources multiples avec une récupération partielle

```bash
npx datagates init --pack strict-structured
```

## Architecture en trois zones

```
Raw (immutable) --> Candidate --> Approved
                        |
                    Quarantine
```

- **Brut (Raw)** : entrée immuable, jamais modifiée
- **Candidat (Candidate)** : lignes ayant passé les étapes de contrôle au niveau de la ligne, en attente du verdict par lot
- **Approuvé (Approved)** : promu après avoir passé les étapes de contrôle au niveau du lot
- **Quarantaine (Quarantine)** : a échoué à une ou plusieurs étapes de contrôle, avec des raisons explicites

## API programmatique

```typescript
import { Pipeline, ZoneStore } from 'datagates';

const store = new ZoneStore('datagates.db');
const pipeline = new Pipeline(schema, policy, store);
const result = pipeline.ingest(records);

console.log(result.summary.verdict);
// { disposition: 'approve', reasons: [], warnings: [], ... }
```

## Codes de sortie

| Code | Signification |
|------|---------|
| 0 | Succès |
| 1 | Lot mis en quarantaine |
| 2 | Régression du calibrage |
| 3 | Verdict du mode "ombre" modifié |
| 10 | Erreur de configuration |
| 11 | Fichier manquant |
| 12 | Erreur de validation |

## Documentation

- [Démarrage rapide](docs/QUICKSTART.md) — Première exécution complète
- [Politiques](docs/POLICIES.md) — Règles, héritage, cycle de vie
- [Calibrage](docs/CALIBRATION.md) — Ensembles de référence et régressions
- [Examen](docs/REVIEW.md) — File d'attente et accusés de réception de remplacement
- [Intégration](docs/ONBOARDING.md) — Modèle de probation de la source
- [Artefacts](docs/ARTIFACTS.md) — Preuves de décision
- [Glossaire](docs/GLOSSARY.md) — Termes et concepts

## Sécurité

Datagates fonctionne **uniquement localement**. Il lit et écrit des fichiers dans le répertoire de votre projet : configurations JSON, une base de données SQLite et des artefacts de décision. Il ne fait aucun appel réseau, ne collecte aucune télémétrie et ne gère aucune identité. Consultez [SECURITY.md](SECURITY.md) pour le modèle de menace complet et les instructions de signalement.

## Licence

MIT

---

Conçu par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
