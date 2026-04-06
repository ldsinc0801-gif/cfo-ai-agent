import type { AnalysisSummary } from '../services/analysis-store.js';
import { agentPageShell, esc } from './shared.js';

export function renderHistoryHTML(analyses: AnalysisSummary[]): string {
  const fmtCurrency = (v: number) => new Intl.NumberFormat('ja-JP').format(v) + '円';
  const fmtDate = (iso: string) => new Date(iso).toLocaleString('ja-JP');

  const sourceLabel = (s: string) => {
    switch (s) { case 'upload': return 'アップロード'; case 'freee': return 'freee'; default: return 'デモ'; }
  };

  const rankColor = (r: string) => {
    switch (r) { case 'A': return '#2298ae'; case 'B': return '#2298ae'; case 'C': return '#3da8b8'; case 'D': return '#5ab4c4'; default: return '#ef4444'; }
  };

  const bodyHTML = `
<style>
.history-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
.history-header h2{font-size:20px;font-weight:700}
.history-count{font-size:13px;color:var(--text2)}
.history-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}
.history-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;transition:all .2s;text-decoration:none;color:var(--text);display:block}
.history-card:hover{border-color:var(--primary);box-shadow:0 4px 12px rgba(99,102,241,0.1);transform:translateY(-1px)}
.hc-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.hc-rank{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#fff}
.hc-score{text-align:right}
.hc-score-val{font-size:22px;font-weight:800;letter-spacing:-0.02em}
.hc-score-max{font-size:12px;color:var(--text2)}
.hc-meta{margin-bottom:10px}
.hc-filename{font-size:14px;font-weight:700;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hc-date{font-size:12px;color:var(--text2)}
.hc-source{font-size:11px;padding:2px 8px;border-radius:4px;background:var(--bg);display:inline-block;margin-top:4px}
.hc-metrics{display:flex;gap:16px;border-top:1px solid var(--border);padding-top:10px;margin-top:10px}
.hc-metric{flex:1}
.hc-metric-label{font-size:11px;color:var(--text2);font-weight:600}
.hc-metric-val{font-size:14px;font-weight:700;margin-top:2px}
.history-card-wrap{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);transition:all .2s;overflow:hidden}
.history-card-wrap:hover{border-color:var(--primary);box-shadow:0 4px 12px rgba(99,102,241,0.1);transform:translateY(-1px)}
.history-card-wrap .history-card{border:none;border-radius:0}
.history-card-wrap .history-card:hover{box-shadow:none;transform:none}
.hc-actions{display:flex;gap:6px;padding:0 20px 16px}
.hc-action{padding:4px 10px;border-radius:6px;border:1px solid var(--border);font-size:11px;font-weight:600;color:var(--text2);text-decoration:none;background:var(--card);transition:all .15s}
.hc-action:hover{border-color:var(--primary);color:var(--primary)}
.hc-action--del:hover{border-color:var(--red);color:var(--red)}
.empty-state{text-align:center;padding:60px 20px;color:var(--text2)}
.empty-state .empty-icon{font-size:48px;margin-bottom:12px}
.empty-state h3{font-size:18px;font-weight:700;color:var(--text);margin-bottom:8px}
.empty-state p{font-size:14px;line-height:1.6}
</style>

<div class="history-header">
  <div>
    <h2>分析履歴</h2>
    <span class="history-count">${analyses.length}件の分析結果</span>
  </div>
  <div style="display:flex;gap:8px;align-items:center">
    ${analyses.length > 0 ? `<form action="/agent/finance/history/delete-all" method="post" style="margin:0" onsubmit="return confirm('全ての分析履歴を削除しますか？')"><button type="submit" class="btn-secondary btn-sm" style="cursor:pointer;color:var(--red);border-color:var(--red)">全件削除</button></form>` : ''}
    <a href="/agent/finance" class="btn-primary">＋ 新規分析</a>
  </div>
</div>

${analyses.length === 0 ? `
<div class="empty-state">
  <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
  <h3>分析履歴がありません</h3>
  <p>決算書をアップロードするか、freeeから分析を実行すると<br>結果がここに保存されます。</p>
  <a href="/agent/finance" class="btn-primary" style="margin-top:16px">分析を開始</a>
</div>
` : `
<div class="history-grid">
${analyses.map(a => `
  <div class="history-card-wrap">
    <a href="/agent/finance/history/${esc(a.id)}" class="history-card">
      <div class="hc-top">
        <div class="hc-rank" style="background:${rankColor(a.rank)}">${esc(a.rank)}</div>
        <div class="hc-score">
          <div class="hc-score-val">${a.totalScore}<span style="font-size:14px;font-weight:500;color:var(--text2)"> / 129</span></div>
          <div class="hc-score-max">${esc(a.rankLabel)}</div>
        </div>
      </div>
      <div class="hc-meta">
        <div class="hc-filename">${a.fileName ? esc(a.fileName) : 'freeeデータ分析'}</div>
        <div class="hc-date">${fmtDate(a.createdAt)}</div>
        <span class="hc-source">${sourceLabel(a.source)}</span>
      </div>
      <div class="hc-metrics">
        <div class="hc-metric">
          <div class="hc-metric-label">売上高</div>
          <div class="hc-metric-val">${fmtCurrency(a.revenue)}</div>
        </div>
        <div class="hc-metric">
          <div class="hc-metric-label">経常利益</div>
          <div class="hc-metric-val">${fmtCurrency(a.ordinaryIncome)}</div>
        </div>
      </div>
    </a>
    <div class="hc-actions">
      <a href="/agent/finance/history/${esc(a.id)}" class="hc-action">詳細を見る</a>
      <form action="/agent/finance/history/${esc(a.id)}/delete" method="post" style="margin:0" onsubmit="return confirm('この分析結果を削除しますか？')">
        <button type="submit" class="hc-action hc-action--del" style="cursor:pointer">削除</button>
      </form>
    </div>
  </div>`).join('')}
</div>
`}`;

  return agentPageShell({
    active: 'finance',
    title: '分析履歴',
    bodyHTML,
  });
}
