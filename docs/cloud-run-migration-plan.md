# CFO: Railway → Cloud Run 移行計画（後日実施）

**決定日**: 2026-07-08 ／ **状態**: 計画のみ（着手は後日）／ **目的**: ホスティング原価の削減 + ユーザーが Cloud Run を好む

> 着手する人へ: このファイルを最初に読めば移行の全体像と“やること”が分かる。
> AI Ledger が既に同じ GCP プロジェクトで Cloud Run 運用中なので、その構成を踏襲する。

## ゴール

- CFO(Express) を Railway から **Google Cloud Run** へ移す。
  - GCP プロジェクト: `cfo-ai-493809`（AI Ledger と同じ）／ region: `asia-northeast1`
- 低トラフィックなら Cloud Run 無料枠でホスティング ≈ ¥0 を狙う（Railway 常時起動の月額を削減）。
- **Supabase Pro（$25/月）は据え置き**（auto-pause しない＝停止リスクなし）。DB 移行はしない。
- ※ 原価の本丸は AI API 変動費。別途「AI モデル最適化」タスクで対応（`CHAT_MODEL`/`GEMINI_MODEL`/`AI_PROVIDER` が env で切替可）。

## 前提：CFO は現状ステートレスではない → 先に“ステートレス化”が必須

Cloud Run はゼロスケール＋複数インスタンス＋**完全揮発ディスク**。以下がそのままでは壊れるので移行前に外部ストアへ移す。

| # | 現状（ローカル依存） | 該当コード | 移行先 |
|---|---|---|---|
| 1 | セッション（MemoryStore） | `src/web/server.ts:125` 付近（`DATABASE_URL` があれば Postgres 永続化に対応済） | **DATABASE_URL に Supabase Direct 接続を設定**して Postgres セッションに切替（コードは対応済、env 設定だけ） |
| 2 | Gmail OAuth トークン `data/google-token.json` | `src/clients/google-gmail.ts:6,51` | Supabase のテーブル or GCS に保存するよう改修 |
| 3 | 事業計画 KPI `data/plans/annual-kpi.json` | `src/web/plan-renderer.ts:29,50` | Supabase テーブル化（**tenant_id スコープ必須**） |
| 4 | 秘書AIテンプレート `data/secretary/templates` | `src/services/secretary-service.ts:10` | GCS or Supabase Storage |
| 5 | アップロード `uploads/` | `src/web/server.ts:691` | GCS（AI Ledger の GCS 直アップロード方式を流用可） |
| 6 | GCP鍵を tmp に書く | `src/config/index.ts:12`（`GOOGLE_APPLICATION_CREDENTIALS_JSON`） | Cloud Run のビルトイン SA（ADC）に切替、ファイル書き出しを廃止 |

その他:
- **PORT**: `src/web/server.ts:68` は `process.env.PORT || 3000`、`app.listen(PORT)` は 0.0.0.0 バインド → **Cloud Run(8080) 対応済み・改修不要**。
- **コールドスタート**: 数秒許容。`--cpu-boost` を付ける。低トラフィック用に `min-instances=0`。
- **Dockerfile**: `CMD ["npx","tsx","src/web/server.ts"]`。Cloud Run でもそのまま使える（EXPOSE は無視されるが害なし）。

## デプロイ構成（AI Ledger 踏襲）

- GitHub `ldsinc0801-gif/cfo-ai-agent` の main push → **Cloud Build trigger** → Cloud Run `cfo-ai`（新規サービス名）へ自動デプロイ。
- もしくは初回は `gcloud run deploy cfo-ai --source . --project=cfo-ai-493809 --region=asia-northeast1`。

## 環境変数（Railway → Cloud Run / Secret Manager へ移送）

`.env.example` 準拠。秘匿値は Secret Manager 推奨:
`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `DATABASE_URL`(セッション用に新規設定) / `SESSION_SECRET` /
`OPENAI_API_KEY` / `CHAT_MODEL` / `GEMINI_API_KEY` / `GEMINI_MODEL` / `ANTHROPIC_API_KEY` / `AI_PROVIDER` /
`FREEE_CLIENT_ID` / `FREEE_CLIENT_SECRET` / `FREEE_REDIRECT_URI`(Cloud Run のURLに更新) / `FREEE_*TOKEN` / `FREEE_COMPANY_ID` /
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI`(URL更新) / `GOOGLE_LOGIN_REDIRECT_URI`(URL更新)

⚠️ freee / Google の **リダイレクトURIは新しい Cloud Run ドメインに合わせて各コンソールでも更新**すること。

## 進め方（推奨順）

1. ステートレス化 #1〜#6 を実装（セッションは env だけ、#2〜#5 が本体作業）
2. Cloud Run にステージングデプロイ（別サービス名）→ 動作確認（ログイン/セッション/Gmail/アップロード/秘書テンプレ）
3. freee/Google のリダイレクトURI を更新
4. 問題なければ本番切替。**Railway はしばらく残す**（切戻し用）→ 安定後に停止
5. 停止後、`infra-map.md`（ai-ledger リポジトリ）の CFO 行を「Cloud Run」に更新

## 参考

- AI Ledger の Cloud Run 運用: `~/Dropbox/claude共有/ai-ledger/`（HANDOFF.md / docs/infra-map.md）
