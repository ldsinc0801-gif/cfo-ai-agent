-- ============================================================
-- Migration 012: 仕訳バッチのfreee送信スキップ件数
--
-- freee送信時にスキップされた件数（勘定科目不一致など）を記録する。
-- 「freee一部登録（N件スキップ）」のような表示に使用。
-- ============================================================

ALTER TABLE journal_batches
  ADD COLUMN IF NOT EXISTS freee_skip_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN journal_batches.freee_skip_count IS
  'freee送信時にスキップされた仕訳件数。0なら全件送信成功、>0なら一部スキップあり。freee_sent_at と組み合わせて状態判定。';
