-- migration-021: 固定資産明細（資産ごとの内訳）テーブル
-- 固定資産台帳から資産ごとの明細(資産名・取得価額・当期減価償却費・期末簿価)を保存する。
-- 担保余力・設備の実態としてAI分析に使い、財務分析AIに一覧表示する。
-- 減価償却費の合計はアプリ側で monthly_actuals.depreciation に反映する。
-- ※台帳は「全資産の一覧」なので、取り込み時は置き換え(全消去→全挿入)する。
CREATE TABLE IF NOT EXISTS fixed_asset_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  name text NOT NULL DEFAULT '資産',
  acquisition_cost numeric,
  depreciation numeric,
  book_value numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fixed_asset_details_tenant ON fixed_asset_details(tenant_id);
