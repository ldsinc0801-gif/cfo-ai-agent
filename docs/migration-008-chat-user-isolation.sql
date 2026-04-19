-- ============================================================
-- Migration 008: チャット履歴をユーザー単位で分離
-- 同じテナント内でも、財務管理者と管理者で別々の会話履歴を持つ
-- ============================================================

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(tenant_id, user_id);
