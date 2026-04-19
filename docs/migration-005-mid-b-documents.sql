-- ============================================================
-- Migration 005: MID-B 書類ドキュメントのSupabase移行
-- secretary_documents テーブル（PDFはSupabase Storageに保存）
-- 実行方法: Supabase SQL Editor に貼り付けて Run
-- ============================================================

CREATE TABLE secretary_documents (
  id              TEXT PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id     TEXT NOT NULL,
  template_name   TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'invoice',
  data            JSONB DEFAULT '{}',
  storage_path    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sec_documents_tenant ON secretary_documents(tenant_id);
