import { agentPageShell } from './shared.js';
import type { MonthlySnapshot } from '../types/trend.js';

// 補助書類（決算書で埋まらない/読めなかった時の補完）。基本は決算書(BS/PL)で足りる。
const DOCS: { type: string; icon: string; label: string; desc: string }[] = [
  {
    type: 'loan_repayment', icon: '📄', label: '借入金の返済計画表',
    desc: '★決算書に無い「年間返済元本」を読み取ります（借入残高・支払利息も）',
  },
  {
    type: 'account_breakdown', icon: '📑', label: '勘定科目内訳書',
    desc: '決算書で借入が読めなかった場合の補完（有利子負債の内訳）',
  },
  {
    type: 'fixed_asset', icon: '🏭', label: '固定資産台帳',
    desc: '決算書PLで減価償却費が読めなかった場合の補完',
  },
];

/** 財務データの確認・修正ページ。不足書類の取込 + 期ごとの手修正。 */
export function renderFinanceDataEditHTML(snapshots: MonthlySnapshot[], notice?: string, keepAddMode?: boolean): string {
  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;
  // 決算書で埋まらない項目の検知
  const needRepay = !!latest && latest.annualDebtRepayment == null; // 年間返済元本(決算書に無い)
  const needDebt = !!latest && (latest.interestBearingDebt ?? 0) === 0; // 有利子負債
  const needDep = !!latest && (latest.depreciation ?? 0) === 0; // 減価償却費
  const docRelevant: Record<string, boolean> = {
    loan_repayment: needRepay || needDebt,
    account_breakdown: needDebt,
    fixed_asset: needDep,
  };

  // --- 不足書類の取り込みパネル ---
  const fmtYen = (v: number | null | undefined) =>
    v == null ? '—' : '¥' + new Intl.NumberFormat('ja-JP').format(Math.round(v));
  const docCard = (d: (typeof DOCS)[number], highlight: boolean) => {
    const isLoan = d.type === 'loan_repayment';
    const loanMode = isLoan
      ? `<div style="margin-top:8px;font-size:12px;text-align:left">
           <label style="display:block;margin-bottom:3px"><input type="radio" name="mode" value="replace" ${keepAddMode ? '' : 'checked'}> 全借入をまとめて取り込む（上書き）</label>
           <label style="display:block"><input type="radio" name="mode" value="add" ${keepAddMode ? 'checked' : ''}> 借入を1件ずつ追加（加算）${keepAddMode ? ' <span style="color:#16a34a;font-weight:700">← 継続中</span>' : ''}</label>
           <div style="font-size:11px;color:var(--text2);margin-top:6px;line-height:1.6">1つの借入が複数ページの時は<strong>全ファイルをまとめて選択</strong>（AIが1件として合計）。借入が複数なら全部まとめて選び「上書き」で1回でOK。1件ずつ入れたい時は「リセット→加算」。</div>
         </div>`
      : '';
    const loanFooter = isLoan
      ? `<div style="margin-top:8px;font-size:11px;color:var(--text2);text-align:left">
           現在の合計：借入残高 <strong>${fmtYen(latest?.interestBearingDebt)}</strong> ／ 年間返済元本 <strong>${fmtYen(latest?.annualDebtRepayment)}</strong>
           <form method="post" action="/finance/reset-loan" style="display:inline;margin-left:6px" onsubmit="return confirm('借入データ(有利子負債・年間返済元本・支払利息)を0に戻します。よろしいですか？')">
             <button type="submit" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:11px;text-decoration:underline;padding:0">借入をリセット</button>
           </form>
         </div>`
      : '';
    return `
    <div>
      <form method="post" action="/finance/import-doc" enctype="multipart/form-data" class="doc-card${highlight ? ' doc-card--need' : ''}">
        <input type="hidden" name="docType" value="${d.type}">
        <label class="doc-dropzone">
          <input type="file" name="files" accept=".pdf,.csv,.xlsx,.txt,image/*" multiple>
          <div class="doc-icon">${d.icon}</div>
          <div class="doc-title">${d.label}</div>
          <div class="doc-desc">${d.desc}</div>
          <div class="doc-hint">写真・PDF・CSV可／複数選択・ドラッグ&ドロップ可</div>
          <div class="doc-files"></div>
        </label>
        ${loanMode}
        <button type="submit" class="btn-primary btn-sm" style="width:100%;margin-top:10px">この書類を取り込む</button>
      </form>
      ${loanFooter}
    </div>`;
  };

  const docPanel = latest
    ? `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3>補助書類の取り込み（任意）</h3></div>
      <div class="card-body">
        <div class="doc-info">決算書を取り込めば分析は動きます。下記は<strong>精度を上げたい時だけ</strong>の任意項目です。決算書を入れ直すなら <a href="/?upload=1" style="font-weight:700">こちら</a>。</div>
        <div class="doc-grid">
          ${DOCS.map((d) => docCard(d, !!docRelevant[d.type])).join('')}
        </div>
      </div>
    </div>`
    : '';

  const noticeBanner = notice
    ? `<div style="background:#ecf6f8;border:1px solid #a8d8e0;color:#1b7f8e;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:14px">${notice}</div>`
    : '';

  const body =
    snapshots.length === 0
      ? `<div class="welcome-banner"><h2>財務データの確認・修正</h2><p>取り込みデータがありません。ダッシュボードで決算書・試算表を取り込んでください。</p></div>
         <div class="card"><div class="card-body"><a href="/" class="btn-primary">ダッシュボードで取り込む</a></div></div>`
      : `<div class="welcome-banner">
           <h2>分析に必要な書類の取り込み</h2>
           <p>決算書(BS/PL)に載っていない書類を、種類ごとに取り込むと、AIが必要な項目だけを読み取って財務分析AI・資金調達AI・事業計画AIに反映します。</p>
         </div>
         ${noticeBanner}
         ${docPanel}`;

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
    .doc-first{background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;border-radius:10px;padding:14px 16px;margin-bottom:14px;font-size:13px;line-height:1.7}
    .doc-info{background:#f0f9ff;border:1px solid #bae6fd;color:#075985;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px;line-height:1.6}
  </style>
  <a href="/agent/finance" style="display:inline-flex;align-items:center;gap:4px;margin-bottom:14px;color:var(--primary);font-weight:700;text-decoration:none;font-size:14px">← 財務分析AIに戻る</a>
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
