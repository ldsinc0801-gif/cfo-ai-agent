/**
 * 銀行格付スコアリング結果ページ
 */
import type { BankRatingResult, AdditionalMetrics, RatingMetric, MetricLevel } from '../types/bank-rating.js';
import { agentPageShell, esc } from './shared.js';

const LEVEL_LABELS: Record<MetricLevel, string> = {
  excellent: '優秀',
  good: '良好',
  fair: '普通',
  warning: '注意',
  danger: '危険',
};

const LEVEL_COLORS: Record<MetricLevel, string> = {
  excellent: '#2298ae',
  good: '#2298ae',
  fair: '#3da8b8',
  warning: '#5ab4c4',
  danger: '#ef4444',
};

const CATEGORY_LABELS: Record<string, string> = {
  stability: '安定性',
  profitability: '収益性',
  growth: '成長性',
  repayment: '返済能力',
};

function levelBadge(level: MetricLevel): string {
  return `<span class="pill pill--${level} pill--sm">${LEVEL_LABELS[level]}</span>`;
}

function priorityBadge(p: 'high' | 'medium' | 'low'): string {
  const labels: Record<string, string> = { high: '高', medium: '中', low: '低' };
  return `<span class="pill pill--priority-${p} pill--sm">${labels[p]}</span>`;
}

function formatValue(value: number | null, unit: string): string {
  if (value === null) return '—';
  if (unit === '円') {
    return new Intl.NumberFormat('ja-JP').format(value);
  }
  if (unit === '%' || unit === '倍' || unit === '年') {
    return value.toFixed(1);
  }
  return String(value);
}

function formatCurrency(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('ja-JP').format(value) + ' 円';
}

function rankColor(rank: string): string {
  switch (rank) {
    case 'A': return '#2298ae';
    case 'B': return '#2298ae';
    case 'C': return '#3da8b8';
    case 'D': return '#5ab4c4';
    case 'E': return '#ef4444';
    default: return '#6b7280';
  }
}

export interface RatingPageOptions {
  aiAvailable: boolean;
  aiCommentary: string | null;
  source: 'mock' | 'upload' | 'freee';
  fileName?: string;
  extractionNotes?: string[];
  analysisId?: string;
  savedAt?: string;
}

