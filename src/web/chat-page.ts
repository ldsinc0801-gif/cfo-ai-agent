import type { ChatMessage, CompanyMemory } from '../services/chat-service.js';
import { renderSidebar, esc, SHARED_CSS } from './shared.js';
import { getOSSummary, isEnterpriseOSAvailable } from '../services/enterprise-os.js';

export function renderChatHTML(history: ChatMessage[], memory: CompanyMemory, aiAvailable: boolean): string {
  const osSummary = isEnterpriseOSAvailable() ? getOSSummary() : [];
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI CFOチャット</title>
<style>
${SHARED_CSS}
${CHAT_CSS}
</style>
</head>
<body>
${renderSidebar('chat')}
<div class="main">
  <header class="header">
    <button class="menu-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <div class="header-left">
      <h1 class="header-title">AI CFOチャット</h1>
      ${memory.companyName ? `<span class="header-company">${esc(memory.companyName)}</span>` : ''}
    </div>
    <div class="header-right">
      <div class="usage-badge" id="usageBadge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        <span class="usage-text-val">--</span>
      </div>
      <button class="btn-secondary btn-sm" onclick="if(confirm('会話履歴をクリアしますか？'))fetch('/chat/clear',{method:'POST'}).then(()=>location.reload())">履歴クリア</button>
    </div>
  </header>

  <div class="chat-layout">
    <!-- Sidebar: Memory -->
    <aside class="chat-sidebar">
      ${osSummary.length > 0 ? `
      <div class="mem-card">
        <h3>企業AI OS</h3>
        <div style="font-size:12px;color:#6b7280;margin-bottom:10px">企業の第一次情報をAIが参照しています</div>
        <div class="os-categories">
          ${osSummary.map(c => `
            <div class="os-cat">
              <div class="os-cat-head">
                <span class="os-cat-name">${esc(c.id.replace(/_/g, ' '))}</span>
                <span class="os-cat-count">${c.fileCount}件</span>
              </div>
              <div class="os-cat-files">${c.fileNames.map(f => esc(f)).join('、')}</div>
            </div>`).join('')}
        </div>
      </div>` : ''}
      <div class="mem-card">
        <h3>${osSummary.length > 0 ? '追加メモ' : '記憶している情報'}</h3>
        <form action="/chat/memory" method="post" class="mem-form">
          <label>会社名<input name="companyName" value="${esc(memory.companyName)}" placeholder="株式会社〇〇"/></label>
          <label>業種<input name="industry" value="${esc(memory.industry)}" placeholder="IT、飲食、建設 等"/></label>
          <label>従業員数<input name="employeeCount" value="${esc(memory.employeeCount)}" placeholder="10人"/></label>
          <label>決算期<input name="fiscalYearEnd" value="${esc(memory.fiscalYearEnd)}" placeholder="3月"/></label>
          <label>メモ<textarea name="notes" rows="3" placeholder="その他の情報を入力...">${esc(memory.notes.join('\n'))}</textarea></label>
          <button type="submit" class="btn-primary btn-sm" style="width:100%">保存</button>
        </form>
        ${memory.lastUpdated ? `<div class="mem-updated">最終更新: ${new Date(memory.lastUpdated).toLocaleString('ja-JP')}</div>` : ''}
      </div>
      <div class="mem-card">
        <h3>質問例</h3>
        <div class="suggestion-list">
          <button class="suggestion" onclick="askSuggestion(this.textContent)">うちの財務状態はどう？</button>
          <button class="suggestion" onclick="askSuggestion(this.textContent)">銀行融資を受けるには何を改善すべき？</button>
          <button class="suggestion" onclick="askSuggestion(this.textContent)">資金繰りで注意すべきことは？</button>
          <button class="suggestion" onclick="askSuggestion(this.textContent)">固定費を削減するにはどうすればいい？</button>
          <button class="suggestion" onclick="askSuggestion(this.textContent)">来期の事業計画で意識すべき数字は？</button>
        </div>
      </div>
    </aside>

    <!-- Chat Area -->
    <div class="chat-main">
      <div class="chat-messages" id="chatMessages">
${history.length === 0 ? `
        <div class="chat-welcome">
          <div class="chat-welcome-icon"></div>
          <h2>AI CFOへようこそ</h2>
          <p>財務・経営に関する質問にお答えします。<br>あなたの会社の情報を覚えているので、具体的なアドバイスが可能です。</p>
        </div>
` : history.map(m => m.role === 'user' ? `
        <div class="msg msg-user">
          <div class="msg-avatar"></div>
          <div class="msg-bubble msg-bubble-user">${escWithBreaks(m.content)}</div>
        </div>` : `
        <div class="msg msg-ai">
          <div class="msg-avatar"></div>
          <div class="msg-bubble msg-bubble-ai">
            ${formatAIMessage(m.content)}
            <div class="msg-actions">
              <button class="msg-action-btn" onclick="openTaskModal(this)" title="タスクに追加">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                タスク追加
              </button>
              <button class="msg-action-btn" onclick="openOSModal(this)" title="企業AI OSに保存">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                OS保存
              </button>
            </div>
          </div>
        </div>`).join('')}
      </div>

      <!-- Input -->
      <div class="chat-input-wrap">
        ${!aiAvailable ? '<div class="chat-warn">Vertex AI の認証が未設定のため利用できません</div>' : ''}
        <form id="chatForm" class="chat-input-form" onsubmit="sendChat(event)" onkeydown="if(event.key==='Enter'&&!event.shiftKey)event.preventDefault()">
          <textarea id="chatInput" class="chat-input" placeholder="経営に関する質問を入力..." rows="1" ${!aiAvailable ? 'disabled' : ''}></textarea>
          <button type="submit" class="chat-send" ${!aiAvailable ? 'disabled' : ''}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </form>
        <div class="chat-hint">Shift + Enter で送信</div>
      </div>
    </div>
  </div>
</div>

<!-- Task Modal -->
<div id="taskModal" class="task-modal" style="display:none">
  <div class="task-modal-overlay" onclick="closeTaskModal()"></div>
  <div class="task-modal-content">
    <h3>タスクに追加</h3>
    <form id="taskModalForm" onsubmit="submitTask(event)">
      <div id="taskItemsList" class="task-items-list" style="display:none"></div>
      <div id="taskManualInput" style="display:none">
        <label>タイトル<input id="taskTitle" name="title" placeholder="タスク名を入力"/></label>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <label style="flex:1">優先度
          <select id="taskPriority" name="priority"><option value="high">高</option><option value="medium" selected>中</option><option value="low">低</option></select>
        </label>
        <label style="flex:1">カテゴリ
          <select id="taskCategory" name="category"><option value="finance">財務</option><option value="accounting">会計</option><option value="cashflow">資金繰り</option><option value="plan">事業計画</option><option value="general" selected>一般</option></select>
        </label>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button type="submit" class="btn-primary btn-sm" style="flex:1">選択したタスクを追加</button>
        <button type="button" class="btn-secondary btn-sm" style="flex:1" onclick="closeTaskModal()">キャンセル</button>
      </div>
    </form>
  </div>
</div>

<!-- OS Save Modal -->
<div id="osModal" class="task-modal" style="display:none">
  <div class="task-modal-overlay" onclick="closeOSModal()"></div>
  <div class="task-modal-content">
    <h3>企業AI OSに保存</h3>
    <form id="osModalForm" onsubmit="submitOSSave(event)">
      <div id="osItemsList" class="task-items-list" style="display:none"></div>
      <div id="osManualInput">
        <label>カテゴリ
          <select id="osCategory" name="category">
            <option value="企業基盤">01 企業基盤</option>
            <option value="事業・サービス">02 事業・サービス</option>
            <option value="顧客情報">03 顧客情報</option>
            <option value="業務プロセス">04 業務プロセス</option>
            <option value="ナレッジ" selected>05 ナレッジ</option>
            <option value="マーケティング">06 マーケティング</option>
            <option value="営業">07 営業</option>
            <option value="バックオフィス">08 バックオフィス</option>
            <option value="成功事例">09 成功事例</option>
            <option value="AIエージェント">10 AIエージェント</option>
          </select>
        </label>
        <label>ファイル名<input id="osFileName" name="fileName" placeholder="例: 経営方針、顧客ターゲット"/></label>
        <label>保存内容<textarea id="osContent" name="content" rows="4" placeholder="保存する情報を入力..."></textarea></label>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button type="submit" class="btn-primary btn-sm" style="flex:1">保存する</button>
        <button type="button" class="btn-secondary btn-sm" style="flex:1" onclick="closeOSModal()">キャンセル</button>
      </div>
    </form>
  </div>
</div>

<script>
var messagesEl = document.getElementById('chatMessages');
var input = document.getElementById('chatInput');
var form = document.getElementById('chatForm');

// 自動スクロール
messagesEl.scrollTop = messagesEl.scrollHeight;

// テキストエリア自動リサイズ
input.addEventListener('input', function(){
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// Shift+Enterで送信、Enterは改行
input.addEventListener('keydown', function(e){
  if(e.key === 'Enter' && e.shiftKey){
    e.preventDefault();
    sendChat(e);
  } else if(e.key === 'Enter' && !e.shiftKey){
    // デフォルト動作（改行）を許可、ただしフォーム送信は防ぐ
    e.stopPropagation();
  }
});

function sendChat(e){
  e.preventDefault();
  var msg = input.value.trim();
  if(!msg) return;

  // ユーザーメッセージを即表示
  appendMessage('user', msg);
  input.value = '';
  input.style.height = 'auto';

  // ローディング表示
  var loadingId = 'loading-' + Date.now();
  messagesEl.insertAdjacentHTML('beforeend',
    '<div class="msg msg-ai" id="'+loadingId+'"><div class="msg-avatar"></div><div class="msg-bubble msg-bubble-ai"><div class="typing"><span></span><span></span><span></span></div></div></div>');
  messagesEl.scrollTop = messagesEl.scrollHeight;

  fetch('/chat/send', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message: msg})
  })
  .then(function(r){return r.json()})
  .then(function(data){
    var el = document.getElementById(loadingId);
    if(el) el.remove();
    if(data.error){
      appendMessage('ai', 'エラー: ' + data.error);
    } else {
      appendMessage('ai', data.reply);
      // 企業AI OSへの保存提案があれば確認UIを表示
      if(data.proposals && data.proposals.length > 0){
        showOSProposals(data.proposals);
      }
    }
    updateUsage();
  })
  .catch(function(err){
    var el = document.getElementById(loadingId);
    if(el) el.remove();
    appendMessage('ai', '通信エラーが発生しました');
  });
}

