-- ============================================================
-- Migration 007: 全テーブルのRLS有効化
--
-- 戦略:
-- - アプリはservice_role keyで接続（RLSバイパス）
-- - anon keyでの直接アクセスは全ブロック
-- - service_roleは全操作を許可（Supabaseデフォルト動作）
--
-- 実行方法: Supabase SQL Editor に貼り付けて Run
-- ============================================================

-- === tenant_id を持つテーブル ===

ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_actuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE industry_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE secretary_company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE secretary_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE secretary_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- === tenant_id を持たないテーブル ===

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ポリシー: anon ロールは全操作ブロック
-- service_role は自動的にRLSをバイパスするため、ポリシー不要
-- ============================================================

-- anon用の明示的ブロックポリシーは不要
-- (RLS有効 + ポリシーなし = デフォルトで全拒否)
-- service_role はSupabaseの仕様でRLSをバイパスする
