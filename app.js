/* ============================================================
   MyTodos — app.js  (PDF-on-disk, folder persistence, clear)
   ============================================================ */

// ── Data Store ──────────────────────────────────────────────
let tasks = [];
let docs  = [];
let currentPage    = 'dashboard';
let currentDocId   = null;
let editingTaskId  = null;
let folderHandle   = null; // File System Access API directory handle

const TASKS_CACHE = 'devdocs_tasks_cache';
const DOCS_CACHE  = 'devdocs_docs_cache';
const SIDECAR     = '.devdocs-data.json';

// ── jsPDF Helper ────────────────────────────────────────────
function getJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  return null;
}

// ── Disk I/O (File System Access API) ───────────────────────
async function writeToDisk(fileName, content) {
  if (!folderHandle) return;
  try {
    const fh = await folderHandle.getFileHandle(fileName, { create: true });
    const w  = await fh.createWritable();
    await w.write(content);
    await w.close();
  } catch (e) { console.error('writeToDisk', e); }
}

async function readFromDisk(fileName) {
  if (!folderHandle) return null;
  try {
    const fh   = await folderHandle.getFileHandle(fileName);
    const file = await fh.getFile();
    return await file.text();
  } catch { return null; }
}

// ── Persist helpers ─────────────────────────────────────────
function saveCache() {
  localStorage.setItem(TASKS_CACHE, JSON.stringify(tasks));
  localStorage.setItem(DOCS_CACHE,  JSON.stringify(docs));
}

async function saveSidecar() {
  const data = JSON.stringify({ tasks, docs }, null, 2);
  await writeToDisk(SIDECAR, data);
}

async function saveTasks() {
  saveCache();
  await saveSidecar();
}

async function saveDocs() {
  saveCache();
  await saveSidecar();
}

// ── Pick Folder ─────────────────────────────────────────────
async function pickFolder() {
  if (!window.showDirectoryPicker) {
    showToast('Your browser does not support the File System Access API', 'error');
    return;
  }
  try {
    folderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    updateStorageIndicator(true);
    showToast('Folder connected — data will persist across refreshes', 'success');

    // Try to load sidecar data from disk
    const raw = await readFromDisk(SIDECAR);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (data.tasks && data.tasks.length) tasks = data.tasks;
        if (data.docs  && data.docs.length)  docs  = data.docs;
        saveCache();
        refreshAll();
        showToast('Data loaded from folder', 'info');
      } catch (e) { console.warn('sidecar parse error', e); }
    } else {
      // No sidecar yet — save current state
      await saveSidecar();
    }
  } catch (e) {
    if (e.name !== 'AbortError') showToast('Failed to connect folder', 'error');
  }
}

// ── Storage Indicator ───────────────────────────────────────
function updateStorageIndicator(connected) {
  const el = document.getElementById('storageIndicator');
  if (!el) return;
  if (connected) {
    el.className = 'storage-indicator connected';
    el.title     = 'Connected to disk folder';
    el.innerHTML = '<i class="fas fa-plug-circle-check"></i> Connected';
  } else {
    el.className = 'storage-indicator disconnected';
    el.title     = 'Not connected to disk';
    el.innerHTML = '<i class="fas fa-plug-circle-xmark"></i> No folder';
  }
}

