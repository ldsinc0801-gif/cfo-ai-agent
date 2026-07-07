import axios from 'axios';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

/**
 * freee OAuth認証クライアント
 *
 * freee APIはOAuth2.0認証を使用する。
 * 初回は認可コードフローでアクセストークンを取得し、
 * 以降はリフレッシュトークンでトークンを更新する。
 */
export class FreeeAuthClient {
  private accessToken: string;
  private refreshToken: string;

  /**
   * トークン更新(ローテーション)時に呼ばれるコールバック。
   * freee はリフレッシュの度に refresh_token を再発行し旧トークンを無効化するため、
   * 新トークンを永続化しないと次回リフレッシュで失敗して連携が切れる。
   */
  private onTokenRefresh?: (t: { accessToken: string; refreshToken: string }) => void | Promise<void>;

  constructor(
    tokens?: { accessToken: string; refreshToken: string },
    onTokenRefresh?: (t: { accessToken: string; refreshToken: string }) => void | Promise<void>,
  ) {
    this.accessToken = tokens?.accessToken || config.freee.accessToken;
    this.refreshToken = tokens?.refreshToken || config.freee.refreshToken;
    this.onTokenRefresh = onTokenRefresh;
  }

  /** 認可URLを生成（初回認証用） */
  getAuthorizationUrl(): string {
    const params = new URLSearchParams({
      client_id: config.freee.clientId,
      redirect_uri: config.freee.redirectUri,
      response_type: 'code',
    });
    return `https://accounts.secure.freee.co.jp/public_api/authorize?${params.toString()}`;
  }

  /** 認可コードからトークンを取得 */
  async getTokenFromCode(code: string): Promise<TokenResponse> {
    try {
      const response = await axios.post<TokenResponse>(
        'https://accounts.secure.freee.co.jp/public_api/token',
        {
          grant_type: 'authorization_code',
          client_id: config.freee.clientId,
          client_secret: config.freee.clientSecret,
          code,
          redirect_uri: config.freee.redirectUri,
        }
      );
      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      logger.info('アクセストークンを取得しました');
      return response.data;
    } catch (error) {
      logger.error('トークン取得に失敗しました', error);
      throw new FreeeAuthError('トークンの取得に失敗しました。認可コードが正しいか確認してください。');
    }
  }

  /** リフレッシュトークンでアクセストークンを更新 */
  async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new FreeeAuthError('リフレッシュトークンが設定されていません。.envファイルを確認してください。');
    }
    try {
      const response = await axios.post<TokenResponse>(
        'https://accounts.secure.freee.co.jp/public_api/token',
        {
          grant_type: 'refresh_token',
          client_id: config.freee.clientId,
          client_secret: config.freee.clientSecret,
          refresh_token: this.refreshToken,
        }
      );
      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      logger.info('アクセストークンを更新しました');
      // ローテーションされた新トークンを永続化（保存失敗は連携継続を優先してログのみ）
      try {
        await this.onTokenRefresh?.({ accessToken: this.accessToken, refreshToken: this.refreshToken });
      } catch (e) {
        logger.error('freeeトークンの永続化に失敗しました', e);
      }
    } catch (error) {
      logger.error('トークン更新に失敗しました', error);
      throw new FreeeAuthError('トークンの更新に失敗しました。再認証が必要です。');
    }
  }

  getAccessToken(): string {
    return this.accessToken;
  }

  getRefreshToken(): string {
    return this.refreshToken;
  }

  hasValidToken(): boolean {
    return this.accessToken.length > 0;
  }
}

export class FreeeAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FreeeAuthError';
  }
}
