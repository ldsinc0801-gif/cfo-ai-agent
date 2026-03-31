import type { FullReport, EvaluationLevel } from '../types/report.js';
import type { AnomalyDetection } from '../types/accounting.js';
import { formatCurrency, formatPercent, formatChangeRate, formatMonthJP, formatNumber } from '../utils/format.js';

/**
 * FullReportからダッシュボード風HTMLを生成する
 * Chart.js (CDN) でグラフを描画
 */
export function renderReportHTML(report: FullReport): string {
  const {
    meta,
    executiveSummary: es,
    monthlyPL: pl,
    comparison,
    financialMetrics: fm,
    cashFlowAnalysis: cf,
    bankingMetrics: bm,
    evaluations,
    anomalies,
    commentary,
  } = report;
  const monthLabel = formatMonthJP(pl.year, pl.month);
  const prev = comparison.previous;

  // チャート用データ
  const plLabels = ['売上高', '売上総利益', '販管費', '営業利益', '経常利益'];
  const plCurrent = [pl.revenue, pl.grossProfit, pl.sgaExpenses, pl.operatingIncome, pl.ordinaryIncome];
  const plPrevious = prev ? [prev.revenue, prev.grossProfit, prev.sgaExpenses, prev.operatingIncome, prev.ordinaryIncome] : [];

  const expTop = pl.expenseBreakdown.slice(0, 6);
  const expOther = pl.expenseBreakdown.slice(6).reduce((s, e) => s + e.amount, 0);
  const expLabels = [...expTop.map(e => e.accountName), ...(expOther > 0 ? ['その他'] : [])];
  const expValues = [...expTop.map(e => e.amount), ...(expOther > 0 ? [expOther] : [])];

  const evalLabels = evaluations.map(e => categoryJP(e.category));
  const evalScores = evaluations.map(e => e.score);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(meta.companyName)} ${monthLabel} 月次経営レポート</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
${CSS}
</style>
</head>
<body>

<!-- Hero -->
<header class="hero">
  <p class="hero-eyebrow">${esc(meta.companyName)}</p>
  <h1 class="hero-title">${monthLabel}の経営レポート</h1>
  <p class="hero-sub">${esc(commentary.executiveSummary)}</p>
  <div class="hero-badge">
    <span class="pill pill--${es.overallAssessment}">総合評価：${levelJP(es.overallAssessment)}</span>
  </div>
</header>

<!-- KPI -->
<section class="section">
  <div class="kpi-row">
    ${kpiCard('売上高', formatCurrency(es.monthlyRevenue), es.revenueChangeRate)}
    ${kpiCard('経常利益', formatCurrency(es.monthlyProfit), es.profitChangeRate)}
    ${kpiCard('現預金残高', formatCurrency(es.cashBalance), cf.cashChangeRate !== 0 ? cf.cashChangeRate : null)}
  </div>
</section>

<!-- PL Chart + Table -->
<section class="section">
  <h2 class="section-heading">損益計算書</h2>
  <p class="section-sub">前月との比較</p>

  <div class="chart-and-table">
    <div class="chart-container">
      <canvas id="plChart"></canvas>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>科目</th><th>当月</th><th>前月</th><th>増減</th></tr></thead>
        <tbody>
${plRows(pl, comparison)}
        </tbody>
      </table>
    </div>
  </div>
</section>

<!-- Expenses: Doughnut + Table -->
<section class="section section--tint">
  <h2 class="section-heading">費用の内訳</h2>
  <p class="section-sub">構成比率と主要科目</p>

  <div class="chart-and-table">
    <div class="chart-container chart-container--sm">
      <canvas id="expenseChart"></canvas>
    </div>
    <div>
      <h3 class="col-heading">主要費用科目</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th></th><th>科目</th><th>金額</th></tr></thead>
          <tbody>
${pl.expenseBreakdown.slice(0, 7).map((e, i) =>
  `            <tr><td class="rank">${i + 1}</td><td>${esc(e.accountName)}</td><td class="num">${formatCurrency(e.amount)}</td></tr>`
).join('\n')}
          </tbody>
        </table>
      </div>
