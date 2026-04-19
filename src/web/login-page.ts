/**
 * ログインページ（メール+パスワード認証）
 * パスワード変更ページ
 */

export function renderLoginHTML(error?: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
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
      padding: 16px;
    }
    .login-container {
      text-align: center;
      max-width: 400px;
      width: 100%;
    }
    .login-logo { margin-bottom: 12px; }
    .login-logo svg { width: 56px; height: 56px; color: #38bdf8; }
    .login-title {
      font-size: 32px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 6px;
      background: linear-gradient(135deg, #38bdf8, #818cf8);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .login-subtitle { font-size: 14px; color: #94a3b8; margin-bottom: 36px; }
    .login-card {
      background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(148, 163, 184, 0.1);
      border-radius: 16px; padding: 36px 28px; backdrop-filter: blur(12px);
    }
    .login-card h2 { font-size: 18px; font-weight: 700; margin-bottom: 24px; color: #f1f5f9; }
    .fg { margin-bottom: 20px; text-align: left; }
    .fg label {
      display: block; font-size: 13px; font-weight: 600; color: #94a3b8;
      margin-bottom: 8px; cursor: pointer;
    }
    .input-wrap {
      position: relative; display: flex; align-items: center;
      background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 10px; transition: border-color 0.2s, box-shadow 0.2s;
    }
    .input-wrap:focus-within {
      border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15);
    }
    .input-wrap input {
      flex: 1; padding: 14px 16px; background: transparent; border: none;
      color: #e2e8f0; font-size: 15px; font-family: inherit; outline: none;
      min-width: 0;
    }
    .input-wrap input::placeholder { color: #475569; }
    .pw-toggle {
      background: none; border: none; color: #64748b; cursor: pointer;
      padding: 0 14px; display: flex; align-items: center; transition: color 0.15s;
    }
    .pw-toggle:hover { color: #94a3b8; }
    .login-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 14px; background: linear-gradient(135deg, #38bdf8, #818cf8);
      color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 700;
      cursor: pointer; transition: all 0.2s; font-family: inherit; margin-top: 4px;
    }
    .login-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(56, 189, 248, 0.3); }
    .login-btn:active:not(:disabled) { transform: translateY(0); }
    .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-msg {
      background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5; padding: 12px 16px; border-radius: 8px; font-size: 13px;
      margin-bottom: 20px; text-align: left; line-height: 1.5;
    }
    .demo-section { margin-top: 24px; }
    .demo-divider {
      display: flex; align-items: center; gap: 16px; margin-bottom: 20px;
      color: #475569; font-size: 12px;
    }
    .demo-divider::before, .demo-divider::after { content: ''; flex: 1; height: 1px; background: rgba(148, 163, 184, 0.2); }
    .demo-btn {
      display: inline-flex; align-items: center; gap: 10px; padding: 14px 32px;
      background: transparent; color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4);
      border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer;
      text-decoration: none; transition: all 0.2s; font-family: inherit;
    }
    .demo-btn:hover { background: rgba(56, 189, 248, 0.1); border-color: #38bdf8; transform: translateY(-1px); }
    .demo-note { margin-top: 10px; font-size: 11px; color: #64748b; }
    .login-footer { margin-top: 32px; font-size: 12px; color: #475569; }
    @media(max-width:480px) {
      .login-card { padding: 28px 20px; }
      .login-title { font-size: 28px; }
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="login-logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    </div>
    <h1 class="login-title">AI CFO</h1>
    <p class="login-subtitle">経営管理AIエージェント</p>

    <div class="login-card">
      <h2>ログイン</h2>
      ${error ? `<div class="error-msg">${escHtml(error)}</div>` : ''}
      <form method="POST" action="/auth/login" id="loginForm" onsubmit="return onSubmit()">
        <div class="fg">
          <label for="email">メールアドレス</label>
          <div class="input-wrap">
            <input type="email" id="email" name="email" placeholder="you@example.com" required autocomplete="email" autofocus>
          </div>
        </div>
        <div class="fg">
          <label for="password">パスワード</label>
          <div class="input-wrap">
            <input type="password" id="password" name="password" placeholder="パスワードを入力" required autocomplete="current-password">
            <button type="button" class="pw-toggle" onclick="togglePw('password',this)" aria-label="パスワード表示切替">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>
        <button type="submit" class="login-btn" id="loginBtn">ログイン</button>
      </form>
    </div>

    <div class="demo-section">
      <div class="demo-divider"><span>または</span></div>
      <a href="/auth/demo" class="demo-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        デモ版を試す（ログイン不要）
      </a>
      <p class="demo-note">サンプルデータで全機能をお試しいただけます</p>
    </div>

    <div class="login-footer">&copy; 2026 AI CFO</div>
  </div>
<script>
function togglePw(id,btn){
  var inp=document.getElementById(id);
  var show=inp.type==='password';
  inp.type=show?'text':'password';
  btn.innerHTML=show
    ?'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
    :'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}
function onSubmit(){
  var btn=document.getElementById('loginBtn');
  btn.disabled=true;
  btn.innerHTML='<span class="spinner"></span>ログイン中...';
  return true;
}
</script>
</body>
</html>`;
}

export function renderChangePasswordHTML(error?: string, success?: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>パスワード変更 - AI CFO</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      color: #e2e8f0; padding: 16px;
    }
    .container { text-align: center; max-width: 440px; width: 100%; }
    .card {
      background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(148, 163, 184, 0.1);
      border-radius: 16px; padding: 36px 28px; backdrop-filter: blur(12px);
    }
    .card h2 { font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #f1f5f9; }
    .card > p { font-size: 13px; color: #94a3b8; margin-bottom: 28px; line-height: 1.6; }
    .fg { margin-bottom: 20px; text-align: left; }
    .fg label { display: block; font-size: 13px; font-weight: 600; color: #94a3b8; margin-bottom: 8px; }
    .input-wrap {
      position: relative; display: flex; align-items: center;
      background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 10px; transition: border-color 0.2s, box-shadow 0.2s;
    }
    .input-wrap:focus-within { border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15); }
    .input-wrap input {
      flex: 1; padding: 14px 16px; background: transparent; border: none;
      color: #e2e8f0; font-size: 15px; font-family: inherit; outline: none; min-width: 0;
    }
    .input-wrap input::placeholder { color: #475569; }
    .pw-toggle {
      background: none; border: none; color: #64748b; cursor: pointer;
      padding: 0 14px; display: flex; align-items: center; transition: color 0.15s;
    }
    .pw-toggle:hover { color: #94a3b8; }
    .submit-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 14px; background: linear-gradient(135deg, #38bdf8, #818cf8);
      color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 700;
      cursor: pointer; transition: all 0.2s; font-family: inherit; margin-top: 4px;
    }
    .submit-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(56, 189, 248, 0.3); }
    .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-msg {
      background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5; padding: 12px 16px; border-radius: 8px; font-size: 13px;
      margin-bottom: 20px; text-align: left;
    }
    .strength { margin-top: 8px; display: flex; gap: 4px; align-items: center; }
    .strength-bar { flex: 1; height: 4px; border-radius: 2px; background: rgba(148,163,184,0.2); transition: background 0.3s; }
    .strength-label { font-size: 11px; color: #64748b; min-width: 40px; text-align: right; transition: color 0.3s; }
    .match-msg { font-size: 12px; margin-top: 6px; min-height: 18px; transition: color 0.3s; }
    .requirements { text-align: left; font-size: 12px; color: #64748b; margin-top: 16px; line-height: 1.8; }
    .requirements li { margin-left: 16px; transition: color 0.3s; }
    .requirements li.met { color: #4ade80; }
    @media(max-width:480px) { .card { padding: 28px 20px; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h2>パスワード変更</h2>
      <p>セキュリティのため、初回ログイン時はパスワードの変更が必要です。</p>
      ${error ? `<div class="error-msg">${escHtml(error)}</div>` : ''}
      ${success ? `<div style="background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:#86efac;padding:12px 16px;border-radius:8px;font-size:13px;margin-bottom:20px">${escHtml(success)}</div>` : ''}
      <form method="POST" action="/auth/change-password" id="cpForm" onsubmit="return onCpSubmit()">
        <div class="fg">
          <label for="newPassword">新しいパスワード</label>
          <div class="input-wrap">
            <input type="password" id="newPassword" name="newPassword" placeholder="新しいパスワードを入力" required autocomplete="new-password" oninput="checkStrength()">
            <button type="button" class="pw-toggle" onclick="togglePw('newPassword',this)" aria-label="パスワード表示切替">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <div class="strength">
            <div class="strength-bar" id="sb1"></div>
            <div class="strength-bar" id="sb2"></div>
            <div class="strength-bar" id="sb3"></div>
            <span class="strength-label" id="sLabel"></span>
          </div>
        </div>
        <div class="fg">
          <label for="confirmPassword">パスワード確認</label>
          <div class="input-wrap">
            <input type="password" id="confirmPassword" name="confirmPassword" placeholder="もう一度入力" required autocomplete="new-password" oninput="checkMatch()">
            <button type="button" class="pw-toggle" onclick="togglePw('confirmPassword',this)" aria-label="パスワード表示切替">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <div class="match-msg" id="matchMsg"></div>
        </div>
        <button type="submit" class="submit-btn" id="cpBtn">パスワードを変更</button>
      </form>
      <ul class="requirements">
        <li id="req-len">8文字以上</li>
        <li id="req-alpha">英字を1文字以上含む</li>
        <li id="req-num">数字を1文字以上含む</li>
        <li>記号の使用を推奨</li>
      </ul>
    </div>
  </div>
<script>
function togglePw(id,btn){
  var inp=document.getElementById(id);
  var show=inp.type==='password';
  inp.type=show?'text':'password';
  btn.innerHTML=show
    ?'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
    :'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}
function checkStrength(){
  var pw=document.getElementById('newPassword').value;
  var score=0;
  var hasLen=pw.length>=8, hasAlpha=/[a-zA-Z]/.test(pw), hasNum=/[0-9]/.test(pw), hasSym=/[^a-zA-Z0-9]/.test(pw);
  if(hasLen)score++; if(hasAlpha)score++; if(hasNum)score++; if(hasSym)score++;
  if(pw.length>=12)score++;
  var colors=['#ef4444','#f59e0b','#4ade80'];
  var labels=['弱い','普通','強い'];
  var level=score<=2?0:score<=3?1:2;
  document.getElementById('sb1').style.background=score>=1?colors[level]:'';
  document.getElementById('sb2').style.background=score>=3?colors[level]:'';
  document.getElementById('sb3').style.background=score>=4?colors[level]:'';
  document.getElementById('sLabel').textContent=pw?labels[level]:'';
  document.getElementById('sLabel').style.color=colors[level];
  document.getElementById('req-len').className=hasLen?'met':'';
  document.getElementById('req-alpha').className=hasAlpha?'met':'';
  document.getElementById('req-num').className=hasNum?'met':'';
  checkMatch();
}
function checkMatch(){
  var pw=document.getElementById('newPassword').value;
  var cf=document.getElementById('confirmPassword').value;
  var el=document.getElementById('matchMsg');
  if(!cf){el.textContent='';return;}
  if(pw===cf){el.textContent='一致しています';el.style.color='#4ade80';}
  else{el.textContent='一致していません';el.style.color='#f87171';}
}
function onCpSubmit(){
  var btn=document.getElementById('cpBtn');
  btn.disabled=true;
  btn.innerHTML='<span class="spinner"></span>変更中...';
  return true;
}
</script>
</body>
</html>`;
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
