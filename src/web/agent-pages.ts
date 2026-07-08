import { agentPageShell } from './shared.js';
import type { ImportedMetrics } from '../domain/finance/imported-metrics.js';
import type { CashflowForecast } from '../domain/finance/cashflow-forecast.js';

/**
 * 取り込みデータから算出した銀行評価の主要指標カード。
 * 有利子負債が必要な指標（債務償還年数等）は注記で「要詳細取込」を明示。
 */
export function renderBankMetricsCard(m: ImportedMetrics): string {
  const fmtPct = (v: number | null) => (v === null ? '—' : v.toFixed(1) + '%');
  const fmtMonths = (v: number | null) => (v === null ? '—' : v.toFixed(1) + 'か月');
  const fmtYears = (v: number | null) => (v === null ? '算出不可' : v === 0 ? '無借金' : v.toFixed(1) + '年');
  const period = `${m.latest.year}年${m.latest.month}月`;
  const row = (label: string, value: string, sub: string) => `
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid var(--border)">
      <div><div style="font-weight:700;font-size:14px">${label}</div><div style="font-size:11px;color:var(--text2);margin-top:2px">${sub}</div></div>
      <div style="font-size:20px;font-weight:800;font-variant-numeric:tabular-nums">${value}</div>
    </div>`;
  return `
  <div class="card">
    <div class="card-header"><h3>銀行評価の主要指標</h3><span class="card-sub">取込データ ${period} 時点</span></div>
    <div class="card-body">
      ${row('自己資本比率', fmtPct(m.equityRatio), '純資産 ÷ 総資産。20%以上が一つの目安')}
      ${row('流動比率', fmtPct(m.currentRatio), '流動資産 ÷ 流動負債。120%以上が目安')}
      ${row('現預金月商倍率', fmtMonths(m.cashMonthsRatio), '現預金 ÷ 月商。1〜2か月以上で安心')}
      ${row('債務償還年数', fmtYears(m.debtRepaymentYears), '有利子負債 ÷(経常利益+減価償却費)。10年以内が目安')}
      ${row('借入依存度', fmtPct(m.interestDependency), '有利子負債 ÷ 総資産')}
      ${row('営業利益率', fmtPct(m.operatingMargin), '営業利益 ÷ 売上')}
      ${row('経常利益率', fmtPct(m.ordinaryMargin), '経常利益 ÷ 売上')}
      ${m.interestBearingDebt <= 0 ? `<div style="margin-top:14px;font-size:12px;color:#6b7280;background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:10px 12px;line-height:1.6">有利子負債が 0 として取り込まれています。借入がある場合は、有利子負債（借入金）が記載された決算書を取り込むか、下記から手入力してください。</div>` : ''}
      <div style="margin-top:14px"><a href="/finance/data-edit" style="font-size:13px;color:var(--primary);font-weight:700;text-decoration:none">→ 不足書類のアップロード</a></div>
    </div>
  </div>`;
}

/**
 * 財務分析AI: 取り込みデータから主要指標を表示するページ（freee未接続時）。
 */
export function renderFinanceImportedHTML(metrics: ImportedMetrics): string {
  return agentPageShell({
    active: 'finance',
    title: '財務分析AIエージェント',
    bodyHTML: `
    <div class="welcome-banner">
      <h2>財務分析AIエージェント</h2>
      <p>ダッシュボードで取り込んだ決算データから、正確に算出できる主要指標を表示しています。129点満点の詳細な銀行格付には、有利子負債を含む詳細な決算データ（freee連携 or 詳細取込）が必要です。</p>
    </div>
    <div class="grid-2">
      ${renderBankMetricsCard(metrics)}
      <div class="card">
        <div class="card-header"><h3>データの取込元</h3></div>
        <div class="card-body">
          <p style="font-size:13px;color:var(--text2);line-height:1.7">この指標は、ダッシュボードで登録した決算書・試算表（${metrics.monthsCount}か月分）を基に算出しています。数値を更新するには、ダッシュボードから最新の資料を取り込んでください。</p>
          <a href="/" class="btn-primary" style="margin-top:12px">ダッシュボードで取込・確認</a>
        </div>
      </div>
    </div>`,
  });
}

/**
 * 財務分析AIエージェントページ
 */