${comparison.changes && comparison.changes.significantExpenseChanges.length > 0 ? `
      <h3 class="col-heading" style="margin-top:24px">大幅変動科目</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>科目</th><th>当月</th><th>変動率</th></tr></thead>
          <tbody>
${comparison.changes.significantExpenseChanges.slice(0, 5).map(c =>
  `            <tr><td>${esc(c.accountName)}</td><td class="num">${formatCurrency(c.currentAmount)}</td><td class="num ${c.changeRate > 0 ? 'txt-warn' : 'txt-good'}">${formatChangeRate(c.changeRate)}</td></tr>`
).join('\n')}
          </tbody>
        </table>
      </div>` : ''}
    </div>
  </div>
</section>

<!-- Cash Flow -->
<section class="section">
  <h2 class="section-heading">資金繰り</h2>
  <p class="section-desc">${esc(commentary.cashFlowComment)}</p>

  <div class="metric-row">
    ${metricTile('現預金残高', formatCurrency(cf.currentCash))}
    ${metricTile('月次固定費', formatCurrency(cf.monthlyBurnRate))}
    ${metricTile('余力', cf.cashRunwayMonths >= 999 ? '十分' : cf.cashRunwayMonths.toFixed(1) + 'か月')}
    ${metricTile('リスク', riskJP(cf.shortageRisk), `risk-${cf.shortageRisk}`)}
  </div>
</section>

<!-- Evaluation Radar + Banking -->
<section class="section section--tint">
  <h2 class="section-heading">総合評価</h2>
  <p class="section-sub">5つの観点からのスコアリング</p>

  <div class="chart-and-table">
    <div class="chart-container chart-container--sm">
      <canvas id="radarChart"></canvas>
    </div>
    <div>
      <div class="eval-row" style="margin-bottom:28px">
