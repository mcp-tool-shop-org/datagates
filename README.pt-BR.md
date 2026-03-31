<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/datagates/readme.png" width="400" alt="datagates" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/datagates/actions"><img src="https://github.com/mcp-tool-shop-org/datagates/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mcp-tool-shop-org/datagates/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/datagates/"><img src="https://img.shields.io/badge/docs-landing%20page-blue" alt="Landing Page" /></a>
</p>

Sistema de promoção de dados governado. Os dados ganham confiança através de camadas de validação, e não por meio de limpeza silenciosa.

## O que ele faz

O Datagates trata a limpeza de conjuntos de dados como um **problema de promoção**. Os registros não se tornam confiáveis simplesmente por passarem por um código; eles se tornam confiáveis ao obterem a aprovação sob leis explícitas, versionadas e auditáveis.

Quatro camadas de confiança, cada uma com seu próprio filtro:

| Camada | Filtro | O que ele detecta |
|-------|------|-----------------|
| **Row trust** | Validação de esquema, normalização, remoção exata de duplicatas | Estrutura incorreta, valores inválidos, duplicatas |
| **Semantic trust** | Regras entre campos, detecção de duplicatas próximas | Contradições, duplicatas aproximadas, nível de confiança |
| **Batch trust** | Métricas, detecção de desvio, sobreposição com o conjunto de teste | Desvio de distribuição, vazamento do conjunto de teste, contaminação da fonte |
| **Governance trust** | Registro de políticas, calibração, modo de teste, substituições | Alterações de políticas não testadas, exceções silenciosas, fontes não verificadas |

Cada decisão de quarentena inclui motivos explícitos. Cada substituição requer um comprovante durável. Cada decisão em lote pode ser reconstruída a partir de seus artefatos.

## Instalação

```bash
npm install datagates
```

## Início rápido

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

## Comandos da linha de comando (CLI)

| Comando | Descrição |
|---------|-------------|
| `datagates init` | Inicializa um projeto com configuração, esquema, política e conjunto de referência (gold set) |
| `datagates run` | Importa um lote, executa todos os filtros e emite o veredicto |
| `datagates calibrate` | Executa o conjunto de referência, mede FP/FN/F1 e detecta regressões |
| `datagates shadow` | Compara a política ativa com a política candidata sem afetar os dados |
| `datagates review` | Lista, confirma, rejeita ou substitui itens em revisão |
| `datagates source` | Registra, inspeciona, ativa ou suspende fontes de dados |
| `datagates artifact` | Exporta ou inspeciona os artefatos das decisões em lote |
| `datagates promote-policy` | Ativa uma política somente após a calibração ser concluída |
| `datagates packs` | Lista os pacotes de políticas iniciais disponíveis |

## Pacotes de políticas

Comece com um pacote de políticas pré-definido em vez de criar a governança do zero:

- **strict-structured** — Limites rígidos para dados estruturados limpos
- **text-dedupe** — Detecção agressiva de duplicatas próximas para conjuntos de dados de texto
- **classification-basic** — Detecção de desvio de rótulos e desaparecimento de classes
- **source-probation-first** — Ingestão conservadora de várias fontes com recuperação parcial

```bash
npx datagates init --pack strict-structured
```

## Arquitetura de três zonas

```
Raw (immutable) --> Candidate --> Approved
                        |
                    Quarantine
```

- **Raw (Bruta)**: entrada imutável, nunca modificada
- **Candidate (Candidata)**: linha aprovada nos filtros de nível de linha, aguardando o veredicto do lote
- **Approved (Aprovada)**: promovida após a aprovação nos filtros de nível de lote
- **Quarantine (Quarentena)**: falhou em um ou mais filtros, com motivos explícitos

## API programática

```typescript
import { Pipeline, ZoneStore } from 'datagates';

const store = new ZoneStore('datagates.db');
const pipeline = new Pipeline(schema, policy, store);
const result = pipeline.ingest(records);

console.log(result.summary.verdict);
// { disposition: 'approve', reasons: [], warnings: [], ... }
```

## Códigos de saída

| Código | Significado |
|------|---------|
| 0 | Sucesso |
| 1 | Lote em quarentena |
| 2 | Regressão na calibração |
| 3 | Veredicto de teste alterado |
| 10 | Erro de configuração |
| 11 | Arquivo ausente |
| 12 | Erro de validação |

## Documentação

- [Início rápido](docs/QUICKSTART.md) — Primeira execução completa
- [Políticas](docs/POLICIES.md) — Leis, herança, ciclo de vida
- [Calibração](docs/CALIBRATION.md) — Conjuntos de referência e regressões
- [Revisão](docs/REVIEW.md) — Fila e recibos de substituição
- [Integração](docs/ONBOARDING.md) — Modelo de período de teste da fonte
- [Artefatos](docs/ARTIFACTS.md) — Evidências da decisão
- [Glossário](docs/GLOSSARY.md) — Termos e conceitos

## Segurança

O Datagates opera **localmente apenas**. Ele lê e grava arquivos dentro do diretório do seu projeto — configurações JSON, um banco de dados SQLite e artefatos de decisão. Ele não faz chamadas de rede, não coleta telemetria e não lida com credenciais. Consulte [SECURITY.md](SECURITY.md) para obter o modelo de ameaças completo e as instruções de relatório.

## Licença

MIT

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
