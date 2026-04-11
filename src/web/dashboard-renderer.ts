import type { FullReport } from '../types/report.js';
import type { TrendData } from '../types/trend.js';
import { formatCurrency, formatPercent, formatChangeRate, formatMonthJP, formatNumber } from '../utils/format.js';
import { renderSidebar } from './shared.js';

/**
 * ダッシュボード画面のHTMLを生成する
 * サイドバー + ヘッダー + メインコンテンツのレイアウト
 */
export interface PeriodTotals {
  revenue: number;
  ordinaryIncome: number;
  operatingIncome: number;
  cashAndDeposits: number;
}

export interface DashboardOptions {
  selectedDate?: string | null;
  fromMonth?: string | null;
  toMonth?: string | null;
  periodLabel?: string | null;  // '1m' | '3m' | '6m' | '12m' | 'custom'
  periodTotals?: PeriodTotals | null;
}

export function renderDashboardHTML(report: FullReport, trend: TrendData, options: DashboardOptions = {}): string {
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

  const plLabels = JSON.stringify(['売上高', '売上総利益', '販管費', '営業利益', '経常利益']);
  const plCurrent = JSON.stringify([pl.revenue, pl.grossProfit, pl.sgaExpenses, pl.operatingIncome, pl.ordinaryIncome]);
  const plPrevious = prev ? JSON.stringify([prev.revenue, prev.grossProfit, prev.sgaExpenses, prev.operatingIncome, prev.ordinaryIncome]) : '[]';

  const expTop = pl.expenseBreakdown.slice(0, 6);
  const expOther = pl.expenseBreakdown.slice(6).reduce((s, e) => s + e.amount, 0);
  const expLabels = JSON.stringify([...expTop.map(e => e.accountName), ...(expOther > 0 ? ['その他'] : [])]);
  const expValues = JSON.stringify([...expTop.map(e => e.amount), ...(expOther > 0 ? [expOther] : [])]);

  const evalLabels = JSON.stringify(evaluations.map(e => categoryJP(e.category)));
  const evalScores = JSON.stringify(evaluations.map(e => e.score));

  // 月次推移データ
  const trendPeriodLabel = trend.months.length <= 1 ? '当月' : `直近${trend.months.length}か月`;
  const trendMonths = trend.months.map(m => `${m.month}月`);
  const trendRevenue = trend.months.map(m => m.revenue);
  const trendProfit = trend.months.map(m => m.ordinaryIncome);
  const trendGrossProfit = trend.months.map(m => m.grossProfit);
  const trendCash = trend.months.map(m => m.cashAndDeposits);
  const trendSGA = trend.months.map(m => m.sgaExpenses);
  const trendOperating = trend.months.map(m => m.operatingIncome);

  // 目標データ
  const targetRevenue = trend.targets.map(t => t.revenue);
  const targetGrossProfit = trend.targets.map(t => t.grossProfit);
  const targetProfit = trend.targets.map(t => t.ordinaryIncome);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(meta.companyName)} | AI CFO</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>${CSS}</style>
</head>
<body>

${renderSidebar('dashboard', meta.companyName)}

