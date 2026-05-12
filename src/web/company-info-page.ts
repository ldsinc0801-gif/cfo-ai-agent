/**
 * 会社情報入力ページ
 * 会社全体のマスター情報（会社名・住所・代表者・決算月・設立日・法人番号・インボイス登録など）。
 * 会計AIや秘書AIから参照される基本データ。
 */
import { agentPageShell, esc } from './shared.js';
import { csrfFormHidden, getCurrentCsrfToken } from './security.js';
import type { TenantProfile } from '../repositories/supabase-repository.js';

export function renderCompanyInfoHTML(opts: {
  profile: TenantProfile;
  fiscalMonth: number | null;
  error?: string;
  success?: string;
}): string {
  const { profile, fiscalMonth } = opts;
  const csrf = csrfFormHidden(getCurrentCsrfToken() || '');

  const bodyHTML = `
<style>
.ci-banner{background:linear-gradient(135deg,#2298ae,#4dbdcf);border-radius:12px;padding:24px 28px;margin-bottom:20px;color:#fff}
.ci-banner h2{font-size:18px;font-weight:700;margin-bottom:6px}
.ci-banner p{font-size:13px;opacity:0.9;line-height:1.6}
.ci-alert-err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px}
.ci-alert-ok{background:#ecf6f8;border:1px solid #a8d8e0;color:#1b7f8e;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px}
.ci-section{background:#fff;border:1px solid var(--border);border-radius:12px;padding:24px;margin-bottom:20px}
.ci-section h3{font-size:15px;font-weight:700;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--border)}
.ci-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.ci-field{display:flex;flex-direction:column;gap:6px}
.ci-field.full{grid-column:1/-1}
.ci-field label{font-size:12px;font-weight:600;color:var(--text2)}
.ci-field input,.ci-field select,.ci-field textarea{padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;background:#fff}
.ci-field input:focus,.ci-field select:focus,.ci-field textarea:focus{border-color:var(--primary);outline:none;box-shadow:0 0 0 2px rgba(34,152,174,0.15)}
.ci-field .hint{font-size:11px;color:var(--text2)}
.ci-checkbox{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer}
.ci-actions{display:flex;justify-content:flex-end;gap:10px;padding-top:8px}
@media(max-width:640px){.ci-grid{grid-template-columns:1fr}}
</style>

<div class="ci-banner">
  <h2>会社情報</h2>
  <p>会社全体の基本情報を登録します。会計AI（決算月）、秘書AI（書類宛名）など各機能から参照されます。</p>
</div>

${opts.error ? `<div class="ci-alert-err">${esc(opts.error)}</div>` : ''}
${opts.success ? `<div class="ci-alert-ok">${esc(opts.success)}</div>` : ''}

<form action="/settings/company-info" method="post">
  ${csrf}

  <div class="ci-section">
    <h3>基本情報</h3>
    <div class="ci-grid">
      <div class="ci-field full">
        <label>会社名</label>
        <input type="text" name="companyName" value="${esc(profile.companyName || '')}" placeholder="株式会社○○"/>
      </div>
      <div class="ci-field">
        <label>郵便番号</label>
        <input type="text" name="postalCode" value="${esc(profile.postalCode || '')}" placeholder="100-0001"/>
      </div>
      <div class="ci-field">
        <label>電話番号</label>
        <input type="tel" name="phone" value="${esc(profile.phone || '')}" placeholder="03-xxxx-xxxx"/>
      </div>
      <div class="ci-field full">
        <label>住所</label>
        <input type="text" name="address" value="${esc(profile.address || '')}" placeholder="東京都千代田区..."/>
      </div>
      <div class="ci-field">
        <label>代表者名</label>
        <input type="text" name="representative" value="${esc(profile.representative || '')}" placeholder="代表取締役 山田太郎"/>
      </div>
      <div class="ci-field">
        <label>設立日</label>
        <input type="date" name="establishedDate" value="${esc(profile.establishedDate || '')}"/>
      </div>
      <div class="ci-field">
        <label>業種</label>
        <input type="text" name="industry" value="${esc(profile.industry || '')}" placeholder="ITコンサルティング"/>
      </div>
      <div class="ci-field">
        <label>従業員数</label>
        <input type="text" name="employeeCount" value="${esc(profile.employeeCount || '')}" placeholder="10名"/>
      </div>
    </div>
  </div>

  <div class="ci-section">
    <h3>決算情報</h3>
    <div class="ci-grid">
      <div class="ci-field">
        <label>決算月</label>
        <select name="fiscalMonth">
          <option value="">未設定</option>
          ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}" ${fiscalMonth === m ? 'selected' : ''}>${m}月</option>`).join('')}
        </select>
        <span class="hint">会計AIでの年補完や年度選択に使われます</span>
      </div>
      <div class="ci-field">
        <label>法人番号（13桁）</label>
        <input type="text" name="corporateNumber" value="${esc(profile.corporateNumber || '')}" placeholder="1234567890123" maxlength="13" pattern="[0-9]{13}"/>
        <span class="hint">国税庁から付与された13桁の法人番号</span>
      </div>
    </div>
  </div>

  <div class="ci-section">
    <h3>インボイス制度（適格請求書発行事業者）</h3>
    <div class="ci-grid">
      <div class="ci-field full">
        <label class="ci-checkbox">
          <input type="checkbox" name="invoiceRegistered" value="1" ${profile.invoiceRegistered ? 'checked' : ''} onchange="toggleInvoice(this)"/>
          適格請求書発行事業者として登録済み
        </label>
      </div>
      <div class="ci-field full" id="invoiceNumberField" style="display:${profile.invoiceRegistered ? 'flex' : 'none'}">
        <label>登録番号</label>
        <input type="text" name="invoiceNumber" value="${esc(profile.invoiceNumber || '')}" placeholder="T1234567890123" pattern="T[0-9]{13}"/>
        <span class="hint">T + 法人番号13桁（個人事業主の場合は別途付与された番号）</span>
      </div>
    </div>
  </div>

  <div class="ci-section">
    <h3>備考</h3>
    <div class="ci-grid">
      <div class="ci-field full">
        <textarea name="notes" rows="3" placeholder="その他のメモ（任意）">${esc(profile.notes || '')}</textarea>
      </div>
    </div>
  </div>

  <div class="ci-actions">
    <button type="submit" class="btn-primary">保存</button>
  </div>
</form>

<script>
function toggleInvoice(cb){
  document.getElementById('invoiceNumberField').style.display = cb.checked ? 'flex' : 'none';
}
</script>`;

  return agentPageShell({
    active: 'company-info',
    title: '会社情報',
    bodyHTML,
  });
}
