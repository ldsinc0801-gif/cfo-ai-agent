import { agentPageShell } from './shared.js';
import type { MonthlySnapshot } from '../types/trend.js';

const FIELDS: { key: keyof MonthlySnapshot; label: string }[] = [
  { key: 'revenue', label: '売上高' },
  { key: 'costOfSales', label: '売上原価' },
  { key: 'grossProfit', label: '売上総利益' },
  { key: 'sgaExpenses', label: '販管費' },
  { key: 'operatingIncome', label: '営業利益' },
  { key: 'ordinaryIncome', label: '経常利益' },
  { key: 'netIncome', label: '当期純利益' },
  { key: 'depreciation', label: '減価償却費' },
  { key: 'interestExpense', label: '支払利息' },
  { key: 'totalAssets', label: '総資産' },
  { key: 'currentAssets', label: '流動資産' },
  { key: 'cashAndDeposits', label: '現預金' },
  { key: 'currentLiabilities', label: '流動負債' },
  { key: 'interestBearingDebt', label: '有利子負債(借入金残高)' },
  { key: 'netAssets', label: '純資産' },
  { key: 'annualDebtRepayment', label: '年間返済元本 ※手入力' },
];

/** 財務データの確認・修正ページ。取込データ(monthly_actuals)を期ごとに編集できる。 */
export function renderFinanceDataEditHTML(snapshots: MonthlySnapshot[], saved?: string): string {
  // 明らかに不正な値の警告
  const anomalyBadge = (s: MonthlySnapshot): string => {
    const issues: string[] = [];
    if (s.revenue < 0) issues.push('売上高がマイナス');
    if (s.netAssets < 0) issues.push('純資産がマイナス(債務超過)');
    if (s.totalAssets <= 0) issues.push('総資産が0以下');
    return issues.length
      ? `<span style="font-size:11px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:2px 8px;margin-left:8px">⚠ ${issues.join(' / ')}</span>`
      : '';
  };

  const cards = snapshots
    .slice()
    .reverse() // 新しい期を上に
    .map((s) => {
      const inputs = FIELDS.map((f) => {
        const v = (s as unknown as Record<string, number | null | undefined>)[f.key as string];
        const val = v === null || v === undefined ? '' : String(v);
        return `<label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text2)">
          ${f.label}
          <input type="number" step="any" name="${String(f.key)}" value="${val}" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-variant-numeric:tabular-nums">
        </label>`;
      }).join('');
      return `
      <form method="post" action="/finance/data-edit" class="card" style="margin-bottom:16px">
        <input type="hidden" name="year" value="${s.year}">
        <input type="hidden" name="month" value="${s.month}">
        <div class="card-header">
          <h3>${s.year}年${s.month}月${anomalyBadge(s)}</h3>
          <button type="submit" class="btn-primary btn-sm">この期を保存</button>
        </div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px">${inputs}</div>
        </div>
      </form>`;
    })
    .join('');

  const savedBanner = saved
    ? `<div style="background:#ecf6f8;border:1px solid #a8d8e0;color:#1b7f8e;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:14px"><strong>✓ 保存しました</strong>（${saved}）</div>`
    : '';

  const body =
    snapshots.length === 0
      ? `<div class="welcome-banner"><h2>財務データの確認・修正</h2><p>取り込みデータがありません。ダッシュボードで決算書・試算表を取り込んでください。</p></div>
         <div class="card"><div class="card-body"><a href="/" class="btn-primary">ダッシュボードで取り込む</a></div></div>`
      : `<div class="welcome-banner">
           <h2>財務データの確認・修正</h2>
           <p>AIが決算書から抽出した数値です。<strong>誤りがあればここで直接修正</strong>してください。「年間返済元本（借入金の返済計画）」は決算書に載っていないため<strong>手入力</strong>してください（債務償還年数の分析に使われます）。修正すると財務分析AI・資金調達AI・事業計画AIに即反映されます。</p>
         </div>
         ${savedBanner}
         ${cards}`;

  return agentPageShell({ active: 'finance', title: '財務データの確認・修正', bodyHTML: body });
}
