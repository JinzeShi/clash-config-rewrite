const VIEWS = {
  CONFIG: 'config',
  REWRITE: 'rewrite',
  FILES: 'files',
};

const FILE_TYPES = {
  ORIGIN: 'origin',
  OUTPUT: 'output',
  REWRITE: 'rewrite',
};

let currentView = VIEWS.CONFIG;
let selectedProfileName = '';
let selectedFileType = FILE_TYPES.ORIGIN;
let configCache = null;
let profileSuggestionTimer = null;
let profileSuggestionRequestId = 0;

function isValidView(view) {
  return Object.values(VIEWS).includes(view);
}

function isValidFileType(type) {
  return Object.values(FILE_TYPES).includes(type);
}

function getStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  let view = params.get('view');

  if (!view) {
    const path = window.location.pathname;
    if (path === '/files') {
      view = VIEWS.FILES;
    } else if (path === '/rewrite') {
      view = VIEWS.REWRITE;
    }
  }

  const type = params.get('type');

  return {
    view: isValidView(view) ? view : VIEWS.CONFIG,
    profile: params.get('profile') || '',
    type: isValidFileType(type) ? type : FILE_TYPES.ORIGIN,
  };
}

function writeUrlState({ replace = false } = {}) {
  const params = new URLSearchParams();
  params.set('view', currentView);

  if (currentView === VIEWS.FILES) {
    if (selectedProfileName) {
      params.set('profile', selectedProfileName);
    }
    params.set('type', selectedFileType);
  }

  const url = `${window.location.pathname === '/' ? '/' : '/'}?${params.toString()}`;
  const state = { view: currentView, profile: selectedProfileName, type: selectedFileType };

  if (`${window.location.pathname}${window.location.search}` === url) {
    return;
  }

  if (replace) {
    window.history.replaceState(state, '', url);
  } else {
    window.history.pushState(state, '', url);
  }
}

const els = {
  toast: document.querySelector('#toast'),
  statusText: document.querySelector('#statusText'),
  runButton: document.querySelector('#runButton'),
  configView: document.querySelector('#configView'),
  rewriteView: document.querySelector('#rewriteView'),
  filesView: document.querySelector('#filesView'),
  previewEditor: document.querySelector('#previewEditor'),
  saveFileButton: document.querySelector('#saveFileButton'),
  navButtons: [...document.querySelectorAll('.nav-button')],
  profileList: document.querySelector('#profileList'),
  previewSummary: document.querySelector('#previewSummary'),
  previewName: document.querySelector('#previewName'),
  tabButtons: [...document.querySelectorAll('.tab-button')],
  originDirInput: document.querySelector('#originDirInput'),
  outputDirInput: document.querySelector('#outputDirInput'),
  configRows: document.querySelector('#configRows'),
  addConfigRowButton: document.querySelector('#addConfigRowButton'),
  rewriteEditor: document.querySelector('#rewriteEditor'),
  saveRewriteButton: document.querySelector('#saveRewriteButton'),
  copyRewriteButton: document.querySelector('#copyRewriteButton'),
  copyPreviewButton: document.querySelector('#copyPreviewButton'),
  copyFileNameButton: document.querySelector('#copyFileNameButton'),
  profileModal: document.querySelector('#profileModal'),
  modalTitle: document.querySelector('#modalTitle'),
  modalClose: document.querySelector('#modalClose'),
  modalCancel: document.querySelector('#modalCancel'),
  modalSave: document.querySelector('#modalSave'),
  modalName: document.querySelector('#modalName'),
  modalOriginFile: document.querySelector('#modalOriginFile'),
  modalOutputFile: document.querySelector('#modalOutputFile'),
  modalRewriteOutputFile: document.querySelector('#modalRewriteOutputFile'),
  modalUrl: document.querySelector('#modalUrl'),
  modalUserAgent: document.querySelector('#modalUserAgent'),
  modalInterval: document.querySelector('#modalInterval'),
  fetchSubscriptionButton: document.querySelector('#fetchSubscriptionButton'),
  subBar: document.querySelector('#subscriptionInfoBar'),
  subUpload: document.querySelector('#subUpload'),
  subDownload: document.querySelector('#subDownload'),
  subTotal: document.querySelector('#subTotal'),
  subExpire: document.querySelector('#subExpire'),
  subUpdateTime: document.querySelector('#subUpdateTime'),
};

