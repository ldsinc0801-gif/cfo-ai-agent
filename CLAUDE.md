# AI CFO - 開発ガイド

## プロジェクト概要

中小企業向けの経営管理AIエージェント。freee APIから会計データを取得し、AIが経営分析・仕訳生成・レポート作成を行う。

## 技術スタック

- **言語**: TypeScript 5.9（strict mode）
- **ランタイム**: Node.js + tsx
- **Web**: Express 5（サーバーサイドレンダリング）
- **DB**: Supabase（PostgreSQL）/ JSONファイル（フォールバック）
- **認証**: Google OAuth 2.0 + express-session
- **テスト**: Vitest

## AIプロバイダー

| AI | 用途 |
|---|---|
| **GPT（OpenAI）** | チャット対話（経営相談） |
| **Gemini（Google）** | 会計AI（レシート・PDF・CSV・動画 → 仕訳生成） |
| **Claude（Anthropic）** | 計画分析（差分分析・学習ループ） |

## 起動方法

```bash
npm run web              # Webサーバー起動（http://localhost:3000）
npm run dev -- --mock    # CLIレポート生成（モックデータ）
npm test                 # テスト実行
npm run build            # TypeScriptコンパイル
```

## ディレクトリ構成

```
src/
├── web/            # Expressサーバー + ページレンダラー（SSR）
│   ├── server.ts          # ルーティング、認証、APIハンドラ
│   ├── shared.ts          # サイドバー、共通CSS、レイアウト
│   ├── login-page.ts      # Googleログイン画面
│   ├── dashboard-renderer.ts  # ダッシュボード
│   ├── chat-page.ts       # AIチャット
│   ├── task-page.ts       # タスクボード
│   ├── accounting-page.ts # 会計AI
│   ├── plan-renderer.ts   # 事業計画AI
│   ├── rating-page.ts     # 財務分析・銀行評価
│   ├── secretary-page.ts  # 秘書AI
│   ├── agent-pages.ts     # 各AIエージェント共通
│   └── history-page.ts    # 分析履歴
│
├── services/       # ビジネスロジック（シングルトンクラス）
│   ├── receipt-service.ts         # Gemini AI 仕訳生成
│   ├── chat-service.ts            # チャット履歴・AI応答
│   ├── anthropic-service.ts       # Claude/Gemini 財務分析
│   ├── learning-service.ts        # 学習ループ（パターン検出）
│   ├── journal-learning-service.ts # 仕訳修正学習
│   ├── plan-analysis-service.ts   # 事業計画分析
│   ├── plan-extract-service.ts    # 計画データ抽出
│   ├── task-service.ts            # タスクCRUD
│   ├── secretary-service.ts       # 書類作成
│   ├── freee-service.ts           # freeeデータ集約
│   ├── demo-mode.ts               # デモモード管理
│   ├── usage-tracker.ts           # API使用量追跡
│   └── analysis-store.ts          # 分析結果キャッシュ
│
├── clients/        # 外部API接続
│   ├── freee-api.ts       # freee REST API
│   ├── freee-auth.ts      # freee OAuth 2.0
│   ├── google-tasks.ts    # Google Tasks API
│   ├── google-gmail.ts    # Gmail API
│   └── supabase.ts        # Supabaseクライアント
│
├── repositories/   # データ永続化
│   └── supabase-repository.ts  # Supabase CRUD（users, chat, 実績等）
│
├── domain/         # ドメインロジック（純粋関数）
│   ├── accounting/    # PL/BS解析、月次比較、異常検知
│   ├── finance/       # 財務指標（収益性、安全性）
│   ├── cashflow/      # 資金繰り分析
│   └── banking/       # 銀行評価・スコアリング
│
├── evaluators/     # 経営評価（5段階判定）
├── reports/        # レポートビルダー（JSON/Markdown出力）
├── commentary/     # AI経営コメンタリー生成
├── config/         # 設定（勘定科目ルール、タスクテンプレート）
├── types/          # TypeScript型定義
├── prompts/        # AIプロンプトテンプレート
├── utils/          # ユーティリティ（ロガー、フォーマット）
├── cli/            # CLIエントリーポイント
└── demo-data.ts    # デモ用データ生成
```

```
tests/
├── fixtures/       # モックデータ（mock-data.ts, mock-trend.ts等）
└── unit/           # ユニットテスト（accounting/, finance/, evaluators/等）
```

## 主要なWebルート

