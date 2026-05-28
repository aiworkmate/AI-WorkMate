const state = {
  user: null,
  csrfToken: null,
  config: {},
  mode: 'general',
  conversationId: null,
  uploadIds: [],
  uploads: [],
  streaming: false,
  authMode: 'register',
  metrics: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  authView: $('#authView'),
  app: $('#app'),
  authForm: $('#authForm'),
  authSwitch: $('#authSwitch'),
  authError: $('#authError'),
  nameField: $('#nameField'),
  messageList: $('#messageList'),
  composer: $('#composer'),
  promptInput: $('#promptInput'),
  fileInput: $('#fileInput'),
  attachButton: $('#attachButton'),
  uploadViewButton: $('#uploadViewButton'),
  uploadDrop: $('#uploadDrop'),
  uploadList: $('#uploadList'),
  attachedFiles: $('#attachedFiles'),
  contextFeed: $('#contextFeed'),
  conversationList: $('#conversationList'),
  toolCount: $('#toolCount'),
  fileCount: $('#fileCount'),
  recallCount: $('#recallCount'),
  liveToggle: $('#liveToggle'),
  memoryToggle: $('#memoryToggle'),
  liveStatus: $('#liveStatus'),
  memoryStatus: $('#memoryStatus'),
  providerStatus: $('#providerStatus'),
  toast: $('#toast'),
  memoryForm: $('#memoryForm'),
  memoryInput: $('#memoryInput'),
  memoryList: $('#memoryList'),
  dashboardCards: $('#dashboardCards'),
  activityBars: $('#activityBars'),
  adminSummary: $('#adminSummary'),
  auditList: $('#auditList'),
  settingsForm: $('#settingsForm'),
  settingsName: $('#settingsName'),
  settingsMode: $('#settingsMode'),
  settingsTheme: $('#settingsTheme'),
  themeButton: $('#themeButton'),
  voiceButton: $('#voiceButton'),
  mobileMenu: $('#mobileMenu')
};

boot();

async function boot() {
  bindEvents();
  applyTheme(localStorage.getItem('wm_theme') || 'system');
  try {
    const session = await api('/api/session');
    applySession(session);
  } catch (error) {
    showAuth();
  }
}