function formatBytes(bytes) {
  if (!bytes || bytes === 0) { return '0 B'; }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function setStatus(message) {
  els.statusText.textContent = message;
}

function showToast(message, type = 'info') {
  els.toast.textContent = message;
  els.toast.dataset.type = type;
  els.toast.hidden = false;

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
}

function notify(message, type = 'info') {
  setStatus(message);
  showToast(message, type);
}

function showInputPlaceholder(input) {
  input.placeholder = input.dataset.placeholder || '';
}

function hideInputPlaceholder(input) {
  input.placeholder = '';
}

function resetProfileSuggestionState() {
  window.clearTimeout(profileSuggestionTimer);
  profileSuggestionRequestId += 1;
  applyDefualtProfileSuggestions();
}

function getSuggestedValue(suggestions, field) {
  return suggestions?.[field] || '';
}

function applyDefualtProfileSuggestions() {
  els.modalOriginFile.placeholder = 'Unique file name in origin directory';
  els.modalOutputFile.placeholder = 'Unique file name in output directory';
  els.modalRewriteOutputFile.placeholder = 'Unique file name in output directory';
}

function applyProfileSuggestions(suggestions) {
  els.modalOriginFile.placeholder = getSuggestedValue(suggestions, 'originFile');
  els.modalOutputFile.placeholder = getSuggestedValue(suggestions, 'outputFile');
  els.modalRewriteOutputFile.placeholder = getSuggestedValue(suggestions, 'rewriteOutputFile');
}

async function requestProfileSuggestions(name) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    applyDefualtProfileSuggestions();
    return;
  }

  const requestId = ++profileSuggestionRequestId;
  const suggestions = await requestJson(`/api/profile/suggestions?name=${encodeURIComponent(trimmedName)}`);

  if (requestId !== profileSuggestionRequestId || els.modalName.value.trim() !== trimmedName) {
    return;
  }

  applyProfileSuggestions(suggestions);
}

function queueProfileSuggestions(name) {
  window.clearTimeout(profileSuggestionTimer);
  profileSuggestionTimer = window.setTimeout(() => {
    requestProfileSuggestions(name).catch((error) => notify(error.message, 'error'));
  }, 250);
}

async function requestJson(url, options = {}) {
  const headers = {
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || text || 'Request failed');
  }

  return payload;
}

function showView(view, pushState = true) {
  currentView = view;
  els.configView.hidden = view !== VIEWS.CONFIG;
  els.rewriteView.hidden = view !== VIEWS.REWRITE;
  els.filesView.hidden = view !== VIEWS.FILES;

  for (const button of els.navButtons) {
    button.classList.toggle('active', button.dataset.view === view);
  }

  if (pushState) {
    writeUrlState();
  }
}

async function loadView(view, { pushState = true } = {}) {
  showView(view, pushState);
  setStatus('Loading');

  if (view === VIEWS.CONFIG) {
    await loadConfig();
  } else if (view === VIEWS.REWRITE) {
    await loadRewrite();
  } else if (view === VIEWS.FILES) {
    await loadFiles();
  }

  setStatus('Ready');
}

function appendConfigRow(profile = {}) {
  const row = document.createElement('div');
  row.className = 'mapping-row';

  const name = document.createElement('span');
  name.className = 'row-name';
  name.textContent = profile.name || '';

  const origin = document.createElement('span');
  origin.className = 'row-origin';
  origin.textContent = profile.originFile || '';

  const url = document.createElement('span');
  url.className = 'row-suburl';
  url.textContent = profile.url || '';

  const actions = document.createElement('div');
  actions.className = 'row-actions';

  const editButton = document.createElement('button');
  editButton.className = 'edit-button';
  editButton.type = 'button';
  editButton.textContent = 'Edit';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.textContent = 'Remove';

  if (profile.url) {
    const updateButton = document.createElement('button');
    updateButton.className = 'primary-button';
    updateButton.type = 'button';
    updateButton.textContent = 'Update';
    updateButton.addEventListener('click', () => {
      fetchProfileSubscription(profile.name, {
        beforeFetch: () => {
          updateButton.disabled = true;
        },
        afterFetch: () => {
          updateButton.disabled = false;
        },
        afterSuccess: loadConfig,
      }).catch((error) => notify(error.message, 'error'));
    });
    actions.append(updateButton);
  }

  actions.append(editButton, removeButton);
  row.append(name, origin, url, actions);

  row.dataset.profile = JSON.stringify(profile);
  editButton.addEventListener('click', () => openProfileModal(profile, row));
  removeButton.addEventListener('click', () => {
    const p = JSON.parse(row.dataset.profile || '{}');
    if (p.name) {
      deleteProfile(p.name).catch((error) => notify(error.message, 'error'));
    } else {
      row.remove();
    }
  });
  els.configRows.appendChild(row);
}
function renderConfig(config) {
  configCache = config;
  els.originDirInput.value = config.originDir;
  els.outputDirInput.value = config.outputDir;
  els.configRows.innerHTML = '';

  for (const profile of config.profiles) {
    appendConfigRow(profile);
  }
}