<!-- Main -->
<div class="main">

  <!-- Header -->
  <header class="header">
    <button class="menu-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <div class="header-left">
      <h1 class="header-title">ダッシュボード</h1>
      <div class="header-controls">
        <!-- 期間選択 -->
        <div class="period-selector">
          <div class="period-presets">
            <a href="/?from=${pl.year}-${String(pl.month).padStart(2,'0')}&to=${pl.year}-${String(pl.month).padStart(2,'0')}" class="period-btn ${options.periodLabel === '1m' ? 'active' : ''}">1か月</a>
            <a href="/?from=${prevMonthStr(pl.year, pl.month, 2)}&to=${pl.year}-${String(pl.month).padStart(2,'0')}" class="period-btn ${options.periodLabel === '3m' ? 'active' : ''}">3か月</a>
            <a href="/?from=${prevMonthStr(pl.year, pl.month, 5)}&to=${pl.year}-${String(pl.month).padStart(2,'0')}" class="period-btn ${options.periodLabel === '6m' ? 'active' : ''}">6か月</a>
            <a href="/?from=${prevMonthStr(pl.year, pl.month, 11)}&to=${pl.year}-${String(pl.month).padStart(2,'0')}" class="period-btn ${options.periodLabel === '12m' ? 'active' : ''}">1年</a>
          </div>
          <div class="period-custom">
            <select class="month-select" id="fromMonth">
              ${generateMonthOptions(pl.year, pl.month, options.fromMonth)}
            </select>
            <span class="period-sep">〜</span>
            <select class="month-select" id="toMonth">
              ${generateMonthOptions(pl.year, pl.month, options.toMonth)}
            </select>
            <button class="period-apply" onclick="location.href='/?from='+document.getElementById('fromMonth').value+'&to='+document.getElementById('toMonth').value">表示</button>
          </div>
        </div>
        <!-- 日付絞り込み -->
        <div class="date-picker-wrap" onclick="document.getElementById('dateInput').showPicker()">
          <input type="date" class="date-input" id="dateInput" value="${options.selectedDate || ''}" onchange="location.href='/?date='+this.value"/>
          <div class="date-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${options.selectedDate ? options.selectedDate : '日付'}
          </div>
        </div>${options.selectedDate ? `<a href="/" class="date-clear" title="解除">✕</a>` : ''}
      </div>
    </div>
    <div class="header-right">
      <div class="usage-badge" title="API使用量">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        <span class="usage-text-val">--</span>
      </div>
      <!-- 経営状態バッジ非表示 -->
      <div class="report-dropdown">
        <button class="btn-report" onclick="this.parentElement.classList.toggle('open')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          レポート出力
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="report-menu">
          <a href="/report" class="report-menu-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
            Webで表示
          </a>
          <a href="/report/pdf" class="report-menu-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            PDFダウンロード
          </a>
        </div>
      </div>
    </div>
  </header>

  <!-- Content -->
  <div class="content">

    <!-- Welcome -->
    <div class="welcome-card">
      <div class="welcome-text">
        <h2>${esc(meta.companyName)}の${options.fromMonth && options.toMonth && options.fromMonth !== options.toMonth ? options.fromMonth.replace('-', '年').replace(/^(\d+年)0?/, '$1') + '月〜' + options.toMonth.replace('-', '年').replace(/^(\d+年)0?/, '$1') + '月' : monthLabel}概況</h2>
        <p>${esc(commentary.executiveSummary)}</p>
      </div>
    </div>

    <!-- KPI Row -->
    <div class="kpi-row">
      ${options.periodTotals
        ? kpiCard('売上高（期間合計）', formatCurrency(options.periodTotals.revenue), null, '')
        : kpiCard('売上高', formatCurrency(es.monthlyRevenue), es.revenueChangeRate, '')}
      ${options.periodTotals
        ? kpiCard('経常利益（期間合計）', formatCurrency(options.periodTotals.ordinaryIncome), null, '')
        : kpiCard('経常利益', formatCurrency(es.monthlyProfit), es.profitChangeRate, '')}
      ${kpiCard('現預金残高', formatCurrency(options.periodTotals ? options.periodTotals.cashAndDeposits : es.cashBalance), cf.cashChangeRate !== 0 ? cf.cashChangeRate : null, '')}
      ${kpiCard('資金繰り余力', cf.cashRunwayMonths >= 999 ? '十分' : cf.cashRunwayMonths.toFixed(1) + 'か月', null, '', `risk-${cf.shortageRisk}`)}
    </div>

    <!-- Main Trend Chart (wide) -->
    <div class="card card--wide">
      <div class="card-header">
        <h3>売上・利益推移</h3>
        <div style="display:flex;align-items:center;gap:16px">
          <span class="card-sub" style="display:flex;align-items:center;gap:5px"><span style="display:inline-block;width:20px;height:2px;border-top:2px dashed #b0b0c0"></span> 目標</span>
          <span class="card-sub" style="display:flex;align-items:center;gap:5px"><span style="display:inline-block;width:20px;height:2.5px;background:#2298ae;border-radius:1px"></span> 実績</span>
          <span class="card-sub">${trendPeriodLabel}</span>
        </div>
      </div>
      <div class="card-chart card-chart--tall"><canvas id="trendChart"></canvas></div>
    </div>

    <!-- Charts Row 1 -->
    <div class="grid-3">
      <div class="card">
        <div class="card-header">
          <h3>現預金推移</h3>
          <span class="card-sub">${trendPeriodLabel}</span>
        </div>
        <div class="card-chart"><canvas id="cashChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3>損益比較</h3>
          <span class="card-sub">当月 vs 前月</span>
        </div>
        <div class="card-chart"><canvas id="plChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3>費用構成</h3>
          <span class="card-sub">主要科目の内訳</span>
        </div>
        <div class="card-chart"><canvas id="expenseChart"></canvas></div>
      </div>
    </div>

    <!-- Charts Row 2 -->
    <div class="grid-3">
      <div class="card">
        <div class="card-header">
          <h3>費用推移</h3>
          <span class="card-sub">販管費 vs 売上原価</span>
        </div>
        <div class="card-chart"><canvas id="costTrendChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3>総合評価</h3>
        </div>
        <div class="card-chart"><canvas id="radarChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3>財務健全性</h3>
        </div>
        <div class="card-body">
          ${gaugeBar('流動比率', fm.safety.currentRatio, 300, '%')}
          ${gaugeBar('自己資本比率', fm.safety.equityRatio, 100, '%')}
          ${gaugeBar('営業利益率', fm.profitability.operatingProfitMargin * 100, 30, '%')}
          ${gaugeBar('経常利益率', fm.profitability.ordinaryProfitMargin * 100, 30, '%')}
          ${gaugeBar('月商倍率', fm.safety.cashMonthsRatio, 6, '倍')}
        </div>
      </div>
    </div>

    <!-- Bottom Row -->
    <div class="grid-2">
      <!-- Risk Alerts -->
      <div class="card">
        <div class="card-header">
          <h3>リスクアラート</h3>
          <span class="card-badge">${anomalies.length}件</span>
        </div>
        <div class="card-body">
