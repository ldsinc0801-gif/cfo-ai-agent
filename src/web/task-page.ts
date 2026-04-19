import type { Task, TaskSummary } from '../services/task-service.js';
import { googleTasksClient } from '../clients/google-tasks.js';
import { agentPageShell, esc } from './shared.js';

export interface TaskPageOptions {
  googleConnected?: string | null;  // 'connected' | 'synced' | null
  googleSyncCount?: number;
}

export function renderTaskPageHTML(tasks: Task[], summary: TaskSummary, options?: TaskPageOptions): string {
  const todoTasks = tasks.filter(t => t.status === 'todo');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const doneTasks = tasks.filter(t => t.status === 'done');

  const googleConfigured = googleTasksClient.isConfigured();
  const googleAuthed = googleTasksClient.isAuthenticated();
  const flashMsg = options?.googleConnected === 'connected'
    ? '<div class="flash flash--success">Google Tasksと連携しました。「Google ToDoに同期」ボタンでタスクを同期できます。</div>'
    : options?.googleConnected === 'synced'
    ? `<div class="flash flash--success">Google Tasksに${options?.googleSyncCount ?? 0}件のタスクを同期しました。</div>`
    : '';

  const bodyHTML = `
<style>${TASK_CSS}</style>
${flashMsg}

<!-- Summary Cards -->
<div class="task-summary">
  <div class="ts-card ts-total">
    <div class="ts-num">${summary.total}</div>
    <div class="ts-label">全タスク</div>
  </div>
  <div class="ts-card ts-todo">
    <div class="ts-num">${summary.todo}</div>
    <div class="ts-label">未着手</div>
  </div>
  <div class="ts-card ts-prog">
    <div class="ts-num">${summary.inProgress}</div>
    <div class="ts-label">進行中</div>
  </div>
  <div class="ts-card ts-done">
    <div class="ts-num">${summary.done}</div>
    <div class="ts-label">完了</div>
  </div>
  <div class="ts-card ts-high">
    <div class="ts-num">${summary.highPriority}</div>
    <div class="ts-label">要対応</div>
  </div>
</div>

<!-- Add Task & Generate Monthly -->
<div class="task-toolbar">
  <div class="card toolbar-card">
    <form action="/tasks/add" method="post" class="add-task-form">
      <input name="title" placeholder="新しいタスクを追加..." class="add-task-input" required/>
      <select name="priority" class="add-task-select">
        <option value="high">高</option>
        <option value="medium" selected>中</option>
        <option value="low">低</option>
      </select>
      <select name="category" class="add-task-select">
        <option value="general">一般</option>
        <option value="finance">財務</option>
        <option value="accounting">会計</option>
        <option value="cashflow">資金繰り</option>
        <option value="plan">事業計画</option>
      </select>
      <button type="submit" class="btn-primary">追加</button>
    </form>
  </div>
  <div class="card toolbar-card">
    <form action="/tasks/generate-monthly" method="post" class="gen-form">
      <div class="gen-info">
        <span class="gen-icon"></span>
        <div>
          <div class="gen-title">月次タスク一括生成</div>
          <div class="gen-desc">経理・財務の定型業務タスクを時系列で自動生成</div>
        </div>
      </div>
      <div class="gen-actions">
        <input type="month" name="month" class="add-task-select" required value="${new Date().toISOString().slice(0, 7)}" style="padding:6px 10px"/>
        <button type="submit" class="btn-primary" onclick="return confirm('選択した月の定型タスク（24件）を生成しますか？')">生成</button>
      </div>
    </form>
  </div>
</div>

<!-- External Sync -->
<div class="card sync-toolbar">
  <div class="sync-row">
    <div class="sync-item">
      <div class="sync-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
      </div>
      <div class="sync-info">
        <div class="sync-name">秘書AI連携</div>
        <div class="sync-desc">API: <code>/api/tasks</code> から取得可能</div>
      </div>
      <span class="sync-status sync-status--ok">API実装済み</span>
    </div>
    <div class="sync-item">
      <div class="sync-icon sync-icon--google">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>
      </div>
      <div class="sync-info">
        <div class="sync-name">Google ToDo</div>
        <div class="sync-desc">${googleAuthed ? 'チェックしたタスクを「AI CFO」リストに同期' : googleConfigured ? 'OAuth認証が必要' : '.envにGOOGLE_CLIENT_ID/SECRETを設定'}</div>
      </div>
${googleAuthed ? `
      <button type="button" class="btn-primary btn-sm" id="syncGoogleBtn" onclick="syncSelectedToGoogle()" disabled>
        <span id="syncBtnText">選択してください</span>
      </button>
      <button type="button" class="task-btn btn-sm" style="margin-left:4px" onclick="toggleAllSync()" title="全選択/全解除">全選択</button>
      <form action="/settings/google/disconnect" method="post" style="display:inline;margin-left:6px">
        <button type="submit" class="task-btn task-btn--del" title="連携解除" onclick="return confirm('Google連携を解除しますか？')">切断</button>
      </form>
` : googleConfigured ? `
      <a href="/settings/google/auth" class="btn-primary btn-sm">Google認証</a>
` : `
      <span class="sync-status sync-status--off">未設定</span>
`}
    </div>
  </div>
</div>

<!-- Kanban Board -->
<form id="syncForm" action="/tasks/sync-google" method="post">
<input type="hidden" name="taskIds" id="syncTaskIds" value=""/>
</form>
<div class="kanban">
  <!-- Todo -->
  <div class="kanban-col" data-status="todo" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event)">
    <div class="kanban-header kanban-header--todo">
      <span class="kanban-dot" style="background:#2298ae"></span>
      未着手 <span class="kanban-count">${todoTasks.length}</span>
    </div>
    <div class="kanban-list">
${todoTasks.length === 0 ? '<div class="kanban-empty">タスクなし</div>' :
  todoTasks.map(t => taskCard(t, googleAuthed)).join('')}
    </div>
  </div>

  <!-- In Progress -->
  <div class="kanban-col" data-status="in_progress" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event)">
    <div class="kanban-header kanban-header--prog">
      <span class="kanban-dot" style="background:#5ab4c4"></span>
      進行中 <span class="kanban-count">${inProgressTasks.length}</span>
    </div>
    <div class="kanban-list">
${inProgressTasks.length === 0 ? '<div class="kanban-empty">タスクなし</div>' :
  inProgressTasks.map(t => taskCard(t, googleAuthed)).join('')}
    </div>
  </div>

  <!-- Done -->
  <div class="kanban-col" data-status="done" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event)">
    <div class="kanban-header kanban-header--done">
      <span class="kanban-dot" style="background:#2298ae"></span>
      完了 <span class="kanban-count">${doneTasks.length}</span>
    </div>
    <div class="kanban-list">
${doneTasks.length === 0 ? '<div class="kanban-empty">タスクなし</div>' :
  doneTasks.map(t => taskCard(t, googleAuthed)).join('')}
    </div>
  </div>
</div>

<!-- Edit Modal -->
<div class="modal-overlay" id="editModal" onclick="if(event.target===this)closeEditModal()">
  <div class="modal-card">
    <div class="modal-header">
      <h3>タスク編集</h3>
      <button type="button" class="task-btn task-btn--del" onclick="closeEditModal()" style="font-size:18px">✕</button>
    </div>
    <form id="editForm" method="post">
      <div class="modal-body">
        <div class="edit-field">
          <label class="edit-label">タイトル</label>
          <input name="title" id="editTitle" class="edit-input" required/>
        </div>
        <div class="edit-field">
          <label class="edit-label">説明</label>
          <textarea name="description" id="editDescription" class="edit-textarea" rows="4"></textarea>
        </div>
        <div class="edit-row">
          <div class="edit-field">
            <label class="edit-label">優先度</label>
            <select name="priority" id="editPriority" class="edit-select">
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>
          <div class="edit-field">
            <label class="edit-label">カテゴリ</label>
            <select name="category" id="editCategory" class="edit-select">
              <option value="general">一般</option>
              <option value="finance">財務</option>
              <option value="accounting">会計</option>
              <option value="cashflow">資金繰り</option>
              <option value="plan">事業計画</option>
            </select>
          </div>
          <div class="edit-field">
            <label class="edit-label">期日</label>
            <input type="date" name="dueDate" id="editDueDate" class="edit-select" style="padding:7px 10px"/>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" onclick="closeEditModal()">キャンセル</button>
        <button type="submit" class="btn-primary">保存</button>
      </div>
    </form>
  </div>
</div>

${SYNC_AND_DND_SCRIPT}
`;

  return agentPageShell({ active: 'tasks', title: 'タスクボード', bodyHTML });
}