${evaluations.map(ev => `
        <div class="eval-card">
          <div class="eval-category">${categoryJP(ev.category)}</div>
          <div class="eval-score">${ev.score.toFixed(0)}</div>
          <div class="pill pill--${ev.level} pill--sm">${levelJP(ev.level)}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>
</section>

<!-- Financial Metrics with Gauge Bars -->
<section class="section">
  <h2 class="section-heading">財務指標</h2>
  <div class="two-col">
    <div>
      <h3 class="col-heading">収益性</h3>
      ${gaugeBar('売上総利益率', fm.profitability.grossProfitMargin * 100, 100)}
      ${gaugeBar('営業利益率', fm.profitability.operatingProfitMargin * 100, 30)}
      ${gaugeBar('経常利益率', fm.profitability.ordinaryProfitMargin * 100, 30)}
      ${gaugeBar('ROA', fm.profitability.roa !== null ? fm.profitability.roa * 100 : null, 30)}
    </div>
    <div>
      <h3 class="col-heading">安全性</h3>
      ${gaugeBar('流動比率', fm.safety.currentRatio, 300, '%')}
      ${gaugeBar('自己資本比率', fm.safety.equityRatio, 100, '%')}
      ${gaugeBar('現預金月商倍率', fm.safety.cashMonthsRatio, 6, '倍')}
    </div>
  </div>
</section>

<!-- Banking -->
<section class="section section--tint">
  <h2 class="section-heading">銀行評価</h2>
  <p class="section-desc">${esc(commentary.bankingComment)}</p>

  <div class="metric-row">
    ${metricTile('自己資本比率', bm.equityRatio.toFixed(1) + '%')}
    ${metricTile('債務償還年数', bm.debtRepaymentYears !== null ? bm.debtRepaymentYears.toFixed(1) + '年' : '—')}
    ${metricTile('月商倍率', bm.cashToMonthlyRevenue.toFixed(1) + '倍')}
    ${metricTile('営業利益率', formatPercent(bm.operatingProfitMargin))}
  </div>
</section>

<!-- Risk Alerts -->
<section class="section">
  <h2 class="section-heading">リスクアラート</h2>
${anomalies.length === 0
  ? '  <p class="muted" style="text-align:center">特筆すべき異常は検出されませんでした。</p>'
  : anomalies.map(a => alertCard(a)).join('\n')}
</section>

<!-- Insights -->
<section class="section section--tint">
  <h2 class="section-heading">経営者への示唆</h2>

  <div class="insights-grid">
${commentary.positivePoints.length > 0 ? `
    <div class="insight-card insight-card--good">
      <h3>良い点</h3>
      <ul>${commentary.positivePoints.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    </div>` : ''}
${commentary.negativePoints.length > 0 ? `
    <div class="insight-card insight-card--warn">
      <h3>注意すべき点</h3>
      <ul>${commentary.negativePoints.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    </div>` : ''}
    <div class="insight-card insight-card--action">
      <h3>次に取るべきアクション</h3>
      <ul>${commentary.actionItems.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    </div>
  </div>
</section>

<!-- Footer -->
<footer class="footer">
${commentary.dataLimitations.length > 0 ? `
  <div class="footer-limits">
    <p class="footer-heading">補足・データの制約</p>
    <ul>${commentary.dataLimitations.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
  </div>` : ''}
  <p class="footer-gen">accounting-ai-agent v${esc(meta.version)} ・ ${new Date(meta.generatedAt).toLocaleString('ja-JP')}</p>
</footer>

<script>
// ===== Chart.js Defaults =====
Chart.defaults.font.family = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Hiragino Kaku Gothic ProN',sans-serif";
Chart.defaults.font.size = 13;
Chart.defaults.color = '#86868b';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
Chart.defaults.plugins.legend.labels.padding = 16;

// ===== PL Comparison Bar Chart =====
new Chart(document.getElementById('plChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(plLabels)},
    datasets: [
      {
        label: '当月',
        data: ${JSON.stringify(plCurrent)},
        backgroundColor: 'rgba(0,113,227,0.8)',
        borderRadius: 6,
        borderSkipped: false,
      },
${prev ? `      {
        label: '前月',
        data: ${JSON.stringify(plPrevious)},
        backgroundColor: 'rgba(0,113,227,0.2)',
        borderRadius: 6,
        borderSkipped: false,
      },` : ''}
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        callbacks: {
          label: function(ctx) {
            return ctx.dataset.label + ': ' + new Intl.NumberFormat('ja-JP').format(ctx.raw) + '円';
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: '#f0f0f0' },
        ticks: {
          callback: function(v) { return (v / 10000).toFixed(0) + '万'; }
        }
      },
      x: { grid: { display: false } }
    }
  }
});

// ===== Expense Doughnut =====
new Chart(document.getElementById('expenseChart'), {
  type: 'doughnut',
  data: {
    labels: ${JSON.stringify(expLabels)},
    datasets: [{
      data: ${JSON.stringify(expValues)},
      backgroundColor: [
        '#0071e3','#2298ae','#ff9f0a','#ff3b30','#af52de','#5ac8fa','#d2d2d7'
      ],
      borderWidth: 0,
      hoverOffset: 8,
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: { position: 'bottom', labels: { padding: 12, font: { size: 12 } } },
      tooltip: {
        callbacks: {
          label: function(ctx) {
            var total = ctx.dataset.data.reduce(function(a,b){return a+b},0);
            var pct = (ctx.raw / total * 100).toFixed(1);
            return ctx.label + ': ' + new Intl.NumberFormat('ja-JP').format(ctx.raw) + '円 (' + pct + '%)';
          }
        }
      }
    }
  }
});

// ===== Evaluation Radar =====
new Chart(document.getElementById('radarChart'), {
  type: 'radar',
  data: {
    labels: ${JSON.stringify(evalLabels)},
    datasets: [{
      label: 'スコア',
      data: ${JSON.stringify(evalScores)},
      fill: true,
      backgroundColor: 'rgba(0,113,227,0.12)',
      borderColor: '#0071e3',
      borderWidth: 2,
      pointBackgroundColor: '#0071e3',
      pointRadius: 5,
      pointHoverRadius: 7,
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        beginAtZero: true,
        max: 100,
        ticks: { stepSize: 20, font: { size: 11 }, backdropColor: 'transparent' },
        grid: { color: '#e8e8ed' },
        angleLines: { color: '#e8e8ed' },
        pointLabels: { font: { size: 14, weight: '600' }, color: '#1d1d1f' },
      }
    },
    plugins: { legend: { display: false } }
  }
});
</script>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function kpiCard(label: string, value: string, changeRate: number | null): string {
  let changeHTML = '<span class="kpi-change muted">—</span>';
  if (changeRate !== null) {
    const cls = changeRate > 0 ? 'txt-good' : changeRate < 0 ? 'txt-bad' : 'muted';
    changeHTML = `<span class="kpi-change ${cls}">前月比 ${formatChangeRate(changeRate)}</span>`;
  }
  return `
    <div class="kpi-card">
      <span class="kpi-label">${label}</span>
      <span class="kpi-value">${value}</span>
      ${changeHTML}
    </div>`;
}

function metricTile(label: string, value: string, extraClass: string = ''): string {
  return `
    <div class="metric-tile">
      <div class="metric-tile-label">${label}</div>
      <div class="metric-tile-value ${extraClass}">${value}</div>
    </div>`;
}

function gaugeBar(label: string, value: number | null, max: number, suffix: string = '%'): string {
  if (value === null) {
    return `
    <div class="gauge">
      <div class="gauge-header"><span>${label}</span><strong>—</strong></div>
      <div class="gauge-track"><div class="gauge-fill" style="width:0"></div></div>
    </div>`;
  }
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pct >= 60 ? '#2298ae' : pct >= 35 ? '#ff9f0a' : '#ff3b30';
  return `
    <div class="gauge">
      <div class="gauge-header"><span>${label}</span><strong>${value.toFixed(1)}${suffix}</strong></div>
      <div class="gauge-track"><div class="gauge-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;
}

function alertCard(a: AnomalyDetection): string {
  const cls = a.severity === 'critical' ? 'alert--critical' : a.severity === 'warning' ? 'alert--warn' : 'alert--info';
  return `  <div class="alert ${cls}"><span class="alert-indicator"></span><span>${esc(a.message)}</span></div>`;
}

function plRows(pl: FullReport['monthlyPL'], comparison: FullReport['comparison']): string {
  const prev = comparison.previous;
  const items = [
    { label: '売上高', cur: pl.revenue, prev: prev?.revenue },
    { label: '売上総利益', cur: pl.grossProfit, prev: prev?.grossProfit },
    { label: '販売管理費', cur: pl.sgaExpenses, prev: prev?.sgaExpenses },
    { label: '営業利益', cur: pl.operatingIncome, prev: prev?.operatingIncome },
    { label: '経常利益', cur: pl.ordinaryIncome, prev: prev?.ordinaryIncome },
  ];
  return items.map(r => {
    const diff = r.prev != null ? r.cur - r.prev : null;
    return `        <tr><td>${r.label}</td><td class="num">${formatCurrency(r.cur)}</td><td class="num">${r.prev != null ? formatCurrency(r.prev) : '—'}</td><td class="num">${diff != null ? formatCurrency(diff) : '—'}</td></tr>`;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function levelJP(l: string): string {
  return ({ excellent: '優良', good: '良好', fair: '普通', warning: '注意', critical: '危険' })[l] ?? l;
}
function categoryJP(c: string): string {
  return ({ profit: '利益', cash_flow: '資金繰り', fixed_cost: '固定費', revenue_dependency: '売上', banking: '銀行評価' })[c] ?? c;
}
function riskJP(r: string): string {
  return ({ safe: '安全', caution: '注意', warning: '警戒', danger: '危険' })[r] ?? r;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --black:#1d1d1f;
  --gray1:#86868b;
  --gray2:#d2d2d7;
  --gray3:#f5f5f7;
  --white:#fff;
  --blue:#0071e3;
  --green:#2298ae;
  --orange:#ff9f0a;
  --red:#ff3b30;
  --radius:16px;
  --max-w:1080px;
}

html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}

body{
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Hiragino Kaku Gothic ProN","Hiragino Sans",Meiryo,sans-serif;
  background:var(--white);
  color:var(--black);
  line-height:1.58;
  font-size:17px;
  letter-spacing:-0.022em;
}

/* Hero */
.hero{text-align:center;padding:80px 24px 56px;max-width:720px;margin:0 auto}
.hero-eyebrow{font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--gray1);margin-bottom:8px}
.hero-title{font-size:clamp(36px,5vw,56px);font-weight:700;letter-spacing:-0.04em;line-height:1.08;margin-bottom:20px;color:var(--black)}
.hero-sub{font-size:17px;color:var(--gray1);line-height:1.65;max-width:600px;margin:0 auto 24px}
.hero-badge{margin-top:8px}

/* Pill */
.pill{display:inline-block;padding:6px 18px;border-radius:980px;font-size:13px;font-weight:600;letter-spacing:0.01em}
.pill--sm{padding:3px 12px;font-size:12px}
.pill--excellent{background:#e0f0ff;color:#0055b3}
.pill--good{background:#e5f8ec;color:#1a7a36}
.pill--fair{background:#fef6e0;color:#8a6d00}
.pill--warning{background:#fff0e0;color:#b35c00}
.pill--critical{background:#ffe5e5;color:#b30000}

/* Section */
.section{max-width:var(--max-w);margin:0 auto;padding:56px 24px}
.section--tint{background:var(--gray3);max-width:100%;padding-left:24px;padding-right:24px}
.section--tint > *{max-width:var(--max-w);margin-left:auto;margin-right:auto}
.section + .section{border-top:1px solid var(--gray2)}
.section--tint + .section,.section + .section--tint{border-top:none}

.section-heading{font-size:32px;font-weight:700;letter-spacing:-0.03em;line-height:1.12;text-align:center;margin-bottom:6px}
.section-sub{text-align:center;color:var(--gray1);font-size:15px;margin-bottom:36px}
.section-desc{color:var(--gray1);font-size:15px;text-align:center;max-width:640px;margin:0 auto 36px;line-height:1.7}

/* KPI */
.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}
.kpi-card{text-align:center;padding:32px 16px;border-radius:var(--radius);background:var(--gray3)}
.kpi-label{display:block;font-size:13px;font-weight:600;color:var(--gray1);letter-spacing:0.04em;text-transform:uppercase;margin-bottom:8px}
.kpi-value{display:block;font-size:36px;font-weight:700;letter-spacing:-0.03em;line-height:1.15;margin-bottom:8px}
.kpi-change{font-size:14px;font-weight:500}

/* Chart + Table layout */
.chart-and-table{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start}
.chart-container{position:relative;height:340px}
.chart-container--sm{position:relative;height:320px}

/* Tables */
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th,td{padding:14px 16px;text-align:left;font-size:15px;border-bottom:1px solid var(--gray2)}
th{font-weight:600;color:var(--gray1);font-size:13px;letter-spacing:0.02em}
td.num,th.num,.num{text-align:right;font-variant-numeric:tabular-nums}
td.rank{color:var(--gray1);font-weight:600;width:32px}
tbody tr:last-child td{border-bottom:none}

/* Two col */
.two-col{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:40px}
.col-heading{font-size:20px;font-weight:700;letter-spacing:-0.02em;margin-bottom:16px}

/* Metric tiles */
.metric-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}
.metric-tile{text-align:center;padding:28px 16px;border-radius:var(--radius);background:var(--white);border:1px solid var(--gray2)}
.section--tint .metric-tile{background:var(--white);border-color:var(--gray2)}
.metric-tile-label{font-size:12px;font-weight:600;color:var(--gray1);letter-spacing:0.04em;text-transform:uppercase;margin-bottom:6px}
.metric-tile-value{font-size:28px;font-weight:700;letter-spacing:-0.02em}

/* Metric list */
.metric-list{list-style:none}
.metric-list li{display:flex;justify-content:space-between;align-items:baseline;padding:12px 0;border-bottom:1px solid var(--gray2);font-size:15px}
.metric-list li:last-child{border-bottom:none}
.metric-list strong{font-weight:600;font-variant-numeric:tabular-nums}

/* Gauge bars */
.gauge{margin-bottom:18px}
.gauge-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;font-size:14px}
.gauge-header span{color:var(--gray1)}
.gauge-header strong{font-size:16px;font-weight:700;color:var(--black)}
.gauge-track{height:8px;background:#e8e8ed;border-radius:4px;overflow:hidden}
.gauge-fill{height:100%;border-radius:4px;transition:width 0.6s ease}

/* Alerts */
.alert{display:flex;align-items:flex-start;gap:12px;padding:16px 20px;border-radius:12px;margin-bottom:10px;font-size:15px;line-height:1.55;max-width:var(--max-w);margin-left:auto;margin-right:auto}
.alert-indicator{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:7px}
.alert--critical{background:#fff5f5}.alert--critical .alert-indicator{background:var(--red)}
.alert--warn{background:#fffaf0}.alert--warn .alert-indicator{background:var(--orange)}
.alert--info{background:#f0f7ff}.alert--info .alert-indicator{background:var(--blue)}

/* Insights */
.insights-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}
.insight-card{padding:28px;border-radius:var(--radius);background:var(--white)}
.insight-card h3{font-size:17px;font-weight:700;margin-bottom:14px;letter-spacing:-0.01em}
.insight-card ul{list-style:none}
.insight-card li{position:relative;padding:6px 0 6px 18px;font-size:15px;line-height:1.55}
.insight-card li::before{content:'';position:absolute;left:0;top:14px;width:7px;height:7px;border-radius:50%}
.insight-card--good h3{color:#1a7a36}.insight-card--good li::before{background:var(--green)}
.insight-card--warn h3{color:#b35c00}.insight-card--warn li::before{background:var(--orange)}
.insight-card--action h3{color:#0055b3}.insight-card--action li::before{background:var(--blue)}

/* Eval cards */
.eval-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px}
.eval-card{text-align:center;padding:24px 12px;border-radius:var(--radius);background:var(--gray3)}
.section--tint .eval-card{background:var(--white)}
.eval-category{font-size:12px;font-weight:600;color:var(--gray1);letter-spacing:0.04em;text-transform:uppercase;margin-bottom:8px}
.eval-score{font-size:40px;font-weight:700;letter-spacing:-0.03em;line-height:1;margin-bottom:10px}

/* Footer */
.footer{max-width:var(--max-w);margin:0 auto;padding:40px 24px 64px;border-top:1px solid var(--gray2)}
.footer-limits{margin-bottom:24px}
.footer-heading{font-size:13px;font-weight:600;color:var(--gray1);margin-bottom:8px}
.footer-limits ul{list-style:none;padding:0}
.footer-limits li{font-size:13px;color:var(--gray1);padding:3px 0;padding-left:16px;position:relative}
.footer-limits li::before{content:'·';position:absolute;left:4px;font-weight:700}
.footer-gen{font-size:12px;color:var(--gray2);text-align:center}

/* Utility */
.muted{color:var(--gray1)}
.txt-good{color:#1a7a36}
.txt-bad{color:var(--red)}
.txt-warn{color:#b35c00}
.risk-safe{color:#1a7a36}
.risk-caution{color:#8a6d00}
.risk-warning{color:#b35c00}
.risk-danger{color:var(--red)}

/* Responsive */
@media(max-width:734px){
  .hero{padding:56px 20px 40px}
  .hero-title{font-size:32px}
  .section{padding:40px 20px}
  .kpi-value{font-size:28px}
  .section-heading{font-size:26px}
  .chart-and-table{grid-template-columns:1fr}
  .chart-container,.chart-container--sm{height:260px;margin-bottom:24px}
  .two-col{grid-template-columns:1fr}
  .eval-row{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}
  .metric-tile-value{font-size:22px}
  th,td{padding:10px 12px;font-size:14px}
}

/* === PDF印刷用スタイル === */
@media print{
  body{font-size:11px;line-height:1.5;color:#000;background:#fff}
  .hero{padding:40px 0 24px;page-break-after:avoid}
  .hero-title{font-size:28px}
  .hero-sub{font-size:13px}

  .section{padding:24px 0;page-break-inside:avoid}
  .section--tint{background:#f8f8f8 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .section + .section{border-top:1px solid #ddd}

  /* テーブルが途中で切れないように */
  table{page-break-inside:avoid}
  thead{display:table-header-group}
  tr{page-break-inside:avoid}

  /* カード・タイルが途中で切れないように */
  .kpi-row{page-break-inside:avoid}
  .kpi-card{page-break-inside:avoid}
  .metric-tile{page-break-inside:avoid}
  .metric-row{page-break-inside:avoid}
  .two-col{page-break-inside:avoid}
  .eval-row{page-break-inside:avoid}
  .eval-card{page-break-inside:avoid}
  .alert{page-break-inside:avoid}
  .insight-card{page-break-inside:avoid}
  .insights-grid{page-break-inside:avoid}

  /* セクション見出しの直後で改ページしない */
  .section-heading{page-break-after:avoid}
  .section-sub{page-break-after:avoid}
  .col-heading{page-break-after:avoid}

  /* チャート：Canvas→画像変換後に表示される */
  .chart-container,.chart-container--sm{page-break-inside:avoid}
  .chart-and-table{page-break-inside:avoid}

  /* フッターは各ページ下部 */
  .footer{page-break-before:avoid}

  /* 背景色の印刷 */
  .pill,.kpi-card,.eval-card,.metric-tile,.alert{-webkit-print-color-adjust:exact;print-color-adjust:exact}

  /* 余白調整 */
  .kpi-value{font-size:24px}
  .eval-score{font-size:28px}
  .metric-tile-value{font-size:20px}
  th,td{padding:8px 10px;font-size:12px}
}
`;
