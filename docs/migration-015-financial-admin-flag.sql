-- migration-015: 財務管理者フラグを users に追加
--
-- 目的:
--   これまで「財務管理者」という身分は tenant_members(role='financial_admin')
--   の行としてしか存在せず、担当テナントが0だと一覧から消える／登録時に
--   先頭テナントを強制紐付けする、という問題があった。
--   users に is_financial_admin フラグを持たせ、身分をテナント紐付けから独立させる。
--
-- 適用: Supabase SQL Editor で実行。冪等（何度流しても安全）。

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_financial_admin boolean NOT NULL DEFAULT false;

-- 後方互換: 既存の財務管理者（financial_admin の有効なメンバー行を持つユーザー）にフラグを立てる
UPDATE users u
SET is_financial_admin = true
WHERE EXISTS (
  SELECT 1 FROM tenant_members m
  WHERE m.user_id = u.id
    AND m.role = 'financial_admin'
    AND m.is_active = true
);