let editingRow = null;

function openProfileModal(profile = {}, row = null) {
  resetProfileSuggestionState();
  editingRow = row;
  const isNew = !profile.name;
  els.modalTitle.textContent = isNew ? 'Add Profile' : 'Edit Profile';
  els.modalName.value = profile.name || '';
  els.modalName.readOnly = !isNew;
  els.modalOriginFile.value = profile.originFile || '';
  els.modalOutputFile.value = profile.outputFile || '';
  els.modalRewriteOutputFile.value = profile.rewriteOutputFile || '';
  els.modalUrl.value = profile.url || '';
  els.modalUserAgent.value = profile.userAgent || '';
  els.modalInterval.value = profile.updateInterval ?? '';
  hideInputPlaceholder(els.modalUrl);
  hideInputPlaceholder(els.modalUserAgent);
  hideInputPlaceholder(els.modalInterval);
  els.profileModal.hidden = false;

  if (profile.name) {
    requestProfileSuggestions(profile.name).catch((error) => notify(error.message, 'error'));
  }
}

function closeProfileModal() {
  els.profileModal.hidden = true;
  editingRow = null;
  resetProfileSuggestionState();
}

function collectModalProfile() {
  const profile = {
    name: els.modalName.value.trim(),
    originFile: els.modalOriginFile.value.trim() || els.modalOriginFile.placeholder.trim(),
  };

  const outputFile = els.modalOutputFile.value.trim();
  const rewriteOutputFile = els.modalRewriteOutputFile.value.trim();
  const url = els.modalUrl.value.trim();
  const userAgent = els.modalUserAgent.value.trim();
  const updateInterval = els.modalInterval.value.trim();

  if (outputFile) {
    profile.outputFile = outputFile;
  }
  if (rewriteOutputFile) {
    profile.rewriteOutputFile = rewriteOutputFile;
  }
  if (url) {
    profile.url = url;
  }
  if (userAgent) {
    profile.userAgent = userAgent;
  }
  if (updateInterval !== '') {
    profile.updateInterval = Number(updateInterval) || 0;
  }

  return profile;
}

