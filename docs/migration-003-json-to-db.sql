-- ============================================================
-- Migration 003: JSON依存サービスのSupabase移行
-- task-service, plan-analysis-service, analysis-store
-- 実行方法: Supabase SQL Editor に貼り付けて Run
-- ============================================================

-- ============================================================
-- Part A: tasks テーブル
-- ============================================================

CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status      TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  category    TEXT NOT NULL DEFAULT 'general',
  source      TEXT NOT NULL DEFAULT 'manual',
  source_id   TEXT,
  due_date    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX idx_tasks_status ON tasks(tenant_id, status);

-- ============================================================
-- Part B: plan_history テーブル（分析履歴）
-- ============================================================

CREATE TABLE plan_history (
  id          TEXT PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variances   JSONB,
  analysis    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_history_tenant ON plan_history(tenant_id);

-- ============================================================
-- Part C: financial_analyses テーブル（銀行格付分析結果）
-- ============================================================

CREATE TABLE financial_analyses (
  id          TEXT PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_name   TEXT,
  source      TEXT DEFAULT 'mock',
  rating_input JSONB,
  rating      JSONB,
  additional  JSONB,
  ai_commentary TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_financial_analyses_tenant ON financial_analyses(tenant_id);
