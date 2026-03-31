import { agentPageShell } from './shared.js';

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
export function renderFundingAgentHTML(): string {
  return agentPageShell({
    active: 'funding',
    title: '資金調達AIエージェント',
    bodyHTML: `
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
      <div class="card">
        <div class="card-header"><h3>現在の銀行評価</h3></div>
        <div class="card-body">
          <div class="status-card" style="border:none;padding:16px">
            <div class="status-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></div>
            <div class="status-title">ダッシュボードで確認</div>
            <div class="status-desc">銀行評価の主要指標（自己資本比率・債務償還年数・月商倍率等）はダッシュボードに表示されています。</div>
            <a href="/" class="btn-primary" style="margin-top:16px">ダッシュボードを見る</a>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>資金調達ステータス</h3></div>
        <div class="card-body">
          <table>
            <thead><tr><th>項目</th><th>ステータス</th></tr></thead>
            <tbody>
              <tr><td>資金繰り余力</td><td>約3.1か月（安全）</td></tr>
              <tr><td>銀行評価スコア</td><td>良好（Good）</td></tr>
              <tr><td>直近の資金調達</td><td>未登録</td></tr>
              <tr><td>返済予定</td><td>未登録</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>`,
  });
}
