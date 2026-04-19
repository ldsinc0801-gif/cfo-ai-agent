/**
 * ユーザー管理ページ（統合）
 * - 超管理者: テナント一覧・作成 + テナント内メンバー管理
 * - 財務管理者: 自テナントのメンバー管理（管理者招待、PWリセット）
 * - 管理者: 自テナントのメンバー管理（従業員追加）
 */
import { agentPageShell, esc } from './shared.js';
import type { SidebarUser } from './shared.js';

export function renderUsersHTML(user?: SidebarUser): string {
  const tenantRole = user?.tenantRole || '';
  const isSuperAdmin = user?.isSuperAdmin || false;
  const canInviteAdmin = isSuperAdmin || tenantRole === 'financial_admin';
  const canAddEmployee = isSuperAdmin || tenantRole === 'financial_admin' || tenantRole === 'admin';
  const canResetPw = isSuperAdmin || tenantRole === 'financial_admin';

  const bodyHTML = `
${isSuperAdmin ? `
<!-- 超管理者: テナント財務管理者セクション -->
<div class="card">
  <div class="card-header">
    <h3>テナント財務管理者</h3>
    <button class="btn-primary" onclick="showModal('addFAUserModal')">+ 財務管理者を登録</button>
  </div>
  <div class="card-body">
    <p style="color:var(--text2);font-size:13px;margin-bottom:12px">複数のテナントを横断して管理できるユーザーです。テナント作成後、各テナントに紐付けてください。</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>メール</th><th>名前</th><th>担当テナント</th><th>操作</th></tr></thead>
        <tbody id="faUsersList"><tr><td colspan="4" class="muted">読み込み中...</td></tr></tbody>
      </table>
    </div>
  </div>
</div>

<!-- 超管理者: テナント管理セクション -->
<div class="card">
  <div class="card-header">
    <h3>テナント一覧</h3>
    <button class="btn-primary" onclick="showModal('createTenantModal')">+ 新規テナント作成</button>
  </div>
  <div class="card-body" id="tenantsList">
    <p class="muted">読み込み中...</p>
  </div>
</div>
` : ''}

<!-- メンバー管理セクション -->
<div class="card">
  <div class="card-header">
    <h3>メンバー一覧</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${canInviteAdmin ? '<button class="btn-primary btn-sm" onclick="showInviteModal(\'admin\')">管理者を招待</button>' : ''}
      ${canAddEmployee ? '<button class="btn-secondary btn-sm" onclick="showInviteModal(\'employee\')">従業員を追加</button>' : ''}
    </div>
  </div>
  <div class="card-body">
    <!-- メンバー検索 -->
    <div style="margin-bottom:12px">
      <input type="text" id="memberSearch" placeholder="メール・名前で検索..." oninput="filterMembers()" autocomplete="off"
        style="width:100%;max-width:300px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;background:var(--bg)">
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th class="sortable" onclick="sortMembers('email')">メール <span id="sort-email"></span></th>
          <th class="sortable" onclick="sortMembers('name')">名前 <span id="sort-name"></span></th>
          <th class="sortable" onclick="sortMembers('role')">ロール <span id="sort-role"></span></th>
          <th>操作</th>
        </tr></thead>
        <tbody id="membersList"><tr><td colspan="4" class="muted">テナントを選択してください</td></tr></tbody>
      </table>
    </div>
  </div>
</div>

<!-- テナント作成モーダル -->
<div class="modal-overlay" id="createTenantModal" style="display:none" onclick="if(event.target===this)hideModal('createTenantModal')">
  <div class="modal-card">
    <h3>新規テナント作成</h3>
    <div class="fg"><label>テナント名 <span style="color:#ef4444">*</span></label>
      <input type="text" id="newTenantName" placeholder="例: 株式会社ABC" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="hideModal('createTenantModal')">キャンセル</button>
      <button class="btn-primary" onclick="createTenant()">作成</button>
    </div>
  </div>
</div>

<!-- 財務管理者追加モーダル（既存FA一覧から選択） -->
<div class="modal-overlay" id="addFAModal" style="display:none" onclick="if(event.target===this)hideModal('addFAModal')">
  <div class="modal-card">
    <h3>財務管理者を追加</h3>
    <p class="muted" id="addFATenantName" style="margin-bottom:16px"></p>
    <div class="fg"><label>テナント財務管理者を選択 <span style="color:#ef4444">*</span></label>
      <select id="faSelectUser" class="form-select-full">
        <option value="">-- 選択してください --</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="hideModal('addFAModal')">キャンセル</button>
      <button class="btn-primary" onclick="addFA()">追加</button>
    </div>
  </div>
</div>

<!-- 招待モーダル -->
<div class="modal-overlay" id="inviteModal" style="display:none" onclick="if(event.target===this)hideModal('inviteModal')">
  <div class="modal-card">
    <h3 id="inviteTitle">メンバーを追加</h3>
    <div class="fg"><label>メールアドレス <span style="color:#ef4444">*</span></label>
      <input type="email" id="invEmail" placeholder="user@example.com" autocomplete="off"></div>
    <div class="fg"><label>名前</label>
      <input type="text" id="invName" placeholder="名前" autocomplete="off"></div>
    <input type="hidden" id="invRole">
    <div class="modal-actions">
      <button class="btn-secondary" onclick="hideModal('inviteModal')">キャンセル</button>
      <button class="btn-primary" onclick="invite()">追加</button>
    </div>
  </div>
</div>

<!-- 財務管理者登録モーダル -->
<div class="modal-overlay" id="addFAUserModal" style="display:none" onclick="if(event.target===this)hideModal('addFAUserModal')">
  <div class="modal-card">
    <h3>テナント財務管理者を登録</h3>
    <p class="muted" style="margin-bottom:16px">複数テナントを管理できるユーザーを登録します。登録後、各テナントに紐付けてください。</p>
    <div class="fg"><label>メールアドレス <span style="color:#ef4444">*</span></label>
      <input type="email" id="faUserEmail" placeholder="user@example.com" autocomplete="off"></div>
    <div class="fg"><label>名前</label>
      <input type="text" id="faUserName" placeholder="名前" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="hideModal('addFAUserModal')">キャンセル</button>
      <button class="btn-primary" onclick="registerFAUser()">登録</button>
    </div>
  </div>
</div>

<!-- テナント紐付けモーダル -->
<div class="modal-overlay" id="linkTenantModal" style="display:none" onclick="if(event.target===this)hideModal('linkTenantModal')">
  <div class="modal-card">
    <h3>テナントに紐付け</h3>
    <p class="muted" id="linkTenantUserName" style="margin-bottom:16px"></p>
    <div class="fg"><label>紐付けるテナント</label>
      <div id="linkTenantCheckboxes" style="max-height:200px;overflow-y:auto"></div>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="hideModal('linkTenantModal')">閉じる</button>
      <button class="btn-primary" onclick="saveTenantLinks()">保存</button>
    </div>
  </div>
</div>

<!-- パスワード表示モーダル -->
<div class="modal-overlay" id="pwModal" style="display:none">
  <div class="modal-card">
    <h3>完了</h3>
    <p id="pwMsg" style="margin-bottom:12px"></p>
    <div class="pw-display">
      <span id="pwVal"></span>
      <button class="pw-copy-btn" onclick="copyPw()" id="copyBtn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        コピー
      </button>
    </div>
    <p style="color:#ef4444;font-size:12px;margin-bottom:16px">
      <!-- 初期パスワードは画面表示で運用（手動伝達） -->
      このパスワードは二度と表示されません。必ずコピーしてご本人にお伝えください。
    </p>
    <div class="modal-actions">
      <button class="btn-primary" onclick="closePwModal()">閉じる</button>
    </div>
  </div>
</div>

<!-- 確認ダイアログ -->
<div class="modal-overlay" id="confirmModal" style="display:none">
  <div class="modal-card">
    <h3 id="confirmTitle">確認</h3>
    <p id="confirmMsg" style="margin-bottom:20px;line-height:1.6"></p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="hideModal('confirmModal')">キャンセル</button>
      <button class="btn-primary" id="confirmOkBtn" style="background:#ef4444">実行</button>
    </div>
  </div>
</div>

<style>
.modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px}
.modal-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:32px;width:100%;max-width:440px;box-shadow:0 16px 48px rgba(0,0,0,0.15)}
.modal-card h3{font-size:18px;font-weight:700;margin-bottom:20px}
.fg{margin-bottom:16px}
.fg label{display:block;font-size:13px;font-weight:600;color:var(--text2);margin-bottom:6px}
.fg input{width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;outline:none;background:var(--bg);transition:border-color .15s}
.fg input:focus{border-color:var(--primary)}
.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
.t-card{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:12px;transition:box-shadow .15s}
.t-card:hover{box-shadow:0 2px 8px rgba(0,0,0,0.06)}
.t-card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.t-card-top h4{font-size:15px;font-weight:700}
.t-card-meta{font-size:12px;color:var(--text2);display:flex;gap:16px;flex-wrap:wrap}
.t-card-actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.role-badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600}
.role-fa{background:#dbeafe;color:#1d4ed8}
.tenant-tag{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:500;background:#f0f9ff;color:#0369a1;margin:2px}
.link-checkbox{display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;transition:background .1s}
.link-checkbox:hover{background:var(--bg)}
.link-checkbox input{width:16px;height:16px}
.form-select-full{width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;outline:none;background:var(--bg);cursor:pointer}
.form-select-full:focus{border-color:var(--primary)}
.role-admin{background:#d1fae5;color:#065f46}
.role-emp{background:#f3f4f6;color:#6b7280}
.act-btn{background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;color:var(--text2);font-family:inherit;transition:all .15s}
.act-btn:hover{border-color:var(--primary);color:var(--primary)}
.act-btn.danger:hover{border-color:#ef4444;color:#ef4444}
.sortable{cursor:pointer;user-select:none}
.sortable:hover{color:var(--primary)}
.pw-display{display:flex;align-items:center;gap:8px;background:#f1f5f9;border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:8px}
.pw-display span{flex:1;font-family:monospace;font-size:15px;color:var(--primary);letter-spacing:1px}
.pw-copy-btn{display:flex;align-items:center;gap:4px;background:var(--primary);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity .15s;white-space:nowrap}
.pw-copy-btn:hover{opacity:0.85}
.pw-copy-btn.copied{background:#22c55e}
@media(max-width:768px){
  .modal-card{padding:24px 20px}
  .card-header{flex-direction:column;gap:12px;align-items:flex-start}
  table{font-size:12px}
  th,td{padding:8px 6px}
}
@media(max-width:480px){
  table th:nth-child(2),table td:nth-child(2){display:none}
}
</style>

<script>
var isSA=${isSuperAdmin},canRA=${canResetPw},canIA=${canInviteAdmin},curFATid='';
var allMembers=[],sortKey='',sortAsc=true,pwCopied=false;

function showModal(id){document.getElementById(id).style.display='flex';}
function hideModal(id){document.getElementById(id).style.display='none';}

function rl(r){
  if(r==='financial_admin')return '<span class="role-badge role-fa">財務管理者</span>';
  if(r==='admin')return '<span class="role-badge role-admin">管理者</span>';
  return '<span class="role-badge role-emp">従業員</span>';
}
function roleOrder(r){return r==='financial_admin'?3:r==='admin'?2:1;}

function showConfirm(title,msg,onOk){
  document.getElementById('confirmTitle').textContent=title;
  document.getElementById('confirmMsg').textContent=msg;
  var btn=document.getElementById('confirmOkBtn');
  btn.onclick=function(){hideModal('confirmModal');onOk();};
  showModal('confirmModal');
}

// === Tenant Management (super admin) ===
function loadTenants(){
  if(!isSA)return;
  fetch('/api/tenants').then(function(r){return r.json()}).then(function(d){
    var list=d.tenants||[],el=document.getElementById('tenantsList');
    if(list.length===0){el.innerHTML='<p class="muted">テナントがまだありません。「+ 新規テナント作成」から追加してください。</p>';return;}
    el.innerHTML=list.map(function(t){
      var id=t.id,nm=t.name;
      return '<div class="t-card"><div class="t-card-top"><h4>'+nm+'</h4></div>'+
        '<div class="t-card-meta"><span>作成日: '+(t.created_at||'').substring(0,10)+'</span></div>'+
        '<div class="t-card-actions">'+
          '<button class="btn-secondary btn-sm" onclick="showAddFA(\\''+id+'\\',\\''+nm+'\\')">財務管理者追加</button>'+
          '<button class="btn-secondary btn-sm" onclick="switchAndLoad(\\''+id+'\\')">このテナントを表示</button>'+
          '<button class="act-btn danger" onclick="deleteTenant(\\''+id+'\\',\\''+nm+'\\')">削除</button>'+
        '</div></div>';
    }).join('');
  });
}
function switchAndLoad(tid){
  fetch('/api/tenant/switch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenantId:tid})})
    .then(function(r){return r.json()}).then(function(d){
      if(d.success){loadMembers();window.__toast('テナントを切り替えました','success');}
    });
}
function createTenant(){
  var nm=document.getElementById('newTenantName').value.trim();
  if(!nm){window.__toast('テナント名を入力してください','error');return;}
  fetch('/api/tenants',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:nm})})
    .then(function(r){return r.json()}).then(function(d){
      if(d.error){window.__toast(d.error,'error');return;}
      hideModal('createTenantModal');loadTenants();window.__toast('テナントを作成しました','success');
    });
}
function showAddFA(tid,tnm){
  curFATid=tid;
  document.getElementById('addFATenantName').textContent='対象: '+tnm;
  // 既存のテナント財務管理者をプルダウンに読み込み
  var sel=document.getElementById('faSelectUser');
  sel.innerHTML='<option value="">読み込み中...</option>';
  fetch('/api/financial-admins').then(function(r){return r.json()}).then(function(d){
    var fas=d.financialAdmins||[];
    var html='<option value="">-- 選択してください --</option>';
    fas.forEach(function(fa){
      html+='<option value="'+fa.email+'">'+fa.name+' ('+fa.email+')</option>';
    });
    if(fas.length===0) html+='<option value="" disabled>財務管理者が登録されていません（先に上部で登録してください）</option>';
    sel.innerHTML=html;
  });
  showModal('addFAModal');
}
function addFA(){
  var sel=document.getElementById('faSelectUser');
  var em=sel.value;
  if(!em){window.__toast('財務管理者を選択してください','error');return;}
  var selectedText=sel.options[sel.selectedIndex].text;
  var nm=selectedText.split(' (')[0]||'';
  fetch('/api/tenants/'+curFATid+'/financial-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,name:nm})})
    .then(function(r){return r.json()}).then(function(d){
      if(d.error){window.__toast(d.error,'error');return;}
      hideModal('addFAModal');
      window.__toast(nm+' をこのテナントの財務管理者として追加しました','success');
      loadTenants();loadFAUsers();
    });
}

// === Member Management ===
function loadMembers(){
  fetch('/api/tenant/members').then(function(r){return r.json()}).then(function(d){
    allMembers=d.members||[];
    renderMembers();
  }).catch(function(){
    allMembers=[];
    document.getElementById('membersList').innerHTML='<tr><td colspan="4" class="muted">テナントを選択してください</td></tr>';
  });
}
function renderMembers(){
  var list=allMembers.slice();
  // search
  var q=(document.getElementById('memberSearch')||{}).value||'';
  if(q){q=q.toLowerCase();list=list.filter(function(m){return(m.email+' '+(m.name||'')).toLowerCase().indexOf(q)>=0;});}
  // sort
  if(sortKey){
    list.sort(function(a,b){
      var va,vb;
      if(sortKey==='role'){va=roleOrder(a.role);vb=roleOrder(b.role);}
      else{va=(a[sortKey]||'').toLowerCase();vb=(b[sortKey]||'').toLowerCase();}
      if(va<vb)return sortAsc?-1:1;if(va>vb)return sortAsc?1:-1;return 0;
    });
  }
  var el=document.getElementById('membersList');
  if(list.length===0){el.innerHTML='<tr><td colspan="4" class="muted">'+(allMembers.length?'該当なし':'メンバーがいません')+'</td></tr>';return;}
  el.innerHTML=list.map(function(m){
    var act='';
    var canDel=(m.role==='employee')||(canIA&&m.role==='admin');
    if(canRA&&m.role!=='financial_admin')
      act+='<button class="act-btn" onclick="resetPw(\\''+m.userId+'\\',\\''+m.email+'\\')">PWリセット</button> ';
    if(isSA||canDel)
      act+='<button class="act-btn danger" onclick="delMem(\\''+m.userId+'\\',\\''+m.email+'\\')">削除</button>';
    if(m.role==='financial_admin'&&!isSA) act='-';
    return '<tr><td>'+m.email+'</td><td>'+(m.name||'-')+'</td><td>'+rl(m.role)+'</td><td>'+act+'</td></tr>';
  }).join('');
}
function filterMembers(){renderMembers();}
function sortMembers(key){
  if(sortKey===key){sortAsc=!sortAsc;}else{sortKey=key;sortAsc=true;}
  ['email','name','role'].forEach(function(k){
    var el=document.getElementById('sort-'+k);
    if(el)el.textContent=sortKey===k?(sortAsc?'▲':'▼'):'';
  });
  renderMembers();
}

function showInviteModal(role){
  document.getElementById('invRole').value=role;
  document.getElementById('inviteTitle').textContent=role==='admin'?'管理者を招待':'従業員を追加';
  document.getElementById('invEmail').value='';document.getElementById('invName').value='';
  showModal('inviteModal');document.getElementById('invEmail').focus();
}
function invite(){
  var em=document.getElementById('invEmail').value.trim();
  var nm=document.getElementById('invName').value.trim();
  var role=document.getElementById('invRole').value;
  if(!em){window.__toast('メールアドレスを入力してください','error');return;}
  fetch('/api/tenant/invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,name:nm,role:role})})
    .then(function(r){return r.json()}).then(function(d){
      if(d.error){window.__toast(d.error,'error');return;}
      hideModal('inviteModal');
      if(d.isExistingUser){
        window.__toast(em+' を追加しました（既存ユーザー、パスワード変更なし）','success');
      } else if(d.initialPassword){
        showPw(em+' を追加しました。',d.initialPassword);
      }
      loadMembers();
    });
}
function resetPw(uid,em){
  showConfirm('パスワードリセット',em+' のパスワードをリセットしますか？新しいパスワードが生成されます。',function(){
    fetch('/api/tenant/members/'+uid+'/reset-password',{method:'POST'})
      .then(function(r){return r.json()}).then(function(d){
        if(d.error){window.__toast(d.error,'error');return;}
        showPw(em+' のパスワードをリセットしました。',d.newPassword);
      });
  });
}
function delMem(uid,em){
  showConfirm('メンバー削除',em+' をこのテナントから削除しますか？この操作は取り消せません。',function(){
    fetch('/api/tenant/members/'+uid,{method:'DELETE'})
      .then(function(r){return r.json()}).then(function(d){
        if(d.error){window.__toast(d.error,'error');return;}
        window.__toast(em+' を削除しました','success');
        loadMembers();
      });
  });
}
function showPw(msg,pw){
  pwCopied=false;
  document.getElementById('pwMsg').textContent=msg;
  document.getElementById('pwVal').textContent=pw;
  var btn=document.getElementById('copyBtn');
  btn.className='pw-copy-btn';
  btn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> コピー';
  showModal('pwModal');
}
function copyPw(){
  var pw=document.getElementById('pwVal').textContent;
  navigator.clipboard.writeText(pw).then(function(){
    pwCopied=true;
    var btn=document.getElementById('copyBtn');
    btn.className='pw-copy-btn copied';
    btn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> コピー済み';
    window.__toast('コピーしました','success');
  });
}
function closePwModal(){
  if(!pwCopied){
    showConfirm('確認','パスワードをコピーしましたか？この画面を閉じると再表示できません。',function(){hideModal('pwModal');});
  } else {
    hideModal('pwModal');
  }
}

// Escキーでモーダルを閉じる
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    ['confirmModal','pwModal','inviteModal','addFAModal','createTenantModal'].forEach(function(id){
      var el=document.getElementById(id);
      if(el&&el.style.display!=='none'){
        if(id==='pwModal'&&!pwCopied)return; // パスワード未コピー時はEscで閉じない
        hideModal(id);
      }
    });
  }
});

// === 財務管理者管理 ===
var allTenantsList=[];
var currentLinkUserId='';

function loadFAUsers(){
  if(!isSA)return;
  fetch('/api/financial-admins').then(function(r){return r.json()}).then(function(d){
    var list=d.financialAdmins||[];
    var el=document.getElementById('faUsersList');
    if(list.length===0){el.innerHTML='<tr><td colspan="4" class="muted">テナント財務管理者がいません</td></tr>';return;}
    el.innerHTML=list.map(function(fa){
      var tenantTags=fa.tenants.map(function(t){return '<span class="tenant-tag">'+t.name+'</span>'}).join(' ');
      return '<tr><td>'+fa.email+'</td><td>'+(fa.name||'-')+'</td><td>'+(tenantTags||'<span class="muted">未紐付け</span>')+'</td><td><button class="act-btn" onclick="openLinkTenantModal(\\''+fa.userId+'\\',\\''+fa.email+'\\')">テナント紐付け</button> <button class="act-btn danger" onclick="deleteFAUser(\\''+fa.userId+'\\',\\''+fa.email+'\\')">削除</button></td></tr>';
    }).join('');
  });
}

function registerFAUser(){
  var em=document.getElementById('faUserEmail').value.trim();
  var nm=document.getElementById('faUserName').value.trim();
  if(!em){window.__toast('メールアドレスを入力してください','error');return;}
  // 最初のテナント（任意）に financial_admin として追加（テナント紐付けは後から調整）
  // まずテナント一覧を取得して最初のテナントに追加
  fetch('/api/tenants').then(function(r){return r.json()}).then(function(td){
    var tenants=td.tenants||[];
    if(tenants.length===0){window.__toast('テナントを先に作成してください','error');return;}
    var firstTid=tenants[0].id;
    fetch('/api/tenants/'+firstTid+'/financial-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,name:nm})})
      .then(function(r){return r.json()}).then(function(d){
        if(d.error){window.__toast(d.error,'error');return;}
        hideModal('addFAUserModal');
        if(d.isExistingUser){
          window.__toast(em+' を財務管理者として登録しました（既存ユーザー）','success');
        } else {
          showPw(em+' を財務管理者として登録しました。',d.initialPassword);
        }
        loadFAUsers();loadTenants();
      });
  });
}

function openLinkTenantModal(userId,email){
  currentLinkUserId=userId;
  document.getElementById('linkTenantUserName').textContent=email+' のテナント紐付け';
  // テナント一覧とユーザーの現在の紐付けを取得
  Promise.all([
    fetch('/api/tenants').then(function(r){return r.json()}),
    fetch('/api/financial-admins').then(function(r){return r.json()})
  ]).then(function(results){
    var tenants=results[0].tenants||[];
    var fas=results[1].financialAdmins||[];
    allTenantsList=tenants;
    var currentFA=fas.find(function(f){return f.userId===userId});
    var linkedTids=new Set((currentFA?currentFA.tenants:[]).map(function(t){return t.id}));
    var html=tenants.map(function(t){
      var tid=t.id||t.tenantId;
      var nm=t.name||t.tenantName;
      var checked=linkedTids.has(tid)?'checked':'';
      return '<label class="link-checkbox"><input type="checkbox" value="'+tid+'" '+checked+'/><span>'+nm+'</span></label>';
    }).join('');
    document.getElementById('linkTenantCheckboxes').innerHTML=html;
    showModal('linkTenantModal');
  });
}

function saveTenantLinks(){
  var checks=document.querySelectorAll('#linkTenantCheckboxes input[type=checkbox]:checked');
  var tids=[];
  for(var i=0;i<checks.length;i++) tids.push(checks[i].value);
  fetch('/api/financial-admins/'+currentLinkUserId+'/tenants',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenantIds:tids})})
    .then(function(r){return r.json()}).then(function(d){
      if(d.error){window.__toast(d.error,'error');return;}
      hideModal('linkTenantModal');
      window.__toast('テナント紐付けを更新しました','success');
      loadFAUsers();
    });
}

// === 削除操作 ===
function deleteFAUser(userId,email){
  showConfirm('財務管理者を削除','「'+email+'」を全テナントの財務管理者から解除し、ユーザーを削除しますか？この操作は取り消せません。',function(){
    // 全テナントからの紐付けを解除
    fetch('/api/financial-admins/'+userId+'/tenants',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenantIds:[]})})
      .then(function(){
        // ユーザー自体を削除
        return fetch('/api/users/'+userId,{method:'DELETE'});
      })
      .then(function(r){return r.json()}).then(function(d){
        if(d.error){window.__toast(d.error,'error');return;}
        window.__toast(email+' を削除しました','success');
        loadFAUsers();
      });
  });
}

function deleteTenant(tid,name){
  showConfirm('テナントを削除','「'+name+'」を削除しますか？テナントに紐づく全データ（メンバー、タスク、書類等）が削除されます。この操作は取り消せません。',function(){
    fetch('/api/tenants/'+tid,{method:'DELETE'})
      .then(function(r){return r.json()}).then(function(d){
        if(d.error){window.__toast(d.error,'error');return;}
        window.__toast(name+' を削除しました','success');
        loadTenants();loadFAUsers();
      });
  });
}

loadTenants();loadMembers();loadFAUsers();
</script>`;

  return agentPageShell({
    active: 'users',
    title: 'ユーザー管理',
    user,
    bodyHTML,
  });
}
