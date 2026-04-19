# AI CFO - 開発ガイド

## プロジェクト概要

中小企業向けのマルチテナント経営管理AIエージェント。freee APIから会計データを取得し、AIが経営分析・仕訳生成・レポート作成を行う。複数法人が1つのシステムを共有し、テナント単位でデータを完全分離する。

## 技術スタック

- **言語**: TypeScript 5.9（strict mode）
- **ランタイム**: Node.js + tsx
- **Web**: Express 5（サーバーサイドレンダリング）
- **DB**: Supabase（PostgreSQL）/ JSONファイル（フォールバック）
- **認証**: メールアドレス + パスワード（bcrypt）+ express-session
- **テスト**: Vitest

## 権限階層（4段階）

| ロール | 権限 |
|---|---|
| **超管理者** (`is_super_admin=true`) | テナント作成、財務管理者作成、全ユーザー管理、全パスワードリセット |
| **テナント財務管理者** (`financial_admin`) | 管理者招待、テナント内PWリセット、テナント切替可（複数テナント兼任可） |
| **テナント管理者** (`admin`) | 従業員追加、会計データ操作 |
| **テナント従業員** (`employee`) | 閲覧のみ |

超管理者はDBに直接INSERTで作成（UIからは作れない）。

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
│   ├── server.ts              # ルーティング、認証、APIハンドラ
│   ├── shared.ts              # サイドバー、テナント切替UI、共通CSS
│   ├── auth-middleware.ts     # 認証・権限チェックミドルウェア
│   ├── login-page.ts          # ログイン + パスワード変更画面
│   ├── users-page.ts          # ユーザー管理（テナント管理+メンバー管理統合）
│   ├── google-settings-page.ts # Google連携設定
│   ├── error-page.ts          # 統一エラーページ（400/401/403/404/500）
│   ├── dashboard-renderer.ts  # ダッシュボード
│   ├── chat-page.ts           # AIチャット
│   ├── task-page.ts           # タスクボード
│   ├── accounting-page.ts     # 会計AI
│   ├── plan-renderer.ts       # 事業計画AI
│   ├── rating-page.ts         # 財務分析・銀行評価
│   ├── secretary-page.ts      # 秘書AI
│   ├── agent-pages.ts         # 各AIエージェント共通レイアウト
│   └── history-page.ts        # 分析履歴
│
├── services/       # ビジネスロジック（シングルトンクラス）
│   ├── auth-service.ts            # 認証（ログイン、PW変更、ロック、テナント操作）
│   ├── receipt-service.ts         # Gemini AI 仕訳生成
│   ├── chat-service.ts            # チャット履歴・AI応答（TenantId対応）
│   ├── anthropic-service.ts       # Claude/Gemini 財務分析
│   ├── learning-service.ts        # 学習ループ（TenantId対応）
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
├── repositories/   # データ永続化（全クエリにTenantId必須）
│   └── supabase-repository.ts  # Supabase CRUD
│
├── domain/         # ドメインロジック（純粋関数）
│   ├── accounting/    # PL/BS解析、月次比較、異常検知
│   ├── finance/       # 財務指標（収益性、安全性）
│   ├── cashflow/      # 資金繰り分析
│   └── banking/       # 銀行評価・スコアリング
│
├── types/          # TypeScript型定義
│   └── auth.ts        # 認証型（TenantId Branded Type、ロール定義）
│
├── utils/          # ユーティリティ
│   ├── logger.ts      # ロガー
│   ├── password.ts    # bcryptハッシュ、パスワード強度チェック、初期PW生成
│   └── formatter.ts   # フォーマット
│
├── evaluators/     # 経営評価（5段階判定）
├── reports/        # レポートビルダー（JSON/Markdown出力）
├── commentary/     # AI経営コメンタリー生成
├── config/         # 設定（勘定科目ルール、タスクテンプレート）
├── prompts/        # AIプロンプトテンプレート
├── cli/            # CLIエントリーポイント
└── demo-data.ts    # デモ用データ生成
```

## 主要なWebルート

| パス | 機能 | 権限 |
|---|---|---|
| `/login` | メール+パスワードログイン | 不要 |
| `/auth/demo` | デモモードログイン | 不要 |
| `/auth/change-password` | パスワード変更（初回強制） | ログイン済み |
| `/` | ダッシュボード | ログイン済み |
| `/chat` | AIチャット（GPT） | ログイン済み |
| `/tasks` | タスクボード | ログイン済み |
| `/agent/finance` | 財務分析AI（銀行評価） | ログイン済み |
| `/plan` | 事業計画AI | ログイン済み |
| `/agent/accounting` | 会計AI（仕訳自動生成） | ログイン済み |
| `/agent/funding` | 資金調達AI | ログイン済み |
| `/agent/secretary` | 秘書AI（書類作成） | ログイン済み |
| `/settings/users` | ユーザー管理（テナント+メンバー） | admin以上 |
| `/settings/google` | Google連携設定（Gmail/Tasks） | ログイン済み |
| `/settings/company` | freee事業所設定・デモモード | ログイン済み |

## テナント管理API

| メソッド | パス | 権限 | 機能 |
|---|---|---|---|
| GET | `/api/tenants` | ログイン済み | テナント一覧 |
| POST | `/api/tenants` | 超管理者 | テナント作成 |
| POST | `/api/tenant/switch` | ログイン済み | テナント切替 |
| GET | `/api/tenant/current` | ログイン済み | 現在のテナント情報 |
| GET | `/api/tenant/members` | financial_admin以上 | メンバー一覧 |
| POST | `/api/tenant/invite` | admin以上 | メンバー招待 |
| POST | `/api/tenants/:id/financial-admin` | 超管理者 | 財務管理者追加 |
| POST | `/api/tenant/members/:id/reset-password` | financial_admin以上 | PWリセット |
| DELETE | `/api/tenant/members/:id` | admin以上 | メンバー削除 |

## Supabaseテーブル

| テーブル | 内容 | tenant_id |
|---|---|---|
| `tenants` | テナント（企業）管理 | - |
| `users` | ユーザー認証（メール+bcryptパスワード） | - |
| `tenant_members` | テナント所属・ロール（financial_admin/admin/employee） | FK |
| `invitations` | 招待管理（トークン、有効期限） | FK |
| `chat_messages` | チャット履歴 | NOT NULL |
| `company_memory` | 企業メモリ（テナントごと1件） | UNIQUE |
| `monthly_actuals` | 月次実績（PL/BS） | NOT NULL |
| `monthly_targets` | 月次目標 | NOT NULL |
| `plan_analyses` | 計画分析結果 | NOT NULL |
| `learning_insights` | AI学習インサイト | NOT NULL |
| `journal_corrections` | 仕訳修正ログ | NOT NULL |
| `industry_rules` | 業種別仕訳ルール | NULL許容（NULL=共通） |

全データテーブルに `tenant_id` カラムあり。リポジトリ層は Branded Type `TenantId` で渡し忘れをコンパイルエラーにする。

## 認証フロー

1. 未ログイン → `/login` にリダイレクト
2. メールアドレス + パスワードでログイン（bcrypt照合）
3. ブルートフォース対策: 5回失敗で15分ロック
4. 初回ログイン時 → `/auth/change-password` に強制リダイレクト
5. セッション: express-session（7日間有効、`activeTenantId` + `activeTenantRole` 保持）
6. 認証不要パス: `/login`, `/auth/*`, `/api/*`（APIは個別にミドルウェアで保護）
7. Google連携: ログイン目的では使わない。Gmail/Tasks連携専用（`/settings/google`）

## 超管理者の作成方法

```bash
# 1. bcryptハッシュを生成
node -e "const bcrypt=require('bcrypt');bcrypt.hash('YourPassword123',10).then(console.log)"

# 2. Supabase SQL EditorでINSERT
INSERT INTO users (email, name, password_hash, must_change_password, is_super_admin)
VALUES ('admin@example.com', '管理者名', '$2b$10$...ハッシュ値...', false, true);
```

## 権限チェックミドルウェア

```typescript
import { requireRole, requireSuperAdmin, requireTenant, getActiveTenantId } from './auth-middleware.js';

// 宣言的に権限を指定
app.get('/admin-only', requireSuperAdmin, handler);
app.get('/data', requireRole('admin'), handler);      // admin以上
app.get('/view', requireRole('employee'), handler);    // 全ロール
app.post('/finance', requireRole('financial_admin'), handler);
```

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
// TenantIdを受け取るメソッドはオプショナル引数（デモモード対応）
export class ChatService {
  async sendMessage(msg: string, tenantId?: TenantId): Promise<ChatResponse> { ... }
}
export const chatService = new ChatService();
```

### リポジトリ層（Branded Type強制）

```typescript
import type { TenantId } from '../types/auth.js';

// TenantIdを渡さないとコンパイルエラー（素のstringも不可）
export async function getChatHistory(tenantId: TenantId, limit: number): Promise<ChatMessage[]> { ... }
```

### エラーハンドリング

- freee API: 401自動リトライ（トークンリフレッシュ）
- Supabase: 失敗時はJSONファイルにフォールバック
- AI API: try/catchでエラーメッセージをUIに表示
- 画面アクセスのエラー: 統一エラーページ（`error-page.ts`）
- APIエラー: JSON形式 `{ error: "メッセージ" }`
- フロントエンド: トースト通知（`window.__toast(msg, type)`）

## デモモード

freee APIやAI APIなしで全機能をデモ実演できる。

- 3つのプロファイル: consulting（IT）/ restaurant（飲食）/ construction（建設）
- 有効化: `/auth/demo` またはログイン画面の「デモ版を試す」ボタン
- デモ時のセッション: `activeTenantId='demo-tenant'`, `activeTenantRole='financial_admin'`
- データ: `src/demo-data.ts` + `tests/fixtures/mock-data.ts`

## 環境変数（.env）

| 変数 | 必須 | 用途 |
|---|---|---|
| `SUPABASE_URL` | o | Supabase接続URL |
| `SUPABASE_ANON_KEY` | o | Supabase公開APIキー |
| `SESSION_SECRET` | × | セッション暗号化（自動生成可） |
| `PORT` | × | サーバーポート（デフォルト3000） |
| `ANTHROPIC_API_KEY` | △ | Claude API（計画分析） |
| `OPENAI_API_KEY` | △ | GPT API（チャット） |
| `GEMINI_API_KEY` | △ | Gemini API（会計AI） |
| `FREEE_CLIENT_ID / SECRET` | △ | freee OAuth |
| `GOOGLE_CLIENT_ID / SECRET` | △ | Google連携（Gmail/Tasks用、ログインには不使用） |

o = 必須、△ = 該当機能使用時、× = 任意。デモモードならSupabase設定のみで動作。

## セキュリティ

- `.env` は `.gitignore` で除外済み
- `data/`（トークンファイル）も `.gitignore` で除外
- パスワード: bcrypt（salt rounds=10）でハッシュ化
- ブルートフォース対策: 5回失敗→15分ロック
- Cookie: httpOnly, sameSite=lax
- 初期パスワード: 画面表示で運用（平文をDBに保存しない、ログに出力しない）
- テナント分離: アプリ側フィルタ（WHERE tenant_id = ?）が主、RLSは将来導入
