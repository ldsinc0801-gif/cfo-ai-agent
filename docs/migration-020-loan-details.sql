-- migration-020: 借入明細（借入元ごとの内訳）テーブル
-- 借入を1件ずつ取り込む際に、借入先(熊本銀行/日本政策金融公庫等)・年間返済元本・
-- 残高・支払利息を1行ずつ保存する。合計はアプリ側で monthly_actuals.annual_debt_repayment
-- に反映し、財務分析・資金調達AIの入力に使う。
CREATE TABLE IF NOT EXISTS loan_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  lender text NOT NULL DEFAULT '借入先',
  annual_repayment numeric NOT NULL DEFAULT 0,
  balance numeric,
  interest numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loan_details_tenant ON loan_details(tenant_id);