function appendMessage(role, content){
  var cls = role === 'user' ? 'msg-user' : 'msg-ai';
  var avatar = role === 'user' ? '' : '';
  var bubbleCls = role === 'user' ? 'msg-bubble-user' : 'msg-bubble-ai';
  var formatted = role === 'ai' ? formatContent(content) : escapeHtml(content).replace(/\\n/g, '<br>');
  var taskBtn = role === 'ai' ? '<div class="msg-actions"><button class="msg-action-btn" onclick="openTaskModal(this)" title="タスクに追加"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg> タスク追加</button><button class="msg-action-btn" onclick="openOSModal(this)" title="企業AI OSに保存"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> OS保存</button></div>' : '';
  messagesEl.insertAdjacentHTML('beforeend',
    '<div class="msg '+cls+'"><div class="msg-avatar">'+avatar+'</div><div class="msg-bubble '+bubbleCls+'">'+formatted+taskBtn+'</div></div>');
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function askSuggestion(text){
  input.value = text;
  form.dispatchEvent(new Event('submit'));
}

function escapeHtml(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

function formatContent(text){
  // 簡易Markdown変換
  return escapeHtml(text)
    .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="font-size:15px;margin:12px 0 6px">$1</h3>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\\n/g, '<br>');
}

function updateUsage(){
  fetch('/api/usage').then(function(r){return r.json()}).then(function(d){
    document.querySelectorAll('.usage-text-val').forEach(function(el){
      if(d.requestCount===0){el.textContent='API未使用'}
      else{el.textContent=d.totalTokens.toLocaleString('ja-JP')+' tok / $'+d.totalCost.toFixed(4)}
    });
  }).catch(function(){});
}
updateUsage();
setInterval(updateUsage,10000);

// タスク追加: AIメッセージからアクション項目を抽出
function extractActionItems(text){
  var lines = text.split('\\n').map(function(l){return l.trim()}).filter(function(l){return l.length > 0});
  var items = [];
  for(var i=0;i<lines.length;i++){
    var l = lines[i];
    // 番号付き・箇条書き・矢印の行を抽出
    if(/^[0-9０-９]+[\.．)）]/.test(l) || /^[-・•▶→]/.test(l) || /^[a-zA-Z][\.)]/.test(l)){
      var clean = l.replace(/^[0-9０-９\\.．)）・•▶→a-zA-Z\\s\\-]+/,'').trim();
      if(clean.length > 5 && clean.length < 200) items.push(clean);
    }
    // 「〜する」「〜を検討」「〜の確認」等のアクション語尾
    else if(l.length > 10 && l.length < 200 && /(?:する|検討|確認|実施|改善|強化|準備|見直し|策定|分析|把握|整備|構築|開始|設定|作成)/.test(l) && !/^【|^\||^#/.test(l)){
      items.push(l);
    }
  }
  // 重複除去
  return items.filter(function(v,i,a){return a.indexOf(v)===i}).slice(0,10);
}

