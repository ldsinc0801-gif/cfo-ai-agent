import { agentPageShell } from './shared.js';
import type { MonthlySnapshot } from '../types/trend.js';
import type { LoanDetail } from '../repositories/supabase-repository.js';
import {
  openingInterestBearingDebt,
  effectiveAnnualDebtRepayment,
  annualDebtRepaymentSource,
} from '../domain/finance/imported-metrics.js';

// 補助書類（決算書で埋まらない/読めなかった時の補完）。基本は決算書(BS/PL)で足りる。
const DOCS: { type: string; icon: string; label: string; desc: string }[] = [
  {
    type: 'loan_repayment', icon: '📄', label: '借入金の返済計画表',
    desc: '年間返済元本を正確に読み取ります（期首・期末残高は決算書から自動。差額でも概算表示）',
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
export function renderFinanceDataEditHTML(snapshots: MonthlySnapshot[], notice?: string, loanDetails: LoanDetail[] = []): string {
  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;
  // 借入金：期首→期末残高（決算書BSより）と年間返済元本（実績 or 期首−期末の概算）
  const openingDebt = openingInterestBearingDebt(snapshots);
  const endingDebt = latest?.interestBearingDebt ?? null;
  const effRepay = effectiveAnnualDebtRepayment(snapshots);
  const repaySource = annualDebtRepaymentSource(snapshots);
  // 決算書で埋まらない項目の検知
  const needDebt = !!latest && (latest.interestBearingDebt ?? 0) === 0; // 有利子負債
  const needDep = !!latest && (latest.depreciation ?? 0) === 0; // 減価償却費
  const docRelevant: Record<string, boolean> = {
    loan_repayment: repaySource === 'none',
    account_breakdown: needDebt,
    fixed_asset: needDep,
  };

  // --- 不足書類の取り込みパネル ---
  const fmtYen = (v: number | null | undefined) =>
    v == null ? '—' : '¥' + new Intl.NumberFormat('ja-JP').format(Math.round(v));
  const esc = (s: string) =>
    String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] as string));
  // 借入明細（借入先別）の行
  const loanRows = loanDetails.length
    ? loanDetails.map((d) => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px dashed var(--border)">
          <div style="font-size:13px;line-height:1.4">
            <strong style="color:var(--text)">${esc(d.lender)}</strong>
            <span style="color:var(--text2);font-size:12px;display:block">年間返済 ${fmtYen(d.annualRepayment)}${d.balance != null ? ` ／ 残高 ${fmtYen(d.balance)}` : ''}${d.interest != null ? ` ／ 利息 ${fmtYen(d.interest)}` : ''}</span>
          </div>
          <form method="post" action="/finance/delete-loan" onsubmit="return confirm('この借入（${esc(d.lender)}）を削除しますか？')">
            <input type="hidden" name="id" value="${esc(d.id)}">
            <button type="submit" title="削除" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:18px;line-height:1;padding:0 4px">×</button>
          </form>
        </div>`).join('')
    : '<div style="font-size:12px;color:var(--text2);padding:6px 0">まだ借入明細がありません。返済予定表を1件ずつ取り込んでください。</div>';
  const docCard = (d: (typeof DOCS)[number], highlight: boolean) => {
    const isLoan = d.type === 'loan_repayment';
    const loanMode = isLoan
      ? `<div style="margin-top:8px;text-align:left">
           <label style="display:block;font-size:12px;color:var(--text2);margin-bottom:4px">借入元（任意・空欄ならAIが写真から自動判定）</label>
           <input type="text" name="lender" placeholder="例: 熊本銀行 / 日本政策金融公庫" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:7px;font-size:13px;box-sizing:border-box;margin-bottom:6px">
           <div style="font-size:11px;color:var(--text2);line-height:1.6"><strong style="color:var(--text)">借入は1件ずつ</strong>取り込みます（複数ページの写真は全部まとめて選択）。取り込むたびに下の<strong style="color:var(--text)">借入明細に追加</strong>され、自動で合算されます。</div>
         </div>`
      : '';
    // 各カードに「今そのカードから取り込まれている値」を表示（返済計画表はリセット付き）
    const curValRow = (label: string, val: number | null | undefined) =>
      `<div style="font-size:13px">${label}：<strong style="font-size:16px;color:var(--text)">${fmtYen(val)}</strong></div>`;
    const repayBadge = repaySource === 'actual'
      ? '<span style="font-size:11px;color:#166534;background:#dcfce7;border-radius:4px;padding:1px 6px;margin-left:6px">返済計画表より</span>'
      : repaySource === 'estimated'
        ? '<span style="font-size:11px;color:#92400e;background:#fef3c7;border-radius:4px;padding:1px 6px;margin-left:6px">期首−期末で概算</span>'
        : '';
    const footer = isLoan
      ? `<div style="margin-top:12px;text-align:left;border-top:1px solid var(--border);padding-top:10px">
           <div style="font-size:12px;color:var(--text2);margin-bottom:8px">期首借入金残高 <strong style="color:var(--text)">${fmtYen(openingDebt)}</strong> → 期末借入金残高 <strong style="color:var(--text)">${fmtYen(endingDebt)}</strong> <span style="color:#94a3b8">（決算書より自動）</span></div>
           <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:2px">借入明細（借入先別）</div>
           <div style="margin-bottom:8px">${loanRows}</div>
           <div style="margin-bottom:8px">年間返済元本 合計：<strong style="font-size:17px;color:var(--text)">${fmtYen(effRepay)}</strong>${repayBadge}</div>
           <form method="post" action="/finance/reset-loan" onsubmit="return confirm('借入明細を全て消去し、年間返済元本を0に戻します（決算書由来の残高・利息はそのまま）。よろしいですか？')">
             <button type="submit" style="width:100%;background:#f97316;color:#fff;border:none;border-radius:8px;padding:11px;font-size:14px;font-weight:700;cursor:pointer">🔄 借入明細を全てリセット</button>
           </form>
           <div style="font-size:11px;color:var(--text2);margin-top:6px">※ 1件だけ消したい時は各行の × 。全部やり直す時はこのリセット。</div>
         </div>`
      : d.type === 'account_breakdown'
        ? `<div style="margin-top:12px;text-align:left;border-top:1px solid var(--border);padding-top:10px">${curValRow('現在の借入残高（有利子負債）', latest?.interestBearingDebt)}</div>`
        : d.type === 'fixed_asset'
          ? `<div style="margin-top:12px;text-align:left;border-top:1px solid var(--border);padding-top:10px">${curValRow('現在の減価償却費', latest?.depreciation)}</div>`
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
        <button type="submit" class="btn-primary btn-sm" style="width:100%;margin-top:10px">${isLoan ? 'この借入を取り込む（合算）' : 'この書類を取り込む'}</button>
      </form>
      ${footer}
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
