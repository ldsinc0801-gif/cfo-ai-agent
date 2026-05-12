-- ============================================================
-- Migration 009: テナントの決算月設定
--
-- 仕訳生成時、年が不明なレシート（月日のみ）に対して
-- 事業年度に基づいて適切な年を自動補完するために使用する。
--
-- 例: 5月期決算（fiscal_year_end_month = 5）
--   - 今日が 2026/05/12 → 当事業年度は 2025/06 〜 2026/05
--   - レシート「6月3日」→ 2025/06/03 と推定
--   - レシート「3月15日」→ 2026/03/15 と推定
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS fiscal_year_end_month INTEGER
    CHECK (fiscal_year_end_month BETWEEN 1 AND 12);

COMMENT ON COLUMN tenants.fiscal_year_end_month IS
  '決算月（1-12）。例: 5月期決算なら 5。年不明レシートの年補完に使用。NULL なら補完は今年で fallback。';
