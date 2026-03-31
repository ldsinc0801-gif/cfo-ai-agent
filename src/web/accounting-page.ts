import type { JournalEntry, ReceiptAnalysis } from '../services/receipt-service.js';
import { agentPageShell, esc } from './shared.js';
import { accountSelectOptions } from '../config/freee-accounts.js';

export interface AccountingPageOptions {
  aiAvailable: boolean;
  analysis?: ReceiptAnalysis | null;
  csvDownloadId?: string;
  error?: string;
  success?: string;
}

export function renderAccountingPageHTML(options: AccountingPageOptions = { aiAvailable: false }): string {
  const analysis = options.analysis;
  const entries = analysis?.entries || [];

  const bodyHTML = `
<style>${PAGE_CSS}</style>

<!-- Banner -->
<div class="acc-banner">
  <div>
    <h2>会計AIエージェント</h2>
    <p>領収書・レシートをアップロードするとAIが読み取り、自動で仕訳データを生成します。freee APIへの送信やCSVエクスポートが可能です。</p>
  </div>
</div>

${options.error ? `<div class="acc-error">${esc(options.error)}</div>` : ''}
${options.success ? `<div class="acc-success">${esc(options.success)}</div>` : ''}

<!-- Upload Area -->
<div class="acc-grid">
  <!-- 画像・PDF アップロード -->
  <div class="card">
    <div class="card-header">
      <h3>領収書・レシートのアップロード</h3>
      <span class="card-sub">画像 / PDF</span>
    </div>
    <div class="card-body">
      <form action="/agent/accounting/analyze" method="post" enctype="multipart/form-data" id="receiptForm">
        <input type="hidden" name="type" value="file"/>
        <div class="acc-dropzone" id="receiptDrop">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p class="drop-main">領収書をドラッグ＆ドロップ</p>
          <label class="btn-upload">
            ファイルを選択
            <input type="file" name="file" accept="image/*,.pdf" hidden id="receiptFile" multiple/>
          </label>
          <p class="drop-hint">JPEG, PNG, PDF 対応・複数ファイル可</p>
        </div>
        <div class="file-confirm" id="fileConfirm" style="display:none">
          <div class="file-info" id="fileInfo"></div>
          <div class="file-actions">
            <button type="button" class="btn-secondary btn-sm" onclick="resetFileUpload()">キャンセル</button>
            <button type="submit" class="btn-primary">AIで仕訳を生成</button>
          </div>
        </div>
      </form>
      ${!options.aiAvailable ? '<p class="warn-msg">ANTHROPIC_API_KEYが未設定のため利用できません</p>' : ''}
    </div>
  </div>

  <!-- 動画アップロード -->
  <div class="card">
    <div class="card-header">
      <h3>動画からレシート読み取り</h3>
      <span class="card-sub">現金の領収書をまとめて処理</span>
    </div>
    <div class="card-body">
      <form action="/agent/accounting/analyze-video" method="post" enctype="multipart/form-data" id="videoForm">
        <div class="acc-dropzone" id="videoDrop">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
            <polygon points="23 7 16 12 23 17 23 7"/>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg>
          <p class="drop-main">レシートを撮影した動画をアップロード</p>
          <label class="btn-upload">
            動画を選択
            <input type="file" name="video" accept="video/*" hidden id="videoFile"/>
          </label>
          <p class="drop-hint">MP4, MOV 対応・AIがフレームを自動解析</p>
        </div>
        <div class="file-confirm" id="videoConfirm" style="display:none">
          <div class="file-info" id="videoInfo"></div>
          <div class="file-actions">
            <button type="button" class="btn-secondary btn-sm" onclick="resetVideoUpload()">キャンセル</button>
            <button type="submit" class="btn-primary">AIで解析開始</button>
          </div>
        </div>
      </form>
    </div>
  </div>
</div>

<!-- How it works -->
<div class="card">
  <div class="card-header"><h3>処理フロー</h3></div>
  <div class="card-body">
    <div class="flow-steps">
      <div class="flow-step">
        <div class="flow-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
        <div class="flow-label">アップロード</div>
        <div class="flow-desc">領収書の画像・PDF・動画</div>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-step">
        <div class="flow-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
        <div class="flow-label">AI読み取り</div>
        <div class="flow-desc">日付・金額・店名・科目を自動抽出</div>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-step">
        <div class="flow-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
        <div class="flow-label">仕訳生成</div>
        <div class="flow-desc">勘定科目・消費税を自動判定</div>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-step">
        <div class="flow-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></div>
        <div class="flow-label">連携</div>
        <div class="flow-desc">freee API送信 or CSV出力</div>
      </div>
    </div>
  </div>
</div>

${entries.length > 0 ? renderResults(analysis!, options.csvDownloadId) : ''}

<script>
// File upload
var receiptFile = document.getElementById('receiptFile');
var receiptDrop = document.getElementById('receiptDrop');
var fileConfirm = document.getElementById('fileConfirm');
var fileInfo = document.getElementById('fileInfo');

['dragenter','dragover'].forEach(function(e){
  receiptDrop.addEventListener(e,function(ev){ev.preventDefault();receiptDrop.classList.add('dragover')});
});
['dragleave','drop'].forEach(function(e){
  receiptDrop.addEventListener(e,function(ev){ev.preventDefault();receiptDrop.classList.remove('dragover')});
});
receiptDrop.addEventListener('drop',function(e){
  receiptFile.files = e.dataTransfer.files;
  showFileConfirm(receiptFile.files);
});
receiptFile.addEventListener('change',function(){
  if(receiptFile.files.length>0) showFileConfirm(receiptFile.files);
});

function showFileConfirm(files){
  var html = '';
  for(var i=0;i<files.length;i++){
    html += '<div class="file-item">'+files[i].name+' ('+formatSize(files[i].size)+')</div>';
  }
  fileInfo.innerHTML = html;
  fileConfirm.style.display = 'flex';
  receiptDrop.style.display = 'none';
}
function resetFileUpload(){
  receiptFile.value='';
  fileConfirm.style.display='none';
  receiptDrop.style.display='';
}

// Video upload
var videoFile = document.getElementById('videoFile');
var videoDrop = document.getElementById('videoDrop');
var videoConfirm = document.getElementById('videoConfirm');
var videoInfo = document.getElementById('videoInfo');

videoFile.addEventListener('change',function(){
  if(videoFile.files.length>0){
    videoInfo.innerHTML = '<div class="file-item">'+videoFile.files[0].name+' ('+formatSize(videoFile.files[0].size)+')</div>';
    videoConfirm.style.display='flex';
    videoDrop.style.display='none';
  }
});
function resetVideoUpload(){
  videoFile.value='';
  videoConfirm.style.display='none';
  videoDrop.style.display='';
}

function formatSize(b){return b<1024*1024?(b/1024).toFixed(1)+' KB':(b/1024/1024).toFixed(1)+' MB'}

// 弥生CSV: 相手勘定科目の有無を切り替え
function updateYayoiLink(){
  var btn = document.getElementById('yayoiBtn');
  if(!btn) return;
  var href = btn.getAttribute('href');
  var checked = document.getElementById('yayoiCounter').checked;
  btn.setAttribute('href', href.replace(/counter=[01]/, 'counter=' + (checked ? '1' : '0')));
}

// 仕訳修正の検出と学習
document.querySelectorAll('.edit-select').forEach(function(sel){
  sel.addEventListener('change',function(){
    var tr = sel.closest('tr');
    var original = JSON.parse(tr.dataset.original);
    var debit = tr.querySelector('.edit-debit').value;
    var credit = tr.querySelector('.edit-credit').value;
    var btn = tr.querySelector('.btn-correct');
    if(debit !== original.debitAccount || credit !== original.creditAccount){
      btn.style.display='inline-block';
    } else {
      btn.style.display='none';
    }
  });
});

function saveCorrection(idx){
  var tr = document.querySelector('tr[data-idx="'+idx+'"]');
  var original = JSON.parse(tr.dataset.original);
  var corrected = Object.assign({}, original, {
    debitAccount: tr.querySelector('.edit-debit').value,
    creditAccount: tr.querySelector('.edit-credit').value,
  });
  var reason = prompt('修正理由（任意）:','') || '';

  fetch('/agent/accounting/correct', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({original:original, corrected:corrected, reason:reason})
  }).then(function(r){return r.json()}).then(function(data){
    var msg = document.getElementById('correctionMsg');
    if(data.success){
      msg.textContent=original.debitAccount+'→'+corrected.debitAccount+' の修正を学習しました';
      msg.className='correction-msg correction-ok';
      tr.querySelector('.btn-correct').style.display='none';
      tr.dataset.original = JSON.stringify(corrected);
    } else {
      msg.textContent='記録に失敗しました';
      msg.className='correction-msg correction-err';
    }
    msg.style.display='block';
    setTimeout(function(){msg.style.display='none'},4000);
  }).catch(function(){
    var msg = document.getElementById('correctionMsg');
    msg.textContent='通信エラー';
    msg.className='correction-msg correction-err';
    msg.style.display='block';
  });
}
</script>`;

  return agentPageShell({
    active: 'accounting',
    title: '会計AIエージェント',
    bodyHTML,
  });
}