function openTaskModal(btn){
  try {
    var bubble = btn.closest('.msg-bubble-ai') || btn.closest('.msg-bubble');
    var text = bubble ? bubble.innerText.replace(/\\+\\s*タスク追加/g,'').trim() : '';
    var items = extractActionItems(text);

    var listEl = document.getElementById('taskItemsList');
    var manualEl = document.getElementById('taskManualInput');

    if(items.length > 0){
      listEl.innerHTML = items.map(function(item,i){
        var safe = item.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        var display = item.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return '<label class="task-check-item"><input type="checkbox" name="task_'+i+'" value="'+safe+'" checked/><span>'+display+'</span></label>';
      }).join('');
      listEl.style.display = 'block';
      manualEl.style.display = 'none';
    } else {
      listEl.style.display = 'none';
      manualEl.style.display = 'block';
      document.getElementById('taskTitle').value = '';
    }
    document.getElementById('taskModal').style.display = 'flex';
  } catch(e) {
    console.error('タスクモーダルエラー:', e);
    document.getElementById('taskItemsList').style.display = 'none';
    document.getElementById('taskManualInput').style.display = 'block';
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskModal').style.display = 'flex';
  }
}

function closeTaskModal(){
  document.getElementById('taskModal').style.display = 'none';
}

function submitTask(e){
  e.preventDefault();
  var listEl = document.getElementById('taskItemsList');
  var priority = document.getElementById('taskPriority').value;
  var category = document.getElementById('taskCategory').value;
  var tasks = [];

  if(listEl.style.display !== 'none'){
    // チェックされた項目を一括追加
    var checks = listEl.querySelectorAll('input[type=checkbox]:checked');
    for(var i=0;i<checks.length;i++){
      tasks.push({ title: checks[i].value, description: '', priority: priority, category: category });
    }
  } else {
    var title = document.getElementById('taskTitle').value.trim();
    if(title) tasks.push({ title: title, description: '', priority: priority, category: category });
  }

  if(tasks.length === 0){ alert('タスクを選択してください'); return; }

  var done = 0;
  tasks.forEach(function(t){
    fetch('/api/tasks', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(t)
    }).then(function(){ done++; if(done===tasks.length) showNotice(tasks.length+'件のタスクを追加しました'); });
  });
  closeTaskModal();
}