${anomalies.length === 0
  ? '          <p class="muted">異常は検出されませんでした。</p>'
  : anomalies.map(a => {
      const cls = a.severity === 'critical' ? 'alert--critical' : a.severity === 'warning' ? 'alert--warn' : 'alert--info';
      return `          <div class="alert-row ${cls}"><span class="alert-dot"></span><span>${esc(a.message)}</span></div>`;
    }).join('\n')}
        </div>
      </div>

      <!-- Insights -->
      <div class="card">
        <div class="card-header">
          <h3>経営者への示唆</h3>
        </div>
        <div class="card-body">
${commentary.positivePoints.length > 0 ? `
          <div class="insight-section">
            <div class="insight-label insight-label--good">良い点</div>
${commentary.positivePoints.map(p => `            <div class="insight-item insight-item--good">${esc(p)}</div>`).join('\n')}
          </div>` : ''}
${commentary.negativePoints.length > 0 ? `
          <div class="insight-section">
            <div class="insight-label insight-label--warn">注意点</div>
${commentary.negativePoints.map(p => `            <div class="insight-item insight-item--warn">${esc(p)}</div>`).join('\n')}
          </div>` : ''}
          <div class="insight-section">
            <div class="insight-label insight-label--action">アクション</div>
${commentary.actionItems.map(a => `            <div class="insight-item insight-item--action">${esc(a)}</div>`).join('\n')}
          </div>
        </div>
      </div>
    </div>

    <!-- Banking & Eval Row -->
    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <h3>銀行評価</h3>
          <span class="pill pill--${scoreToLevel(bm.overallScore)} pill--sm">${scoreToJP(bm.overallScore)}</span>
        </div>
        <div class="card-body">
          <div class="bank-grid">
            ${bankTile('自己資本比率', bm.equityRatio.toFixed(1) + '%')}
            ${bankTile('債務償還年数', bm.debtRepaymentYears !== null ? bm.debtRepaymentYears.toFixed(1) + '年' : '—')}
            ${bankTile('月商倍率', bm.cashToMonthlyRevenue.toFixed(1) + '倍')}
            ${bankTile('営業利益率', formatPercent(bm.operatingProfitMargin))}
          </div>
          <p class="bank-comment">${esc(commentary.bankingComment)}</p>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3>PL明細</h3>
        </div>
        <div class="card-body">
          <table class="mini-table">
            <thead><tr><th>科目</th><th>当月</th><th>前月</th><th>増減</th></tr></thead>
            <tbody>
${plRowsMini(pl, comparison)}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="dash-footer">
      <span>accounting-ai-agent v${esc(meta.version)}</span>
      <span>${new Date(meta.generatedAt).toLocaleString('ja-JP')}</span>
    </div>

  </div>
</div>

<script>
Chart.defaults.font.family = "-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN',sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = '#8a8f98';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
Chart.defaults.plugins.legend.labels.padding = 14;

var fmt = function(v){return new Intl.NumberFormat('ja-JP').format(v)+'円'};
var fmtM = function(v){return (v/10000).toFixed(0)+'万'};

// PL Bar
new Chart(document.getElementById('plChart'),{
  type:'bar',
  data:{
    labels:${plLabels},
    datasets:[
      {label:'当月',data:${plCurrent},backgroundColor:'rgba(99,102,241,0.85)',borderRadius:5,borderSkipped:false},
      {label:'前月',data:${plPrevious},backgroundColor:'rgba(99,102,241,0.25)',borderRadius:5,borderSkipped:false}
    ]
  },
  options:{
    responsive:true,maintainAspectRatio:false,
    plugins:{tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+fmt(c.raw)}}}},
    scales:{y:{beginAtZero:true,grid:{color:'#f1f1f4'},ticks:{callback:fmtM}},x:{grid:{display:false}}}
  }
});