export function renderRatingHTML(
  rating: BankRatingResult,
  additional: AdditionalMetrics,
  options: RatingPageOptions = { aiAvailable: false, aiCommentary: null, source: 'mock' },
): string {
  const scorePercent = Math.round((rating.totalScore / rating.maxScore) * 100);

  // Category data for radar chart
  const categories = [
    { key: 'stability', label: '安定性', score: rating.stabilityScore, max: rating.stabilityMax },
    { key: 'profitability', label: '収益性', score: rating.profitabilityScore, max: rating.profitabilityMax },
    { key: 'growth', label: '成長性', score: rating.growthScore, max: rating.growthMax },
    { key: 'repayment', label: '返済能力', score: rating.repaymentScore, max: rating.repaymentMax },
  ];

  // Group metrics by category
  const groupedMetrics: Record<string, RatingMetric[]> = {
    stability: [],
    profitability: [],
    growth: [],
    repayment: [],
  };
  for (const m of rating.metrics) {
    if (groupedMetrics[m.category]) {
      groupedMetrics[m.category].push(m);
    }
  }

  // データソース表示
  const sourceLabel = options.source === 'upload' ? `アップロード: ${esc(options.fileName ?? '')}` :
                      options.source === 'freee' ? 'freee APIから取得' :
                      'デモデータ（モック）';

  const extractionNotesHTML = options.extractionNotes && options.extractionNotes.length > 0
    ? `<div class="extraction-notes"><strong>AI抽出メモ:</strong><ul>${options.extractionNotes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>`
    : '';

  const aiCommentaryHTML = buildAICommentaryHTML(options.aiCommentary, rating);

  const bodyHTML = `
<style>
/* ---------- Rating page specific styles ---------- */
.data-source-panel{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px}
.source-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;text-align:center;cursor:pointer;text-decoration:none;color:var(--text);transition:all .2s}
.source-card:hover{border-color:var(--primary);box-shadow:0 2px 8px rgba(99,102,241,0.12)}
.source-card.active{border-color:var(--primary);background:var(--primary-light)}
.source-card .source-icon{font-size:28px;margin-bottom:8px}
.source-card h4{font-size:14px;font-weight:700;margin-bottom:4px}
.source-card p{font-size:12px;color:var(--text2);line-height:1.4}
.upload-inline{border:2px dashed var(--border);border-radius:12px;padding:32px;text-align:center;margin-bottom:24px;transition:all .2s}
.upload-inline:hover{border-color:var(--primary);background:var(--primary-light)}
.upload-inline .btn-upload{display:inline-block;padding:8px 20px;border-radius:8px;background:var(--primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer}
.upload-inline p{font-size:13px;color:var(--text2);margin-top:8px}
.source-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;font-size:13px;font-weight:600;margin-bottom:16px}
.source-badge--mock{background:#e5e7eb;color:#6b7280}
.source-badge--upload{background:#d5eef3;color:#1b7f8e}
.source-badge--freee{background:#d5eef3;color:#1b7f8e}
.analysis-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.save-status{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#1b7f8e}
.toolbar-actions{display:flex;gap:6px;margin-left:auto}
.toolbar-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:6px;background:var(--bg);border:1px solid var(--border);font-size:12px;font-weight:600;color:var(--text2);text-decoration:none;cursor:pointer;transition:all .15s}
.toolbar-btn:hover{border-color:var(--primary);color:var(--primary)}
.extraction-notes{background:#ecf6f8;border:1px solid #a8d8e0;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px}
.extraction-notes ul{margin:4px 0 0 16px}
.extraction-notes li{margin-bottom:2px}
.ai-commentary{font-size:14px;line-height:1.75;color:var(--text)}
.ai-commentary h3,.ai-commentary h4{font-size:15px;font-weight:700;margin:12px 0 6px;color:var(--text)}
.ai-commentary li{margin-left:16px;margin-bottom:4px}

/* Upload confirm */
.upload-confirm{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;background:var(--primary-light);border:1px solid var(--primary);border-radius:12px;margin-bottom:24px}
.upload-file-info{display:flex;align-items:center;gap:12px}
.upload-file-name{font-size:15px;font-weight:700;color:var(--text)}
.upload-file-size{font-size:12px;color:var(--text2);margin-top:2px}
.upload-actions{display:flex;gap:8px;align-items:center}

/* Progress */
.upload-progress{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:28px;margin-bottom:24px}
.progress-steps{display:flex;flex-direction:column;gap:4px;margin-bottom:20px}
.progress-step{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:8px;opacity:0.4;transition:all .4s ease}
.progress-step.active{opacity:1;background:var(--primary-light)}
.progress-step.done{opacity:0.7;background:#d5eef3}
.progress-step.done .progress-step-icon{color:var(--green)}
.progress-step.done .step-num{display:none}
.progress-step.done .progress-step-icon::after{content:'✓';font-size:16px;font-weight:700;color:var(--green)}
.progress-step-icon{width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.step-num{width:24px;height:24px;border-radius:50%;background:var(--border);color:var(--text2);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}
.progress-step.active .step-num{background:var(--primary);color:#fff}
.progress-step-title{font-size:14px;font-weight:700;color:var(--text)}
.progress-step-desc{font-size:12px;color:var(--text2);margin-top:1px}
.progress-step.active .spinner{display:block}
.progress-step:not(.active) .spinner{display:none}

.progress-bar-wrap{height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin-bottom:12px}
.progress-bar{height:100%;background:linear-gradient(90deg,var(--primary),#4dbdcf);border-radius:3px;width:0;transition:width 1.5s ease}
.progress-note{text-align:center;font-size:12px;color:var(--text2)}

@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.spinner{animation:spin 1s linear infinite}

.rating-banner{background:linear-gradient(135deg,#2298ae 0%,#a78bfa 50%,#4dbdcf 100%);border-radius:var(--radius);padding:32px 36px;margin-bottom:28px;color:#fff;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px}
.rating-banner h2{font-size:22px;font-weight:700;margin-bottom:4px}
.rating-banner .banner-score{font-size:52px;font-weight:800;letter-spacing:-0.03em}
.rating-banner .banner-score span{font-size:20px;font-weight:500;opacity:0.8}

.score-section{display:flex;gap:28px;flex-wrap:wrap;margin-bottom:28px}
.score-circle-wrap{display:flex;flex-direction:column;align-items:center;gap:12px}
.score-circle{position:relative;width:180px;height:180px}
.score-circle .circle-bg{width:180px;height:180px;border-radius:50%;background:conic-gradient(var(--primary) calc(var(--pct) * 1%),#e5e7eb calc(var(--pct) * 1%));display:flex;align-items:center;justify-content:center}
.score-circle .circle-inner{width:140px;height:140px;border-radius:50%;background:var(--card);display:flex;flex-direction:column;align-items:center;justify-content:center}
.score-circle .circle-value{font-size:36px;font-weight:800;color:var(--text);letter-spacing:-0.02em}
.score-circle .circle-max{font-size:13px;color:var(--text2);margin-top:2px}
.score-rank{display:inline-flex;align-items:center;gap:8px;font-size:18px;font-weight:700;padding:6px 18px;border-radius:10px}
.score-rank .rank-letter{font-size:28px;font-weight:800}

.category-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;flex:1;min-width:300px}
.category-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px;text-align:center}
.category-card h4{font-size:13px;font-weight:700;margin-bottom:10px;color:var(--text2)}
.category-card .cat-score{font-size:24px;font-weight:800;color:var(--text)}
.category-card .cat-score span{font-size:14px;font-weight:500;color:var(--text2)}
.cat-bar{height:6px;border-radius:3px;background:#e5e7eb;margin-top:10px;overflow:hidden}
.cat-bar-fill{height:100%;border-radius:3px;background:var(--primary);transition:width .4s ease}

.metric-table th,.metric-table td{padding:10px 14px;font-size:13px}
.metric-table .cat-header td{background:#f8f9fb;font-weight:700;font-size:13px;color:var(--primary);border-bottom:2px solid var(--primary)}

.pill--excellent{background:rgba(59,130,246,0.12);color:#2298ae}
.pill--good{background:rgba(34,197,94,0.12);color:#2298ae}
.pill--fair{background:rgba(234,179,8,0.12);color:#b45309}
.pill--warning{background:rgba(245,158,11,0.12);color:#1b7f8e}
.pill--danger{background:rgba(239,68,68,0.12);color:#ef4444}

.pill--priority-high{background:rgba(239,68,68,0.12);color:#ef4444}
.pill--priority-medium{background:rgba(245,158,11,0.12);color:#1b7f8e}
.pill--priority-low{background:rgba(34,197,94,0.12);color:#2298ae}

.opinions-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:28px}
.opinion-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px}
.opinion-card h4{font-size:14px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:6px}
.opinion-card ul{list-style:none;padding:0}
.opinion-card li{padding:6px 0;font-size:13px;line-height:1.55;border-bottom:1px solid var(--border);color:var(--text)}
.opinion-card li:last-child{border-bottom:none}
.opinion-positive h4{color:#2298ae}
.opinion-negative h4{color:#ef4444}
.opinion-caution h4{color:#5ab4c4}

.additional-block{background:#faf5ff;border:1px solid #e9d5ff;border-radius:var(--radius);padding:24px;margin-bottom:28px}
.additional-block h3{font-size:15px;font-weight:700;margin-bottom:4px}
.additional-block .additional-note{font-size:12px;color:#7c3aed;margin-bottom:16px}
.additional-item{display:flex;gap:16px;padding:12px 0;border-bottom:1px solid #e9d5ff}
.additional-item:last-child{border-bottom:none}
.additional-item .add-label{font-weight:700;font-size:13px;min-width:120px;color:var(--text)}
.additional-item .add-value{font-size:15px;font-weight:700;color:var(--text);min-width:120px}
.additional-item .add-comment{font-size:13px;color:var(--text2);flex:1}

.callout{background:var(--card);border-left:4px solid var(--primary);border-radius:0 var(--radius) var(--radius) 0;padding:20px 24px;margin-bottom:28px}
.callout h3{font-size:15px;font-weight:700;margin-bottom:12px}
.callout ul{list-style:none;padding:0}
.callout li{padding:6px 0;font-size:13px;line-height:1.6;border-bottom:1px solid var(--border)}
.callout li:last-child{border-bottom:none}

.questions-list{list-style:none;padding:0;counter-reset:q}
.questions-list li{counter-increment:q;padding:10px 0;font-size:13px;line-height:1.6;border-bottom:1px solid var(--border);display:flex;gap:10px}
.questions-list li:last-child{border-bottom:none}
.questions-list li::before{content:counter(q);display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--primary-light);color:var(--primary);font-size:12px;font-weight:700;flex-shrink:0}

.radar-section{display:flex;gap:28px;flex-wrap:wrap;align-items:start;margin-bottom:28px}
.radar-chart-wrap{width:340px;height:340px;flex-shrink:0}

@media(max-width:768px){
  .rating-banner{flex-direction:column;text-align:center}
  .category-grid{grid-template-columns:repeat(2,1fr)}
  .opinions-grid{grid-template-columns:1fr}
  .score-section{flex-direction:column;align-items:center}
  .radar-chart-wrap{width:100%;max-width:340px}
}
</style>

<!-- Data Source Panel -->
<div class="data-source-panel">
  <a href="/agent/finance" class="source-card ${options.source === 'mock' ? 'active' : ''}">
    <div class="source-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></div>
    <h4>デモデータ</h4>
    <p>モックデータで格付を確認</p>
  </a>
  <a href="/agent/finance/freee" class="source-card ${options.source === 'freee' ? 'active' : ''}">
    <div class="source-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></div>
    <h4>freeeから分析</h4>
    <p>freee APIの会計データを使用</p>
  </a>
  <div class="source-card ${options.source === 'upload' ? 'active' : ''}" style="cursor:default">
    <div class="source-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
    <h4>決算書アップロード</h4>
    <p>PDF / CSVを財務分析AIが分析</p>
  </div>
</div>

<!-- Upload Area -->
<form action="/agent/finance/analyze" method="post" enctype="multipart/form-data" id="analyzeForm">
  <!-- Step 1: ファイル選択 -->
  <div class="upload-inline" id="uploadStep1">
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" style="margin-bottom:8px">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
    <label class="btn-upload" style="margin-bottom:8px">
      決算書をアップロードして分析
      <input type="file" name="file" accept=".pdf,.csv,.xlsx" hidden id="financeFileInput"/>
    </label>
    <p>PDF・CSV・Excelの決算書を財務分析AIエージェントが読み取り、自動で銀行格付を算出します</p>
    ${!options.aiAvailable ? '<p style="color:var(--red);font-size:12px;margin-top:4px">ANTHROPIC_API_KEYが未設定のため、AI分析は利用できません</p>' : ''}
  </div>

  <!-- Step 2: ファイル確認 -->
  <div class="upload-confirm" id="uploadStep2" style="display:none">
    <div class="upload-file-info">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <div>
        <div class="upload-file-name" id="selectedFileName"></div>
        <div class="upload-file-size" id="selectedFileSize"></div>
      </div>
    </div>
    <div class="upload-actions">
      <button type="button" class="btn-secondary btn-sm" onclick="resetUpload()">キャンセル</button>
      <button type="submit" class="btn-primary" id="submitBtn">分析を開始</button>
    </div>
  </div>

  <!-- Step 3: 分析中 -->
  <div class="upload-progress" id="uploadStep3" style="display:none">
    <div class="progress-steps">
      <div class="progress-step active" id="pStep1">
        <div class="progress-step-icon">
          <svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.2"/><path d="M12 2a10 10 0 019.95 9" stroke-linecap="round"/></svg>
        </div>
        <div class="progress-step-text">
          <div class="progress-step-title">ファイルアップロード中...</div>
          <div class="progress-step-desc">サーバーにファイルを送信しています</div>
        </div>
      </div>
      <div class="progress-step" id="pStep2">
        <div class="progress-step-icon"><span class="step-num">2</span></div>
        <div class="progress-step-text">
          <div class="progress-step-title">AI読み取り</div>
          <div class="progress-step-desc">決算書の数値を財務分析AIエージェントが抽出します</div>
        </div>
      </div>
      <div class="progress-step" id="pStep3">
        <div class="progress-step-icon"><span class="step-num">3</span></div>
        <div class="progress-step-text">
          <div class="progress-step-title">格付計算</div>
          <div class="progress-step-desc">129点満点でスコアリングを実行します</div>
        </div>
      </div>
      <div class="progress-step" id="pStep4">
        <div class="progress-step-icon"><span class="step-num">4</span></div>
        <div class="progress-step-text">
          <div class="progress-step-title">AIコメント生成</div>
          <div class="progress-step-desc">経営者向けの解説を生成します</div>
        </div>
      </div>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-bar" id="progressBar"></div>
    </div>
    <p class="progress-note">分析には30秒〜1分ほどかかります。画面を閉じないでください。</p>
  </div>
</form>

<script>
(function(){
  var fileInput = document.getElementById('financeFileInput');
  var form = document.getElementById('analyzeForm');
  var step1 = document.getElementById('uploadStep1');
  var step2 = document.getElementById('uploadStep2');
  var step3 = document.getElementById('uploadStep3');
  var nameEl = document.getElementById('selectedFileName');
  var sizeEl = document.getElementById('selectedFileSize');
  var progressBar = document.getElementById('progressBar');

  // ドラッグ&ドロップ
  var dz = step1;
  ['dragenter','dragover'].forEach(function(e){
    dz.addEventListener(e, function(ev){ev.preventDefault();dz.classList.add('dragover')});
  });
  ['dragleave','drop'].forEach(function(e){
    dz.addEventListener(e, function(ev){ev.preventDefault();dz.classList.remove('dragover')});
  });
  dz.addEventListener('drop', function(e){
    var files = e.dataTransfer.files;
    if(files.length > 0){ fileInput.files = files; showConfirm(files[0]); }
  });

  fileInput.addEventListener('change', function(){
    if(fileInput.files.length > 0) showConfirm(fileInput.files[0]);
  });

  function showConfirm(file){
    nameEl.textContent = file.name;
    var size = file.size;
    sizeEl.textContent = size < 1024*1024
      ? (size/1024).toFixed(1) + ' KB'
      : (size/1024/1024).toFixed(1) + ' MB';
    step1.style.display = 'none';
    step2.style.display = 'flex';
  }

  window.resetUpload = function(){
    fileInput.value = '';
    step1.style.display = '';
    step2.style.display = 'none';
  };

  form.addEventListener('submit', function(){
    step2.style.display = 'none';
    step3.style.display = 'block';

    // プログレスアニメーション
    var steps = [
      {el:'pStep1', pct:15, delay:0},
      {el:'pStep2', pct:45, delay:3000},
      {el:'pStep3', pct:75, delay:8000},
      {el:'pStep4', pct:90, delay:12000},
    ];
    steps.forEach(function(s){
      setTimeout(function(){
        document.getElementById(s.el).classList.add('active');
        // 前のステップを完了状態に
        var allSteps = document.querySelectorAll('.progress-step');
        allSteps.forEach(function(el,i){
          if(el.id !== s.el && el.classList.contains('active')){
            var idx = Array.from(allSteps).indexOf(document.getElementById(s.el));
            if(i < idx) el.classList.add('done');
          }
        });
        progressBar.style.width = s.pct + '%';
      }, s.delay);
    });
  });
})();
</script>

<div class="analysis-toolbar">
  <div class="source-badge source-badge--${options.source}">${sourceLabel}</div>
${options.analysisId ? `
  <div class="save-status">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2298ae" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    <span>保存済み${options.savedAt ? ` (${new Date(options.savedAt).toLocaleString('ja-JP')})` : ''}</span>
  </div>
  <div class="toolbar-actions">
    <a href="/agent/finance/history/${options.analysisId}/json" class="toolbar-btn" title="JSONダウンロード">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      JSON
    </a>
    <a href="/agent/finance/history" class="toolbar-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
      分析履歴
    </a>
  </div>` : `
  <a href="/agent/finance/history" class="toolbar-btn">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
    分析履歴
  </a>`}
</div>
${extractionNotesHTML}

${aiCommentaryHTML}

<!-- Section 1: Welcome Banner -->
<div class="rating-banner">
  <div>
    <h2>銀行格付スコアリング（129点満点）</h2>
    <p style="opacity:0.85;font-size:14px;margin-top:4px">財務データに基づく銀行評価シミュレーション</p>
  </div>
  <div class="banner-score">${rating.totalScore}<span> / ${rating.maxScore} 点</span></div>
</div>

<!-- Section 2: 総合評価スコア -->
<div class="card">
  <div class="card-header"><h3>総合評価スコア</h3></div>
  <div class="card-body">
    <div class="score-section">
      <div class="score-circle-wrap">
        <div class="score-circle">
          <div class="circle-bg" style="--pct:${scorePercent}">
            <div class="circle-inner">
              <div class="circle-value">${rating.totalScore}</div>
              <div class="circle-max">/ ${rating.maxScore} 点</div>
            </div>
          </div>
        </div>
        <div class="score-rank" style="background:${rankColor(rating.rank)}20;color:${rankColor(rating.rank)}">
          <span class="rank-letter">${esc(rating.rank)}</span>
          <span>${esc(rating.rankLabel)}</span>
        </div>
      </div>
      <div class="category-grid">
${categories.map(c => {
  const pct = c.max > 0 ? Math.round((c.score / c.max) * 100) : 0;
  return `        <div class="category-card">
          <h4>${c.label}</h4>
          <div class="cat-score">${c.score}<span> / ${c.max}</span></div>
          <div class="cat-bar"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
        </div>`;
}).join('\n')}
      </div>
    </div>

    <!-- Radar Chart -->
    <div class="radar-section">
      <div class="radar-chart-wrap">
        <canvas id="radarChart"></canvas>
      </div>
    </div>
  </div>
</div>

<!-- Section 3: 指標算出一覧 -->
<div class="card">
  <div class="card-header"><h3>指標算出一覧</h3></div>
  <div class="card-body table-wrap">
    <table class="metric-table">
      <thead>
        <tr>
          <th>指標名</th>
          <th style="text-align:right">数値</th>
          <th>単位</th>
          <th style="text-align:center">スコア / 配点</th>
          <th style="text-align:center">評価レベル</th>
          <th>コメント</th>
        </tr>
      </thead>
      <tbody>
${(['stability', 'profitability', 'growth', 'repayment'] as const).map(cat => {
  const rows = groupedMetrics[cat] || [];
  const header = `        <tr class="cat-header"><td colspan="6">${CATEGORY_LABELS[cat]}</td></tr>`;
  const dataRows = rows.map(m => `        <tr>
          <td>${esc(m.name)}</td>
          <td class="num">${formatValue(m.value, m.unit)}</td>
          <td>${esc(m.unit)}</td>
          <td style="text-align:center">${m.score} / ${m.maxScore}</td>
          <td style="text-align:center">${levelBadge(m.level)}</td>
          <td>${esc(m.comment)}</td>
        </tr>`).join('\n');
  return header + '\n' + dataRows;
}).join('\n')}
      </tbody>
    </table>
  </div>
</div>

<!-- Section 4: 銀行視点の見解 -->
<div class="card">
  <div class="card-header"><h3>銀行視点の見解</h3></div>
  <div class="card-body">
    <div class="opinions-grid">
      <div class="opinion-card opinion-positive">
        <h4>ポジティブ</h4>
        <ul>
${rating.positives.map(p => `          <li>${esc(p)}</li>`).join('\n')}
        </ul>
      </div>
      <div class="opinion-card opinion-negative">
        <h4>ネガティブ</h4>
        <ul>
${rating.negatives.map(n => `          <li>${esc(n)}</li>`).join('\n')}
        </ul>
      </div>
      <div class="opinion-card opinion-caution">
        <h4>要注意</h4>
        <ul>
${rating.cautions.map(c => `          <li>${esc(c)}</li>`).join('\n')}
        </ul>
      </div>
    </div>
  </div>
</div>

<!-- Section 5: 改善アクション -->
<div class="card">
  <div class="card-header"><h3>改善アクション（優先度付き）</h3></div>
  <div class="card-body table-wrap">
    <table>
      <thead>
        <tr>
          <th style="text-align:center">優先度</th>
          <th>内容</th>
          <th>効果</th>
          <th>期間</th>
        </tr>
      </thead>
      <tbody>
${rating.actions.map(a => `        <tr>
          <td style="text-align:center">${priorityBadge(a.priority)}</td>
          <td>${esc(a.content)}</td>
          <td>${esc(a.effect)}</td>
          <td>${esc(a.timeframe)}</td>
        </tr>`).join('\n')}
      </tbody>
    </table>
  </div>
</div>

<!-- Section 6: 追加指標ブロック -->
<div class="additional-block">
  <h3>追加指標</h3>
  <div class="additional-note">※格付点数に含まない独立指標</div>
  <div class="additional-item">
    <div class="add-label">総資本回転率</div>
    <div class="add-value">${additional.totalAssetTurnover !== null ? additional.totalAssetTurnover.toFixed(1) : '—'} 回</div>
    <div class="add-comment">${esc(additional.totalAssetTurnoverComment)}</div>
  </div>
  <div class="additional-item">
    <div class="add-label">簡易キャッシュフロー</div>
    <div class="add-value">${formatCurrency(additional.simpleCashFlow)}</div>
    <div class="add-comment">
      ${esc(additional.simpleCashFlowComment)}
      ${additional.simpleCashFlowNote ? `<br><small style="color:#7c3aed">${esc(additional.simpleCashFlowNote)}</small>` : ''}
    </div>
  </div>
</div>

<!-- Section 7: 経営者向け要約 -->
<div class="callout">
  <h3>経営者向け要約</h3>
  <ul>
${rating.executiveSummary.map(s => `    <li>${esc(s)}</li>`).join('\n')}
  </ul>
</div>

<!-- Section 8: 深掘り質問 -->
<div class="card">
  <div class="card-header"><h3>深掘り質問</h3></div>
  <div class="card-body">
    <ul class="questions-list">
${rating.deepDiveQuestions.map(q => `      <li>${esc(q)}</li>`).join('\n')}
    </ul>
  </div>
</div>

<!-- Radar Chart Script -->
<script>
document.addEventListener('DOMContentLoaded', function() {
  const ctx = document.getElementById('radarChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: [${categories.map(c => `'${c.label}'`).join(', ')}],
      datasets: [{
        label: 'スコア達成率 (%)',
        data: [${categories.map(c => c.max > 0 ? Math.round((c.score / c.max) * 100) : 0).join(', ')}],
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
        borderColor: 'rgba(99, 102, 241, 1)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(99, 102, 241, 1)',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: { stepSize: 20, font: { size: 11 } },
          pointLabels: { font: { size: 13, weight: 'bold' } },
          grid: { color: 'rgba(0,0,0,0.08)' }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
});
</script>`;

  return agentPageShell({
    active: 'finance',
    title: '財務分析AIエージェント',
    bodyHTML,
  });
}

