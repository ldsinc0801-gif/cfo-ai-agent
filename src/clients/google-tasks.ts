import axios from 'axios';
import { logger } from '../utils/logger.js';
import { getOAuthToken, saveOAuthToken, deleteOAuthToken } from '../services/oauth-token-service.js';
import type { TenantId } from '../types/auth.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';

interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

interface GoogleTaskList {
  id: string;
  title: string;
}

interface GoogleTask {
  id?: string;
  title: string;
  notes?: string;
  due?: string;
  status?: 'needsAction' | 'completed';
}

/**
 * Google Tasks APIクライアント（テナント分離）
 * トークンはSupabase tenant_oauth_tokens テーブルに保存
 */
class GoogleTasksClient {
  private tokens: GoogleTokens | null = null;
  private currentTenantId: TenantId | null = null;

  /** Google OAuth認証情報が設定されているか */
  isConfigured(): boolean {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  /** アクセストークンがあるか（認証済みか） */
  isAuthenticated(): boolean {
    return this.tokens !== null && !!this.tokens.refresh_token;
  }

  /** テナントのトークンをDBから読み込む */
  async loadForTenant(tenantId: TenantId): Promise<void> {
    this.currentTenantId = tenantId;
    const token = await getOAuthToken(tenantId, 'google');
    if (token && token.accessToken) {
      this.tokens = {
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        expires_at: token.tokenExpiry ? new Date(token.tokenExpiry).getTime() : 0,
      };
    } else {
      this.tokens = null;
    }
  }

  /** OAuth認可URL生成（stateにtenantIdを埋め込む） */
  getAuthUrl(tenantId?: TenantId): string {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/gmail.compose',
      access_type: 'offline',
      prompt: 'consent',
    });
    if (tenantId) params.set('state', tenantId);
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /** 認可コードからトークン取得・保存 */
  async exchangeCode(code: string, tenantId: TenantId): Promise<void> {
    const res = await axios.post(GOOGLE_TOKEN_URL, {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
      grant_type: 'authorization_code',
    });

    this.tokens = {
      access_token: res.data.access_token,
      refresh_token: res.data.refresh_token,
      expires_at: Date.now() + (res.data.expires_in - 60) * 1000,
    };
    this.currentTenantId = tenantId;
    await this.saveTokensToDB();
    logger.info(`Google認証完了 (tenant: ${tenantId})`);
  }

  /** トークンリフレッシュ */
  private async refreshAccessToken(): Promise<void> {
    if (!this.tokens?.refresh_token) throw new Error('リフレッシュトークンがありません');

    const res = await axios.post(GOOGLE_TOKEN_URL, {
      refresh_token: this.tokens.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    });

    this.tokens.access_token = res.data.access_token;
    this.tokens.expires_at = Date.now() + (res.data.expires_in - 60) * 1000;
    if (res.data.refresh_token) {
      this.tokens.refresh_token = res.data.refresh_token;
    }
    await this.saveTokensToDB();
  }

  /** 有効なアクセストークンを取得 */
  private async getAccessToken(): Promise<string> {
    if (!this.tokens) throw new Error('Google未認証です');
    if (Date.now() >= this.tokens.expires_at) {
      await this.refreshAccessToken();
    }
    return this.tokens!.access_token;
  }

  /** タスクリスト一覧取得 */
  async getTaskLists(): Promise<GoogleTaskList[]> {
    const token = await this.getAccessToken();
    const res = await axios.get(`${TASKS_API_BASE}/users/@me/lists`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return (res.data.items || []).map((item: any) => ({
      id: item.id,
      title: item.title,
    }));
  }

  /** 「AI CFO」タスクリストを取得or作成 */
  async getOrCreateTaskList(title: string = 'AI CFO'): Promise<string> {
    const lists = await this.getTaskLists();
    const existing = lists.find(l => l.title === title);
    if (existing) return existing.id;

    const token = await this.getAccessToken();
    const res = await axios.post(
      `${TASKS_API_BASE}/users/@me/lists`,
      { title },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return res.data.id;
  }

  /** タスク一覧取得 */
  async listTasks(taskListId: string): Promise<GoogleTask[]> {
    const token = await this.getAccessToken();
    const res = await axios.get(`${TASKS_API_BASE}/lists/${taskListId}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return (res.data.items || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      notes: item.notes,
      due: item.due,
      status: item.status,
    }));
  }

  /** タスク作成 */
  async createTask(taskListId: string, task: GoogleTask): Promise<string> {
    const token = await this.getAccessToken();
    const res = await axios.post(
      `${TASKS_API_BASE}/lists/${taskListId}/tasks`,
      {
        title: task.title,
        notes: task.notes,
        due: task.due,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return res.data.id;
  }

  /** 認証解除 */
  async disconnect(tenantId?: TenantId): Promise<void> {
    const tid = tenantId || this.currentTenantId;
    this.tokens = null;
    if (tid) {
      await deleteOAuthToken(tid, 'google');
    }
    logger.info('Google連携を解除しました');
  }

  /** DBにトークンを保存 */
  private async saveTokensToDB(): Promise<void> {
    if (!this.currentTenantId || !this.tokens) return;
    await saveOAuthToken(this.currentTenantId, 'google', {
      accessToken: this.tokens.access_token,
      refreshToken: this.tokens.refresh_token,
      tokenExpiry: new Date(this.tokens.expires_at).toISOString(),
    });
  }
}

export const googleTasksClient = new GoogleTasksClient();