export function renderFinanceAgentHTML(): string {
  return agentPageShell({
    active: 'finance',
    title: '財務分析AIエージェント',
    bodyHTML: `
    <div class="welcome-banner">
      <h2>財務分析AIエージェント</h2>
      <p>freeeの会計データをAIが自動分析し、収益性・安全性・効率性の観点から財務状況を診断します。業界水準との比較や改善提案もAIが行います。</p>
    </div>

    <div class="feature-grid">
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>収益性分析</h4>
          <p>売上総利益率、営業利益率、経常利益率、ROA等の収益指標を自動算出し、推移・トレンドを分析します。</p>
          <span class="pill pill--sm pill--coming">実装済み</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>安全性分析</h4>
          <p>流動比率、自己資本比率、固定長期適合率等から財務の健全性を評価します。</p>
          <span class="pill pill--sm pill--coming">実装済み</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>効率性分析</h4>
          <p>総資産回転率、売上債権回転率、棚卸資産回転率等から経営効率を評価します。</p>
          <span class="pill pill--sm pill--coming">開発予定</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>異常検知</h4>
          <p>前月比30%以上の費用変動、売上急減、赤字転落等を自動検出してアラートします。</p>
          <span class="pill pill--sm pill--coming">実装済み</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>業界比較</h4>
          <p>同業種の財務データと比較し、自社のポジションを可視化します。</p>
          <span class="pill pill--sm pill--coming">開発予定</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>AIコメント生成</h4>
          <p>数値の羅列ではなく、経営者が理解しやすい自然言語で財務状況を解説します。</p>
          <span class="pill pill--sm pill--coming">実装済み</span>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h3>分析対象データ</h3></div>
        <div class="card-body">
          <table>
            <thead><tr><th>データ</th><th>ソース</th><th>ステータス</th></tr></thead>
            <tbody>
              <tr><td>試算表（PL）</td><td>freee API</td><td><span class="pill pill--sm pill--coming">接続可</span></td></tr>
              <tr><td>試算表（BS）</td><td>freee API</td><td><span class="pill pill--sm pill--coming">接続可</span></td></tr>
              <tr><td>勘定科目マスタ</td><td>freee API</td><td><span class="pill pill--sm pill--coming">接続可</span></td></tr>
              <tr><td>取引明細</td><td>freee API</td><td><span class="pill pill--sm pill--coming">接続可</span></td></tr>
              <tr><td>業界平均データ</td><td>外部DB</td><td><span class="pill pill--sm pill--coming">未接続</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>直近の分析結果</h3></div>
        <div class="card-body">
          <div class="status-card" style="border:none;padding:16px">
            <div class="status-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></div>
            <div class="status-title">ダッシュボードで確認</div>
            <div class="status-desc">最新の財務分析結果はダッシュボードに表示されています。詳細レポートは「月次レポート」から出力できます。</div>
            <a href="/" class="btn-primary" style="margin-top:16px">ダッシュボードを見る</a>
          </div>
        </div>
      </div>
    </div>`,
  });
}

/**
 * 会計AIエージェントページ
 */
export function renderAccountingAgentHTML(): string {
  return agentPageShell({
    active: 'accounting',
    title: '会計AIエージェント',
    bodyHTML: `
    <div class="welcome-banner" style="background:linear-gradient(135deg,#2298ae 0%,#4dbdcf 100%)">
      <h2>会計AIエージェント</h2>
      <p>日々の経理業務をAIがサポートします。仕訳チェック、勘定科目の自動提案、経費精算の自動化、月次締め作業の効率化を実現します。</p>
    </div>

    <div class="feature-grid">
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>仕訳チェック</h4>
          <p>登録済みの仕訳を自動チェックし、勘定科目の誤り・金額の不整合・消費税の区分ミスを検出します。</p>
          <span class="pill pill--sm pill--coming">開発予定</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>勘定科目の自動提案</h4>
          <p>取引内容の摘要から適切な勘定科目をAIが推定し、仕訳候補を提案します。</p>
          <span class="pill pill--sm pill--coming">開発予定</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>経費精算の自動化</h4>
          <p>領収書の画像からAIが金額・店名・日付を読み取り、自動で仕訳を作成します。</p>
          <span class="pill pill--sm pill--coming">開発予定</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>月次締めチェックリスト</h4>
          <p>月次締め作業のチェックリストを自動生成し、未処理項目・残高不整合を検出します。</p>
          <span class="pill pill--sm pill--coming">開発予定</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>異常仕訳の検出</h4>
          <p>過去の仕訳パターンと比較し、金額が異常に大きい・通常と異なる科目の仕訳をアラートします。</p>
          <span class="pill pill--sm pill--coming">開発予定</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>消費税チェック</h4>
          <p>インボイス制度対応の消費税区分チェック、適格請求書番号の検証を行います。</p>
          <span class="pill pill--sm pill--coming">開発予定</span>
        </div>
      </div>
    </div>

    <div class="status-card">
      <div class="status-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></div>
      <div class="status-title">開発中</div>
      <div class="status-desc">会計AIエージェントは現在開発中です。freee APIの仕訳データ・取引データとの連携を準備しています。まずは「仕訳チェック」機能から実装予定です。</div>
    </div>`,
  });
}