function taskCard(t: Task, googleAuthed: boolean): string {
  const prColor = t.priority === 'high' ? '#ef4444' : t.priority === 'medium' ? '#5ab4c4' : '#2298ae';
  const prLabel = t.priority === 'high' ? '高' : t.priority === 'medium' ? '中' : '低';
  const catLabel = ({ finance: '財務', accounting: '会計', cashflow: '資金繰り', plan: '事業計画', general: '一般' })[t.category] || t.category;
  const srcIcon = t.source === 'ai_analysis' ? '' : t.source === 'chat' ? '' : '';
  const date = t.dueDate
    ? new Date(t.dueDate).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) + ' 期日'
    : new Date(t.createdAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });

  // 次のステータス
  const nextStatus = t.status === 'todo' ? 'in_progress' : t.status === 'in_progress' ? 'done' : '';
  const nextLabel = t.status === 'todo' ? '着手' : t.status === 'in_progress' ? '完了' : '';
  const prevStatus = t.status === 'in_progress' ? 'todo' : t.status === 'done' ? 'in_progress' : '';
  const prevLabel = t.status === 'in_progress' ? '戻す' : t.status === 'done' ? '再開' : '';

  const showCheckbox = googleAuthed && t.status !== 'done';

  return `
      <div class="task-card" draggable="true" data-task-id="${t.id}" data-title="${esc(t.title)}" data-description="${esc(t.description)}" data-priority="${t.priority}" data-category="${t.category}" data-due-date="${t.dueDate || ''}" ondragstart="onDragStart(event)" ondragend="onDragEnd(event)">
        <div class="task-top">
${showCheckbox ? `<label class="sync-check" title="Google ToDoに同期"><input type="checkbox" class="sync-checkbox" value="${t.id}" onchange="updateSyncBtn()"/></label>` : ''}
          <span class="task-priority" style="background:${prColor}20;color:${prColor}">${prLabel}</span>
          <span class="task-cat">${catLabel}</span>
          <span class="task-src">${srcIcon}</span>
        </div>
        <div class="task-title">${esc(t.title)}</div>
${t.description ? `<div class="task-desc">${esc(t.description).replace(/\n/g, '<br>')}</div>` : ''}
        <div class="task-bottom">
          <span class="task-date">${date}</span>
          <div class="task-actions">
${prevStatus ? `<form action="/tasks/${t.id}/status" method="post" style="display:inline"><input type="hidden" name="status" value="${prevStatus}"/><button class="task-btn">${prevLabel}</button></form>` : ''}
${nextStatus ? `<form action="/tasks/${t.id}/status" method="post" style="display:inline"><input type="hidden" name="status" value="${nextStatus}"/><button class="task-btn task-btn--primary">${nextLabel}</button></form>` : ''}
            <button type="button" class="task-btn" onclick="openEditModal(this.closest('.task-card'))">編集</button>
            <form action="/tasks/${t.id}/delete" method="post" style="display:inline" onsubmit="return confirm('削除しますか？')"><button class="task-btn task-btn--del">✕</button></form>
          </div>
        </div>
      </div>`;
}

