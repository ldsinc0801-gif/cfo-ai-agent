-- migration-018: 会社情報(tenant_profile)に資本金・インボイス登録年月日を追加
--
-- 適用: Supabase SQL Editor で実行。冪等（何度流しても安全）。

ALTER TABLE tenant_profile
  ADD COLUMN IF NOT EXISTS capital numeric,                 -- 資本金
  ADD COLUMN IF NOT EXISTS invoice_registered_date date;    -- インボイス(適格請求書発行事業者)登録年月日
