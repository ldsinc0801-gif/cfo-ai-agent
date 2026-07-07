import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import crypto from 'crypto';
import multer from 'multer';
import iconv from 'iconv-lite';
import path from 'path';
import fs from 'fs';
import { ReportBuilder } from '../reports/report-builder.js';
import { createMockRawData } from '../../tests/fixtures/mock-data.js';
import { createMockTrendData } from '../../tests/fixtures/mock-trend.js';
import { renderDashboardHTML } from './dashboard-renderer.js';
import { renderReportHTML } from './html-renderer.js';
import { renderPlanHTML } from './plan-renderer.js';
import { renderFinanceAgentHTML, renderAccountingAgentHTML, renderFundingAgentHTML } from './agent-pages.js';
import { renderAccountingPageHTML } from './accounting-page.js';
import { renderChatHTML } from './chat-page.js';
import { renderTaskPageHTML } from './task-page.js';
import { receiptService } from '../services/receipt-service.js';
import type { JournalEntry } from '../services/receipt-service.js';
import { chatService } from '../services/chat-service.js';
import { taskService } from '../services/task-service.js';
import { generateMonthlyTasks } from '../config/task-templates.js';
import { renderRatingHTML, renderAnalysisLoadingHTML } from './rating-page.js';
import { calculateBankRating, calculateAdditionalMetrics } from '../domain/banking/rating-calculator.js';
import { createMockRatingInput } from '../../tests/fixtures/mock-rating-input.js';
import { AnthropicAnalysisService } from '../services/anthropic-service.js';
import { usageTracker } from '../services/usage-tracker.js';
import { analysisStore } from '../services/analysis-store.js';
import { renderHistoryHTML } from './history-page.js';
import { googleTasksClient } from '../clients/google-tasks.js';
import { logger } from '../utils/logger.js';
import { isSupabaseAvailable, getSupabase } from '../clients/supabase.js';
import * as repo from '../repositories/supabase-repository.js';
import { learningService } from '../services/learning-service.js';
// demo-data.ts は削除済み（デモデータの自動シードを廃止）
import { renderLoginHTML, renderChangePasswordHTML } from './login-page.js';
import { renderUsersHTML } from './users-page.js';
import { renderCompanyInfoHTML } from './company-info-page.js';
import { setCurrentUser, renderSidebar, SHARED_CSS, agentPageShell } from './shared.js';

import { authService } from '../services/auth-service.js';
import { validatePassword, hashPassword, generateInitialPassword } from '../utils/password.js';
import type { SessionUser } from '../types/auth.js';
import { asTenantId } from '../types/auth.js';
import type { TenantId } from '../types/auth.js';
import { requireSuperAdmin, requireRole, requireTenant, getActiveTenantId } from './auth-middleware.js';
import { csrfMiddleware, ensureCsrfToken, setCurrentCsrfToken } from './security.js';
import { createSessionStore } from './session-store.js';

// セッションにユーザー情報を保持するための型拡張
declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
    activeTenantId?: string;
    activeTenantRole?: string;
    /** 会計AIで選択中の対象会計年度（決算月期末年） */
    activeFiscalYear?: number;
  }
}

const anthropicService = new AnthropicAnalysisService();

const app = express();
const PORT = process.env.PORT || 3000;

// === freee APIキャッシュ（5分TTL） ===
const CACHE_TTL = 5 * 60 * 1000;
const apiCache = new Map<string, { data: any; expires: number }>();

function getCached<T>(key: string): T | null {
  const entry = apiCache.get(key);
  if (entry && Date.now() < entry.expires) return entry.data as T;
  if (entry) apiCache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  apiCache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

function clearCache(): void {
  apiCache.clear();
  logger.info('APIキャッシュをクリアしました');
}

// 本番環境判定
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// SESSION_SECRET 検証
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  if (IS_PRODUCTION) {
    logger.error('SESSION_SECRET が未設定です。本番環境では .env に設定してください');
    process.exit(1);
  } else {
    logger.warn('SESSION_SECRET が未設定のため自動生成しました（サーバー再起動でセッション無効化）');
  }
} else if (process.env.SESSION_SECRET.length < 32) {
  logger.warn('SESSION_SECRET が短すぎます（32文字以上を推奨）');
}

// CORS
app.use((_req, res, next) => {
  const origin = IS_PRODUCTION ? (process.env.ALLOWED_ORIGIN || '') : '*';
  if (origin) res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  next();
});

// Expressのtrust proxy（Railway等のリバースプロキシ背後で動作する場合に必要）
if (IS_PRODUCTION) app.set('trust proxy', 1);

// セキュリティヘッダ（helmet）
// SSR でインラインスクリプトを多用しているため CSP は無効化（将来 nonce 化で再有効化推奨）
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: IS_PRODUCTION ? undefined : false,
}));

// セッション管理: DATABASE_URL があれば Postgres 永続化、無ければ MemoryStore
// 本番でも MemoryStore で動作可能（デプロイ毎に全員ログアウトする副作用は許容）。
// ユーザー数が増えてきたら DATABASE_URL を環境変数に追加するだけで自動で永続化に切替わる。
const sessionStore = createSessionStore();
if (!sessionStore) {
  logger.warn(
    IS_PRODUCTION
      ? '[本番] DATABASE_URL 未設定: セッションは MemoryStore で動作します（再起動・スケールアウトで全員ログアウト）。永続化したい場合は Supabase の Direct Connection URL を DATABASE_URL に設定してください'
      : 'セッションストアが未設定のため MemoryStore を使用します'
  );
}

app.use(session({
  store: sessionStore,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7日間
    httpOnly: true,
    secure: IS_PRODUCTION,  // 本番: true（HTTPS必須）、開発: false
    sameSite: 'lax',
  },
}));

// === 認証ルート（ミドルウェアの前に定義） ===

// Body parser（extended: trueでcfg_name[]等の配列記法をサポート）
app.use(express.urlencoded({ extended: true }));

// CSRF: 全リクエストでトークンを発行、mutating メソッドは検証
app.use(csrfMiddleware);

// ログインページ
app.get('/login', (req, res) => {
  if (req.session.user) { res.redirect('/'); return; }
  const error = req.query.error as string | undefined;
  const token = ensureCsrfToken(req);
  res.send(renderLoginHTML(error, token));
});

/**
 * ログイン成功時にセッションを再生成して固定化攻撃を防ぐ。
 * regenerate 後の新セッションに user/tenant をセットしてから redirect。
 */
function loginAndRedirect(req: express.Request, res: express.Response, user: any, mustChangePassword: boolean): void {
  req.session.regenerate(async (err) => {
    if (err) {
      logger.error('セッション再生成エラー', err);
      res.redirect('/login?error=' + encodeURIComponent('ログイン処理中にエラーが発生しました'));
      return;
    }
    req.session.user = {
      id: user.id,
      email: user.email,
      name: user.name || user.email,
      isSuperAdmin: user.isSuperAdmin,
    };

    if (mustChangePassword) {
      req.session.save(() => res.redirect('/auth/change-password'));
      return;
    }

    if (!user.isSuperAdmin) {
      try {
        const tenants = await authService.getUserTenants(user.id);
        if (tenants.length > 0) {
          req.session.activeTenantId = tenants[0].tenantId;
          req.session.activeTenantRole = tenants[0].role;
        }
      } catch (e) {
        logger.error('テナント自動選択エラー', e);
      }
    }
    req.session.save(() => res.redirect('/'));
  });
}

// メール+パスワード ログイン処理
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.redirect('/login?error=' + encodeURIComponent('メールアドレスとパスワードを入力してください'));
      return;
    }

    const result = await authService.login(email, password);
    if ('error' in result) {
      res.redirect('/login?error=' + encodeURIComponent(result.error));
      return;
    }

    loginAndRedirect(req, res, result.user, result.user.mustChangePassword);
  } catch (error: any) {
    logger.error('ログインエラー', error);
    res.redirect('/login?error=' + encodeURIComponent('ログイン処理中にエラーが発生しました'));
  }
});

// パスワード変更ページ
app.get('/auth/change-password', (req, res) => {
  if (!req.session.user) { res.redirect('/login'); return; }
  const error = req.query.error as string | undefined;
  const success = req.query.success as string | undefined;
  const voluntary = req.query.voluntary === '1'; // メニューからの任意変更（初回強制ではない）
  const token = ensureCsrfToken(req);
  res.send(renderChangePasswordHTML(error, success, token, { voluntary }));
});

// パスワード変更処理
app.post('/auth/change-password', async (req, res) => {
  if (!req.session.user) { res.redirect('/login'); return; }
  try {
    const { newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      res.redirect('/auth/change-password?error=' + encodeURIComponent('パスワードが一致しません'));
      return;
    }

    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      res.redirect('/auth/change-password?error=' + encodeURIComponent(validation.errors.join('、')));
      return;
    }

    const userId = req.session.user.id;
    await authService.changePassword(userId, newPassword);

    // パスワード変更後もセッションを再生成
    const userSnapshot = req.session.user;
    req.session.regenerate(async (err) => {
      if (err) {
        logger.error('セッション再生成エラー', err);
        res.redirect('/login');
        return;
      }
      req.session.user = userSnapshot;
      if (!userSnapshot.isSuperAdmin) {
        try {
          const tenants = await authService.getUserTenants(userId);
          if (tenants.length > 0) {
            req.session.activeTenantId = tenants[0].tenantId;
            req.session.activeTenantRole = tenants[0].role;
          }
        } catch (e) { logger.error('テナント自動選択エラー', e); }
      }
      req.session.save(() => res.redirect('/'));
    });
  } catch (error: any) {
    logger.error('パスワード変更エラー', error);
    res.redirect('/auth/change-password?error=' + encodeURIComponent('パスワード変更に失敗しました'));
  }
});

// デモモードログイン（認証不要）。POST + CSRF 必須。
app.post('/auth/demo', async (req, res) => {
  const { enableDemoMode: enableDemo } = await import('../services/demo-mode.js');
  enableDemo('consulting');
  req.session.regenerate((err) => {
    if (err) { logger.error('セッション再生成エラー', err); res.redirect('/login'); return; }
    req.session.user = {
      id: 'demo-user',
      email: 'demo@ai-cfo.example.com',
      name: 'デモユーザー',
      isSuperAdmin: false,
    };
    req.session.activeTenantId = 'demo-tenant';
    req.session.activeTenantRole = 'financial_admin';
    logger.info('デモモードでログイン');
    req.session.save(() => res.redirect('/'));
  });
});

// ログアウト
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) logger.error('セッション破棄エラー', err);
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

// 認証ミドルウェア（上記ルート以外に適用）
app.use((req, res, next) => {
  // サイドバー用にユーザー情報をセット（isSuperAdmin, tenantRole含む）
  setCurrentUser(req.session.user ? {
    ...req.session.user,
    picture: '',
    tenantRole: req.session.activeTenantRole || '',
  } : undefined);

  // tenantId はミドルウェアでは設定しない（各ルートハンドラで明示的に取得）

  // 認証不要パス
  const p = req.path;
  if (p === '/login' || p.startsWith('/auth/') || p.startsWith('/api/')) {
    next();
    return;
  }
  if (!req.session.user) {
    res.redirect('/login');
    return;
  }
  // 初回パスワード変更が強制される場合
  if (p !== '/auth/change-password') {
    // ユーザーのmustChangePasswordフラグはログイン時にセッションに反映済み
    // パスワード変更後はリダイレクトされるので、ここでは通過を許可
  }
  next();
});

// === テナント管理API ===