// Expense Doughnut
new Chart(document.getElementById('expenseChart'),{
  type:'doughnut',
  data:{
    labels:${expLabels},
    datasets:[{data:${expValues},backgroundColor:['#2298ae','#2298ae','#5ab4c4','#ef4444','#8b5cf6','#06b6d4','#d1d5db'],borderWidth:0,hoverOffset:6}]
  },
  options:{
    responsive:true,maintainAspectRatio:false,cutout:'65%',
    plugins:{
      legend:{position:'right',labels:{padding:10,font:{size:11}}},
      tooltip:{callbacks:{label:function(c){var t=c.dataset.data.reduce(function(a,b){return a+b},0);return c.label+': '+fmt(c.raw)+' ('+((c.raw/t)*100).toFixed(1)+'%)';}}}
    }
  }
});

// Main Trend (6 months, area chart with targets)
new Chart(document.getElementById('trendChart'),{
  type:'line',
  data:{
    labels:${JSON.stringify(trendMonths)},
    datasets:[
      // 目標ライン（背景に薄く表示）
      {label:'売上目標',data:${JSON.stringify(targetRevenue)},borderColor:'rgba(99,102,241,0.3)',backgroundColor:'rgba(99,102,241,0.04)',fill:true,tension:0.4,borderWidth:1.5,borderDash:[8,4],pointRadius:0,pointHoverRadius:4,pointBackgroundColor:'rgba(99,102,241,0.4)',order:4},
      {label:'粗利目標',data:${JSON.stringify(targetGrossProfit)},borderColor:'rgba(139,92,246,0.25)',backgroundColor:'rgba(139,92,246,0.03)',fill:true,tension:0.4,borderWidth:1.5,borderDash:[8,4],pointRadius:0,pointHoverRadius:4,pointBackgroundColor:'rgba(139,92,246,0.4)',order:5},
      {label:'利益目標',data:${JSON.stringify(targetProfit)},borderColor:'rgba(34,197,94,0.3)',backgroundColor:'rgba(34,197,94,0.04)',fill:true,tension:0.4,borderWidth:1.5,borderDash:[8,4],pointRadius:0,pointHoverRadius:4,pointBackgroundColor:'rgba(34,197,94,0.4)',order:6},
      // 実績ライン（前面に表示）
      {label:'売上高',data:${JSON.stringify(trendRevenue)},borderColor:'#2298ae',backgroundColor:'rgba(99,102,241,0.12)',fill:true,tension:0.4,borderWidth:2.5,pointRadius:5,pointHoverRadius:8,pointBackgroundColor:'#fff',pointBorderColor:'#2298ae',pointBorderWidth:2.5,order:1},
      {label:'売上総利益',data:${JSON.stringify(trendGrossProfit)},borderColor:'#8b5cf6',backgroundColor:'rgba(139,92,246,0.08)',fill:true,tension:0.4,borderWidth:2,pointRadius:5,pointHoverRadius:8,pointBackgroundColor:'#fff',pointBorderColor:'#8b5cf6',pointBorderWidth:2,order:2},
      {label:'経常利益',data:${JSON.stringify(trendProfit)},borderColor:'#2298ae',backgroundColor:'rgba(34,197,94,0.1)',fill:true,tension:0.4,borderWidth:2,pointRadius:5,pointHoverRadius:8,pointBackgroundColor:'#fff',pointBorderColor:'#2298ae',pointBorderWidth:2,order:3}
    ]
  },
  options:{
    responsive:true,maintainAspectRatio:false,
    interaction:{mode:'index',intersect:false},
    plugins:{
      tooltip:{
        callbacks:{
          label:function(c){
            var isTarget = c.dataset.label.includes('目標');
            var prefix = isTarget ? '【目標】' : '';
            return prefix + c.dataset.label.replace('目標','') + ': ' + fmt(c.raw);
          }
        },
        filter:function(item){return item.raw !== 0}
      },
      legend:{
        position:'top',
        labels:{
          filter:function(item){return !item.text.includes('目標')},
        }
      },
      // カスタム凡例の注釈
    },
    scales:{y:{beginAtZero:true,grid:{color:'#f1f1f4'},ticks:{callback:fmtM}},x:{grid:{display:false}}}
  }
});

// Cash Trend (bar + line)
new Chart(document.getElementById('cashChart'),{
  type:'bar',
  data:{
    labels:${JSON.stringify(trendMonths)},
    datasets:[
      {label:'現預金',data:${JSON.stringify(trendCash)},backgroundColor:'rgba(6,182,212,0.7)',borderRadius:5,borderSkipped:false}
    ]
  },
  options:{
    responsive:true,maintainAspectRatio:false,
    plugins:{tooltip:{callbacks:{label:function(c){return fmt(c.raw)}}}},
    scales:{y:{beginAtZero:false,grid:{color:'#f1f1f4'},ticks:{callback:fmtM}},x:{grid:{display:false}}}
  }
});

