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

// 決算書に載らない補助書類 → 抽出項目
const DOCS: { type: string; icon: string; label: string; desc: string; needs: (s: MonthlySnapshot) => boolean }[] = [
  {
    type: 'loan_repayment', icon: '📄', label: '借入金の返済計画表',
    desc: '年間返済元本・借入金残高(有利子負債)・支払利息を読み取ります',
    needs: (s) => s.annualDebtRepayment == null || (s.interestBearingDebt ?? 0) === 0,
  },
  {
    type: 'fixed_asset', icon: '🏭', label: '固定資産台帳',
    desc: '減価償却費を読み取ります',
    needs: (s) => (s.depreciation ?? 0) === 0,
  },
  {
    type: 'account_breakdown', icon: '📑', label: '勘定科目内訳書',
    desc: '借入金(有利子負債)の内訳を読み取ります',
    needs: (s) => (s.interestBearingDebt ?? 0) === 0,
  },
];

/** 財務データの確認・修正ページ。不足書類の取込 + 期ごとの手修正。 */
export function renderFinanceDataEditHTML(snapshots: MonthlySnapshot[], notice?: string): string {
  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;
  const missing = latest ? DOCS.filter((d) => d.needs(latest)) : [];

  // --- 不足書類の取り込みパネル ---
  const docCard = (d: (typeof DOCS)[number], highlight: boolean) => `
    <form method="post" action="/finance/import-doc" enctype="multipart/form-data" class="doc-card${highlight ? ' doc-card--need' : ''}">
      <input type="hidden" name="docType" value="${d.type}">
      <label class="doc-dropzone">
        <input type="file" name="files" accept=".pdf,.csv,.xlsx,.txt" multiple>
        <div class="doc-icon">${d.icon}</div>
        <div class="doc-title">${d.label}</div>
        <div class="doc-desc">${d.desc}</div>
        <div class="doc-hint">クリック または ドラッグ&ドロップ</div>
        <div class="doc-files"></div>
      </label>
      <button type="submit" class="btn-primary btn-sm" style="width:100%;margin-top:10px">この書類を取り込む</button>
    </form>`;

  const docPanel = latest
    ? `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3>分析に必要な書類の取り込み</h3></div>
      <div class="card-body">
        ${missing.length
          ? `<div class="doc-warn">⚠ 分析に必要な書類が不足しています：<strong>${missing.map((d) => d.label).join(' / ')}</strong>。下記から取り込むと自動で数値が埋まります。</div>`
          : `<div class="doc-ok">✓ 主要な書類は揃っています。追加で取り込みたい書類があれば下記からどうぞ。</div>`}
        <div class="doc-grid">
          ${DOCS.map((d) => docCard(d, missing.includes(d))).join('')}
        </div>
        <p style="font-size:12px;color:var(--text2);margin-top:10px">取り込んだ書類の内容は<strong>最新期（${latest.year}年${latest.month}月）</strong>に反映されます。AIが必要項目だけを抽出します。</p>
      </div>
    </div>`
    : '';

  // --- 期ごとの手修正カード ---
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
    .reverse()
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

  const noticeBanner = notice
    ? `<div style="background:#ecf6f8;border:1px solid #a8d8e0;color:#1b7f8e;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:14px">${notice}</div>`
    : '';

  const body =
    snapshots.length === 0
      ? `<div class="welcome-banner"><h2>財務データの確認・修正</h2><p>取り込みデータがありません。ダッシュボードで決算書・試算表を取り込んでください。</p></div>
         <div class="card"><div class="card-body"><a href="/" class="btn-primary">ダッシュボードで取り込む</a></div></div>`
      : `<div class="welcome-banner">
           <h2>財務データの確認・修正</h2>
           <p>不足している書類は下の「書類の取り込み」から入れれば自動で数値が埋まります。AIが決算書から読み取った数値に誤りがあれば、下の期別カードで直接修正できます。修正・取込は財務分析AI・資金調達AI・事業計画AIに即反映されます。</p>
         </div>
         ${noticeBanner}
         ${docPanel}
         <h3 style="margin:20px 0 12px;font-size:15px">期別データ（詳細な手修正）</h3>
         ${cards}`;

  return agentPageShell({ active: 'finance', title: '財務データの確認・修正', bodyHTML: `<style>
    .doc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
    .doc-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px}
    .doc-card--need{border-color:#f59e0b;box-shadow:0 0 0 2px rgba(245,158,11,0.15)}
    .doc-dropzone{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;cursor:pointer;border:2px dashed #cbd5e1;border-radius:10px;padding:16px 10px;background:#f8fafc;transition:border-color .15s,background .15s}
    .doc-dropzone:hover{border-color:#2298ae;background:#f0f9fb}
    .doc-dropzone.drag{border-color:#2298ae;background:#e6f4f7}
    .doc-dropzone input[type=file]{display:none}
    .doc-icon{font-size:24px;line-height:1}
    .doc-title{font-weight:700;font-size:14px}
    .doc-desc{font-size:11px;color:var(--text2);line-height:1.4}
    .doc-hint{font-size:11px;color:#94a3b8;margin-top:2px}
    .doc-files{font-size:11px;color:#1b7f8e;font-weight:700;word-break:break-all;margin-top:2px}
    .doc-warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px;line-height:1.6}
    .doc-ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px}
  </style>
  ${body}
  <script>
  document.querySelectorAll('.doc-dropzone').forEach(function(dz){
    var input=dz.querySelector('input[type=file]');
    var filesEl=dz.querySelector('.doc-files');
    function render(){
      if(!input.files||!input.files.length){filesEl.textContent='';return;}
      var a=[];for(var i=0;i<input.files.length;i++)a.push(input.files[i].name);
      filesEl.textContent=input.files.length+'件: '+a.join('、');
    }
    ['dragenter','dragover'].forEach(function(e){dz.addEventListener(e,function(ev){ev.preventDefault();ev.stopPropagation();dz.classList.add('drag');});});
    ['dragleave','drop'].forEach(function(e){dz.addEventListener(e,function(ev){ev.preventDefault();ev.stopPropagation();dz.classList.remove('drag');});});
    dz.addEventListener('drop',function(e){if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length){input.files=e.dataTransfer.files;render();}});
    input.addEventListener('change',render);
  });
  </script>` });
}
