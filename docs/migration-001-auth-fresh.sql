-- ============================================================
-- Migration 001: 認証・マルチテナント基盤（新規Supabaseプロジェクト用）
-- 実行方法: Supabase SQL Editor に貼り付けて Run
-- ============================================================

-- ============================================================
-- Part A: 新規テーブル作成
-- ============================================================

-- テナント（企業）管理
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ユーザー（メール+パスワード認証）
CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT NOT NULL UNIQUE,
  name                  TEXT,
  picture               TEXT,
  password_hash         TEXT NOT NULL,
  must_change_password  BOOLEAN NOT NULL DEFAULT true,
  is_super_admin        BOOLEAN NOT NULL DEFAULT false,
  failed_login_count    INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  google_refresh_token  TEXT,
  google_access_token   TEXT,
  google_token_expiry   TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at         TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- テナント所属・ロール管理
CREATE TABLE tenant_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('financial_admin', 'admin', 'employee')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_tenant_members_user ON tenant_members(user_id);
CREATE INDEX idx_tenant_members_tenant ON tenant_members(tenant_id);

-- 招待管理
CREATE TABLE invitations (
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

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);

-- ============================================================
-- Part B: 業務データテーブル（全てtenant_id付き）
-- ============================================================

-- チャット履歴
CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_tenant ON chat_messages(tenant_id);

-- 会社メモリ（テナントごとに1件）
CREATE TABLE company_memory (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) UNIQUE,
  company_name     TEXT,
  industry         TEXT,
  employee_count   TEXT,
  fiscal_year_end  TEXT,
  notes            JSONB DEFAULT '[]',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_memory_tenant ON company_memory(tenant_id);

-- 月次実績
CREATE TABLE monthly_actuals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  year                INTEGER NOT NULL,
  month               INTEGER NOT NULL,
  revenue             NUMERIC,
  cost_of_sales       NUMERIC,
  gross_profit        NUMERIC,
  sga_expenses        NUMERIC,
  operating_income    NUMERIC,
  ordinary_income     NUMERIC,
  cash_and_deposits   NUMERIC,
  current_assets      NUMERIC,
  current_liabilities NUMERIC,
  total_assets        NUMERIC,
  net_assets          NUMERIC,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, year, month)
);

CREATE INDEX idx_monthly_actuals_tenant ON monthly_actuals(tenant_id);

-- 月次目標
CREATE TABLE monthly_targets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  year            INTEGER NOT NULL,
  month           INTEGER NOT NULL,
  revenue         NUMERIC,
  gross_profit    NUMERIC,
  ordinary_income NUMERIC,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, year, month)
);

CREATE INDEX idx_monthly_targets_tenant ON monthly_targets(tenant_id);

-- 計画分析結果
CREATE TABLE plan_analyses (
  id          TEXT NOT NULL,
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  variances   JSONB,
  analysis    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE INDEX idx_plan_analyses_tenant ON plan_analyses(tenant_id);

-- AI学習インサイト
CREATE TABLE learning_insights (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  insight     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 仕訳修正ログ
CREATE TABLE journal_corrections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  correction  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 業種別仕訳ルール（tenant_id NULL = システム共通）
CREATE TABLE industry_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  rule        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