const TASK_CSS = `
.task-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px}
.ts-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;text-align:center}
.ts-num{font-size:28px;font-weight:800;letter-spacing:-0.02em}
.ts-label{font-size:12px;color:var(--text2);font-weight:600;margin-top:2px}
.ts-todo .ts-num{color:#2298ae}
.ts-prog .ts-num{color:#5ab4c4}
.ts-done .ts-num{color:#2298ae}
.ts-high .ts-num{color:#ef4444}

.task-toolbar{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
.toolbar-card{margin-bottom:0}
.gen-form{padding:12px 16px}
.gen-info{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.gen-icon{font-size:24px}
.gen-title{font-size:14px;font-weight:700}
.gen-desc{font-size:12px;color:var(--text2)}
.gen-actions{display:flex;gap:8px;align-items:center}
.add-task-form{display:flex;gap:8px;padding:12px 16px;align-items:center}
.add-task-input{flex:1;border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:14px;font-family:inherit}
.add-task-input:focus{outline:none;border-color:var(--primary)}
.add-task-select{border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit;background:var(--card);cursor:pointer}

.kanban{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;min-height:400px}
.kanban-col{background:var(--bg);border-radius:var(--radius);padding:12px;min-height:300px}
.kanban-header{font-size:14px;font-weight:700;padding:8px 12px;border-radius:8px;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.kanban-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.kanban-count{font-size:12px;font-weight:600;color:var(--text2);margin-left:auto}
.kanban-header--todo{background:#eef2ff;color:#4338ca}
.kanban-header--prog{background:#ecf6f8;color:#1b7f8e}
.kanban-header--done{background:#ecf6f8;color:#1b7f8e}
.kanban-list{display:flex;flex-direction:column;gap:8px}
.kanban-empty{text-align:center;padding:20px;font-size:13px;color:var(--text2)}

.task-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px;transition:box-shadow .15s}
.task-card:hover{box-shadow:0 2px 8px rgba(0,0,0,0.06)}
.task-top{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.task-priority{font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px}
.task-cat{font-size:11px;color:var(--text2);background:var(--bg);padding:2px 6px;border-radius:4px}
.task-src{font-size:12px;margin-left:auto}
.task-title{font-size:14px;font-weight:600;line-height:1.45;margin-bottom:4px}
.task-desc{font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:8px}
.task-bottom{display:flex;align-items:center;justify-content:space-between}
.task-date{font-size:11px;color:var(--text2)}
.task-actions{display:flex;gap:4px}
.task-btn{border:1px solid var(--border);background:var(--card);border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;color:var(--text2);transition:all .15s}
.task-btn:hover{border-color:var(--primary);color:var(--primary)}
.task-btn--primary{background:var(--primary);color:#fff;border-color:var(--primary)}
.task-btn--primary:hover{opacity:0.85}
.task-btn--del{color:var(--text2);border-color:transparent;background:none;font-size:12px}
.task-btn--del:hover{color:var(--red)}

.sync-check{display:flex;align-items:center;cursor:pointer}
.sync-checkbox{width:16px;height:16px;accent-color:var(--primary);cursor:pointer}

.task-card[draggable="true"]{cursor:grab}
.task-card[draggable="true"]:active{cursor:grabbing}
.task-card.dragging{opacity:0.4;transform:rotate(2deg)}
.kanban-col.drag-over .kanban-list{background:var(--primary-light);border-radius:8px;min-height:100px;transition:background .15s}

.modal-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:200;align-items:center;justify-content:center}
.modal-overlay.open{display:flex}
.modal-card{background:var(--card);border-radius:var(--radius);width:520px;max-width:90vw;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.15)}
.modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)}
.modal-header h3{font-size:16px;font-weight:700}
.modal-body{padding:20px}
.modal-footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--border)}
.edit-field{margin-bottom:14px}
.edit-label{display:block;font-size:12px;font-weight:700;color:var(--text2);margin-bottom:4px}
.edit-input{width:100%;border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:14px;font-family:inherit}
.edit-input:focus,.edit-textarea:focus,.edit-select:focus{outline:none;border-color:var(--primary)}
.edit-textarea{width:100%;border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:13px;font-family:inherit;resize:vertical}
.edit-select{border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit;background:var(--card);cursor:pointer;width:100%}
.edit-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}

.flash{padding:12px 16px;border-radius:8px;font-size:13px;font-weight:600;margin-bottom:16px}
.flash--success{background:#ecf6f8;border:1px solid #a8d8e0;color:#1b7f8e}

.sync-toolbar{margin-bottom:20px}
.sync-row{display:flex;gap:0;padding:0}
.sync-item{flex:1;display:flex;align-items:center;gap:12px;padding:14px 20px;border-right:1px solid var(--border)}
.sync-item:last-child{border-right:none}
.sync-icon{width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--primary-light);color:var(--primary);border-radius:8px;flex-shrink:0}
.sync-icon--google{background:#e8f5e9;color:#34a853}
.sync-name{font-size:14px;font-weight:700}
.sync-desc{font-size:12px;color:var(--text2);margin-top:2px}
.sync-desc code{background:var(--bg);padding:1px 6px;border-radius:4px;font-size:11px}
.sync-info{flex:1}
.sync-status{font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;white-space:nowrap}
.sync-status--ok{background:#ecf6f8;color:#1b7f8e}
.sync-status--off{background:#f3f4f6;color:#6b7280}

@media(max-width:768px){
  .task-summary{grid-template-columns:repeat(3,1fr)}
  .task-toolbar{grid-template-columns:1fr}
  .kanban{grid-template-columns:1fr}
  .add-task-form{flex-wrap:wrap}
  .sync-row{flex-direction:column}
  .sync-item{border-right:none;border-bottom:1px solid var(--border)}
  .sync-item:last-child{border-bottom:none}
}
`;