// === 企業AI OS保存 ===
function openOSModal(btn){
  try {
    var bubble = btn.closest('.msg-bubble-ai') || btn.closest('.msg-bubble');
    var text = bubble ? bubble.innerText.replace(/[+＋]\\s*(?:タスク追加|OS保存)/g,'').trim() : '';
    var items = extractActionItems(text);

    var listEl = document.getElementById('osItemsList');
    var manualEl = document.getElementById('osManualInput');

    if(items.length > 0){
      listEl.innerHTML = items.map(function(item,i){
        var safe = item.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        var display = item.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return '<label class="task-check-item"><input type="checkbox" name="os_'+i+'" value="'+safe+'" checked/><span>'+display+'</span></label>';
      }).join('');
      listEl.style.display = 'block';
      manualEl.querySelector('#osContent').value = '';
      manualEl.querySelector('#osFileName').value = '';
    } else {
      listEl.style.display = 'none';
      // メッセージ全文をデフォルトで入れる
      var summary = text.substring(0, 500);
      document.getElementById('osContent').value = summary;
      document.getElementById('osFileName').value = '';
    }
    document.getElementById('osModal').style.display = 'flex';
  } catch(e) {
    console.error('OSモーダルエラー:', e);
    document.getElementById('osItemsList').style.display = 'none';
    document.getElementById('osContent').value = '';
    document.getElementById('osFileName').value = '';
    document.getElementById('osModal').style.display = 'flex';
  }
}