async function saveModalProfile() {
  const profile = collectModalProfile();
  if (!profile.name) { notify('Name is required.', 'error'); return; }
  setStatus('Saving profile');
  try {
    const isNew = !editingRow;
    await requestJson(isNew ? '/api/profile' : `/api/profile/${encodeURIComponent(profile.name)}`, {
      method: isNew ? 'POST' : 'PUT',
      body: JSON.stringify(profile),
    });
    closeProfileModal();
    await loadConfig();
    notify('Profile saved');
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function loadConfig() {
  const [config, profileResult] = await Promise.all([
    requestJson('/api/config'),
    requestJson('/api/profile'),
  ]);
  renderConfig({
    ...config,
    profiles: profileResult.profiles || [],
  });
}

async function loadRewrite() {
  const content = await requestJson('/api/rewrite/script');
  els.rewriteEditor.value = content || '';
}

async function saveRewrite() {
  setStatus('Saving rewrite');
  await requestJson('/api/rewrite/script', {
    method: 'PUT',
    body: JSON.stringify(els.rewriteEditor.value),
  });
  notify('Rewrite saved');
}

function renderProfiles(profiles) {
  els.profileList.innerHTML = '';

  for (const profile of profiles) {
    const button = document.createElement('button');
    button.className = `profile-button${profile.name === selectedProfileName ? ' active' : ''}`;
    button.type = 'button';
    button.innerHTML = '<span></span><span></span>';
    button.children[0].textContent = profile.name;
    button.children[1].textContent = profile.originFile;
    button.addEventListener('click', () => {
      selectedProfileName = profile.name;
      writeUrlState();
      loadSelectedFile().catch((error) => notify(error.message, 'error'));
      renderProfiles(configCache.profiles);
    });
    els.profileList.appendChild(button);
  }
}

function renderTabs() {
  for (const button of els.tabButtons) {
    button.classList.toggle('active', button.dataset.preview === selectedFileType);
  }
  els.fetchSubscriptionButton.hidden = true;
  els.previewEditor.readOnly = selectedFileType !== FILE_TYPES.ORIGIN;
  els.saveFileButton.hidden = selectedFileType !== FILE_TYPES.ORIGIN;
  els.copyFileNameButton.hidden = selectedFileType === FILE_TYPES.ORIGIN;
}

async function loadFiles() {
  const [config, profileResult] = await Promise.all([
    requestJson('/api/config'),
    requestJson('/api/profile'),
  ]);
  configCache = {
    ...config,
    profiles: profileResult.profiles || [],
  };
  if (!configCache.profiles.some((profile) => profile.name === selectedProfileName)) {
    selectedProfileName = configCache.profiles[0]?.name || '';
  }
  renderProfiles(configCache.profiles);
  renderTabs();
  writeUrlState({ replace: true });
  await loadSelectedFile();
}

async function loadSelectedFile() {
  if (!selectedProfileName) {
    els.previewSummary.textContent = 'No profiles configured';
    els.previewName.textContent = '';
    els.previewEditor.value = '';
    els.fetchSubscriptionButton.hidden = true;
    els.subBar.hidden = true;
    return;
  }

  setStatus('Loading file');
  const profile = configCache?.profiles?.find((item) => item.name === selectedProfileName);
  const { fileName, content, userInfo, updateTime } = await requestJson(`/api/profile/${encodeURIComponent(selectedProfileName)}/content/${selectedFileType}`);

  els.previewSummary.textContent = selectedProfileName;
  els.previewName.textContent = fileName;
  els.previewEditor.value = content;
  els.fetchSubscriptionButton.hidden = selectedFileType !== FILE_TYPES.ORIGIN || !profile?.url;

  if (userInfo && updateTime) {
    els.subBar.hidden = false;
    els.subUpload.textContent = formatBytes(userInfo.upload);
    els.subUpload.dataset.label = 'Upload';
    els.subDownload.textContent = formatBytes(userInfo.download);
    els.subDownload.dataset.label = 'Download';
    els.subTotal.textContent = formatBytes(userInfo.total);
    els.subTotal.dataset.label = 'Total';
    els.subExpire.textContent = userInfo.expire ? new Date(userInfo.expire * 1000).toLocaleString() : 'N/A';
    els.subExpire.dataset.label = 'Expire';
    els.subUpdateTime.textContent = updateTime ? new Date(updateTime).toLocaleString() : 'N/A';
    els.subUpdateTime.dataset.label = 'Updated';
  } else {
    els.subBar.hidden = true;
  }
  setStatus('Ready');
}

async function runRewrite() {
  setStatus('Running');
  els.runButton.disabled = true;

  try {
    const result = await requestJson('/api/rewrite/run', { method: 'POST' });

    if (currentView === VIEWS.FILES) {
      await loadSelectedFile();
    }

    notify(result.message || 'Rewrite complete');
  } finally {
    els.runButton.disabled = false;
  }
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

async function saveOriginFile() {
  setStatus('Saving origin file');
  const result = await requestJson(`/api/profile/${encodeURIComponent(selectedProfileName)}/content`, {
    method: 'PUT',
    body: JSON.stringify(els.previewEditor.value),
  });
  setStatus('Ready');
  notify(result.message || 'Origin file saved');
}

window.addEventListener("popstate", (e) => {
  const state = e.state || getStateFromUrl();
  selectedProfileName = state.profile || '';
  selectedFileType = isValidFileType(state.type) ? state.type : FILE_TYPES.ORIGIN;
  loadView(state.view || VIEWS.CONFIG, { pushState: false }).catch((error) => notify(error.message, "error"));
});

async function fetchProfileSubscription(name, { beforeFetch, afterFetch, afterSuccess } = {}) {
  setStatus('Fetching subscription');
  beforeFetch?.();
  try {
    const result = await requestJson(`/api/profile/${encodeURIComponent(name)}/fetch`, {
      method: 'POST',
    });
    await afterSuccess?.();
    notify(result.message || 'Subscription fetched');
  } finally {
    afterFetch?.();
  }
}

async function fetchSubscription() {
  await fetchProfileSubscription(selectedProfileName, {
    beforeFetch: () => {
      els.fetchSubscriptionButton.disabled = true;
    },
    afterFetch: () => {
      els.fetchSubscriptionButton.disabled = false;
    },
    afterSuccess: loadFiles,
  });
}

async function deleteProfile(name) {
  if (!confirm(`Delete profile "${name}"? This cannot be undone.`)) { return; }
  setStatus('Deleting profile');
  try {
    await requestJson(`/api/profile/${encodeURIComponent(name)}`, { method: 'DELETE' });
    await loadConfig();
    notify('Profile deleted');
  } catch (error) {
    notify(error.message, 'error');
  }
}

function toCapitalizeCase(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function bindEvents() {
  for (const button of els.navButtons) {
    button.addEventListener('click', () => {
      loadView(button.dataset.view).catch((error) => notify(error.message, 'error'));
    });
  }

  for (const button of els.tabButtons) {
    button.addEventListener('click', () => {
      selectedFileType = button.dataset.preview;
      renderTabs();
      writeUrlState();
      loadSelectedFile().catch((error) => notify(error.message, 'error'));
    });
  }

  els.runButton.addEventListener('click', () => {
    runRewrite().catch((error) => notify(error.message, 'error'));
  });

  els.addConfigRowButton.addEventListener('click', () => openProfileModal());
  els.modalClose.addEventListener('click', closeProfileModal);
  els.modalCancel.addEventListener('click', closeProfileModal);
  els.modalSave.addEventListener('click', saveModalProfile);
  for (const input of [els.modalUrl, els.modalUserAgent, els.modalInterval]) {
    input.addEventListener('focus', () => showInputPlaceholder(input));
    input.addEventListener('blur', () => hideInputPlaceholder(input));
  }
  els.modalName.addEventListener('input', (e) => {
    queueProfileSuggestions(e.target.value);
  });
  els.saveRewriteButton.addEventListener('click', () => saveRewrite().catch((error) => notify(error.message, 'error')));
  els.copyRewriteButton.addEventListener('click', () => {
    copyText(els.rewriteEditor.value)
      .then(() => notify('Rewrite copied'))
      .catch((error) => notify(error.message, 'error'));
  });
  els.copyPreviewButton.addEventListener('click', () => {
    copyText(els.previewEditor.value)
      .then(() => notify('Preview copied'))
      .catch((error) => notify(error.message, 'error'));
  });
  els.copyFileNameButton.addEventListener('click', () => {
    copyText(els.previewName.textContent)
      .then(() => notify('File name copied'))
      .catch((error) => notify(error.message, 'error'));
  });
  els.saveFileButton.addEventListener('click', () => {
    saveOriginFile().catch((error) => notify(error.message, 'error'));
  });
  els.fetchSubscriptionButton.addEventListener('click', () => {
    fetchSubscription().catch((error) => notify(error.message, 'error'));
  });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (currentView === VIEWS.REWRITE && document.activeElement === els.rewriteEditor) {
        saveRewrite().catch((error) => notify(error.message, 'error'));
      } else if (currentView === VIEWS.FILES && selectedFileType === FILE_TYPES.ORIGIN && document.activeElement === els.previewEditor) {
        saveOriginFile().catch((error) => notify(error.message, 'error'));
      }
    }
  });
}

bindEvents();
const initialState = getStateFromUrl();
selectedProfileName = initialState.profile;
selectedFileType = initialState.type;
if (initialState.view !== currentView) {
  showView(initialState.view, false);
}
loadView(initialState.view, { pushState: false }).catch((error) => notify(error.message, 'error'));
