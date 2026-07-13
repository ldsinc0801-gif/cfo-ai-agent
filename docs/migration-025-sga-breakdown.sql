-- migration-025: 販管費（販売費及び一般管理費）の科目別内訳をテナント単位で保存する
--
-- 月次推移試算表(CSV)には販管費の科目別内訳（役員報酬・地代家賃・広告宣伝費…）が
-- 「期間残高」列に含まれるが、monthly_actuals は販管費を sga_expenses の合計1本でしか
-- 保持していなかった。決算書ビューアで内訳を表示するため、会計年度ごとの内訳(JSON)を
-- tenant_profile に保存する（テナント分離＋永続化。annual_kpi と同じ方式）。
--
-- 形式: { "<期末年>": [ { "name": "役員報酬", "amount": 12000000 }, ... ], ... }
ALTER TABLE tenant_profile
  ADD COLUMN IF NOT EXISTS sga_breakdown jsonb;
