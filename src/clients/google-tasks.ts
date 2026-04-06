import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

const TOKEN_FILE = path.resolve('data/google-token.json');

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
  due?: string; // RFC 3339 timestamp
  status?: 'needsAction' | 'completed';
}

/**
 * Google Tasks APIクライアント
 *
 * OAuth 2.0で認証し、タスクの作成・同期を行う。
 */
class GoogleTasksClient {
  private tokens: GoogleTokens | null = null;

  constructor() {
    this.loadTokens();
  }

  /** Google OAuth認証情報が設定されているか */
  isConfigured(): boolean {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  /** アクセストークンがあるか（認証済みか） */
  isAuthenticated(): boolean {
    return this.tokens !== null && !!this.tokens.refresh_token;
  }

  /** OAuth認可URL生成 */
  getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/gmail.compose',
      access_type: 'offline',
      prompt: 'consent',
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /** 認可コードからトークン取得 */
  async exchangeCode(code: string): Promise<void> {
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
    this.saveTokens();
    logger.info('Google認証完了');
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
    this.saveTokens();
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
    logger.info(`Googleタスクリスト「${title}」を作成しました`);
    return res.data.id;
  }

  /** タスクを追加 */
  async addTask(listId: string, task: GoogleTask): Promise<string> {
    const token = await this.getAccessToken();
    const body: any = {
      title: task.title,
      notes: task.notes || '',
      status: task.status || 'needsAction',
    };
    if (task.due) {
      // Google Tasks APIはRFC 3339形式（日付のみの場合はT00:00:00.000Z）
      body.due = task.due.length === 10 ? `${task.due}T00:00:00.000Z` : task.due;
    }

    const res = await axios.post(
      `${TASKS_API_BASE}/lists/${listId}/tasks`,
      body,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return res.data.id;
  }

  /** 指定リストのタスク一覧を取得 */
  async listTasks(listId: string): Promise<GoogleTask[]> {
    const token = await this.getAccessToken();
    const res = await axios.get(
      `${TASKS_API_BASE}/lists/${listId}/tasks`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { showCompleted: true, maxResults: 100 },
      },
    );
    return (res.data.items || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      notes: item.notes,
      due: item.due,
      status: item.status,
    }));
  }

  /** タスクのステータスを更新 */
  async updateTaskStatus(listId: string, taskId: string, status: 'needsAction' | 'completed'): Promise<void> {
    const token = await this.getAccessToken();
    await axios.patch(
      `${TASKS_API_BASE}/lists/${listId}/tasks/${taskId}`,
      { status },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }

  /** タイトルでGoogle Taskを検索 */
  async findTaskByTitle(listId: string, title: string): Promise<GoogleTask | null> {
    const tasks = await this.listTasks(listId);
    return tasks.find(t => t.title === title) || null;
  }

  /** 認証解除 */
  disconnect(): void {
    this.tokens = null;
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
    logger.info('Google連携を解除しました');
  }

  private loadTokens(): void {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        this.tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
      }
    } catch {
      this.tokens = null;
    }
  }

  private saveTokens(): void {
    const dir = path.dirname(TOKEN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(this.tokens, null, 2), 'utf-8');
  }
}

export const googleTasksClient = new GoogleTasksClient();