// テナント一覧（超管理者: 全テナント、それ以外: 自分が所属するテナント）
app.get('/api/tenants', async (req, res) => {
  if (!req.session.user) { res.status(401).json({ error: 'ログインが必要です' }); return; }
  try {
    if (req.session.user.isSuperAdmin) {
      const { data, error } = await getSupabase().from('tenants').select('*').order('created_at');
      if (error) throw error;
      res.json({ tenants: data || [] });
    } else {
      const tenants = await authService.getUserTenants(req.session.user.id);
      res.json({ tenants });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// テナント作成（超管理者のみ）
app.post('/api/tenants', express.json(), requireSuperAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'テナント名を入力してください' }); return; }
    const { data, error } = await getSupabase()
      .from('tenants')
      .insert({ name })
      .select()
      .single();
    if (error) throw error;
    logger.info(`テナント作成: ${name} (${data.id})`);
    res.json({ tenant: data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// テナント切り替え
app.post('/api/tenant/switch', express.json(), async (req, res) => {
  if (!req.session.user) { res.status(401).json({ error: 'ログインが必要です' }); return; }
  try {
    const { tenantId } = req.body;
    if (!tenantId) { res.status(400).json({ error: 'tenantIdを指定してください' }); return; }

    // 超管理者は全テナントにアクセス可能
    if (!req.session.user.isSuperAdmin) {
      const role = await authService.getUserRoleInTenant(req.session.user.id, asTenantId(tenantId));
      if (!role) {
        res.status(403).json({ error: 'このテナントへのアクセス権がありません' });
        return;
      }
    }

    req.session.activeTenantId = tenantId;
    // テナント内でのロールもセッションに保存
    if (req.session.user.isSuperAdmin) {
      req.session.activeTenantRole = 'financial_admin'; // 超管理者はフル権限
    } else {
      const role = await authService.getUserRoleInTenant(req.session.user.id, asTenantId(tenantId));
      req.session.activeTenantRole = role || '';
    }
    // キャッシュクリア（テナント切替時はデータが変わるため）
    clearCache();
    logger.info(`テナント切替: ${req.session.user.email} → ${tenantId}`);
    res.json({ success: true, activeTenantId: tenantId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 現在のテナント情報
app.get('/api/tenant/current', (req, res) => {
  if (!req.session.user) { res.status(401).json({ error: 'ログインが必要です' }); return; }
  res.json({
    activeTenantId: req.session.activeTenantId || null,
    user: req.session.user,
  });
});

// テナントメンバー一覧（financial_admin以上）
app.get('/api/tenant/members', requireRole('financial_admin'), async (req, res) => {
  try {
    const tenantId = getActiveTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'テナントが選択されていません' }); return; }
    const members = await authService.getTenantMembers(tenantId);
    res.json({ members });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// テナント財務管理者の作成（超管理者のみ）
app.post('/api/tenants/:tenantId/financial-admin', express.json(), requireSuperAdmin, async (req, res) => {
  try {
    const tenantId = req.params.tenantId as string;
    const { email, name } = req.body;
    if (!email) { res.status(400).json({ error: 'メールアドレスを入力してください' }); return; }

    // ユーザーが既に存在するか確認
    let user = await authService.getUserByEmail(email);
    let initialPassword: string | null = null;
    let isExistingUser = false;

    if (user) {
      // 既存ユーザー: パスワードは変更しない、テナント紐付けのみ
      isExistingUser = true;
      logger.info(`既存ユーザーをテナントに追加: ${email}`);
    } else {
      // 新規ユーザー: 初期パスワードを生成して作成
      initialPassword = generateInitialPassword();
      const passwordHash = await hashPassword(initialPassword);
      user = await authService.createUser(email, name || email, passwordHash);
    }

    // テナントメンバーとして追加 + 財務管理者フラグを立てる（身分を独立管理）
    await authService.addTenantMember(asTenantId(tenantId), user.id, 'financial_admin');
    await authService.setFinancialAdmin(user.id, true);

    logger.info(`テナント財務管理者を追加: ${email} → テナント ${tenantId}${isExistingUser ? ' (既存ユーザー)' : ' (新規ユーザー)'}`);
    res.json({
      success: true,
      userId: user.id,
      isExistingUser,
      initialPassword, // 既存ユーザーの場合はnull
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// === テナント財務管理者管理API（超管理者のみ） ===

// 財務管理者一覧（is_financial_admin=true のユーザー。担当テナント0でも含む）
app.get('/api/financial-admins', requireSuperAdmin, async (req, res) => {
  try {
    const financialAdmins = await authService.getFinancialAdmins();
    res.json({ financialAdmins });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 財務管理者を登録（テナント紐付けなし。デフォルトは担当テナントなし）
app.post('/api/financial-admins', express.json(), requireSuperAdmin, async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) { res.status(400).json({ error: 'メールアドレスを入力してください' }); return; }

    let user = await authService.getUserByEmail(email);
    let initialPassword: string | null = null;
    let isExistingUser = false;

    if (user) {
      // 既存ユーザー: 財務管理者フラグを立てるだけ（パスワード・テナントは変更しない）
      isExistingUser = true;
      await authService.setFinancialAdmin(user.id, true);
      logger.info(`既存ユーザーを財務管理者に設定: ${email}`);
    } else {
      // 新規ユーザー: 初期パスワードを生成して作成（テナント紐付けはしない）
      initialPassword = generateInitialPassword();
      const passwordHash = await hashPassword(initialPassword);
      user = await authService.createUser(email, name || email, passwordHash, { isFinancialAdmin: true });
      logger.info(`財務管理者を新規登録: ${email}`);
    }

    res.json({ success: true, userId: user.id, isExistingUser, initialPassword });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 財務管理者をテナントに紐付け / 解除
app.post('/api/financial-admins/:userId/tenants', express.json(), requireSuperAdmin, async (req, res) => {
  try {
    const userId = req.params.userId as string;
    const { tenantIds } = req.body; // 紐付けるテナントIDの配列
    if (!Array.isArray(tenantIds)) { res.status(400).json({ error: 'tenantIds配列を指定してください' }); return; }

    // 現在の紐付けを取得
    const { data: current } = await getSupabase()
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', userId)
      .eq('role', 'financial_admin')
      .eq('is_active', true);
    const currentTids = new Set((current || []).map((r: any) => r.tenant_id));

    // 追加分
    for (const tid of tenantIds) {
      if (!currentTids.has(tid)) {
        await authService.addTenantMember(asTenantId(tid), userId, 'financial_admin');
        logger.info(`財務管理者テナント紐付け追加: ${userId} → ${tid}`);
      }
    }

    // 削除分
    for (const tid of currentTids) {
      if (!tenantIds.includes(tid)) {
        await getSupabase().from('tenant_members').delete()
          .eq('user_id', userId).eq('tenant_id', tid).eq('role', 'financial_admin');
        logger.info(`財務管理者テナント紐付け解除: ${userId} → ${tid}`);
      }
    }

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 超管理者: 任意ユーザーのパスワードを設定（テナント不問）
// newPassword を指定 → その値に設定（強制変更なし）。未指定 → 自動生成してリセット（従来動作）
app.post('/api/users/:userId/reset-password', express.json(), requireSuperAdmin, async (req, res) => {
  try {
    const userId = req.params.userId as string;
    const target = await authService.getUserById(userId);
    if (!target) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }

    const specified = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (specified) {
      const validation = validatePassword(specified);
      if (!validation.valid) { res.status(400).json({ error: validation.errors.join('、') }); return; }
      // 管理者が意図して設定した値なので、初回強制変更は付けない（changePassword: must_change=false）
      await authService.changePassword(userId, specified);
      logger.info(`超管理者がパスワードを指定設定: ${target.email}`);
      res.json({ success: true, specified: true });
      return;
    }

    // 未指定: 従来どおり自動生成
    const newPassword = generateInitialPassword();
    const hash = await hashPassword(newPassword);
    await authService.resetPassword(userId, hash);
    logger.info(`超管理者がパスワードをリセット(自動生成): ${target.email}`);
    res.json({ success: true, newPassword });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ユーザー削除（超管理者のみ）
app.delete('/api/users/:userId', requireSuperAdmin, async (req, res) => {
  try {
    const userId = req.params.userId as string;
    // tenant_members は CASCADE で自動削除
    const { error } = await getSupabase().from('users').delete().eq('id', userId);
    if (error) throw error;
    logger.info(`ユーザー削除: ${userId}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// テナント削除（超管理者のみ、CASCADEで関連データも削除）
app.delete('/api/tenants/:tenantId', requireSuperAdmin, async (req, res) => {
  try {
    const tenantId = req.params.tenantId as string;
    const { error } = await getSupabase().from('tenants').delete().eq('id', tenantId);
    if (error) throw error;
    logger.info(`テナント削除: ${tenantId}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// === メンバー管理API ===

// テナント内メンバー招待（管理者→従業員追加、財務管理者→管理者招待）
app.post('/api/tenant/invite', express.json(), requireRole('admin'), async (req, res) => {
  try {
    const tenantId = getActiveTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'テナントが選択されていません' }); return; }

    const { email, name, role } = req.body;
    if (!email || !role) { res.status(400).json({ error: 'メールアドレスとロールを指定してください' }); return; }

    // 権限チェック: adminはemployeeのみ追加可能、financial_adminはadminも追加可能
    if (!req.session.user!.isSuperAdmin) {
      const myRole = await authService.getUserRoleInTenant(req.session.user!.id, tenantId);
      if (role === 'admin' && myRole !== 'financial_admin') {
        res.status(403).json({ error: '管理者を招待する権限がありません' }); return;
      }
      if (role === 'financial_admin') {
        res.status(403).json({ error: '財務管理者の追加は超管理者のみ可能です' }); return;
      }
    }

    let user = await authService.getUserByEmail(email);
    let initialPassword: string | null = null;
    let isExistingUser = false;

    if (user) {
      isExistingUser = true;
      logger.info(`既存ユーザーをテナントに追加: ${email} (${role})`);
    } else {
      initialPassword = generateInitialPassword();
      const ph = await hashPassword(initialPassword);
      user = await authService.createUser(email, name || email, ph);
    }

    await authService.addTenantMember(tenantId, user.id, role);
    logger.info(`メンバー追加: ${email} (${role}) → テナント ${tenantId}${isExistingUser ? ' (既存)' : ' (新規)'}`);
    res.json({ success: true, userId: user.id, isExistingUser, initialPassword });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// パスワードリセット（財務管理者 or 超管理者）
app.post('/api/tenant/members/:userId/reset-password', requireRole('financial_admin'), async (req, res) => {
  try {
    const userId = req.params.userId as string;
    const newPassword = generateInitialPassword();
    const ph = await hashPassword(newPassword);
    await authService.resetPassword(userId, ph);
    // パスワード平文をログに出力しない
    logger.info(`パスワードリセット: ${userId}`);
    res.json({ success: true, newPassword });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// メンバー削除
app.delete('/api/tenant/members/:userId', requireRole('admin'), async (req, res) => {
  try {
    const tenantId = getActiveTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'テナントが選択されていません' }); return; }
    const userId = req.params.userId as string;

    const { error } = await getSupabase()
      .from('tenant_members')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('user_id', userId);

    if (error) throw error;
    logger.info(`メンバー削除: ${userId} from テナント ${tenantId}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// === ユーザー管理ページ（テナント管理 + メンバー管理を統合） ===
app.get('/settings/users', requireRole('admin'), async (req, res) => {
  const user = req.session.user!;
  const tenantId = getActiveTenantId(req);
  let tenantRole = req.session.activeTenantRole || '';
  if (tenantId && !user.isSuperAdmin && !tenantRole) {
    tenantRole = await authService.getUserRoleInTenant(user.id, tenantId) || '';
  }
  res.send(renderUsersHTML({
    id: user.id, email: user.email, name: user.name,
    isSuperAdmin: user.isSuperAdmin, tenantRole,
  }));
});
// 旧URLからのリダイレクト
app.get('/admin/tenants', (req, res) => res.redirect('/settings/users'));
app.get('/settings/members', (req, res) => res.redirect('/settings/users'));

// ファイルアップロード設定
const uploadDir = path.resolve('uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext);
      cb(null, `${base}-${Date.now()}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.csv', '.xlsx', '.xls', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.avi', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
  limits: { fileSize: 200 * 1024 * 1024 },  // 動画対応のため200MB
});

import { getOAuthToken, saveOAuthToken, updateOAuthExtra, deleteOAuthToken } from '../services/oauth-token-service.js';

/** freeeトークンを取得（テナント分離、Supabase） */
async function getFreeeToken(tenantId?: TenantId): Promise<{ access_token: string; refresh_token: string; company_id?: number; company_name?: string } | null> {
  if (!tenantId) return null;
  const token = await getOAuthToken(tenantId, 'freee');
  if (!token || !token.accessToken) return null;
  return {
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    company_id: token.extra?.company_id,
    company_name: token.extra?.company_name,
  };
}

/** 選択中の事業所IDを取得 */
async function getSelectedCompanyId(tenantId?: TenantId): Promise<number | null> {
  const token = await getFreeeToken(tenantId);
  return token?.company_id ?? null;
}

/** 事業所ID・名称を保存 */
async function saveSelectedCompany(tenantId: TenantId, companyId: number, companyName: string): Promise<void> {
  await updateOAuthExtra(tenantId, 'freee', { company_id: companyId, company_name: companyName });
  logger.info(`事業所 ${companyName} (ID:${companyId}) を保存しました`);
}

/** 選択中の事業所名を取得 */
async function getSelectedCompanyName(tenantId?: TenantId): Promise<string | null> {
  const token = await getFreeeToken(tenantId);
  return token?.company_name ?? null;
}

/** freee接続済みか */
async function isFreeeConnected(tenantId?: TenantId): Promise<boolean> {
  return (await getFreeeToken(tenantId)) !== null;
}

/** レポートデータを生成（freee接続時は実データ、デモモード時はデモデータ、それ以外はnull） */
async function buildReport(year?: number, month?: number, isDemo: boolean = false, tenantId?: TenantId) {
  // デモモード: セッションがデモユーザーの場合のみデモデータを使用
  const demoProfile = isDemo ? getDemoProfile() : null;
  if (demoProfile) {
    logger.info(`デモモード: ${demoProfile.companyName}のレポート`);
    const builder = new ReportBuilder();
    const mockRaw = createMockRawData();
    const now = new Date();
    return builder.build(mockRaw, year || now.getFullYear(), month || (now.getMonth() === 0 ? 12 : now.getMonth()));
  }

  const cacheKey = `report-${year || 'default'}-${month || 'default'}-${await getSelectedCompanyId(tenantId)}`;
  const cached = getCached<any>(cacheKey);
  if (cached) { logger.info(`レポート: キャッシュヒット (${cacheKey})`); return cached; }
  const now = new Date();
  const targetYear = year || now.getFullYear();
  // デフォルトは前月
  const targetMonth = month || (now.getMonth() === 0 ? 12 : now.getMonth());

  const token = await getFreeeToken(tenantId);
  if (token) {
    try {
      const auth = new FreeeAuthClient({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
      });
      const freeeService = new FreeeService(auth);

      // 保存済みの事業所IDを使用、なければ最初の事業所
      const savedCompanyId = await getSelectedCompanyId(tenantId);
      let companyId: number;
      if (savedCompanyId) {
        companyId = savedCompanyId;
        logger.info(`freee実データで取得: 事業所ID=${companyId} ${targetYear}年${targetMonth}月`);
      } else {
        const companies = await freeeService.getCompanies();
        if (companies.length === 0) {
          throw new Error('freeeに事業所が見つかりません');
        }
        companyId = companies[0].id;
        logger.info(`freee実データで取得: 事業所=${companies[0].display_name} ${targetYear}年${targetMonth}月`);
      }

      const rawData = await freeeService.fetchMonthlyData(companyId, targetYear, targetMonth);
      const builder = new ReportBuilder();
      const report = await builder.build(rawData, targetYear, targetMonth);
      setCache(cacheKey, report);
      return report;
    } catch (error) {
      logger.warn('freeeデータ取得に失敗:', error instanceof Error ? error.message : error);
    }
  }

  // freee未接続・デモモードOFF → データなしを返す（モックは表示しない）
  logger.info('freee未接続: データなし');
  return null;
}

/** トレンドデータを生成（freee接続時は実データ、未接続時はモック） */
async function buildTrendData(endYear?: number, endMonth?: number, monthCount: number = 6, isDemo: boolean = false, tenantId?: TenantId): Promise<import('../types/trend.js').TrendData> {
  // デモモード: セッションがデモユーザーの場合のみ
  const demoProfileEarly = isDemo ? getDemoProfile() : null;
  if (demoProfileEarly) {
    logger.info(`デモモード: ${demoProfileEarly.companyName}のトレンドデータ`);
    const plan = await planAnalysisService.getPlan(tenantId);
    return {
      months: demoProfileEarly.trendMonths,
      targets: plan.targets.length > 0 ? plan.targets : demoProfileEarly.targets,
    };
  }

  const now = new Date();
  const targetYear = endYear || now.getFullYear();
  const targetMonth = endMonth || (now.getMonth() === 0 ? 12 : now.getMonth());

  const cacheKey = `trend-${targetYear}-${targetMonth}-${monthCount}-${await getSelectedCompanyId(tenantId)}`;
  const cached = getCached<any>(cacheKey);
  if (cached) { logger.info(`トレンド: キャッシュヒット (${cacheKey})`); return cached; }

  const token = await getFreeeToken(tenantId);
  if (token) {
    try {
      const auth = new FreeeAuthClient({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
      });
      const freeeService = new FreeeService(auth);

      const savedCompanyId = await getSelectedCompanyId(tenantId);
      let companyId: number;
      if (savedCompanyId) {
        companyId = savedCompanyId;
      } else {
        const companies = await freeeService.getCompanies();
        if (companies.length === 0) {
          throw new Error('freeeに事業所が見つかりません');
        }
        companyId = companies[0].id;
      }
      logger.info(`freee実データでトレンド取得: 事業所ID=${companyId} ${targetYear}年${targetMonth}月から${monthCount}か月分`);

      const trend = await freeeService.fetchTrendData(companyId, targetYear, targetMonth, monthCount);

      // 保存済みの月次目標をマージ
      const plan = await planAnalysisService.getPlan(tenantId);
      if (plan.targets.length > 0) {
        trend.targets = plan.targets;
      }

      setCache(cacheKey, trend);

      // freeeデータをSupabaseに自動蓄積
      if (isSupabaseAvailable() && tenantId) {
        for (const month of trend.months) {
          repo.upsertMonthlyActual(tenantId, month).catch(e => logger.warn('Supabase蓄積失敗:', e));
        }
      }

      return trend;
    } catch (error) {
      logger.warn('freeeトレンドデータ取得に失敗:', error instanceof Error ? error.message : error);
    }
  }

  // freee未接続・デモモードOFF → データなしを返す
  logger.info('freee未接続: トレンドデータなし');
  return { months: [], targets: [] };
}

/** アップロード済みファイル一覧 */
function getUploadedFiles(): string[] {
  try {
    return fs.readdirSync(uploadDir)
      .filter(f => !f.startsWith('.'))
      .sort((a, b) => {
        const sa = fs.statSync(path.join(uploadDir, a)).mtime;
        const sb = fs.statSync(path.join(uploadDir, b)).mtime;
        return sb.getTime() - sa.getTime();
      });
  } catch {
    return [];
  }
}

/** 期間累計でレポートを再構築する */
async function buildPeriodReport(baseReport: any, fromMonth: string, toMonth: string, tenantId?: TenantId): Promise<any> {
  const token = await getFreeeToken(tenantId);
  if (!token) return null;

  const cacheKey = `period-report-${fromMonth}-${toMonth}-${await getSelectedCompanyId(tenantId)}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return cached;

  try {
    const auth = new FreeeAuthClient({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
    });
    const freeeService = new FreeeService(auth);

    const companyId = await getSelectedCompanyId(tenantId);
    if (!companyId) return null;

    // 会計年度を取得
    const companyDetail = await freeeService.getCompanyDetail(companyId);
    const fiscalYears: Array<{ start_date: string; end_date: string }> = companyDetail.fiscal_years || [];

    const [fromY, fromM] = fromMonth.split('-').map(Number);
    const [toY, toM] = toMonth.split('-').map(Number);

    // from月が含まれる会計年度を特定
    let fiscalYear = fromY;
    if (fiscalYears.length > 0) {
      const targetDate = `${fromY}-${String(fromM).padStart(2, '0')}-15`;
      const matched = fiscalYears.find(fy => targetDate >= fy.start_date && targetDate <= fy.end_date);
      if (matched) fiscalYear = parseInt(matched.start_date.substring(0, 4));
    }

    // from〜to の期間PLを取得
    const { FreeeApiClient: ApiClient } = await import('../clients/freee-api.js');
    const apiClient = new ApiClient(auth);
    const plRes = await apiClient.getTrialPL(companyId, fiscalYear, fromM, toM);

    const { parsePLResponse } = await import('../domain/accounting/pl-parser.js');
    const periodPL = parsePLResponse(plRes, toY, toM);

    // 期間PLを使って各分析を再実行
    const { calculateFinancialMetrics } = await import('../domain/finance/metrics-calculator.js');
    const { analyzeCashFlow } = await import('../domain/cashflow/cashflow-analyzer.js');
    const { calculateBankingMetrics } = await import('../domain/banking/banking-evaluator.js');
    const { detectAnomalies } = await import('../domain/accounting/anomaly-detector.js');
    const { runAllEvaluations } = await import('../evaluators/index.js');
    const { TemplateCommentaryProvider } = await import('../commentary/commentary-generator.js');
    const { createMonthlyComparison } = await import('../domain/accounting/comparison.js');

    const currentBS = baseReport.balanceSheet;
    const previousBS = null; // 期間レポートでは前期BSなし

    const financialMetrics = calculateFinancialMetrics(periodPL, currentBS);
    const cashFlowAnalysis = analyzeCashFlow(periodPL, currentBS, previousBS);
    const bankingMetrics = calculateBankingMetrics(periodPL, currentBS, financialMetrics);
    const anomalies = detectAnomalies(periodPL, null, currentBS, null);
    const evaluations = runAllEvaluations({
      currentPL: periodPL,
      previousPL: null,
      financialMetrics,
      cashFlowAnalysis,
      bankingMetrics,
    });

    const commentaryProvider = new TemplateCommentaryProvider();
    const comparison = createMonthlyComparison(periodPL, null);
    const commentary = await commentaryProvider.generate({
      currentPL: periodPL,
      previousPL: null,
      balanceSheet: currentBS,
      comparison,
      financialMetrics,
      cashFlowAnalysis,
      bankingMetrics,
      evaluations,
      anomalies,
    });

    const overallLevel = evaluations.reduce((best: string, e: any) => {
      const levels = ['critical', 'warning', 'fair', 'good', 'excellent'];
      return levels.indexOf(e.level) > levels.indexOf(best) ? e.level : best;
    }, 'critical');

    const periodReport = {
      ...baseReport,
      monthlyPL: periodPL,
      comparison,
      financialMetrics,
      cashFlowAnalysis,
      bankingMetrics,
      anomalies,
      evaluations,
      commentary,
      executiveSummary: {
        ...baseReport.executiveSummary,
        monthlyRevenue: periodPL.revenue,
        monthlyExpenses: periodPL.costOfSales + periodPL.sgaExpenses,
        monthlyProfit: periodPL.ordinaryIncome,
        revenueChangeRate: null,
        profitChangeRate: null,
        overallAssessment: overallLevel,
        keyMessage: commentary.executiveSummary,
      },
    };

    setCache(cacheKey, periodReport);
    return periodReport;
  } catch (error) {
    logger.warn('期間レポート構築に失敗:', error instanceof Error ? error.message : error);
    return null;
  }
}

// ダッシュボード
app.get('/', async (req, res) => {
  try {
    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;
    const dateParam = req.query.date as string | undefined;

    let selectedDate: string | null = dateParam || null;
    let fromMonth: string | null = fromParam || null;
    let toMonth: string | null = toParam || null;

    // 期間ラベル判定
    let periodLabel: string | null = null;
    if (fromMonth && toMonth) {
      const diff = monthDiff(fromMonth, toMonth);
      if (diff === 0) periodLabel = '1m';
      else if (diff === 2) periodLabel = '3m';
      else if (diff === 5) periodLabel = '6m';
      else if (diff === 11) periodLabel = '12m';
      else periodLabel = 'custom';
    }

    // to パラメータの月でレポート生成（指定がなければデフォルト=前月）
    let reportYear: number | undefined;
    let reportMonth: number | undefined;
    if (toMonth) {
      const [y, m] = toMonth.split('-').map(Number);
      if (y && m) { reportYear = y; reportMonth = m; }
    } else if (selectedDate) {
      const [y, m] = selectedDate.split('-').map(Number);
      if (y && m) { reportYear = y; reportMonth = m; }
    }
    const isDemo = req.session.user?.id === 'demo-user';
    const tenantIdForDash = getActiveTenantId(req) || undefined;
    const report = await buildReport(reportYear, reportMonth, isDemo, tenantIdForDash);

    // freee未接続・デモモードOFFの場合: DB(monthly_actuals)にアップロード済みデータがあるか確認
    if (!report) {
      if (tenantIdForDash && isSupabaseAvailable()) {
        try {
          const snapshots = await repo.getAllMonthlyActuals(tenantIdForDash);
          if (snapshots.length > 0) {
            res.send(renderUploadedDashboard(snapshots, req));
            return;
          }
        } catch (e) {
          logger.warn('DB読み込みに失敗', e);
        }
      }
      res.send(renderNoDataDashboard(req));
      return;
    }

    // from/to指定時は期間に合わせた月数でトレンドデータを取得
    let trendMonthCount = 6; // デフォルト
    let trendEndYear = reportYear;
    let trendEndMonth = reportMonth;
    if (fromMonth && toMonth) {
      const diff = monthDiff(fromMonth, toMonth);
      trendMonthCount = diff + 1; // from〜to の月数
      const [ty, tm] = toMonth.split('-').map(Number);
      if (ty && tm) { trendEndYear = ty; trendEndMonth = tm; }
    }
    const trend = await buildTrendData(trendEndYear, trendEndMonth, trendMonthCount, isDemo, getActiveTenantId(req) || undefined);

    // 期間合計を算出（KPIカード用）
    const periodTotals = trend.months.length > 0 ? {
      revenue: trend.months.reduce((s, m) => s + m.revenue, 0),
      ordinaryIncome: trend.months.reduce((s, m) => s + m.ordinaryIncome, 0),
      operatingIncome: trend.months.reduce((s, m) => s + m.operatingIncome, 0),
      cashAndDeposits: trend.months[trend.months.length - 1].cashAndDeposits, // 最新月の残高
    } : null;

    // 期間指定時はレポート全体を期間累計で再構築
    let dashReport = report;
    if (fromMonth && toMonth && fromMonth !== toMonth) {
      const periodReport = await buildPeriodReport(report, fromMonth, toMonth, getActiveTenantId(req) || undefined);
      if (periodReport) dashReport = periodReport;
    }

    res.send(renderDashboardHTML(dashReport, trend, { selectedDate, fromMonth, toMonth, periodLabel, periodTotals }));

    // 自動学習トリガー（非同期、レスポンスをブロックしない）
    const autoLearnTenantId = getActiveTenantId(req);
    if (autoLearnTenantId && !isDemo) {
      learningService.tryAutoLearn(autoLearnTenantId);
    }
  } catch (error) {
    logger.error('ダッシュボード生成エラー', error);
    res.status(500).send('ダッシュボード生成に失敗しました');
  }
});

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty * 12 + tm) - (fy * 12 + fm);
}

// 月次レポート（HTML表示）
app.get('/report', async (req, res) => {
  try {
    const report = await buildReport(undefined, undefined, req.session.user?.id === 'demo-user', getActiveTenantId(req) || undefined);
    if (!report) { res.send(renderNoDataPage('月次レポート', 'freee APIと連携してデータを取得してください。')); return; }
    res.send(renderReportHTML(report));
  } catch (error) {
    logger.error('レポート生成エラー', error);
    res.status(500).send('レポート生成に失敗しました');
  }
});

// 月次レポート（PDFダウンロード）
app.get('/report/pdf', async (req, res) => {
  try {
    const report = await buildReport(undefined, undefined, req.session.user?.id === 'demo-user', getActiveTenantId(req) || undefined);
    if (!report) { res.status(400).send('データがありません'); return; }
    const html = renderReportHTML(report);

    logger.info('PDF生成を開始...');
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Chart.jsの描画完了を待ち、全Canvasを画像（img）に変換
    await page.evaluate(() => {
      // Puppeteer: このコールバックはブラウザ内で実行される。Node側のtscにはDOM型が
      // 無いため document/canvas を any 扱いにして型エラーを避ける（実行はブラウザで正常）。
      const document: any = (globalThis as { document?: unknown }).document;
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const canvases = document.querySelectorAll('canvas');
          canvases.forEach((canvas: any) => {
            try {
              const img = document.createElement('img');
              img.src = canvas.toDataURL('image/png');
              img.style.width = '100%';
              img.style.height = 'auto';
              img.style.maxHeight = canvas.parentElement?.style.height || '280px';
              canvas.parentElement?.replaceChild(img, canvas);
            } catch (e) {
              // ignore
            }
          });
          resolve();
        }, 1000); // Chart.jsアニメーション完了を待つ
      });
    });

    // CSSメディアをprintに切り替え（印刷用スタイル適用）
    await page.emulateMediaType('print');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="width:100%;font-size:8px;color:#999;padding:0 15mm;display:flex;justify-content:space-between">
          <span>${report.meta.companyName} 月次経営レポート</span>
          <span>${report.meta.reportMonth}</span>
        </div>`,
      footerTemplate: `
        <div style="width:100%;font-size:8px;color:#999;padding:0 15mm;display:flex;justify-content:space-between">
          <span>AI CFO v${report.meta.version}</span>
          <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
    });
    await browser.close();
    logger.info('PDF生成完了');

    const month = report.meta.reportMonth;
    const company = report.meta.companyName;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(company)}_${month}_report.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('PDF生成エラー', error);
    res.status(500).send('PDF生成に失敗しました');
  }
});

// 事業計画AIエージェント
app.get('/plan', async (req, res) => {
  try {
    const trend = await buildTrendData(undefined, undefined, 6, req.session.user?.id === 'demo-user', getActiveTenantId(req) || undefined);
    const files = getUploadedFiles();
    res.send(renderPlanHTML(trend, files));
  } catch (error) {
    logger.error('事業計画ページエラー', error);
    res.status(500).send('ページの生成に失敗しました');
  }
});

import { planExtractService } from '../services/plan-extract-service.js';

app.post('/plan/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).send('ファイルが選択されていません');
    return;
  }
  logger.info(`ファイルアップロード: ${req.file.originalname} → ${req.file.filename}`);

  // AI解析で数値抽出 → 目標に自動反映
  if (planExtractService.isAvailable()) {
    try {
      const result = await planExtractService.extractAndApply(req.file.path, req.file.originalname);
      clearCache();
      logger.info(`事業計画解析完了: 月次${result.monthlyTargets.length}件, 年間KPI${result.annualKpi ? 'あり' : 'なし'}, 確信度${result.confidence}`);
    } catch (e) {
      logger.warn('事業計画の自動解析に失敗（ファイルは保存済み）:', e instanceof Error ? e.message : e);
    }
  }

  res.redirect('/plan');
});

// 手動で再解析するAPI
app.post('/plan/analyze-file', express.json(), async (req, res) => {
  const filename = req.body.filename;
  if (!filename || filename.includes('..') || filename.includes('/')) {
    res.status(400).json({ error: '不正なファイル名' });
    return;
  }
  if (!planExtractService.isAvailable()) {
    res.status(400).json({ error: 'Vertex AI の認証が未設定です' });
    return;
  }
  const filePath = path.join(uploadDir, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'ファイルが見つかりません' });
    return;
  }
  try {
    const result = await planExtractService.extractAndApply(filePath, filename);
    clearCache();
    res.json({
      ok: true,
      monthlyCount: result.monthlyTargets.length,
      hasAnnualKpi: !!result.annualKpi,
      customKpiCount: result.customKpis.length,
      customKpiNames: result.customKpis.map(ck => ck.name),
      confidence: result.confidence,
      notes: result.notes,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : '解析に失敗しました' });
  }
});

// ファイル削除
app.post('/plan/delete', express.json(), async (req, res) => {
  const filename = req.body.filename;
  if (!filename || filename.includes('..') || filename.includes('/')) {
    res.status(400).json({ error: '不正なファイル名' });
    return;
  }
  const filePath = path.join(uploadDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    logger.info(`ファイル削除: ${filename}`);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'ファイルが見つかりません' });
  }
});

app.post('/plan/delete-all', (_req, res) => {
  const files = fs.readdirSync(uploadDir).filter(f => !f.startsWith('.'));
  for (const f of files) {
    fs.unlinkSync(path.join(uploadDir, f));
  }
  logger.info(`全ファイル削除: ${files.length}件`);
  res.json({ ok: true, count: files.length });
});

// === 計画分析API（Claude） ===
import { planAnalysisService } from '../services/plan-analysis-service.js';

// 計画データ取得
app.get('/api/plan', async (req, res) => {
  res.json(await planAnalysisService.getPlan(getActiveTenantId(req) || undefined));
});

// 月次目標を設定/更新
app.post('/api/plan/targets', express.json(), async (req, res) => {
  const targets: Array<{ year: number; month: number; revenue: number; grossProfit: number; ordinaryIncome: number }> = req.body.targets || [];
  for (const t of targets) {
    await planAnalysisService.setTarget(t, getActiveTenantId(req) || undefined);
  }
  clearCache();
  res.json({ ok: true, count: targets.length });
});

// 月次目標を全クリア
app.post('/api/plan/targets/clear', async (req, res) => {
  await planAnalysisService.savePlan({ targets: [], updatedAt: '', notes: '' }, getActiveTenantId(req) || undefined);
  clearCache();
  logger.info('月次目標を全クリアしました');
  res.json({ ok: true });
});

// 計画 vs 実績の差分分析を実行（Claude）
app.post('/api/plan/analyze', express.json(), async (req, res) => {
  try {
    if (!planAnalysisService.isAvailable()) {
      res.status(400).json({ error: 'Vertex AI の認証が未設定です' });
      return;
    }

    const trend = await buildTrendData(undefined, undefined, 6, req.session.user?.id === 'demo-user', getActiveTenantId(req) || undefined);
    const plan = await planAnalysisService.getPlan(getActiveTenantId(req) || undefined);

    if (plan.targets.length === 0) {
      res.status(400).json({ error: '計画データが未設定です。先に月次目標を入力してください。' });
      return;
    }

    const futureMonths = req.body.futureMonths || 3;
    const result = await planAnalysisService.analyzePlanVariance(getActiveTenantId(req)!,
      trend.months,
      plan.targets,
      futureMonths,
    );

    res.json(result);
  } catch (error) {
    logger.error('計画分析エラー', error);
    res.status(500).json({ error: error instanceof Error ? error.message : '分析に失敗しました' });
  }
});

// 修正計画を反映
app.post('/api/plan/apply', express.json(), async (req, res) => {
  const targets = req.body.targets || [];
  await planAnalysisService.applyRevisedTargets(targets, getActiveTenantId(req) || undefined);
  res.json({ ok: true, count: targets.length });
});

// 年間KPI目標の保存
import { saveAnnualKpi, loadAnnualKpi } from './plan-renderer.js';

app.get('/api/plan/kpi', (_req, res) => {
  res.json(loadAnnualKpi());
});

app.post('/api/plan/kpi', express.json(), async (req, res) => {
  const kpi = {
    fiscalYear: req.body.fiscalYear || '',
    targetRevenue: Number(req.body.targetRevenue) || 0,
    targetProfit: Number(req.body.targetProfit) || 0,
    targetMargin: Number(req.body.targetMargin) || 0,
    targetEquityRatio: Number(req.body.targetEquityRatio) || 0,
    targetProductivity: Number(req.body.targetProductivity) || 0,
    employeeCount: Number(req.body.employeeCount) || 1,
    customKpis: Array.isArray(req.body.customKpis) ? req.body.customKpis : [],
  };
  saveAnnualKpi(kpi);
  logger.info(`年間KPI目標を保存: ${kpi.fiscalYear}`);
  res.json({ ok: true });
});

// 分析履歴
app.get('/api/plan/history', async (req, res) => {
  res.json(await planAnalysisService.getHistory(getActiveTenantId(req) || undefined));
});

// === 学習ループAPI ===

// 学習実行
app.post('/api/learn', async (_req, res) => {
  try {
    if (!learningService.isAvailable()) {
      res.status(400).json({ error: 'Vertex AI の認証が未設定です' });
      return;
    }
    const result = await learningService.runLearningCycle();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : '学習に失敗しました' });
  }
});

app.get('/api/learn/insights', async (_req, res) => {
  const insights = await learningService.getInsights();
  res.json(insights);
});

// 財務分析AIエージェント
app.get('/agent/finance', async (req, res) => {
  try {
    // デモモード
    const demoProfile = getDemoProfile();
    if (demoProfile) {
      logger.info(`デモモード財務分析: ${demoProfile.companyName}`);
      res.send(renderRatingHTML(demoProfile.rating, demoProfile.additional, {
        aiAvailable: true,
        aiCommentary: demoProfile.aiCommentary,
        source: 'freee',
      }));
      return;
    }

    // freee接続時は自動的にfreeeデータで表示
    const token = await getFreeeToken(getActiveTenantId(req) || undefined);
    if (token && await getSelectedCompanyId(getActiveTenantId(req) || undefined)) {
      res.redirect('/agent/finance/freee');
      return;
    }
    // freee未接続・デモモードOFF → データなしメッセージ
    res.send(renderNoDataPage('財務分析AI', '財務分析を行うには、freee APIとの連携が必要です。'));
  } catch (error) {
    logger.error('財務分析ページエラー', error);
    res.send(renderNoDataPage('財務分析AI', '財務分析の読み込み中にエラーが発生しました。'));
  }
});

// 財務分析：決算書アップロード → AI分析

/**
 * CSV/TXT の文字コードを自動判定してデコードする。
 * まず UTF-8 として読み、変換不能文字(U+FFFD)が出たら日本語会計ソフト(弥生等)で
 * 多い Shift_JIS(CP932) とみなして再デコードする。UTF-8(BOM有無問わず)や freee 書き出しは
 * そのまま UTF-8 で扱う。
 */
function decodeUploadedText(buf: Buffer): string {
  const utf8 = buf.toString('utf-8');
  if (utf8.includes('�')) {
    try {
      const sjis = iconv.decode(buf, 'Shift_JIS');
      // 再デコードで U+FFFD が減った(=SJISの方が妥当)なら採用
      if (!sjis.includes('�') || sjis.split('�').length < utf8.split('�').length) {
        return sjis;
      }
    } catch {
      /* フォールバックは UTF-8 */
    }
  }
  return utf8;
}

/**
 * 複数アップロードファイルを1つのテキストに結合する。
 * BS(貸借対照表)と PL(損益計算書)が別CSV/PDFでも、まとめて1つの資料として
 * AI に渡せるようにする。2件以上のときはファイル名の見出しを付けて区切る。
 * CSV/TXT は文字コードを自動判定(UTF-8/Shift_JIS)する。
 */
async function readUploadedFilesAsText(
  files: Express.Multer.File[],
): Promise<{ text: string; names: string[] }> {
  const names: string[] = [];
  const parts: string[] = [];
  for (const f of files) {
    names.push(f.originalname);
    const ext = path.extname(f.originalname).toLowerCase();
    const raw = fs.readFileSync(f.path);
    const t = ext === '.pdf'
      ? await anthropicService.extractTextFromPDF(raw, f.originalname)
      : decodeUploadedText(raw);
    parts.push(files.length > 1 ? `===== ファイル: ${f.originalname} =====\n${t}` : t);
  }
  return { text: parts.join('\n\n'), names };
}

/**
 * ダッシュボード用: 単月試算表 or 年度決算書のアップロード。
 * Gemini で PL/BS を1件抽出し monthly_actuals に upsert。
 * BS/PL が別ファイルのケースに対応し、複数ファイルを結合して1件として抽出する。
 */
app.post('/agent/finance/upload-snapshot', upload.array('files', 10), async (req, res) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) || [];
    if (files.length === 0) { res.redirect('/?upload_error=' + encodeURIComponent('ファイルが選択されていません')); return; }
    if (!anthropicService.isAvailable()) { res.redirect('/?upload_error=' + encodeURIComponent('Vertex AIが未設定です')); return; }
    const tenantId = getActiveTenantId(req);
    if (!tenantId) { res.redirect('/?upload_error=' + encodeURIComponent('テナントが選択されていません')); return; }

    const { text, names } = await readUploadedFilesAsText(files);
    const sourceName = names.join(', ');

    const { snapshot, extractionNotes } = await anthropicService.extractMonthlySnapshot(text, sourceName);
    await repo.upsertMonthlyActual(tenantId, snapshot);
    logger.info(`単月スナップショット保存: ${snapshot.year}年${snapshot.month}月 (${sourceName})`);

    clearCache();
    const noteParam = extractionNotes.length > 0 ? '&notes=' + encodeURIComponent(extractionNotes.join('; ')) : '';
    res.redirect(`/?uploaded=snapshot&period=${snapshot.year}-${snapshot.month}${noteParam}`);
  } catch (error: any) {
    logger.error('単月アップロードエラー', error);
    res.redirect('/?upload_error=' + encodeURIComponent(error?.message || 'アップロード処理に失敗しました'));
  }
});

/**
 * ダッシュボード用: 月次推移試算表のアップロード。
 * Gemini で複数月分の PL/BS を抽出し monthly_actuals に upsert。
 */
app.post('/agent/finance/upload-trend', upload.array('files', 10), async (req, res) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) || [];
    if (files.length === 0) { res.redirect('/?upload_error=' + encodeURIComponent('ファイルが選択されていません')); return; }
    if (!anthropicService.isAvailable()) { res.redirect('/?upload_error=' + encodeURIComponent('Vertex AIが未設定です')); return; }
    const tenantId = getActiveTenantId(req);
    if (!tenantId) { res.redirect('/?upload_error=' + encodeURIComponent('テナントが選択されていません')); return; }

    const { text, names } = await readUploadedFilesAsText(files);
    const sourceName = names.join(', ');

    const { snapshots, extractionNotes } = await anthropicService.extractMonthlyTrend(text, sourceName);
    if (snapshots.length === 0) {
      res.redirect('/?upload_error=' + encodeURIComponent('月次データを抽出できませんでした'));
      return;
    }
    for (const s of snapshots) {
      await repo.upsertMonthlyActual(tenantId, s);
    }
    logger.info(`月次推移保存: ${snapshots.length}か月分 (${sourceName})`);

    clearCache();
    const noteParam = extractionNotes.length > 0 ? '&notes=' + encodeURIComponent(extractionNotes.join('; ')) : '';
    res.redirect(`/?uploaded=trend&count=${snapshots.length}${noteParam}`);
  } catch (error: any) {
    logger.error('月次推移アップロードエラー', error);
    res.redirect('/?upload_error=' + encodeURIComponent(error?.message || 'アップロード処理に失敗しました'));
  }
});

app.post('/agent/finance/analyze', upload.array('files', 10), async (req, res) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) || [];
    if (files.length === 0) {
      res.status(400).send('ファイルが選択されていません');
      return;
    }

    if (!anthropicService.isAvailable()) {
      res.status(400).send('Vertex AI の認証が未設定です');
      return;
    }

    // 複数ファイル（BS/PLが別ファイル等）を結合。CSV/TXT は文字コード自動判定。
    const { text: documentText, names } = await readUploadedFilesAsText(files);
    const fileName = names.join(', ');

    logger.info(`決算書分析開始: ${fileName}`);

    // AIで財務データを抽出
    const { ratingInput, extractionNotes } = await anthropicService.extractFinancialData(documentText, fileName);

    // 格付計算
    const rating = calculateBankRating(ratingInput);
    const additional = calculateAdditionalMetrics(ratingInput);

    // AI解説を生成
    let aiCommentary: string | null = null;
    try {
      aiCommentary = await anthropicService.generateAnalysisCommentary(
        JSON.stringify(rating, null, 2),
        JSON.stringify(additional, null, 2),
      );
    } catch (e) {
      logger.warn('AIコメント生成をスキップしました', e);
    }

    // 分析結果を保存
    const analysisId = await analysisStore.save(getActiveTenantId(req)!, {
      fileName,
      source: 'upload',
      ratingInput,
      rating,
      additional,
      aiCommentary,
      extractionNotes,
    });

    // 改善アクションからタスクを自動生成
    if (rating.actions.length > 0) {
      await taskService.generateFromAnalysis(getActiveTenantId(req)!, analysisId, rating.actions);
      logger.info(`分析結果から${rating.actions.length}件のタスクを自動生成しました`);
    }

    res.send(renderRatingHTML(rating, additional, {
      aiAvailable: true,
      aiCommentary,
      source: 'upload',
      fileName,
      extractionNotes,
      analysisId,
    }));
  } catch (error) {
    logger.error('決算書分析エラー', error);
    res.status(500).send(`分析に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
});

// 財務分析：freeeデータ分析のローディング画面
app.get('/agent/finance/freee', async (req, res) => {
  res.send(renderAnalysisLoadingHTML('freee'));
});

// 財務分析：freeeデータからAI分析（API）
app.get('/api/finance/freee', async (req, res) => {
  try {
    let input: import('../types/bank-rating.js').RatingInput;

    const token = await getFreeeToken(getActiveTenantId(req) || undefined);
    if (token && await getSelectedCompanyId(getActiveTenantId(req) || undefined)) {
      // freee実データからRatingInputを組み立てる
      // 会計年度の累計PL + 最新月のBSを取得
      const auth = new FreeeAuthClient({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
      });
      const freeeService = new FreeeService(auth);
      const companyId = await getSelectedCompanyId(getActiveTenantId(req) || undefined);
      if (!companyId) { res.status(400).json({ error: '事業所が未選択です' }); return; }

      // 事業所の会計年度を取得
      const companyDetail = await freeeService.getCompanyDetail(companyId);
      const fiscalYears: Array<{ start_date: string; end_date: string }> = companyDetail.fiscal_years || [];
      logger.info(`事業所の会計年度一覧: ${JSON.stringify(fiscalYears)}`);

      // 最新の会計年度を特定
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
      const currentFY = fiscalYears.find(fy => todayStr >= fy.start_date && todayStr <= fy.end_date)
        || fiscalYears.sort((a, b) => b.start_date.localeCompare(a.start_date))[0];

      if (!currentFY) throw new Error('会計年度が見つかりません');

      const fyStartYear = parseInt(currentFY.start_date.substring(0, 4));
      const fyStartMonth = parseInt(currentFY.start_date.substring(5, 7));
      const fyEndMonth = parseInt(currentFY.end_date.substring(5, 7));

      // 現在月または会計年度末月のいずれか早い方まで
      const currentMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // 前月
      const endMonth = Math.min(currentMonth, fyEndMonth) || fyEndMonth;

      logger.info(`会計年度累計PL取得: fiscal_year=${fyStartYear} ${fyStartMonth}月〜${endMonth}月`);

      // 累計PL（会計年度の期首〜直近月）と最新BSを並列取得
      const { FreeeApiClient: ApiClient } = await import('../clients/freee-api.js');
      const freeeApi = new ApiClient(auth);
      const [annualPLRes, latestBSRes] = await Promise.all([
        freeeApi.getTrialPL(companyId, fyStartYear, fyStartMonth, endMonth),
        freeeApi.getTrialBS(companyId, fyStartYear, endMonth, endMonth),
      ]);

      const { parsePLResponse } = await import('../domain/accounting/pl-parser.js');
      const { parseBSResponse } = await import('../domain/accounting/bs-parser.js');
      const annualPL = parsePLResponse(annualPLRes, now.getFullYear(), endMonth);
      const bs = parseBSResponse(latestBSRes, now.getFullYear(), endMonth);

      const monthsElapsed = ((endMonth - fyStartMonth + 12) % 12) + 1;

      input = {
        totalAssets: bs.totalAssets,
        currentAssets: bs.currentAssets,
        fixedAssets: bs.fixedAssets,
        currentLiabilities: bs.currentLiabilities,
        fixedLiabilities: bs.fixedLiabilities,
        netAssets: bs.netAssets,
        interestBearingDebt: 0,
        cashAndDeposits: bs.cashAndDeposits,

        // PL（累計実数値をそのまま使用）
        revenue: annualPL.revenue,
        operatingIncome: annualPL.operatingIncome,
        ordinaryIncome: annualPL.ordinaryIncome,
        netIncome: annualPL.netIncome,
        interestExpense: annualPL.nonOperatingExpenses,
        interestIncome: annualPL.nonOperatingIncome,
        depreciation: 0,

        prevOrdinaryIncome: null,
        prevTotalAssets: null,
        annualDebtRepayment: null,
        profitFlowHistory: [
          annualPL.ordinaryIncome > 0 ? 'positive' : annualPL.ordinaryIncome < 0 ? 'negative' : 'zero',
          'positive',
          'positive',
        ],
      };
      logger.info(`freee累計データで格付分析: 累計${monthsElapsed}か月 売上=${annualPL.revenue} 経常利益=${annualPL.ordinaryIncome}`);
    } else {
      input = createMockRatingInput();
    }

    const rating = calculateBankRating(input);
    const additional = calculateAdditionalMetrics(input);

    let aiCommentary: string | null = null;
    if (anthropicService.isAvailable()) {
      try {
        aiCommentary = await anthropicService.generateAnalysisCommentary(
          JSON.stringify(rating, null, 2),
          JSON.stringify(additional, null, 2),
        );
      } catch (e) {
        logger.warn('AIコメント生成をスキップしました', e);
      }
    }

    const analysisId = await analysisStore.save(getActiveTenantId(req)!, {
      fileName: null,
      source: 'freee',
      ratingInput: input,
      rating,
      additional,
      aiCommentary,
      extractionNotes: [],
    });

    res.send(renderRatingHTML(rating, additional, {
      aiAvailable: anthropicService.isAvailable(),
      aiCommentary,
      source: 'freee',
      analysisId,
    }));
  } catch (error) {
    logger.error('freee分析エラー', error);
    const errMsg = error instanceof Error ? error.message : '分析に失敗しました';
    res.status(500).send(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>分析エラー</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1a7f8f;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#fff}.box{text-align:center;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);border-radius:16px;padding:40px 48px;max-width:440px}h1{font-size:18px;font-weight:700;margin:0 0 12px}p{font-size:14px;opacity:0.85;margin:0 0 24px;line-height:1.6}.links{display:flex;gap:12px;justify-content:center}a{display:inline-block;background:#fff;color:#1a7f8f;padding:12px 36px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none}a:hover{opacity:0.85}a.secondary{background:rgba(255,255,255,0.2);color:#fff}</style></head><body><div class="box"><h1>分析に失敗しました</h1><p>${errMsg.replace(/</g, '&lt;')}</p><div class="links"><a href="/">ダッシュボードへ</a><a href="/auth/freee" class="secondary">freee再認証</a></div></div></body></html>`);
  }
});

// 分析履歴一覧
app.get('/agent/finance/history', async (req, res) => {
  const analyses = await analysisStore.list(getActiveTenantId(req)!);
  res.send(renderHistoryHTML(analyses));
});

// 保存済み分析の詳細表示
app.get('/agent/finance/history/:id', async (req, res) => {
  const analysis = await analysisStore.get(req.params.id);
  if (!analysis) {
    res.status(404).send('分析結果が見つかりません');
    return;
  }
  res.send(renderRatingHTML(analysis.rating, analysis.additional, {
    aiAvailable: true,
    aiCommentary: analysis.aiCommentary,
    source: analysis.source as 'upload' | 'freee' | 'mock',
    fileName: analysis.fileName ?? undefined,
    extractionNotes: analysis.extractionNotes,
    analysisId: analysis.id,
    savedAt: analysis.createdAt,
  }));
});

// 分析結果の削除
app.post('/agent/finance/history/:id/delete', async (req, res) => {
  await analysisStore.delete(req.params.id);
  res.redirect('/agent/finance/history');
});

app.post('/agent/finance/history/delete-all', async (req, res) => {
  const all = await analysisStore.list(getActiveTenantId(req)!);
  for (const a of all) {
    await analysisStore.delete(a.id);
  }
  logger.info(`分析履歴を全件削除: ${all.length}件`);
  res.redirect('/agent/finance/history');
});

// 分析結果のJSONダウンロード
app.get('/agent/finance/history/:id/json', async (req, res) => {
  const analysis = await analysisStore.get(req.params.id);
  if (!analysis) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.setHeader('Content-Disposition', `attachment; filename="${analysis.id}.json"`);
  res.json(analysis);
});

/** テナントの決算月を取得（Supabase 未接続や未設定なら null） */
async function fetchFiscalMonth(req: express.Request): Promise<number | null> {
  const tid = getActiveTenantId(req);
  if (!tid || !isSupabaseAvailable()) return null;
  try {
    return await repo.getTenantFiscalMonth(tid);
  } catch (e) {
    logger.warn('決算月取得失敗', e);
    return null;
  }
}

/**
 * 選択中の会計年度を取得。
 * セッションにあればそれ、無ければDBから復元してセッションに戻す。
 */
async function fetchFiscalYear(req: express.Request): Promise<number | null> {
  if (req.session.activeFiscalYear) return req.session.activeFiscalYear;
  const tid = getActiveTenantId(req);
  if (!tid || !isSupabaseAvailable()) return null;
  try {
    const year = await repo.getTenantActiveFiscalYear(tid);
    if (year) req.session.activeFiscalYear = year;
    return year;
  } catch (e) {
    logger.warn('会計年度復元失敗', e);
    return null;
  }
}

/** テナントの仕訳ルール一覧を取得（有効なものだけ）。AIプロンプトに渡す用 */
async function fetchActiveJournalRules(req: express.Request): Promise<string[]> {
  const tid = getActiveTenantId(req);
  if (!tid || !isSupabaseAvailable()) return [];
  try {
    const rules = await repo.listJournalRules(tid);
    return rules.filter(r => r.enabled).map(r => r.ruleText);
  } catch (e) {
    logger.warn('仕訳ルール取得失敗', e);
    return [];
  }
}

/** テナントの確定済みバッチ最近分を取得（Supabase未接続なら空配列） */
async function fetchRecentBatches(req: express.Request): Promise<repo.JournalBatchRow[]> {
  const tid = getActiveTenantId(req);
  if (!tid || !isSupabaseAvailable()) return [];
  try { return await repo.listJournalBatches(tid, 30); } catch { return []; }
}

// 会計AIエージェント
app.get('/agent/accounting', async (req, res) => {
  res.send(renderAccountingPageHTML({
    aiAvailable: receiptService.isAvailable() || isDemoMode(),
    fiscalMonth: await fetchFiscalMonth(req),
    fiscalYear: await fetchFiscalYear(req),
    recentBatches: await fetchRecentBatches(req),
  }));
});

// ========== 仕訳ルール API ==========
app.get('/api/journal-rules', async (req, res) => {
  try {
    const tid = getActiveTenantId(req);
    if (!tid) { res.json({ rules: [] }); return; }
    const rules = await repo.listJournalRules(tid);
    res.json({ rules });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

app.post('/api/journal-rules', express.json(), async (req, res) => {
  try {
    const tid = getActiveTenantId(req);
    if (!tid) { res.status(403).json({ error: 'テナント未選択' }); return; }
    const { ruleText, tags } = req.body as { ruleText?: string; tags?: string[] };
    if (!ruleText || !ruleText.trim()) { res.status(400).json({ error: 'ルール本文を入力してください' }); return; }
    const id = await repo.createJournalRule(tid, {
      ruleText: ruleText.trim(),
      tags: Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [],
    });
    res.json({ success: true, id });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

app.patch('/api/journal-rules/:id', express.json(), async (req, res) => {
  try {
    const tid = getActiveTenantId(req);
    if (!tid) { res.status(403).json({ error: 'テナント未選択' }); return; }
    const { ruleText, tags, enabled } = req.body as { ruleText?: string; tags?: string[]; enabled?: boolean };
    await repo.updateJournalRule(tid, req.params.id, {
      ruleText: ruleText !== undefined ? String(ruleText).trim() : undefined,
      tags: tags !== undefined ? (Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : []) : undefined,
      enabled,
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

app.delete('/api/journal-rules/:id', async (req, res) => {
  try {
    const tid = getActiveTenantId(req);
    if (!tid) { res.status(403).json({ error: 'テナント未選択' }); return; }
    await repo.deleteJournalRule(tid, req.params.id);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// 仕訳バッチを確定保存
app.post('/agent/accounting/confirm', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const tid = getActiveTenantId(req);
    if (!tid) { res.status(403).json({ error: 'テナントが選択されていません' }); return; }
    const { entries, label, source } = req.body as {
      entries?: any[]; label?: string; source?: string;
    };
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({ error: '仕訳データがありません' });
      return;
    }
    const dateLabel = new Date().toISOString().slice(0, 10);
    const batchId = await repo.createJournalBatch(tid, {
      label: label || `仕訳データ ${dateLabel}`,
      source: source || undefined,
      createdBy: req.session.user?.id,
      entries: entries.map(e => ({
        date: e.date,
        debitAccount: e.debitAccount,
        creditAccount: e.creditAccount,
        amount: Number(e.amount) || 0,
        taxCategory: e.taxCategory || undefined, taxRate: Number(e.taxRate) || 10,
        taxAmount: Number(e.taxAmount) || 0,
        description: e.description || '',
        partnerName: e.partnerName || '',
        receiptType: e.receiptType,
      })),
    });
    res.json({ success: true, batchId });
  } catch (e: any) {
    logger.error('仕訳確定エラー', e);
    res.status(500).json({ error: e?.message || '保存に失敗しました' });
  }
});

// 確定済みバッチ一覧（JSON）
app.get('/api/accounting/batches', async (req, res) => {
  try {
    const tid = getActiveTenantId(req);
    if (!tid) { res.json({ batches: [] }); return; }
    const batches = await repo.listJournalBatches(tid, 100);
    res.json({ batches });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// バッチ詳細ページ
app.get('/agent/accounting/batch/:id', async (req, res) => {
  try {
    const tid = getActiveTenantId(req);
    if (!tid) { res.redirect('/agent/accounting'); return; }
    const batch = await repo.getJournalBatch(tid, req.params.id);
    if (!batch) { res.status(404).send(renderErrorHTML(404, '仕訳データが見つかりません')); return; }
    const entries = await repo.getJournalEntries(tid, req.params.id);
    const fiscalMonth = await fetchFiscalMonth(req);

    // freee送信結果バナー（リダイレクト経由で受け取る）
    const freeeQuery = req.query.freee as string | undefined;
    const summary = req.query.summary as string | undefined;
    let freeeStatus: 'success' | 'already' | 'demo' | 'noauth' | 'nocompany' | 'error' | undefined;
    if (freeeQuery === '1') freeeStatus = 'success';
    else if (freeeQuery === 'already') freeeStatus = 'already';
    else if (freeeQuery === 'demo') freeeStatus = 'demo';
    else if (freeeQuery === 'noauth') freeeStatus = 'noauth';
    else if (freeeQuery === 'nocompany') freeeStatus = 'nocompany';
    else if (freeeQuery === 'error') freeeStatus = 'error';

    const { renderBatchDetailHTML } = await import('./accounting-page.js');
    res.send(renderBatchDetailHTML({ batch, entries, fiscalMonth, freeeStatus, freeeStatusMessage: summary }));
  } catch (e: any) {
    logger.error('バッチ詳細表示エラー', e);
    res.status(500).send(renderErrorHTML(500, '仕訳データの表示に失敗しました'));
  }
});

// バッチ内の仕訳を一括更新
app.post('/agent/accounting/batch/:id/update', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const tid = getActiveTenantId(req);
    if (!tid) { res.status(403).json({ error: 'テナント未選択' }); return; }
    const batch = await repo.getJournalBatch(tid, req.params.id);
    if (!batch) { res.status(404).json({ error: '仕訳データが見つかりません' }); return; }
    const { entries } = req.body as { entries?: any[] };
    if (!entries || !Array.isArray(entries)) {
      res.status(400).json({ error: '仕訳データが不正です' });
      return;
    }
    await repo.replaceJournalEntries(tid, req.params.id, entries.map(e => ({
      date: e.date,
      debitAccount: e.debitAccount,
      creditAccount: e.creditAccount,
      amount: Number(e.amount) || 0,
      taxCategory: e.taxCategory || undefined, taxRate: Number(e.taxRate) || 10,
      taxAmount: Number(e.taxAmount) || 0,
      description: e.description || '',
      partnerName: e.partnerName || '',
      receiptType: e.receiptType,
    })));
    res.json({ success: true });
  } catch (e: any) {
    logger.error('バッチ更新エラー', e);
    res.status(500).json({ error: e?.message || '更新に失敗しました' });
  }
});

// バッチごと削除
app.post('/agent/accounting/batch/:id/delete', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const tid = getActiveTenantId(req);
    if (!tid) { res.redirect('/agent/accounting'); return; }
    await repo.deleteJournalBatch(tid, req.params.id);
    res.redirect('/agent/accounting');
  } catch (e: any) {
    logger.error('バッチ削除エラー', e);
    res.redirect('/agent/accounting');
  }
});

// 会社情報ページ
app.get('/settings/company-info', async (req, res) => {
  try {
    const tid = getActiveTenantId(req);
    if (!tid) { res.redirect('/'); return; }
    const profile = await repo.getTenantProfile(tid);
    const fiscalMonth = await fetchFiscalMonth(req);
    const fiscalYear = await fetchFiscalYear(req);
    const customRules = await fetchActiveJournalRules(req);
    res.send(renderCompanyInfoHTML({
      profile, fiscalMonth,
      success: req.query.saved === '1' ? '保存しました' : undefined,
    }));
  } catch (e: any) {
    logger.error('会社情報表示エラー', e);
    res.status(500).send(renderErrorHTML(500, '会社情報の表示に失敗しました'));
  }
});

// 会社情報を保存
app.post('/settings/company-info', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const tid = getActiveTenantId(req);
    if (!tid) { res.redirect('/settings/company-info'); return; }
    const b = req.body;
    const fmRaw = b.fiscalMonth as string | undefined;
    const fiscalMonth = fmRaw && fmRaw !== '' ? parseInt(fmRaw, 10) : null;
    if (fiscalMonth !== null && (isNaN(fiscalMonth) || fiscalMonth < 1 || fiscalMonth > 12)) {
      res.redirect('/settings/company-info'); return;
    }
    await repo.upsertTenantProfile(tid, {
      companyName: (b.companyName || '').trim() || null,
      postalCode: (b.postalCode || '').trim() || null,
      address: (b.address || '').trim() || null,
      phone: (b.phone || '').trim() || null,
      representative: (b.representative || '').trim() || null,
      establishedDate: (b.establishedDate || '').trim() || null,
      corporateNumber: (b.corporateNumber || '').trim() || null,
      invoiceRegistered: b.invoiceRegistered === '1',
      invoiceNumber: (b.invoiceNumber || '').trim() || null,
      industry: (b.industry || '').trim() || null,
      employeeCount: (b.employeeCount || '').trim() || null,
      notes: (b.notes || '').trim() || null,
    });
    // 決算月は tenants テーブル側にも同期
    await repo.setTenantFiscalMonth(tid, fiscalMonth);
    res.redirect('/settings/company-info?saved=1');
  } catch (e: any) {
    logger.error('会社情報保存エラー', e);
    res.status(500).send(renderErrorHTML(500, e?.message || '会社情報の保存に失敗しました'));
  }
});

// 仕訳生成対象の会計年度を切り替え（セッション + DB 両方に保存）
app.post('/agent/accounting/fiscal-year', express.urlencoded({ extended: true }), async (req, res) => {
  const raw = req.body.fiscalYear as string | undefined;
  const year = raw && raw !== '' ? parseInt(raw, 10) : NaN;
  if (!isNaN(year) && year >= 1900 && year <= 3000) {
    req.session.activeFiscalYear = year;
    // DBにも永続化（次回ログイン時のデフォルト表示用）
    const tid = getActiveTenantId(req);
    if (tid && isSupabaseAvailable()) {
      try { await repo.setTenantActiveFiscalYear(tid, year); }
      catch (e) { logger.warn('会計年度のDB保存失敗', e); }
    }
  }
  req.session.save(() => res.redirect('/agent/accounting'));
});

// 決算月を保存
app.post('/agent/accounting/fiscal-month', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const tid = getActiveTenantId(req);
    if (!tid) { res.redirect('/agent/accounting'); return; }
    const raw = req.body.fiscalMonth as string | undefined;
    const month = raw && raw !== '' ? parseInt(raw, 10) : null;
    if (month !== null && (isNaN(month) || month < 1 || month > 12)) {
      res.redirect('/agent/accounting');
      return;
    }
    await repo.setTenantFiscalMonth(tid, month);
    res.redirect('/agent/accounting');
  } catch (e: any) {
    logger.error('決算月保存エラー', e);
    res.redirect('/agent/accounting');
  }
});

// 会計AI：領収書・PDFの解析（複数ファイル対応）
import { DEMO_ANALYSIS_RESULT } from '../services/demo-mode.js';

app.post('/agent/accounting/analyze', upload.array('file', 20), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) { res.status(400).send('ファイルが選択されていません'); return; }

    // デモモード: プリセット仕訳データを返す
    if (isDemoMode()) {
      logger.info(`デモモード: 会計AI解析 (${files.length}ファイル) → プリセットデータ`);
      res.send(renderAccountingPageHTML({ aiAvailable: true, analysis: DEMO_ANALYSIS_RESULT }));
      return;
    }

    if (!receiptService.isAvailable()) { res.status(400).send('Vertex AI の認証が未設定です'); return; }

    // チャットメモリから業種を取得（学習ルール適用のため）
    const memory = await chatService.getMemory(getActiveTenantId(req) || undefined);
    const industry = memory.industry || undefined;
    const fiscalMonth = await fetchFiscalMonth(req);
    const fiscalYear = await fetchFiscalYear(req);
    const customRules = await fetchActiveJournalRules(req);

    if (files.length === 1) {
      // 1ファイルの場合：従来通り個別解析
      const file = files[0];
      const ext = path.extname(file.originalname).toLowerCase();
      const buffer = fs.readFileSync(file.path);
      const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };

      let analysis;
      if (ext === '.csv') {
        const csvText = fs.readFileSync(file.path, 'utf-8');
        analysis = await receiptService.analyzeCSV(csvText, file.originalname, industry, fiscalMonth, fiscalYear, customRules);
      } else if (ext === '.pdf') {
        analysis = await receiptService.analyzeReceiptPDF(buffer, file.originalname, industry, fiscalMonth, fiscalYear, customRules);
      } else {
        const mimeType = mimeMap[ext] || 'image/jpeg';
        analysis = await receiptService.analyzeReceiptImage(buffer, mimeType, file.originalname, industry, fiscalMonth, fiscalYear, customRules);
      }
      // レシートファイル情報を仕訳データに付与（freee添付用）
      for (const entry of analysis.entries) {
        entry.receiptFilePath = file.path;
        entry.receiptFileName = file.originalname;
        entry.receiptMimeType = mimeMap[ext] || 'application/octet-stream';
      }
      res.send(renderAccountingPageHTML({ aiAvailable: true, analysis, fiscalMonth }));
    } else {
      // 複数ファイルの場合
      const imageFiles = files.filter(f => {
        const e = path.extname(f.originalname).toLowerCase();
        return e !== '.pdf' && e !== '.csv';
      });
      const pdfFiles = files.filter(f => f.originalname.toLowerCase().endsWith('.pdf'));
      const csvFiles = files.filter(f => f.originalname.toLowerCase().endsWith('.csv'));

      const allEntries: JournalEntry[] = [];
      const allNotes: string[] = [];

      // 画像は一括でGeminiに送信
      if (imageFiles.length > 0) {
        const frames = imageFiles.map(f => {
          const ext = path.extname(f.originalname).toLowerCase();
          const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
          return { buffer: fs.readFileSync(f.path), mimeType: mimeMap[ext] || 'image/jpeg' };
        });
        const imgAnalysis = await receiptService.analyzeVideoFrames(frames, industry, fiscalMonth, fiscalYear, customRules);
        allEntries.push(...imgAnalysis.entries);
        allNotes.push(...imgAnalysis.notes);
      }

      // PDFは1件ずつ解析して結果をマージ
      for (const pdfFile of pdfFiles) {
        const pdfAnalysis = await receiptService.analyzeReceiptPDF(
          fs.readFileSync(pdfFile.path), pdfFile.originalname, industry, fiscalMonth, fiscalYear, customRules,
        );
        allEntries.push(...pdfAnalysis.entries);
        allNotes.push(...pdfAnalysis.notes);
      }

      // CSVは1件ずつ解析して結果をマージ
      for (const csvFile of csvFiles) {
        const csvText = fs.readFileSync(csvFile.path, 'utf-8');
        const csvAnalysis = await receiptService.analyzeCSV(csvText, csvFile.originalname, industry, fiscalMonth, fiscalYear, customRules);
        allEntries.push(...csvAnalysis.entries);
        allNotes.push(...csvAnalysis.notes);
      }

      const analysis: import('../services/receipt-service.js').ReceiptAnalysis = {
        entries: allEntries,
        rawText: '',
        confidence: allEntries.length > 0 ? 'high' : 'low',
        notes: allNotes,
      };
      res.send(renderAccountingPageHTML({ aiAvailable: true, analysis, fiscalMonth }));
    }
  } catch (error) {
    logger.error('領収書解析エラー', error);
    res.send(renderAccountingPageHTML({
      aiAvailable: true,
      error: `解析に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
      fiscalMonth: await fetchFiscalMonth(req),
    }));
  }
});

// 会計AI：動画からレシート解析
app.post('/agent/accounting/analyze-video', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) { res.status(400).send('動画が選択されていません'); return; }

    // デモモード
    if (isDemoMode()) {
      logger.info('デモモード: 動画解析 → プリセットデータ');
      res.send(renderAccountingPageHTML({ aiAvailable: true, analysis: DEMO_ANALYSIS_RESULT }));
      return;
    }

    if (!receiptService.isAvailable()) { res.status(400).send('Vertex AI の認証が未設定です'); return; }

    const buffer = fs.readFileSync(req.file.path);
    const ext = path.extname(req.file.originalname).toLowerCase();
    const mimeMap: Record<string, string> = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.webm': 'video/webm' };
    const mimeType = mimeMap[ext] || 'video/mp4';

    // チャットメモリから業種を取得
    const memory = await chatService.getMemory(getActiveTenantId(req) || undefined);
    const industry = memory.industry || undefined;
    const fiscalMonth = await fetchFiscalMonth(req);
    const fiscalYear = await fetchFiscalYear(req);
    const customRules = await fetchActiveJournalRules(req);

    // Geminiで動画を直接解析
    const analysis = await receiptService.analyzeVideo(buffer, mimeType, req.file.originalname, industry, fiscalMonth, fiscalYear, customRules);

    res.send(renderAccountingPageHTML({
      aiAvailable: true,
      analysis,
      fiscalMonth,
    }));
  } catch (error) {
    logger.error('動画解析エラー', error);
    res.send(renderAccountingPageHTML({
      aiAvailable: true,
      error: `解析に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
      fiscalMonth: await fetchFiscalMonth(req),
    }));
  }
});

// 会計AI：仕訳修正の記録（学習データ蓄積）
app.post('/agent/accounting/correct', express.json(), async (req, res) => {
  try {
    const { original, corrected, reason } = req.body;
    if (!original || !corrected) { res.status(400).json({ error: '修正前・修正後の仕訳データが必要です' }); return; }

    const memory = await chatService.getMemory(getActiveTenantId(req) || undefined);
    const industry = memory.industry || '未設定';

    await receiptService.recordJournalCorrection(original, corrected, industry, reason);
    res.json({ success: true, message: '修正を学習データとして記録しました' });
  } catch (error) {
    logger.error('仕訳修正記録エラー', error);
    res.status(500).json({ error: '記録に失敗しました' });
  }
});

// 会計AI：チャットによる仕訳修正（AI解釈 + 学習）
app.post('/agent/accounting/chat-correct', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const { entries, message } = req.body;
    if (!entries || !message) {
      res.status(400).json({ error: '仕訳データとメッセージが必要です' });
      return;
    }

    // Geminiで修正内容を解釈（日付正規化用に決算月コンテキストを渡す）
    const fiscalMonth = await fetchFiscalMonth(req);
    const fiscalYear = await fetchFiscalYear(req);
    const customRules = await fetchActiveJournalRules(req);
    const result = await receiptService.interpretCorrection(entries, message, fiscalMonth, fiscalYear);

    // 修正があれば学習データとして記録（勘定科目の修正のみ学習対象）
    const accountCorrections = result.corrections.filter(c =>
      c.field === 'debitAccount' || c.field === 'creditAccount'
    );
    if (accountCorrections.length > 0) {
      const memory = await chatService.getMemory(getActiveTenantId(req) || undefined);
      const industry = memory.industry || '未設定';

      for (const correction of accountCorrections) {
        const original = entries[correction.index];
        const corrected = { ...original, [correction.field]: correction.newValue };
        await receiptService.recordJournalCorrection(original, corrected, industry, message);
      }
    }

    res.json({ success: true, corrections: result.corrections, aiMessage: result.aiMessage });
  } catch (error) {
    logger.error('チャット修正エラー', error);
    res.status(500).json({ error: `修正に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}` });
  }
});

// 会計AI：CSVダウンロード
app.get('/agent/accounting/csv', (req, res) => {
  try {
    const entriesJson = req.query.entries as string;
    const entries = JSON.parse(entriesJson);
    const csv = receiptService.toCSV(entries);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="journal-entries-${Date.now()}.csv"`);
    // BOM付きUTF-8（Excelで文字化けしないように）
    res.send('\uFEFF' + csv);
  } catch (error) {
    res.status(400).send('CSVの生成に失敗しました');
  }
});

// 会計AI：弥生会計用CSVダウンロード
app.get('/agent/accounting/yayoi-csv', (req, res) => {
  try {
    const entriesJson = req.query.entries as string;
    const entries = JSON.parse(entriesJson);
    const includeCounter = req.query.counter !== '0';
    const csv = receiptService.toYayoiCSV(entries, includeCounter);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="yayoi-journal-${Date.now()}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    res.status(400).send('弥生CSVの生成に失敗しました');
  }
});

/**
 * 仕訳の配列を freee に送信する内部処理。
 * 成功件数とスキップ件数を返す。バッチ作成・マークは呼び出し側で行う。
 */
async function sendEntriesToFreee(
  entries: JournalEntry[],
  companyId: number,
  freeeToken: { access_token: string; refresh_token: string },
): Promise<{ results: string[]; sentCount: number; skipCount: number }> {
  const { FreeeAuthClient } = await import('../clients/freee-auth.js');
  const { FreeeApiClient } = await import('../clients/freee-api.js');
  const auth = new FreeeAuthClient({
    accessToken: freeeToken.access_token,
    refreshToken: freeeToken.refresh_token,
  });
  const apiClient = new FreeeApiClient(auth);

  const results: string[] = [];
  let sentCount = 0;
  let skipCount = 0;

  for (const entry of entries) {
    const accountId = await apiClient.findAccountItemId(companyId, entry.debitAccount);
    if (!accountId) {
      results.push(`[スキップ] ${entry.description}: 勘定科目「${entry.debitAccount}」がfreeeに見つかりません`);
      skipCount++;
      continue;
    }
    const dealType = entry.debitAccount.includes('売上') ? 'income' : 'expense';
    // 税区分: entry.taxCategory が指定されていれば名前一致で、無ければ rate/dealType から推測
    const taxCode = entry.taxCategory
      ? await apiClient.findTaxCodeByName(companyId, entry.taxCategory, dealType, entry.taxRate)
      : await apiClient.findTaxCode(companyId, dealType, entry.taxRate);
    const wallet = await apiClient.findWalletable(companyId, entry.creditAccount);
    const payments = wallet ? [{
      amount: entry.amount,
      from_walletable_id: wallet.id,
      from_walletable_type: wallet.type,
      date: entry.date,
    }] : undefined;
    const dealResponse = await apiClient.createDeal(companyId, {
      issue_date: entry.date,
      type: dealType,
      details: [{
        account_item_id: accountId,
        tax_code: taxCode,
        amount: entry.amount,
        description: `${entry.description} (${entry.partnerName})`,
      }],
      payments,
    });

    let receiptStatus = '';
    const dealId = dealResponse?.deal?.id;
    if (dealId && entry.receiptFilePath) {
      try {
        const receiptBuffer = fs.readFileSync(entry.receiptFilePath);
        const receiptId = await apiClient.uploadReceipt(
          companyId, receiptBuffer,
          entry.receiptFileName || 'receipt.jpg',
          entry.receiptMimeType || 'image/jpeg',
        );
        await apiClient.linkReceiptToDeal(companyId, dealId, receiptId);
        receiptStatus = ' [レシート添付済]';
      } catch (e: any) {
        const errMsg = e?.message || String(e);
        logger.warn('レシート添付に失敗:', errMsg);
        receiptStatus = errMsg.includes('上限') || errMsg.includes('有料プラン')
          ? ' [レシート添付失敗: freeeファイルボックスの上限超過]'
          : ` [レシート添付失敗: ${errMsg}]`;
      }
    }

    const paymentStatus = wallet ? `→ ${entry.creditAccount}で決済済み` : '→ 未決済（口座未設定）';
    results.push(`[送信完了] ${entry.date} ${entry.debitAccount} ${entry.amount}円 ${paymentStatus} - ${entry.description}${receiptStatus}`);
    sentCount++;
  }

  return { results, sentCount, skipCount };
}

// 会計AI：freee APIに仕訳送信（解析結果画面から）
app.post('/agent/accounting/send-freee', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    // 確認ダイアログを経由しない自動送信を拒否（AI生成仕訳の誤送信防止）
    if (req.body.confirmed !== '1') {
      res.status(400).send(renderAccountingPageHTML({
        aiAvailable: true,
        error: '送信前の確認が必要です。「freeeに送信」ボタンから確認ダイアログを経由して送信してください。',
      }));
      return;
    }
    // デモモード: freee送信成功画面を返す
    if (isDemoMode()) {
      const entries: JournalEntry[] = JSON.parse(req.body.entries || '[]');
      const demoProfile = getDemoProfile();
      const companyName = demoProfile?.companyName || 'デモ会社';
      const results = entries.map(e =>
        `[送信完了] ${e.date} ${e.debitAccount} ${e.amount.toLocaleString()}円 → ${e.creditAccount}で決済済み - ${e.description}`
      );
      logger.info(`デモモード: freee送信完了（${entries.length}件）`);
      res.send(renderAccountingPageHTML({
        aiAvailable: true,
        success: `freee送信結果（${companyName}）:\n${results.join('\n')}\n\n※デモモードのため実際の送信は行われていません`,
      }));
      return;
    }

    const token = await getFreeeToken(getActiveTenantId(req) || undefined);
    if (!token) {
      res.send(renderAccountingPageHTML({
        aiAvailable: true,
        error: 'freee連携が未設定です。サイドバーの「freee連携設定」からアクセストークンを設定してください。',
      }));
      return;
    }

    const companyId = await getSelectedCompanyId(getActiveTenantId(req) || undefined);
    if (!companyId) {
      res.send(renderAccountingPageHTML({
        aiAvailable: true,
        error: '事業所が未選択です。サイドバーの「事業所の選択」から事業所を選んでください。',
      }));
      return;
    }

    const entries: JournalEntry[] = JSON.parse(req.body.entries || '[]');
    if (entries.length === 0) {
      res.send(renderAccountingPageHTML({ aiAvailable: true, error: '送信する仕訳データがありません。' }));
      return;
    }

    const { results, sentCount, skipCount } = await sendEntriesToFreee(entries, companyId, token);

    // 送信成功した（1件でも）ならバッチを自動作成 + freee_sent_at をマーク
    const tid = getActiveTenantId(req);
    if (tid && sentCount > 0) {
      const dateLabel = new Date().toISOString().slice(0, 10);
      const batchId = await repo.createJournalBatch(tid, {
        label: `仕訳データ ${dateLabel}`,
        source: 'freee',
        createdBy: req.session.user?.id,
        entries: entries.map(e => ({
          date: e.date,
          debitAccount: e.debitAccount,
          creditAccount: e.creditAccount,
          amount: Number(e.amount) || 0,
          taxCategory: e.taxCategory || undefined, taxRate: Number(e.taxRate) || 10,
          taxAmount: Number(e.taxAmount) || 0,
          description: e.description || '',
          partnerName: e.partnerName || '',
          receiptType: e.receiptType,
        })),
      });
      await repo.markBatchFreeeSent(tid, batchId, skipCount);
      // 結果サマリをクエリ経由で詳細画面へ
      const summary = `freee送信完了: 成功${sentCount}件 / スキップ${skipCount}件`;
      res.redirect(`/agent/accounting/batch/${batchId}?freee=1&summary=${encodeURIComponent(summary)}`);
      return;
    }

    // 全件スキップ等で何も送信できなかった場合は解析結果画面に戻る
    res.send(renderAccountingPageHTML({
      aiAvailable: true,
      error: `freee送信完了: 成功${sentCount}件 / スキップ${skipCount}件\n${results.join('\n')}`,
    }));
  } catch (error) {
    logger.error('freee送信エラー', error);
    res.send(renderAccountingPageHTML({
      aiAvailable: true,
      error: `freee送信に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
    }));
  }
});

// 既存バッチをfreeeに登録（バッチ詳細画面の「freeeに登録」ボタンから）
app.post('/agent/accounting/batch/:id/send-freee', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    if (req.body.confirmed !== '1') {
      res.redirect(`/agent/accounting/batch/${req.params.id}`);
      return;
    }
    const tid = getActiveTenantId(req);
    if (!tid) { res.redirect('/agent/accounting'); return; }
    const batch = await repo.getJournalBatch(tid, req.params.id);
    if (!batch) { res.status(404).send(renderErrorHTML(404, 'バッチが見つかりません')); return; }
    // freee送信済みでも allow_duplicate=1 が来ていれば再送信を許可（モーダルで承諾済み）
    if (batch.freeeSentAt && req.body.allow_duplicate !== '1') {
      res.redirect(`/agent/accounting/batch/${req.params.id}?freee=already`);
      return;
    }
    if (isDemoMode()) {
      res.redirect(`/agent/accounting/batch/${req.params.id}?freee=demo`);
      return;
    }
    const token = await getFreeeToken(tid);
    if (!token) {
      res.redirect(`/agent/accounting/batch/${req.params.id}?freee=noauth`);
      return;
    }
    const companyId = await getSelectedCompanyId(tid);
    if (!companyId) {
      res.redirect(`/agent/accounting/batch/${req.params.id}?freee=nocompany`);
      return;
    }
    const dbEntries = await repo.getJournalEntries(tid, req.params.id);
    const entries: JournalEntry[] = dbEntries.map(e => ({
      date: e.entryDate,
      debitAccount: e.debitAccount,
      creditAccount: e.creditAccount,
      amount: e.amount,
      taxCategory: e.taxCategory || '',
      taxRate: e.taxRate,
      taxAmount: e.taxAmount,
      description: e.description,
      partnerName: e.partnerName,
      receiptType: e.receiptType || '領収書',
    }));
    const { sentCount, skipCount } = await sendEntriesToFreee(entries, companyId, token);
    if (sentCount > 0) {
      await repo.markBatchFreeeSent(tid, req.params.id, skipCount);
    }
    const summary = `freee送信完了: 成功${sentCount}件 / スキップ${skipCount}件`;
    res.redirect(`/agent/accounting/batch/${req.params.id}?freee=1&summary=${encodeURIComponent(summary)}`);
  } catch (error: any) {
    logger.error('バッチfreee送信エラー', error);
    res.redirect(`/agent/accounting/batch/${req.params.id}?freee=error&summary=${encodeURIComponent(error?.message || 'freee送信に失敗')}`);
  }
});

// 資金調達AIエージェント
app.get('/agent/funding', (_req, res) => {
  res.send(renderFundingAgentHTML());
});

// ========== 秘書AIエージェント ==========
import { renderSecretaryPageHTML, renderSecretaryFormHTML, renderGmailDraftHTML, renderTemplateSetupHTML } from './secretary-page.js';
import { secretaryService, loadCompanySettings, saveCompanySettings } from '../services/secretary-service.js';
import type { CompanySettings } from '../services/secretary-service.js';
import { gmailClient } from '../clients/google-gmail.js';
import { getServiceList, loadBillingConfigs, saveBillingConfig, getBillingConfig, calcInvoiceDateFromConfig, calcDueDateFromConfig, detectInvoiceTasksFromGoogle } from '../services/secretary-auto.js';
import type { CustomerBilling } from '../services/secretary-auto.js';

// 秘書AI：メインページ（Googleタスク検知付き）
app.get('/agent/secretary', async (req, res) => {
  const templates = await secretaryService.listTemplates(getActiveTenantId(req) || undefined);
  const documents = await secretaryService.listDocuments(getActiveTenantId(req)!);
  const billingConfigs = await loadBillingConfigs(getActiveTenantId(req)!);
  let detectedTasks: Array<{ title: string; customerName: string }> = [];

  if (isDemoMode()) {
    // デモモード: プリセットタスクとテンプレート
    detectedTasks = [
      { title: '株式会社ABC 4月分請求書作成', customerName: '株式会社ABC' },
      { title: 'DEFコンサル 4月分請求書', customerName: 'DEFコンサル' },
    ];
    // デモ用テンプレートがなければ作成
    if (templates.length === 0) {
      try {
        await secretaryService.createTemplate(getActiveTenantId(req)!, '請求書テンプレート', 'invoice', '');
        await secretaryService.createTemplate(getActiveTenantId(req)!, '見積書テンプレート', 'estimate', '');
      } catch { /* skip */ }
    }
    // デモ用会社設定
    const cs = await loadCompanySettings(getActiveTenantId(req) || undefined);
    if (!cs || !cs.companyName) {
      const demoProfile = getDemoProfile();
      await saveCompanySettings({
        companyName: demoProfile?.companyName || 'デモ企業A（ITコンサル）',
        postalCode: '100-0001',
        address: '東京都千代田区千代田1-1',
        representative: 'デモ代表者',
        registrationNumber: 'T1234567890123',
        bankName: '三菱UFJ銀行',
        branchName: '東京営業部',
        accountType: '普通預金',
        accountNumber: '1234567',
        accountHolder: 'デモ企業A',
      }, getActiveTenantId(req) || undefined);
    }
    // デモ用請求設定
    if (billingConfigs.length === 0) {
      await saveBillingConfig(getActiveTenantId(req)!, [
        { customerName: '株式会社ABC', closingDay: 31, invoiceDay: 1, dueDateType: 'end_next' },
        { customerName: 'DEFコンサル', closingDay: 25, invoiceDay: 27, dueDateType: 'end_next' },
        { customerName: '株式会社GHI', closingDay: 31, invoiceDay: 5, dueDateType: 'end_next' },
      ]);
    }
  } else {
    try {
      const result = await detectInvoiceTasksFromGoogle();
      detectedTasks = result.tasks;
    } catch { /* skip */ }
  }

  const companySettings = await loadCompanySettings(getActiveTenantId(req) || undefined);
  const updatedTemplates = await secretaryService.listTemplates(getActiveTenantId(req) || undefined);
  const updatedConfigs = await loadBillingConfigs(getActiveTenantId(req)!);
  res.send(renderSecretaryPageHTML({ templates: updatedTemplates, documents, detectedTasks, billingConfigs: updatedConfigs, companySettings }));
});

// 秘書AI：会社情報・振込先設定の保存
app.post('/agent/secretary/company-settings', express.urlencoded({ extended: true }), async (req, res) => {
  const settings: CompanySettings = {
    companyName: req.body.companyName || '',
    postalCode: req.body.postalCode || '',
    address: req.body.address || '',
    representative: req.body.representative || '',
    registrationNumber: req.body.registrationNumber || '',
    bankName: req.body.bankName || '',
    branchName: req.body.branchName || '',
    accountType: req.body.accountType || '普通預金',
    accountNumber: req.body.accountNumber || '',
    accountHolder: req.body.accountHolder || '',
  };
  await saveCompanySettings(settings, getActiveTenantId(req) || undefined);
  res.redirect('/agent/secretary');
});

// 秘書AI：テンプレート登録ページ
app.get('/agent/secretary/template-setup', (_req, res) => {
  res.send(renderTemplateSetupHTML());
});

// 秘書AI：テンプレートアップロード
app.post('/agent/secretary/template/upload', upload.single('template'), async (req, res) => {
  try {
    const name = req.body.name || '無題のテンプレート';
    const type = req.body.type || 'invoice';
    const uploadedFile = req.file?.path || '';
    await secretaryService.createTemplate(getActiveTenantId(req)!, name, type, uploadedFile || '');
    res.redirect('/agent/secretary');
  } catch (error) {
    logger.error('テンプレート登録エラー', error);
    res.send(renderSecretaryPageHTML({
      templates: await secretaryService.listTemplates(getActiveTenantId(req) || undefined),
      documents: await secretaryService.listDocuments(getActiveTenantId(req)!),
      error: `テンプレート登録に失敗: ${error instanceof Error ? error.message : '不明なエラー'}`,
    }));
  }
});

// 秘書AI：テンプレート削除
app.post('/agent/secretary/template/:id/delete', async (req, res) => {
  await secretaryService.deleteTemplate(getActiveTenantId(req)!, req.params.id as string);
  res.redirect('/agent/secretary');
});

// 秘書AI：書類削除
app.post('/agent/secretary/document/:id/delete', async (req, res) => {
  await secretaryService.deleteDocument(getActiveTenantId(req)!, req.params.id);
  res.redirect('/agent/secretary');
});

app.post('/agent/secretary/documents/delete-all', async (req, res) => {
  const count = await secretaryService.deleteAllDocuments(getActiveTenantId(req)!);
  logger.info(`作成済み書類を全件削除: ${count}件`);
  res.redirect('/agent/secretary');
});

// 秘書AI：顧客別請求設定の保存
app.post('/agent/secretary/billing-config', async (req, res) => {
  // cfg_name[] と cfg_name の両方に対応（Express body-parser互換）
  const toArray = (v: any) => Array.isArray(v) ? v : (v ? [v] : []);
  const names = toArray(req.body.cfg_name || req.body['cfg_name[]']);
  const closings = toArray(req.body.cfg_closing || req.body['cfg_closing[]']);
  const invoices = toArray(req.body.cfg_invoice || req.body['cfg_invoice[]']);
  const dues = toArray(req.body.cfg_due || req.body['cfg_due[]']);

  const configs: CustomerBilling[] = names.map((name: string, i: number) => ({
    customerName: name,
    closingDay: Number(closings[i]) || 0,
    invoiceDay: Number(invoices[i]) || 0,
    dueDateType: dues[i] || 'end_next',
  })).filter((c: CustomerBilling) => c.customerName.trim());

  await saveBillingConfig(getActiveTenantId(req)!, configs);
  logger.info(`請求設定を保存: ${configs.length}件`);
  res.redirect('/agent/secretary');
});

// 秘書AI：書類作成フォーム（企業AI OS連携）
app.get('/agent/secretary/create/:templateId', async (req, res) => {
  const template = await secretaryService.getTemplate(req.params.templateId, getActiveTenantId(req) || undefined);
  if (!template) { res.redirect('/agent/secretary'); return; }

  const customerName = (req.query.customer as string) || '';
  const billingConfig = customerName ? await getBillingConfig(getActiveTenantId(req)!, customerName) : null;
  const serviceList = getServiceList();

  let invoiceDate: string | undefined;
  let dueDate: string | undefined;
  if (billingConfig) {
    invoiceDate = calcInvoiceDateFromConfig(billingConfig);
    dueDate = calcDueDateFromConfig(invoiceDate, billingConfig);
  }

  res.send(renderSecretaryFormHTML({
    template, serviceList, customerName, billingConfig, invoiceDate, dueDate,
  }));
});

// 秘書AI：PDF生成（一括生成対応）
app.post('/agent/secretary/generate', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const template = await secretaryService.getTemplate(req.body.templateId, getActiveTenantId(req) || undefined);
    if (!template) { res.redirect('/agent/secretary'); return; }

    // フォームデータを整形
    const baseData: Record<string, any> = {};
    for (const field of template.fields) {
      if (field.type === 'lines') continue;
      if (field.type === 'number') {
        baseData[field.key] = Number(req.body[field.key]) || 0;
      } else {
        baseData[field.key] = req.body[field.key] || '';
      }
    }
    // テンプレートfieldsに含まれないが必要なフィールド
    if (req.body.subject) baseData.subject = req.body.subject;

    // 明細行の処理
    if (req.body.line_item) {
      const items = Array.isArray(req.body.line_item) ? req.body.line_item : [req.body.line_item];
      const prices = Array.isArray(req.body.line_unitPrice) ? req.body.line_unitPrice : [req.body.line_unitPrice];
      const qtys = Array.isArray(req.body.line_quantity) ? req.body.line_quantity : [req.body.line_quantity];
      const amounts = Array.isArray(req.body.line_amount) ? req.body.line_amount : [req.body.line_amount];

      baseData.lines = items.map((item: string, i: number) => ({
        item,
        unitPrice: Number(prices[i]) || 0,
        quantity: Number(qtys[i]) || 0,
        amount: Number(amounts[i]) || 0,
      })).filter((l: any) => l.item);

      baseData.subtotal = Number(req.body.subtotal) || 0;
      baseData.tax = Number(req.body.tax) || 0;
      baseData.total = Number(req.body.total) || 0;
    }

    // 一括生成: 請求日と支払期限を計算
    const batchMonths = Math.min(Number(req.body.batchMonths) || 1, 12);
    const dayType = req.body.invoiceDayType || 'today';
    const dueDateType = req.body.dueDateType || 'end_next';
    const now = new Date();

    function calcInvoiceDate(monthOffset: number): string {
      const targetYear = now.getFullYear() + Math.floor((now.getMonth() + monthOffset) / 12);
      const targetMonth = (now.getMonth() + monthOffset) % 12;
      const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();

      let day: number;
      if (dayType === 'end') {
        day = lastDay;
      } else if (dayType === 'today' || dayType === 'custom') {
        const customDate = req.body.customInvoiceDate ? new Date(req.body.customInvoiceDate) : now;
        day = Math.min(customDate.getDate(), lastDay);
      } else {
        day = Math.min(Number(dayType), lastDay);
      }

      return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function toLocalDateStr(d: Date): string {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function calcDueDate(invoiceDateStr: string): string {
      const [y, m, dd] = invoiceDateStr.split('-').map(Number);
      if (dueDateType === 'end_next') {
        const d = new Date(y, m + 1, 0); // 翌月末 (m is 1-based, so m+1 month's day 0 = end of month m)
        return toLocalDateStr(d);
      } else if (dueDateType === 'end_same') {
        const d = new Date(y, m, 0); // 当月末
        return toLocalDateStr(d);
      } else if (dueDateType === '10_next') {
        const d = new Date(y, m, 10); // 翌月10日
        return toLocalDateStr(d);
      } else {
        const days = Number(dueDateType) || 30;
        const d = new Date(y, m - 1, dd + days);
        return toLocalDateStr(d);
      }
    }

    const generatedDocs: string[] = [];
    for (let i = 0; i < batchMonths; i++) {
      const data = { ...baseData };
      const invoiceDate = calcInvoiceDate(i);
      const dueDate = calcDueDate(invoiceDate);

      // 日付フィールドを設定
      data.invoiceDate = invoiceDate;
      data.estimateDate = invoiceDate;
      data.dueDate = dueDate;
      data.validUntil = dueDate;

      // 請求書番号に月を反映
      if (data.invoiceNo && batchMonths > 1) {
        const d = new Date(invoiceDate);
        data.invoiceNo = `${data.invoiceNo}-${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      }

      const doc = await secretaryService.generatePDF(getActiveTenantId(req)!, template, data);
      generatedDocs.push(doc.id);
    }

    if (generatedDocs.length === 1) {
      res.redirect(`/agent/secretary/gmail/${generatedDocs[0]}`);
    } else {
      // 複数生成の場合はメインページに戻って結果を表示
      res.send(renderSecretaryPageHTML({
        templates: await secretaryService.listTemplates(getActiveTenantId(req) || undefined),
        documents: await secretaryService.listDocuments(getActiveTenantId(req)!),
        success: `${batchMonths}ヶ月分の${template.name}を生成しました（${generatedDocs.length}件）`,
      }));
    }
  } catch (error) {
    logger.error('PDF生成エラー', error);
    const template = await secretaryService.getTemplate(req.body.templateId, getActiveTenantId(req) || undefined);
    if (template) {
      res.send(renderSecretaryFormHTML({ template, serviceList: [], error: `PDF生成に失敗: ${error instanceof Error ? error.message : '不明なエラー'}` }));
    } else {
      res.redirect('/agent/secretary');
    }
  }
});

// 秘書AI：PDFダウンロード
app.get('/agent/secretary/download/:docId', async (req, res) => {
  const doc = await secretaryService.getDocument(getActiveTenantId(req)!, req.params.docId);
  if (!doc) { res.status(404).send('ドキュメントが見つかりません'); return; }

  const fileName = `${doc.templateName}_${doc.data.customerName || 'document'}.pdf`;

  // Storage パスがある場合 → Supabase Storage からダウンロード
  if (doc.pdfPath && !doc.pdfPath.startsWith('/') && !doc.pdfPath.startsWith('data/')) {
    const buffer = await secretaryService.getDocumentBuffer(doc.pdfPath);
    if (buffer) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      res.send(buffer);
      return;
    }
    logger.warn(`Storage PDFダウンロード失敗: ${doc.pdfPath}`);
  }

  // ローカルファイルフォールバック（Supabase未接続時）
  if (fs.existsSync(doc.pdfPath)) {
    res.download(doc.pdfPath, fileName);
    return;
  }

  res.status(404).send('PDFが見つかりません');
});

// 秘書AI：Gmail下書きフォーム
app.get('/agent/secretary/gmail/:docId', async (req, res) => {
  const doc = await secretaryService.getDocument(getActiveTenantId(req)!, req.params.docId);
  if (!doc) { res.redirect('/agent/secretary'); return; }
  res.send(renderGmailDraftHTML(doc));
});

// 秘書AI：Gmail下書き送信
app.post('/agent/secretary/gmail-draft', express.urlencoded({ extended: true }), async (req, res) => {
  const doc = await secretaryService.getDocument(getActiveTenantId(req)!, req.body.docId);
  if (!doc) { res.redirect('/agent/secretary'); return; }

  try {
    // デモモード: Gmail送信成功を模擬
    if (isDemoMode()) {
      logger.info(`デモモード: Gmail下書き作成（${doc.templateName}）`);
      res.send(renderGmailDraftHTML(doc, undefined, `Gmail下書きを作成しました（デモ）。\n宛先: ${req.body.to}\n件名: ${req.body.subject}\n\n※デモモードのため実際の下書きは作成されていません`));
      return;
    }

    if (!gmailClient.isAvailable()) {
      res.send(renderGmailDraftHTML(doc, 'Google認証が未設定です。Google連携を設定してください。'));
      return;
    }

    // Storage or ローカルからPDFを取得
    let pdfContent: Buffer;
    if (doc.pdfPath && !doc.pdfPath.startsWith('/') && !doc.pdfPath.startsWith('data/')) {
      const buf = await secretaryService.getDocumentBuffer(doc.pdfPath);
      if (!buf) { res.send(renderGmailDraftHTML(doc, 'PDFファイルが見つかりません')); return; }
      pdfContent = buf;
    } else {
      pdfContent = fs.readFileSync(doc.pdfPath);
    }
    const filename = `${doc.templateName}_${doc.data.customerName || 'document'}.pdf`;

    await gmailClient.createDraft(
      req.body.to,
      req.body.subject,
      req.body.body,
      [{ filename, mimeType: 'application/pdf', content: pdfContent }],
    );

    res.send(renderGmailDraftHTML(doc, undefined, `Gmail下書きを作成しました。\nGmailの下書きフォルダを確認してください。`));
  } catch (error) {
    logger.error('Gmail下書きエラー', error);
    res.send(renderGmailDraftHTML(doc, `Gmail下書き作成に失敗: ${error instanceof Error ? error.message : '不明なエラー'}`));
  }
});

// API（JSON）
app.get('/api/report', async (req, res) => {
  try {
    const report = await buildReport(undefined, undefined, req.session.user?.id === 'demo-user', getActiveTenantId(req) || undefined);
    res.json(report);
  } catch (error) {
    logger.error('API エラー', error);
    res.status(500).json({ error: 'レポート生成に失敗しました' });
  }
});

// === freee OAuth認証 ===
import { FreeeAuthClient } from '../clients/freee-auth.js';
import { FreeeService } from '../services/freee-service.js';
const freeeAuth = new FreeeAuthClient();

// === デモモード ===
import { isDemoMode, getDemoProfile, enableDemoMode, disableDemoMode, DEMO_PROFILES } from '../services/demo-mode.js';

app.post('/settings/demo', express.urlencoded({ extended: true }), async (req, res) => {
  const profileId = req.body.profileId;
  if (profileId === 'off') {
    disableDemoMode();
  } else if (profileId) {
    enableDemoMode(profileId);
  }
  clearCache();
  res.redirect('/settings/company');
});

app.get('/auth/freee', (req, res) => {
  // state にtenantIdを埋め込む（callbackでテナント特定用）
  const tid = getActiveTenantId(req);
  const authUrl = freeeAuth.getAuthorizationUrl();
  const stateParam = tid ? `&state=${encodeURIComponent(tid)}` : '';
  res.redirect(authUrl + stateParam);
});

app.get('/callback', async (req, res) => {
  try {
    const code = req.query.code as string;
    const stateTenantId = req.query.state as string || '';
    const tenantId = stateTenantId ? asTenantId(stateTenantId) : getActiveTenantId(req);
    if (!code) { res.status(400).send('認可コードがありません'); return; }
    if (!tenantId) { res.status(400).send('テナントが特定できません'); return; }

    logger.info(`freee callback受信: tenantId=${tenantId}`);

    const tokenResponse = await axios.post('https://accounts.secure.freee.co.jp/public_api/token', {
      grant_type: 'authorization_code',
      client_id: process.env.FREEE_CLIENT_ID,
      client_secret: process.env.FREEE_CLIENT_SECRET,
      code,
      redirect_uri: process.env.FREEE_REDIRECT_URI || 'http://localhost:3000/callback',
    });

    const tokenData = tokenResponse.data;

    // トークンをSupabaseに保存（テナント分離）
    await saveOAuthToken(tenantId, 'freee', {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiry: new Date(Date.now() + (tokenData.expires_in - 60) * 1000).toISOString(),
    });

    logger.info(`freee認証完了、トークンをSupabaseに保存しました (tenant: ${tenantId})`);

    res.redirect('/settings/company');
  } catch (error: any) {
    const detail = error?.response?.data ? JSON.stringify(error.response.data) : (error instanceof Error ? error.message : '不明なエラー');
    logger.error('freee認証エラー詳細:', detail);
    res.status(500).send(`freee認証に失敗しました: ${detail}`);
  }
});

// === 事業所選択 ===
app.get('/settings/company', async (req, res) => {
  try {
    const token = await getFreeeToken(getActiveTenantId(req) || undefined);
    const demoActive = isDemoMode();
    const demoProfile = getDemoProfile();
    const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const csrfHidden = `<input type="hidden" name="_csrf" value="${req.session.csrfToken || ''}">`;

    // デモプロファイル選択カード
    const demoCards = DEMO_PROFILES.map(p => {
      const isSelected = demoActive && demoProfile?.id === p.id;
      const revLabel = (p.revenue / 10000).toLocaleString() + '万円';
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border:2px solid ${isSelected ? '#f59e0b' : '#e5e7eb'};border-radius:10px;margin-bottom:10px;background:${isSelected ? 'rgba(245,158,11,0.06)' : '#fff'}">
          <div>
            <div style="font-weight:700;font-size:15px;color:#1f2937">${escHtml(p.companyName)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px">${escHtml(p.industry)} / 従業員${p.employees}名 / 売上${revLabel}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:1px">${escHtml(p.description)}</div>
          </div>
          <form method="POST" action="/settings/demo" style="margin:0">
            ${csrfHidden}
            <input type="hidden" name="profileId" value="${p.id}">
            <button type="submit" style="padding:8px 20px;border-radius:8px;border:none;background:${isSelected ? '#f59e0b' : '#f59e0b'};color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;opacity:${isSelected ? '0.6' : '1'}">${isSelected ? 'デモ中' : 'デモ開始'}</button>
          </form>
        </div>`;
    }).join('');

    const demoSection = `
      <div style="margin-bottom:32px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div>
            <h2 style="font-size:18px;font-weight:700;margin-bottom:4px">デモモード</h2>
            <p style="font-size:13px;color:#6b7280">営業先でfreee連携なしでデモ実演できます（AI APIも不要）</p>
          </div>
          ${demoActive ? `<form method="POST" action="/settings/demo" style="margin:0">${csrfHidden}<input type="hidden" name="profileId" value="off"><button type="submit" style="padding:8px 16px;border-radius:8px;border:1px solid #ef4444;background:transparent;color:#ef4444;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">デモ解除</button></form>` : ''}
        </div>
        ${demoActive ? '<div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:12px;font-size:13px;color:#92400e;font-weight:600">デモモード実行中: ' + escHtml(demoProfile?.companyName || '') + '</div>' : ''}
        ${demoCards}
      </div>`;

    if (!token && !demoActive) {
      // freee未接続 & デモ未選択：デモ選択 + freee連携ボタン
      res.send(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>設定 | AI CFO</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN",sans-serif;background:#f4f5f7;color:#1f2937;font-size:14px;min-height:100vh;display:flex;align-items:center;justify-content:center}</style></head><body><div style="max-width:520px;width:100%;margin:40px auto;padding:0 20px"><div style="text-align:center;margin-bottom:32px"><h1 style="font-size:22px;font-weight:700;margin-bottom:8px">データソースの選択</h1><p style="font-size:14px;color:#6b7280">freee連携またはデモモードを選択してください</p></div>${demoSection}<div style="text-align:center;margin-top:16px;padding-top:24px;border-top:1px solid #e5e7eb"><p style="font-size:13px;color:#6b7280;margin-bottom:12px">本番データを使用する場合</p><a href="/auth/freee" style="display:inline-block;background:#2298ae;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">freeeと連携する</a></div>${demoActive ? '<div style="text-align:center;margin-top:16px"><a href="/" style="display:inline-block;background:#f59e0b;color:#fff;padding:10px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">ダッシュボードへ（デモ）</a></div>' : ''}</div></body></html>`);
      return;
    }

    const auth = new FreeeAuthClient({
      accessToken: token!.access_token,
      refreshToken: token!.refresh_token,
    });
    const freeeService = new FreeeService(auth);
    const companies = await freeeService.getCompanies();
    const selectedId = await getSelectedCompanyId(getActiveTenantId(req) || undefined);

    const companyCards = companies.map(c => {
      const isSelected = c.id === selectedId;
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border:1px solid ${isSelected ? '#2298ae' : '#e5e7eb'};border-radius:10px;margin-bottom:10px;background:${isSelected ? 'rgba(99,102,241,0.06)' : '#fff'};transition:all .15s">
          <div>
            <div style="font-weight:700;font-size:15px;color:#1f2937">${escHtml(c.display_name)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px">事業所ID: ${c.id}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${isSelected ? '<span style="font-size:12px;font-weight:600;color:#2298ae;background:rgba(99,102,241,0.1);padding:4px 12px;border-radius:6px">選択中</span>' : ''}
            <form method="POST" action="/settings/company" style="margin:0">
              ${csrfHidden}
              <input type="hidden" name="companyId" value="${c.id}">
              <input type="hidden" name="companyName" value="${escHtml(c.display_name)}">
              <button type="submit" style="padding:8px 20px;border-radius:8px;border:none;background:${isSelected ? '#e5e7eb' : '#2298ae'};color:${isSelected ? '#6b7280' : '#fff'};font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity .15s">${isSelected ? '選択済み' : '選択する'}</button>
            </form>
          </div>
        </div>`;
    }).join('');

    res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>事業所の選択 | AI CFO</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Hiragino Sans",Meiryo,sans-serif;background:#f4f5f7;color:#1f2937;font-size:14px;min-height:100vh;display:flex;align-items:center;justify-content:center}
</style>
</head>
<body>
<div style="max-width:520px;width:100%;margin:40px auto;padding:0 20px">
  <div style="text-align:center;margin-bottom:32px">
    <div style="font-size:40px;margin-bottom:12px"></div>
    <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">事業所の選択</h1>
    <p style="font-size:14px;color:#6b7280">freeeに登録されている事業所から、使用する事業所を選択してください。</p>
  </div>
  <div style="margin-bottom:24px">
    ${companyCards}
  </div>
  ${selectedId ? `<div style="text-align:center"><a href="/" style="display:inline-block;background:#2298ae;color:#fff;padding:10px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">ダッシュボードへ</a></div>` : '<p style="text-align:center;color:#6b7280;font-size:13px">事業所を選択するとダッシュボードに進めます。</p>'}
  <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e5e7eb">${demoSection}</div>
</div>
</body>
</html>`);
  } catch (error) {
    logger.error('事業所一覧取得エラー', error);
    // freee接続失敗時もデモ選択画面を表示
    const demoActive2 = isDemoMode();
    const demoProfile2 = getDemoProfile();
    const escHtml2 = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const demoCards2 = DEMO_PROFILES.map(p => {
      const isSelected = demoActive2 && demoProfile2?.id === p.id;
      const revLabel = (p.revenue / 10000).toLocaleString() + '万円';
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border:2px solid ${isSelected ? '#f59e0b' : '#e5e7eb'};border-radius:10px;margin-bottom:10px;background:${isSelected ? 'rgba(245,158,11,0.06)' : '#fff'}"><div><div style="font-weight:700;font-size:15px">${escHtml2(p.companyName)}</div><div style="font-size:12px;color:#6b7280;margin-top:2px">${escHtml2(p.industry)} / ${p.employees}名 / ${revLabel}</div></div><form method="POST" action="/settings/demo" style="margin:0"><input type="hidden" name="profileId" value="${p.id}"><button type="submit" style="padding:8px 20px;border-radius:8px;border:none;background:#f59e0b;color:#fff;font-size:13px;font-weight:600;cursor:pointer">${isSelected ? 'デモ中' : 'デモ開始'}</button></form></div>`;
    }).join('');
    res.send(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>設定 | AI CFO</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN",sans-serif;background:#f4f5f7;color:#1f2937;font-size:14px;min-height:100vh;display:flex;align-items:center;justify-content:center}</style></head><body><div style="max-width:520px;width:100%;margin:40px auto;padding:0 20px"><div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;margin-bottom:24px;font-size:13px;color:#991b1b">freee接続に失敗しました。再認証するか、デモモードをご利用ください。</div><h2 style="font-size:18px;font-weight:700;margin-bottom:16px">デモモード</h2>${demoCards2}<div style="text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid #e5e7eb"><a href="/auth/freee" style="display:inline-block;background:#2298ae;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">freee再認証</a></div>${demoActive2 ? '<div style="text-align:center;margin-top:12px"><a href="/" style="display:inline-block;background:#f59e0b;color:#fff;padding:10px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">ダッシュボードへ（デモ）</a></div>' : ''}</div></body></html>`);
  }
});

app.post('/settings/company', express.urlencoded({ extended: true }), async (req, res) => {
  const companyId = parseInt(req.body.companyId, 10);
  const companyName = req.body.companyName || '';
  if (!companyId) {
    res.status(400).send('事業所IDが不正です');
    return;
  }
  const tid = getActiveTenantId(req);
  if (tid) await saveSelectedCompany(tid, companyId, companyName);
  clearCache(); // 事業所変更時はキャッシュクリア
  res.redirect('/settings/company');
});

// === チャット ===
app.get('/chat', async (req, res) => {
  const tid = getActiveTenantId(req) || undefined;
  const uid = req.session.user?.id;
  const history = await chatService.getHistory(tid, uid);
  const memory = await chatService.getMemory(tid);
  const osSummary = (tid && isEnterpriseOSAvailable()) ? await getOSSummary(asTenantId(tid)) : [];
  res.send(renderChatHTML(history, memory, chatService.isAvailable(), osSummary));
});

app.post('/chat/send', express.json(), async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) { res.json({ error: 'メッセージが空です' }); return; }

    // 「タスクにして」「タスク追加」でタスク自動生成
    const taskMatch = message.match(/(?:タスクにして|タスク追加|TODO)[：:]?\s*(.+)?/);
    if (taskMatch) {
      const title = taskMatch[1]?.trim() || message.replace(/タスクにして|タスク追加|TODO/g, '').trim();
      if (title) {
        await taskService.addFromChat(getActiveTenantId(req)!, title);
        res.json({ reply: `タスクを追加しました：「${title}」\n\nタスクボードで確認できます。` });
        return;
      }
    }

    const tid = getActiveTenantId(req) || undefined;

    // freeeデータをチャットに直接渡す（シングルトン状態廃止）
    await loadFreeeContextForChat(tid);
    const freeeCtx = chatService.getFreeeContext();

    // 月次トレンドデータも取得してAIに渡す
    let trendMonths: any[] = [];
    try {
      const trend = await buildTrendData(undefined, undefined, 6, false, tid);
      trendMonths = trend.months || [];
      logger.info(`チャット: トレンドデータ取得 ${trendMonths.length}ヶ月分`);
    } catch (e) {
      logger.warn('チャット: トレンドデータ取得失敗:', e instanceof Error ? e.message : e);
    }

    const result = await chatService.sendMessage(message, tid, freeeCtx, trendMonths, req.session.user?.id);
    res.json(result);
  } catch (error) {
    logger.error('チャットエラー', error);
    res.json({ error: error instanceof Error ? error.message : '不明なエラー' });
  }
});

/** freeeのPL/BSデータをチャット用コンテキストとして読み込む */
async function loadFreeeContextForChat(tenantId?: TenantId): Promise<void> {
  const token = await getFreeeToken(tenantId);
  if (!token) {
    logger.info(`チャット: freee未連携 (tenant: ${tenantId || 'none'})`);
    chatService.setFreeeContext(null);
    return;
  }
  logger.info(`チャット: freeeトークン取得成功 (tenant: ${tenantId})`);

  const cacheKey = `chat-freee-context-${await getSelectedCompanyId(tenantId)}`;
  const cached = getCached<any>(cacheKey);
  if (cached) {
    chatService.setFreeeContext(cached);
    return;
  }

  try {
    const auth = new FreeeAuthClient({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
    });
    const freeeService = new FreeeService(auth);

    const savedCompanyId = await getSelectedCompanyId(tenantId);
    let companyId: number;
    let companyName: string;
    if (savedCompanyId) {
      companyId = savedCompanyId;
      companyName = token.company_name || `事業所${companyId}`;
    } else {
      const companies = await freeeService.getCompanies();
      if (companies.length === 0) { chatService.setFreeeContext(null); return; }
      companyId = companies[0].id;
      companyName = companies[0].display_name;
    }

    const now = new Date();
    const targetYear = now.getFullYear();
    const targetMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // 前月

    const rawData = await freeeService.fetchMonthlyData(companyId, targetYear, targetMonth);

    // PL/BSを解析
    const { parsePLResponse } = await import('../domain/accounting/pl-parser.js');
    const { parseBSResponse } = await import('../domain/accounting/bs-parser.js');
    const currentPL = parsePLResponse(rawData.currentMonthPL, targetYear, targetMonth);
    const currentBS = parseBSResponse(rawData.currentMonthBS, targetYear, targetMonth);

    // 費用科目内訳（上位10件）
    const expenseBreakdown = (currentPL.expenseBreakdown || []).slice(0, 10).map((e: any) => ({
      name: e.name || e.accountName,
      amount: e.amount,
    }));

    const contextData = {
      companyName,
      currentMonth: { year: targetYear, month: targetMonth },
      pl: {
        revenue: currentPL.revenue,
        costOfSales: currentPL.costOfSales,
        grossProfit: currentPL.grossProfit,
        sgaExpenses: currentPL.sgaExpenses,
        operatingIncome: currentPL.operatingIncome,
        ordinaryIncome: currentPL.ordinaryIncome,
      },
      expenseBreakdown,
      bs: {
        cashAndDeposits: currentBS.cashAndDeposits,
        currentAssets: currentBS.currentAssets,
        currentLiabilities: currentBS.currentLiabilities,
        totalAssets: currentBS.totalAssets,
        totalLiabilities: currentBS.totalLiabilities,
        netAssets: currentBS.netAssets,
      },
    };

    setCache(cacheKey, contextData);
    chatService.setFreeeContext(contextData);
    logger.info('チャット用freeeコンテキストを設定しました');
  } catch (error) {
    logger.warn('チャット用freeeデータ取得に失敗:', error instanceof Error ? error.message : error);
    chatService.setFreeeContext(null);
  }
}

app.post('/chat/memory', express.urlencoded({ extended: true }), async (req, res) => {
  const tenantId = getActiveTenantId(req);
  const memory = await chatService.getMemory(tenantId || undefined);
  memory.companyName = req.body.companyName || '';
  memory.industry = req.body.industry || '';
  memory.employeeCount = req.body.employeeCount || '';
  memory.fiscalYearEnd = req.body.fiscalYearEnd || '';
  memory.notes = (req.body.notes || '').split('\n').filter((n: string) => n.trim());
  await chatService.saveMemory(memory, tenantId || undefined);
  res.redirect('/chat');
});

app.post('/chat/clear', async (req, res) => {
  await chatService.clearHistory(getActiveTenantId(req) || undefined, req.session.user?.id);
  res.json({ ok: true });
});

// 企業AI OSへの保存を確定
import { saveKnowledge, getOSSummary, isEnterpriseOSAvailable } from '../services/enterprise-os.js';
app.post('/chat/save-to-os', express.json(), async (req, res) => {
  const tenantId = getActiveTenantId(req);
  if (!tenantId) { res.status(400).json({ error: 'テナントが選択されていません' }); return; }
  const items: Array<{ category: string; fileName: string; content: string }> = req.body.items || [];
  const results: string[] = [];
  for (const item of items) {
    const result = await saveKnowledge(tenantId, item.category, item.fileName, item.content);
    results.push(result.message);
    logger.info(`企業AI OS保存確定: ${result.message}`);
  }
  res.json({ ok: true, results });
});

// === タスクボード ===
app.get('/tasks', async (req, res) => {
  const tasks = await taskService.list(getActiveTenantId(req)!);
  const summary = await taskService.getSummary(getActiveTenantId(req)!);
  const googleParam = req.query.google as string | undefined;
  const countParam = req.query.count as string | undefined;
  res.send(renderTaskPageHTML(tasks, summary, {
    googleConnected: googleParam || null,
    googleSyncCount: countParam ? parseInt(countParam, 10) : undefined,
  }));
});

app.post('/tasks/add', express.urlencoded({ extended: true }), async (req, res) => {
  await taskService.add(getActiveTenantId(req)!, {
    title: req.body.title,
    description: '',
    priority: req.body.priority || 'medium',
    status: 'todo',
    category: req.body.category || 'general',
    source: 'manual',
  });
  res.redirect('/tasks');
});

app.post('/tasks/:id/status', express.urlencoded({ extended: true }), async (req, res) => {
  const task = await taskService.get(req.params.id);
  await taskService.update(req.params.id, { status: req.body.status });

  // Google Tasks連携: 完了時に同期
  const gtid = getActiveTenantId(req);
  if (gtid) await googleTasksClient.loadForTenant(gtid);
  if (task && req.body.status === 'done' && googleTasksClient.isAuthenticated()) {
    try {
      const listId = await googleTasksClient.getOrCreateTaskList('AI CFO');
      const catLabel = ({ finance: '【財務】', accounting: '【会計】', cashflow: '【資金繰り】', plan: '【事業計画】', general: '' } as Record<string, string>)[task.category] || '';
      const prLabel = task.priority === 'high' ? '[重要] ' : '';
      const fullTitle = `${prLabel}${catLabel}${task.title}`;
      const googleTask = await googleTasksClient.findTaskByTitle(listId, fullTitle);
      if (googleTask?.id) {
        await googleTasksClient.updateTaskStatus(listId, googleTask.id, 'completed');
        logger.info(`Google Taskを完了に更新: ${fullTitle}`);
      }
    } catch (e) {
      logger.warn('Google Task完了同期に失敗:', e instanceof Error ? e.message : e);
    }
  }

  res.redirect('/tasks');
});

app.post('/tasks/:id/edit', express.urlencoded({ extended: true }), async (req, res) => {
  await taskService.update(req.params.id, {
    title: req.body.title,
    description: req.body.description,
    priority: req.body.priority,
    category: req.body.category,
    dueDate: req.body.dueDate || undefined,
  });
  res.redirect('/tasks');
});

app.post('/tasks/:id/delete', async (_req, res) => {
  await taskService.delete(_req.params.id);
  res.redirect('/tasks');
});

// 月次タスクの一括生成
app.post('/tasks/generate-monthly', express.urlencoded({ extended: true }), async (req, res) => {
  const [year, month] = (req.body.month || '').split('-').map(Number);
  if (!year || !month) { res.redirect('/tasks'); return; }
  const tasks = generateMonthlyTasks(year, month);
  await taskService.addBatch(getActiveTenantId(req)!, tasks);
  logger.info(`${year}年${month}月の定型タスク${tasks.length}件を生成しました`);
  res.redirect('/tasks');
});

// === Google連携（Gmail / Tasks）設定画面 ===
import { renderGoogleSettingsHTML } from './google-settings-page.js';

app.get('/settings/google', async (req, res) => {
  const user = req.session.user;
  const tid = getActiveTenantId(req);
  // テナントのGoogle連携状態をDBから読み込み
  if (tid) await googleTasksClient.loadForTenant(tid);
  res.send(renderGoogleSettingsHTML({
    user: user ? { ...user, picture: '', tenantRole: req.session.activeTenantRole || '' } : undefined,
    isConfigured: googleTasksClient.isConfigured(),
    isAuthenticated: googleTasksClient.isAuthenticated(),
  }));
});

// Google OAuth認証開始（連携用、ログイン目的ではない）
app.get('/settings/google/auth', (req, res) => {
  if (!googleTasksClient.isConfigured()) {
    res.redirect('/settings/google');
    return;
  }
  const tid = getActiveTenantId(req);
  res.redirect(googleTasksClient.getAuthUrl(tid || undefined));
});

// Google OAuthコールバック
app.get('/auth/google/callback', async (req, res) => {
  try {
    const code = req.query.code as string;
    const stateTenantId = req.query.state as string || '';
    const tenantId = stateTenantId ? asTenantId(stateTenantId) : getActiveTenantId(req);
    if (!code || !tenantId) { res.redirect('/settings/google'); return; }
    await googleTasksClient.exchangeCode(code, tenantId);
    res.redirect('/settings/google');
  } catch (error) {
    logger.error('Google連携エラー', error);
    res.redirect('/settings/google');
  }
});

// Google連携解除
app.post('/settings/google/disconnect', async (req, res) => {
  const tid = getActiveTenantId(req);
  await googleTasksClient.disconnect(tid || undefined);
  res.redirect('/settings/google');
});

// 旧URLからリダイレクト
app.get('/auth/google', (_req, res) => res.redirect('/settings/google/auth'));
app.post('/auth/google/disconnect', (_req, res) => res.redirect(307, '/settings/google/disconnect'));

// Google Tasksにタスクを同期（選択されたタスクのみ）
app.post('/tasks/sync-google', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const tid = getActiveTenantId(req);
    if (tid) await googleTasksClient.loadForTenant(tid);
    if (!googleTasksClient.isAuthenticated()) {
      res.redirect('/settings/google');
      return;
    }

    const taskIds = (req.body.taskIds || '').split(',').filter((id: string) => id.trim());
    if (taskIds.length === 0) {
      res.redirect('/tasks');
      return;
    }

    const listId = await googleTasksClient.getOrCreateTaskList('AI CFO');

    // 既存のGoogleタスクを取得して重複チェック
    const existingGoogleTasks = await googleTasksClient.listTasks(listId);
    const existingTitles = new Set(existingGoogleTasks.map(t => t.title));

    let syncCount = 0;
    for (const id of taskIds) {
      const task = await taskService.get(id);
      if (!task) continue;

      const catLabel = ({ finance: '【財務】', accounting: '【会計】', cashflow: '【資金繰り】', plan: '【事業計画】', general: '' } as Record<string, string>)[task.category] || '';
      const prLabel = task.priority === 'high' ? '[重要] ' : '';
      const fullTitle = `${prLabel}${catLabel}${task.title}`;

      if (existingTitles.has(fullTitle)) continue; // 同名タスクはスキップ

      await googleTasksClient.createTask(listId, {
        title: fullTitle,
        notes: task.description || undefined,
        due: task.dueDate || undefined,
        status: task.status === 'done' ? 'completed' : 'needsAction',
      });
      syncCount++;
    }

    logger.info(`Google Tasksに${syncCount}件のタスクを同期しました`);
    res.redirect(`/tasks?google=synced&count=${syncCount}`);
  } catch (error) {
    logger.error('Google Tasks同期エラー', error);
    res.status(500).send(`同期に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
});

// === 秘書AI連携API ===
// タスク一覧（秘書AIが取得）
app.get('/api/tasks', async (req, res) => {
  res.json(await taskService.exportForAssistant(getActiveTenantId(req)!));
});

// タスク追加（秘書AIが追加）
app.post('/api/tasks', express.json(), async (req, res) => {
  const task = await taskService.add(getActiveTenantId(req)!, {
    title: req.body.title,
    description: req.body.description || '',
    priority: req.body.priority || 'medium',
    status: 'todo',
    category: req.body.category || 'general',
    source: 'manual',
  });
  res.json(task);
});

// タスク更新（秘書AIがステータス変更）
app.patch('/api/tasks/:id', express.json(), async (req, res) => {
  const task = await taskService.update(req.params.id, req.body);
  if (!task) { res.status(404).json({ error: 'not found' }); return; }
  res.json(task);
});

// 会社情報（秘書AIが参照）
app.get('/api/company', async (req, res) => {
  const memory = await chatService.getMemory(getActiveTenantId(req) || undefined);
  const analyses = await analysisStore.list(getActiveTenantId(req)!);
  res.json({ company: memory, latestAnalyses: analyses.slice(0, 5) });
});

// API使用量
app.get('/api/usage', (_req, res) => {
  res.json(usageTracker.getSummary());
});

// === 404 / 500 エラーハンドラ ===
import { renderErrorHTML } from './error-page.js';

/** freee未接続・デモモードOFF時のダッシュボード */
function renderNoDataDashboard(req?: express.Request): string {
  const csrf = req?.session.csrfToken || '';
  const uploadError = req?.query.upload_error ? String(req.query.upload_error) : '';
  const escMsg = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>AI CFO</title><style>${SHARED_CSS}
.upload-modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.5);display:none;align-items:center;justify-content:center;z-index:9999;padding:16px}
.upload-modal-overlay.open{display:flex}
.upload-modal{background:#fff;border-radius:14px;max-width:760px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.2);overflow:hidden}
.upload-modal-header{padding:20px 24px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
.upload-modal-header h3{font-size:17px;font-weight:700}
.upload-modal-close{background:none;border:none;font-size:24px;color:var(--text2);cursor:pointer;line-height:1;padding:0 4px}
.upload-modal-body{padding:24px;overflow-y:auto;flex:1}
.upload-modal-intro{font-size:13px;color:var(--text2);margin-bottom:20px;line-height:1.7}
.upload-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.upload-choice{display:flex;flex-direction:column;padding:24px;border:2px solid var(--border);border-radius:12px;background:#fff;cursor:pointer;transition:all .15s;text-align:left;min-height:240px}
.upload-choice:hover{border-color:var(--primary);background:var(--primary-light);transform:translateY(-2px)}
.upload-choice.recommend{border-color:#2298ae;background:rgba(34,152,174,0.04)}
.upload-choice-badge{align-self:flex-start;font-size:10px;font-weight:700;background:#2298ae;color:#fff;padding:3px 10px;border-radius:10px;margin-bottom:8px}
.upload-choice-icon{font-size:28px;margin-bottom:8px}
.upload-choice h4{font-size:15px;font-weight:700;margin-bottom:8px}
.upload-choice-desc{font-size:13px;color:var(--text2);line-height:1.6;flex:1}
.upload-choice-features{margin-top:12px;font-size:12px;color:var(--text2)}
.upload-choice-features li{padding:2px 0}
.upload-choice-features li.ok::before{content:'✓ ';color:#2298ae;font-weight:700}
.upload-choice-features li.no::before{content:'– ';color:#9ca3af}
.upload-form-section{display:none;padding-top:20px;border-top:1px solid var(--border);margin-top:20px}
.upload-form-section.active{display:block}
.upload-form-section h4{font-size:14px;font-weight:700;margin-bottom:12px}
.upload-form-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.upload-form-row input[type=file]{flex:1;font-size:13px}
.upload-form-row button{padding:10px 20px;border-radius:8px;border:none;background:var(--primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer}
.upload-form-row button:disabled{opacity:0.5;cursor:wait}
.upload-form-hint{font-size:11px;color:var(--text2);margin-top:8px}
.upload-error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px}
@media(max-width:640px){.upload-choice-grid{grid-template-columns:1fr}}
</style></head><body>
${renderSidebar('dashboard')}
<div class="main"><div class="content" style="display:flex;align-items:center;justify-content:center;min-height:calc(100vh - 80px)">
  <div style="text-align:center;max-width:560px;padding:40px">
    <div style="font-size:48px;margin-bottom:16px">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
    </div>
    <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">データがまだありません</h2>
    <p style="color:#6b7280;font-size:14px;line-height:1.7;margin-bottom:24px">
      ダッシュボードを表示するには、freee API連携、決算書/試算表のアップロード、またはデモモードで開始してください。
    </p>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      <button type="button" class="btn-primary" onclick="document.getElementById('uploadModal').classList.add('open')" style="border:none;font-family:inherit">決算書もしくは試算表を登録する</button>
      <a href="/settings/company" class="btn-secondary">freee事業所設定</a>
      <form method="POST" action="/auth/demo" style="margin:0;display:inline">
        <input type="hidden" name="_csrf" value="${csrf}">
        <button type="submit" class="btn-secondary" style="border:1px solid var(--border);background:var(--bg);font-family:inherit">デモモードで試す</button>
      </form>
    </div>
  </div>
</div></div>

<!-- アップロードモーダル -->
<div class="upload-modal-overlay${uploadError ? ' open' : ''}" id="uploadModal">
  <div class="upload-modal">
    <div class="upload-modal-header">
      <h3>決算書 / 試算表を登録</h3>
      <button type="button" class="upload-modal-close" onclick="document.getElementById('uploadModal').classList.remove('open');resetUploadChoice()">&times;</button>
    </div>
    <div class="upload-modal-body">
      <style>
        .upload-dropzone{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
          border:2px dashed #cbd5e1;border-radius:12px;padding:22px 16px;cursor:pointer;text-align:center;
          background:#f8fafc;transition:border-color .15s,background .15s}
        .upload-dropzone:hover{border-color:#2298ae;background:#f0f9fb}
        .upload-dropzone.drag{border-color:#2298ae;background:#e6f4f7}
        .upload-dropzone input[type=file]{display:none}
        .upload-dz-icon{font-size:22px;line-height:1}
        .upload-dz-text{font-size:13px;color:#64748b;line-height:1.5}
        .upload-dz-files{font-size:12px;color:#1b7f8e;font-weight:700;word-break:break-all;margin-top:2px}
      </style>
      ${uploadError ? `<div class="upload-error">${escMsg(uploadError)}</div>` : ''}
      <p class="upload-modal-intro">登録する資料の種類を選択してください。資料に応じてダッシュボードの表示内容が変わります。</p>
      <div class="upload-choice-grid">
        <button type="button" class="upload-choice recommend" onclick="selectUpload('trend')">
          <span class="upload-choice-badge">おすすめ</span>
          <div class="upload-choice-icon">📊</div>
          <h4>月次推移試算表を登録</h4>
          <p class="upload-choice-desc">複数月分のPL/BSが入った試算表。詳細なダッシュボードが表示できます。</p>
          <ul class="upload-choice-features">
            <li class="ok">月次推移グラフ</li>
            <li class="ok">前月比較・異常検知</li>
            <li class="ok">単月PL/BS・銀行評価</li>
          </ul>
        </button>
        <button type="button" class="upload-choice" onclick="selectUpload('snapshot')">
          <div class="upload-choice-icon">📄</div>
          <h4>単月試算表 / 決算書を登録</h4>
          <p class="upload-choice-desc">ある時点の数値だけが入った資料。簡易ダッシュボードを表示します。</p>
          <ul class="upload-choice-features">
            <li class="no">月次推移グラフ（要freee or 月次推移）</li>
            <li class="no">前月比較</li>
            <li class="ok">単月PL/BS・銀行評価</li>
          </ul>
        </button>
      </div>

      <div class="upload-form-section" id="uploadForm-trend">
        <h4>月次推移試算表のアップロード</h4>
        <form method="POST" action="/agent/finance/upload-trend?_csrf=${encodeURIComponent(csrf)}" enctype="multipart/form-data" onsubmit="onUploadSubmit(this)">
          <label class="upload-dropzone">
            <input type="file" name="files" accept=".pdf,.csv,.txt" multiple>
            <span class="upload-dz-icon">📎</span>
            <span class="upload-dz-text">ファイルをここにドラッグ&ドロップ<br>またはクリックして選択（複数可）</span>
            <span class="upload-dz-files"></span>
          </label>
          <div class="upload-form-row" style="justify-content:flex-end;margin-top:12px">
            <button type="submit">アップロードして解析</button>
          </div>
          <p class="upload-form-hint">PDF / CSV / TXT 対応。<strong>複数ファイル選択可</strong>（BS・PLが別ファイルでもまとめて選べます）。Gemini AI が月ごとのPL/BSを抽出して保存します（数十秒かかります）。</p>
        </form>
      </div>

      <div class="upload-form-section" id="uploadForm-snapshot">
        <h4>単月試算表 / 決算書のアップロード</h4>
        <form method="POST" action="/agent/finance/upload-snapshot?_csrf=${encodeURIComponent(csrf)}" enctype="multipart/form-data" onsubmit="onUploadSubmit(this)">
          <label class="upload-dropzone">
            <input type="file" name="files" accept=".pdf,.csv,.txt" multiple>
            <span class="upload-dz-icon">📎</span>
            <span class="upload-dz-text">ファイルをここにドラッグ&ドロップ<br>またはクリックして選択（複数可）</span>
            <span class="upload-dz-files"></span>
          </label>
          <div class="upload-form-row" style="justify-content:flex-end;margin-top:12px">
            <button type="submit">アップロードして解析</button>
          </div>
          <p class="upload-form-hint">PDF / CSV / TXT 対応。<strong>複数ファイル選択可</strong>（貸借対照表と損益計算書が別CSVでもまとめて選べます）。Gemini AI が単月のPL/BSを抽出して保存します。</p>
        </form>
      </div>
    </div>
  </div>
</div>

<script>
function selectUpload(t){
  resetUploadChoice();
  document.getElementById('uploadForm-'+t).classList.add('active');
  document.querySelectorAll('.upload-choice').forEach(function(b){b.style.borderColor='';});
  event.currentTarget.style.borderColor='#2298ae';
}
function resetUploadChoice(){
  document.querySelectorAll('.upload-form-section').forEach(function(s){s.classList.remove('active');});
}
function onUploadSubmit(form){
  var input=form.querySelector('input[type=file]');
  if(!input || !input.files || input.files.length===0){
    if(window.__toast) window.__toast('ファイルを選択してください','error'); else alert('ファイルを選択してください');
    return false;
  }
  var btn=form.querySelector('button[type=submit]');
  btn.disabled=true;btn.textContent='解析中...（数十秒かかります）';
  if(window.__showLoading) window.__showLoading('AIが資料を解析しています', 'PDFの読取〜PL/BS抽出に30秒〜1分程度かかります');
  return true;
}
// ドラッグ&ドロップ（複数ファイル）
document.querySelectorAll('.upload-dropzone').forEach(function(dz){
  var input=dz.querySelector('input[type=file]');
  var filesEl=dz.querySelector('.upload-dz-files');
  function renderNames(){
    if(!input.files || !input.files.length){ filesEl.textContent=''; return; }
    var arr=[]; for(var i=0;i<input.files.length;i++) arr.push(input.files[i].name);
    filesEl.textContent = input.files.length+'個のファイル: '+arr.join('、');
  }
  ['dragenter','dragover'].forEach(function(ev){
    dz.addEventListener(ev,function(e){e.preventDefault();e.stopPropagation();dz.classList.add('drag');});
  });
  ['dragleave','drop'].forEach(function(ev){
    dz.addEventListener(ev,function(e){e.preventDefault();e.stopPropagation();dz.classList.remove('drag');});
  });
  dz.addEventListener('drop',function(e){
    if(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length){
      input.files=e.dataTransfer.files; renderNames();
    }
  });
  input.addEventListener('change',renderNames);
});
</script>
</body></html>`;
}

/**
 * アップロードした月次データだけがある場合の簡易ダッシュボード。
 * - 1件のみ → 単月スナップショット表示（推移グラフは出ない）
 * - 複数月 → トレンドグラフ + 最新月の主要KPI
 */
function renderUploadedDashboard(snapshots: import('../types/trend.js').MonthlySnapshot[], req: express.Request): string {
  const csrf = req.session.csrfToken || '';
  const fmt = (n: number) => new Intl.NumberFormat('ja-JP').format(Math.round(n));
  const latest = snapshots[snapshots.length - 1];
  const isSingle = snapshots.length === 1;
  const uploaded = req.query.uploaded as string | undefined;
  const period = req.query.period as string | undefined;
  const count = req.query.count as string | undefined;
  const notes = req.query.notes as string | undefined;
  const escMsg = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const successBanner = uploaded ? `
    <div style="background:#ecf6f8;border:1px solid #a8d8e0;color:#1b7f8e;border-radius:10px;padding:14px 18px;margin-bottom:20px;font-size:14px">
      <strong>✓ アップロード完了</strong>
      ${uploaded === 'trend' ? ` ${escMsg(count || '0')}か月分のデータを取り込みました` : ` ${escMsg(period || '')}のデータを取り込みました`}
      ${notes ? `<div style="font-size:12px;margin-top:6px;color:#555">AIメモ: ${escMsg(notes)}</div>` : ''}
    </div>` : '';

  const upgradeNotice = isSingle ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:10px;padding:16px 20px;margin-top:20px;font-size:13px;line-height:1.7">
      <strong>📈 詳細な月次推移を見るには</strong><br>
      現在は単月のスナップショットのみが登録されています。月次推移グラフ・前月比較・異常検知などをご覧になるには、<strong>freee連携</strong>または<strong>月次推移試算表のアップロード</strong>をお願いします。
      <div style="margin-top:10px;display:flex;gap:8px">
        <a href="/settings/company" class="btn-primary btn-sm" style="text-decoration:none">freee事業所設定</a>
        <button type="button" class="btn-secondary btn-sm" onclick="document.getElementById('uploadModal').classList.add('open')" style="border:1px solid #e5e7eb;background:#fff;cursor:pointer;font-family:inherit">月次推移をアップロード</button>
      </div>
    </div>` : '';

  const trendChart = !isSingle ? `
    <div class="card" style="margin-top:20px">
      <div class="card-header"><h3>月次推移（売上・経常利益）</h3><span class="card-sub">登録された${snapshots.length}か月</span></div>
      <div class="card-chart"><canvas id="trendChart"></canvas></div>
    </div>
    <script>
    (function(){
      var ctx=document.getElementById('trendChart');
      if(!ctx||!window.Chart)return;
      new Chart(ctx,{
        type:'line',
        data:{
          labels:${JSON.stringify(snapshots.map(s => `${s.year}/${s.month}`))},
          datasets:[
            {label:'売上高',data:${JSON.stringify(snapshots.map(s => s.revenue))},borderColor:'#2298ae',backgroundColor:'rgba(34,152,174,0.1)',tension:0.3},
            {label:'経常利益',data:${JSON.stringify(snapshots.map(s => s.ordinaryIncome))},borderColor:'#f59e0b',backgroundColor:'rgba(245,158,11,0.1)',tension:0.3}
          ]
        },
        options:{responsive:true,maintainAspectRatio:false}
      });
    })();
    </script>` : '';

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>AI CFO</title><script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script><style>${SHARED_CSS}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px}
.kpi-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px}
.kpi-label{font-size:12px;color:var(--text2);font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em}
.kpi-value{font-size:24px;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums}
.kpi-unit{font-size:13px;color:var(--text2);margin-left:4px}
.snap-badge{display:inline-block;background:#2298ae;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:10px;margin-left:8px;vertical-align:middle}
</style></head><body>
${renderSidebar('dashboard')}
<div class="main">
  <header class="header">
    <div class="header-left"><h1 class="header-title">ダッシュボード${isSingle ? '<span class="snap-badge">単月スナップショット</span>' : `<span class="snap-badge">登録データ ${snapshots.length}か月</span>`}</h1></div>
    <div class="header-right">
      <button type="button" class="btn-secondary" onclick="document.getElementById('uploadModal').classList.add('open')" style="border:1px solid var(--border);background:var(--bg);cursor:pointer;font-family:inherit">データを追加</button>
    </div>
  </header>
  <div class="content">
    ${successBanner}
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">${latest.year}年${latest.month}月 売上高</div><div class="kpi-value">${fmt(latest.revenue || 0)}<span class="kpi-unit">円</span></div></div>
      <div class="kpi-card"><div class="kpi-label">営業利益</div><div class="kpi-value">${fmt(latest.operatingIncome || 0)}<span class="kpi-unit">円</span></div></div>
      <div class="kpi-card"><div class="kpi-label">経常利益</div><div class="kpi-value">${fmt(latest.ordinaryIncome || 0)}<span class="kpi-unit">円</span></div></div>
      <div class="kpi-card"><div class="kpi-label">現金・預金</div><div class="kpi-value">${fmt(latest.cashAndDeposits || 0)}<span class="kpi-unit">円</span></div></div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">総資産</div><div class="kpi-value">${fmt(latest.totalAssets || 0)}<span class="kpi-unit">円</span></div></div>
      <div class="kpi-card"><div class="kpi-label">純資産</div><div class="kpi-value">${fmt(latest.netAssets || 0)}<span class="kpi-unit">円</span></div></div>
      <div class="kpi-card"><div class="kpi-label">流動資産</div><div class="kpi-value">${fmt(latest.currentAssets || 0)}<span class="kpi-unit">円</span></div></div>
      <div class="kpi-card"><div class="kpi-label">流動負債</div><div class="kpi-value">${fmt(latest.currentLiabilities || 0)}<span class="kpi-unit">円</span></div></div>
    </div>
    ${trendChart}
    ${upgradeNotice}
  </div>
</div>

<!-- アップロード追加モーダル（renderNoDataDashboardと同じ） -->
<div class="upload-modal-overlay" id="uploadModal" style="position:fixed;inset:0;background:rgba(15,23,42,0.5);display:none;align-items:center;justify-content:center;z-index:9999;padding:16px">
  <div style="background:#fff;border-radius:14px;max-width:760px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.2);overflow:hidden">
    <div style="padding:20px 24px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <h3 style="font-size:17px;font-weight:700">データを追加</h3>
      <button type="button" onclick="document.getElementById('uploadModal').classList.remove('open');document.getElementById('uploadModal').style.display='none'" style="background:none;border:none;font-size:24px;color:var(--text2);cursor:pointer">&times;</button>
    </div>
    <div style="padding:24px;overflow-y:auto;flex:1">
      <p style="font-size:13px;color:var(--text2);margin-bottom:16px">追加する資料の種類を選んでください。</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <form method="POST" action="/agent/finance/upload-trend?_csrf=${encodeURIComponent(csrf)}" enctype="multipart/form-data" style="padding:16px;border:2px solid var(--border);border-radius:10px" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='解析中...';window.__showLoading&&window.__showLoading('AIが資料を解析しています','30秒〜1分程度かかります')">
          <h4 style="font-size:14px;font-weight:700;margin-bottom:8px">📊 月次推移試算表</h4>
          <p style="font-size:12px;color:var(--text2);margin-bottom:10px">複数月分。詳細表示。</p>
          <input type="file" name="file" accept=".pdf,.csv,.txt" required style="width:100%;font-size:12px;margin-bottom:8px">
          <button type="submit" class="btn-primary btn-sm" style="width:100%;border:none;font-family:inherit;cursor:pointer">アップロード</button>
        </form>
        <form method="POST" action="/agent/finance/upload-snapshot?_csrf=${encodeURIComponent(csrf)}" enctype="multipart/form-data" style="padding:16px;border:2px solid var(--border);border-radius:10px" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='解析中...';window.__showLoading&&window.__showLoading('AIが資料を解析しています','30秒〜1分程度かかります')">
          <h4 style="font-size:14px;font-weight:700;margin-bottom:8px">📄 単月試算表/決算書</h4>
          <p style="font-size:12px;color:var(--text2);margin-bottom:10px">1時点。簡易表示。</p>
          <input type="file" name="file" accept=".pdf,.csv,.txt" required style="width:100%;font-size:12px;margin-bottom:8px">
          <button type="submit" class="btn-secondary btn-sm" style="width:100%;border:1px solid var(--border);background:var(--bg);font-family:inherit;cursor:pointer">アップロード</button>
        </form>
      </div>
    </div>
  </div>
</div>
<style>.upload-modal-overlay.open{display:flex !important}</style>
</body></html>`;
}

/** 汎用「データなし」ページ（各AIエージェント用） */
function renderNoDataPage(title: string, message: string): string {
  return agentPageShell({
    active: '',
    title,
    bodyHTML: '<div style="text-align:center;padding:60px 20px">' +
      '<div style="font-size:48px;margin-bottom:16px"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>' +
      '<h2 style="font-size:20px;font-weight:700;margin-bottom:8px">' + title + '</h2>' +
      '<p style="color:#6b7280;font-size:14px;line-height:1.7;margin-bottom:24px">' + message + '</p>' +
      '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">' +
      '<a href="/settings/company" class="btn-primary">freee事業所設定</a>' +
      '<a href="/auth/demo" class="btn-secondary">デモモードで試す</a>' +
      '</div></div>',
  });
}

app.use((_req, res) => {
  res.status(404).send(renderErrorHTML(404));
});

app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error('Unhandled error', err);
  res.status(500).send(renderErrorHTML(500));
});

app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  AI CFO');
  console.log('========================================');
  console.log(`  ダッシュボード:     http://localhost:${PORT}`);
  console.log(`  月次レポート:       http://localhost:${PORT}/report`);
  console.log(`  財務分析AI:         http://localhost:${PORT}/agent/finance`);
  console.log(`  事業計画AI:         http://localhost:${PORT}/plan`);
  console.log(`  会計AI:             http://localhost:${PORT}/agent/accounting`);
  console.log(`  資金調達AI:         http://localhost:${PORT}/agent/funding`);
  console.log(`  秘書AI:             http://localhost:${PORT}/agent/secretary`);
  console.log(`  API (JSON):         http://localhost:${PORT}/api/report`);
  console.log('========================================');
  console.log('');
});
