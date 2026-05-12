/**
 * CSRF 保護ミドルウェア（Synchronizer Token パターン）
 *
 * - GET 系: セッションに csrfToken が無ければ生成してセット
 * - POST/PUT/PATCH/DELETE: ヘッダ `X-CSRF-Token` または body `_csrf` をセッションのトークンと照合
 * - フォームは `csrfFormHidden()` で hidden input を埋め込み
 * - クライアントの fetch は `csrfBootstrapScript()` のラッパが自動でヘッダを付与
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HEADER_NAME = 'x-csrf-token';
const FIELD_NAME = '_csrf';

function generateToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/** 現リクエストのセッションから CSRF トークンを取得（無ければ生成してセット） */
export function ensureCsrfToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateToken();
  }
  return req.session.csrfToken;
}

/**
 * リクエストごとに現在の CSRF トークンを保持する。
 * shared.ts などのテンプレート関数からリクエストオブジェクトを直接受け取れない場合に参照する。
 * 既存の setCurrentUser と同じパターン（モジュール変数）。
 */
let _currentCsrfToken: string | undefined;
export function setCurrentCsrfToken(token: string | undefined): void {
  _currentCsrfToken = token;
}
export function getCurrentCsrfToken(): string | undefined {
  return _currentCsrfToken;
}

/**
 * CSRF ミドルウェア。
 * 全ルートに app.use で適用する想定。安全メソッドはトークン発行のみ、危険メソッドは検証。
 */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = ensureCsrfToken(req);
  setCurrentCsrfToken(token);

  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const submitted =
    (req.headers[HEADER_NAME] as string | undefined) ||
    (req.body && typeof req.body === 'object' ? (req.body as any)[FIELD_NAME] : undefined) ||
    (req.query && typeof req.query === 'object' ? (req.query as any)[FIELD_NAME] : undefined);

  const expected = req.session.csrfToken;
  if (!submitted || !expected || submitted.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(submitted), Buffer.from(expected))) {
    if (req.path.startsWith('/api/')) {
      res.status(403).json({ error: 'セッションが切れました。ページを再読み込みしてください' });
    } else {
      // Referer か Origin から元のページを推定して自動リダイレクト
      const referer = req.get('Referer') || '';
      let backUrl = '/';
      try {
        if (referer) {
          const refUrl = new URL(referer);
          if (refUrl.host === req.get('Host')) backUrl = refUrl.pathname + refUrl.search;
        }
      } catch { /* ignore */ }
      const backUrlSafe = backUrl.replace(/[<>"]/g, '');
      res.status(403).send(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>セッション切れ | AI CFO</title>
<style>
body{font-family:-apple-system,sans-serif;background:#f4f5f7;color:#1f2937;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}
.card{background:#fff;border-radius:14px;padding:32px 40px;max-width:480px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,0.06)}
h2{font-size:20px;font-weight:700;margin:0 0 8px}
.muted{color:#6b7280;font-size:14px;line-height:1.7;margin:12px 0}
.spin{width:24px;height:24px;border:3px solid #e5e7eb;border-top-color:#2298ae;border-radius:50%;animation:spin 0.6s linear infinite;margin:14px auto}
@keyframes spin{to{transform:rotate(360deg)}}
a{color:#2298ae;text-decoration:none;font-weight:600}
a:hover{text-decoration:underline}
</style></head>
<body>
<div class="card">
  <h2>セッションが切れました</h2>
  <div class="spin"></div>
  <p class="muted">セキュリティのため自動的にページを再読み込みします…</p>
  <p class="muted" style="font-size:12px">画面が変わらない場合は <a href="${backUrlSafe}">こちら</a> をクリック</p>
</div>
<script>setTimeout(function(){ window.location.href = ${JSON.stringify(backUrl)}; }, 1200);</script>
</body></html>`);
    }
    return;
  }

  next();
}

/** フォーム用 hidden input HTML */
export function csrfFormHidden(token: string): string {
  return `<input type="hidden" name="${FIELD_NAME}" value="${token}">`;
}

/**
 * クライアントJS。`window.fetch` をラップして同一オリジン宛の mutating リクエストに自動で
 * `X-CSRF-Token` ヘッダを付与する。renderSidebar から全ページに注入される想定。
 */
export function csrfBootstrapScript(token: string): string {
  return `<script>
(function(){
  var TOKEN=${JSON.stringify(token)};
  window.__CSRF_TOKEN=TOKEN;
  if(window.__csrfPatched)return;window.__csrfPatched=true;
  var origFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    init=init||{};
    var method=(init.method||(typeof input!=='string'&&input&&input.method)||'GET').toUpperCase();
    if(method==='GET'||method==='HEAD'||method==='OPTIONS')return origFetch(input,init);
    var url=typeof input==='string'?input:(input&&input.url)||'';
    var sameOrigin=true;
    try{var u=new URL(url,window.location.origin);sameOrigin=u.origin===window.location.origin;}catch(e){}
    if(!sameOrigin)return origFetch(input,init);
    var headers=new Headers(init.headers||(typeof input!=='string'&&input?input.headers:undefined)||{});
    if(!headers.has('X-CSRF-Token'))headers.set('X-CSRF-Token',TOKEN);
    init.headers=headers;
    return origFetch(input,init);
  };
})();
</script>`;
}