const SYNC_AND_DND_SCRIPT = `
<script>
// === Google Sync: checkbox selection ===
function updateSyncBtn() {
  var btn = document.getElementById('syncGoogleBtn');
  var txt = document.getElementById('syncBtnText');
  if (!btn || !txt) return;
  var checked = document.querySelectorAll('.sync-checkbox:checked');
  if (checked.length > 0) {
    btn.disabled = false;
    txt.textContent = checked.length + '件をGoogle ToDoに同期';
  } else {
    btn.disabled = true;
    txt.textContent = '選択してください';
  }
}

function toggleAllSync() {
  var boxes = document.querySelectorAll('.sync-checkbox');
  var allChecked = Array.from(boxes).every(function(b) { return b.checked; });
  boxes.forEach(function(b) { b.checked = !allChecked; });
  updateSyncBtn();
}

function syncSelectedToGoogle() {
  var checked = document.querySelectorAll('.sync-checkbox:checked');
  var ids = Array.from(checked).map(function(c) { return c.value; });
  if (ids.length === 0) return;
  document.getElementById('syncTaskIds').value = ids.join(',');
  var btn = document.getElementById('syncGoogleBtn');
  if (btn) { btn.disabled = true; document.getElementById('syncBtnText').textContent = '同期中...'; }
  document.getElementById('syncForm').submit();
}

// === Edit Modal ===
function openEditModal(card) {
  var id = card.dataset.taskId;
  var modal = document.getElementById('editModal');
  document.getElementById('editForm').action = '/tasks/' + id + '/edit';
  document.getElementById('editTitle').value = card.dataset.title;
  document.getElementById('editDescription').value = card.dataset.description;
  document.getElementById('editPriority').value = card.dataset.priority;
  document.getElementById('editCategory').value = card.dataset.category;
  document.getElementById('editDueDate').value = card.dataset.dueDate || '';
  modal.classList.add('open');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('open');
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeEditModal();
});

// === Drag and Drop ===
var dragTaskId = null;

function onDragStart(e) {
  dragTaskId = e.currentTarget.dataset.taskId;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragTaskId);
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.kanban-col').forEach(function(col) {
    col.classList.remove('drag-over');
  });
  dragTaskId = null;
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  var col = e.currentTarget;
  col.classList.add('drag-over');
}

function onDragLeave(e) {
  // Only remove if actually leaving the column
  var col = e.currentTarget;
  var rect = col.getBoundingClientRect();
  var x = e.clientX, y = e.clientY;
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    col.classList.remove('drag-over');
  }
}

function onDrop(e) {
  e.preventDefault();
  var col = e.currentTarget;
  col.classList.remove('drag-over');
  var taskId = e.dataTransfer.getData('text/plain');
  var newStatus = col.dataset.status;
  if (!taskId || !newStatus) return;

  // Send status update via form post
  var form = document.createElement('form');
  form.method = 'POST';
  form.action = '/tasks/' + taskId + '/status';
  var input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'status';
  input.value = newStatus;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}
</script>
`;