// Cost Trend (stacked area)
new Chart(document.getElementById('costTrendChart'),{
  type:'line',
  data:{
    labels:${JSON.stringify(trendMonths)},
    datasets:[
      {label:'販管費',data:${JSON.stringify(trendSGA)},borderColor:'#5ab4c4',backgroundColor:'rgba(245,158,11,0.15)',fill:true,tension:0.4,borderWidth:2,pointRadius:3},
      {label:'営業利益',data:${JSON.stringify(trendOperating)},borderColor:'#2298ae',backgroundColor:'rgba(34,197,94,0.15)',fill:true,tension:0.4,borderWidth:2,pointRadius:3}
    ]
  },
  options:{
    responsive:true,maintainAspectRatio:false,
    interaction:{mode:'index',intersect:false},
    plugins:{tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+fmt(c.raw)}}}},
    scales:{y:{beginAtZero:true,grid:{color:'#f1f1f4'},ticks:{callback:fmtM}},x:{grid:{display:false}}}
  }
});

// Radar
new Chart(document.getElementById('radarChart'),{
  type:'radar',
  data:{
    labels:${evalLabels},
    datasets:[{data:${evalScores},fill:true,backgroundColor:'rgba(99,102,241,0.15)',borderColor:'#2298ae',borderWidth:2,pointBackgroundColor:'#2298ae',pointRadius:4,pointHoverRadius:6}]
  },
  options:{
    responsive:true,maintainAspectRatio:false,
    scales:{r:{beginAtZero:true,max:100,ticks:{stepSize:20,font:{size:10},backdropColor:'transparent'},grid:{color:'#e5e7eb'},angleLines:{color:'#e5e7eb'},pointLabels:{font:{size:13,weight:'600'},color:'#1f2937'}}},
    plugins:{legend:{display:false}}
  }
});

// API使用量の自動更新
(function(){
  function updateUsage(){
    fetch('/api/usage').then(function(r){return r.json()}).then(function(d){
      document.querySelectorAll('.usage-text-val').forEach(function(el){
        if(d.requestCount===0){el.textContent='API未使用'}
        else{el.textContent=d.totalTokens.toLocaleString('ja-JP')+' tok / $'+d.totalCost.toFixed(4)+' (約'+Math.ceil(d.totalCostYen)+'円)'}
      });
    }).catch(function(){});
  }
  updateUsage();
  setInterval(updateUsage,10000);
})();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function kpiCard(label: string, value: string, changeRate: number | null, icon: string, extraClass: string = ''): string {
  let changeHTML = '';
  if (changeRate !== null) {
    const cls = changeRate > 0 ? 'change-up' : changeRate < 0 ? 'change-down' : '';
    changeHTML = `<div class="kpi-change ${cls}">${formatChangeRate(changeRate)}</div>`;
  }
  return `
      <div class="kpi-card">
        ${icon ? `<div class="kpi-icon">${icon}</div>` : ''}
        <div class="kpi-info">
          <div class="kpi-label">${label}</div>
          <div class="kpi-value ${extraClass}">${value}</div>
          ${changeHTML}
        </div>
      </div>`;
}

function gaugeBar(label: string, value: number | null, max: number, suffix: string = '%'): string {
  if (value === null) {
    return `<div class="gauge"><div class="gauge-head"><span>${label}</span><strong>—</strong></div><div class="gauge-track"><div class="gauge-fill" style="width:0"></div></div></div>`;
  }
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pct >= 60 ? '#2298ae' : pct >= 35 ? '#5ab4c4' : '#ef4444';
  return `<div class="gauge"><div class="gauge-head"><span>${label}</span><strong>${value.toFixed(1)}${suffix}</strong></div><div class="gauge-track"><div class="gauge-fill" style="width:${pct}%;background:${color}"></div></div></div>`;
}

function bankTile(label: string, value: string): string {
  return `<div class="bank-tile"><div class="bank-tile-val">${value}</div><div class="bank-tile-label">${label}</div></div>`;
}