function closeOSModal(){
  document.getElementById('osModal').style.display = 'none';
}

function submitOSSave(e){
  e.preventDefault();
  var category = document.getElementById('osCategory').value;
  var listEl = document.getElementById('osItemsList');
  var items = [];

  if(listEl.style.display !== 'none'){
    // チェックされた項目を結合して保存
    var checks = listEl.querySelectorAll('input[type=checkbox]:checked');
    var contents = [];
    for(var i=0;i<checks.length;i++) contents.push(checks[i].value);
    if(contents.length === 0){ alert('保存する項目を選択してください'); return; }
    var fileName = document.getElementById('osFileName').value.trim();
    if(!fileName) fileName = contents[0].substring(0, 20);
    items.push({category: category, fileName: fileName, content: contents.join('\\n')});
  } else {
    var fileName2 = document.getElementById('osFileName').value.trim();
    var content = document.getElementById('osContent').value.trim();
    if(!fileName2 || !content){ alert('ファイル名と保存内容を入力してください'); return; }
    items.push({category: category, fileName: fileName2, content: content});
  }

  fetch('/chat/save-to-os', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({items: items})
  }).then(function(r){return r.json()}).then(function(data){
    closeOSModal();
    showNotice('企業AI OSに保存しました');
  }).catch(function(){
    closeOSModal();
    showNotice('保存に失敗しました');
  });
}

function showNotice(msg){
  var n = document.createElement('div');
  n.className = 'task-notice';
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(function(){ n.remove() }, 2500);
}

// 企業AI OS保存提案の確認UI
function showOSProposals(proposals){
  var html = '<div class="os-proposal-banner">';
  html += '<div class="os-proposal-header">企業AI OSに保存しますか？</div>';
  html += '<div class="os-proposal-list">';
  for(var i=0;i<proposals.length;i++){
    var p = proposals[i];
    var safe = function(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')};
    html += '<label class="os-proposal-item">';
    html += '<input type="checkbox" checked data-idx="'+i+'" />';
    html += '<div><strong>'+safe(p.category)+' / '+safe(p.fileName)+'</strong>';
    html += '<div class="os-proposal-content">'+safe(p.content)+'</div></div>';
    html += '</label>';
  }
  html += '</div>';
  html += '<div class="os-proposal-actions">';
  html += '<button class="btn-primary btn-sm" onclick="confirmOSProposals(this)">保存する</button>';
  html += '<button class="btn-secondary btn-sm" onclick="dismissOSProposals(this)">保存しない</button>';
  html += '</div></div>';

  // チャットメッセージの末尾に挿入
  messagesEl.insertAdjacentHTML('beforeend', html);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // proposals をグローバルに一時保持
  window._pendingProposals = proposals;
}

function confirmOSProposals(btn){
  var banner = btn.closest('.os-proposal-banner');
  var checks = banner.querySelectorAll('input[type=checkbox]:checked');
  var items = [];
  for(var i=0;i<checks.length;i++){
    var idx = parseInt(checks[i].dataset.idx);
    var p = window._pendingProposals[idx];
    items.push({category: p.category, fileName: p.fileName, content: p.content});
  }
  if(items.length === 0){ banner.remove(); return; }

  fetch('/chat/save-to-os', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({items: items})
  }).then(function(r){return r.json()}).then(function(data){
    banner.remove();
    showNotice(items.length + '件を企業AI OSに保存しました');
    window._pendingProposals = null;
  }).catch(function(){
    banner.remove();
    showNotice('保存に失敗しました');
  });
}

