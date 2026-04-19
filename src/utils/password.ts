/**
 * パスワードユーティリティ
 * - bcrypt ハッシュ化
 * - パスワード強度バリデーション
 * - ランダム初期パスワード生成
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';

const SALT_ROUNDS = 10;

/** パスワードをbcryptでハッシュ化 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** パスワードとハッシュを照合 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** パスワード強度チェック結果 */
export interface PasswordValidation {
  valid: boolean;
  errors: string[];
}

/** パスワード強度をバリデーション（最低8文字、英数字必須） */
export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('8文字以上で入力してください');
  }
  if (!/[a-zA-Z]/.test(password)) {
    errors.push('英字を1文字以上含めてください');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('数字を1文字以上含めてください');
  }

  return { valid: errors.length === 0, errors };
}

/** 招待用のランダム初期パスワードを生成（12文字、英数字+記号） */
export function generateInitialPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(12);
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars[bytes[i] % chars.length];
  }
  // 英字・数字が必ず含まれるよう先頭に追加
  const letter = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz'[crypto.randomInt(48)];
  const digit = '23456789'[crypto.randomInt(8)];
  return letter + digit + password.slice(2);
}
