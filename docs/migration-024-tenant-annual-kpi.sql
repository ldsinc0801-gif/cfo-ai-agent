-- migration-024: 年間KPI目標をテナント単位で保存する
-- これまで年間KPI(売上目標・利益目標・従業員数・カスタムKPI)は data/plans/annual-kpi.json
-- という単一ファイルに保存され、全テナントで共有されていた（情報漏洩・上書きの原因）。
-- tenant_profile にテナントごとのJSONとして保存し、テナント分離＋永続化する。
ALTER TABLE tenant_profile
  ADD COLUMN IF NOT EXISTS annual_kpi jsonb;
