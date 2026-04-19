/**
 * 認証・権限チェックミドルウェア
 *
 * 使い方:
 *   app.get('/admin-only', requireRole('admin'), handler);
 *   app.post('/finance', requireRole('financial_admin'), handler);
 *   app.get('/data', requireTenant, handler);
 *   app.delete('/user/:id', requireSuperAdmin, handler);
 */

import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth-service.js';
import { asTenantId } from '../types/auth.js';
import type { TenantId, TenantRole } from '../types/auth.js';
import { renderErrorHTML } from './error-page.js';

const ROLE_LEVEL: Record<TenantRole, number> = {
  employee: 1,
  admin: 2,
  financial_admin: 3,
};

/** APIリクエストかどうか判定 */
function isApi(req: Request): boolean {
  return req.path.startsWith('/api/');
}

/** エラーレスポンスを返す（API→JSON、画面→HTMLエラーページ） */
function sendError(req: Request, res: Response, status: number, message: string): void {
  if (isApi(req)) {
    res.status(status).json({ error: message });
  } else if (status === 401) {
    res.redirect('/login');
  } else {
    res.status(status).send(renderErrorHTML(status, message));
  }
}

export function getActiveTenantId(req: Request): TenantId | null {
  const id = req.session?.activeTenantId;
  return id ? asTenantId(id) : null;
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.user) {
    sendError(req, res, 401, 'ログインが必要です');
    return;
  }
  if (!req.session.user.isSuperAdmin) {
    sendError(req, res, 403, 'この操作は超管理者のみ実行できます');
    return;
  }
  next();
}

export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.user) {
    sendError(req, res, 401, 'ログインが必要です');
    return;
  }
  if (req.session.user.isSuperAdmin) {
    next();
    return;
  }
  if (!req.session.activeTenantId) {
    sendError(req, res, 403, 'テナントが選択されていません');
    return;
  }
  next();
}

export function requireRole(minimumRole: TenantRole) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.session?.user) {
      sendError(req, res, 401, 'ログインが必要です');
      return;
    }

    if (req.session.user.isSuperAdmin) {
      next();
      return;
    }

    const tenantId = getActiveTenantId(req);
    if (!tenantId) {
      sendError(req, res, 403, 'テナントが選択されていません');
      return;
    }

    try {
      // セッションにロールが保存されていればDB問い合わせをスキップ（デモモード対応）
      const role = (req.session.activeTenantRole as TenantRole | undefined)
        || await authService.getUserRoleInTenant(req.session.user.id, tenantId);
      if (!role) {
        sendError(req, res, 403, 'このテナントへのアクセス権がありません');
        return;
      }

      const userLevel = ROLE_LEVEL[role];
      const requiredLevel = ROLE_LEVEL[minimumRole];
      if (userLevel < requiredLevel) {
        sendError(req, res, 403, 'この操作に必要な権限がありません');
        return;
      }

      next();
    } catch (error) {
      sendError(req, res, 500, '権限チェックに失敗しました');
    }
  };
}