function dismissOSProposals(btn){
  var banner = btn.closest('.os-proposal-banner');
  banner.remove();
  window._pendingProposals = null;
}
</script>
</body>
</html>`;
}

function escWithBreaks(s: string): string {
  return esc(s).replace(/\n/g, '<br>');
}

function formatAIMessage(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="font-size:15px;margin:12px 0 6px">$1</h3>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br>');
}

const CHAT_CSS = `
.chat-layout{display:flex;height:calc(100vh - var(--header-h));overflow:hidden}
.chat-sidebar{width:300px;border-right:1px solid var(--border);overflow-y:auto;padding:16px;flex-shrink:0;background:var(--bg)}
.os-categories{display:flex;flex-direction:column;gap:6px}
.os-cat{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:8px 10px}
.os-cat-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:3px}
.os-cat-name{font-size:12px;font-weight:700;color:var(--text)}
.os-cat-count{font-size:11px;color:var(--primary);font-weight:600;background:var(--primary-light);padding:1px 6px;border-radius:4px}
.os-cat-files{font-size:11px;color:var(--text2);line-height:1.4}
.msg-actions{display:flex;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)}
.msg-action-btn{display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text2);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s}
.msg-action-btn:hover{border-color:var(--primary);color:var(--primary);background:var(--primary-light)}
.task-modal{position:fixed;top:0;left:0;right:0;bottom:0;z-index:200;display:flex;align-items:center;justify-content:center}
.task-modal-overlay{position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4)}
.task-modal-content{position:relative;background:var(--card);border-radius:14px;padding:24px;width:400px;max-width:90vw;box-shadow:0 16px 48px rgba(0,0,0,0.2)}
.task-modal-content h3{font-size:16px;font-weight:700;margin-bottom:16px}
.task-modal-content label{display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:10px}
.task-modal-content input,.task-modal-content textarea,.task-modal-content select{display:block;width:100%;margin-top:4px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;background:var(--bg)}
.task-modal-content input:focus,.task-modal-content textarea:focus,.task-modal-content select:focus{outline:none;border-color:var(--primary)}
.task-items-list{max-height:300px;overflow-y:auto;margin-bottom:8px}
.task-check-item{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;transition:all .15s;font-size:13px;line-height:1.5}
.task-check-item:hover{border-color:var(--primary);background:var(--primary-light)}
.task-check-item input{margin-top:3px;flex-shrink:0;accent-color:var(--primary)}
.task-check-item span{flex:1}
.task-notice{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#2298ae;color:#fff;padding:10px 24px;border-radius:10px;font-size:14px;font-weight:600;z-index:300;animation:fadeInUp .3s ease}
@keyframes fadeInUp{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.chat-hint{text-align:center;font-size:11px;color:var(--text2);padding:4px 0 2px;opacity:0.6}
.os-proposal-banner{background:var(--card);border:1px solid #2298ae;border-radius:12px;padding:16px;margin:8px 0;animation:fadeInUp .3s ease}
.os-proposal-header{font-size:14px;font-weight:700;color:#2298ae;margin-bottom:10px}
.os-proposal-list{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
.os-proposal-item{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;line-height:1.5;transition:all .15s}
.os-proposal-item:hover{border-color:#2298ae;background:rgba(99,102,241,0.05)}
.os-proposal-item input{margin-top:3px;flex-shrink:0}
.os-proposal-item strong{font-size:12px;color:#2298ae}
.os-proposal-content{font-size:12px;color:var(--text2);margin-top:2px;max-height:60px;overflow:hidden;text-overflow:ellipsis}
.os-proposal-actions{display:flex;gap:8px}
.chat-main{flex:1;display:flex;flex-direction:column;min-width:0}

.header-company{font-size:12px;color:var(--text2);background:var(--bg);padding:3px 10px;border-radius:6px}

/* Memory */
.mem-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:12px}
.mem-card h3{font-size:14px;font-weight:700;margin-bottom:12px}
.mem-form label{display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:8px}
.mem-form input,.mem-form textarea{width:100%;border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:13px;font-family:inherit;margin-top:2px;margin-bottom:4px}
.mem-form input:focus,.mem-form textarea:focus{outline:none;border-color:var(--primary)}
.mem-updated{font-size:11px;color:var(--text2);margin-top:8px}

/* Suggestions */
.suggestion-list{display:flex;flex-direction:column;gap:6px}
.suggestion{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--text);text-align:left;cursor:pointer;font-family:inherit;transition:all .15s;line-height:1.4}
.suggestion:hover{border-color:var(--primary);color:var(--primary);background:var(--primary-light)}

/* Messages */
.chat-messages{flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:16px}
.chat-welcome{text-align:center;padding:60px 20px;color:var(--text2)}
.chat-welcome-icon{font-size:48px;margin-bottom:12px}
.chat-welcome h2{font-size:20px;font-weight:700;color:var(--text);margin-bottom:8px}
.chat-welcome p{font-size:14px;line-height:1.65}

.msg{display:flex;gap:10px;max-width:800px}
.msg-user{align-self:flex-end;flex-direction:row-reverse}
.msg-ai{align-self:flex-start}
.msg-avatar{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;background:var(--bg)}
.msg-bubble{padding:12px 16px;border-radius:16px;font-size:14px;line-height:1.7;max-width:600px;word-wrap:break-word}
.msg-bubble h3,.msg-bubble h4{font-size:14px;font-weight:700;margin:8px 0 4px}
.msg-bubble li{margin-left:16px;margin-bottom:2px}
.msg-bubble-user{background:var(--primary);color:#fff;border-bottom-right-radius:4px}
.msg-bubble-ai{background:var(--bg);color:var(--text);border:1px solid var(--border);border-bottom-left-radius:4px}

/* Typing indicator */
.typing{display:flex;gap:4px;padding:4px 0}
.typing span{width:6px;height:6px;border-radius:50%;background:var(--text2);animation:typing 1.4s infinite}
.typing span:nth-child(2){animation-delay:0.2s}
.typing span:nth-child(3){animation-delay:0.4s}
@keyframes typing{0%,60%,100%{opacity:0.3;transform:scale(1)}30%{opacity:1;transform:scale(1.2)}}

/* Input */
.chat-input-wrap{padding:16px 24px;border-top:1px solid var(--border);background:var(--card)}
.chat-warn{font-size:12px;color:var(--red);margin-bottom:8px}
.chat-input-form{display:flex;gap:8px;align-items:flex-end}
.chat-input{flex:1;border:1px solid var(--border);border-radius:12px;padding:10px 16px;font-size:14px;font-family:inherit;resize:none;line-height:1.5;max-height:120px}
.chat-input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 2px var(--primary-light)}
.chat-send{width:40px;height:40px;border-radius:50%;background:var(--primary);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:opacity .15s;flex-shrink:0}
.chat-send:hover{opacity:0.85}
.chat-send:disabled{opacity:0.4;cursor:not-allowed}

@media(max-width:768px){
  .chat-sidebar{display:none}
  .chat-messages{padding:16px}
  .msg-bubble{max-width:85vw}
}
`;
