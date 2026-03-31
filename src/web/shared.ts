/**
 * 全ページ共通のサイドバーとCSS
 */
import fs from 'fs';
import path from 'path';

/** トークンファイルから選択中の事業所名を取得 */
function getCompanyNameFromToken(): string {
  try {
    const tokenPath = path.resolve('data/freee-token.json');
    if (fs.existsSync(tokenPath)) {
      const data = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      if (data.company_name) return data.company_name;
    }
  } catch { /* ignore */ }
  return '';
}

export function renderSidebar(active: string, companyName?: string): string {
  const displayName = companyName || getCompanyNameFromToken() || 'AI CFO';
  const menu = [
    { id: 'dashboard', href: '/', icon: ICONS.home, label: 'ダッシュボード' },
    { id: 'chat', href: '/chat', icon: ICONS.chat, label: 'AIチャット' },
    { id: 'tasks', href: '/tasks', icon: ICONS.tasks, label: 'タスクボード' },
    { id: 'history', href: '/agent/finance/history', icon: ICONS.clock, label: '分析履歴' },
  ];

  const agents = [
    { id: 'finance', href: '/agent/finance', icon: ICONS.barChart, label: '財務分析AI' },
    { id: 'plan', href: '/plan', icon: ICONS.star, label: '事業計画AI' },
    { id: 'accounting', href: '/agent/accounting', icon: ICONS.calculator, label: '会計AI' },
    { id: 'funding', href: '/agent/funding', icon: ICONS.bank, label: '資金調達AI' },
  ];

  const settings = [
    { id: 'company', href: '/settings/company', icon: ICONS.building, label: '事業所の選択' },
    { id: 'freee', href: '/auth/freee', icon: ICONS.settings, label: 'freee連携設定' },
  ];

  return `
<aside class="sidebar" id="sidebar">
  <div class="sidebar-brand">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    <span>AI CFO</span>
  </div>
  <nav class="sidebar-nav">
    <div class="nav-section">メニュー</div>
${menu.map(i => navItem(i, active)).join('\n')}
    <div class="nav-section">AIエージェント</div>
${agents.map(i => navItem(i, active)).join('\n')}
    <div class="nav-section">設定</div>
${settings.map(i => navItem(i, active)).join('\n')}
  </nav>
  <div class="sidebar-footer">
    <div class="sidebar-company">${esc(displayName)}</div>
    <div class="sidebar-version">v0.1.0</div>
  </div>
</aside>`;
}

function navItem(item: { id: string; href: string; icon: string; label: string; disabled?: boolean }, active: string): string {
  const cls = item.id === active ? 'nav-item active' : item.disabled ? 'nav-item nav-disabled' : 'nav-item';
  return `    <a href="${item.href}" class="${cls}">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${item.icon}</svg>
      ${item.label}
    </a>`;
}

const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  file: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  barChart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  calculator: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="14" y1="18" x2="16" y2="18"/>',
  bank: '<path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><line x1="7" y1="10" x2="7" y2="21"/><line x1="12" y1="10" x2="12" y2="21"/><line x1="17" y1="10" x2="17" y2="21"/>',
  chat: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
  tasks: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  building: '<path d="M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18"/><path d="M6 12H4a2 2 0 00-2 2v6a2 2 0 002 2h2"/><path d="M18 9h2a2 2 0 012 2v9a2 2 0 01-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
};

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 各AIエージェントページの共通レイアウト */
export function agentPageShell(opts: {
  active: string;
  title: string;
  companyName?: string;
  bodyHTML: string;
}): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(opts.title)} | AI CFO</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>${SHARED_CSS}</style>
</head>
<body>
${renderSidebar(opts.active, opts.companyName)}
<div class="main">
  <header class="header">
    <button class="menu-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <div class="header-left">
      <h1 class="header-title">${esc(opts.title)}</h1>
    </div>
    <div class="header-right">
      <div class="usage-wrap">
        <div class="usage-badge" id="usageBadge" title="クリックで詳細表示" onclick="toggleUsagePanel()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          <span id="usageText">--</span>
        </div>
        <div class="usage-panel" id="usagePanel" style="display:none">
          <div class="usage-panel-header">
            <strong>API使用量ログ</strong>
            <button class="usage-panel-close" onclick="toggleUsagePanel()">&times;</button>
          </div>
          <div class="usage-panel-summary" id="usagePanelSummary"></div>
          <div class="usage-panel-list" id="usagePanelList"><p style="color:var(--text2);font-size:12px">読み込み中...</p></div>
        </div>
      </div>
      <a href="/" class="btn-secondary">ダッシュボードへ戻る</a>
    </div>
  </header>
  <div class="content">
${opts.bodyHTML}
  </div>
