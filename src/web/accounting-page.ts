import type { JournalEntry, ReceiptAnalysis } from '../services/receipt-service.js';
import { agentPageShell, esc } from './shared.js';
import { accountSelectOptions } from '../config/freee-accounts.js';
import { csrfFormHidden, getCurrentCsrfToken } from './security.js';
import { TAX_CATEGORIES } from '../config/tax-categories.js';

/** 税区分セレクトのHTML生成（optgroupで売上/仕入/その他をグループ化） */
function taxCategorySelectOptions(selected: string): string {
  const groups: Record<string, typeof TAX_CATEGORIES> = { '売上': [], '仕入': [], 'その他': [] };
  for (const c of TAX_CATEGORIES) groups[c.group].push(c);
  return Object.entries(groups).map(([label, items]) =>
    `<optgroup label="${label}">${items.map(c =>
      `<option value="${esc(c.name)}" ${c.name === selected ? 'selected' : ''}>${esc(c.name)}</option>`
    ).join('')}</optgroup>`
  ).join('');
}

function csrfInput(): string {
  return csrfFormHidden(getCurrentCsrfToken() || '');
}

export interface AccountingPageOptions {
  aiAvailable: boolean;
  analysis?: ReceiptAnalysis | null;
  csvDownloadId?: string;
  error?: string;
  success?: string;
  /** 設定済みの決算月（1-12）。未設定なら null */
  fiscalMonth?: number | null;
  /** 仕訳生成対象の会計年度（決算月期末年）。未指定なら現在進行中の事業年度 */
  fiscalYear?: number | null;
  /** 確定済みバッチ（最近順） */
  recentBatches?: Array<{ id: string; label: string; entryCount: number; totalAmount: number; createdAt: string; freeeSentAt?: string | null; freeeSkipCount?: number }>;
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

${renderFiscalYearSelector(options.fiscalMonth, options.fiscalYear)}

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
      <form action="/agent/accounting/analyze?_csrf=${encodeURIComponent(getCurrentCsrfToken() || '')}" method="post" enctype="multipart/form-data" id="receiptForm">
        <input type="hidden" name="type" value="file"/>
        <div class="acc-dropzone" id="receiptDrop">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p class="drop-main">領収書・カード明細をドラッグ＆ドロップ</p>
          <label class="btn-upload">
            ファイルを選択
            <input type="file" name="file" accept="image/*,.pdf,.csv" hidden id="receiptFile" multiple/>
          </label>
          <p class="drop-hint">JPEG, PNG, PDF, CSV 対応・カード明細も可・複数ファイル可</p>
        </div>
        <div class="file-confirm" id="fileConfirm" style="display:none">
          <div class="file-info" id="fileInfo"></div>
          <div class="file-actions">
            <button type="button" class="btn-secondary btn-sm" onclick="resetFileUpload()">キャンセル</button>
            <button type="submit" class="btn-primary">AIで仕訳を生成</button>
          </div>
        </div>
      </form>
      ${!options.aiAvailable ? '<p class="warn-msg">Vertex AI の認証が未設定のため利用できません</p>' : ''}
    </div>
  </div>

