-- ============================================================
-- Migration 015: テナントごとの「現在選択中の会計年度」を永続化
--
-- 会計AIページで会計年度を選択した値を保存。次回ログイン時にも
-- デフォルト表示として復元する。
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS active_fiscal_year INTEGER;

COMMENT ON COLUMN tenants.active_fiscal_year IS
  '会計AIで最後に選択された会計年度（決算月期末年）。NULLなら現在進行中の年度を自動算出。';
