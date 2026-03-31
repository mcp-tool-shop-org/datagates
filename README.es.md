<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/datagates/readme.png" width="400" alt="datagates" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/datagates/actions"><img src="https://github.com/mcp-tool-shop-org/datagates/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mcp-tool-shop-org/datagates/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/datagates/"><img src="https://img.shields.io/badge/docs-landing%20page-blue" alt="Landing Page" /></a>
</p>

El sistema de promoción de datos está gobernado. Los datos ganan confianza a través de capas de validación, no mediante una limpieza silenciosa.

## ¿Qué hace?

Datagates considera la limpieza de conjuntos de datos como un **problema de promoción**. Los registros no se consideran confiables simplemente por pasar por un código; se consideran confiables porque obtienen una promoción bajo una ley explícita, versionada y auditable.

Cuatro capas de confianza, cada una con su propia puerta de validación:

| Capa | Puerta de validación | Qué detecta |
|-------|------|-----------------|
| **Row trust** | Validación de esquema, normalización, eliminación exacta de duplicados. | Estructura incorrecta, valores inválidos, duplicados. |
| **Semantic trust** | Reglas entre campos, detección de duplicados cercanos. | Contradicciones, duplicados difusos, nivel de confianza. |
| **Batch trust** | Métricas, detección de desviación, superposición con el conjunto de prueba. | Desviación de la distribución, fuga del conjunto de prueba, contaminación de la fuente. |
| **Governance trust** | Registro de políticas, calibración, modo de prueba, anulaciones. | Cambios de política no probados, excepciones silenciosas, fuentes no verificadas. |

Cada decisión de cuarentena incluye razones explícitas. Cada anulación requiere un recibo duradero. Cada decisión por lote se puede reconstruir a partir de sus artefactos.

## Instalación

```bash
npm install datagates
```

## Guía de inicio rápido

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

## Comandos de la línea de comandos (CLI)

| Comando | Descripción |
|---------|-------------|
| `datagates init` | Inicializa un proyecto con configuración, esquema, política y conjunto de referencia (gold set). |
| `datagates run` | Ingiere un lote, ejecuta todas las validaciones y emite el veredicto. |
| `datagates calibrate` | Ejecuta el conjunto de referencia, mide FP/FN/F1 y detecta regresiones. |
| `datagates shadow` | Compara la política activa con la candidata sin afectar los datos. |
| `datagates review` | Lista, confirma, rechaza o anula los elementos en revisión. |
| `datagates source` | Registra, inspecciona, activa o suspende las fuentes de datos. |
| `datagates artifact` | Exporta o inspecciona los artefactos de la decisión por lote. |
| `datagates promote-policy` | Activa una política solo después de que la calibración se haya completado con éxito. |
| `datagates packs` | Lista los paquetes de políticas iniciales disponibles. |

## Paquetes de políticas

Comienza con un paquete de políticas predefinido en lugar de inventar la gobernanza desde cero:

- **strict-structured**: Umbrales estrictos para datos estructurados limpios.
- **text-dedupe**: Detección agresiva de duplicados cercanos para conjuntos de datos de texto.
- **classification-basic**: Detección de deriva de etiquetas y desaparición de clases.
- **source-probation-first**: Ingesta conservadora de múltiples fuentes con recuperación parcial.

```bash
npx datagates init --pack strict-structured
```

## Arquitectura de tres zonas

```
Raw (immutable) --> Candidate --> Approved
                        |
                    Quarantine
```

- **Raw (Crudo)**: Entrada inmutable, nunca modificada.
- **Candidate (Candidato)**: Fila que ha pasado las validaciones de nivel de fila y está esperando el veredicto del lote.
- **Approved (Aprobado)**: Promovido después de pasar las validaciones de nivel de lote.
- **Quarantine (Cuarentena)**: Falló una o más validaciones, con razones explícitas.

## API programática

```typescript
import { Pipeline, ZoneStore } from 'datagates';

const store = new ZoneStore('datagates.db');
const pipeline = new Pipeline(schema, policy, store);
const result = pipeline.ingest(records);

console.log(result.summary.verdict);
// { disposition: 'approve', reasons: [], warnings: [], ... }
```

## Códigos de salida

| Código | Significado |
|------|---------|
| 0 | Éxito |
| 1 | Lote en cuarentena |
| 2 | Regresión de calibración |
| 3 | Veredicto de prueba cambiado |
| 10 | Error de configuración |
| 11 | Archivo faltante |
| 12 | Error de validación |

## Documentación

- [Guía de inicio rápido](docs/QUICKSTART.md) — Primera ejecución completa.
- [Políticas](docs/POLICIES.md) — Ley, herencia, ciclo de vida.
- [Calibración](docs/CALIBRATION.md) — Conjuntos de referencia y regresiones.
- [Revisión](docs/REVIEW.md) — Cola y recibos de anulación.
- [Incorporación](docs/ONBOARDING.md) — Modelo de prueba de fuente.
- [Artefactos](docs/ARTIFACTS.md) — Evidencia de decisión.
- [Glosario](docs/GLOSSARY.md) — Términos y conceptos.

## Seguridad

Datagates opera **únicamente de forma local**. Lee y escribe archivos dentro del directorio de tu proyecto: configuraciones JSON, una base de datos SQLite y artefactos de decisión. No realiza llamadas de red, no recopila telemetría ni maneja credenciales. Consulta [SECURITY.md](SECURITY.md) para obtener el modelo de amenazas completo y las instrucciones de notificación.

## Licencia

MIT

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
