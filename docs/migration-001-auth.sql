-- ============================================================
-- Migration 001: 認証・マルチテナント基盤
-- 実行方法: Supabase SQL Editor で実行
-- ============================================================

-- ============================================================
-- Step 1: 既存データを全削除（本番データなし前提）
-- ============================================================

TRUNCATE TABLE journal_corrections CASCADE;
TRUNCATE TABLE learning_insights CASCADE;
TRUNCATE TABLE plan_analyses CASCADE;
TRUNCATE TABLE monthly_targets CASCADE;
TRUNCATE TABLE monthly_actuals CASCADE;
TRUNCATE TABLE company_memory CASCADE;
TRUNCATE TABLE chat_messages CASCADE;
TRUNCATE TABLE industry_rules CASCADE;
TRUNCATE TABLE users CASCADE;

-- ============================================================
-- Step 2: tenants テーブル作成
-- ============================================================

CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Step 3: users テーブル改修
-- ============================================================

-- 新カラム追加
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until          TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_token_expiry   TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ NOT NULL DEFAULT now();

-- password_hash を NOT NULL にする（既存データは削除済みなので安全）
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;

-- ============================================================
-- Step 4: tenant_members テーブル作成
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('financial_admin', 'admin', 'employee')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON tenant_members(tenant_id);

-- ============================================================
-- Step 5: invitations テーブル作成
-- ============================================================

CREATE TABLE IF NOT EXISTS invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('financial_admin', 'admin', 'employee')),
  invited_by      UUID NOT NULL REFERENCES users(id),
  token           TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at      TIMESTAMPTZ NOT NULL,
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);

-- ============================================================
-- Step 6: 既存データテーブルに tenant_id を追加
-- ============================================================

-- chat_messages
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- company_memory
ALTER TABLE company_memory ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- monthly_actuals
ALTER TABLE monthly_actuals ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- monthly_targets
ALTER TABLE monthly_targets ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- plan_analyses
ALTER TABLE plan_analyses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- learning_insights
ALTER TABLE learning_insights ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- journal_corrections
ALTER TABLE journal_corrections ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- industry_rules（NULL許容 = システム共通ルール）
ALTER TABLE industry_rules ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- ============================================================
-- Step 7: tenant_id を NOT NULL にする（industry_rules 以外）
-- ============================================================

ALTER TABLE chat_messages      ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE company_memory     ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE monthly_actuals    ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE monthly_targets    ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE plan_analyses      ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE learning_insights  ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE journal_corrections ALTER COLUMN tenant_id SET NOT NULL;
-- industry_rules は NULL 許容のまま（NULL = システム共通）

-- ============================================================
-- Step 8: ユニーク制約を tenant_id 込みに更新
-- ============================================================

-- monthly_actuals: (year, month) → (tenant_id, year, month)
ALTER TABLE monthly_actuals DROP CONSTRAINT IF EXISTS monthly_actuals_year_month_key;
ALTER TABLE monthly_actuals ADD CONSTRAINT monthly_actuals_tenant_year_month_key
  UNIQUE (tenant_id, year, month);

-- monthly_targets: 同様
ALTER TABLE monthly_targets DROP CONSTRAINT IF EXISTS monthly_targets_year_month_key;
ALTER TABLE monthly_targets ADD CONSTRAINT monthly_targets_tenant_year_month_key
  UNIQUE (tenant_id, year, month);

-- company_memory: tenant_id 単位でユニーク
ALTER TABLE company_memory DROP CONSTRAINT IF EXISTS company_memory_pkey;
ALTER TABLE company_memory ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE company_memory ADD CONSTRAINT company_memory_pkey PRIMARY KEY (id);
ALTER TABLE company_memory ADD CONSTRAINT company_memory_tenant_key UNIQUE (tenant_id);

-- ============================================================
-- Step 9: tenant_id 用インデックス追加
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant ON chat_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_monthly_actuals_tenant ON monthly_actuals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_monthly_targets_tenant ON monthly_targets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plan_analyses_tenant ON plan_analyses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_company_memory_tenant ON company_memory(tenant_id);

-- ============================================================
-- 超管理者の作成手順（手動実行）
-- ============================================================
-- 以下のSQLで超管理者を直接作成する:
--
-- INSERT INTO users (email, name, password_hash, must_change_password, is_super_admin)
-- VALUES (
--   'admin@example.com',
--   '超管理者',
--   '$2b$10$...', -- bcrypt.hash('初期パスワード', 10) の結果を入れる
--   true,
--   true
-- );
--
-- Node.js で bcrypt ハッシュを生成:
--   const bcrypt = require('bcrypt');
--   bcrypt.hash('YourPassword123', 10).then(console.log);
