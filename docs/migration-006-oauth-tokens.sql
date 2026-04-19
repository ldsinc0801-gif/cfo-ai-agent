-- ============================================================
-- Migration 006: OAuth トークンのテナント分離
-- freee / Google 連携トークンをテナント単位でSupabaseに保存
-- 実行方法: Supabase SQL Editor に貼り付けて Run
-- ============================================================

CREATE TABLE tenant_oauth_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('freee', 'google')),
  access_token    TEXT,
  refresh_token   TEXT,
  token_expiry    TIMESTAMPTZ,
  extra           JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

CREATE INDEX idx_oauth_tokens_tenant ON tenant_oauth_tokens(tenant_id);