// ── PDF Generation (combined Tasks + Docs) ──────────────────
function generateCombinedPDF() {
  const JsPDF = getJsPDF();
  if (!JsPDF) { showToast('jsPDF library not loaded', 'error'); return null; }

  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15; // margin
  let y = M;

  function checkPage(need) {
    if (y + need > H - M) { doc.addPage(); y = M; }
  }

  // ─ Cover Page ─
  doc.setFillColor(226, 0, 116); // #e20074
  doc.rect(0, 0, W, H, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(36);
  doc.setFont('helvetica', 'bold');
  doc.text('DevDocs Report', W / 2, H / 2 - 20, { align: 'center' });
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('Tasks & Documentation', W / 2, H / 2 + 5, { align: 'center' });
  doc.setFontSize(11);
  doc.text('Generated: ' + new Date().toLocaleString(), W / 2, H / 2 + 20, { align: 'center' });
  doc.text('Tasks: ' + tasks.length + '  |  Documents: ' + docs.length, W / 2, H / 2 + 30, { align: 'center' });

  // ─ Tasks Section ─
  doc.addPage();
  y = M;
  doc.setTextColor(226, 0, 116);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Tasks', M, y);
  y += 12;
  doc.setDrawColor(226, 0, 116);
  doc.setLineWidth(0.5);
  doc.line(M, y, W - M, y);
  y += 8;

  if (tasks.length === 0) {
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'italic');
    doc.text('No tasks created yet.', M, y);
    y += 10;
  } else {
    tasks.forEach((t, idx) => {
      checkPage(50);
      // Task header bar
      doc.setFillColor(245, 245, 250);
      doc.roundedRect(M, y, W - 2 * M, 10, 2, 2, 'F');
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text((idx + 1) + '. ' + (t.title || 'Untitled'), M + 3, y + 7);

      // Status & priority badge
      const badge = (t.status || 'pending').toUpperCase() + '  |  ' + (t.priority || 'medium').toUpperCase();
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(badge, W - M - 3, y + 7, { align: 'right' });
      y += 14;

      // Description
      if (t.description) {
        checkPage(15);
        doc.setTextColor(60, 60, 60);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(t.description, W - 2 * M - 6);
        doc.text(lines, M + 3, y);
        y += lines.length * 5 + 4;
      }

      // Code
      if (t.code) {
        checkPage(20);
        doc.setFillColor(40, 44, 52);
        const codeLines = doc.splitTextToSize(t.code, W - 2 * M - 10);
        const codeH = codeLines.length * 4.5 + 8;
        checkPage(codeH);
        doc.roundedRect(M + 3, y, W - 2 * M - 6, codeH, 2, 2, 'F');
        doc.setTextColor(200, 200, 200);
        doc.setFont('courier', 'normal');
        doc.setFontSize(8);
        doc.text(codeLines, M + 6, y + 5);
        y += codeH + 4;
      }

      // Notes
      if (t.notes) {
        checkPage(15);
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        const nLines = doc.splitTextToSize('Notes: ' + t.notes, W - 2 * M - 6);
        doc.text(nLines, M + 3, y);
        y += nLines.length * 4.5 + 4;
      }

      // Date
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.setFont('helvetica', 'normal');
      doc.text('Created: ' + new Date(t.createdAt).toLocaleString(), M + 3, y);
      y += 10;
    });
  }

  // ─ Documentation Section ─
  doc.addPage();
  y = M;
  doc.setTextColor(226, 0, 116);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Documentation', M, y);
  y += 12;
  doc.setDrawColor(226, 0, 116);
  doc.setLineWidth(0.5);
  doc.line(M, y, W - M, y);
  y += 8;

  if (docs.length === 0) {
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'italic');
    doc.text('No documents created yet.', M, y);
    y += 10;
  } else {
    docs.forEach((d, idx) => {
      checkPage(40);
      // Doc header
      doc.setFillColor(245, 245, 250);
      doc.roundedRect(M, y, W - 2 * M, 10, 2, 2, 'F');
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text((idx + 1) + '. ' + (d.title || 'Untitled'), M + 3, y + 7);
      y += 14;

      // Content
      if (d.content) {
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const cLines = doc.splitTextToSize(d.content, W - 2 * M - 6);
        cLines.forEach(line => {
          checkPage(6);
          doc.text(line, M + 3, y);
          y += 5;
        });
        y += 4;
      }

      // Date
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text('Updated: ' + new Date(d.updatedAt).toLocaleString(), M + 3, y);
      y += 10;
    });
  }

  // ─ Footer on each page ─
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text('DevDocs Report — Page ' + (i - 1) + ' of ' + (totalPages - 1), W / 2, H - 8, { align: 'center' });
  }

  return doc;
}

// ── Save PDF to Folder (or download) ───────────────────────
async function savePDFToFolder() {
  const pdfDoc = generateCombinedPDF();
  if (!pdfDoc) return;

  const fileName = 'DevDocs_Report_' + new Date().toISOString().slice(0, 10) + '.pdf';

  if (folderHandle) {
    try {
      const blob = pdfDoc.output('blob');
      const fh = await folderHandle.getFileHandle(fileName, { create: true });
      const w  = await fh.createWritable();
      await w.write(blob);
      await w.close();
      showToast('PDF saved', 'success');
    } catch (e) {
      console.error('savePDFToFolder', e);
      showToast('Failed to save PDF to folder', 'error');
    }
  } else {
    // No folder connected — direct download
    pdfDoc.save(fileName);
    showToast('PDF downloaded (connect a folder for auto-save)', 'info');
  }
}

