import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'datagates',
  description: 'Governed data promotion system. Data earns trust through layered gates, not silent cleaning.',
  logoBadge: 'D',
  brandName: 'datagates',
  repoUrl: 'https://github.com/mcp-tool-shop-org/datagates',
  npmUrl: 'https://www.npmjs.com/package/datagates',
  footerText: 'MIT Licensed — built by <a href="https://github.com/mcp-tool-shop-org" style="color:var(--color-muted);text-decoration:underline">mcp-tool-shop-org</a>',

  hero: {
    badge: 'v1.0.0',
    headline: 'Data earns trust.',
    headlineAccent: 'Not silent cleaning.',
    description: 'Governed data promotion system. Four trust layers, explicit law, reproducible decisions. Every quarantine has a reason. Every override has a receipt.',
    primaryCta: { href: '#usage', label: 'Get started' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Install', code: 'npm install datagates' },
      { label: 'Init', code: 'npx datagates init --pack strict-structured' },
      { label: 'Run', code: 'npx datagates run --input data.json' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'Four Trust Layers',
      subtitle: 'Data passes through gates, not filters. Each layer catches what the previous one cannot.',
      features: [
        { title: 'Row Trust', desc: 'Schema validation, normalization, exact deduplication. Content-addressed IDs with dual hashing.' },
        { title: 'Semantic Trust', desc: 'Cross-field rules, near-duplicate detection (levenshtein, token jaccard, numeric, exact), confidence scoring.' },
        { title: 'Batch Trust', desc: 'Distribution drift, holdout overlap, source contamination, null rate spikes. Batch-level verdict system.' },
        { title: 'Governance Trust', desc: 'Policy registry with inheritance and lifecycle. Gold-set calibration, shadow mode, override receipts, source probation.' },
      ],
    },
    {
      kind: 'code-cards',
      id: 'usage',
      title: 'Usage',
      cards: [
        { title: 'CLI', code: '# Initialize a project\nnpx datagates init --name my-project\n\n# Ingest a batch\nnpx datagates run --input data.json\n\n# Calibrate against gold set\nnpx datagates calibrate\n\n# Compare policies\nnpx datagates shadow --input data.json' },
        { title: 'Programmatic', code: "import { Pipeline, ZoneStore } from 'datagates';\n\nconst store = new ZoneStore('datagates.db');\nconst pipeline = new Pipeline(schema, policy, store);\nconst result = pipeline.ingest(records);\n\nconsole.log(result.summary.verdict);" },
      ],
    },
  ],
};
