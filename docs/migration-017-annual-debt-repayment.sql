-- migration-017: 年間返済元本（借入金の返済計画）を monthly_actuals に追加
--
-- 目的:
--   債務償還・返済負担の分析に使う「年間返済元本」は決算書には載っていないため、
--   ユーザーが手入力する。取込データと同じ月次テーブルに任意項目として保持する。
--
-- 適用: Supabase SQL Editor で実行。冪等（何度流しても安全）。

ALTER TABLE monthly_actuals
  ADD COLUMN IF NOT EXISTS annual_debt_repayment numeric; -- 年間返済元本（未入力なら NULL）
