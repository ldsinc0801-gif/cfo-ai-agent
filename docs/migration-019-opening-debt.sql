-- migration-019: 期首（前期末）有利子負債を保存する列を追加
-- 決算書BSの前期列から期首借入金残高を取得し、期末残高との差から
-- 年間返済元本を自動推定するために使用する。
ALTER TABLE monthly_actuals
  ADD COLUMN IF NOT EXISTS opening_interest_bearing_debt numeric;