function plRowsMini(pl: FullReport['monthlyPL'], comparison: FullReport['comparison']): string {
  const prev = comparison.previous;
  return [
    { l: '売上高', c: pl.revenue, p: prev?.revenue },
    { l: '売上総利益', c: pl.grossProfit, p: prev?.grossProfit },
    { l: '販管費', c: pl.sgaExpenses, p: prev?.sgaExpenses },
    { l: '営業利益', c: pl.operatingIncome, p: prev?.operatingIncome },
    { l: '経常利益', c: pl.ordinaryIncome, p: prev?.ordinaryIncome },
  ].map(r => {
    const d = r.p != null ? r.c - r.p : null;
    const cls = d != null ? (d > 0 ? 'change-up' : d < 0 ? 'change-down' : '') : '';
    return `              <tr><td>${r.l}</td><td class="num">${formatCurrency(r.c)}</td><td class="num">${r.p != null ? formatCurrency(r.p) : '—'}</td><td class="num ${cls}">${d != null ? formatCurrency(d) : '—'}</td></tr>`;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateMonthOptions(currentYear: number, currentMonth: number, selectedValue?: string | null): string {
  // 当月まで表示するため、実際の現在日を基準にする
  const now = new Date();
  const realYear = now.getFullYear();
  const realMonth = now.getMonth() + 1;
  // レポート月より当月が新しければ当月を基準にする
  const baseYear = realYear > currentYear || (realYear === currentYear && realMonth > currentMonth) ? realYear : currentYear;
  const baseMonth = baseYear === realYear ? realMonth : currentMonth;

  const opts: string[] = [];
  for (let i = 0; i < 24; i++) {
    let m = baseMonth - i;
    let y = baseYear;
    while (m <= 0) { m += 12; y -= 1; }
    const val = `${y}-${String(m).padStart(2, '0')}`;
    const label = `${y}年${m}月`;
    const selected = selectedValue ? (val === selectedValue ? 'selected' : '') : (i === 0 ? 'selected' : '');
    opts.push(`<option value="${val}" ${selected}>${label}</option>`);
  }
  return opts.join('');
}

function prevMonthStr(year: number, month: number, offset: number): string {
  let m = month - offset;
  let y = year;
  while (m <= 0) { m += 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
function levelJP(l: string): string {
  return ({ excellent: '優良', good: '良好', fair: '普通', warning: '注意', critical: '危険' })[l] ?? l;
}
function categoryJP(c: string): string {
  return ({ profit: '利益', cash_flow: '資金繰り', fixed_cost: '固定費', revenue_dependency: '売上', banking: '銀行評価' })[c] ?? c;
}
function scoreToLevel(s: string): string {
  return ({ excellent: 'excellent', good: 'good', fair: 'fair', poor: 'warning', critical: 'critical' })[s] ?? 'fair';
}
function scoreToJP(s: string): string {
  return ({ excellent: '優良', good: '良好', fair: '普通', poor: '要注意', critical: '危険' })[s] ?? s;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --sidebar-w:240px;
  --header-h:60px;
  --bg:#ffffff;
  --card:#fff;
  --text:#1f2937;
  --text2:#6b7280;
  --border:#e5e7eb;
  --primary:#2298ae;
  --primary-light:rgba(99,102,241,0.1);
  --green:#2298ae;
  --orange:#5ab4c4;
  --red:#ef4444;
  --radius:12px;
}
html{-webkit-font-smoothing:antialiased}
body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Hiragino Sans",Meiryo,sans-serif;background:var(--bg);color:var(--text);font-size:14px;line-height:1.55}

/* === Sidebar === */
.sidebar{
  position:fixed;top:0;left:0;bottom:0;width:var(--sidebar-w);
  background:#1b7f8e;color:#c4e4ea;
  display:flex;flex-direction:column;z-index:100;
  transition:transform .25s ease;
}
.sidebar-brand{
  display:flex;align-items:center;gap:10px;
  padding:20px 20px 16px;color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.02em;
}
.sidebar-nav{flex:1;overflow-y:auto;padding:0 12px}
.nav-section{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#68b3be;padding:20px 12px 8px}
.nav-item{
  display:flex;align-items:center;gap:10px;
  padding:10px 12px;border-radius:8px;
  color:#c4e4ea;text-decoration:none;font-size:14px;font-weight:500;
  transition:all .15s;margin-bottom:2px;
}
.nav-item:hover{background:rgba(255,255,255,0.06);color:#fff}
.nav-item.active{background:var(--primary);color:#fff}
.nav-item.nav-disabled{opacity:0.4;pointer-events:none}
.sidebar-footer{padding:16px 20px;border-top:1px solid rgba(255,255,255,0.15)}
.sidebar-company{font-size:13px;color:#fff;font-weight:600}
.sidebar-user{display:flex;align-items:center;gap:8px;margin-top:10px;padding:8px 0}
.sidebar-user-avatar{width:28px;height:28px;border-radius:50%;flex-shrink:0}
.sidebar-user-avatar-placeholder{width:28px;height:28px;border-radius:50%;background:#475569;flex-shrink:0}
.sidebar-user-info{flex:1;min-width:0}
.sidebar-user-name{font-size:12px;color:#e2e8f0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sidebar-user-email{font-size:10px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sidebar-logout-btn{background:none;border:none;color:#94a3b8;cursor:pointer;padding:4px;border-radius:4px;flex-shrink:0}
.sidebar-logout-btn:hover{color:#ef4444;background:rgba(239,68,68,0.1)}
.sidebar-version{font-size:11px;color:#68b3be;margin-top:2px}

/* === Main === */
.main{margin-left:var(--sidebar-w)}

/* === Header === */
.header{
  height:var(--header-h);
  background:var(--card);border-bottom:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;
  padding:0 28px;position:sticky;top:0;z-index:50;
}
.header-left{display:flex;align-items:center;gap:12px}
.header-title{font-size:18px;font-weight:700;letter-spacing:-0.02em}
.header-controls{display:flex;align-items:center;gap:10px}
.period-selector{display:flex;align-items:center;gap:8px;background:var(--bg);border-radius:10px;padding:4px}
.period-presets{display:flex;gap:2px}
.period-btn{padding:5px 10px;border-radius:6px;font-size:12px;font-weight:600;color:var(--text2);text-decoration:none;transition:all .15s;white-space:nowrap}
.period-btn:hover{background:var(--card);color:var(--text)}
.period-btn.active{background:var(--primary);color:#fff}
.period-custom{display:flex;align-items:center;gap:4px;margin-left:4px;padding-left:8px;border-left:1px solid var(--border)}
.period-sep{font-size:12px;color:var(--text2);margin:0 2px}
.period-apply{padding:5px 12px;border-radius:6px;border:none;background:var(--primary);color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity .15s}
.period-apply:hover{opacity:0.85}
.month-select{font-size:12px;font-weight:600;color:var(--text);background:var(--card);border:1px solid var(--border);padding:5px 24px 5px 8px;border-radius:6px;cursor:pointer;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 6px center;font-family:inherit}
.month-select:hover{border-color:var(--primary)}
.month-select:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 2px var(--primary-light)}
.date-picker-wrap{position:relative;display:flex;align-items:center}
.date-input{position:absolute;opacity:0;width:0;height:0;pointer-events:none}
.date-label{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--text2);background:var(--bg);border:1px solid var(--border);padding:6px 12px;border-radius:8px;cursor:pointer;transition:all .15s;white-space:nowrap}
.date-label:hover{border-color:var(--primary);color:var(--primary)}
.date-input:focus + .date-label{border-color:var(--primary);color:var(--primary)}
.date-clear{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--bg);border:1px solid var(--border);font-size:12px;color:var(--text2);text-decoration:none;cursor:pointer;transition:all .15s}
.date-clear:hover{background:#fef2f2;border-color:var(--red);color:var(--red)}
.header-right{display:flex;align-items:center;gap:12px}
.btn-report{
  display:flex;align-items:center;gap:6px;
  padding:8px 16px;border-radius:8px;
  background:var(--primary);color:#fff;
  text-decoration:none;font-size:13px;font-weight:600;
  transition:opacity .15s;
}
.btn-report:hover{opacity:0.85}
.report-dropdown{position:relative}
.report-menu{display:none;position:absolute;top:100%;right:0;margin-top:6px;background:var(--card);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);min-width:180px;z-index:100;overflow:hidden}
.report-dropdown.open .report-menu{display:block}
.report-menu-item{display:flex;align-items:center;gap:8px;padding:10px 16px;font-size:13px;font-weight:500;color:var(--text);text-decoration:none;transition:background .1s}
.report-menu-item:hover{background:var(--bg)}
.usage-badge{display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:8px;background:#ecf6f8;border:1px solid #a8d8e0;font-size:11px;font-weight:600;color:#1b7f8e;cursor:default;white-space:nowrap;transition:all .2s}
.usage-badge:hover{background:#d5eef3}
.menu-toggle{display:none;background:none;border:none;cursor:pointer;color:var(--text);padding:4px}

/* === Content === */
.content{padding:24px 28px;max-width:1400px}

/* === Welcome === */
.welcome-card{
  background:linear-gradient(135deg,#2298ae 0%,#4dbdcf 100%);
  border-radius:var(--radius);padding:28px 32px;margin-bottom:24px;color:#fff;
}
.welcome-card h2{font-size:20px;font-weight:700;margin-bottom:8px}
.welcome-card p{font-size:14px;opacity:0.9;line-height:1.65;max-width:700px}

/* === KPI === */
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.kpi-card{
  background:var(--card);border-radius:var(--radius);padding:20px;
  display:flex;align-items:center;gap:14px;
  border:1px solid var(--border);
}
.kpi-icon{font-size:28px;width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:var(--primary-light);border-radius:10px}
.kpi-info{flex:1;min-width:0}
.kpi-label{font-size:12px;color:var(--text2);font-weight:600;letter-spacing:0.02em}
.kpi-value{font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-change{font-size:12px;font-weight:600}
.change-up{color:var(--green)}
.change-down{color:var(--red)}

/* === Grid === */
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:24px}

/* === Card === */
.card{background:var(--card);border-radius:var(--radius);border:1px solid var(--border);overflow:hidden}
.card-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)}
.card-header h3{font-size:15px;font-weight:700}
.card-sub{font-size:12px;color:var(--text2)}
.card-badge{font-size:12px;font-weight:700;background:var(--primary-light);color:var(--primary);padding:2px 10px;border-radius:12px}
.card--wide{margin-bottom:24px}
.card-chart{padding:16px;height:280px}
.card-chart--tall{height:340px}
.card-body{padding:16px 20px}

/* === Gauge === */
.gauge{margin-bottom:14px}
.gauge-head{display:flex;justify-content:space-between;margin-bottom:5px;font-size:13px}
.gauge-head span{color:var(--text2)}
.gauge-head strong{font-weight:700;color:var(--text)}
.gauge-track{height:7px;background:#e5e7eb;border-radius:4px;overflow:hidden}
.gauge-fill{height:100%;border-radius:4px;transition:width .5s ease}

/* === Alerts === */
.alert-row{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;line-height:1.55}
.alert-row:last-child{border-bottom:none}
.alert-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:5px}
.alert--critical .alert-dot{background:var(--red)}
.alert--warn .alert-dot{background:var(--orange)}
.alert--info .alert-dot{background:var(--primary)}

/* === Insights === */
.insight-section{margin-bottom:14px}
.insight-section:last-child{margin-bottom:0}
.insight-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;padding:2px 8px;border-radius:4px;display:inline-block}
.insight-label--good{background:#d5eef3;color:#1b7f8e}
.insight-label--warn{background:#d5eef3;color:#1b7f8e}
.insight-label--action{background:#d5eef3;color:#1b7f8e}
.insight-item{font-size:13px;padding:4px 0;padding-left:14px;position:relative;line-height:1.55}
.insight-item::before{content:'';position:absolute;left:0;top:10px;width:6px;height:6px;border-radius:50%}
.insight-item--good::before{background:var(--green)}
.insight-item--warn::before{background:var(--orange)}
.insight-item--action::before{background:var(--primary)}

/* === Banking === */
.bank-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:14px}
.bank-tile{background:var(--bg);border-radius:8px;padding:14px;text-align:center}
.bank-tile-val{font-size:22px;font-weight:700;color:var(--text)}
.bank-tile-label{font-size:11px;color:var(--text2);margin-top:2px;font-weight:600}
.bank-comment{font-size:13px;color:var(--text2);line-height:1.6}

/* === Mini table === */
.mini-table{width:100%;border-collapse:collapse;font-size:13px}
.mini-table th,.mini-table td{padding:8px 10px;border-bottom:1px solid var(--border)}
.mini-table th{font-weight:600;color:var(--text2);font-size:12px;text-align:left}
.mini-table td.num{text-align:right;font-variant-numeric:tabular-nums}
.mini-table tbody tr:last-child td{border-bottom:none}

/* Pill */
.pill{display:inline-block;padding:4px 14px;border-radius:980px;font-size:12px;font-weight:600}
.pill--sm{padding:3px 10px;font-size:11px}
.pill--excellent{background:#d5eef3;color:#1b7f8e}
.pill--good{background:#d5eef3;color:#1b7f8e}
.pill--fair{background:#d5eef3;color:#1b7f8e}
.pill--warning{background:#fed7aa;color:#9a3412}
.pill--critical{background:#fecaca;color:#991b1b}

/* Risk */
.risk-safe{color:var(--green)}
.risk-caution{color:var(--orange)}
.risk-warning{color:var(--orange)}
.risk-danger{color:var(--red)}

/* Footer */
.dash-footer{display:flex;justify-content:space-between;padding:20px 0;font-size:12px;color:#9ca3af;border-top:1px solid var(--border);margin-top:8px}

/* === Responsive === */
@media(max-width:1024px){
  .grid-3{grid-template-columns:1fr 1fr}
  .grid-3 .card:last-child{grid-column:span 2}
  .kpi-row{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:768px){
  .sidebar{transform:translateX(-100%)}
  .sidebar.open{transform:translateX(0);box-shadow:0 0 40px rgba(0,0,0,0.3)}
  .main{margin-left:0}
  .menu-toggle{display:block}
  .grid-2,.grid-3{grid-template-columns:1fr}
  .grid-3 .card:last-child{grid-column:auto}
  .kpi-row{grid-template-columns:1fr 1fr}
  .content{padding:16px}
  .card-chart{height:220px}
  .period-selector{flex-wrap:wrap}
  .period-custom{border-left:none;padding-left:0;margin-left:0}
  .header-controls{flex-wrap:wrap;gap:6px}
}
@media(max-width:480px){
  .kpi-row{grid-template-columns:1fr}
  .header{padding:0 16px}
  .header-title{font-size:16px}
  .btn-report span{display:none}
}
`;
