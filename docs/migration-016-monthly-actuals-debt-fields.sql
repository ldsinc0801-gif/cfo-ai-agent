-- migration-016: monthly_actuals に銀行評価用の追加項目を追加
--
-- 目的:
--   取り込みデータ(決算書/試算表)から、債務償還年数・借入依存度などの
--   銀行評価指標を正確に算出できるようにする。これらは有利子負債・当期純利益・
--   減価償却費・支払利息が必要で、いずれも決算書に載っているが従来は保存して
--   いなかった。
--
-- 適用: Supabase SQL Editor で実行。冪等（何度流しても安全）。

ALTER TABLE monthly_actuals
  ADD COLUMN IF NOT EXISTS interest_bearing_debt numeric NOT NULL DEFAULT 0, -- 有利子負債
  ADD COLUMN IF NOT EXISTS net_income            numeric NOT NULL DEFAULT 0, -- 当期純利益
  ADD COLUMN IF NOT EXISTS depreciation          numeric NOT NULL DEFAULT 0, -- 減価償却費
  ADD COLUMN IF NOT EXISTS interest_expense      numeric NOT NULL DEFAULT 0; -- 支払利息
