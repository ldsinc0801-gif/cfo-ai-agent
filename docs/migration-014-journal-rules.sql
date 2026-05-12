-- ============================================================
-- Migration 014: テナント別の仕訳ルール
--
-- ユーザーが自由テキストで定義する会社固有の仕訳ルールを保存する。
-- AI仕訳生成時にプロンプトに埋め込み、AIがルールを参照して仕訳を選ぶ。
-- タグ(自由)でグループ化できる。
--
-- 例: rule_text = "ガソリン代、洗車、車の備品10万円以下は車両費"
--     tags = '{"経費","車両費"}'
-- ============================================================

CREATE TABLE IF NOT EXISTS journal_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_text   TEXT NOT NULL,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_rules_tenant ON journal_rules(tenant_id);

ALTER TABLE journal_rules ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN journal_rules.rule_text IS 'AI仕訳生成時にプロンプトに埋め込む自由テキストルール';
COMMENT ON COLUMN journal_rules.tags IS '自由定義タグ（例: 経費 / 売上 / 車両費 / 地代家賃）';
COMMENT ON COLUMN journal_rules.enabled IS 'falseならAI参照対象外（一時無効化用）';
