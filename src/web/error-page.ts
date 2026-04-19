/**
 * 統一エラーページ
 */

export function renderErrorHTML(status: number, message?: string): string {
  const info: Record<number, { title: string; desc: string; icon: string }> = {
    400: { title: '不正なリクエスト', desc: 'リクエストの内容に問題があります。', icon: '⚠' },
    401: { title: 'ログインが必要です', desc: 'この操作にはログインが必要です。', icon: '🔒' },
    403: { title: 'アクセス権限がありません', desc: 'この操作を行う権限がありません。', icon: '🚫' },
    404: { title: 'ページが見つかりません', desc: 'お探しのページは存在しないか、移動した可能性があります。', icon: '🔍' },
    500: { title: 'サーバーエラー', desc: 'システム内部でエラーが発生しました。しばらくしてから再度お試しください。', icon: '⚡' },
  };
  const { title, desc, icon } = info[status] || info[500];

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${status} ${title} - AI CFO</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;background:#f8fafc;color:#1f2937;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .err{text-align:center;max-width:480px}
    .err-icon{font-size:64px;margin-bottom:16px}
    .err-code{font-size:72px;font-weight:800;color:#e2e8f0;line-height:1}
    .err-title{font-size:20px;font-weight:700;margin:12px 0 8px}
    .err-desc{font-size:14px;color:#6b7280;line-height:1.6;margin-bottom:8px}
    .err-detail{font-size:12px;color:#9ca3af;margin-bottom:24px}
    .err-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
    .err-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;transition:all .15s;font-family:inherit;cursor:pointer;border:none}
    .err-btn-primary{background:#2298ae;color:#fff}
    .err-btn-primary:hover{opacity:0.85}
    .err-btn-secondary{background:#fff;color:#1f2937;border:1px solid #e5e7eb}
    .err-btn-secondary:hover{border-color:#999}
  </style>
</head>
<body>
  <div class="err">
    <div class="err-icon">${icon}</div>
    <div class="err-code">${status}</div>
    <div class="err-title">${title}</div>
    <div class="err-desc">${desc}</div>
    ${message ? `<div class="err-detail">${escHtml(message)}</div>` : ''}
    <div class="err-actions">
      <a href="/" class="err-btn err-btn-primary">ダッシュボードへ</a>
      <button onclick="history.back()" class="err-btn err-btn-secondary">前のページに戻る</button>
      ${status === 401 ? '<a href="/login" class="err-btn err-btn-secondary">ログイン</a>' : ''}
    </div>
  </div>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
