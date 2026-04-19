-- ============================================================
-- Migration 002: Phase 7 - 企業AI OSナレッジDB化 + company_memory拡張
-- 実行方法: Supabase SQL Editor に貼り付けて Run
-- ============================================================

-- ============================================================
-- Part A: enterprise_knowledge テーブル（企業AI OSナレッジ）
-- ============================================================

CREATE TABLE enterprise_knowledge (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  key_points  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, category, title)
);

CREATE INDEX idx_ek_tenant ON enterprise_knowledge(tenant_id);

-- ============================================================
-- Part B: company_memory カラム追加
-- ============================================================

ALTER TABLE company_memory ADD COLUMN IF NOT EXISTS business_description TEXT DEFAULT '';
ALTER TABLE company_memory ADD COLUMN IF NOT EXISTS strengths TEXT DEFAULT '';
ALTER TABLE company_memory ADD COLUMN IF NOT EXISTS challenges TEXT DEFAULT '';
ALTER TABLE company_memory ADD COLUMN IF NOT EXISTS key_clients TEXT DEFAULT '';
ALTER TABLE company_memory ADD COLUMN IF NOT EXISTS ai_notes JSONB DEFAULT '[]';
