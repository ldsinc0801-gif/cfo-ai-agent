import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

const TOKEN_PATH = path.resolve('data/google-token.json');

interface GmailAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

/**
 * Gmail API クライアント
 * 既存のGoogle OAuth トークンを共用して下書きを作成する
 */
export class GmailClient {

  private async getToken(): Promise<string | null> {
    try {
      if (!fs.existsSync(TOKEN_PATH)) return null;
      const data = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      if (!data.access_token) return null;

      // まずそのまま返す。401の場合はリフレッシュする
      return data.access_token;
    } catch {
      return null;
    }
  }

  private async refreshAndGetToken(): Promise<string | null> {
    try {
      if (!fs.existsSync(TOKEN_PATH)) return null;
      const data = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      if (!data.refresh_token) return null;

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return null;

      const res = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: data.refresh_token,
        grant_type: 'refresh_token',
      });

      data.access_token = res.data.access_token;
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(data, null, 2));
      logger.info('Googleアクセストークンをリフレッシュしました');
      return data.access_token;
    } catch (err) {
      logger.error('Googleトークンリフレッシュ失敗', err);
      return null;
    }
  }

  isAvailable(): boolean {
    return this.getToken() !== null;
  }

  /** Gmail下書きを作成 */
  async createDraft(to: string, subject: string, bodyText: string, attachments: GmailAttachment[] = []): Promise<{ id: string; message: { id: string } }> {
    let token = await this.getToken();
    if (!token) throw new Error('Google認証が未設定です。サイドバーからGoogle連携を設定してください。');

    const buildRaw = () => {
      const boundary = `boundary_${Date.now()}`;
      let mime = '';
      mime += `To: ${to}\r\n`;
      mime += `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\r\n`;
      mime += `MIME-Version: 1.0\r\n`;

      if (attachments.length > 0) {
        mime += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
        mime += `--${boundary}\r\n`;
        mime += `Content-Type: text/plain; charset=UTF-8\r\n\r\n`;
        mime += `${bodyText}\r\n\r\n`;
        for (const att of attachments) {
          mime += `--${boundary}\r\n`;
          mime += `Content-Type: ${att.mimeType}; name="${att.filename}"\r\n`;
          mime += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
          mime += `Content-Transfer-Encoding: base64\r\n\r\n`;
          mime += `${att.content.toString('base64')}\r\n`;
        }
        mime += `--${boundary}--`;
      } else {
        mime += `Content-Type: text/plain; charset=UTF-8\r\n\r\n`;
        mime += bodyText;
      }

      return Buffer.from(mime)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    };

    const send = async (t: string) => axios.post(
      'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
      { message: { raw: buildRaw() } },
      { headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } },
    );

    try {
      const response = await send(token);
      logger.info(`Gmail下書き作成: ${to} - ${subject}`);
      return response.data;
    } catch (err: any) {
      if (err?.response?.data) {
        logger.error('Gmail APIエラー詳細:', JSON.stringify(err.response.data));
      }
      if (err?.response?.status === 401) {
        // トークンリフレッシュしてリトライ
        const newToken = await this.refreshAndGetToken();
        if (!newToken) throw new Error('Googleトークンのリフレッシュに失敗しました。Google連携を再設定してください。');
        const response = await send(newToken);
        logger.info(`Gmail下書き作成（リフレッシュ後）: ${to} - ${subject}`);
        return response.data;
      }
      throw err;
    }
  }
}

export const gmailClient = new GmailClient();
