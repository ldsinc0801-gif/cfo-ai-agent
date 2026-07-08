-- migration-022: ロカベン6指標で選択した業種・事業規模を保存する列
-- 事業計画AIの「ロカベン6指標 業種別ベンチマーク」で一度選んだ業種(大/小分類)・
-- 事業規模を記憶し、次回以降も自動で復元する（毎回選び直す手間をなくす）。
ALTER TABLE tenant_profile
  ADD COLUMN IF NOT EXISTS locaben_major text,
  ADD COLUMN IF NOT EXISTS locaben_minor text,
  ADD COLUMN IF NOT EXISTS locaben_scale text;
