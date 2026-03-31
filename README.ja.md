<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/datagates/readme.png" width="400" alt="datagates" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/datagates/actions"><img src="https://github.com/mcp-tool-shop-org/datagates/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mcp-tool-shop-org/datagates/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/datagates/"><img src="https://img.shields.io/badge/docs-landing%20page-blue" alt="Landing Page" /></a>
</p>

データ品質向上のための管理システム。データは、単なるクレンジングではなく、段階的な検証プロセスを経て信頼性を獲得します。

## 機能概要

Datagatesは、データセットのクレンジングを「品質向上」の問題として捉えます。レコードが信頼されるのは、コードを通過したからではなく、明確で、バージョン管理され、監査可能なルールに基づいて品質が向上したからにほかなりません。

信頼性の層は4つあり、それぞれに検証ゲートが設けられています。

| 層 | ゲート | 検証内容 |
|-------|------|-----------------|
| **Row trust** | スキーマ検証、正規化、完全な重複排除 | 不適切な構造、無効な値、重複 |
| **Semantic trust** | クロスフィールドルール、類似重複検出 | 矛盾、曖昧な重複、信頼度 |
| **Batch trust** | メトリクス、データドリフト検出、ホールドアウトデータとの比較 | データ分布の変化、テストデータへの不正なデータ混入、データソースの汚染 |
| **Governance trust** | ポリシー登録、キャリブレーション、シャドウモード、上書き | 未テストのポリシー変更、サイレントエラー、未検証のデータソース |

隔離されたデータに関するすべての判断には、明確な理由が記載されています。すべての上書きには、追跡可能な記録が必要です。バッチ処理のすべての判断は、関連する情報から再構築可能です。

## インストール

```bash
npm install datagates
```

## クイックスタート

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

## コマンドラインインターフェース (CLI) コマンド

| コマンド | 説明 |
|---------|-------------|
| `datagates init` | 設定ファイル、スキーマ、ポリシー、基準データセットを使用してプロジェクトを初期化します。 |
| `datagates run` | バッチデータをインポートし、すべての検証ゲートを実行し、結果を出力します。 |
| `datagates calibrate` | 基準データセットを実行し、誤検知/見逃し/適合率を測定し、性能劣化を検出します。 |
| `datagates shadow` | データに影響を与えずに、アクティブなポリシーと候補ポリシーを比較します。 |
| `datagates review` | レビュー項目を一覧表示、確認、却下、または上書きします。 |
| `datagates source` | データソースを登録、確認、有効化、または停止します。 |
| `datagates artifact` | バッチ処理の結果に関する情報をエクスポートまたは確認します。 |
| `datagates promote-policy` | キャリブレーションが完了した後にのみ、ポリシーを有効にします。 |
| `datagates packs` | 利用可能なポリシーパッケージの一覧を表示します。 |

## ポリシーパッケージ

最初からガバナンスを構築するのではなく、あらかじめ用意されたポリシーから始めることができます。

- **strict-structured**: 構造化されたデータの品質を厳密に評価します。
- **text-dedupe**: テキストデータセットに対して、類似重複を積極的に検出します。
- **classification-basic**: ラベルのずれやクラスの消失を検出します。
- **source-probation-first**: 複数のデータソースからのインポートにおいて、保守的なアプローチで、可能な範囲でデータを救出します。

```bash
npx datagates init --pack strict-structured
```

## 3つのゾーンを持つアーキテクチャ

```
Raw (immutable) --> Candidate --> Approved
                        |
                    Quarantine
```

- **Raw (生データ)**: 不変の入力データであり、変更されることはありません。
- **Candidate (候補データ)**: 行レベルの検証ゲートを通過したデータで、バッチ処理の結果を待機中です。
- **Approved (承認済みデータ)**: バッチレベルの検証ゲートを通過し、品質が向上したデータです。
- **Quarantine (隔離データ)**: 1つ以上の検証ゲートに失敗したデータで、その理由が明確に示されています。

## プログラムによるAPI

```typescript
import { Pipeline, ZoneStore } from 'datagates';

const store = new ZoneStore('datagates.db');
const pipeline = new Pipeline(schema, policy, store);
const result = pipeline.ingest(records);

console.log(result.summary.verdict);
// { disposition: 'approve', reasons: [], warnings: [], ... }
```

## 終了コード

| コード | 意味 |
|------|---------|
| 0 | 成功 |
| 1 | バッチが隔離されました |
| 2 | キャリブレーションの性能劣化 |
| 3 | シャドウモードでの判断が変更されました |
| 10 | 設定エラー |
| 11 | ファイルが見つかりません |
| 12 | 検証エラー |

## ドキュメント

- [クイックスタート](docs/QUICKSTART.md) — 最初の実行
- [ポリシー](docs/POLICIES.md) — ルール、継承、ライフサイクル
- [キャリブレーション](docs/CALIBRATION.md) — 基準データセットと性能劣化
- [レビュー](docs/REVIEW.md) — キューと上書きの記録
- [オンボーディング](docs/ONBOARDING.md) — データソースの試用期間モデル
- [成果物](docs/ARTIFACTS.md) — 意思決定の根拠
- [用語集](docs/GLOSSARY.md) — 用語と概念

## セキュリティ

Datagatesは、**ローカル環境でのみ動作します**。JSON設定ファイル、SQLiteデータベース、および意思決定に関する情報など、プロジェクトディレクトリ内のファイルのみを読み書きします。ネットワーク接続は一切行わず、テレメトリデータは収集せず、認証情報は扱いません。詳細については、[SECURITY.md](SECURITY.md) を参照してください。

## ライセンス

MIT

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>によって開発されました。
