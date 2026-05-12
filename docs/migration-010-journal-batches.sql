-- ============================================================
-- Migration 010: 仕訳の確定保存（取り込みバッチ＋個別仕訳）
--
-- 会計AIエージェントで生成した仕訳を「確定」ボタンで保存し、
-- 後から一覧・修正・削除できるようにする。
-- 1回の取り込み = 1 journal_batch、その中に複数の journal_entries が紐づく。
-- ============================================================

-- 取り込みバッチ（1回の確定操作）
CREATE TABLE IF NOT EXISTS journal_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  source          TEXT,
  entry_count     INTEGER NOT NULL DEFAULT 0,
  total_amount    BIGINT NOT NULL DEFAULT 0,
  freee_sent_at   TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_batches_tenant_created
  ON journal_batches(tenant_id, created_at DESC);

-- 個別仕訳
CREATE TABLE IF NOT EXISTS journal_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id        UUID NOT NULL REFERENCES journal_batches(id) ON DELETE CASCADE,
  entry_date      DATE NOT NULL,
  debit_account   TEXT NOT NULL,
  credit_account  TEXT NOT NULL,
  amount          BIGINT NOT NULL,
  tax_rate        INTEGER NOT NULL DEFAULT 10,
  tax_amount      BIGINT NOT NULL DEFAULT 0,
  description     TEXT NOT NULL DEFAULT '',
  partner_name    TEXT NOT NULL DEFAULT '',
  receipt_type    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_batch ON journal_entries(batch_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant ON journal_entries(tenant_id);

ALTER TABLE journal_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