function renderResults(analysis: ReceiptAnalysis, csvId?: string): string {
  const entries = analysis.entries;
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const fmt = (n: number) => new Intl.NumberFormat('ja-JP').format(n);

  const confColor = analysis.confidence === 'high' ? '#2298ae' : analysis.confidence === 'medium' ? '#5ab4c4' : '#ef4444';
  const confLabel = analysis.confidence === 'high' ? '高' : analysis.confidence === 'medium' ? '中' : '低';

  return `
<!-- Results -->
<div class="card">
  <div class="card-header">
    <h3>生成された仕訳データ</h3>
    <div style="display:flex;align-items:center;gap:12px">
      <span style="font-size:12px;color:var(--text2)">読み取り精度:</span>
      <span class="pill pill--sm" style="background:${confColor}20;color:${confColor}">${confLabel}</span>
      <span style="font-size:14px;font-weight:700">${entries.length}件 / 合計 ${fmt(total)}円</span>
    </div>
  </div>
  <div class="card-body">
${analysis.notes.length > 0 ? `
    <div class="result-notes">
      <strong>AIメモ:</strong>
      <ul>${analysis.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    </div>` : ''}

    <div class="table-wrap">
      <table class="journal-table">
        <thead>
          <tr>
            <th>日付</th>
            <th>借方</th>
            <th>貸方</th>
            <th>金額</th>
            <th>税率</th>
            <th>消費税</th>
            <th>摘要</th>
            <th>取引先</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
${entries.map((e, i) => `
          <tr data-idx="${i}" data-original='${esc(JSON.stringify(e))}'>
            <td>${esc(e.date)}</td>
            <td><select class="edit-select edit-debit">${accountSelectOptions(e.debitAccount)}</select></td>
            <td><select class="edit-select edit-credit">${accountSelectOptions(e.creditAccount)}</select></td>
            <td class="num">${fmt(e.amount)}円</td>
            <td class="num">${e.taxRate}%</td>
            <td class="num">${fmt(e.taxAmount)}円</td>
            <td>${esc(e.description)}</td>
            <td>${esc(e.partnerName)}</td>
            <td><button class="btn-correct btn-sm" onclick="saveCorrection(${i})" style="display:none">学習</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div id="correctionMsg" class="correction-msg" style="display:none"></div>

    <!-- Actions -->
    <div class="result-actions">
      <form action="/agent/accounting/send-freee" method="post" style="display:inline">
        <input type="hidden" name="entries" value='${esc(JSON.stringify(entries))}'/>
        <button type="submit" class="btn-primary" title="freee APIに仕訳を送信">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          freeeに送信
        </button>
      </form>
      <a href="/agent/accounting/csv?entries=${encodeURIComponent(JSON.stringify(entries))}" class="btn-secondary">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        CSVダウンロード
      </a>
      <div class="yayoi-export">
        <a id="yayoiBtn" href="/agent/accounting/yayoi-csv?entries=${encodeURIComponent(JSON.stringify(entries))}&counter=1" class="btn-secondary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          弥生CSV
        </a>
        <label class="yayoi-option">
          <input type="checkbox" id="yayoiCounter" checked onchange="updateYayoiLink()"/> 相手勘定科目を含む
        </label>
      </div>
      <a href="/agent/accounting" class="btn-secondary">次の領収書を処理</a>
    </div>
  </div>
</div>`;
}

const PAGE_CSS = `
.acc-banner{background:linear-gradient(135deg,#2298ae,#4dbdcf);border-radius:var(--radius);padding:28px 32px;margin-bottom:24px;color:#fff}
.acc-banner h2{font-size:20px;font-weight:700;margin-bottom:8px}
.acc-banner p{font-size:14px;opacity:0.9;line-height:1.65;max-width:700px}
.acc-error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:14px}
.acc-success{background:#ecf6f8;border:1px solid #a8d8e0;color:#1b7f8e;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:14px;white-space:pre-line}
.acc-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
.acc-dropzone{border:2px dashed var(--border);border-radius:12px;padding:40px 24px;text-align:center;transition:all .2s;cursor:pointer}
.acc-dropzone:hover,.acc-dropzone.dragover{border-color:var(--primary);background:var(--primary-light)}
.drop-main{font-size:15px;font-weight:600;margin:12px 0 8px}
.drop-hint{font-size:12px;color:var(--text2);margin-top:10px}
.btn-upload{display:inline-block;padding:8px 20px;border-radius:8px;background:var(--primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer}
.file-confirm{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px;background:var(--primary-light);border:1px solid var(--primary);border-radius:10px;margin-top:12px}
.file-info{flex:1}
.file-item{font-size:13px;font-weight:600;color:var(--primary);padding:2px 0}
.file-actions{display:flex;gap:8px}
.warn-msg{color:var(--red);font-size:12px;margin-top:8px}

.flow-steps{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap}
.flow-step{text-align:center;padding:16px 20px;border-radius:10px;background:var(--bg);min-width:140px}
.flow-icon{font-size:28px;margin-bottom:6px}
.flow-label{font-size:14px;font-weight:700;margin-bottom:2px}
.flow-desc{font-size:11px;color:var(--text2);line-height:1.4}
.flow-arrow{font-size:20px;color:var(--text2);font-weight:300}

.journal-table{width:100%;border-collapse:collapse;font-size:13px}
.journal-table th{background:var(--bg);font-weight:600;color:var(--text2);font-size:11px;letter-spacing:0.03em;text-transform:uppercase;padding:10px 10px;text-align:left;border-bottom:2px solid var(--border);white-space:nowrap}
.journal-table td{padding:10px;border-bottom:1px solid var(--border);vertical-align:top}
.journal-table td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.account-tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;white-space:nowrap}
.account-tag.debit{background:#d5eef3;color:#1b7f8e}
.account-tag.credit{background:#ddf0f4;color:#156d7a}
.result-notes{background:#ecf6f8;border:1px solid #a8d8e0;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px}
.result-notes ul{margin:4px 0 0 16px}
.result-actions{display:flex;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border);align-items:center;flex-wrap:wrap}
.yayoi-export{display:flex;align-items:center;gap:8px}
.yayoi-option{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text2);cursor:pointer;white-space:nowrap}
.yayoi-option input{margin:0}
.edit-select{border:1px solid var(--border);background:#fff;padding:4px 6px;border-radius:6px;font-size:12px;font-weight:600;min-width:100px;cursor:pointer;transition:all .2s;appearance:auto}
.edit-select:focus{border-color:var(--primary);outline:none;box-shadow:0 0 0 2px rgba(79,70,229,0.15)}
.edit-debit{color:#1b7f8e}.edit-credit{color:#156d7a}
.btn-correct{padding:3px 10px;border:1px solid #5ab4c4;background:#ecf6f8;color:#1b7f8e;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}
.btn-correct:hover{background:#a8d8e0}
.correction-msg{padding:10px 16px;border-radius:8px;font-size:13px;margin-top:12px;transition:opacity .3s}
.correction-ok{background:#d5eef3;color:#1b7f8e;border:1px solid #8dd0da}
.correction-err{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}

@media(max-width:768px){
  .acc-grid{grid-template-columns:1fr}
  .flow-steps{flex-direction:column}
  .flow-arrow{transform:rotate(90deg)}
}
`;
