import type { TrendData, MonthlyTarget } from '../types/trend.js';
import { renderSidebar, SHARED_CSS } from './shared.js';

/**
 * 事業計画AIエージェントページのHTMLを生成する
 */
export function renderPlanHTML(trend: TrendData, uploadedFiles: string[]): string {
  const targets = trend.targets;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>事業計画AIエージェント</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
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
              <p class="dropzone-hint">対応形式: PDF, CSV, Excel</p>
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
            <h4>アップロード済みファイル</h4>
${uploadedFiles.map(f => `
            <div class="uploaded-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2298ae" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <span>${esc(f)}</span>
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

    <!-- Target Table -->
    <div class="card">
      <div class="card-header">
        <h3>月次目標設定</h3>
        <div style="display:flex;gap:8px">
          <button class="btn-secondary btn-sm" onclick="toggleEdit()">編集</button>
          <button class="btn-primary btn-sm" id="saveBtn" style="display:none" onclick="saveTargets()">保存</button>
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
              </tr>
            </thead>
            <tbody>
${targets.map((t, i) => {
  const actual = trend.months[i];
  const revRate = actual ? (actual.revenue / t.revenue * 100) : 0;
  const gpRate = actual ? (actual.grossProfit / t.grossProfit * 100) : 0;
  const oiRate = actual ? (actual.ordinaryIncome / t.ordinaryIncome * 100) : 0;
  return `              <tr>
                <td class="month-cell">${t.year}年${t.month}月</td>
                <td class="num editable" data-field="revenue" data-index="${i}">${fmtNum(t.revenue)}</td>
                <td class="num actual">${actual ? fmtNum(actual.revenue) : '—'}</td>
                <td class="num ${rateClass(revRate)}">${revRate.toFixed(1)}%</td>
                <td class="num editable" data-field="grossProfit" data-index="${i}">${fmtNum(t.grossProfit)}</td>
                <td class="num actual">${actual ? fmtNum(actual.grossProfit) : '—'}</td>
                <td class="num ${rateClass(gpRate)}">${gpRate.toFixed(1)}%</td>
                <td class="num editable" data-field="ordinaryIncome" data-index="${i}">${fmtNum(t.ordinaryIncome)}</td>
                <td class="num actual">${actual ? fmtNum(actual.ordinaryIncome) : '—'}</td>
                <td class="num ${rateClass(oiRate)}">${oiRate.toFixed(1)}%</td>
              </tr>`;
}).join('\n')}
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

  </div>
</div>

<script>
Chart.defaults.font.family = "-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN',sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = '#8a8f98';

var fmt = function(v){return new Intl.NumberFormat('ja-JP').format(v)+'円'};
var fmtM = function(v){return (v/10000).toFixed(0)+'万'};

// Gap Bar Chart
var months = ${JSON.stringify(targets.map(t => t.month + '月'))};
var targetRev = ${JSON.stringify(targets.map(t => t.revenue))};
var actualRev = ${JSON.stringify(trend.months.map(m => m.revenue))};
var gaps = targetRev.map(function(t,i){return actualRev[i]-t});

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

// Edit targets
var editing=false;
function toggleEdit(){
  editing=!editing;
  document.getElementById('saveBtn').style.display=editing?'inline-flex':'none';
  var cells=document.querySelectorAll('.editable');
  cells.forEach(function(cell){
    if(editing){
      var val=cell.textContent.replace(/,/g,'');
      cell.innerHTML='<input type="text" class="edit-input" value="'+val+'">';
    } else {
      var input=cell.querySelector('input');
      if(input) cell.textContent=Number(input.value).toLocaleString('ja-JP');
    }
  });
}
function saveTargets(){
  toggleEdit();
  // TODO: POST to /plan/targets API
  alert('目標を保存しました（デモ）');
}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
.uploaded-list h4{font-size:13px;font-weight:700;color:var(--text2);margin-bottom:10px}
.uploaded-item{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;color:var(--text)}
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
`;
