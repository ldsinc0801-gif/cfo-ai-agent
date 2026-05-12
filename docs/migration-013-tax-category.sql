-- ============================================================
-- Migration 013: 仕訳に税区分カラムを追加
--
-- これまで税率（10/8/0）だけを保持していたが、freee や弥生の仕訳形式に
-- 合わせて「課対仕入10%」「課税売上10%」のような税区分名を保存する。
-- 既存データは tax_rate から推定して自動補完する。
-- ============================================================

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS tax_category TEXT;

-- 既存データの自動補完（借方科目に「売上」が含まれるかで売上/仕入を判定）
UPDATE journal_entries
SET tax_category = CASE
  WHEN debit_account LIKE '%売上%' AND tax_rate = 10 THEN '課税売上10%'
  WHEN debit_account LIKE '%売上%' AND tax_rate = 8  THEN '課税売上8%(軽)'
  WHEN debit_account LIKE '%売上%' AND tax_rate = 0  THEN '非課売上'
  WHEN tax_rate = 10 THEN '課対仕入10%'
  WHEN tax_rate = 8  THEN '課対仕入8%(軽)'
  WHEN tax_rate = 0  THEN '対象外'
  ELSE '対象外'
END
WHERE tax_category IS NULL;

-- 以降のINSERTは必ず指定すべきだが NOT NULL は将来のリリースで切り替える
COMMENT ON COLUMN journal_entries.tax_category IS
  '税区分名（freee/弥生互換）。例: 課対仕入10%, 課税売上10%, 対象外, 不課税 など。NULLは旧データ。';