| パス | 機能 |
|---|---|
| `/` | ダッシュボード（売上・利益推移、KPI） |
| `/chat` | AIチャット（GPT） |
| `/tasks` | タスクボード（Google Tasks連携） |
| `/agent/finance` | 財務分析AI（銀行評価） |
| `/plan` | 事業計画AI（目標vs実績） |
| `/agent/accounting` | 会計AI（仕訳自動生成） |
| `/agent/funding` | 資金調達AI |
| `/agent/secretary` | 秘書AI（書類作成） |
| `/login` | Googleログイン |
| `/settings/company` | 事業所選択・デモモード |

## Supabaseテーブル

| テーブル | 内容 |
|---|---|
| `users` | ユーザー管理（Google認証連携、RLS有効） |
| `chat_messages` | チャット履歴 |
| `company_memory` | 企業メモリ（業種・社名等） |
| `monthly_actuals` | 月次実績（PL/BS） |
| `monthly_targets` | 月次目標 |
| `plan_analyses` | 計画分析結果 |
| `learning_insights` | AI学習インサイト |
| `journal_corrections` | 仕訳修正ログ |
| `industry_rules` | 業種別仕訳ルール |

全テーブルに `user_id` カラムあり（将来のマルチテナント対応用）。

## 認証フロー

1. 未ログイン → `/login` にリダイレクト
2. 「Googleでログイン」→ Google OAuth（openid email profile）
3. コールバック → Supabaseの`users`テーブルにupsert → セッション保存
4. セッション: express-session（7日間有効）
5. 認証不要パス: `/login`, `/auth/login/*`, `/api/*`

## コーディング規約

### インポート

```typescript
// .js拡張子必須（Node16モジュール解決）
import { receiptService } from '../services/receipt-service.js';
import type { FullReport } from '../types/report.js';
```

### サービスパターン

```typescript
// クラス定義 + シングルトンexport
export class ReceiptService {
  async analyzeReceiptImage(...): Promise<ReceiptAnalysis> { ... }
}
export const receiptService = new ReceiptService();
```

### ページレンダリング（SSR）

```typescript
// HTML文字列を返す関数
export function renderPageHTML(data: Data): string {
  return `<!DOCTYPE html><html>...</html>`;
}

// server.tsのルートで呼び出し
app.get('/page', (req, res) => {
  res.send(renderPageHTML(data));
});
```

### データフロー

```
freee API → FreeeService → ReportBuilder → FullReport
                                              ↓
                              renderDashboardHTML() → res.send()
```

### エラーハンドリング

- freee API: 401自動リトライ（トークンリフレッシュ）
- Supabase: 失敗時はJSONファイルにフォールバック
- AI API: try/catchでエラーメッセージをUIに表示

### ロガー

```typescript
import { logger } from '../utils/logger.js';
logger.info('正常処理');
logger.warn('回復可能なエラー');
logger.error('致命的エラー', error);
```

## デモモード

freee APIやAI APIなしで全機能をデモ実演できる。

- 3つのプロファイル: consulting（IT）/ restaurant（飲食）/ construction（建設）
- 有効化: `/settings/company` からデモ開始
- データ: `src/demo-data.ts` + `tests/fixtures/mock-data.ts`

## 環境変数（.env）

| 変数 | 必須 | 用途 |
|---|---|---|
| `ANTHROPIC_API_KEY` | △ | Claude API（計画分析） |
| `OPENAI_API_KEY` | △ | GPT API（チャット） |
| `GEMINI_API_KEY` | △ | Gemini API（会計AI） |
| `FREEE_CLIENT_ID / SECRET` | △ | freee OAuth |
| `FREEE_REDIRECT_URI` | △ | freeeコールバック |
| `GOOGLE_CLIENT_ID / SECRET` | △ | Google OAuth |
| `GOOGLE_LOGIN_REDIRECT_URI` | △ | ログインコールバック |
| `SUPABASE_URL / ANON_KEY` | △ | Supabase接続 |
| `SESSION_SECRET` | × | セッション暗号化（自動生成可） |
| `PORT` | × | サーバーポート（デフォルト3000） |

△ = 該当機能を使う場合に必要。デモモードなら全てなしで動作。

## キャッシュ

- freee APIレスポンス: 5分TTLのインメモリキャッシュ（server.ts）
- 事業所変更・デモモード切替時にキャッシュクリア

## セキュリティ

- `.env` は `.gitignore` で除外済み
- `data/`（トークンファイル）も `.gitignore` で除外
- Cookie: httpOnly, sameSite=lax
- CORS: 全オリジン許可（企業AI OS連携用）
