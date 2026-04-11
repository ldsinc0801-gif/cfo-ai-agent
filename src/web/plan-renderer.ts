import type { TrendData, MonthlyTarget, MonthlySnapshot } from '../types/trend.js';
import { renderSidebar, SHARED_CSS } from './shared.js';
import fs from 'fs';
import path from 'path';

/** カスタムKPI項目 */
export interface CustomKpiItem {
  id: string;
  name: string;
  target: number;
  actual: number;
  unit: string;  // '円', '%', '万', '件', '人' など
  format: 'yen' | 'percent' | 'number'; // 表示形式
  scope: 'annual' | 'monthly'; // 年間KPI or 月次テーブル
}

/** 年間KPI目標 */
export interface AnnualKpiTarget {
  fiscalYear: string;
  targetRevenue: number;
  targetProfit: number;
  targetMargin: number;
  targetEquityRatio: number;
  targetProductivity: number;
  employeeCount: number;
  customKpis?: CustomKpiItem[];
}

const KPI_FILE = path.resolve('data/plans/annual-kpi.json');

export function loadAnnualKpi(): AnnualKpiTarget {
  try {
    if (fs.existsSync(KPI_FILE)) {
      return JSON.parse(fs.readFileSync(KPI_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {
    fiscalYear: `${new Date().getFullYear()}年3月期`,
    targetRevenue: 0,
    targetProfit: 0,
    targetMargin: 0,
    targetEquityRatio: 0,
    targetProductivity: 0,
    employeeCount: 1,
  };
}

export function saveAnnualKpi(kpi: AnnualKpiTarget): void {
  const dir = path.dirname(KPI_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(KPI_FILE, JSON.stringify(kpi, null, 2), 'utf-8');
}

/** freee実績から年間KPI実績を算出 */
function calcActualKpi(months: MonthlySnapshot[], kpi: AnnualKpiTarget) {
  if (months.length === 0) {
    return { revenue: 0, profit: 0, margin: 0, equityRatio: 0, productivity: 0 };
  }
  const totalRevenue = months.reduce((s, m) => s + m.revenue, 0);
  const totalProfit = months.reduce((s, m) => s + m.operatingIncome, 0);
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const latest = months[months.length - 1];
  const equityRatio = latest.totalAssets > 0 ? (latest.netAssets / latest.totalAssets) * 100 : 0;
  const emp = kpi.employeeCount || 1;
  const productivity = totalRevenue / emp / 10000; // 万円/人
  return { revenue: totalRevenue, profit: totalProfit, margin, equityRatio, productivity };
}

/**
 * 事業計画AIエージェントページのHTMLを生成する
 */
export function renderPlanHTML(trend: TrendData, uploadedFiles: string[]): string {
  const targets = trend.targets;
  const kpi = loadAnnualKpi();
  const actual = calcActualKpi(trend.months, kpi);

  // ロカベンベンチマークデータを読み込み
  let locabenData = { categories: [], benchmarks: {} };
  try {
    const locabenPath = path.resolve('src/config/locaben-benchmarks.json');
    if (fs.existsSync(locabenPath)) {
      locabenData = JSON.parse(fs.readFileSync(locabenPath, 'utf-8'));
    }
  } catch { /* ignore */ }

  // シミュレーター用: freee実績データをJSONで埋め込み
  const simBaseMonths = trend.months.length > 0
    ? trend.months.slice(-12).map(m => ({
        month: `${m.month}月`,
        revenue: m.revenue,
        cogs: m.costOfSales,
        fixed: m.sgaExpenses,
        variable: 0,
        employees: kpi.employeeCount || 1,
        depreciation: 0,
        debt: 0,
        totalAssets: m.totalAssets,
        netAssets: m.netAssets,
      }))
    : null;

  const simKpiTarget = {
    targetRevenue: kpi.targetRevenue,
    targetProfit: kpi.targetProfit,
    targetMargin: kpi.targetMargin,
    targetEquityRatio: kpi.targetEquityRatio,
    targetProductivity: kpi.targetProductivity,
    employeeCount: kpi.employeeCount || 1,
    fiscalYear: kpi.fiscalYear,
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>事業計画AIエージェント</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script>
// freee実績データ（サーバーから注入）
var FREEE_BASE_DATA = ${JSON.stringify(simBaseMonths)};
var KPI_TARGET = ${JSON.stringify(simKpiTarget)};
var LOCABEN = ${JSON.stringify(locabenData)};
</script>
<style>${SHARED_CSS}${PLAN_CSS}</style>
</head>
<body>

${renderSidebar('plan')}

<div class="main">
  <header class="header">
    <button class="menu-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <div class="header-left">
      <h1 class="header-title">事業計画AIエージェント</h1>
    </div>
    <div class="header-right">
      <a href="/" class="btn-secondary">ダッシュボードへ戻る</a>
    </div>
  </header>

  <div class="content">

    <!-- Tab Navigation -->
    <div class="plan-tabs">
      <button class="plan-tab active" onclick="switchPlanTab('kpi')" id="tab-kpi">KPI目標・ギャップ分析</button>
      <button class="plan-tab" onclick="switchPlanTab('simulator')" id="tab-simulator">経営シミュレーター</button>
    </div>

    <!-- KPI Tab -->
    <div id="panel-kpi">

    <!-- Upload Section -->
    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <h3>事業計画書のアップロード</h3>
          <span class="card-sub">PDF / CSV</span>
        </div>
        <div class="card-body">
          <form id="uploadForm" action="/plan/upload" method="post" enctype="multipart/form-data">
            <div class="dropzone" id="dropzone">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <p class="dropzone-text">ファイルをドラッグ＆ドロップ</p>
              <p class="dropzone-sub">または</p>
              <label class="btn-upload">
                ファイルを選択
                <input type="file" name="file" accept=".pdf,.csv,.xlsx,.xls" hidden id="fileInput"/>
              </label>
              <p class="dropzone-hint">対応形式: PDF, CSV, Excel（AIが自動解析して目標に反映）</p>
            </div>
            <div id="filePreview" class="file-preview" style="display:none">
              <div class="file-preview-info">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2298ae" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span id="fileName"></span>
              </div>
              <button type="submit" class="btn-primary">アップロード</button>
            </div>
          </form>

${uploadedFiles.length > 0 ? `
          <div class="uploaded-list">
            <div class="uploaded-list-header">
              <h4>アップロード済みファイル（${uploadedFiles.length}件）</h4>
              <button class="btn-danger btn-sm" onclick="deleteAllFiles()">全て削除</button>
            </div>
${uploadedFiles.map(f => `
            <div class="uploaded-item" id="file-${esc(f).replace(/[^a-zA-Z0-9]/g, '_')}">
              <div class="uploaded-item-left">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2298ae" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <span>${esc(f)}</span>
              </div>
              <div class="uploaded-item-actions">
                <button class="btn-analyze-file" onclick="analyzeFile('${esc(f)}', this)" title="AI解析して目標に反映">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  解析
                </button>
                <button class="btn-delete-file" onclick="deleteFile('${esc(f)}')" title="削除">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>`).join('')}
          </div>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>AI分析ステータス</h3>
        </div>
        <div class="card-body">
          <div class="ai-status">
            <div class="ai-status-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></div>
            <div class="ai-status-text">
              <h4>事業計画AIエージェント</h4>
              <p>アップロードされた事業計画書・予算データをAIが分析し、月次目標を自動生成します。</p>
            </div>
          </div>
          <div class="ai-features">
            <div class="ai-feature">
              <div class="ai-feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></div>
              <div>
                <strong>PDF解析</strong>
                <p>事業計画書PDFから売上・利益目標を自動抽出</p>
              </div>
            </div>
            <div class="ai-feature">
              <div class="ai-feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></div>
              <div>
                <strong>CSV取込</strong>
                <p>予算CSVから月別目標を一括登録</p>
              </div>
            </div>
            <div class="ai-feature">
              <div class="ai-feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></div>
              <div>
                <strong>ギャップ分析</strong>
                <p>実績と目標の乖離を自動検出しアラート</p>
              </div>
            </div>
            <div class="ai-feature">
              <div class="ai-feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></div>
              <div>
                <strong>施策提案</strong>
                <p>目標未達時の改善施策をAIが提案（将来実装）</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- KPI Gap Analysis -->
    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <h3>年間KPI目標設定</h3>
          <button class="btn-primary btn-sm" onclick="saveKpi()">保存</button>
        </div>
        <div class="card-body">
          <form id="kpiForm">
            <div class="kpi-form-grid">
              <div class="kpi-field">
                <label>目標年度</label>
                <select id="kpiFiscalYear">
                  ${['2024年3月期','2025年3月期','2026年3月期','2027年3月期','2028年3月期'].map(y =>
                    `<option value="${y}" ${y === kpi.fiscalYear ? 'selected' : ''}>${y}</option>`
                  ).join('')}
                </select>
                <span class="kpi-hint">freee実績の対象期間</span>
              </div>
              <div class="kpi-field">
                <label>従業員数</label>
                <input type="number" id="kpiEmployeeCount" value="${kpi.employeeCount || 1}" min="1">
                <span class="kpi-hint">労働生産性の算出に使用</span>
              </div>
            </div>
            <div class="kpi-form-grid">
              <div class="kpi-field">
                <label>目標売上高（円）</label>
                <input type="number" id="kpiRevenue" value="${kpi.targetRevenue}">
                <span class="kpi-hint">現状: ${fmtOku(actual.revenue)}</span>
              </div>
              <div class="kpi-field">
                <label>目標営業利益（円）</label>
                <input type="number" id="kpiProfit" value="${kpi.targetProfit}">
                <span class="kpi-hint">現状: ${fmtMan(actual.profit)}</span>
              </div>
            </div>
            <div class="kpi-form-grid">
              <div class="kpi-field">
                <label>目標営業利益率（%）</label>
                <input type="number" step="0.1" id="kpiMargin" value="${kpi.targetMargin}">
                <span class="kpi-hint">現状: ${actual.margin.toFixed(1)}%</span>
              </div>
              <div class="kpi-field">
                <label>目標自己資本比率（%）</label>
                <input type="number" step="0.1" id="kpiEquity" value="${kpi.targetEquityRatio}">
                <span class="kpi-hint">現状: ${actual.equityRatio.toFixed(1)}%</span>
              </div>
            </div>
            <div class="kpi-form-grid">
              <div class="kpi-field" style="grid-column:1/-1">
                <label>目標労働生産性（万円/人）</label>
                <input type="number" step="0.1" id="kpiProductivity" value="${kpi.targetProductivity}">
                <span class="kpi-hint">現状: ${actual.productivity.toFixed(1)}万円/人</span>
              </div>
            </div>

            <!-- カスタムKPI -->
            <div class="custom-kpi-section">
              <div class="custom-kpi-header">
                <h4>カスタムKPI</h4>
                <button type="button" class="btn-secondary btn-sm" onclick="addCustomKpi()">＋ 追加</button>
              </div>
              <div id="customKpiList">
${(kpi.customKpis || []).map((ck, i) => `
                <div class="custom-kpi-row" data-idx="${i}">
                  <input type="text" class="ck-name" placeholder="KPI名（例: アポ数）" value="${esc(ck.name)}">
                  <input type="number" class="ck-target" placeholder="目標" value="${ck.target}" step="any">
                  <input type="number" class="ck-actual" placeholder="実績" value="${ck.actual}" step="any">
                  <select class="ck-unit">
                    <option value="円" ${ck.unit === '円' ? 'selected' : ''}>円</option>
                    <option value="万円" ${ck.unit === '万円' ? 'selected' : ''}>万円</option>
                    <option value="%" ${ck.unit === '%' ? 'selected' : ''}>%</option>
                    <option value="件" ${ck.unit === '件' ? 'selected' : ''}>件</option>
                    <option value="人" ${ck.unit === '人' ? 'selected' : ''}>人</option>
                    <option value="pt" ${ck.unit === 'pt' ? 'selected' : ''}>pt</option>
                  </select>
                  <select class="ck-scope">
                    <option value="annual" ${(ck.scope || 'annual') === 'annual' ? 'selected' : ''}>年間</option>
                    <option value="monthly" ${ck.scope === 'monthly' ? 'selected' : ''}>月次</option>
                  </select>
                  <button type="button" class="btn-delete-file" onclick="removeCustomKpi(this)" title="削除">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>`).join('')}
              </div>
            </div>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>ギャップ分析</h3>
          <span class="card-sub">freee実績 vs KPI目標</span>
        </div>
        <div class="card-body">
          ${renderGapItem('売上高', actual.revenue, kpi.targetRevenue, fmtOku, (g) => (g >= 0 ? '+' : '') + fmtOku(g), false)}
          ${renderGapItem('営業利益', actual.profit, kpi.targetProfit, fmtMan, (g) => (g >= 0 ? '+' : '') + fmtMan(g), false)}
          ${renderGapItem('営業利益率', actual.margin, kpi.targetMargin, (v) => v.toFixed(1) + '%', (g) => (g >= 0 ? '+' : '') + g.toFixed(1) + 'pt', true)}
          ${renderGapItem('自己資本比率', actual.equityRatio, kpi.targetEquityRatio, (v) => v.toFixed(1) + '%', (g) => (g >= 0 ? '+' : '') + g.toFixed(1) + 'pt', true)}
          ${renderGapItem('労働生産性', actual.productivity, kpi.targetProductivity, (v) => v.toFixed(0) + '万/人', (g) => (g >= 0 ? '+' : '') + g.toFixed(0) + '万', true)}
${(kpi.customKpis || []).filter(ck => (ck.scope || 'annual') === 'annual').map(ck => {
  const fmtVal = (v: number) => v.toLocaleString() + ck.unit;
  const fmtGap = (g: number) => (g >= 0 ? '+' : '') + g.toLocaleString() + ck.unit;
  return renderGapItem(ck.name, ck.actual, ck.target, fmtVal, fmtGap, true);
}).join('')}
        </div>
      </div>
    </div>

    <!-- Target Table -->
    <div class="card">
      <div class="card-header">
        <h3>月次目標設定</h3>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="periodFilter" onchange="filterPeriod()" class="period-select">
            <option value="all">全期間</option>
            <option value="6">直近6ヶ月</option>
            <option value="12" selected>12ヶ月</option>
            <option value="future">未来のみ</option>
            <option value="past">過去のみ</option>
          </select>
          <button class="btn-danger btn-sm" onclick="clearAllMonthlyTargets()">全クリア</button>
          <button class="btn-primary btn-sm" onclick="saveMonthlyTargets()">月次目標を保存</button>
        </div>
      </div>
      <div class="card-body">
        <div class="table-wrap">
          <table class="target-table" id="targetTable">
            <thead>
              <tr>
                <th>年月</th>
                <th>売上目標</th>
                <th>売上実績</th>
                <th>達成率</th>
                <th>粗利目標</th>
                <th>粗利実績</th>
                <th>達成率</th>
                <th>経常利益目標</th>
                <th>経常利益実績</th>
                <th>達成率</th>
${(kpi.customKpis || []).filter(ck => ck.scope === 'monthly').map(ck =>
  `                <th>${esc(ck.name)}目標</th><th>${esc(ck.name)}実績</th>`
).join('\n')}
                <th style="width:40px"></th>
              </tr>
            </thead>
            <tbody>
${(() => {
  // freee実績月 + 向こう12ヶ月の統合リスト作成
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // 全月リスト生成（実績の最古月 〜 現在+12ヶ月）
  const allMonths: { year: number; month: number }[] = [];

  // 実績月を追加
  for (const m of trend.months) {
    if (!allMonths.find(x => x.year === m.year && x.month === m.month)) {
      allMonths.push({ year: m.year, month: m.month });
    }
  }

  // 現在月から向こう12ヶ月を追加
  for (let i = 0; i < 12; i++) {
    let y = currentYear;
    let m = currentMonth + i;
    while (m > 12) { m -= 12; y++; }
    if (!allMonths.find(x => x.year === y && x.month === m)) {
      allMonths.push({ year: y, month: m });
    }
  }

  // ソート
  allMonths.sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month));

  return allMonths.map((slot) => {
    const m = trend.months.find(x => x.year === slot.year && x.month === slot.month);
    const t = targets.find(tgt => tgt.year === slot.year && tgt.month === slot.month);
    const tRev = t ? t.revenue : 0;
    const tGP = t ? t.grossProfit : 0;
    const tOI = t ? t.ordinaryIncome : 0;
    const hasActual = !!m;
    const aRev = m ? m.revenue : 0;
    const aGP = m ? m.grossProfit : 0;
    const aOI = m ? m.ordinaryIncome : 0;
    const revRate = tRev > 0 && hasActual ? (aRev / tRev * 100) : 0;
    const gpRate = tGP > 0 && hasActual ? (aGP / tGP * 100) : 0;
    const oiRate = tOI > 0 && hasActual ? (aOI / tOI * 100) : 0;
    const isFuture = slot.year > currentYear || (slot.year === currentYear && slot.month > currentMonth);
    const isPast = !isFuture;

    return `              <tr data-year="${slot.year}" data-month="${slot.month}" data-future="${isFuture ? '1' : '0'}" data-past="${isPast ? '1' : '0'}" class="${isFuture ? 'future-row' : ''}">
                <td class="month-cell">${slot.year}年${slot.month}月${isFuture ? ' <span class="future-badge">予定</span>' : ''}</td>
                <td class="num"><input type="number" class="mt-input" data-field="revenue" value="${tRev || ''}" placeholder="0"></td>
                <td class="num actual">${hasActual ? fmtNum(aRev) : '<span class="no-data">—</span>'}</td>
                <td class="num ${tRev > 0 && hasActual ? rateClass(revRate) : ''}">${tRev > 0 && hasActual ? revRate.toFixed(1) + '%' : '—'}</td>
                <td class="num"><input type="number" class="mt-input" data-field="grossProfit" value="${tGP || ''}" placeholder="0"></td>
                <td class="num actual">${hasActual ? fmtNum(aGP) : '<span class="no-data">—</span>'}</td>
                <td class="num ${tGP > 0 && hasActual ? rateClass(gpRate) : ''}">${tGP > 0 && hasActual ? gpRate.toFixed(1) + '%' : '—'}</td>
                <td class="num"><input type="number" class="mt-input" data-field="ordinaryIncome" value="${tOI || ''}" placeholder="0"></td>
                <td class="num actual">${hasActual ? fmtNum(aOI) : '<span class="no-data">—</span>'}</td>
                <td class="num ${tOI > 0 && hasActual ? rateClass(oiRate) : ''}">${tOI > 0 && hasActual ? oiRate.toFixed(1) + '%' : '—'}</td>
${(kpi.customKpis || []).filter(ck => ck.scope === 'monthly').map(ck =>
  `                <td class="num"><input type="number" class="mt-input mt-custom" data-field="custom_${ck.id}" value="" placeholder="0" step="any"></td>
                <td class="num actual"><span class="no-data">—</span></td>`
).join('\n')}
                <td class="num"><button class="btn-clear-row" onclick="clearRow(this)" title="この行の目標をクリア">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button></td>
              </tr>`;
  }).join('\n');
})()}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Gap Chart -->
    <div class="card">
      <div class="card-header">
        <h3>目標 vs 実績（売上高）</h3>
        <span class="card-sub">ギャップ可視化</span>
      </div>
      <div class="card-chart card-chart--tall"><canvas id="gapChart"></canvas></div>
    </div>

    </div><!-- /panel-kpi -->

    <!-- Simulator Tab -->
    <div id="panel-simulator" style="display:none">

      <!-- ベースデータ切替 -->
      <div class="sim-source-bar">
        <div class="sim-mode-toggle">
          <button class="sim-mode-btn active" id="mode-actual" onclick="switchSimMode('actual')">実績ベース</button>
          <button class="sim-mode-btn" id="mode-plan" onclick="switchSimMode('plan')">計画ベース</button>
        </div>
        <div>
          <span class="sim-source-label">データ:</span>
          <span id="simDataSource">---</span>
        </div>
        <div>
          <span class="sim-source-label">KPI目標年度:</span>
          <span style="font-weight:600">${esc(kpi.fiscalYear)}</span>
        </div>
      </div>

      <!-- KPIカード -->
      <div class="sim-kpi-grid">
        <div class="sim-kpi-card" id="kpi-revenue">
          <div class="sim-kpi-label">年間売上高</div>
          <div class="sim-kpi-value">---</div>
          <div class="sim-kpi-diff">---</div>
        </div>
        <div class="sim-kpi-card" id="kpi-profit">
          <div class="sim-kpi-label">年間営業利益</div>
          <div class="sim-kpi-value">---</div>
          <div class="sim-kpi-diff">---</div>
        </div>
        <div class="sim-kpi-card" id="kpi-margin">
          <div class="sim-kpi-label">営業利益率</div>
          <div class="sim-kpi-value">---</div>
          <div class="sim-kpi-diff">---</div>
        </div>
        <div class="sim-kpi-card" id="kpi-cf">
          <div class="sim-kpi-label">キャッシュフロー</div>
          <div class="sim-kpi-value">---</div>
          <div class="sim-kpi-diff">---</div>
        </div>
      </div>

      <div class="grid-sim">
        <!-- スライダーパネル -->
        <div class="card">
          <div class="card-header">
            <h3>シナリオ調整</h3>
            <button class="btn-secondary btn-sm" onclick="resetSimParams()">リセット</button>
          </div>
          <div class="card-body">
            <div class="sim-slider">
              <div class="sim-slider-header"><span>売上成長率</span><span class="sim-slider-val" id="val-revenueGrowth">0</span><span>%</span></div>
              <input type="range" id="sl-revenueGrowth" min="-30" max="50" step="1" value="0" oninput="updateSimParam('revenueGrowth',this.value)">
              <div class="sim-slider-range"><span>-30%</span><span>+50%</span></div>
            </div>
            <div class="sim-slider">
              <div class="sim-slider-header"><span>原価率</span><span class="sim-slider-val" id="val-cogsRatio">45</span><span>%</span></div>
              <input type="range" id="sl-cogsRatio" min="10" max="80" step="1" value="45" oninput="updateSimParam('cogsRatio',this.value)">
              <div class="sim-slider-range"><span>10%</span><span>80%</span></div>
            </div>
            <div class="sim-slider">
              <div class="sim-slider-header"><span>固定費増減</span><span class="sim-slider-val" id="val-fixedCostChange">0</span><span>%</span></div>
              <input type="range" id="sl-fixedCostChange" min="-30" max="30" step="1" value="0" oninput="updateSimParam('fixedCostChange',this.value)">
              <div class="sim-slider-range"><span>-30%</span><span>+30%</span></div>
            </div>
            <div class="sim-slider">
              <div class="sim-slider-header"><span>人員増減</span><span class="sim-slider-val" id="val-employeeChange">0</span><span>人</span></div>
              <input type="range" id="sl-employeeChange" min="-3" max="10" step="1" value="0" oninput="updateSimParam('employeeChange',this.value)">
              <div class="sim-slider-range"><span>-3人</span><span>+10人</span></div>
            </div>
            <div class="sim-slider">
              <div class="sim-slider-header"><span>新規設備投資</span><span class="sim-slider-val" id="val-investment">0</span><span>万</span></div>
              <input type="range" id="sl-investment" min="0" max="3000" step="50" value="0" oninput="updateSimParam('investment',this.value)">
              <div class="sim-slider-range"><span>0万</span><span>3000万</span></div>
            </div>
            <div class="sim-slider">
              <div class="sim-slider-header"><span>年間借入返済</span><span class="sim-slider-val" id="val-repayment">0</span><span>万</span></div>
              <input type="range" id="sl-repayment" min="0" max="500" step="10" value="0" oninput="updateSimParam('repayment',this.value)">
              <div class="sim-slider-range"><span>0万</span><span>500万</span></div>
            </div>
          </div>
        </div>

        <!-- グラフ -->
        <div class="card">
          <div class="card-header"><h3>売上・利益シミュレーション</h3></div>
          <div class="card-body">
            <canvas id="simChart" height="280"></canvas>
          </div>
        </div>
      </div>

      <!-- 月次明細テーブル -->
      <div class="card" style="margin-top:20px">
        <div class="card-header"><h3>月次シミュレーション明細</h3></div>
        <div class="card-body" style="overflow-x:auto">
          <table class="target-table">
            <thead>
              <tr>
                <th>月</th><th>売上</th><th>原価</th><th>粗利</th><th>固定費</th><th>営業利益</th><th>利益率</th><th>CF</th>
              </tr>
            </thead>
            <tbody id="simTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- ロカベン6指標比較 -->
      <div class="card" style="margin-top:20px">
        <div class="card-header">
          <h3>ロカベン6指標 - 業種別ベンチマーク比較</h3>
        </div>
        <div class="card-body">
          <div class="locaben-select-row">
            <div class="kpi-field">
              <label>業種（大分類）</label>
              <select id="locaMajor" onchange="updateLocaMinor()">
                <option value="">-- 業種を選択 --</option>
              </select>
            </div>
            <div class="kpi-field">
              <label>業種（小分類）</label>
              <select id="locaMinor" onchange="updateLocaBenchmark()">
                <option value="">-- 小分類を選択 --</option>
              </select>
            </div>
            <div class="kpi-field">
              <label>事業規模</label>
              <select id="locaScale" onchange="updateLocaBenchmark()">
                <option value="中規模事業者">中規模事業者</option>
                <option value="小規模事業者">小規模事業者</option>
              </select>
            </div>
          </div>
          <div id="locabenResult" style="margin-top:16px"></div>
        </div>
      </div>

      <!-- 銀行格付シミュレーション -->
      <div class="card" style="margin-top:20px">
        <div class="card-header">
          <h3>銀行格付シミュレーション（129点満点）</h3>
          <span class="card-sub">財務分析AI 評価基準</span>
        </div>
        <div class="card-body">
          <div id="bankRatingResult">
            <p style="color:var(--text2);font-size:13px">シミュレーション結果から銀行格付を簡易算出します。スライダーを調整すると自動更新されます。</p>
          </div>
        </div>
      </div>

      <!-- 計画に反映ボタン -->
      <div class="sim-apply-bar">
        <div class="sim-apply-info">
          <strong>シミュレーション結果をKPI目標に反映</strong>
          <p>シミュレーションの年間数値を事業計画のKPI目標に上書きします</p>
        </div>
        <button class="btn-primary" onclick="applySimToKpi()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          計画に反映する
        </button>
      </div>

    </div><!-- /panel-simulator -->

  </div>
</div>

<script>
Chart.defaults.font.family = "-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN',sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = '#8a8f98';

var fmt = function(v){return new Intl.NumberFormat('ja-JP').format(v)+'円'};
var fmtM = function(v){return (v/10000).toFixed(0)+'万'};

// Gap Bar Chart（全月ベース）
var chartData = (function(){
  var now = new Date();
  var cy = now.getFullYear(), cm = now.getMonth()+1;
  var actuals = ${JSON.stringify(trend.months.map(m => ({ y: m.year, m: m.month, rev: m.revenue })))};
  var tgts = ${JSON.stringify(targets.map(t => ({ y: t.year, m: t.month, rev: t.revenue })))};
  var all = [];
  actuals.forEach(function(a){ all.push({y:a.y,m:a.m}); });
  for(var i=0;i<12;i++){
    var fy=cy,fm=cm+i;
    while(fm>12){fm-=12;fy++;}
    if(!all.find(function(x){return x.y===fy&&x.m===fm})) all.push({y:fy,m:fm});
  }
  all.sort(function(a,b){return a.y*100+a.m-(b.y*100+b.m)});
  var labels=[],aRevs=[],tRevs=[];
  all.forEach(function(s){
    labels.push(s.m+'月');
    var a=actuals.find(function(x){return x.y===s.y&&x.m===s.m});
    var t=tgts.find(function(x){return x.y===s.y&&x.m===s.m});
    aRevs.push(a?a.rev:0);
    tRevs.push(t?t.rev:0);
  });
  return {labels:labels,actuals:aRevs,targets:tRevs};
})();
var months = chartData.labels;
var actualRev = chartData.actuals;
var targetRev = chartData.targets;
var gaps = actualRev.map(function(a,i){return a - targetRev[i]});

new Chart(document.getElementById('gapChart'),{
  type:'bar',
  data:{
    labels:months,
    datasets:[
      {label:'目標',data:targetRev,backgroundColor:'rgba(99,102,241,0.15)',borderColor:'#2298ae',borderWidth:1.5,borderDash:[4,4],borderRadius:4,borderSkipped:false,order:2},
      {label:'実績',data:actualRev,backgroundColor:'rgba(99,102,241,0.7)',borderRadius:4,borderSkipped:false,order:1},
      {label:'ギャップ',data:gaps,type:'line',borderColor:gaps.map(function(g){return g>=0?'#2298ae':'#ef4444'}),backgroundColor:'transparent',pointBackgroundColor:gaps.map(function(g){return g>=0?'#2298ae':'#ef4444'}),pointRadius:6,pointHoverRadius:8,borderWidth:0,order:0}
    ]
  },
  options:{
    responsive:true,maintainAspectRatio:false,
    interaction:{mode:'index',intersect:false},
    plugins:{
      tooltip:{callbacks:{
        label:function(c){
          if(c.dataset.label==='ギャップ'){
            var v=c.raw;
            return (v>=0?'＋':'')+ new Intl.NumberFormat('ja-JP').format(v)+'円';
          }
          return c.dataset.label+': '+fmt(c.raw);
        }
      }},
      legend:{position:'top'}
    },
    scales:{
      y:{beginAtZero:true,grid:{color:'#f1f1f4'},ticks:{callback:fmtM}},
      x:{grid:{display:false}}
    }
  }
});

// Drag & Drop
var dz=document.getElementById('dropzone');
var fi=document.getElementById('fileInput');
var fp=document.getElementById('filePreview');
var fn=document.getElementById('fileName');

['dragenter','dragover'].forEach(function(e){
  dz.addEventListener(e,function(ev){ev.preventDefault();dz.classList.add('dragover')});
});
['dragleave','drop'].forEach(function(e){
  dz.addEventListener(e,function(ev){ev.preventDefault();dz.classList.remove('dragover')});
});
dz.addEventListener('drop',function(e){
  var files=e.dataTransfer.files;
  if(files.length>0){fi.files=files;showPreview(files[0].name)}
});
fi.addEventListener('change',function(){
  if(fi.files.length>0) showPreview(fi.files[0].name);
});
function showPreview(name){
  fn.textContent=name;
  fp.style.display='flex';
  dz.style.display='none';
}

// 期間フィルター
function filterPeriod(){
  var val=document.getElementById('periodFilter').value;
  var rows=document.querySelectorAll('#targetTable tbody tr');
  var now=new Date();
  var cy=now.getFullYear(),cm=now.getMonth()+1;
  var shown=0;
  rows.forEach(function(row){
    var y=Number(row.getAttribute('data-year'));
    var m=Number(row.getAttribute('data-month'));
    var ym=y*100+m;
    var curYm=cy*100+cm;
    var show=true;
    if(val==='6'){
      var from=cm-5,fy=cy;
      while(from<1){from+=12;fy--;}
      show=ym>=fy*100+from && ym<=curYm+12*100;
      var count=0;
      rows.forEach(function(r2){
        var y2=Number(r2.getAttribute('data-year')),m2=Number(r2.getAttribute('data-month'));
        if(y2*100+m2>=fy*100+from) count++;
      });
      show=ym>=fy*100+from;
      // 直近6ヶ月 = 過去5+当月
      show=(ym>=curYm-5 || (y===cy-1 && ym>=((cy-1)*100+(cm+7))));
      // simplify: just count from current-5
      var startM=cm-5,startY=cy;
      while(startM<1){startM+=12;startY--;}
      show=ym>=startY*100+startM && ym<=curYm;
    } else if(val==='12'){
      show=true; // show all (already 12+ months)
    } else if(val==='future'){
      show=ym>curYm;
    } else if(val==='past'){
      show=ym<=curYm;
    }
    row.style.display=show?'':'none';
  });
}
// 初期フィルター適用
setTimeout(filterPeriod,100);

// 行の目標クリア
function clearRow(btn){
  var row=btn.closest('tr');
  row.querySelectorAll('.mt-input').forEach(function(inp){inp.value='';});
}
// 全月次目標クリア
function clearAllMonthlyTargets(){
  if(!confirm('全ての月次目標をクリアしますか？')) return;
  document.querySelectorAll('#targetTable tbody .mt-input').forEach(function(inp){inp.value='';});
  // サーバーからも削除
  fetch('/api/plan/targets/clear',{method:'POST'})
    .then(function(r){return r.json()})
    .then(function(){location.reload()})
    .catch(function(){});
}
// 月次目標保存
function saveMonthlyTargets(){
  var rows=document.querySelectorAll('#targetTable tbody tr');
  var targets=[];
  rows.forEach(function(row){
    var y=Number(row.getAttribute('data-year'));
    var m=Number(row.getAttribute('data-month'));
    var inputs=row.querySelectorAll('.mt-input');
    var rev=Number(inputs[0].value)||0;
    var gp=Number(inputs[1].value)||0;
    var oi=Number(inputs[2].value)||0;
    if(rev||gp||oi) targets.push({year:y,month:m,revenue:rev,grossProfit:gp,ordinaryIncome:oi});
  });
  fetch('/api/plan/targets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({targets:targets})})
    .then(function(r){return r.json()})
    .then(function(){location.reload()})
    .catch(function(){alert('保存に失敗しました')});
}
// カスタムKPI
function addCustomKpi(){
  var list=document.getElementById('customKpiList');
  var div=document.createElement('div');
  div.className='custom-kpi-row';
  div.innerHTML='<input type="text" class="ck-name" placeholder="KPI名（例: アポ数）">'
    +'<input type="number" class="ck-target" placeholder="目標" step="any">'
    +'<input type="number" class="ck-actual" placeholder="実績" step="any">'
    +'<select class="ck-unit"><option value="円">円</option><option value="万円">万円</option><option value="%">%</option><option value="件">件</option><option value="人">人</option><option value="pt">pt</option></select>'
    +'<select class="ck-scope"><option value="annual">年間</option><option value="monthly">月次</option></select>'
    +'<button type="button" class="btn-delete-file" onclick="removeCustomKpi(this)" title="削除"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
  list.appendChild(div);
}
function removeCustomKpi(btn){
  btn.closest('.custom-kpi-row').remove();
}
function analyzeFile(name, btn){
  btn.disabled=true;
  btn.textContent='解析中...';
  fetch('/plan/analyze-file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:name})})
    .then(function(r){return r.json()})
    .then(function(d){
      if(d.ok){
        var msg='解析完了！\\n月次目標: '+d.monthlyCount+'件\\n年間KPI: '+(d.hasAnnualKpi?'反映済':'なし');
        if(d.customKpiCount>0) msg+='\\nカスタムKPI: '+d.customKpiCount+'件（'+d.customKpiNames.join('、')+'）';
        msg+='\\n確信度: '+d.confidence;
        if(d.notes&&d.notes.length>0) msg+='\\n\\n注意: '+d.notes.join(', ');
        alert(msg);
        location.reload();
      } else {
        alert('解析失敗: '+(d.error||'不明なエラー'));
        btn.disabled=false;
        btn.textContent='解析';
      }
    })
    .catch(function(e){alert('エラー: '+e.message);btn.disabled=false;btn.textContent='解析';});
}
function deleteFile(name){
  if(!confirm(name+' を削除しますか？')) return;
  fetch('/plan/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:name})})
    .then(function(r){if(r.ok) location.reload(); else alert('削除に失敗しました');})
    .catch(function(){alert('削除に失敗しました');});
}
function deleteAllFiles(){
  if(!confirm('全てのアップロード済みファイルを削除しますか？')) return;
  fetch('/plan/delete-all',{method:'POST'})
    .then(function(r){if(r.ok) location.reload(); else alert('削除に失敗しました');})
    .catch(function(){alert('削除に失敗しました');});
}
// --- Tab switching ---
function switchPlanTab(tab){
  document.getElementById('panel-kpi').style.display = tab==='kpi' ? '' : 'none';
  document.getElementById('panel-simulator').style.display = tab==='simulator' ? '' : 'none';
  document.getElementById('tab-kpi').classList.toggle('active', tab==='kpi');
  document.getElementById('tab-simulator').classList.toggle('active', tab==='simulator');
  if(tab==='simulator'){
    initSimulator();
    // display:noneから表示に切り替わった後にリサイズ
    setTimeout(function(){ if(simChart) simChart.resize(); }, 50);
  }
}

// --- Simulator mode switch ---
function switchSimMode(mode){
  simMode = mode;
  document.getElementById('mode-actual').classList.toggle('active', mode==='actual');
  document.getElementById('mode-plan').classList.toggle('active', mode==='plan');

  if(mode === 'plan' && planBaseData.length > 0){
    baseData = planBaseData;
    document.getElementById('simDataSource').textContent = 'KPI計画データ（' + KPI_TARGET.fiscalYear + '）';
    document.getElementById('simDataSource').style.color = '#3b82f6';
  } else if(mode === 'plan' && planBaseData.length === 0){
    alert('KPI目標が未設定です。先にKPI目標タブで目標を設定してください。');
    switchSimMode('actual');
    return;
  } else {
    baseData = actualBaseData;
    if(FREEE_BASE_DATA && FREEE_BASE_DATA.length > 0){
      document.getElementById('simDataSource').textContent = 'freee実績データ（直近12ヶ月）';
      document.getElementById('simDataSource').style.color = '#10b981';
    } else {
      document.getElementById('simDataSource').textContent = 'デモデータ（freee未連携）';
      document.getElementById('simDataSource').style.color = '#f59e0b';
    }
  }

  // 原価率をベースデータから再計算
  var tRev = baseData.reduce(function(s,d){return s+(d.revenue||0)},0);
  var tCogs = baseData.reduce(function(s,d){return s+(d.cogs||0)},0);
  var cRatio = (tRev > 0 && tCogs > 0) ? Math.round(tCogs/tRev*100) : 0;
  simParams.cogsRatio = cRatio;
  document.getElementById('sl-cogsRatio').value = cRatio;
  document.getElementById('val-cogsRatio').textContent = cRatio;

  runSimulation();
}

// --- Simulator ---
var simInitialized = false;
var simChart = null;
var simParams = { revenueGrowth:0, cogsRatio:45, fixedCostChange:0, employeeChange:0, investment:0, repayment:0 };
var baseData = [];
var actualBaseData = [];  // freee実績ベース
var planBaseData = [];    // KPI計画ベース
var simMode = 'actual';   // 'actual' or 'plan'

function initSimulator(){
  if(simInitialized) return;
  simInitialized = true;

  // ===== 実績ベースデータ準備 =====
  if(FREEE_BASE_DATA && FREEE_BASE_DATA.length > 0){
    actualBaseData = FREEE_BASE_DATA;
  } else {
    // デモデータ
    var baseRevenue = 5000000;
    var season = [0.85,0.90,1.20,0.95,0.90,1.00,0.95,0.85,1.05,1.10,1.15,1.10];
    for(var i=0;i<12;i++){
      var rev = Math.round(baseRevenue * season[i]);
      actualBaseData.push({ month:(i+1)+'月', revenue:rev, cogs:Math.round(rev*0.45), fixed:1800000, variable:Math.round(rev*0.10), employees:5, depreciation:150000, debt:10000000, totalAssets:30000000, netAssets:12000000 });
    }
  }

  // ===== 計画ベースデータ準備（KPI目標を月次按分） =====
  if(KPI_TARGET && KPI_TARGET.targetRevenue > 0){
    var monthlyRev = Math.round(KPI_TARGET.targetRevenue / 12);
    var monthlyProfit = Math.round(KPI_TARGET.targetProfit / 12);
    // 利益から逆算: 売上 - 原価 - 固定費 = 利益 → 固定費 = 売上 - 原価 - 利益
    var planMargin = KPI_TARGET.targetMargin || 0;
    // 実績の原価率を参考にする
    var actTotalRev = actualBaseData.reduce(function(s,d){return s+(d.revenue||0)},0);
    var actTotalCogs = actualBaseData.reduce(function(s,d){return s+(d.cogs||0)},0);
    var refCogsRatio = (actTotalRev > 0 && actTotalCogs > 0) ? actTotalCogs/actTotalRev : 0;
    var planCogs = Math.round(monthlyRev * refCogsRatio);
    var planFixed = monthlyRev - planCogs - monthlyProfit;
    if(planFixed < 0) planFixed = 0;

    planBaseData = [];
    for(var i=0;i<12;i++){
      planBaseData.push({
        month:(i+1)+'月',
        revenue: monthlyRev,
        cogs: planCogs,
        fixed: planFixed,
        variable: 0,
        employees: KPI_TARGET.employeeCount || 1,
        depreciation: 0,
        debt: 0,
        totalAssets: 0,
        netAssets: 0,
      });
    }
  }

  // ロカベン業種プルダウン初期化
  initLocaben();

  // 初期モードは実績ベース
  switchSimMode('actual');

  // Chart.js 初期化
  var ctx = document.getElementById('simChart').getContext('2d');
  simChart = new Chart(ctx, {
    type:'bar',
    data:{
      labels: baseData.map(function(d){return d.month}),
      datasets:[
        { label:'現状 売上', data:[], backgroundColor:'rgba(156,163,175,0.3)', order:2 },
        { label:'シミュ 売上', data:[], backgroundColor:'rgba(59,130,246,0.5)', order:2 },
        { label:'現状 利益', data:[], type:'line', borderColor:'#9ca3af', borderDash:[4,4], pointRadius:2, fill:false, order:1 },
        { label:'シミュ 利益', data:[], type:'line', borderColor:'#10b981', borderWidth:2, pointRadius:3, fill:false, order:1 }
      ]
    },
    options:{
      responsive:true,
      plugins:{
        legend:{position:'top',labels:{font:{size:11}}},
        tooltip:{callbacks:{label:function(ctx){return ctx.dataset.label+': '+Math.round(ctx.raw).toLocaleString()+'万'}}}
      },
      scales:{
        y:{ticks:{callback:function(v){return v+'万'}}}
      }
    }
  });

  runSimulation();
}

// グローバルユーティリティ
function fMan(n){ if(isNaN(n)||n===null||n===undefined) n=0; return Math.round(n/10000).toLocaleString()+'万'; }

function runSimulation(){
  try {
  var results = [];
  var baseResults = [];
  for(var i=0;i<baseData.length;i++){
    var b = baseData[i];
    var bRev = b.revenue || 0;
    var bCogs = b.cogs || 0;
    var bFixed = b.fixed || 0;
    var bVar = b.variable || 0;
    var bDepr = b.depreciation || 0;

    // ベース利益 = 売上 - 原価 - 固定費(販管費) - 変動費 - 減価償却
    var bProfit = bRev - bCogs - bFixed - bVar - bDepr;
    baseResults.push({ revenue:bRev, profit:bProfit, cf:bProfit+bDepr });

    // シミュレーション
    var rev = Math.round(bRev * (1 + simParams.revenueGrowth/100));
    var cogs = Math.round(rev * simParams.cogsRatio/100);
    var fixed = Math.round(bFixed * (1 + simParams.fixedCostChange/100));
    var varRatio = (bRev > 0 && bVar > 0) ? (bVar / bRev) : 0;
    var varCost = Math.round(rev * varRatio);
    var emp = Math.max(1, (b.employees || 1) + simParams.employeeChange);
    var addDepr = Math.round(simParams.investment * 10000 / 60);
    var depr = bDepr + addDepr;
    var gross = rev - cogs;
    var profit = gross - fixed - varCost - depr;
    var monthlyRepay = Math.round(simParams.repayment * 10000 / 12);
    var cf = profit + depr - monthlyRepay;
    var margin = rev > 0 ? (profit/rev*100) : 0;
    if(isNaN(margin)) margin = 0;
    results.push({ month:b.month, revenue:rev, cogs:cogs, gross:gross, fixed:fixed, varCost:varCost, profit:profit, margin:margin, cf:cf, emp:emp, repayment:monthlyRepay });
  }

  // KPIカード更新
  var totalRevBase = baseResults.reduce(function(s,r){return s+r.revenue},0);
  var totalRevSim = results.reduce(function(s,r){return s+r.revenue},0);
  var totalProfBase = baseResults.reduce(function(s,r){return s+r.profit},0);
  var totalProfSim = results.reduce(function(s,r){return s+r.profit},0);
  var avgMarginSim = totalRevSim>0 ? (totalProfSim/totalRevSim*100) : 0;
  var totalCfSim = results.reduce(function(s,r){return s+r.cf},0);

  function setKpi(id,val,diff){
    var el=document.getElementById(id);
    if(!el) return;
    el.querySelector('.sim-kpi-value').textContent=val;
    var d=el.querySelector('.sim-kpi-diff');
    d.textContent=diff;
    d.style.color=(typeof diff==='string' && diff.startsWith('-'))?'#ef4444':'#10b981';
  }
  setKpi('kpi-revenue', fMan(totalRevSim), (totalRevSim>=totalRevBase?'+':'')+fMan(totalRevSim-totalRevBase));
  setKpi('kpi-profit', fMan(totalProfSim), (totalProfSim>=totalProfBase?'+':'')+fMan(totalProfSim-totalProfBase));
  setKpi('kpi-margin', avgMarginSim.toFixed(1)+'%', (avgMarginSim>=0?'+':'')+avgMarginSim.toFixed(1)+'%');
  setKpi('kpi-cf', fMan(totalCfSim), '年間CF');

  // グラフ更新
  if(simChart){
    simChart.data.datasets[0].data = baseResults.map(function(r){return Math.round(r.revenue/10000)});
    simChart.data.datasets[1].data = results.map(function(r){return Math.round(r.revenue/10000)});
    simChart.data.datasets[2].data = baseResults.map(function(r){return Math.round(r.profit/10000)});
    simChart.data.datasets[3].data = results.map(function(r){return Math.round(r.profit/10000)});
    simChart.update();
  }

  // テーブル更新
  var tbody = document.getElementById('simTableBody');
  if(tbody){
    var html = '';
    for(var i=0;i<results.length;i++){
      var r = results[i];
      var mc = r.profit>=0 ? 'color:#10b981' : 'color:#ef4444';
      html += '<tr><td style="font-weight:600">'+r.month+'</td><td style="text-align:right">'+fMan(r.revenue)+'</td><td style="text-align:right;color:#9ca3af">'+fMan(r.cogs)+'</td><td style="text-align:right">'+fMan(r.gross)+'</td><td style="text-align:right;color:#9ca3af">'+fMan(r.fixed)+'</td><td style="text-align:right;font-weight:600;'+mc+'">'+fMan(r.profit)+'</td><td style="text-align:right;'+mc+'">'+r.margin.toFixed(1)+'%</td><td style="text-align:right;color:#3b82f6">'+fMan(r.cf)+'</td></tr>';
    }
    // 合計行
    html += '<tr style="border-top:2px solid var(--border);font-weight:700;background:var(--bg)"><td>年間合計</td><td style="text-align:right">'+fMan(totalRevSim)+'</td><td></td><td></td><td></td><td style="text-align:right;'+(totalProfSim>=0?'color:#10b981':'color:#ef4444')+'">'+fMan(totalProfSim)+'</td><td style="text-align:right">'+avgMarginSim.toFixed(1)+'%</td><td style="text-align:right;color:#3b82f6">'+fMan(totalCfSim)+'</td></tr>';
    tbody.innerHTML = html;
  }

  // 銀行格付更新
  updateBankRating();
  // ロカベン更新（業種選択済みなら）
  if(document.getElementById('locaMinor').value) updateLocaBenchmark();
  } catch(e) { console.error('シミュレーションエラー:', e); }
}

function updateSimParam(key, val){
  simParams[key] = Number(val);
  document.getElementById('val-'+key).textContent = val;
  runSimulation();
}

// --- ロカベン業種別ベンチマーク ---
function initLocaben(){
  var sel = document.getElementById('locaMajor');
  if(!sel || !LOCABEN.categories) return;
  LOCABEN.categories.forEach(function(cat){
    var opt = document.createElement('option');
    opt.value = cat.major;
    opt.textContent = cat.major.replace(/^\d+_/,'');
    sel.appendChild(opt);
  });
}

function updateLocaMinor(){
  var major = document.getElementById('locaMajor').value;
  var sel = document.getElementById('locaMinor');
  sel.innerHTML = '<option value="">-- 小分類を選択 --</option>';
  if(!major) return;
  var cat = LOCABEN.categories.find(function(c){return c.major===major});
  if(!cat) return;
  cat.minors.forEach(function(m){
    var opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m.replace(/^\d+_/,'');
    sel.appendChild(opt);
  });
  // 小分類が1つなら自動選択
  if(cat.minors.length === 1){
    sel.value = cat.minors[0];
    updateLocaBenchmark();
  }
}

function updateLocaBenchmark(){
  var minor = document.getElementById('locaMinor').value;
  var scale = document.getElementById('locaScale').value;
  var container = document.getElementById('locabenResult');
  if(!minor || !scale){ container.innerHTML=''; return; }

  var bkey = minor + '_' + scale;
  var bm = LOCABEN.benchmarks[bkey];
  if(!bm){ container.innerHTML='<p style="color:#9ca3af">この業種・規模のデータがありません</p>'; return; }

  // 現在のシミュレーション値を取得
  var simVals = getSimAnnualValues();

  var indicators = [
    { key:'revenueGrowth', label:'売上増加率', unit:'%', simVal:simVals.revenueGrowth, reverse:false },
    { key:'operatingMargin', label:'営業利益率', unit:'%', simVal:simVals.operatingMargin, reverse:false },
    { key:'laborProductivity', label:'労働生産性', unit:'千円', simVal:simVals.laborProductivity, reverse:false },
    { key:'ebitdaRatio', label:'EBITDA有利子負債倍率', unit:'倍', simVal:null, reverse:true },
    { key:'workingCapitalTurnover', label:'営業運転資本回転期間', unit:'ヶ月', simVal:null, reverse:true },
    { key:'equityRatio', label:'自己資本比率', unit:'%', simVal:simVals.equityRatio, reverse:false },
  ];

  var html = '<div class="locaben-grid">';
  indicators.forEach(function(ind){
    var data = bm[ind.key];
    if(!data) return;
    var ranks = data.ranks;
    var val = ind.simVal;
    var rank = '-';
    var rankColor = '#9ca3af';

    if(val !== null){
      if(ind.reverse){
        // 低いほど良い指標
        if(val <= ranks.A) { rank='A'; rankColor='#10b981'; }
        else if(val <= ranks.B) { rank='B'; rankColor='#3b82f6'; }
        else if(val <= ranks.C) { rank='C'; rankColor='#f59e0b'; }
        else if(val <= ranks.D) { rank='D'; rankColor='#f97316'; }
        else { rank='E'; rankColor='#ef4444'; }
      } else {
        // 高いほど良い指標
        if(val >= ranks.A) { rank='A'; rankColor='#10b981'; }
        else if(val >= ranks.B) { rank='B'; rankColor='#3b82f6'; }
        else if(val >= ranks.C) { rank='C'; rankColor='#f59e0b'; }
        else if(val >= ranks.D) { rank='D'; rankColor='#f97316'; }
        else { rank='E'; rankColor='#ef4444'; }
      }
    }

    html += '<div class="locaben-card">';
    html += '<div class="locaben-card-header"><span class="locaben-label">'+ind.label+'</span>';
    html += '<span class="locaben-rank" style="color:'+rankColor+';border-color:'+rankColor+'">'+rank+'</span></div>';
    html += '<div class="locaben-bars">';
    // ランクバー
    var labels = ['E','D','C','B','A'];
    var colors = ['#ef4444','#f97316','#f59e0b','#3b82f6','#10b981'];
    html += '<div class="locaben-rank-bar">';
    for(var j=0;j<5;j++){
      var active = labels[j] === rank;
      html += '<div class="locaben-rank-seg'+(active?' active':'')+'" style="background:'+(active?colors[j]:colors[j]+'20')+'">';
      html += '<span>'+labels[j]+'</span></div>';
    }
    html += '</div>';
    html += '</div>';
    // 数値
    html += '<div class="locaben-values">';
    html += '<div><span class="locaben-val-label">シミュ値</span><span class="locaben-val">'+(val!==null? (typeof val==='number'?val.toFixed(1):val)+ind.unit : '---')+'</span></div>';
    html += '<div><span class="locaben-val-label">業種中央値</span><span class="locaben-val">'+data.median.toFixed(1)+ind.unit+'</span></div>';
    html += '<div><span class="locaben-val-label">上位(A)</span><span class="locaben-val" style="color:#10b981">'+ranks.A.toFixed(1)+ind.unit+'</span></div>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';

  container.innerHTML = html;
}

// --- 銀行格付シミュレーション（129点満点ベース）---
function updateBankRating(){
  var sv = getSimAnnualValues();
  var container = document.getElementById('bankRatingResult');
  if(!container) return;

  // freee実績からBS情報を取得（あれば）
  var lastB = baseData[baseData.length-1] || {};
  var totalAssets = lastB.totalAssets || 0;
  var netAssets = lastB.netAssets || 0;
  var debt = lastB.debt || 0;
  var totalRev = 0, totalProfit = 0;
  for(var i=0;i<baseData.length;i++){
    var b=baseData[i];
    var rev=Math.round((b.revenue||0)*(1+simParams.revenueGrowth/100));
    var cogs=Math.round(rev*simParams.cogsRatio/100);
    var fixed=Math.round((b.fixed||0)*(1+simParams.fixedCostChange/100));
    var varR=(b.revenue>0&&b.variable>0)?b.variable/b.revenue:0;
    var varC=Math.round(rev*varR);
    var depr=(b.depreciation||0)+Math.round(simParams.investment*10000/60);
    totalRev+=rev; totalProfit+=(rev-cogs-fixed-varC-depr);
  }
  var cf = totalProfit + baseData.reduce(function(s,d){return s+(d.depreciation||0)},0);

  // 13指標のうちシミュレーションで算出可能なものを評価
  var metrics = [];

  // 1. 自己資本比率（/10点）
  var eqR = totalAssets>0 ? netAssets/totalAssets*100 : 0;
  if(eqR>=60) metrics.push({name:'自己資本比率',val:eqR.toFixed(1)+'%',score:10,max:10,lv:'excellent'});
  else if(eqR>=40) metrics.push({name:'自己資本比率',val:eqR.toFixed(1)+'%',score:8,max:10,lv:'good'});
  else if(eqR>=20) metrics.push({name:'自己資本比率',val:eqR.toFixed(1)+'%',score:6,max:10,lv:'fair'});
  else if(eqR>=10) metrics.push({name:'自己資本比率',val:eqR.toFixed(1)+'%',score:3,max:10,lv:'warning'});
  else metrics.push({name:'自己資本比率',val:eqR.toFixed(1)+'%',score:1,max:10,lv:'danger'});

  // 2. ギアリング比率（/10点）
  var gear = netAssets>0 ? debt/netAssets*100 : 999;
  if(gear<=30) metrics.push({name:'ギアリング比率',val:gear.toFixed(0)+'%',score:10,max:10,lv:'excellent'});
  else if(gear<=50) metrics.push({name:'ギアリング比率',val:gear.toFixed(0)+'%',score:8,max:10,lv:'good'});
  else if(gear<=100) metrics.push({name:'ギアリング比率',val:gear.toFixed(0)+'%',score:6,max:10,lv:'fair'});
  else if(gear<=250) metrics.push({name:'ギアリング比率',val:gear.toFixed(0)+'%',score:3,max:10,lv:'warning'});
  else metrics.push({name:'ギアリング比率',val:gear.toFixed(0)+'%',score:1,max:10,lv:'danger'});

  // 3. 売上高経常利益率（/7点）→営業利益率で代用
  var pm = sv.operatingMargin;
  if(pm>=10) metrics.push({name:'売上高利益率',val:pm.toFixed(1)+'%',score:7,max:7,lv:'excellent'});
  else if(pm>=5) metrics.push({name:'売上高利益率',val:pm.toFixed(1)+'%',score:5,max:7,lv:'good'});
  else if(pm>=2) metrics.push({name:'売上高利益率',val:pm.toFixed(1)+'%',score:3,max:7,lv:'fair'});
  else if(pm>=0) metrics.push({name:'売上高利益率',val:pm.toFixed(1)+'%',score:1,max:7,lv:'warning'});
  else metrics.push({name:'売上高利益率',val:pm.toFixed(1)+'%',score:0,max:7,lv:'danger'});

  // 4. ROA（/7点）
  var roa = totalAssets>0 ? totalProfit/totalAssets*100 : 0;
  if(roa>=10) metrics.push({name:'ROA',val:roa.toFixed(1)+'%',score:7,max:7,lv:'excellent'});
  else if(roa>=5) metrics.push({name:'ROA',val:roa.toFixed(1)+'%',score:5,max:7,lv:'good'});
  else if(roa>=2) metrics.push({name:'ROA',val:roa.toFixed(1)+'%',score:3,max:7,lv:'fair'});
  else if(roa>=0) metrics.push({name:'ROA',val:roa.toFixed(1)+'%',score:1,max:7,lv:'warning'});
  else metrics.push({name:'ROA',val:roa.toFixed(1)+'%',score:0,max:7,lv:'danger'});

  // 5. 自己資本額（/15点）
  if(netAssets>=500000000) metrics.push({name:'自己資本額',val:fMan(netAssets),score:15,max:15,lv:'excellent'});
  else if(netAssets>=100000000) metrics.push({name:'自己資本額',val:fMan(netAssets),score:12,max:15,lv:'good'});
  else if(netAssets>=30000000) metrics.push({name:'自己資本額',val:fMan(netAssets),score:9,max:15,lv:'good'});
  else if(netAssets>=10000000) metrics.push({name:'自己資本額',val:fMan(netAssets),score:6,max:15,lv:'fair'});
  else if(netAssets>0) metrics.push({name:'自己資本額',val:fMan(netAssets),score:3,max:15,lv:'warning'});
  else metrics.push({name:'自己資本額',val:fMan(netAssets),score:0,max:15,lv:'danger'});

  // 6. 売上高（/8点）
  if(totalRev>=1000000000) metrics.push({name:'売上高',val:fMan(totalRev),score:8,max:8,lv:'excellent'});
  else if(totalRev>=500000000) metrics.push({name:'売上高',val:fMan(totalRev),score:7,max:8,lv:'good'});
  else if(totalRev>=100000000) metrics.push({name:'売上高',val:fMan(totalRev),score:5,max:8,lv:'good'});
  else if(totalRev>=50000000) metrics.push({name:'売上高',val:fMan(totalRev),score:3,max:8,lv:'fair'});
  else metrics.push({name:'売上高',val:fMan(totalRev),score:1,max:8,lv:'warning'});

  // 7. 債務償還年数（/10点）
  var debtYrs = cf>0 ? debt/cf : null;
  if(debtYrs===null) metrics.push({name:'債務償還年数',val:'算出不可',score:0,max:10,lv:'danger'});
  else if(debtYrs<=3) metrics.push({name:'債務償還年数',val:debtYrs.toFixed(1)+'年',score:10,max:10,lv:'excellent'});
  else if(debtYrs<=5) metrics.push({name:'債務償還年数',val:debtYrs.toFixed(1)+'年',score:8,max:10,lv:'good'});
  else if(debtYrs<=10) metrics.push({name:'債務償還年数',val:debtYrs.toFixed(1)+'年',score:5,max:10,lv:'fair'});
  else if(debtYrs<=20) metrics.push({name:'債務償還年数',val:debtYrs.toFixed(1)+'年',score:2,max:10,lv:'warning'});
  else metrics.push({name:'債務償還年数',val:debtYrs.toFixed(1)+'年',score:0,max:10,lv:'danger'});

  // 8. CF額（/20点）
  if(cf>=50000000) metrics.push({name:'キャッシュフロー額',val:fMan(cf),score:20,max:20,lv:'excellent'});
  else if(cf>=20000000) metrics.push({name:'キャッシュフロー額',val:fMan(cf),score:16,max:20,lv:'good'});
  else if(cf>=10000000) metrics.push({name:'キャッシュフロー額',val:fMan(cf),score:12,max:20,lv:'good'});
  else if(cf>=5000000) metrics.push({name:'キャッシュフロー額',val:fMan(cf),score:8,max:20,lv:'fair'});
  else if(cf>0) metrics.push({name:'キャッシュフロー額',val:fMan(cf),score:4,max:20,lv:'warning'});
  else metrics.push({name:'キャッシュフロー額',val:fMan(cf),score:0,max:20,lv:'danger'});

  // スコア集計
  var totalScore = metrics.reduce(function(s,m){return s+m.score},0);
  var maxScore = metrics.reduce(function(s,m){return s+m.max},0);
  var fullMax = 129;

  // 算出可能な指標からの推定（全129点に換算）
  var estimatedTotal = maxScore>0 ? Math.round(totalScore / maxScore * fullMax) : 0;

  var rank, rankLabel, rankColor;
  if(estimatedTotal>=100){rank='A';rankLabel='優良（正常先）';rankColor='#10b981';}
  else if(estimatedTotal>=80){rank='B';rankLabel='良好（正常先）';rankColor='#3b82f6';}
  else if(estimatedTotal>=60){rank='C';rankLabel='普通（要注意先予備）';rankColor='#f59e0b';}
  else if(estimatedTotal>=40){rank='D';rankLabel='要注意（要管理先）';rankColor='#f97316';}
  else{rank='E';rankLabel='危険（破綻懸念先）';rankColor='#ef4444';}

  var levelColors = {excellent:'#10b981',good:'#3b82f6',fair:'#f59e0b',warning:'#f97316',danger:'#ef4444'};

  var html = '<div class="bank-rating-header">';
  html += '<div class="bank-rank-circle" style="border-color:'+rankColor+';color:'+rankColor+'">'+rank+'</div>';
  html += '<div class="bank-rank-info"><div class="bank-rank-label" style="color:'+rankColor+'">'+rankLabel+'</div>';
  html += '<div class="bank-rank-score">推定スコア: '+estimatedTotal+' / '+fullMax+'点</div>';
  html += '<div class="bank-rank-note">※シミュレーション値からの簡易算出（'+metrics.length+'/13指標）</div></div></div>';

  // カテゴリ別
  var cats = [
    {label:'安全性',items:metrics.filter(function(m){return m.name==='自己資本比率'||m.name==='ギアリング比率'})},
    {label:'収益性',items:metrics.filter(function(m){return m.name==='売上高利益率'||m.name==='ROA'})},
    {label:'規模・成長性',items:metrics.filter(function(m){return m.name==='自己資本額'||m.name==='売上高'})},
    {label:'返済能力',items:metrics.filter(function(m){return m.name==='債務償還年数'||m.name==='キャッシュフロー額'})},
  ];

  html += '<div class="bank-metrics-grid">';
  cats.forEach(function(cat){
    html += '<div class="bank-cat"><div class="bank-cat-label">'+cat.label+'</div>';
    cat.items.forEach(function(m){
      var c = levelColors[m.lv];
      var pct = m.max>0 ? Math.round(m.score/m.max*100) : 0;
      html += '<div class="bank-metric-row">';
      html += '<span class="bank-metric-name">'+m.name+'</span>';
      html += '<span class="bank-metric-val">'+m.val+'</span>';
      html += '<div class="bank-metric-bar"><div class="bank-metric-fill" style="width:'+pct+'%;background:'+c+'"></div></div>';
      html += '<span class="bank-metric-score" style="color:'+c+'">'+m.score+'/'+m.max+'</span>';
      html += '</div>';
    });
    html += '</div>';
  });
  html += '</div>';

  container.innerHTML = html;
}

function getSimAnnualValues(){
  // 現在のシミュレーション結果から年間指標を算出
  var totalRev=0, totalProfit=0, emp=1;
  for(var i=0;i<baseData.length;i++){
    var b = baseData[i];
    var bRev = b.revenue||0;
    var rev = Math.round(bRev * (1 + simParams.revenueGrowth/100));
    var cogs = Math.round(rev * simParams.cogsRatio/100);
    var fixed = Math.round((b.fixed||0) * (1 + simParams.fixedCostChange/100));
    var varR = (bRev>0 && b.variable>0) ? b.variable/bRev : 0;
    var varCost = Math.round(rev * varR);
    var depr = (b.depreciation||0) + Math.round(simParams.investment*10000/60);
    var profit = rev - cogs - fixed - varCost - depr;
    totalRev += rev;
    totalProfit += profit;
    emp = Math.max(1, (b.employees||1) + simParams.employeeChange);
  }
  // ベースの年間売上
  var baseTotalRev = baseData.reduce(function(s,d){return s+(d.revenue||0)},0);
  var revenueGrowth = baseTotalRev>0 ? ((totalRev-baseTotalRev)/baseTotalRev*100) : 0;
  var margin = totalRev>0 ? (totalProfit/totalRev*100) : 0;
  var productivity = totalRev / emp / 1000; // 千円単位
  // 自己資本比率（簡易: 最終月のnetAssets/totalAssets）
  var lastB = baseData[baseData.length-1];
  var eqRatio = (lastB.totalAssets>0 && lastB.netAssets>0) ? (lastB.netAssets/lastB.totalAssets*100) : 0;

  return {
    revenueGrowth: Math.round(revenueGrowth*10)/10,
    operatingMargin: Math.round(margin*10)/10,
    laborProductivity: Math.round(productivity*10)/10,
    equityRatio: Math.round(eqRatio*10)/10,
  };
}

function applySimToKpi(){
  if(!confirm('シミュレーション結果をKPI目標に反映しますか？\\n既存の目標値が上書きされます。')) return;

  // 現在のシミュレーション結果を集計
  var results = [];
  for(var i=0;i<12;i++){
    var b = baseData[i];
    var rev = Math.round(b.revenue * (1 + simParams.revenueGrowth/100));
    var cogs = Math.round(rev * simParams.cogsRatio/100);
    var fixed = Math.round(b.fixed * (1 + simParams.fixedCostChange/100));
    var varCost = Math.round(rev * (b.variable / b.revenue || 0));
    var emp = Math.max(1, b.employees + simParams.employeeChange);
    var addDepr = Math.round(simParams.investment * 10000 / 60);
    var depr = b.depreciation + addDepr;
    var profit = rev - cogs - fixed - varCost - depr;
    results.push({ revenue:rev, profit:profit, emp:emp });
  }

  var totalRev = results.reduce(function(s,r){return s+r.revenue},0);
  var totalProfit = results.reduce(function(s,r){return s+r.profit},0);
  var avgMargin = totalRev > 0 ? (totalProfit / totalRev * 100) : 0;
  var avgEmp = results[0].emp;
  var productivity = totalRev / avgEmp / 10000;

  var body = {
    fiscalYear: KPI_TARGET.fiscalYear,
    targetRevenue: totalRev,
    targetProfit: totalProfit,
    targetMargin: Math.round(avgMargin * 10) / 10,
    targetEquityRatio: KPI_TARGET.targetEquityRatio,
    targetProductivity: Math.round(productivity * 10) / 10,
    employeeCount: avgEmp,
  };

  fetch('/api/plan/kpi', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
    .then(function(r){ return r.json() })
    .then(function(){
      alert('KPI目標に反映しました。\\n\\n売上: ' + Math.round(totalRev/10000).toLocaleString() + '万円\\n利益: ' + Math.round(totalProfit/10000).toLocaleString() + '万円\\n利益率: ' + avgMargin.toFixed(1) + '%');
      location.reload();
    })
    .catch(function(e){ alert('反映に失敗しました: ' + e.message); });
}

function resetSimParams(){
  simParams = { revenueGrowth:0, cogsRatio:45, fixedCostChange:0, employeeChange:0, investment:0, repayment:0 };
  document.getElementById('sl-revenueGrowth').value=0; document.getElementById('val-revenueGrowth').textContent='0';
  document.getElementById('sl-cogsRatio').value=45; document.getElementById('val-cogsRatio').textContent='45';
  document.getElementById('sl-fixedCostChange').value=0; document.getElementById('val-fixedCostChange').textContent='0';
  document.getElementById('sl-employeeChange').value=0; document.getElementById('val-employeeChange').textContent='0';
  document.getElementById('sl-investment').value=0; document.getElementById('val-investment').textContent='0';
  document.getElementById('sl-repayment').value=0; document.getElementById('val-repayment').textContent='0';
  runSimulation();
}

function saveKpi(){
  var customKpis=[];
  document.querySelectorAll('.custom-kpi-row').forEach(function(row){
    var name=row.querySelector('.ck-name').value.trim();
    if(!name) return;
    customKpis.push({
      id:'ck-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),
      name:name,
      target:Number(row.querySelector('.ck-target').value)||0,
      actual:Number(row.querySelector('.ck-actual').value)||0,
      unit:row.querySelector('.ck-unit').value,
      format:'number',
      scope:row.querySelector('.ck-scope').value||'annual'
    });
  });
  var body={
    fiscalYear:document.getElementById('kpiFiscalYear').value,
    targetRevenue:Number(document.getElementById('kpiRevenue').value)||0,
    targetProfit:Number(document.getElementById('kpiProfit').value)||0,
    targetMargin:Number(document.getElementById('kpiMargin').value)||0,
    targetEquityRatio:Number(document.getElementById('kpiEquity').value)||0,
    targetProductivity:Number(document.getElementById('kpiProductivity').value)||0,
    employeeCount:Number(document.getElementById('kpiEmployeeCount').value)||1,
    customKpis:customKpis
  };
  fetch('/api/plan/kpi',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(function(r){return r.json()})
    .then(function(){location.reload()})
    .catch(function(){alert('保存に失敗しました')});
}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtOku(n: number): string {
  return (n / 100_000_000).toFixed(2) + '億';
}

function fmtMan(n: number): string {
  return Math.round(n / 10_000).toLocaleString() + '万';
}

function renderGapItem(
  label: string,
  current: number,
  target: number,
  format: (v: number) => string,
  gapFormat: (g: number) => string,
  _isPercentage: boolean,
): string {
  const rate = target > 0 ? Math.round((current / target) * 1000) / 10 : 0;
  const gap = current - target;
  const color = rate >= 100 ? '#10b981' : rate >= 70 ? '#f59e0b' : '#ef4444';
  const barWidth = Math.min(rate, 100);

  return `
    <div class="gap-item">
      <div class="gap-header">
        <span class="gap-label">${label}</span>
        <span class="gap-badge" style="color:${color};background:${color}18">${rate.toFixed(1)}%</span>
      </div>
      <div class="gap-bars">
        <div class="gap-bar-group">
          <div class="gap-bar-label"><span>現状</span><span class="gap-bar-value">${format(current)}</span></div>
          <div class="gap-bar-track"><div class="gap-bar-fill" style="width:${barWidth}%;background:${color}"></div></div>
        </div>
        <span class="gap-arrow">→</span>
        <div class="gap-bar-group">
          <div class="gap-bar-label"><span>目標</span><span class="gap-bar-value">${format(target)}</span></div>
          <div class="gap-bar-track"><div class="gap-bar-fill" style="width:100%;background:${color}60"></div></div>
        </div>
      </div>
      <div class="gap-diff" style="color:${gap >= 0 ? '#10b981' : '#ef4444'}">ギャップ: ${gapFormat(gap)}</div>
    </div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('ja-JP').format(n);
}

function rateClass(rate: number): string {
  if (rate >= 100) return 'rate-over';
  if (rate >= 90) return 'rate-near';
  return 'rate-under';
}

// Plan-specific CSS (appended to shared CSS)
const PLAN_CSS = `
.dropzone{border:2px dashed var(--border);border-radius:12px;padding:48px 24px;text-align:center;transition:all .2s;cursor:pointer}
.dropzone:hover,.dropzone.dragover{border-color:var(--primary);background:var(--primary-light)}
.dropzone-text{font-size:16px;font-weight:600;color:var(--text);margin-top:16px}
.dropzone-sub{font-size:13px;color:var(--text2);margin:8px 0}
.dropzone-hint{font-size:12px;color:#9ca3af;margin-top:12px}
.btn-upload{display:inline-block;padding:8px 20px;border-radius:8px;background:var(--primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s}
.btn-upload:hover{opacity:0.85}
.file-preview{display:flex;align-items:center;justify-content:space-between;padding:16px;background:var(--primary-light);border-radius:10px;margin-top:12px}
.file-preview-info{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;color:var(--primary)}
.uploaded-list{margin-top:20px;padding-top:16px;border-top:1px solid var(--border)}
.uploaded-list-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.uploaded-list-header h4{font-size:13px;font-weight:700;color:var(--text2)}
.uploaded-item{display:flex;align-items:center;justify-content:space-between;padding:6px 0;font-size:13px;color:var(--text);border-bottom:1px solid var(--border)}
.uploaded-item:last-child{border-bottom:none}
.uploaded-item-left{display:flex;align-items:center;gap:8px;overflow:hidden}
.uploaded-item-left span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.uploaded-item-actions{display:flex;gap:4px;align-items:center;flex-shrink:0}
.btn-analyze-file{display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;border:1px solid var(--primary);background:transparent;color:var(--primary);font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap}
.btn-analyze-file:hover{background:var(--primary);color:#fff}
.btn-analyze-file:disabled{opacity:0.5;cursor:not-allowed}
.btn-delete-file{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:#9ca3af;cursor:pointer;transition:all .15s;flex-shrink:0}
.btn-delete-file:hover{background:#fee2e2;color:#ef4444}
.btn-danger{background:#ef4444;color:#fff;border:none;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;transition:opacity .15s}
.btn-danger:hover{opacity:0.85}
.ai-status{display:flex;gap:16px;align-items:center;padding:20px;background:linear-gradient(135deg,#2298ae,#4dbdcf);border-radius:10px;color:#fff;margin-bottom:20px}
.ai-status-icon{font-size:36px}
.ai-status-text h4{font-size:16px;font-weight:700;margin-bottom:4px}
.ai-status-text p{font-size:13px;opacity:0.9;line-height:1.5}
.ai-features{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ai-feature{display:flex;gap:12px;padding:14px;border-radius:8px;background:var(--bg)}
.ai-feature-icon{font-size:22px;flex-shrink:0}
.ai-feature strong{font-size:13px;display:block;margin-bottom:2px}
.ai-feature p{font-size:12px;color:var(--text2);line-height:1.45}
.target-table{width:100%;border-collapse:collapse;font-size:13px}
.target-table th{background:var(--bg);font-weight:600;color:var(--text2);font-size:11px;letter-spacing:0.03em;text-transform:uppercase;padding:10px 12px;text-align:center;border-bottom:2px solid var(--border);white-space:nowrap}
.target-table td{padding:10px 12px;border-bottom:1px solid var(--border);text-align:right}
.target-table .month-cell{text-align:left;font-weight:600;color:var(--text)}
.target-table .actual{color:var(--text2)}
.target-table .editable{color:var(--primary);font-weight:600}
.rate-over{color:var(--green);font-weight:700}
.rate-near{color:var(--orange);font-weight:700}
.rate-under{color:var(--red);font-weight:700}
.edit-input{width:100%;border:1px solid var(--primary);border-radius:4px;padding:4px 8px;font-size:13px;text-align:right;outline:none;font-family:inherit}
@media(max-width:768px){.ai-features{grid-template-columns:1fr}}
.kpi-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.kpi-field label{display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:4px}
.kpi-field input,.kpi-field select{width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:#fff;outline:none;transition:border-color .15s}
.kpi-field input:focus,.kpi-field select:focus{border-color:var(--primary)}
.kpi-hint{font-size:11px;color:#9ca3af;margin-top:3px;display:block}
.gap-item{padding:14px;border:1px solid var(--border);border-radius:10px;margin-bottom:10px}
.gap-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.gap-label{font-size:14px;font-weight:700;color:var(--text)}
.gap-badge{font-size:12px;font-weight:700;padding:2px 10px;border-radius:20px}
.gap-bars{display:flex;align-items:flex-end;gap:8px;margin-bottom:6px}
.gap-bar-group{flex:1}
.gap-bar-label{display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:4px}
.gap-bar-value{font-weight:600;color:var(--text)}
.gap-bar-track{height:8px;border-radius:4px;background:#f1f1f4;overflow:hidden}
.gap-bar-fill{height:100%;border-radius:4px;transition:width .5s}
.gap-arrow{font-size:11px;color:var(--text2);margin-bottom:8px}
.gap-diff{text-align:right;font-size:12px;font-weight:600}
.custom-kpi-section{margin-top:20px;padding-top:16px;border-top:1px solid var(--border)}
.custom-kpi-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.custom-kpi-header h4{font-size:13px;font-weight:700;color:var(--text2)}
.custom-kpi-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.custom-kpi-row input,.custom-kpi-row select{padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:#fff;outline:none}
.custom-kpi-row input:focus,.custom-kpi-row select:focus{border-color:var(--primary)}
.ck-name{flex:2;min-width:0}
.ck-target,.ck-actual{flex:1;min-width:0;text-align:right}
.ck-unit{width:70px;flex-shrink:0}
.ck-scope{width:70px;flex-shrink:0;font-size:12px}
.period-select{padding:6px 12px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:#fff;outline:none;cursor:pointer}
.period-select:focus{border-color:var(--primary)}
.future-row{background:rgba(34,152,174,0.03)}
.future-badge{display:inline-block;font-size:10px;color:var(--primary);background:rgba(34,152,174,0.1);padding:1px 6px;border-radius:4px;margin-left:4px;font-weight:600}
.no-data{color:#d1d5db}
.mt-input{width:100%;padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:13px;text-align:right;outline:none;background:transparent;font-family:inherit}
.mt-input:focus{border-color:var(--primary);background:#fff}
.mt-input::placeholder{color:#ccc}
.btn-clear-row{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:4px;border:none;background:transparent;color:#d1d5db;cursor:pointer;transition:all .15s;padding:0}
.btn-clear-row:hover{background:#fee2e2;color:#ef4444}
.plan-tabs{display:flex;gap:8px;margin-bottom:24px}
.plan-tab{padding:10px 20px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text2);font-size:14px;font-weight:600;cursor:pointer;transition:all .2s}
.plan-tab:hover{border-color:var(--primary);color:var(--text)}
.plan-tab.active{background:var(--primary);color:#fff;border-color:var(--primary);box-shadow:0 2px 8px rgba(34,152,174,0.3)}
.sim-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.sim-kpi-card{padding:16px;border-radius:10px;border:1px solid var(--border);background:#fff}
.sim-kpi-label{font-size:11px;color:var(--text2);font-weight:600;margin-bottom:4px}
.sim-kpi-value{font-size:22px;font-weight:800;color:var(--text)}
.sim-kpi-diff{font-size:12px;font-weight:600;margin-top:4px}
.grid-sim{display:grid;grid-template-columns:320px 1fr;gap:20px}
.sim-slider{margin-bottom:18px}
.sim-slider-header{display:flex;align-items:center;gap:4px;font-size:13px;color:var(--text2);margin-bottom:6px}
.sim-slider-val{font-weight:700;color:var(--primary);margin-left:auto}
.sim-slider input[type=range]{width:100%;height:6px;border-radius:3px;appearance:none;background:#e5e7eb;outline:none;cursor:pointer}
.sim-slider input[type=range]::-webkit-slider-thumb{appearance:none;width:18px;height:18px;border-radius:50%;background:var(--primary);cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.2)}
.sim-slider-range{display:flex;justify-content:space-between;font-size:10px;color:#9ca3af;margin-top:2px}
.sim-source-bar{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-radius:8px;background:var(--bg);border:1px solid var(--border);margin-bottom:16px;font-size:12px;color:var(--text2);flex-wrap:wrap;gap:8px}
.sim-mode-toggle{display:flex;gap:4px;background:#f1f5f9;border-radius:8px;padding:3px}
.sim-mode-btn{padding:6px 14px;border-radius:6px;border:none;background:transparent;color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;transition:all .2s}
.sim-mode-btn.active{background:#fff;color:var(--primary);box-shadow:0 1px 3px rgba(0,0,0,0.1)}
.sim-mode-btn:hover:not(.active){color:var(--text)}
.sim-source-label{font-weight:600;margin-right:6px}
.sim-apply-bar{display:flex;justify-content:space-between;align-items:center;padding:20px;border-radius:12px;background:linear-gradient(135deg,rgba(34,152,174,0.08),rgba(34,152,174,0.02));border:1px solid var(--primary);margin-top:20px}
.sim-apply-info strong{font-size:14px;color:var(--text);display:block;margin-bottom:4px}
.sim-apply-info p{font-size:12px;color:var(--text2);margin:0}
.sim-apply-bar .btn-primary{display:flex;align-items:center;gap:6px;white-space:nowrap}
.locaben-select-row{display:grid;grid-template-columns:1fr 1fr 160px;gap:12px}
.locaben-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.locaben-card{padding:14px;border:1px solid var(--border);border-radius:10px;background:#fff}
.locaben-card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.locaben-label{font-size:12px;font-weight:700;color:var(--text)}
.locaben-rank{font-size:18px;font-weight:800;border:2px solid;border-radius:8px;width:36px;height:36px;display:flex;align-items:center;justify-content:center}
.locaben-rank-bar{display:flex;gap:2px;margin-bottom:8px}
.locaben-rank-seg{flex:1;height:6px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:0;transition:all .2s}
.locaben-rank-seg.active{height:14px;font-size:9px;font-weight:700;color:#fff}
.locaben-values{display:flex;flex-direction:column;gap:4px}
.locaben-val-label{font-size:10px;color:var(--text2);margin-right:6px}
.locaben-val{font-size:12px;font-weight:600;color:var(--text)}
.locaben-summary{display:flex;gap:24px;margin-top:16px;padding:16px;border-radius:10px;background:linear-gradient(135deg,rgba(34,152,174,0.08),rgba(34,152,174,0.02));border:1px solid var(--primary)}
.locaben-score,.locaben-bank{display:flex;flex-direction:column;gap:4px}
.locaben-score-label,.locaben-bank-label{font-size:11px;color:var(--text2);font-weight:600}
.locaben-score-val{font-size:20px;font-weight:800;color:var(--text)}
.locaben-bank-val{font-size:20px;font-weight:800}
.bank-rating-header{display:flex;align-items:center;gap:20px;margin-bottom:20px;padding:16px;border-radius:12px;background:var(--bg)}
.bank-rank-circle{width:64px;height:64px;border-radius:50%;border:3px solid;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;flex-shrink:0}
.bank-rank-label{font-size:16px;font-weight:700;margin-bottom:2px}
.bank-rank-score{font-size:14px;font-weight:600;color:var(--text)}
.bank-rank-note{font-size:11px;color:var(--text2);margin-top:2px}
.bank-metrics-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.bank-cat{padding:12px;border:1px solid var(--border);border-radius:10px}
.bank-cat-label{font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px}
.bank-metric-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px}
.bank-metric-name{width:100px;flex-shrink:0;color:var(--text);font-weight:600}
.bank-metric-val{width:70px;flex-shrink:0;text-align:right;color:var(--text2)}
.bank-metric-bar{flex:1;height:6px;border-radius:3px;background:#f1f5f9;overflow:hidden}
.bank-metric-fill{height:100%;border-radius:3px;transition:width .3s}
.bank-metric-score{width:40px;flex-shrink:0;text-align:right;font-weight:700;font-size:11px}
@media(max-width:768px){.sim-kpi-grid{grid-template-columns:1fr 1fr}.grid-sim{grid-template-columns:1fr}.sim-apply-bar{flex-direction:column;gap:12px;text-align:center}.sim-source-bar{flex-direction:column;gap:4px}.locaben-grid{grid-template-columns:1fr 1fr}.locaben-select-row{grid-template-columns:1fr}.bank-metrics-grid{grid-template-columns:1fr}}
`;