  <!-- 動画アップロード -->
  <div class="card">
    <div class="card-header">
      <h3>動画からレシート読み取り</h3>
      <span class="card-sub">現金の領収書をまとめて処理</span>
    </div>
    <div class="card-body">
      <form action="/agent/accounting/analyze-video?_csrf=${encodeURIComponent(getCurrentCsrfToken() || '')}" method="post" enctype="multipart/form-data" id="videoForm">
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

// 税区分名 → 税率 のマップ（クライアント側でも逆算するため埋め込む）
var TAX_RATE_BY_CATEGORY = ${JSON.stringify(Object.fromEntries(TAX_CATEGORIES.map(c => [c.name, c.rate])))};

// 全フィールドの編集状態を集約して返す
function getCurrentEntries(){
  var rows = document.querySelectorAll('tr[data-original]');
  var entries = [];
  rows.forEach(function(tr){
    var orig = JSON.parse(tr.dataset.original);
    var taxCategory = tr.querySelector('.edit-taxcat').value;
    entries.push(Object.assign({}, orig, {
      date: tr.querySelector('.edit-date').value,
      debitAccount: tr.querySelector('.edit-debit').value,
      creditAccount: tr.querySelector('.edit-credit').value,
      amount: Number(tr.querySelector('.edit-amount').value) || 0,
      taxCategory: taxCategory,
      taxRate: TAX_RATE_BY_CATEGORY[taxCategory] || 0,
      taxAmount: Number(tr.querySelector('.edit-tax').value) || 0,
      description: tr.querySelector('.edit-desc').value,
      partnerName: tr.querySelector('.edit-partner').value,
    }));
  });
  return entries;
}

// 編集に応じて学習ボタンの表示制御 + freee/CSVのエクスポート対象を最新化
function onCellChange(el){
  var tr = el.closest('tr');
  var orig = JSON.parse(tr.dataset.original);
  var changed = (
    tr.querySelector('.edit-date').value !== orig.date ||
    tr.querySelector('.edit-debit').value !== orig.debitAccount ||
    tr.querySelector('.edit-credit').value !== orig.creditAccount ||
    Number(tr.querySelector('.edit-amount').value) !== orig.amount ||
    tr.querySelector('.edit-taxcat').value !== orig.taxCategory ||
    Number(tr.querySelector('.edit-tax').value) !== orig.taxAmount ||
    tr.querySelector('.edit-desc').value !== orig.description ||
    tr.querySelector('.edit-partner').value !== orig.partnerName
  );
  var btn = tr.querySelector('.btn-correct');
  if(btn) btn.style.display = changed ? 'inline-block' : 'none';
  syncExportTargets();
}

// 金額または税区分変更時、内税前提で消費税額を自動再計算
function onAmountOrTaxChange(el){
  var tr = el.closest('tr');
  var amount = Number(tr.querySelector('.edit-amount').value) || 0;
  var taxCategory = tr.querySelector('.edit-taxcat').value;
  var rate = TAX_RATE_BY_CATEGORY[taxCategory] || 0;
  if(amount && rate){
    var net = Math.round(amount / (1 + rate/100));
    tr.querySelector('.edit-tax').value = amount - net;
  } else {
    tr.querySelector('.edit-tax').value = 0;
  }
  onCellChange(el);
}

// freeeのhidden inputと弥生/汎用CSVのhrefを編集状態に同期
function syncExportTargets(){
  var entries = getCurrentEntries();
  var json = JSON.stringify(entries);
  var freeeInput = document.querySelector('#freeeForm input[name=entries]');
  if(freeeInput) freeeInput.value = json;
  var enc = encodeURIComponent(json);
  var csvLink = document.querySelector('a[href*="/agent/accounting/csv?entries="]');
  if(csvLink) csvLink.setAttribute('href', '/agent/accounting/csv?entries=' + enc);
  var yayoiLink = document.getElementById('yayoiBtn');
  if(yayoiLink){
    var counter = document.getElementById('yayoiCounter');
    var counterVal = counter && counter.checked ? '1' : '0';
    yayoiLink.setAttribute('href', '/agent/accounting/yayoi-csv?entries=' + enc + '&counter=' + counterVal);
  }
}

function sendChatCorrection(){
  var input = document.getElementById('chatInput');
  var msg = input.value.trim();
  if(!msg) return;
  input.value = '';

  var chatArea = document.getElementById('chatMessages');
  chatArea.innerHTML += '<div class="chat-msg chat-msg-user">'+msg+'</div>';
  chatArea.innerHTML += '<div class="chat-loading" id="chatLoading">AIが解析中...</div>';
  chatArea.scrollTop = chatArea.scrollHeight;

  // 編集後の最新状態をAIに渡す
  var entries = getCurrentEntries();

  fetch('/agent/accounting/chat-correct', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({entries:entries, message:msg})
  }).then(function(r){return r.json()}).then(function(data){
    var loading = document.getElementById('chatLoading');
    if(loading) loading.remove();

    if(data.success && data.corrections && data.corrections.length > 0){
      var FIELD_MAP = {
        debitAccount: '.edit-debit', creditAccount: '.edit-credit',
        date: '.edit-date', amount: '.edit-amount', taxCategory: '.edit-taxcat',
        taxAmount: '.edit-tax', description: '.edit-desc', partnerName: '.edit-partner',
      };
      data.corrections.forEach(function(c){
        var tr = document.querySelector('tr[data-idx="'+c.index+'"]');
        if(!tr) return;
        var sel = FIELD_MAP[c.field] ? tr.querySelector(FIELD_MAP[c.field]) : null;
        if(sel){
          sel.value = c.newValue;
          sel.style.background = '#d5eef3';
          setTimeout(function(){ sel.style.background = ''; }, 2000);
        }
        var orig = JSON.parse(tr.dataset.original);
        orig[c.field] = c.newValue;
        tr.dataset.original = JSON.stringify(orig);
      });
      syncExportTargets();
      chatArea.innerHTML += '<div class="chat-msg chat-msg-ai">'+data.aiMessage+'</div>';
    } else if(data.success){
      chatArea.innerHTML += '<div class="chat-msg chat-msg-ai">'+(data.aiMessage || '修正対象が見つかりませんでした')+'</div>';
    } else {
      chatArea.innerHTML += '<div class="chat-msg chat-msg-ai error">'+(data.error || 'エラーが発生しました')+'</div>';
    }
    chatArea.scrollTop = chatArea.scrollHeight;
  }).catch(function(err){
    var loading = document.getElementById('chatLoading');
    if(loading) loading.remove();
    chatArea.innerHTML += '<div class="chat-msg chat-msg-ai error">通信エラーが発生しました</div>';
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

function saveCorrection(idx){
  var tr = document.querySelector('tr[data-idx="'+idx+'"]');
  var original = JSON.parse(tr.dataset.original);
  var taxCategory = tr.querySelector('.edit-taxcat').value;
  var corrected = Object.assign({}, original, {
    date: tr.querySelector('.edit-date').value,
    debitAccount: tr.querySelector('.edit-debit').value,
    creditAccount: tr.querySelector('.edit-credit').value,
    amount: Number(tr.querySelector('.edit-amount').value) || 0,
    taxCategory: taxCategory,
    taxRate: TAX_RATE_BY_CATEGORY[taxCategory] || 0,
    taxAmount: Number(tr.querySelector('.edit-tax').value) || 0,
    description: tr.querySelector('.edit-desc').value,
    partnerName: tr.querySelector('.edit-partner').value,
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
</script>

${renderBatchHistory(options.recentBatches || [])}
`;

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
            <th>税区分</th>
            <th>消費税</th>
            <th>摘要</th>
            <th>取引先</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
${entries.map((e, i) => `
          <tr data-idx="${i}" data-original='${esc(JSON.stringify(e))}'>
            <td><input type="date" class="edit-input edit-date" value="${esc(e.date)}" onchange="onCellChange(this)"/></td>
            <td><select class="edit-select edit-debit" onchange="onCellChange(this)">${accountSelectOptions(e.debitAccount)}</select></td>
            <td><select class="edit-select edit-credit" onchange="onCellChange(this)">${accountSelectOptions(e.creditAccount)}</select></td>
            <td class="num"><input type="number" class="edit-input edit-amount num-input" value="${e.amount}" step="1" onchange="onAmountOrTaxChange(this)"/></td>
            <td><select class="edit-select edit-taxcat" onchange="onAmountOrTaxChange(this)">${taxCategorySelectOptions(e.taxCategory || '')}</select></td>
            <td class="num"><input type="number" class="edit-input edit-tax num-input" value="${e.taxAmount}" step="1" onchange="onCellChange(this)"/></td>
            <td><input type="text" class="edit-input edit-desc" value="${esc(e.description)}" onchange="onCellChange(this)" placeholder="摘要"/></td>
            <td><input type="text" class="edit-input edit-partner" value="${esc(e.partnerName)}" onchange="onCellChange(this)" placeholder="取引先"/></td>
            <td><button class="btn-correct btn-sm" onclick="saveCorrection(${i})" style="display:none">学習</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div id="correctionMsg" class="correction-msg" style="display:none"></div>

    <!-- Chat Correction -->
    <div class="chat-correct-area">
      <div class="chat-correct-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        仕訳の修正（チャット）
      </div>
      <div class="chat-messages" id="chatMessages"></div>
      <div class="chat-input-row">
        <input type="text" id="chatInput" class="chat-input" placeholder="例: 全部5月1日の日付にして / 2件目の借方を旅費交通費に / 1件目の金額を10000円に" onkeydown="if(event.key==='Enter')sendChatCorrection()"/>
        <button class="btn-primary btn-sm" onclick="sendChatCorrection()">送信</button>
      </div>
    </div>

    <!-- Actions -->
    <div class="result-actions">
      <button type="button" class="btn-primary" id="confirmBatchBtn" onclick="confirmBatch()" title="この仕訳を確定して保存します（後から一覧で見れます）">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        確定して保存
      </button>
      <form action="/agent/accounting/send-freee" method="post" style="display:inline" id="freeeForm">
        ${csrfInput()}
        <input type="hidden" name="entries" value='${esc(JSON.stringify(entries))}'/>
        <input type="hidden" name="confirmed" value="1"/>
        <button type="button" class="btn-primary" title="freee APIに仕訳を送信" onclick="openFreeeConfirm()">
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
          <input type="checkbox" id="yayoiCounter" checked onchange="syncExportTargets()"/> 相手勘定科目を含む
        </label>
      </div>
      <a href="/agent/accounting" class="btn-secondary">次の領収書を処理</a>
    </div>

    <!-- freee送信確認モーダル -->
    <div class="freee-modal-overlay" id="freeeConfirmModal" style="display:none">
      <div class="freee-modal">
        <div class="freee-modal-header">
          <h3>freee に送信する前に確認してください</h3>
        </div>
        <div class="freee-modal-body">
          <p class="freee-modal-warn">
            <strong>※AI生成の仕訳です。</strong>送信後は freee 側で取消・修正が必要になります。<br>
            内容に問題がないか必ずご確認のうえ、送信してください。
          </p>
          <div class="freee-modal-summary">
            <div class="freee-summary-row"><span>送信件数</span><strong>${entries.length} 件</strong></div>
            <div class="freee-summary-row"><span>合計金額</span><strong>${fmt(total)} 円</strong></div>
            <div class="freee-summary-row"><span>対象期間</span><strong>${entries.length > 0 ? `${esc(entries[0].date)} 〜 ${esc(entries[entries.length - 1].date)}` : '-'}</strong></div>
          </div>
          <div class="freee-modal-detail">
            <table class="freee-detail-table">
              <thead><tr><th>日付</th><th>借方</th><th>金額</th><th>摘要</th></tr></thead>
              <tbody>
                ${entries.slice(0, 20).map(e => `<tr><td>${esc(e.date)}</td><td>${esc(e.debitAccount)}</td><td class="num">${fmt(e.amount)}円</td><td>${esc(e.description).slice(0, 24)}</td></tr>`).join('')}
                ${entries.length > 20 ? `<tr><td colspan="4" style="text-align:center;color:#6b7280">…他 ${entries.length - 20} 件</td></tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>
        <div class="freee-modal-actions">
          <button type="button" class="btn-secondary" onclick="closeFreeeConfirm()">キャンセル</button>
          <button type="button" class="btn-primary" id="freeeSubmitBtn" onclick="submitFreeeForm()">
            freee に送信する
          </button>
        </div>
      </div>
    </div>
    <script>
    function confirmBatch(){
      var btn = document.getElementById('confirmBatchBtn');
      btn.disabled = true; btn.textContent = '保存中...';
      var entries = (typeof getCurrentEntries === 'function') ? getCurrentEntries() : [];
      if(entries.length === 0){
        btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/></svg> 確定して保存';
        window.__toast && window.__toast('仕訳がありません', 'error');
        return;
      }
      fetch('/agent/accounting/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: entries }),
      }).then(function(r){ return r.json(); }).then(function(data){
        if(data.success && data.batchId){
          window.location.href = '/agent/accounting/batch/' + data.batchId;
        } else {
          btn.disabled = false; btn.textContent = '確定して保存';
          window.__toast && window.__toast(data.error || '保存に失敗しました', 'error');
        }
      }).catch(function(){
        btn.disabled = false; btn.textContent = '確定して保存';
        window.__toast && window.__toast('通信エラー', 'error');
      });
    }
    function openFreeeConfirm(){
      // 編集後の最新値をhidden inputに反映してから確認モーダルを開く
      if(typeof syncExportTargets==='function') syncExportTargets();
      document.getElementById('freeeConfirmModal').style.display='flex';
    }
    function closeFreeeConfirm(){document.getElementById('freeeConfirmModal').style.display='none';}
    function submitFreeeForm(){
      var btn=document.getElementById('freeeSubmitBtn');
      btn.disabled=true;btn.textContent='送信中...';
      document.getElementById('freeeForm').submit();
    }
    </script>
  </div>
</div>`;
}

/**
 * 仕訳生成対象の会計年度を選ぶUI。
 * - 決算月が会社情報で未設定: 「会社情報で決算月を登録してください」リンクを表示
 * - 決算月が設定済み: 月固定で年セレクト（過去2年 〜 翌年）
 */
function renderFiscalYearSelector(fiscalMonth: number | null | undefined, fiscalYear: number | null | undefined): string {
  if (!fiscalMonth) {
    return `<div class="card" style="margin-bottom:20px">
      <div class="card-body" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:240px">
          <strong style="font-size:14px">対象会計年度</strong>
          <p style="font-size:12px;color:var(--text2);margin-top:4px;line-height:1.5">
            決算月が未設定です。<a href="/settings/company-info" style="color:var(--primary);font-weight:600">会社情報</a>から決算月を登録すると、ここで会計年度を選択できるようになります。
          </p>
        </div>
      </div>
    </div>`;
  }

  // 現在進行中の事業年度を算出
  const today = new Date();
  const tY = today.getFullYear();
  const tM = today.getMonth() + 1;
  let currentEndY: number;
  if (fiscalMonth === 12) currentEndY = tY;
  else currentEndY = tM <= fiscalMonth ? tY : tY + 1;

  // 過去2年〜来年 の範囲で選択肢
  const years = [currentEndY - 2, currentEndY - 1, currentEndY, currentEndY + 1];
  const selectedYear = fiscalYear || currentEndY;

  return `<div class="card" style="margin-bottom:20px">
    <div class="card-body" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:240px">
        <strong style="font-size:14px">対象会計年度</strong>
        <p style="font-size:12px;color:var(--text2);margin-top:4px;line-height:1.5">
          アップロードする仕訳がどの会計年度のものか選択してください。年が未記載のレシートはこの年度に基づいて自動で年が補完されます。
        </p>
      </div>
      <form action="/agent/accounting/fiscal-year" method="post" style="display:flex;gap:8px;align-items:center">
        ${csrfInput()}
        <select name="fiscalYear" class="edit-select" style="min-width:160px;padding:8px 10px;font-weight:500" onchange="this.form.submit()">
          ${years.map(y => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}年${fiscalMonth}月期</option>`).join('')}
        </select>
        <noscript><button type="submit" class="btn-secondary btn-sm">適用</button></noscript>
      </form>
    </div>
  </div>`;
}

/** バッチのfreee登録状態を判定してバッジHTMLを返す */
function freeeBadge(freeeSentAt?: string | null, skipCount?: number): string {
  if (!freeeSentAt) {
    return `<span class="freee-badge freee-badge-none">freee未登録</span>`;
  }
  if (skipCount && skipCount > 0) {
    return `<span class="freee-badge freee-badge-partial">freee一部登録（${skipCount}件スキップ）</span>`;
  }
  return `<span class="freee-badge freee-badge-done">freee登録済み</span>`;
}

/** 過去の確定済みバッチを一覧表示するフッター */
function renderBatchHistory(batches: Array<{ id: string; label: string; entryCount: number; totalAmount: number; createdAt: string; freeeSentAt?: string | null; freeeSkipCount?: number }>): string {
  if (!batches || batches.length === 0) {
    return `<div class="batch-history">
      <div class="batch-history-header">
        <strong>確定済みの仕訳データ</strong>
        <span style="font-size:12px;color:var(--text2)">まだ確定済みのデータはありません。生成した仕訳を「確定して保存」または「freeeに送信」すると、ここに履歴が並びます。</span>
      </div>
    </div>`;
  }
  const fmt = (n: number) => new Intl.NumberFormat('ja-JP').format(n);
  return `<div class="batch-history">
    <div class="batch-history-header">
      <strong>確定済みの仕訳データ（${batches.length}件）</strong>
    </div>
    <div class="batch-history-list">
      ${batches.map(b => `
        <a href="/agent/accounting/batch/${esc(b.id)}" class="batch-card">
          <div class="batch-card-label">${esc(b.label)}</div>
          <div class="batch-card-meta">${b.entryCount}件 / ${fmt(b.totalAmount)}円</div>
          <div class="batch-card-date">${new Date(b.createdAt).toLocaleString('ja-JP')}</div>
          <div style="margin-top:8px">${freeeBadge(b.freeeSentAt, b.freeeSkipCount)}</div>
        </a>`).join('')}
    </div>
  </div>`;
}

/**
 * バッチ詳細ページ。確定済み仕訳の編集・削除・freee再送・CSV再ダウンロードができる。
 */
export function renderBatchDetailHTML(opts: {
  batch: { id: string; label: string; entryCount: number; totalAmount: number; createdAt: string; freeeSentAt: string | null; freeeSkipCount?: number };
  entries: Array<{ id: string; entryDate: string; debitAccount: string; creditAccount: string; amount: number; taxCategory?: string | null; taxRate: number; taxAmount: number; description: string; partnerName: string; receiptType: string | null }>;
  fiscalMonth?: number | null;
  /** freee送信結果バナー表示用 */
  freeeStatus?: 'success' | 'already' | 'demo' | 'noauth' | 'nocompany' | 'error';
  freeeStatusMessage?: string;
}): string {
  const { batch, entries } = opts;
  const fmt = (n: number) => new Intl.NumberFormat('ja-JP').format(n);
  const total = entries.reduce((s, e) => s + (e.amount || 0), 0);

  // freee送信結果バナー
  let statusBanner = '';
  if (opts.freeeStatus === 'success') {
    statusBanner = `<div style="background:#ecf6f8;border:1px solid #a8d8e0;color:#1b7f8e;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:14px">
      <strong>✓ freee送信完了</strong> ${esc(opts.freeeStatusMessage || '')}
    </div>`;
  } else if (opts.freeeStatus === 'already') {
    statusBanner = `<div style="background:#fef3c7;border:1px solid #fde68a;color:#92400e;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:14px">
      この仕訳は既に freee に送信済みです。再送する場合は「freeeに再登録」ボタンから明示的に承諾の上、実行してください。
    </div>`;
  } else if (opts.freeeStatus === 'noauth') {
    statusBanner = `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:14px">
      freee連携が未設定です。「freee連携設定」から認証してください。
    </div>`;
  } else if (opts.freeeStatus === 'nocompany') {
    statusBanner = `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:14px">
      freee事業所が未選択です。「freee事業所設定」から選択してください。
    </div>`;
  } else if (opts.freeeStatus === 'demo') {
    statusBanner = `<div style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:14px">
      デモモードのため freee 送信は実行されません。
    </div>`;
  } else if (opts.freeeStatus === 'error') {
    statusBanner = `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:14px">
      <strong>freee送信エラー:</strong> ${esc(opts.freeeStatusMessage || '不明なエラー')}
    </div>`;
  }

  // freee送信ボタン（未送信なら通常表示、送信済みなら「再登録」表示）
  const alreadySent = !!batch.freeeSentAt;
  const freeeButton = `
    <button type="button" class="${alreadySent ? 'btn-secondary' : 'btn-primary'}" onclick="openFreeeConfirm()" title="${alreadySent ? '既にfreeeへ登録済みです。再度押すと重複登録になります。' : 'この仕訳をfreee APIに登録します'}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
      ${alreadySent ? 'freeeに再登録' : 'freeeに登録'}
    </button>`;

  const bodyHTML = `
<style>${PAGE_CSS}</style>

${statusBanner}

<div class="batch-detail-header">
  <div>
    <a href="/agent/accounting" class="batch-back-link">← 会計AIに戻る</a>
    <h2 style="font-size:20px;font-weight:700;margin-top:6px">${esc(batch.label)} ${freeeBadge(batch.freeeSentAt, batch.freeeSkipCount)}</h2>
    <div style="font-size:13px;color:var(--text2);margin-top:4px">
      ${batch.entryCount}件 / 合計 ${fmt(batch.totalAmount)}円 / 確定日時: ${new Date(batch.createdAt).toLocaleString('ja-JP')}
      ${batch.freeeSentAt ? ` / freee送信日時: ${new Date(batch.freeeSentAt).toLocaleString('ja-JP')}` : ''}
    </div>
  </div>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    ${freeeButton}
    <button type="button" class="btn-primary" onclick="saveBatchEdits()">変更を保存</button>
    <form action="/agent/accounting/batch/${esc(batch.id)}/delete" method="post" style="margin:0" onsubmit="return confirm('この仕訳データを削除しますか？元に戻せません。')">
      ${csrfInput()}
      <button type="submit" class="btn-secondary" style="color:#ef4444;border-color:#ef4444">この仕訳データを削除</button>
    </form>
  </div>
</div>

<div class="card" style="margin-top:16px">
  <div class="card-body">
    <div class="table-wrap">
      <table class="journal-table">
        <thead>
          <tr><th>日付</th><th>借方</th><th>貸方</th><th>金額</th><th>税区分</th><th>消費税</th><th>摘要</th><th>取引先</th></tr>
        </thead>
        <tbody>
          ${entries.map((e, i) => `
          <tr data-idx="${i}" data-id="${esc(e.id)}">
            <td><input type="date" class="edit-input edit-date" value="${esc(e.entryDate)}"/></td>
            <td><select class="edit-select edit-debit">${accountSelectOptions(e.debitAccount)}</select></td>
            <td><select class="edit-select edit-credit">${accountSelectOptions(e.creditAccount)}</select></td>
            <td class="num"><input type="number" class="edit-input edit-amount num-input" value="${e.amount}" step="1"/></td>
            <td><select class="edit-select edit-taxcat">${taxCategorySelectOptions(e.taxCategory || '')}</select></td>
            <td class="num"><input type="number" class="edit-input edit-tax num-input" value="${e.taxAmount}" step="1"/></td>
            <td><input type="text" class="edit-input edit-desc" value="${esc(e.description)}" placeholder="摘要"/></td>
            <td><input type="text" class="edit-input edit-partner" value="${esc(e.partnerName)}" placeholder="取引先"/></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- freee送信確認モーダル（未送信・送信済み両方で使う） -->
<div class="freee-modal-overlay" id="freeeConfirmModal" style="display:none">
  <div class="freee-modal">
    <div class="freee-modal-header">
      <h3>${alreadySent ? 'freee に再登録します' : 'freee に送信する前に確認してください'}</h3>
    </div>
    <div class="freee-modal-body">
      ${alreadySent ? `<p class="freee-modal-warn" style="background:#fef2f2;border-color:#fecaca;color:#991b1b">
        <strong>⚠️ この仕訳は既に ${new Date(batch.freeeSentAt!).toLocaleString('ja-JP')} に freee へ登録済みです。</strong><br>
        このまま送信すると freee 側に <strong>重複登録</strong>されます。先に freee 側で前回の取引を削除してから実行してください。
      </p>` : `<p class="freee-modal-warn">
        <strong>※AI生成の仕訳です。</strong>送信後は freee 側で取消・修正が必要になります。<br>
        内容に問題がないか必ずご確認のうえ、送信してください。
      </p>`}
      <div class="freee-modal-summary">
        <div class="freee-summary-row"><span>送信件数</span><strong>${entries.length} 件</strong></div>
        <div class="freee-summary-row"><span>合計金額</span><strong>${fmt(total)} 円</strong></div>
        <div class="freee-summary-row"><span>対象期間</span><strong>${entries.length > 0 ? `${esc(entries[0].entryDate)} 〜 ${esc(entries[entries.length - 1].entryDate)}` : '-'}</strong></div>
      </div>
      <div class="freee-modal-detail">
        <table class="freee-detail-table">
          <thead><tr><th>日付</th><th>借方</th><th>金額</th><th>摘要</th></tr></thead>
          <tbody>
            ${entries.slice(0, 20).map(e => `<tr><td>${esc(e.entryDate)}</td><td>${esc(e.debitAccount)}</td><td class="num">${fmt(e.amount)}円</td><td>${esc(e.description).slice(0, 24)}</td></tr>`).join('')}
            ${entries.length > 20 ? `<tr><td colspan="4" style="text-align:center;color:#6b7280">…他 ${entries.length - 20} 件</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>
    <div class="freee-modal-actions">
      <button type="button" class="btn-secondary" onclick="closeFreeeConfirm()">キャンセル</button>
      <form action="/agent/accounting/batch/${esc(batch.id)}/send-freee" method="post" style="display:inline">
        ${csrfInput()}
        <input type="hidden" name="confirmed" value="1"/>
        ${alreadySent ? '<input type="hidden" name="allow_duplicate" value="1"/>' : ''}
        <button type="submit" class="${alreadySent ? 'btn-secondary' : 'btn-primary'}" id="freeeSubmitBtn">${alreadySent ? '承知の上で再登録する' : 'freee に送信する'}</button>
      </form>
    </div>
  </div>
</div>

<script>
function openFreeeConfirm(){
  var m = document.getElementById('freeeConfirmModal');
  if(m) m.style.display = 'flex';
}
function closeFreeeConfirm(){
  var m = document.getElementById('freeeConfirmModal');
  if(m) m.style.display = 'none';
}
var BATCH_TAX_RATE_BY_CATEGORY = ${JSON.stringify(Object.fromEntries(TAX_CATEGORIES.map(c => [c.name, c.rate])))};
function collectEntries(){
  var rows = document.querySelectorAll('tr[data-idx]');
  var arr = [];
  rows.forEach(function(tr){
    var taxCategory = tr.querySelector('.edit-taxcat').value;
    arr.push({
      date: tr.querySelector('.edit-date').value,
      debitAccount: tr.querySelector('.edit-debit').value,
      creditAccount: tr.querySelector('.edit-credit').value,
      amount: Number(tr.querySelector('.edit-amount').value) || 0,
      taxCategory: taxCategory,
      taxRate: BATCH_TAX_RATE_BY_CATEGORY[taxCategory] || 0,
      taxAmount: Number(tr.querySelector('.edit-tax').value) || 0,
      description: tr.querySelector('.edit-desc').value,
      partnerName: tr.querySelector('.edit-partner').value,
    });
  });
  return arr;
}
function saveBatchEdits(){
  var entries = collectEntries();
  fetch('/agent/accounting/batch/${esc(batch.id)}/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: entries }),
  }).then(function(r){return r.json();}).then(function(data){
    if(data.success){
      window.__toast && window.__toast('保存しました', 'success');
    } else {
      window.__toast && window.__toast(data.error || '保存に失敗しました', 'error');
    }
  }).catch(function(){
    window.__toast && window.__toast('通信エラー', 'error');
  });
}
</script>`;

  return agentPageShell({
    active: 'accounting',
    title: batch.label,
    bodyHTML,
  });
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
.edit-input{border:1px solid var(--border);background:#fff;padding:4px 6px;border-radius:6px;font-size:12px;font-family:inherit;width:100%;min-width:0;transition:all .2s}
.edit-input:focus{border-color:var(--primary);outline:none;box-shadow:0 0 0 2px rgba(34,152,174,0.15)}
.edit-date{min-width:130px}
.edit-amount,.edit-tax{text-align:right;font-variant-numeric:tabular-nums}
.edit-taxrate{min-width:64px}
.edit-desc,.edit-partner{min-width:120px}
.num-input{max-width:110px}
.btn-correct{padding:3px 10px;border:1px solid #5ab4c4;background:#ecf6f8;color:#1b7f8e;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}
.btn-correct:hover{background:#a8d8e0}
.correction-msg{padding:10px 16px;border-radius:8px;font-size:13px;margin-top:12px;transition:opacity .3s}
.correction-ok{background:#d5eef3;color:#1b7f8e;border:1px solid #8dd0da}
.correction-err{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}

.chat-correct-area{margin-top:20px;border:1px solid var(--border);border-radius:12px;overflow:hidden}
.chat-correct-header{padding:12px 16px;background:var(--bg);font-size:13px;font-weight:600;color:var(--text2);display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border)}
.chat-messages{max-height:240px;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px}
.chat-messages:empty::before{content:'勘定科目・日付・金額・取引先などをまとめて修正できます（全件一括もOK）';color:var(--text2);font-size:12px;text-align:center;padding:20px 0}
.chat-input-row{display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--border);background:var(--bg)}
.chat-input{flex:1;border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:13px;outline:none;transition:border-color .2s}
.chat-input:focus{border-color:var(--primary)}
.chat-msg{padding:8px 12px;border-radius:10px;font-size:13px;max-width:85%;line-height:1.5;word-break:break-word}
.chat-msg-user{background:var(--primary);color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
.chat-msg-ai{background:#ecf6f8;color:#1b7f8e;align-self:flex-start;border-bottom-left-radius:4px}
.chat-msg-ai.error{background:#fef2f2;color:#991b1b}
.chat-loading{align-self:flex-start;color:var(--text2);font-size:12px;padding:8px 0}

.freee-modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
.freee-modal{background:#fff;border-radius:14px;max-width:640px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.2);overflow:hidden}
.freee-modal-header{padding:20px 24px;border-bottom:1px solid var(--border);background:#fef3c7}
.freee-modal-header h3{font-size:16px;font-weight:700;color:#92400e}
.freee-modal-body{padding:20px 24px;overflow-y:auto;flex:1}
.freee-modal-warn{font-size:13px;color:#7c2d12;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;margin-bottom:16px;line-height:1.7}
.freee-modal-summary{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:14px}
.freee-summary-row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
.freee-summary-row span{color:var(--text2)}
.freee-summary-row strong{font-weight:700;font-size:14px}
.freee-modal-detail{max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:8px}
.freee-detail-table{width:100%;border-collapse:collapse;font-size:12px}
.freee-detail-table th{background:var(--bg);font-weight:600;color:var(--text2);padding:8px 10px;text-align:left;position:sticky;top:0;border-bottom:1px solid var(--border)}
.freee-detail-table td{padding:6px 10px;border-bottom:1px solid #f3f4f6}
.freee-detail-table td.num{text-align:right;font-variant-numeric:tabular-nums}
.freee-modal-actions{padding:16px 24px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px;background:var(--bg)}
.freee-modal-actions .btn-primary,.freee-modal-actions .btn-secondary{padding:10px 24px;font-size:14px}

.freee-badge{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:10px;letter-spacing:0.02em;margin-left:6px;vertical-align:middle}
.freee-badge-done{background:#d5eef3;color:#1b7f8e}
.freee-badge-partial{background:#fef3c7;color:#92400e}
.freee-badge-none{background:#f3f4f6;color:#6b7280}

.batch-history{margin-top:32px;padding-top:24px;border-top:2px solid var(--border)}
.batch-history-header{display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.batch-history-header strong{font-size:15px}
.batch-history-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.batch-card{display:flex;flex-direction:column;padding:14px 16px;background:var(--card);border:1px solid var(--border);border-radius:10px;text-decoration:none;color:var(--text);transition:all .15s}
.batch-card:hover{border-color:var(--primary);box-shadow:0 4px 12px rgba(34,152,174,0.1);transform:translateY(-1px)}
.batch-card-label{font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.batch-card-meta{font-size:12px;color:var(--primary);font-weight:600;margin-bottom:2px}
.batch-card-date{font-size:11px;color:var(--text2)}

.batch-detail-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
.batch-back-link{font-size:12px;color:var(--text2);text-decoration:none}
.batch-back-link:hover{color:var(--primary)}

@media(max-width:768px){
  .acc-grid{grid-template-columns:1fr}
  .flow-steps{flex-direction:column}
  .flow-arrow{transform:rotate(90deg)}
  .batch-history-list{grid-template-columns:1fr}
}
`;
