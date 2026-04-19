/**
 * Google連携設定ページ
 * Gmail / Google Tasks との連携管理（ログイン用途ではない）
 */
import { agentPageShell, esc } from './shared.js';
import type { SidebarUser } from './shared.js';

export function renderGoogleSettingsHTML(opts: {
  user?: SidebarUser;
  isConfigured: boolean;
  isAuthenticated: boolean;
}): string {
  const { isConfigured, isAuthenticated } = opts;

  const bodyHTML = `
<div class="card">
  <div class="card-header">
    <h3>Google連携</h3>
  </div>
  <div class="card-body">
    <p style="color:var(--text2);font-size:14px;line-height:1.7;margin-bottom:24px">
      GoogleアカウントとAI CFOを連携すると、以下の機能が利用できます。<br>
      この連携はログインには使用しません。Gmail・Google Tasksの操作にのみ使用します。
    </p>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:20px">
        <div style="font-size:24px;margin-bottom:8px">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        </div>
        <h4 style="font-size:14px;font-weight:700;margin-bottom:4px">Google Tasks</h4>
        <p style="font-size:12px;color:var(--text2);line-height:1.5">タスクボードのタスクをGoogle Tasksに同期します</p>
      </div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:20px">
        <div style="font-size:24px;margin-bottom:8px">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </div>
        <h4 style="font-size:14px;font-weight:700;margin-bottom:4px">Gmail</h4>
        <p style="font-size:12px;color:var(--text2);line-height:1.5">秘書AIで作成した書類をメール下書きとして保存します</p>
      </div>
    </div>

    <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <h4 style="font-size:14px;font-weight:700;margin-bottom:4px">連携ステータス</h4>
          ${!isConfigured
            ? '<p style="font-size:13px;color:var(--text2)">Google API認証情報が未設定です。<code>.env</code> に <code>GOOGLE_CLIENT_ID</code> と <code>GOOGLE_CLIENT_SECRET</code> を設定してください。</p>'
            : isAuthenticated
              ? '<p style="font-size:13px;color:#22c55e;font-weight:600">連携済み</p>'
              : '<p style="font-size:13px;color:var(--text2)">未連携（OAuth認証が必要です）</p>'
          }
        </div>
        <div>
          ${!isConfigured
            ? ''
            : isAuthenticated
              ? '<form method="POST" action="/settings/google/disconnect" style="margin:0"><button type="submit" class="btn-secondary btn-sm" style="color:#ef4444;border-color:#ef4444">連携解除</button></form>'
              : '<a href="/settings/google/auth" class="btn-primary btn-sm">Googleアカウントを連携</a>'
          }
        </div>
      </div>
    </div>
  </div>
</div>`;

  return agentPageShell({
    active: 'google',
    title: 'Google連携',
    user: opts.user,
    bodyHTML,
  });
}