function bindEvents() {
  els.authForm.addEventListener('submit', onAuth);
  els.authSwitch.addEventListener('click', toggleAuthMode);
  els.composer.addEventListener('submit', onSend);
  els.promptInput.addEventListener('input', autoSizePrompt);
  els.attachButton.addEventListener('click', () => els.fileInput.click());
  els.uploadViewButton.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => handleFiles([...els.fileInput.files]));
  els.uploadDrop.addEventListener('click', () => els.fileInput.click());
  els.uploadDrop.addEventListener('dragover', (event) => {
    event.preventDefault();
    els.uploadDrop.classList.add('dragging');
  });
  els.uploadDrop.addEventListener('dragleave', () => els.uploadDrop.classList.remove('dragging'));
  els.uploadDrop.addEventListener('drop', (event) => {
    event.preventDefault();
    els.uploadDrop.classList.remove('dragging');
    handleFiles([...event.dataTransfer.files]);
  });
  els.memoryForm.addEventListener('submit', saveManualMemory);
  els.settingsForm.addEventListener('submit', saveSettings);
  $('#logoutButton').addEventListener('click', logout);
  $('#newChatButton').addEventListener('click', newChat);
  $('#refreshMetrics').addEventListener('click', loadMetrics);
  $('#refreshAdmin').addEventListener('click', loadAdmin);
  $('#refreshMemory').addEventListener('click', loadMemory);
  els.themeButton.addEventListener('click', cycleTheme);
  els.voiceButton.addEventListener('click', voiceInput);
  els.mobileMenu.addEventListener('click', () => $('.sidebar').classList.toggle('open'));
  els.liveToggle.addEventListener('change', refreshStatusChips);
  els.memoryToggle.addEventListener('change', refreshStatusChips);
  $$('.nav-item').forEach((button) => button.addEventListener('click', () => openView(button.dataset.view)));
  $$('.mode-button').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(state.csrfToken ? { 'x-csrf-token': state.csrfToken } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function applySession(session) {
  state.user = session.user;
  state.csrfToken = session.csrfToken;
  state.config = session.config || {};
  if (!state.user) return showAuth();
  els.authView.hidden = true;
  els.app.hidden = false;
  els.providerStatus.textContent = state.config.aiConfigured ? 'AI provider ready' : 'Local core';
  $('#uploadLimit').textContent = `Limit ${Math.round((state.config.maxUploadBytes || 0) / 1024 / 1024)} MB per file`;
  hydrateSettings();
  setMode(state.user.settings?.defaultMode || 'general');
  els.liveToggle.checked = state.user.settings?.liveData !== false;
  els.memoryToggle.checked = state.user.settings?.memory !== false;
  refreshStatusChips();
  initialChat();
  Promise.allSettled([loadUploads(), loadConversations(), loadMemory(), loadMetrics()]);
}

function showAuth() {
  els.authView.hidden = false;
  els.app.hidden = true;
}

async function onAuth(event) {
  event.preventDefault();
  els.authError.textContent = '';
  const data = new FormData(els.authForm);
  const payload = {
    name: data.get('name'),
    email: data.get('email'),
    password: data.get('password')
  };
  try {
    const session = await api(state.authMode === 'register' ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    applySession(session);
  } catch (error) {
    els.authError.textContent = error.message;
  }
}

function toggleAuthMode() {
  state.authMode = state.authMode === 'register' ? 'login' : 'register';
  els.nameField.hidden = state.authMode === 'login';
  els.authForm.querySelector('button').textContent = state.authMode === 'register' ? 'Create Secure Workspace' : 'Sign In';
  els.authSwitch.textContent = state.authMode === 'register' ? 'Use Existing Account' : 'Create New Workspace';
  els.authError.textContent = '';
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => {});
  state.user = null;
  state.csrfToken = null;
  showAuth();
}

function initialChat() {
  els.messageList.innerHTML = '';
  addMessage('assistant', 'AI WorkMate is online. Live tools, memory, file understanding, and medical assistive mode are ready.');
}

function newChat() {
  state.conversationId = null;
  state.uploadIds = [];
  renderAttachedFiles();
  initialChat();
}

async function onSend(event) {
  event.preventDefault();
  const message = els.promptInput.value.trim();
  if (!message || state.streaming) return;
  state.streaming = true;
  els.promptInput.value = '';
  autoSizePrompt();
  addMessage('user', message);
  const assistant = addMessage('assistant', '');
  setComposerBusy(true);
  resetContext();

  try {
    const data = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        conversationId: state.conversationId,
        mode: state.mode,
        uploadIds: state.uploadIds,
        enableLive: els.liveToggle.checked,
        enableMemory: els.memoryToggle.checked
      })
    });
    if (!data.response) throw new Error('Missing final AI response.');
    assistant.content.textContent = data.response;
    renderContext();
    scrollMessages();
    await Promise.allSettled([loadConversations(), loadMemory(), loadMetrics()]);
  } catch (error) {
    assistant.content.textContent = `Request failed: ${error.message}`;
    toast(error.message);
  } finally {
    state.streaming = false;
    setComposerBusy(false);
  }
}

function addMessage(role, content) {
  const item = document.createElement('article');
  item.className = `message ${role}`;
  const label = document.createElement('div');
  label.className = 'role';
  label.textContent = role === 'user' ? 'You' : 'AI WorkMate';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = content;
  item.append(label, bubble);
  els.messageList.append(item);
  scrollMessages();
  return { item, content: bubble };
}

function scrollMessages() {
  els.messageList.scrollTop = els.messageList.scrollHeight;
}

function setComposerBusy(isBusy) {
  els.composer.querySelectorAll('button, textarea').forEach((el) => {
    el.disabled = isBusy;
  });
}

function autoSizePrompt() {
  els.promptInput.style.height = 'auto';
  els.promptInput.style.height = `${Math.min(180, Math.max(44, els.promptInput.scrollHeight))}px`;
}