// ---------------------------------------------------------------------------
// AI Commentary Rich Renderer
// ---------------------------------------------------------------------------

interface AIReport {
  headline: string;
  summary: string;
  overallGrade: string;
  strengths: { title: string; detail: string; icon: string }[];
  weaknesses: { title: string; detail: string; icon: string }[];
  bankView: { overallComment: string; positives: string[]; concerns: string[]; lendingImpact: string };
  keyMetrics: { name: string; value: string; benchmark: string; assessment: string; comment: string }[];
  immediateActions: { priority: number; action: string; reason: string; expectedEffect: string; timeframe: string }[];
  mediumTermStrategy: { theme: string; detail: string; timeframe: string }[];
  riskAlerts: { level: string; title: string; detail: string }[];
  industryComparison: { position: string; aboveAverage: string[]; belowAverage: string[] };
}

function buildAICommentaryHTML(raw: string | null, rating: BankRatingResult): string {
  if (!raw) return '';

  // JSONをパース
  let report: AIReport;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    report = JSON.parse(jsonMatch[0]);
  } catch {
    // パース失敗時はMarkdownフォールバック
    return `<div class="card" style="margin-bottom:24px"><div class="card-header"><h3>AI分析コメント</h3></div><div class="card-body"><div style="white-space:pre-wrap;font-size:14px;line-height:1.8">${esc(raw)}</div></div></div>`;
  }

  const assessColor = (a: string) => {
    switch(a) { case 'excellent': return '#2298ae'; case 'good': return '#2298ae'; case 'fair': return '#3da8b8'; case 'warning': return '#5ab4c4'; default: return '#ef4444'; }
  };
  const assessBg = (a: string) => {
    switch(a) { case 'excellent': return '#ecf6f8'; case 'good': return '#ecf6f8'; case 'fair': return '#ecf6f8'; case 'warning': return '#ecf6f8'; default: return '#fef2f2'; }
  };
  const riskColor = (l: string) => l === 'high' ? '#ef4444' : l === 'medium' ? '#5ab4c4' : '#2298ae';
  const riskBg = (l: string) => l === 'high' ? '#fef2f2' : l === 'medium' ? '#ecf6f8' : '#ecf6f8';

  return `
<style>
.ai-report{margin-bottom:28px}
.ai-headline{background:linear-gradient(135deg,#1b7f8e,#2298ae);border-radius:var(--radius);padding:32px;color:#fff;margin-bottom:20px;text-align:center}
.ai-headline h2{font-size:28px;font-weight:800;margin-bottom:8px;letter-spacing:-0.02em}
.ai-headline .ai-grade{display:inline-flex;align-items:center;gap:8px;font-size:14px;background:rgba(255,255,255,0.15);padding:6px 18px;border-radius:20px;margin-bottom:12px}
.ai-headline .ai-grade .grade-letter{font-size:22px;font-weight:800}
.ai-headline p{font-size:15px;opacity:0.85;line-height:1.7;max-width:700px;margin:0 auto}
.sw-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
.sw-card{border-radius:var(--radius);padding:24px;border:1px solid var(--border)}
.sw-card h3{font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.sw-item{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)}
.sw-item:last-child{border-bottom:none}
.sw-item .sw-icon{font-size:24px;flex-shrink:0;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:var(--bg)}
.sw-item .sw-title{font-size:14px;font-weight:700;margin-bottom:2px}
.sw-item .sw-detail{font-size:13px;color:var(--text2);line-height:1.5}
.bank-view{background:#f8fafc;border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:20px}
.bank-view h3{font-size:16px;font-weight:700;margin-bottom:12px}
.bank-view .bv-comment{font-size:14px;line-height:1.7;margin-bottom:16px;color:var(--text)}
.bv-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.bv-col h4{font-size:13px;font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.bv-col ul{list-style:none;padding:0}
.bv-col li{font-size:13px;padding:4px 0;padding-left:16px;position:relative;line-height:1.5}
.bv-col li::before{content:'';position:absolute;left:0;top:10px;width:6px;height:6px;border-radius:50%}
.bv-pos li::before{background:#2298ae}
.bv-neg li::before{background:#ef4444}
.bv-lending{background:var(--primary-light);border-radius:8px;padding:14px 16px;font-size:13px;line-height:1.6;color:var(--text)}
.km-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:20px}
.km-card{border-radius:10px;padding:16px;border-left:4px solid}
.km-card .km-name{font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.03em}
.km-card .km-val{font-size:24px;font-weight:800;margin:4px 0}
.km-card .km-bench{font-size:11px;color:var(--text2)}
.km-card .km-comment{font-size:12px;margin-top:6px;line-height:1.5}
.action-timeline{margin-bottom:20px}
.at-item{display:flex;gap:16px;padding:16px 0;border-bottom:1px solid var(--border)}
.at-item:last-child{border-bottom:none}
.at-num{width:32px;height:32px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex-shrink:0}
.at-content{flex:1}
.at-action{font-size:15px;font-weight:700;margin-bottom:4px}
.at-reason{font-size:13px;color:var(--text2);line-height:1.5;margin-bottom:4px}
.at-tags{display:flex;gap:8px;flex-wrap:wrap}
.at-tag{font-size:11px;padding:2px 8px;border-radius:4px;background:var(--bg);color:var(--text2);font-weight:600}
.risk-list{margin-bottom:20px}
.risk-item{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:10px;margin-bottom:8px}
.risk-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;margin-top:5px}
.risk-title{font-size:14px;font-weight:700;margin-bottom:2px}
.risk-detail{font-size:13px;color:var(--text2);line-height:1.5}
.ind-compare{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:20px}
.ind-compare h3{font-size:16px;font-weight:700;margin-bottom:12px}
.ind-pos{font-size:14px;line-height:1.7;margin-bottom:16px}
</style>

<div class="ai-report">

  <!-- Headline -->
  <div class="ai-headline">
    <div class="ai-grade"><span class="grade-letter">${esc(report.overallGrade)}</span> ランク</div>
    <h2>${esc(report.headline)}</h2>
    <p>${esc(report.summary)}</p>
  </div>

  <!-- Strengths & Weaknesses -->
  <div class="sw-grid">
    <div class="sw-card" style="background:#ecf6f8;border-color:#a8d8e0">
      <h3>強み</h3>
${(report.strengths || []).map(s => `
      <div class="sw-item">
        <div class="sw-icon">${s.icon}</div>
        <div><div class="sw-title">${esc(s.title)}</div><div class="sw-detail">${esc(s.detail)}</div></div>
      </div>`).join('')}
    </div>
    <div class="sw-card" style="background:#fef2f2;border-color:#fecaca">
      <h3>弱み・課題</h3>
${(report.weaknesses || []).map(w => `
      <div class="sw-item">
        <div class="sw-icon">${w.icon}</div>
        <div><div class="sw-title">${esc(w.title)}</div><div class="sw-detail">${esc(w.detail)}</div></div>
      </div>`).join('')}
    </div>
  </div>

  <!-- Key Metrics Visual -->
  <div class="card" style="margin-bottom:20px">
    <div class="card-header"><h3>主要指標サマリー</h3><span class="card-sub">AI評価付き</span></div>
    <div class="card-body">
      <div class="km-grid">
${(report.keyMetrics || []).map(m => `
        <div class="km-card" style="border-color:${assessColor(m.assessment)};background:${assessBg(m.assessment)}">
          <div class="km-name">${esc(m.name)}</div>
          <div class="km-val" style="color:${assessColor(m.assessment)}">${esc(m.value)}</div>
          <div class="km-bench">基準: ${esc(m.benchmark)}</div>
          <div class="km-comment">${esc(m.comment)}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <!-- Bank View -->
  <div class="bank-view">
    <h3>銀行はこう見る</h3>
    <div class="bv-comment">${esc(report.bankView?.overallComment || '')}</div>
    <div class="bv-cols">
      <div class="bv-col bv-pos">
        <h4>プラス評価</h4>
        <ul>${(report.bankView?.positives || []).map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      </div>
      <div class="bv-col bv-neg">
        <h4>懸念事項</h4>
        <ul>${(report.bankView?.concerns || []).map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      </div>
    </div>
    <div class="bv-lending"><strong>融資への影響：</strong>${esc(report.bankView?.lendingImpact || '')}</div>
  </div>

  <!-- Immediate Actions -->
  <div class="card" style="margin-bottom:20px">
    <div class="card-header"><h3>今すぐやるべきこと</h3><span class="card-sub">優先順位付き</span></div>
    <div class="card-body">
      <div class="action-timeline">
${(report.immediateActions || []).map(a => `
        <div class="at-item">
          <div class="at-num">${a.priority}</div>
          <div class="at-content">
            <div class="at-action">${esc(a.action)}</div>
            <div class="at-reason">${esc(a.reason)}</div>
            <div class="at-tags">
              <span class="at-tag">${esc(a.timeframe)}</span>
              <span class="at-tag">${esc(a.expectedEffect)}</span>
            </div>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <!-- Risk Alerts -->
${(report.riskAlerts || []).length > 0 ? `
  <div class="card" style="margin-bottom:20px">
    <div class="card-header"><h3>リスクアラート</h3></div>
    <div class="card-body">
      <div class="risk-list">
${report.riskAlerts.map(r => `
        <div class="risk-item" style="background:${riskBg(r.level)}">
          <div class="risk-dot" style="background:${riskColor(r.level)}"></div>
          <div><div class="risk-title">${esc(r.title)}</div><div class="risk-detail">${esc(r.detail)}</div></div>
        </div>`).join('')}
      </div>
    </div>
  </div>` : ''}

  <!-- Industry Comparison -->
${report.industryComparison ? `
  <div class="ind-compare">
    <h3>同業比較</h3>
    <div class="ind-pos">${esc(report.industryComparison.position)}</div>
    <div class="bv-cols">
      <div class="bv-col bv-pos">
        <h4>業界平均以上</h4>
        <ul>${(report.industryComparison.aboveAverage || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul>
      </div>
      <div class="bv-col bv-neg">
        <h4>業界平均以下</h4>
        <ul>${(report.industryComparison.belowAverage || []).map(b => `<li>${esc(b)}</li>`).join('')}</ul>
      </div>
    </div>
  </div>` : ''}

  <!-- Medium Term -->
${(report.mediumTermStrategy || []).length > 0 ? `
  <div class="card" style="margin-bottom:20px">
    <div class="card-header"><h3>中長期的な改善の方向性</h3></div>
    <div class="card-body">
${report.mediumTermStrategy.map(s => `
      <div class="at-item">
        <div class="at-content">
          <div class="at-action">${esc(s.theme)}</div>
          <div class="at-reason">${esc(s.detail)}</div>
          <div class="at-tags"><span class="at-tag">${esc(s.timeframe)}</span></div>
        </div>
      </div>`).join('')}
    </div>
  </div>` : ''}

</div>`; // end ai-report
}