// ── Clear All Data ──────────────────────────────────────────
async function clearAllData() {
  if (!confirm('Are you sure you want to clear ALL tasks and documents? This cannot be undone.')) return;

  tasks = [];
  docs  = [];
  currentDocId  = null;
  editingTaskId = null;

  // Clear cache
  localStorage.removeItem(TASKS_CACHE);
  localStorage.removeItem(DOCS_CACHE);

  // Clear sidecar on disk
  if (folderHandle) {
    try {
      await writeToDisk(SIDECAR, JSON.stringify({ tasks: [], docs: [] }));
    } catch (e) { console.warn('clearSidecar', e); }
  }

  refreshAll();
  navigateTo('dashboard');
  showToast('All data cleared', 'success');
}

// ── Theme ───────────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('devdocs_theme', next);
  document.getElementById('themeToggle').innerHTML =
    next === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

function loadTheme() {
  const t = localStorage.getItem('devdocs_theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('themeToggle').innerHTML =
    t === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

// ── Sidebar ─────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}
document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

function toggleNavGroup(el) {
  const items = el.nextElementSibling;
  items.style.display = items.style.display === 'none' ? '' : 'none';
  el.querySelector('.chevron')?.classList.toggle('collapsed');
}

// ── Navigation ──────────────────────────────────────────────
function navigateTo(page, linkEl) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item a').forEach(a => a.classList.remove('active'));
  if (linkEl) {
    linkEl.classList.add('active');
  } else {
    const link = document.querySelector(`.nav-item a[data-page="${page}"]`);
    if (link) link.classList.add('active');
  }

  if (page === 'dashboard') updateDashboard();
  if (page === 'tasks')     renderTasks();
  if (page === 'docs')      renderDocs();
  closeSidebar();
}

// ── Toast ───────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const icons = { success: 'circle-check', error: 'circle-xmark', info: 'circle-info', warning: 'triangle-exclamation' };
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.innerHTML = `<i class="fas fa-${icons[type] || 'circle-info'}"></i><span>${msg}</span>`;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

// ── Dashboard ───────────────────────────────────────────────
function updateDashboard() {
  const total = tasks.length;
  const comp  = tasks.filter(t => t.status === 'completed').length;
  const prog  = tasks.filter(t => t.status === 'in-progress').length;
  const pend  = tasks.filter(t => t.status === 'pending').length;

  setText('statTotal', total);
  setText('statCompleted', comp);
  setText('statInProgress', prog);
  setText('statPending', pend);

  const pct = total ? Math.round(comp / total * 100) : 0;
  setText('completionPct', pct + '%');
  setText('completionLabel', total ? `${comp} of ${total} tasks completed` : 'No tasks yet');

  const circle = document.getElementById('progressCircle');
  if (circle) {
    const circ = 2 * Math.PI * 58;
    circle.style.strokeDashoffset = circ - (circ * pct / 100);
  }

  renderActivity();
}

function renderActivity() {
  const el = document.getElementById('activityList');
  if (!el) return;
  const recent = [...tasks].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).slice(0, 8);
  if (!recent.length) {
    el.innerHTML = '<li class="empty-state" style="padding:30px"><div class="empty-icon"><i class="fas fa-inbox"></i></div><p>No activity yet.</p></li>';
    return;
  }
  el.innerHTML = recent.map(t => {
    const icon = t.status === 'completed' ? 'circle-check' : t.status === 'in-progress' ? 'spinner' : 'clock';
    const color = t.status === 'completed' ? '#22c55e' : t.status === 'in-progress' ? '#f59e0b' : '#3b82f6';
    return `<li class="activity-item" onclick="viewTask('${t.id}')">
      <span class="activity-dot" style="background:${color}"></span>
      <div class="activity-text"><strong>${esc(t.title)}</strong><small>${timeAgo(t.updatedAt || t.createdAt)}</small></div>
      <i class="fas fa-${icon}" style="color:${color}"></i>
    </li>`;
  }).join('');
}

