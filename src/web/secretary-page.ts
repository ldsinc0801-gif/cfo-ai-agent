import { agentPageShell, esc } from './shared.js';
import type { DocumentTemplate, GeneratedDocument, DocumentType, CompanySettings } from '../services/secretary-service.js';
import type { CustomerBilling } from '../services/secretary-auto.js';

const TYPE_LABELS: Record<DocumentType, string> = {
  invoice: '請求書', estimate: '見積書', contract: '契約書', application: '申込書',
};

/** メインページ */
export function renderSecretaryPageHTML(opts: {
  templates: DocumentTemplate[];
  documents: GeneratedDocument[];
  detectedTasks?: Array<{ title: string; customerName: string }>;
  billingConfigs?: CustomerBilling[];
  companySettings?: CompanySettings | null;
  error?: string;
  success?: string;
}): string {
  const detected = opts.detectedTasks || [];
  const configs = opts.billingConfigs || [];
  const cs = opts.companySettings;

  const bodyHTML = `
<style>${PAGE_CSS}</style>

<div class="sec-banner">
  <div>
    <h2>秘書AIエージェント</h2>
    <p>請求書・見積書・契約書・申込書を作成。Googleタスクから請求書作成を自動検知します。</p>
  </div>
</div>

${opts.error ? `<div class="sec-error">${esc(opts.error)}</div>` : ''}
${opts.success ? `<div class="sec-success">${esc(opts.success)}</div>` : ''}

<!-- 会社情報・振込先情報 -->
<div class="card">
  <div class="card-header">
    <h3>会社情報・振込先設定</h3>
    ${cs ? `<span class="badge-configured">設定済み</span>` : `<span class="badge-unconfigured">未設定</span>`}
  </div>
  <div class="card-body">
    <form action="/agent/secretary/company-settings" method="post">
      <div class="company-settings-grid">
        <div class="settings-section">
          <h4>会社情報</h4>
          <div class="form-group"><label>会社名</label><input type="text" name="companyName" class="form-input" value="${esc(cs?.companyName || '')}" placeholder="株式会社○○" required/></div>
          <div class="form-group"><label>郵便番号</label><input type="text" name="postalCode" class="form-input" value="${esc(cs?.postalCode || '')}" placeholder="810-0001"/></div>
          <div class="form-group"><label>住所</label><input type="text" name="address" class="form-input" value="${esc(cs?.address || '')}" placeholder="福岡県福岡市..." required/></div>
          <div class="form-group"><label>代表者</label><input type="text" name="representative" class="form-input" value="${esc(cs?.representative || '')}" placeholder="代表取締役　山田太郎"/></div>
          <div class="form-group"><label>登録番号</label><input type="text" name="registrationNumber" class="form-input" value="${esc(cs?.registrationNumber || '')}" placeholder="T1234567890123"/></div>
        </div>
        <div class="settings-section">
          <h4>お振込先情報</h4>
          <div class="form-group"><label>金融機関名</label><input type="text" name="bankName" class="form-input" value="${esc(cs?.bankName || '')}" placeholder="○○銀行" required/></div>
          <div class="form-group"><label>支店名</label><input type="text" name="branchName" class="form-input" value="${esc(cs?.branchName || '')}" placeholder="○○支店"/></div>
          <div class="form-group"><label>預金種類</label><select name="accountType" class="form-select">
            <option value="普通預金" ${cs?.accountType === '普通預金' || !cs ? 'selected' : ''}>普通預金</option>
            <option value="当座預金" ${cs?.accountType === '当座預金' ? 'selected' : ''}>当座預金</option>
          </select></div>
          <div class="form-group"><label>口座番号</label><input type="text" name="accountNumber" class="form-input" value="${esc(cs?.accountNumber || '')}" placeholder="1234567"/></div>
          <div class="form-group"><label>口座名義</label><input type="text" name="accountHolder" class="form-input" value="${esc(cs?.accountHolder || '')}" placeholder="カ）○○"/></div>
        </div>
      </div>
      <div class="form-actions"><button type="submit" class="btn-primary btn-sm">設定を保存</button></div>
    </form>
  </div>
</div>

${detected.length > 0 ? `
<!-- Googleタスクから検知 -->
<div class="card detected-card">
  <div class="card-header">
    <h3>Googleタスクから請求書作成を検知</h3>
    <span class="badge-detected">${detected.length}件</span>
  </div>
  <div class="card-body">
    ${detected.map(t => {
      const config = configs.find(c => t.customerName.includes(c.customerName));
      return `
    <div class="detected-item">
      <div class="detected-info">
        <strong>${esc(t.customerName)}</strong>
        <span class="detected-task">${esc(t.title)}</span>
        ${config ? `<span class="detected-config">締日:${config.closingDay === 0 ? '末日' : config.closingDay + '日'} / 請求日:${config.invoiceDay === 0 ? '末日' : config.invoiceDay + '日'}</span>` : ''}
      </div>
      <a href="/agent/secretary/create/default-invoice?customer=${encodeURIComponent(t.customerName)}" class="btn-primary btn-sm">請求書作成</a>
    </div>`;
    }).join('')}
  </div>
</div>` : ''}

<!-- クイック請求書作成 -->
<div class="card">
  <div class="card-header"><h3>請求書を作成</h3></div>
  <div class="card-body">
    <div class="quick-actions">
      ${opts.templates.map(t => `
      <div class="quick-btn-wrap">
        <a href="/agent/secretary/create/${t.id}" class="quick-btn">
          <div class="quick-type">${TYPE_LABELS[t.type]}</div>
          <div class="quick-name">${esc(t.name)}</div>
        </a>
        <form action="/agent/secretary/template/${t.id}/delete" method="post" class="quick-delete-form" onsubmit="return confirm('「${esc(t.name)}」を削除しますか？')">
          <button type="submit" class="btn-quick-delete" title="テンプレートを削除">×</button>
        </form>
      </div>`).join('')}
      <a href="/agent/secretary/template-setup" class="quick-btn quick-add">
        <div class="quick-type">+</div>
        <div class="quick-name">テンプレート追加</div>
      </a>
    </div>
  </div>
</div>

<!-- 顧客別 請求設定 -->
<div class="card">
  <div class="card-header"><h3>顧客別 締め日・請求日設定</h3></div>
  <div class="card-body">
    <form action="/agent/secretary/billing-config" method="post">
      <table class="config-table" id="configTable">
        <thead><tr>
          <th>顧客名</th><th>締め日</th><th>請求日</th><th>支払期限</th><th></th>
        </tr></thead>
        <tbody>
          ${configs.map((c, i) => `
          <tr>
            <td><input type="text" name="cfg_name[]" value="${esc(c.customerName)}" class="form-input" placeholder="株式会社○○"/></td>
            <td><select name="cfg_closing[]" class="form-select">
              <option value="0" ${c.closingDay===0?'selected':''}>末日</option>
              <option value="10" ${c.closingDay===10?'selected':''}>10日</option>
              <option value="15" ${c.closingDay===15?'selected':''}>15日</option>
              <option value="20" ${c.closingDay===20?'selected':''}>20日</option>
              <option value="25" ${c.closingDay===25?'selected':''}>25日</option>
            </select></td>
            <td><select name="cfg_invoice[]" class="form-select">
              <option value="0" ${c.invoiceDay===0?'selected':''}>末日</option>
              <option value="10" ${c.invoiceDay===10?'selected':''}>10日</option>
              <option value="15" ${c.invoiceDay===15?'selected':''}>15日</option>
              <option value="20" ${c.invoiceDay===20?'selected':''}>20日</option>
              <option value="25" ${c.invoiceDay===25?'selected':''}>25日</option>
            </select></td>
            <td><select name="cfg_due[]" class="form-select">
              <option value="end_next" ${c.dueDateType==='end_next'?'selected':''}>翌月末</option>
              <option value="end_same" ${c.dueDateType==='end_same'?'selected':''}>当月末</option>
              <option value="30" ${c.dueDateType==='30'?'selected':''}>30日後</option>
              <option value="60" ${c.dueDateType==='60'?'selected':''}>60日後</option>
            </select></td>
            <td><button type="button" class="btn-danger btn-sm" onclick="this.closest('tr').remove()">削除</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button type="button" class="btn-secondary btn-sm" onclick="addConfigRow()">+ 顧客を追加</button>
        <button type="submit" class="btn-primary btn-sm">設定を保存</button>
      </div>
    </form>
  </div>
</div>

<!-- 作成済み書類 -->
${opts.documents.length > 0 ? `
<div class="card">
  <div class="card-header">
    <h3>作成済み書類（${opts.documents.length}件）</h3>
    <form action="/agent/secretary/documents/delete-all" method="post" style="margin:0" onsubmit="return confirm('全ての作成済み書類を削除しますか？')">
      <button type="submit" class="btn-secondary btn-sm" style="color:var(--red);border-color:var(--red);cursor:pointer">全件削除</button>
    </form>
  </div>
  <div class="card-body">
    <table class="doc-table">
      <thead><tr><th>種類</th><th>宛名</th><th>件名</th><th>金額</th><th>作成日</th><th>操作</th></tr></thead>
      <tbody>
        ${opts.documents.slice(0, 20).map(d => `<tr>
          <td>${TYPE_LABELS[d.type]}</td>
          <td>${esc(d.data.customerName || '-')}</td>
          <td>${esc(d.data.subject || '-')}</td>
          <td style="text-align:right">${d.data.total ? '¥' + Number(d.data.total).toLocaleString('ja-JP') : '-'}</td>
          <td>${new Date(d.createdAt).toLocaleDateString('ja-JP')}</td>
          <td style="white-space:nowrap">
            <a href="/agent/secretary/download/${d.id}" class="btn-secondary btn-sm">PDF</a>
            <a href="/agent/secretary/gmail/${d.id}" class="btn-secondary btn-sm">Gmail</a>
            <form action="/agent/secretary/document/${d.id}/delete" method="post" style="display:inline;margin:0" onsubmit="return confirm('この書類を削除しますか？')">
              <button type="submit" class="btn-secondary btn-sm" style="color:var(--red);border-color:var(--red);cursor:pointer">削除</button>
            </form>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>` : ''}

<script>
function addConfigRow(){
  var tbody = document.querySelector('#configTable tbody');
  var row = document.createElement('tr');
  row.innerHTML = '<td><input type="text" name="cfg_name[]" class="form-input" placeholder="株式会社○○"/></td>'
    +'<td><select name="cfg_closing[]" class="form-select"><option value="0">末日</option><option value="10">10日</option><option value="15">15日</option><option value="20">20日</option><option value="25">25日</option></select></td>'
    +'<td><select name="cfg_invoice[]" class="form-select"><option value="0">末日</option><option value="10">10日</option><option value="15">15日</option><option value="20">20日</option><option value="25">25日</option></select></td>'
    +'<td><select name="cfg_due[]" class="form-select"><option value="end_next">翌月末</option><option value="end_same">当月末</option><option value="30">30日後</option><option value="60">60日後</option></select></td>'
    +'<td><button type="button" class="btn-danger btn-sm" onclick="this.closest(\\'tr\\').remove()">削除</button></td>';
  tbody.appendChild(row);
}
</script>`;

  return agentPageShell({ active: 'secretary', title: '秘書AIエージェント', bodyHTML });
}

/** テンプレート登録ページ */
export function renderTemplateSetupHTML(error?: string): string {
  const bodyHTML = `
<style>${PAGE_CSS}</style>
<div class="sec-banner"><h2>テンプレート登録</h2><p>会社のフォーマット（Excel/Word/PDF/画像）をアップロード</p></div>
${error ? `<div class="sec-error">${esc(error)}</div>` : ''}
<form action="/agent/secretary/template/upload" method="post" enctype="multipart/form-data" class="card">
  <div class="card-header"><h3>テンプレートファイル</h3></div>
  <div class="card-body">
    <div class="form-grid">
      <div class="form-group">
        <label>書類タイプ</label>
        <select name="type" class="form-select">
          <option value="invoice">請求書</option><option value="estimate">見積書</option>
          <option value="contract">契約書</option><option value="application">申込書</option>
        </select>
      </div>
      <div class="form-group">
        <label>テンプレート名</label>
        <input type="text" name="name" class="form-input" placeholder="例: 法人請求書" required/>
      </div>
      <div class="form-group" style="grid-column:1/-1">
        <label>ファイル</label>
        <input type="file" name="template" accept=".png,.jpg,.jpeg,.pdf,.xlsx,.xls,.doc,.docx" class="form-input" required/>
        <span class="form-hint">Excel / Word / PDF / 画像対応</span>
      </div>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn-primary">登録</button>
      <a href="/agent/secretary" class="btn-secondary">戻る</a>
    </div>
  </div>
</form>`;
  return agentPageShell({ active: 'secretary', title: 'テンプレート登録', bodyHTML });
}

/** 書類作成フォーム（簡略化: 顧客名+件名プルダウン+金額） */
export function renderSecretaryFormHTML(opts: {
  template: DocumentTemplate;
  serviceList: string[];
  customerName?: string;
  billingConfig?: CustomerBilling | null;
  invoiceDate?: string;
  dueDate?: string;
  batchMonths?: number;
  error?: string;
}): string {
  const { template, serviceList, customerName, billingConfig, error } = opts;
  const today = new Date().toISOString().slice(0, 10);
  const invoiceDate = opts.invoiceDate || today;
  const dueDate = opts.dueDate || '';

  const bodyHTML = `
<style>${PAGE_CSS}</style>

<div class="sec-banner">
  <h2>${TYPE_LABELS[template.type]}の作成</h2>
  <p>テンプレート: ${esc(template.name)}${customerName ? ` / ${esc(customerName)}` : ''}</p>
</div>

${error ? `<div class="sec-error">${esc(error)}</div>` : ''}

<form action="/agent/secretary/generate" method="post" class="card">
  <input type="hidden" name="templateId" value="${template.id}"/>
  <div class="card-header"><h3>請求情報</h3></div>
  <div class="card-body">
    <div class="form-grid">
      <div class="form-group">
        <label>宛名（顧客名）</label>
        <input type="text" name="customerName" class="form-input" value="${esc(customerName || '')}" placeholder="株式会社○○" required/>
      </div>
      <div class="form-group">
        <label>件名（事業内容）</label>
        <input type="text" name="subject" class="form-input" list="subjectList" placeholder="件名を入力または選択" required/>
        <datalist id="subjectList">
          ${serviceList.map(s => `<option value="${esc(s)}"/>`).join('')}
        </datalist>
      </div>
      <div class="form-group">
        <label>請求書番号</label>
        <input type="text" name="invoiceNo" class="form-input" placeholder="INV-2026-001"/>
      </div>
    </div>

    <div class="batch-section">
      <h4>請求日・期間</h4>
      ${billingConfig ? `<div class="config-badge">顧客設定: 締日${billingConfig.closingDay === 0 ? '末日' : billingConfig.closingDay + '日'} / 請求日${billingConfig.invoiceDay === 0 ? '末日' : billingConfig.invoiceDay + '日'}</div>` : ''}
      <div class="form-grid">
        <div class="form-group">
          <label>請求日</label>
          <select name="invoiceDayType" class="form-select" onchange="toggleCustomDate(this)">
            <option value="today">今日（${today}）</option>
            <option value="end" ${billingConfig?.invoiceDay === 0 ? 'selected' : ''}>末日</option>
            <option value="10" ${billingConfig?.invoiceDay === 10 ? 'selected' : ''}>10日</option>
            <option value="15" ${billingConfig?.invoiceDay === 15 ? 'selected' : ''}>15日</option>
            <option value="20" ${billingConfig?.invoiceDay === 20 ? 'selected' : ''}>20日</option>
            <option value="25" ${billingConfig?.invoiceDay === 25 ? 'selected' : ''}>25日</option>
            <option value="custom">日付を指定</option>
          </select>
        </div>
        <div class="form-group" id="customDateGroup" style="display:none">
          <label>指定日付</label>
          <input type="date" name="customInvoiceDate" class="form-input" value="${today}"/>
        </div>
        <div class="form-group">
          <label>支払期限</label>
          <select name="dueDateType" class="form-select">
            <option value="end_next" ${billingConfig?.dueDateType === 'end_next' ? 'selected' : ''}>翌月末</option>
            <option value="end_same" ${billingConfig?.dueDateType === 'end_same' ? 'selected' : ''}>当月末</option>
            <option value="30" ${billingConfig?.dueDateType === '30' ? 'selected' : ''}>30日後</option>
            <option value="60" ${billingConfig?.dueDateType === '60' ? 'selected' : ''}>60日後</option>
          </select>
        </div>
        <div class="form-group">
          <label>一括生成</label>
          <select name="batchMonths" class="form-select">
            <option value="1">今月のみ</option>
            <option value="2">2ヶ月分</option><option value="3">3ヶ月分</option>
            <option value="6">6ヶ月分</option><option value="12">12ヶ月分</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 明細 -->
    <h4 style="margin:20px 0 12px">明細（金額を入力）</h4>
    <table class="lines-table" id="linesTable">
      <thead><tr><th>品目</th><th>単価</th><th>数量</th><th>金額</th><th></th></tr></thead>
      <tbody id="linesBody">
        <tr class="line-row">
          <td><input type="text" name="line_item[]" class="form-input" placeholder="コンサルティング費用"/></td>
          <td><input type="number" name="line_unitPrice[]" class="form-input line-price" placeholder="100000" onchange="calcLine(this)"/></td>
          <td><input type="number" name="line_quantity[]" class="form-input line-qty" value="1" onchange="calcLine(this)"/></td>
          <td><input type="number" name="line_amount[]" class="form-input line-amount" readonly/></td>
          <td><button type="button" class="btn-danger btn-sm" onclick="removeLine(this)">-</button></td>
        </tr>
      </tbody>
    </table>
    <button type="button" class="btn-secondary btn-sm" onclick="addLine()" style="margin:8px 0">+ 行を追加</button>

    <div class="totals">
      <div class="total-row"><span>小計</span><span id="subtotalDisplay">¥0</span></div>
      <div class="total-row"><span>消費税（10%）</span><span id="taxDisplay">¥0</span></div>
      <div class="total-row total-main"><span>合計</span><span id="totalDisplay">¥0</span></div>
    </div>
    <input type="hidden" name="subtotal" id="subtotalInput"/>
    <input type="hidden" name="tax" id="taxInput"/>
    <input type="hidden" name="total" id="totalInput"/>

    <div class="form-actions">
      <button type="submit" class="btn-primary" id="generateBtn">PDF生成</button>
      <a href="/agent/secretary" class="btn-secondary">戻る</a>
    </div>
  </div>
</form>

<script>
function toggleCustomDate(sel){document.getElementById('customDateGroup').style.display=sel.value==='custom'?'':'none';}
function addLine(){var t=document.getElementById('linesBody');var r=t.querySelector('.line-row').cloneNode(true);r.querySelectorAll('input').forEach(function(i){i.value='';});r.querySelector('.line-qty').value='1';t.appendChild(r);}
function removeLine(b){var t=document.getElementById('linesBody');if(t.children.length>1)b.closest('tr').remove();updateTotals();}
function calcLine(e){var r=e.closest('tr');var p=Number(r.querySelector('.line-price').value)||0;var q=Number(r.querySelector('.line-qty').value)||0;r.querySelector('.line-amount').value=p*q;updateTotals();}
function updateTotals(){var a=document.querySelectorAll('.line-amount');var s=0;a.forEach(function(x){s+=Number(x.value)||0;});var t=Math.floor(s*0.1);var g=s+t;var f=function(n){return'¥'+n.toLocaleString('ja-JP');};document.getElementById('subtotalDisplay').textContent=f(s);document.getElementById('taxDisplay').textContent=f(t);document.getElementById('totalDisplay').textContent=f(g);document.getElementById('subtotalInput').value=s;document.getElementById('taxInput').value=t;document.getElementById('totalInput').value=g;}
</script>`;

  return agentPageShell({ active: 'secretary', title: `${TYPE_LABELS[template.type]}の作成`, bodyHTML });
}

/** Gmail下書きフォーム */
export function renderGmailDraftHTML(doc: GeneratedDocument, error?: string, success?: string): string {
  const bodyHTML = `
<style>${PAGE_CSS}</style>
<div class="sec-banner"><h2>Gmail下書き作成</h2><p>${TYPE_LABELS[doc.type]}: ${esc(doc.data.customerName || '')} 宛</p></div>
${error ? `<div class="sec-error">${esc(error)}</div>` : ''}
${success ? `<div class="sec-success">${esc(success)}</div>` : ''}
<form action="/agent/secretary/gmail-draft" method="post" class="card">
  <input type="hidden" name="docId" value="${doc.id}"/>
  <div class="card-header"><h3>メール内容</h3></div>
  <div class="card-body">
    <div class="form-group"><label>宛先</label><input type="email" name="to" class="form-input" required placeholder="example@company.com"/></div>
    <div class="form-group"><label>件名</label><input type="text" name="subject" class="form-input" value="${esc(`【${TYPE_LABELS[doc.type]}】${doc.data.customerName || ''} 様`)}" required/></div>
    <div class="form-group"><label>本文</label><textarea name="body" class="form-textarea" rows="8">${esc(doc.data.customerName || '')} 様

いつもお世話になっております。
${TYPE_LABELS[doc.type]}を添付にてお送りいたします。

ご確認のほど、よろしくお願いいたします。</textarea></div>
    <div class="form-group"><label>添付</label><div class="attachment-info">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      ${esc(doc.templateName)}_${esc(doc.data.customerName || '')}.pdf</div></div>
    <div class="form-actions">
      <button type="submit" class="btn-primary">Gmail下書きを作成</button>
      <a href="/agent/secretary/download/${doc.id}" class="btn-secondary">PDFダウンロード</a>
      <a href="/agent/secretary" class="btn-secondary">戻る</a>
    </div>
  </div>
</form>`;
  return agentPageShell({ active: 'secretary', title: 'Gmail下書き作成', bodyHTML });
}

const PAGE_CSS = `
.sec-banner{background:linear-gradient(135deg,#1b7f8e,#2298ae,#4dbdcf);border-radius:var(--radius);padding:28px 32px;margin-bottom:24px;color:#fff}
.sec-banner h2{font-size:20px;font-weight:700;margin-bottom:8px}
.sec-banner p{font-size:14px;opacity:0.9}
.sec-error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:14px}
.sec-success{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:14px;white-space:pre-line}

.detected-card{border:2px solid #2298ae}
.badge-detected{background:#2298ae;color:#fff;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700}
.detected-item{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)}
.detected-item:last-child{border-bottom:none}
.detected-info{display:flex;flex-direction:column;gap:4px}
.detected-info strong{font-size:15px}
.detected-task{font-size:12px;color:var(--text2)}
.detected-config{font-size:11px;color:#2298ae;font-weight:600}
.config-badge{background:#e6f7f9;color:#2298ae;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;margin-bottom:12px;display:inline-block}

.quick-actions{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.quick-btn-wrap{position:relative}
.quick-btn{display:block;text-align:center;padding:20px 16px;border:1px solid var(--border);border-radius:10px;text-decoration:none;color:var(--text);transition:all .2s}
.quick-btn:hover{border-color:var(--primary);background:var(--primary-light)}
.quick-add{border-style:dashed;color:var(--text2)}
.quick-type{font-size:12px;font-weight:700;color:#2298ae;margin-bottom:4px}
.quick-name{font-size:14px;font-weight:600}
.quick-delete-form{position:absolute;top:4px;right:4px}
.btn-quick-delete{width:22px;height:22px;border:none;background:rgba(0,0,0,0.05);color:#999;border-radius:50%;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;transition:all .2s}
.btn-quick-delete:hover{background:#ef4444;color:#fff}

.config-table{width:100%;border-collapse:collapse;font-size:13px}
.config-table th{background:var(--bg);font-weight:600;color:var(--text2);font-size:11px;padding:8px;text-align:left;border-bottom:2px solid var(--border)}
.config-table td{padding:6px 4px}
.config-table .form-input,.config-table .form-select{width:100%;box-sizing:border-box;font-size:12px;padding:6px 8px}

.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.form-group{display:flex;flex-direction:column;gap:4px}
.form-group label{font-size:12px;font-weight:600;color:var(--text2)}
.form-input{border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:13px;outline:none}
.form-input:focus{border-color:var(--primary)}
.form-select{border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:13px;background:#fff}
.form-textarea{border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13px;resize:vertical;font-family:inherit;line-height:1.6;outline:none}
.form-hint{font-size:11px;color:var(--text2)}
.form-actions{display:flex;gap:10px;margin-top:24px;padding-top:16px;border-top:1px solid var(--border)}

.batch-section{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:16px;margin:20px 0}
.batch-section h4{font-size:14px;margin-bottom:12px}

.lines-table{width:100%;border-collapse:collapse;font-size:13px}
.lines-table th{background:var(--bg);font-weight:600;color:var(--text2);font-size:11px;padding:8px;text-align:left;border-bottom:2px solid var(--border)}
.lines-table td{padding:6px}
.lines-table .form-input{width:100%;box-sizing:border-box}
.totals{margin-top:16px;border-top:1px solid var(--border);padding-top:12px;max-width:300px;margin-left:auto}
.total-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px}
.total-main{font-weight:700;font-size:16px;border-top:2px solid var(--primary);padding-top:10px;margin-top:6px;color:var(--primary)}

.doc-table{width:100%;border-collapse:collapse;font-size:13px}
.doc-table th{background:var(--bg);font-weight:600;color:var(--text2);font-size:11px;padding:10px;text-align:left;border-bottom:2px solid var(--border)}
.doc-table td{padding:10px;border-bottom:1px solid var(--border)}

.btn-danger{padding:4px 12px;border:1px solid #ef4444;background:#fef2f2;color:#991b1b;border-radius:6px;font-size:11px;cursor:pointer}
.attachment-info{display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--text2)}

.badge-configured{background:#ecfdf5;color:#065f46;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700}
.badge-unconfigured{background:#fef2f2;color:#991b1b;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700}
.company-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.settings-section h4{font-size:13px;font-weight:700;margin-bottom:12px;color:var(--primary);border-bottom:1px solid var(--border);padding-bottom:6px}

@media(max-width:768px){.form-grid{grid-template-columns:1fr}.quick-actions{grid-template-columns:1fr 1fr}.company-settings-grid{grid-template-columns:1fr}}
`;
