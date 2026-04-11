/**
 * ログインページ
 */

export function renderLoginHTML(error?: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ログイン - AI CFO</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #e2e8f0;
    }
    .login-container {
      text-align: center;
      max-width: 400px;
      width: 100%;
      padding: 0 24px;
    }
    .login-logo {
      margin-bottom: 12px;
    }
    .login-logo svg {
      width: 56px;
      height: 56px;
      color: #38bdf8;
    }
    .login-title {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin-bottom: 6px;
      background: linear-gradient(135deg, #38bdf8, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .login-subtitle {
      font-size: 14px;
      color: #94a3b8;
      margin-bottom: 40px;
    }
    .login-card {
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(148, 163, 184, 0.1);
      border-radius: 16px;
      padding: 40px 32px;
      backdrop-filter: blur(12px);
    }
    .login-card h2 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #f1f5f9;
    }
    .login-card p {
      font-size: 13px;
      color: #94a3b8;
      margin-bottom: 28px;
    }
    .google-btn {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 14px 32px;
      background: #fff;
      color: #1f2937;
      border: none;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;
      font-family: inherit;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .google-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    }
    .google-btn:active {
      transform: translateY(0);
    }
    .google-icon {
      width: 20px;
      height: 20px;
    }
    .error-msg {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 20px;
    }
    .demo-section {
      margin-top: 24px;
    }
    .demo-divider {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
      color: #475569;
      font-size: 12px;
    }
    .demo-divider::before, .demo-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: rgba(148, 163, 184, 0.2);
    }
    .demo-btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 14px 32px;
      background: transparent;
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.4);
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;
      font-family: inherit;
    }
    .demo-btn:hover {
      background: rgba(56, 189, 248, 0.1);
      border-color: #38bdf8;
      transform: translateY(-1px);
    }
    .demo-note {
      margin-top: 10px;
      font-size: 11px;
      color: #64748b;
    }
    .login-footer {
      margin-top: 32px;
      font-size: 12px;
      color: #475569;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="login-logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    </div>
    <h1 class="login-title">AI CFO</h1>
    <p class="login-subtitle">企業AI OS - 経営管理エージェント</p>

    <div class="login-card">
      <h2>ログイン</h2>
      <p>Googleアカウントでログインしてください</p>
      ${error ? `<div class="error-msg">${escHtml(error)}</div>` : ''}
      <a href="/auth/login/google" class="google-btn">
        <svg class="google-icon" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Googleでログイン
      </a>
    </div>

    <div class="demo-section">
      <div class="demo-divider"><span>または</span></div>
      <a href="/auth/demo" class="demo-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        デモ版を試す（ログイン不要）
      </a>
      <p class="demo-note">サンプルデータで全機能をお試しいただけます</p>
    </div>

    <div class="login-footer">
      &copy; 2026 AI CFO - 企業AI OS
    </div>
  </div>
</body>
</html>`;
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