// ── Task CRUD ───────────────────────────────────────────────
function renderTasks() {
  const tbody = document.getElementById('taskTableBody');
  const empty = document.getElementById('taskEmptyState');
  if (!tbody) return;

  let list = getFilteredTasks();
  if (!list.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = list.map(t => {
    const sc = { pending: 'status-pending', 'in-progress': 'status-progress', completed: 'status-done' }[t.status] || '';
    const pc = { high: 'priority-high', medium: 'priority-med', low: 'priority-low' }[t.priority] || '';
    return `<tr>
      <td><a href="#" onclick="viewTask('${t.id}')" class="task-link">${esc(t.title)}</a></td>
      <td><span class="badge ${sc}">${t.status}</span></td>
      <td><span class="badge ${pc}">${t.priority}</span></td>
      <td>${new Date(t.createdAt).toLocaleDateString()}</td>
      <td>
        <button class="btn-icon" title="Edit"   onclick="editTask('${t.id}')"><i class="fas fa-pen"></i></button>
        <button class="btn-icon" title="Delete" onclick="deleteTask('${t.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function getFilteredTasks() {
  let list = [...tasks];
  const fs = document.getElementById('filterStatus')?.value;
  const fp = document.getElementById('filterPriority')?.value;
  if (fs && fs !== 'all') list = list.filter(t => t.status === fs);
  if (fp && fp !== 'all') list = list.filter(t => t.priority === fp);
  return list;
}

function applyFilters() { renderTasks(); }

function openTaskModal(id) {
  editingTaskId = id || null;
  document.getElementById('taskEditId').value     = '';
  document.getElementById('taskTitle').value       = '';
  document.getElementById('taskStatus').value      = 'pending';
  document.getElementById('taskPriority').value    = 'medium';
  document.getElementById('taskDescription').value = '';
  document.getElementById('taskCode').value        = '';
  document.getElementById('taskNotes').value       = '';
  document.getElementById('taskScreenshots').value = '';
  document.getElementById('taskModalTitle').textContent = 'New Task';

  if (id) {
    const t = tasks.find(x => x.id === id);
    if (t) {
      document.getElementById('taskEditId').value     = t.id;
      document.getElementById('taskTitle').value       = t.title || '';
      document.getElementById('taskStatus').value      = t.status || 'pending';
      document.getElementById('taskPriority').value    = t.priority || 'medium';
      document.getElementById('taskDescription').value = t.description || '';
      document.getElementById('taskCode').value        = t.code || '';
      document.getElementById('taskNotes').value       = t.notes || '';
      document.getElementById('taskScreenshots').value = (t.screenshots || []).join('\n');
      document.getElementById('taskModalTitle').textContent = 'Edit Task';
    }
  }
  document.getElementById('taskModal').classList.add('show');
}

function closeTaskModal() { document.getElementById('taskModal').classList.remove('show'); editingTaskId = null; }

async function saveTask() {
  const title = document.getElementById('taskTitle').value.trim();
  if (!title) { showToast('Task title is required', 'warning'); return; }

  const data = {
    title,
    status:      document.getElementById('taskStatus').value,
    priority:    document.getElementById('taskPriority').value,
    description: document.getElementById('taskDescription').value.trim(),
    code:        document.getElementById('taskCode').value.trim(),
    notes:       document.getElementById('taskNotes').value.trim(),
    screenshots: document.getElementById('taskScreenshots').value.split('\n').map(s => s.trim()).filter(Boolean),
    updatedAt:   new Date().toISOString()
  };

  const eid = document.getElementById('taskEditId').value;
  if (eid) {
    const idx = tasks.findIndex(t => t.id === eid);
    if (idx !== -1) { Object.assign(tasks[idx], data); }
  } else {
    data.id = uid();
    data.createdAt = new Date().toISOString();
    tasks.unshift(data);
  }

  await saveTasks();
  closeTaskModal();
  renderTasks();
  updateDashboard();
  showToast(eid ? 'Task updated' : 'Task created', 'success');
}

function editTask(id) { openTaskModal(id); }

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  tasks = tasks.filter(t => t.id !== id);
  await saveTasks();
  renderTasks();
  updateDashboard();
  if (currentPage === 'task-detail') navigateTo('tasks');
  showToast('Task deleted', 'success');
}

function viewTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  const el = document.getElementById('taskDetailContent');
  if (!el) return;

  const sc = { pending: 'status-pending', 'in-progress': 'status-progress', completed: 'status-done' }[t.status] || '';
  const pc = { high: 'priority-high', medium: 'priority-med', low: 'priority-low' }[t.priority] || '';

  el.innerHTML = `
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="margin-bottom:8px">${esc(t.title)}</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span class="badge ${sc}">${t.status}</span>
            <span class="badge ${pc}">${t.priority}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-secondary" onclick="editTask('${t.id}')"><i class="fas fa-pen"></i> Edit</button>
          <button class="btn btn-sm btn-danger"    onclick="deleteTask('${t.id}')"><i class="fas fa-trash"></i> Delete</button>
        </div>
      </div>
    </div>
    ${t.description ? `<div class="card"><h3>Description</h3><p style="margin-top:8px;white-space:pre-wrap">${esc(t.description)}</p></div>` : ''}
    ${t.code ? `<div class="card"><h3>Code Snippet</h3><pre class="code-block"><code>${esc(t.code)}</code></pre></div>` : ''}
    ${t.notes ? `<div class="card"><h3>Notes</h3><p style="margin-top:8px;white-space:pre-wrap">${esc(t.notes)}</p></div>` : ''}
    ${t.screenshots && t.screenshots.length ? `<div class="card"><h3>Screenshots</h3><div style="display:grid;gap:12px;margin-top:12px">${t.screenshots.map(s => `<img src="${esc(s)}" alt="screenshot" style="max-width:100%;border-radius:8px;border:1px solid var(--border)" />`).join('')}</div></div>` : ''}
    <div class="card" style="font-size:.85rem;color:var(--text-secondary)">
      Created: ${new Date(t.createdAt).toLocaleString()}
      ${t.updatedAt ? ' &bull; Updated: ' + new Date(t.updatedAt).toLocaleString() : ''}
    </div>`;

  navigateTo('task-detail');
}

// ── Docs CRUD ───────────────────────────────────────────────
function renderDocs() {
  const list = document.getElementById('docList');
  const empty = document.getElementById('docEmptyState');
  if (!list) return;

  if (!docs.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  list.innerHTML = docs.map(d => `
    <li class="doc-item ${currentDocId === d.id ? 'active' : ''}" onclick="selectDoc('${d.id}')">
      <div class="doc-item-title"><i class="fas fa-file-alt" style="margin-right:8px;color:var(--primary)"></i>${esc(d.title)}</div>
      <small style="color:var(--text-secondary)">${timeAgo(d.updatedAt)}</small>
    </li>
  `).join('');
}

function selectDoc(id) {
  currentDocId = id;
  const d = docs.find(x => x.id === id);
  if (!d) return;

  renderDocs();

  // Editor
  const edArea     = document.getElementById('docEditorArea');
  const edPlaceh   = document.getElementById('docEditorPlaceholder');
  if (edArea)   edArea.style.display   = '';
  if (edPlaceh) edPlaceh.style.display = 'none';
  document.getElementById('docEditTitle').value   = d.title || '';
  document.getElementById('docEditContent').value = d.content || '';

  // Preview
  const pvArea   = document.getElementById('docPreviewArea');
  const pvPlaceh = document.getElementById('docPreviewPlaceholder');
  if (pvArea) {
    pvArea.style.display   = '';
    pvArea.innerHTML       = renderMarkdown(d.content || '');
  }
  if (pvPlaceh) pvPlaceh.style.display = 'none';
}

function openDocModal() { document.getElementById('docModal').classList.add('show'); }
function closeDocModal() {
  document.getElementById('docModal').classList.remove('show');
  document.getElementById('newDocTitle').value   = '';
  document.getElementById('newDocContent').value = '';
}

async function saveNewDoc() {
  const title = document.getElementById('newDocTitle').value.trim();
  if (!title) { showToast('Document title is required', 'warning'); return; }
  const d = {
    id: uid(),
    title,
    content:   document.getElementById('newDocContent').value.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  docs.unshift(d);
  await saveDocs();
  closeDocModal();
  renderDocs();
  selectDoc(d.id);
  showToast('Document created', 'success');
}

async function saveDocEdit() {
  const d = docs.find(x => x.id === currentDocId);
  if (!d) return;
  d.title     = document.getElementById('docEditTitle').value.trim() || d.title;
  d.content   = document.getElementById('docEditContent').value;
  d.updatedAt = new Date().toISOString();
  await saveDocs();
  renderDocs();
  selectDoc(d.id);
  showToast('Document saved', 'success');
}

async function deleteCurrentDoc() {
  if (!currentDocId || !confirm('Delete this document?')) return;
  docs = docs.filter(d => d.id !== currentDocId);
  currentDocId = null;
  await saveDocs();
  renderDocs();
  // Reset editor & preview
  const edArea   = document.getElementById('docEditorArea');
  const edPl     = document.getElementById('docEditorPlaceholder');
  const pvArea   = document.getElementById('docPreviewArea');
  const pvPl     = document.getElementById('docPreviewPlaceholder');
  if (edArea) edArea.style.display = 'none';
  if (edPl)   edPl.style.display   = '';
  if (pvArea) pvArea.style.display  = 'none';
  if (pvPl)   pvPl.style.display    = '';
  showToast('Document deleted', 'success');
}

function switchDocTab(tab, btn) {
  document.querySelectorAll('#docTabs .tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('docTabList').style.display    = tab === 'list'    ? '' : 'none';
  document.getElementById('docTabEditor').style.display  = tab === 'editor'  ? '' : 'none';
  document.getElementById('docTabPreview').style.display = tab === 'preview' ? '' : 'none';
}

// ── Markdown Renderer (simple) ──────────────────────────────
function renderMarkdown(md) {
  if (!md) return '<p style="color:var(--text-secondary)">No content.</p>';
  let html = esc(md);
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm,   '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  html = html.replace(/\n/g, '<br>');
  return '<div style="padding:20px;line-height:1.7">' + html + '</div>';
}

// ── Search ──────────────────────────────────────────────────
function handleSearch(q) {
  const box = document.getElementById('searchResults');
  if (!box) return;
  if (!q.trim()) { box.style.display = 'none'; return; }
  const lower = q.toLowerCase();
  const results = [];

  tasks.forEach(t => {
    if ((t.title || '').toLowerCase().includes(lower) || (t.description || '').toLowerCase().includes(lower))
      results.push({ type: 'task', title: t.title, id: t.id });
  });
  docs.forEach(d => {
    if ((d.title || '').toLowerCase().includes(lower) || (d.content || '').toLowerCase().includes(lower))
      results.push({ type: 'doc', title: d.title, id: d.id });
  });

  if (!results.length) {
    box.innerHTML = '<div class="search-result-item" style="color:var(--text-secondary)">No results</div>';
  } else {
    box.innerHTML = results.slice(0, 10).map(r => {
      const icon = r.type === 'task' ? 'tasks' : 'file-alt';
      return `<div class="search-result-item" onclick="${r.type === 'task' ? `viewTask('${r.id}')` : `selectDoc('${r.id}');navigateTo('docs')`}">
        <i class="fas fa-${icon}" style="margin-right:8px;color:var(--primary)"></i>${esc(r.title)}
      </div>`;
    }).join('');
  }
  box.style.display = '';
}

// Close search results on outside click
document.addEventListener('click', e => {
  const box = document.getElementById('searchResults');
  if (box && !e.target.closest('.header-search')) box.style.display = 'none';
});

// ── Utilities ───────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function esc(s) { const el = document.createElement('span'); el.textContent = s || ''; return el.innerHTML; }
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

// ── Refresh All Views ───────────────────────────────────────
function refreshAll() {
  updateDashboard();
  renderTasks();
  renderDocs();
}

// ── Quick Filter Sidebar Links ──────────────────────────────
function filterByStatus(status) {
  document.getElementById('filterStatus').value = status;
  document.getElementById('filterPriority').value = 'all';
  navigateTo('tasks');
}

function filterTasksByStatus(status) {
  document.getElementById('filterStatus').value = status === 'all' ? 'all' : status;
  document.getElementById('filterPriority').value = 'all';
  applyFilters();
}

function filterTasksByPriority(priority) {
  document.getElementById('filterPriority').value = priority === 'all' ? 'all' : priority;
  document.getElementById('filterStatus').value = 'all';
  applyFilters();
}

// ── Init ────────────────────────────────────────────────────
(function init() {
  loadTheme();

  // Load cached data
  try { tasks = JSON.parse(localStorage.getItem(TASKS_CACHE)) || []; } catch { tasks = []; }
  try { docs  = JSON.parse(localStorage.getItem(DOCS_CACHE))  || []; } catch { docs  = []; }

  refreshAll();
  updateStorageIndicator(false);
})();