async function handleFiles(files) {
  for (const file of files) {
    if (state.config.maxUploadBytes && file.size > state.config.maxUploadBytes) {
      toast(`${file.name} exceeds the upload limit.`);
      continue;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const result = await api('/api/uploads', {
        method: 'POST',
        body: JSON.stringify({ name: file.name, type: file.type || 'application/octet-stream', dataUrl })
      });
      state.uploads.unshift(result.upload);
      state.uploadIds.push(result.upload.id);
      toast(`Uploaded ${file.name}`);
    } catch (error) {
      toast(error.message);
    }
  }
  renderUploads();
  renderAttachedFiles();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function loadUploads() {
  const data = await api('/api/uploads');
  state.uploads = data.uploads || [];
  renderUploads();
}

function renderUploads() {
  els.uploadList.innerHTML = state.uploads.map((item) => `
    <div class="list-item">
      <strong>${escapeHtml(item.name)}</strong>
      <p>${escapeHtml(item.summary || '')}</p>
      <span class="chip">${escapeHtml(item.mime)} <strong>${formatBytes(item.size)}</strong></span>
    </div>
  `).join('') || emptyItem('No files yet');
}

function renderAttachedFiles() {
  const attached = state.uploads.filter((item) => state.uploadIds.includes(item.id));
  els.fileCount.textContent = attached.length;
  els.attachedFiles.innerHTML = attached.map((item) => `
    <span class="chip"><strong>${escapeHtml(item.name)}</strong><button class="chip-x" data-remove-upload="${item.id}" type="button" aria-label="Remove file"><svg><use href="#i-close"></use></svg></button></span>
  `).join('');
  els.attachedFiles.querySelectorAll('[data-remove-upload]').forEach((button) => {
    button.addEventListener('click', () => {
      state.uploadIds = state.uploadIds.filter((id) => id !== button.dataset.removeUpload);
      renderAttachedFiles();
    });
  });
}

async function loadConversations() {
  const data = await api('/api/conversations');
  els.conversationList.innerHTML = (data.conversations || []).slice(0, 12).map((item) => `
    <div class="list-item" data-conv="${item.id}">
      <strong>${escapeHtml(item.title)}</strong>
      <p>${item.messageCount} messages · ${escapeHtml(item.mode)}</p>
    </div>
  `).join('') || emptyItem('No conversations yet');
  els.conversationList.querySelectorAll('[data-conv]').forEach((item) => {
    item.addEventListener('click', () => loadConversation(item.dataset.conv));
  });
}

async function loadConversation(id) {
  const data = await api(`/api/conversations/${id}`);
  state.conversationId = id;
  els.messageList.innerHTML = '';
  for (const message of data.messages || []) addMessage(message.role, message.content);
  openView('chat');
}

async function loadMemory() {
  const data = await api('/api/memory');
  renderMemory(data.memories || []);
}

function renderMemory(memories) {
  els.memoryList.innerHTML = memories.map((item) => `
    <div class="list-item">
      <strong>${escapeHtml(item.kind || 'memory')}</strong>
      <p>${escapeHtml(item.content)}</p>
      <span class="chip">${escapeHtml(new Date(item.createdAt).toLocaleString())}</span>
    </div>
  `).join('') || emptyItem('No saved memory yet');
}

async function saveManualMemory(event) {
  event.preventDefault();
  const content = els.memoryInput.value.trim();
  if (!content) return;
  await api('/api/memory', { method: 'POST', body: JSON.stringify({ content, kind: 'manual' }) });
  els.memoryInput.value = '';
  await loadMemory();
}

async function loadMetrics() {
  try {
    const data = await api('/api/admin/metrics');
    state.metrics = data.summary;
    renderDashboard(data.summary);
  } catch {
    renderDashboard({ totalEvents: 0, averageLatencyMs: 0, errorRate: 0, tokensEstimated: 0, byTool: {}, byMode: {} });
  }
}

async function loadAdmin() {
  try {
    const [metrics, audit] = await Promise.all([api('/api/admin/metrics'), api('/api/admin/audit')]);
    renderAdmin(metrics.summary, audit.audit || []);
  } catch (error) {
    els.adminSummary.innerHTML = emptyItem(error.message);
    els.auditList.innerHTML = '';
  }
}

function renderDashboard(summary) {
  els.dashboardCards.innerHTML = cards([
    ['Events', summary.totalEvents || 0],
    ['Avg Latency', `${summary.averageLatencyMs || 0} ms`],
    ['Error Rate', `${Math.round((summary.errorRate || 0) * 100)}%`],
    ['Tokens', summary.tokensEstimated || 0],
    ['Live Tools', Object.values(summary.byTool || {}).reduce((a, b) => a + b, 0)],
    ['Medical Mode', summary.byMode?.medical || 0]
  ]);
  renderBars(els.activityBars, summary.byTool || {});
}

function renderAdmin(summary, audit) {
  els.adminSummary.innerHTML = cards([
    ['Events', summary.totalEvents || 0],
    ['Latency', `${summary.averageLatencyMs || 0} ms`],
    ['Errors', `${Math.round((summary.errorRate || 0) * 100)}%`]
  ]);
  els.auditList.innerHTML = audit.map((item) => `
    <div class="list-item">
      <strong>${escapeHtml(item.type)}</strong>
      <p>${escapeHtml(item.status)} · ${escapeHtml(new Date(item.at).toLocaleString())}</p>
    </div>
  `).join('') || emptyItem('No audit events');
}

function cards(items) {
  return items.map(([label, value]) => `<div class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
}

function renderBars(target, values) {
  const entries = Object.entries(values);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  target.innerHTML = entries.map(([label, value]) => `
    <div class="bar-row"><span>${escapeHtml(label)}</span><div class="bar"><span data-width="${Math.max(8, (value / max) * 100)}"></span></div><strong>${value}</strong></div>
  `).join('') || emptyItem('No tool activity yet');
  target.querySelectorAll('[data-width]').forEach((item) => {
    item.style.width = `${item.dataset.width}%`;
  });
}

function renderContext() {
  els.toolCount.textContent = '0';
  els.recallCount.textContent = '0';
  els.fileCount.textContent = String(state.uploadIds.length);
  els.contextFeed.innerHTML = '<div class="feed-item"><strong>Answer ready</strong><p>Only the final assistant message is shown in chat.</p></div>';
}

function resetContext() {
  els.toolCount.textContent = '0';
  els.recallCount.textContent = '0';
  els.contextFeed.innerHTML = '<div class="feed-item"><strong>Preparing answer</strong><p>The final response will appear in chat.</p></div>';
}

function openView(name) {
  $$('.view').forEach((view) => view.classList.remove('active-view'));
  $(`#${name}View`).classList.add('active-view');
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  $('.sidebar').classList.remove('open');
  if (name === 'admin') loadAdmin();
  if (name === 'dashboard') loadMetrics();
  if (name === 'uploads') loadUploads();
  if (name === 'memory') loadMemory();
}

function setMode(mode) {
  state.mode = mode;
  $$('.mode-button').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
}

function refreshStatusChips() {
  els.liveStatus.textContent = els.liveToggle.checked ? 'Ready' : 'Off';
  els.memoryStatus.textContent = els.memoryToggle.checked ? 'On' : 'Off';
}

function hydrateSettings() {
  els.settingsName.value = state.user?.name || '';
  els.settingsMode.value = state.user?.settings?.defaultMode || 'general';
  els.settingsTheme.value = state.user?.settings?.theme || localStorage.getItem('wm_theme') || 'system';
}

async function saveSettings(event) {
  event.preventDefault();
  const theme = els.settingsTheme.value;
  const result = await api('/api/account', {
    method: 'PUT',
    body: JSON.stringify({
      name: els.settingsName.value,
      settings: {
        defaultMode: els.settingsMode.value,
        theme,
        liveData: els.liveToggle.checked,
        memory: els.memoryToggle.checked
      }
    })
  });
  state.user = result.user;
  localStorage.setItem('wm_theme', theme);
  applyTheme(theme);
  setMode(els.settingsMode.value);
  toast('Settings saved');
}

function applyTheme(theme) {
  const effective = theme === 'system'
    ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;
  document.documentElement.dataset.theme = effective;
}

function cycleTheme() {
  const current = localStorage.getItem('wm_theme') || 'system';
  const next = current === 'system' ? 'dark' : current === 'dark' ? 'light' : 'system';
  localStorage.setItem('wm_theme', next);
  applyTheme(next);
  els.settingsTheme.value = next;
}

function voiceInput() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return toast('Voice input is not available in this browser.');
  const recognition = new Recognition();
  recognition.lang = navigator.language || 'en-US';
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    els.promptInput.value = event.results[0][0].transcript;
    autoSizePrompt();
  };
  recognition.onerror = () => toast('Voice input stopped.');
  recognition.start();
}

function emptyItem(text) {
  return `<div class="list-item"><p>${escapeHtml(text)}</p></div>`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3500);
}
