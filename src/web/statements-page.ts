import type { MonthlySnapshot } from '../types/trend.js';
import type { AnnualStatementView, AnnualFigures } from '../domain/finance/annual-view.js';
import { agentPageShell, esc } from './shared.js';
import { formatNumber } from '../utils/format.js';

/** 販管費の科目別内訳 */
export interface ExpenseBreakdownItem {
  name: string;
  amount: number;
}

export interface StatementsViewData {
  /** 年間化した当期／前期の決算値 */
  view: AnnualStatementView;
  /** 推移グラフ用の月次スナップショット（全件） */
  snapshots: MonthlySnapshot[];
  companyName?: string;
  /** 販管費の科目別内訳（期間残高。取込CSV由来。無ければ null） */
  expenseBreakdown?: ExpenseBreakdownItem[] | null;
  /** 内訳の出所（'csv' | 'freee' | null） */
  breakdownSource?: 'csv' | 'freee' | null;
}

// ---- 表示ヘルパ ----------------------------------------------------------

function yen(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${formatNumber(v)}円`;
}

function pct(num: number, den: number | null | undefined): string {
  if (!den || den <= 0) return '—';
  return `${(Math.round((num / den) * 1000) / 10).toFixed(1)}%`;
}

/** 前期比の差分バッジ（金額 + 変動率）。費用系は増加=悪で色付け */
function deltaBadge(current: number, previous: number | null | undefined, opts?: { costLike?: boolean }): string {
  if (previous === null || previous === undefined) return '<span class="stmt-delta stmt-delta--none">—</span>';
  const diff = current - previous;
  if (diff === 0) return '<span class="stmt-delta stmt-delta--flat">±0</span>';
  const up = diff > 0;
  const good = opts?.costLike ? !up : up;
  const cls = good ? 'stmt-delta--good' : 'stmt-delta--bad';
  const arrow = up ? '▲' : '▼';
  const rate = previous !== 0 ? ` (${up ? '+' : ''}${((diff / Math.abs(previous)) * 100).toFixed(1)}%)` : '';
  return `<span class="stmt-delta ${cls}">${arrow} ${up ? '+' : ''}${formatNumber(diff)}円${rate}</span>`;
}

interface RowOpts {
  label: string;
  value: number;
  prev?: number | null;
  ratio?: string;
  costLike?: boolean;
  emphasis?: boolean;
  indent?: boolean;
}

function stmtRow(o: RowOpts): string {
  const cls = ['stmt-row'];
  if (o.emphasis) cls.push('stmt-row--emphasis');
  if (o.indent) cls.push('stmt-row--indent');
  return `<tr class="${cls.join(' ')}">
    <td class="stmt-label">${esc(o.label)}</td>
    <td class="stmt-value">${yen(o.value)}</td>
    <td class="stmt-ratio">${o.ratio ?? ''}</td>
    <td class="stmt-change">${deltaBadge(o.value, o.prev, { costLike: o.costLike })}</td>
  </tr>`;
}

// ---- メインレンダラ ------------------------------------------------------

export function renderStatementsHTML(data: StatementsViewData): string {
  const body = renderBody(data);
  return agentPageShell({
    active: 'statements',
    title: '決算書ビューア',
    companyName: data.companyName,
    bodyHTML: body,
  });
}

function renderBody(data: StatementsViewData): string {
  const { view } = data;
  const cur = view.current;
  const prev = view.previous;
  const sorted = [...data.snapshots].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month);

  // 表示している年間値の出所バナー
  const annualBanner = view.isMonthlyData
    ? `<div class="stmt-banner stmt-banner--warn">
        <strong>年間概算（月次合算）</strong>で表示しています。取り込んだ月次データ${cur.monthsInPeriod}か月分を合算した値のため、<strong>決算整理仕訳（減価償却など）が反映されていません</strong>。正確な決算値を表示するには、月次推移試算表（CSV）を取り込み直してください（「期間残高」列から確定値を保存します）。
        ${prev ? '' : '<br><span class="stmt-banner-sub">前期（前年度）のデータが無いため、前期比は表示していません。</span>'}
      </div>`
    : `<div class="stmt-banner">
        <strong>期間残高（年間確定値）</strong>で表示しています。取り込んだ決算書の「期間残高／期末残高」列（決算整理仕訳を含む会計期間の確定値）です。
        ${prev ? '' : '<br><span class="stmt-banner-sub">前期（前年度）のデータが無いため、前期比は表示していません。</span>'}
      </div>`;

  // --- 主要指標 ---
  const equityRatio = pct(cur.netAssets, cur.totalAssets);
  const currentRatio = pct(cur.currentAssets, cur.currentLiabilities);
  const grossMargin = pct(cur.grossProfit, cur.revenue);
  const opMargin = pct(cur.operatingIncome, cur.revenue);
  const ordMargin = pct(cur.ordinaryIncome, cur.revenue);
  const sgaRatio = pct(cur.sgaExpenses, cur.revenue);

  const kpiCards = `
  <div class="stmt-kpi-grid">
    ${kpiCard('売上高', yen(cur.revenue), deltaBadge(cur.revenue, prev?.revenue))}
    ${kpiCard('営業利益', yen(cur.operatingIncome), deltaBadge(cur.operatingIncome, prev?.operatingIncome), opMargin + ' の利益率')}
    ${kpiCard('経常利益', yen(cur.ordinaryIncome), deltaBadge(cur.ordinaryIncome, prev?.ordinaryIncome), ordMargin + ' の利益率')}
    ${kpiCard('自己資本比率', equityRatio, '', '流動比率 ' + currentRatio)}
  </div>`;

  // --- PL ---
  const plTable = `
  <div class="stmt-card">
    <div class="stmt-card-head">
      <h2>損益計算書（PL）</h2>
      <span class="stmt-period">${esc(view.periodLabel)}${prev ? '' : ' ／ 前期比なし'}</span>
    </div>
    <table class="stmt-table">
      <thead><tr><th>科目</th><th>金額</th><th>対売上比</th><th>前期比</th></tr></thead>
      <tbody>
        ${stmtRow({ label: '売上高', value: cur.revenue, prev: prev?.revenue, ratio: '100.0%', emphasis: true })}
        ${stmtRow({ label: '売上原価', value: cur.costOfSales, prev: prev?.costOfSales, ratio: pct(cur.costOfSales, cur.revenue), costLike: true })}
        ${stmtRow({ label: '売上総利益', value: cur.grossProfit, prev: prev?.grossProfit, ratio: grossMargin, emphasis: true })}
        ${stmtRow({ label: '販売費及び一般管理費', value: cur.sgaExpenses, prev: prev?.sgaExpenses, ratio: sgaRatio, costLike: true })}
        ${stmtRow({ label: '営業利益', value: cur.operatingIncome, prev: prev?.operatingIncome, ratio: opMargin, emphasis: true })}
        ${stmtRow({ label: '経常利益', value: cur.ordinaryIncome, prev: prev?.ordinaryIncome, ratio: ordMargin, emphasis: true })}
        ${stmtRow({ label: '当期純利益', value: cur.netIncome, prev: prev?.netIncome, ratio: pct(cur.netIncome, cur.revenue), emphasis: true })}
      </tbody>
    </table>
  </div>`;

  // --- BS ---
  const fixedAssets = cur.totalAssets - cur.currentAssets;
  const prevFixedAssets = prev ? prev.totalAssets - prev.currentAssets : null;
  const totalLiabilities = cur.totalAssets - cur.netAssets;
  const prevTotalLiabilities = prev ? prev.totalAssets - prev.netAssets : null;
  const fixedLiabilities = totalLiabilities - cur.currentLiabilities;
  const prevFixedLiabilities = prev ? prevTotalLiabilities! - prev.currentLiabilities : null;

  const bsTable = `
  <div class="stmt-card">
    <div class="stmt-card-head">
      <h2>貸借対照表（BS）</h2>
      <span class="stmt-period">${cur.fiscalYearEndYear}年${cur.fiscalYearEndMonth}月末</span>
    </div>
    <div class="stmt-bs-cols">
      <table class="stmt-table">
        <thead><tr><th>資産の部</th><th>金額</th><th></th><th>前期比</th></tr></thead>
        <tbody>
          ${stmtRow({ label: '流動資産', value: cur.currentAssets, prev: prev?.currentAssets, emphasis: true })}
          ${stmtRow({ label: '現預金', value: cur.cashAndDeposits, prev: prev?.cashAndDeposits, indent: true })}
          ${cur.accountsReceivable != null ? stmtRow({ label: '売上債権', value: cur.accountsReceivable, prev: prev?.accountsReceivable ?? null, indent: true }) : ''}
          ${cur.inventory != null ? stmtRow({ label: '棚卸資産', value: cur.inventory, prev: prev?.inventory ?? null, indent: true }) : ''}
          ${stmtRow({ label: '固定資産', value: fixedAssets, prev: prevFixedAssets, emphasis: true })}
          ${stmtRow({ label: '資産合計', value: cur.totalAssets, prev: prev?.totalAssets, emphasis: true })}
        </tbody>
      </table>
      <table class="stmt-table">
        <thead><tr><th>負債・純資産の部</th><th>金額</th><th></th><th>前期比</th></tr></thead>
        <tbody>
          ${stmtRow({ label: '流動負債', value: cur.currentLiabilities, prev: prev?.currentLiabilities, costLike: true, emphasis: true })}
          ${cur.accountsPayable != null ? stmtRow({ label: '仕入債務', value: cur.accountsPayable, prev: prev?.accountsPayable ?? null, indent: true, costLike: true }) : ''}
          ${stmtRow({ label: '固定負債', value: fixedLiabilities, prev: prevFixedLiabilities, costLike: true, emphasis: true })}
          ${cur.interestBearingDebt > 0 ? stmtRow({ label: 'うち有利子負債', value: cur.interestBearingDebt, prev: prev?.interestBearingDebt ?? null, indent: true, costLike: true }) : ''}
          ${stmtRow({ label: '負債合計', value: totalLiabilities, prev: prevTotalLiabilities, costLike: true, emphasis: true })}
          ${stmtRow({ label: '純資産', value: cur.netAssets, prev: prev?.netAssets, emphasis: true })}
        </tbody>
      </table>
    </div>
    <div class="stmt-bs-metrics">
      <span>自己資本比率 <strong>${equityRatio}</strong></span>
      <span>流動比率 <strong>${currentRatio}</strong></span>
    </div>
  </div>`;

  const sgaCard = renderSgaBreakdown(cur, data);
  const trendCard = renderTrendCharts(sorted);

  return `
  <div class="stmt-wrap">
    ${annualBanner}
    ${kpiCards}
    <div class="stmt-two-col">
      ${plTable}
      ${sgaCard}
    </div>
    ${bsTable}
    ${trendCard}
  </div>
  ${STATEMENTS_CSS}
  ${trendScript(sorted)}
  `;
}

function kpiCard(label: string, value: string, delta: string, sub?: string): string {
  return `<div class="stmt-kpi">
    <div class="stmt-kpi-label">${esc(label)}</div>
    <div class="stmt-kpi-value">${value}</div>
    <div class="stmt-kpi-meta">${delta}${sub ? `<span class="stmt-kpi-sub">${esc(sub)}</span>` : ''}</div>
  </div>`;
}

function renderSgaBreakdown(cur: AnnualFigures, data: StatementsViewData): string {
  const items = (data.expenseBreakdown || []).filter(i => i.amount !== 0);
  const total = cur.sgaExpenses;

  let inner: string;
  if (items.length > 0) {
    const top = items.slice(0, 20);
    const shownSum = top.reduce((s, i) => s + Math.abs(i.amount), 0);
    const denom = shownSum || 1;
    inner = `<table class="stmt-table stmt-sga-table">
      <thead><tr><th>科目</th><th>金額</th><th>構成比</th></tr></thead>
      <tbody>
        ${top.map(i => {
          const share = (Math.abs(i.amount) / denom) * 100;
          return `<tr class="stmt-row">
            <td class="stmt-label">${esc(i.name)}</td>
            <td class="stmt-value">${yen(i.amount)}</td>
            <td class="stmt-ratio">
              <span class="stmt-bar"><span class="stmt-bar-fill" style="width:${Math.min(100, share).toFixed(0)}%"></span></span>
              ${share.toFixed(1)}%
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  } else {
    inner = `<div class="stmt-empty">
      <p>販管費の科目別内訳がまだ取り込まれていません。</p>
      <p class="stmt-empty-sub">販管費合計：<strong>${yen(total)}</strong>（対売上比 ${pct(total, cur.revenue)}）</p>
      <p class="stmt-empty-sub">月次推移CSVを取り込み直すと、科目別（役員報酬・地代家賃など）に表示されます。</p>
    </div>`;
  }

  return `<div class="stmt-card">
    <div class="stmt-card-head">
      <h2>販管費の内訳</h2>
      <span class="stmt-period">合計 ${yen(total)}</span>
    </div>
    ${inner}
  </div>`;
}

function renderTrendCharts(sorted: MonthlySnapshot[]): string {
  if (sorted.length < 2) {
    return `<div class="stmt-card">
      <div class="stmt-card-head"><h2>業績推移（月次）</h2></div>
      <div class="stmt-empty"><p>推移グラフは2か月以上のデータで表示されます。</p></div>
    </div>`;
  }
  return `<div class="stmt-card">
    <div class="stmt-card-head"><h2>業績推移（月次）</h2><span class="stmt-period">直近${sorted.length}か月</span></div>
    <div class="stmt-charts">
      <div class="stmt-chart-box"><canvas id="stmtProfitChart"></canvas></div>
      <div class="stmt-chart-box"><canvas id="stmtSgaChart"></canvas></div>
    </div>
  </div>`;
}

function trendScript(sorted: MonthlySnapshot[]): string {
  if (sorted.length < 2) return '';
  const labels = sorted.map(s => `${s.year}/${s.month}`);
  const revenue = sorted.map(s => s.revenue);
  const operating = sorted.map(s => s.operatingIncome);
  const ordinary = sorted.map(s => s.ordinaryIncome);
  const sga = sorted.map(s => s.sgaExpenses);
  const sgaRatio = sorted.map(s => s.revenue > 0 ? Math.round((s.sgaExpenses / s.revenue) * 1000) / 10 : 0);
  const json = (a: unknown) => JSON.stringify(a);

  return `<script>
(function(){
  if (typeof Chart === 'undefined') return;
  var teal = '#2298ae', tealLight = 'rgba(34,152,174,0.15)', orange = '#5ab4c4', red = '#ef4444';
  var labels = ${json(labels)};
  var yfmt = function(v){ return (v/10000).toLocaleString('ja-JP') + '万'; };
  var pc = document.getElementById('stmtProfitChart');
  if (pc) new Chart(pc, {
    type: 'bar',
    data: { labels: labels, datasets: [
      { type:'bar', label:'売上高', data:${json(revenue)}, backgroundColor: tealLight, borderColor: teal, borderWidth:1, order:3, yAxisID:'y' },
      { type:'line', label:'営業利益', data:${json(operating)}, borderColor: teal, backgroundColor: teal, tension:.3, order:1, yAxisID:'y' },
      { type:'line', label:'経常利益', data:${json(ordinary)}, borderColor: orange, backgroundColor: orange, borderDash:[4,3], tension:.3, order:2, yAxisID:'y' }
    ]},
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{position:'bottom'}, title:{display:true,text:'売上・利益の推移（各月度）'} },
      scales:{ y:{ ticks:{ callback:yfmt } } } }
  });
  var sc = document.getElementById('stmtSgaChart');
  if (sc) new Chart(sc, {
    data: { labels: labels, datasets: [
      { type:'bar', label:'販管費', data:${json(sga)}, backgroundColor: tealLight, borderColor: teal, borderWidth:1, yAxisID:'y' },
      { type:'line', label:'販管費率(%)', data:${json(sgaRatio)}, borderColor: red, backgroundColor: red, tension:.3, yAxisID:'y1' }
    ]},
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{position:'bottom'}, title:{display:true,text:'販管費と販管費率（各月度）'} },
      scales:{ y:{ position:'left', ticks:{ callback:yfmt } }, y1:{ position:'right', grid:{drawOnChartArea:false}, ticks:{ callback:function(v){return v+'%';} } } } }
  });
})();
</script>`;
}

const STATEMENTS_CSS = `<style>
.stmt-wrap{display:flex;flex-direction:column;gap:20px;max-width:1200px}
.stmt-banner{background:var(--primary-light);border:1px solid var(--primary);border-radius:var(--radius);padding:12px 16px;font-size:13px;color:var(--text)}
.stmt-banner strong{color:var(--primary)}
.stmt-banner--warn{background:#fff7ed;border-color:#f59e0b}
.stmt-banner--warn strong{color:#b45309}
.stmt-banner-sub{color:var(--text2);font-size:12px}
.stmt-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}
.stmt-kpi{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px 18px}
.stmt-kpi-label{font-size:12px;color:var(--text2);font-weight:600}
.stmt-kpi-value{font-size:22px;font-weight:700;color:var(--text);margin:6px 0 4px}
.stmt-kpi-meta{display:flex;flex-direction:column;gap:2px;font-size:12px}
.stmt-kpi-sub{color:var(--text2)}
.stmt-two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
.stmt-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;overflow-x:auto}
.stmt-card-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;gap:12px;flex-wrap:wrap}
.stmt-card-head h2{font-size:15px;font-weight:700;color:var(--text);margin:0}
.stmt-period{font-size:12px;color:var(--text2)}
.stmt-table{width:100%;border-collapse:collapse;font-size:13px}
.stmt-table th{text-align:left;font-size:11px;color:var(--text2);font-weight:600;padding:4px 8px;border-bottom:1px solid var(--border)}
.stmt-table th:nth-child(2),.stmt-table td.stmt-value{text-align:right}
.stmt-table th:nth-child(3),.stmt-table td.stmt-ratio{text-align:right;white-space:nowrap}
.stmt-table th:nth-child(4),.stmt-table td.stmt-change{text-align:right;white-space:nowrap}
.stmt-row td{padding:6px 8px;border-bottom:1px solid #f1f3f5}
.stmt-row--emphasis td{font-weight:700;background:var(--primary-light)}
.stmt-row--indent .stmt-label{padding-left:22px;color:var(--text2);font-weight:400}
.stmt-label{color:var(--text)}
.stmt-value{font-variant-numeric:tabular-nums}
.stmt-ratio{color:var(--text2);font-size:12px}
.stmt-change{font-size:12px}
.stmt-delta{font-variant-numeric:tabular-nums}
.stmt-delta--good{color:#1b9e77}
.stmt-delta--bad{color:#ef4444}
.stmt-delta--flat,.stmt-delta--none{color:var(--text2)}
.stmt-bs-cols{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.stmt-bs-metrics{display:flex;gap:24px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:13px;color:var(--text2)}
.stmt-bs-metrics strong{color:var(--primary);font-size:15px}
.stmt-sga-table .stmt-ratio{display:flex;align-items:center;gap:6px;justify-content:flex-end}
.stmt-bar{display:inline-block;width:60px;height:6px;background:#eef1f2;border-radius:3px;overflow:hidden}
.stmt-bar-fill{display:block;height:100%;background:var(--primary)}
.stmt-empty{padding:20px;text-align:center;color:var(--text2);font-size:13px}
.stmt-empty strong{color:var(--text)}
.stmt-empty-sub{margin-top:6px;font-size:12px}
.stmt-charts{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.stmt-chart-box{position:relative;height:280px}
@media(max-width:860px){.stmt-two-col,.stmt-bs-cols,.stmt-charts{grid-template-columns:1fr}}
</style>`;
