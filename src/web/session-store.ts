/**
 * express-session 用の永続セッションストア。
 * DATABASE_URL があれば connect-pg-simple で Postgres（Supabase）に保存し、
 * 無ければ undefined を返す（呼び出し側で MemoryStore にフォールバック）。
 *
 * テーブルは初回起動時に自動作成される（createTableIfMissing: true）。
 * Supabase は SSL 必須なので ssl: { rejectUnauthorized: false } を強制。
 */

import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { logger } from '../utils/logger.js';

export function createSessionStore(): session.Store | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;

  const PgStore = connectPgSimple(session);
  const store = new PgStore({
    conObject: {
      connectionString: url,
      ssl: { rejectUnauthorized: false },
    },
    createTableIfMissing: true,
    tableName: 'session',
    pruneSessionInterval: 60 * 60, // 1h
  });

  store.on('error', (err) => {
    logger.error('セッションストアエラー', err);
  });

  return store;
}