</div>
${USAGE_SCRIPT}
</body>
</html>`;
}

const USAGE_SCRIPT = `
<script>
(function(){
  var lastData = null;

  function updateUsage(){
    fetch('/api/usage').then(function(r){return r.json()}).then(function(d){
      lastData = d;
      var txt = document.getElementById('usageText');
      if(txt){
        if(d.requestCount === 0){
          txt.textContent = 'API未使用';
        } else {
          txt.textContent = d.totalTokens.toLocaleString('ja-JP') + ' tok / $' + d.totalCost.toFixed(4) + ' (約' + Math.ceil(d.totalCostYen) + '円)';
        }
      }
      renderPanel(d);
    }).catch(function(){});
  }

  function renderPanel(d){
    var summary = document.getElementById('usagePanelSummary');
    var list = document.getElementById('usagePanelList');
    if(!summary || !list) return;

    summary.innerHTML =
      '<div class="up-stat"><span class="up-label">入力</span><span class="up-val">' + d.totalInputTokens.toLocaleString('ja-JP') + ' tok</span></div>' +
      '<div class="up-stat"><span class="up-label">出力</span><span class="up-val">' + d.totalOutputTokens.toLocaleString('ja-JP') + ' tok</span></div>' +
      '<div class="up-stat"><span class="up-label">合計コスト</span><span class="up-val">$' + d.totalCost.toFixed(4) + ' (約' + Math.ceil(d.totalCostYen) + '円)</span></div>' +
      '<div class="up-stat"><span class="up-label">リクエスト数</span><span class="up-val">' + d.requestCount + '回</span></div>';

    if(!d.records || d.records.length === 0){
      list.innerHTML = '<p style="color:var(--text2);font-size:12px;padding:8px 0">まだAPIリクエストがありません</p>';
      return;
    }
    var html = '<table class="up-table"><thead><tr><th>時刻</th><th>用途</th><th>モデル</th><th>トークン</th><th>コスト</th></tr></thead><tbody>';
    var records = d.records.slice().reverse();
    for(var i=0;i<records.length;i++){
      var r = records[i];
      var t = new Date(r.timestamp);
      var time = t.getHours()+':'+('0'+t.getMinutes()).slice(-2)+':'+('0'+t.getSeconds()).slice(-2);
      var model = r.model.replace('models/','').replace(/-\\d{8}$/,'');
      html += '<tr><td>' + time + '</td><td>' + r.purpose + '</td><td class="up-model">' + model + '</td><td class="num">' + (r.inputTokens+r.outputTokens).toLocaleString('ja-JP') + '</td><td class="num">$' + r.cost.toFixed(4) + '</td></tr>';
    }
    html += '</tbody></table>';
    list.innerHTML = html;
  }

  window.toggleUsagePanel = function(){
    var panel = document.getElementById('usagePanel');
    if(panel.style.display === 'none'){
      panel.style.display = 'block';
      if(lastData) renderPanel(lastData);
    } else {
      panel.style.display = 'none';
    }
  };

  document.addEventListener('click', function(e){
    var wrap = document.querySelector('.usage-wrap');
    var panel = document.getElementById('usagePanel');
    if(wrap && panel && !wrap.contains(e.target)){
      panel.style.display = 'none';
    }
  });

  updateUsage();
  setInterval(updateUsage, 10000);
})();
</script>`;

export const SHARED_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--sidebar-w:240px;--header-h:60px;--bg:#ffffff;--card:#fff;--text:#1f2937;--text2:#6b7280;--border:#e5e7eb;--primary:#2298ae;--primary-light:rgba(34,152,174,0.08);--green:#2298ae;--orange:#5ab4c4;--red:#ef4444;--radius:12px}
html{-webkit-font-smoothing:antialiased}
body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Hiragino Sans",Meiryo,sans-serif;background:var(--bg);color:var(--text);font-size:14px;line-height:1.55}

.sidebar{position:fixed;top:0;left:0;bottom:0;width:var(--sidebar-w);background:#1b7f8e;color:#c4e4ea;display:flex;flex-direction:column;z-index:100;transition:transform .25s ease}
.sidebar-brand{display:flex;align-items:center;gap:10px;padding:20px 20px 16px;color:#fff;font-size:18px;font-weight:700}
.sidebar-nav{flex:1;overflow-y:auto;padding:0 12px}
.nav-section{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#68b3be;padding:20px 12px 8px}
.nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;color:#c4e4ea;text-decoration:none;font-size:14px;font-weight:500;transition:all .15s;margin-bottom:2px}
.nav-item:hover{background:rgba(255,255,255,0.06);color:#fff}
.nav-item.active{background:var(--primary);color:#fff}
.nav-item.nav-disabled{opacity:0.4;pointer-events:none}
.sidebar-footer{padding:16px 20px;border-top:1px solid rgba(255,255,255,0.15)}
.sidebar-company{font-size:13px;color:#d1d5db;font-weight:600}
.sidebar-version{font-size:11px;color:#68b3be;margin-top:2px}

.main{margin-left:var(--sidebar-w)}
.header{height:var(--header-h);background:var(--card);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 28px;position:sticky;top:0;z-index:50}
.header-left{display:flex;align-items:center;gap:12px}
.header-title{font-size:18px;font-weight:700;letter-spacing:-0.02em}
.header-right{display:flex;align-items:center;gap:12px}
.menu-toggle{display:none;background:none;border:none;cursor:pointer;color:var(--text);padding:4px}
.content{padding:24px 28px;max-width:1400px}

.btn-primary{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;background:var(--primary);color:#fff;border:none;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s;text-decoration:none}
.btn-primary:hover{opacity:0.85}
.btn-secondary{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;background:var(--bg);color:var(--text);border:1px solid var(--border);font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;transition:all .15s}
.btn-secondary:hover{border-color:#999}
.btn-sm{padding:5px 12px;font-size:12px}

.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:24px}

.card{background:var(--card);border-radius:var(--radius);border:1px solid var(--border);overflow:hidden;margin-bottom:24px}
.card-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)}
.card-header h3{font-size:15px;font-weight:700}
.card-sub{font-size:12px;color:var(--text2)}
.card-badge{font-size:12px;font-weight:700;background:var(--primary-light);color:var(--primary);padding:2px 10px;border-radius:12px}
.card-chart{padding:16px;height:280px}
.card-chart--tall{height:340px}
.card-body{padding:20px}

.pill{display:inline-block;padding:4px 14px;border-radius:980px;font-size:12px;font-weight:600}
.pill--sm{padding:3px 10px;font-size:11px}
.pill--coming{background:#e5e7eb;color:#6b7280}

.welcome-banner{background:linear-gradient(135deg,var(--primary) 0%,#818cf8 100%);border-radius:var(--radius);padding:28px 32px;margin-bottom:24px;color:#fff}
.welcome-banner h2{font-size:20px;font-weight:700;margin-bottom:8px}
.welcome-banner p{font-size:14px;opacity:0.9;line-height:1.65;max-width:700px}

.feature-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:24px}
.feature-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:24px;display:flex;gap:16px}
.feature-icon{font-size:32px;flex-shrink:0;width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:var(--primary-light);border-radius:10px}
.feature-text h4{font-size:14px;font-weight:700;margin-bottom:4px}
.feature-text p{font-size:13px;color:var(--text2);line-height:1.5}
.feature-text .pill{margin-top:6px}

.status-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:32px;text-align:center;margin-bottom:24px}
.status-icon{font-size:48px;margin-bottom:12px}
.status-title{font-size:18px;font-weight:700;margin-bottom:8px}
.status-desc{font-size:14px;color:var(--text2);line-height:1.65;max-width:500px;margin:0 auto}

.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:10px 12px;border-bottom:1px solid var(--border)}
th{font-weight:600;color:var(--text2);font-size:12px;text-align:left}
td.num{text-align:right;font-variant-numeric:tabular-nums}

.muted{color:var(--text2)}
.usage-wrap{position:relative}
.usage-badge{display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:8px;background:#ecf6f8;border:1px solid #a8d8e0;font-size:11px;font-weight:600;color:#1b7f8e;cursor:pointer;white-space:nowrap;transition:all .2s}
.usage-badge:hover{background:#d5eef3}
.usage-panel{position:absolute;top:calc(100% + 8px);right:0;width:520px;background:var(--card);border:1px solid var(--border);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,0.12);z-index:200;overflow:hidden}
.usage-panel-header{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--border);font-size:14px}
.usage-panel-close{background:none;border:none;font-size:20px;color:var(--text2);cursor:pointer;line-height:1;padding:0 4px}
.usage-panel-close:hover{color:var(--text)}
.usage-panel-summary{display:grid;grid-template-columns:1fr 1fr;gap:0;padding:12px 18px;border-bottom:1px solid var(--border);background:#fafafa}
.up-stat{display:flex;justify-content:space-between;padding:4px 8px;font-size:12px}
.up-label{color:var(--text2)}.up-val{font-weight:600}
.usage-panel-list{max-height:300px;overflow-y:auto;padding:8px 18px 14px}
.up-table{width:100%;border-collapse:collapse;font-size:11px}
.up-table th{text-align:left;color:var(--text2);font-weight:600;padding:6px 6px;border-bottom:1px solid var(--border);font-size:10px;text-transform:uppercase;letter-spacing:.03em}
.up-table td{padding:6px 6px;border-bottom:1px solid #f3f4f6;vertical-align:top}
.up-table td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.up-model{font-size:10px;color:var(--text2);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

@media(max-width:768px){
  .sidebar{transform:translateX(-100%)}
  .sidebar.open{transform:translateX(0);box-shadow:0 0 40px rgba(0,0,0,0.3)}
  .main{margin-left:0}
  .menu-toggle{display:block}
  .grid-2,.grid-3{grid-template-columns:1fr}
  .content{padding:16px}
  .feature-grid{grid-template-columns:1fr}
}
`;