/**
 * 資金調達AIエージェントページ
 */
export function renderFundingAgentHTML(
  metrics?: ImportedMetrics | null,
  forecast?: CashflowForecast | null,
  loanDetails: { id: string; lender: string; annualRepayment: number; balance: number | null; interest: number | null }[] = [],
): string {
  const fmtYen = (n: number) => (n < 0 ? '-' : '') + '¥' + new Intl.NumberFormat('ja-JP').format(Math.abs(Math.round(n)));
  const esc = (s: string) =>
    String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const loanCard = loanDetails.length === 0 ? '' : `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3>借入先別の明細</h3><span class="card-sub">どこから・いくら借りて・年いくら返すか</span></div>
      <div class="card-body">
        <table style="width:100%;font-size:13px;border-collapse:collapse">
          <thead><tr>
            <th style="text-align:left;padding:8px 4px;border-bottom:2px solid var(--border)">借入先</th>
            <th style="text-align:right;padding:8px 4px;border-bottom:2px solid var(--border)">借入残高</th>
            <th style="text-align:right;padding:8px 4px;border-bottom:2px solid var(--border)">年間返済元本</th>
            <th style="text-align:right;padding:8px 4px;border-bottom:2px solid var(--border)">年間利息</th>
          </tr></thead>
          <tbody>${loanDetails.map((d) => `<tr>
            <td style="padding:8px 4px;border-bottom:1px solid var(--border)"><strong>${esc(d.lender)}</strong></td>
            <td style="text-align:right;padding:8px 4px;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums">${d.balance != null ? fmtYen(d.balance) : '—'}</td>
            <td style="text-align:right;padding:8px 4px;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums">${fmtYen(d.annualRepayment)}</td>
            <td style="text-align:right;padding:8px 4px;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums">${d.interest != null ? fmtYen(d.interest) : '—'}</td>
          </tr>`).join('')}
          <tr style="font-weight:800">
            <td style="padding:8px 4px">合計</td>
            <td style="text-align:right;padding:8px 4px;font-variant-numeric:tabular-nums">${fmtYen(loanDetails.reduce((a, d) => a + (d.balance || 0), 0))}</td>
            <td style="text-align:right;padding:8px 4px;font-variant-numeric:tabular-nums">${fmtYen(loanDetails.reduce((a, d) => a + (d.annualRepayment || 0), 0))}</td>
            <td style="text-align:right;padding:8px 4px;font-variant-numeric:tabular-nums">${fmtYen(loanDetails.reduce((a, d) => a + (d.interest || 0), 0))}</td>
          </tr></tbody>
        </table>
        <p style="font-size:11px;color:var(--text2);margin-top:8px">※ 借入先の集中度・政策金融/民間の別は融資審査で重視されます。編集は<a href="/finance/data-edit" style="color:var(--primary)">財務データの取込</a>から。</p>
      </div>
    </div>`;
  const forecastCard = !forecast ? '' : `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3>資金繰り予測（簡易）</h3><span class="card-sub">現預金の月次推移から算出</span></div>
      <div class="card-body">
        ${!forecast.hasEnoughData
          ? `<div style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.6">月次推移データが不足しています。ダッシュボードで<strong>月次推移試算表</strong>を取り込むと、先6か月の資金繰りを予測できます。</div>`
          : `
          <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:14px">
            <div><div style="font-size:12px;color:var(--text2)">現在の現預金</div><div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums">${fmtYen(forecast.currentCash)}</div></div>
            <div><div style="font-size:12px;color:var(--text2)">月次純増減（平均）</div><div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;color:${forecast.monthlyNetCF >= 0 ? '#16a34a' : '#dc2626'}">${forecast.monthlyNetCF >= 0 ? '+' : ''}${fmtYen(forecast.monthlyNetCF)}</div></div>
          </div>
          ${forecast.shortage
            ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.6">⚠ <strong>${forecast.shortage.label}</strong> 頃に資金ショートの見込み（残高 ${fmtYen(forecast.shortage.balance)}）。早めの資金調達を検討してください。</div>`
            : `<div style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;border-radius:8px;padding:12px 14px;font-size:13px">✓ 6か月先まで資金ショートの見込みはありません。</div>`}
          <table style="width:100%;margin-top:14px;font-size:13px;border-collapse:collapse">
            <thead><tr><th style="text-align:left;padding:6px 4px;border-bottom:1px solid var(--border)">月</th><th style="text-align:right;padding:6px 4px;border-bottom:1px solid var(--border)">現預金残高（見込み）</th></tr></thead>
            <tbody>${forecast.projection.map((p) => `<tr><td style="padding:6px 4px">${p.label}</td><td style="text-align:right;padding:6px 4px;font-variant-numeric:tabular-nums;${p.balance < 0 ? 'color:#dc2626;font-weight:700' : ''}">${fmtYen(p.balance)}</td></tr>`).join('')}</tbody>
          </table>
          <p style="font-size:11px;color:var(--text2);margin-top:8px">※ 直近の現預金増減ペースが続くと仮定した簡易予測です。返済計画・大口入出金の予定は反映されません。</p>`}
      </div>
    </div>`;
  return agentPageShell({
    active: 'funding',
    title: '資金調達AIエージェント',
    bodyHTML: `
    ${loanCard}
    ${forecastCard}
    <div class="welcome-banner" style="background:linear-gradient(135deg,#1b7f8e 0%,#8dd0da 100%)">
      <h2>資金調達AIエージェント</h2>
      <p>資金繰りの見通し、融資可能性の診断、金融機関向け資料の自動生成を行います。銀行目線での自社評価を可視化し、最適な資金調達戦略を提案します。</p>
    </div>

    <div class="feature-grid">
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>資金繰り予測</h4>
          <p>過去の入出金パターンから今後3〜6か月の資金繰りを予測し、資金ショートのリスクを事前に検出します。</p>
          <span class="pill pill--sm pill--coming">開発予定</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>銀行評価シミュレーション</h4>
          <p>自己資本比率・債務償還年数・営業利益率等から、金融機関がどう評価するかをシミュレーションします。</p>
          <span class="pill pill--sm pill--coming">実装済み</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>金融機関向け資料生成</h4>
          <p>融資申込時に必要な財務説明資料（経営状況報告書）をAIが自動生成します。</p>
          <span class="pill pill--sm pill--coming">開発予定</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>資金調達オプション提案</h4>
          <p>銀行融資・日本政策金融公庫・補助金・助成金等、自社に適した資金調達手段をAIが提案します。</p>
          <span class="pill pill--sm pill--coming">開発予定</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>返済シミュレーション</h4>
          <p>融資額・金利・返済期間を入力し、月次の返済計画と資金繰りへの影響を可視化します。</p>
          <span class="pill pill--sm pill--coming">開発予定</span>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="feature-text">
          <h4>資金アラート</h4>
          <p>現預金が一定水準を下回った際のアラート、大口入出金の予定通知を行います。</p>
          <span class="pill pill--sm pill--coming">開発予定</span>
        </div>
      </div>
    </div>

    <div class="grid-2">
      ${metrics ? renderBankMetricsCard(metrics) : `
      <div class="card">
        <div class="card-header"><h3>現在の銀行評価</h3></div>
        <div class="card-body">
          <div class="status-card" style="border:none;padding:16px">
            <div class="status-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></div>
            <div class="status-title">取り込みデータがありません</div>
            <div class="status-desc">ダッシュボードで決算書・試算表を取り込むと、自己資本比率・流動比率・現預金月商倍率などの主要指標をここに表示します。</div>
            <a href="/" class="btn-primary" style="margin-top:16px">ダッシュボードで取り込む</a>
          </div>
        </div>
      </div>`}
      <div class="card">
        <div class="card-header"><h3>資金調達ステータス</h3></div>
        <div class="card-body">
          <table>
            <thead><tr><th>項目</th><th>ステータス</th></tr></thead>
            <tbody>
              <tr><td>現預金月商倍率</td><td>${metrics && metrics.cashMonthsRatio !== null ? metrics.cashMonthsRatio.toFixed(1) + 'か月' : '未取込'}</td></tr>
              <tr><td>自己資本比率</td><td>${metrics && metrics.equityRatio !== null ? metrics.equityRatio.toFixed(1) + '%' : '未取込'}</td></tr>
              <tr><td>直近の資金調達</td><td>未登録</td></tr>
              <tr><td>返済予定</td><td>未登録</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>`,
  });
}
