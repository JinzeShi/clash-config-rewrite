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

function getViewFromPath() {
  const p = window.location.pathname;
  if (p === "/files") return VIEWS.FILES;
  if (p === "/rewrite") return VIEWS.REWRITE;
  return VIEWS.CONFIG;
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
  previewTitle: document.querySelector('#previewTitle'),
  previewName: document.querySelector('#previewName'),
  previewContent: document.querySelector('#previewContent'),
  tabButtons: [...document.querySelectorAll('.tab-button')],
  originDirInput: document.querySelector('#originDirInput'),
  outputDirInput: document.querySelector('#outputDirInput'),
  configRows: document.querySelector('#configRows'),
  addConfigRowButton: document.querySelector('#addConfigRowButton'),
  rewriteEditor: document.querySelector('#rewriteEditor'),
  saveConfigButton: document.querySelector('#saveConfigButton'),
  copyConfigButton: document.querySelector('#copyConfigButton'),
  saveRewriteButton: document.querySelector('#saveRewriteButton'),
  copyRewriteButton: document.querySelector('#copyRewriteButton'),
  copyPreviewButton: document.querySelector('#copyPreviewButton'),
  copyFileNameButton: document.querySelector('#copyFileNameButton'),
};

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

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

async function requestText(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || 'Request failed');
  }

  return text;
}

function showView(view, pushState = true) {
  if (pushState) {
    const path = view === VIEWS.FILES ? "/files" : view === VIEWS.REWRITE ? "/rewrite" : "/config";
    if (window.location.pathname !== path) {
      window.history.pushState({ view }, "", path);
    }
  }
  currentView = view;
  els.configView.hidden = view !== VIEWS.CONFIG;
  els.rewriteView.hidden = view !== VIEWS.REWRITE;
  els.filesView.hidden = view !== VIEWS.FILES;

  for (const button of els.navButtons) {
    button.classList.toggle('active', button.dataset.view === view);
  }
}

async function loadView(view) {
  showView(view);
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
  const isExistingProfile = Boolean(profile.name);
  const row = document.createElement('div');
  row.className = 'mapping-row';
  row.innerHTML = `
    <input data-field="name" type="text" ${isExistingProfile ? 'readonly' : ''}>
    <input data-field="originFile" type="text">
    <input data-field="outputFile" type="text">
    <input data-field="rewriteOutputFile" type="text">
    <button type="button">Remove</button>
  `;

  row.querySelector('[data-field="name"]').value = profile.name || '';
  row.querySelector('[data-field="originFile"]').value = profile.originFile || '';
  row.querySelector('[data-field="outputFile"]').value = profile.outputFile || '';
  row.querySelector('[data-field="rewriteOutputFile"]').value = profile.rewriteOutputFile || '';
  row.querySelector('button').addEventListener('click', () => row.remove());
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

async function loadConfig() {
  renderConfig(await requestJson('/api/config'));
}

function collectConfig() {
  const profiles = [...els.configRows.querySelectorAll('.mapping-row')].map((row) => ({
    name: row.querySelector('[data-field="name"]').value.trim(),
    originFile: row.querySelector('[data-field="originFile"]').value.trim(),
    outputFile: row.querySelector('[data-field="outputFile"]').value.trim(),
    rewriteOutputFile: row.querySelector('[data-field="rewriteOutputFile"]').value.trim(),
  }));

  return {
    profiles,
  };
}

function validateConfig(config) {
  const names = new Set();

  for (const [index, profile] of config.profiles.entries()) {
    if (!profile.name || !profile.originFile) {
      throw new Error(`Profile ${index + 1} is incomplete.`);
    }

    if (names.has(profile.name)) {
      throw new Error(`Profile "${profile.name}" is duplicated.`);
    }

    names.add(profile.name);
  }
}

function getConfigText() {
  const config = collectConfig();
  const lines = [`originDir: ${els.originDirInput.value.trim()}`, `outputDir: ${els.outputDirInput.value.trim()}`, 'profiles:'];

  for (const profile of config.profiles) {
    lines.push(`  - name: ${profile.name}`);
    lines.push(`    originFile: ${profile.originFile}`);
    if (profile.outputFile) {
      lines.push(`    outputFile: ${profile.outputFile}`);
    }
    if (profile.rewriteOutputFile) {
      lines.push(`    rewriteOutputFile: ${profile.rewriteOutputFile}`);
    }
  }

  return lines.join('\n');
}

async function saveConfig() {
  const config = collectConfig();
  validateConfig(config);
  setStatus('Saving config');
  await requestJson('/api/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
  notify('Config saved');
}

async function loadRewrite() {
  els.rewriteEditor.value = await requestText('/api/rewrite');
}

async function saveRewrite() {
  setStatus('Saving rewrite');
  await requestJson('/api/rewrite', {
    method: 'PUT',
    body: JSON.stringify({ content: els.rewriteEditor.value }),
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
  els.saveFileButton.hidden = selectedFileType !== FILE_TYPES.ORIGIN;
  els.copyFileNameButton.hidden = selectedFileType === FILE_TYPES.ORIGIN;
}

async function loadFiles() {
  configCache = await requestJson('/api/config');
  if (!configCache.profiles.some((profile) => profile.name === selectedProfileName)) {
    selectedProfileName = configCache.profiles[0]?.name || '';
  }
  renderProfiles(configCache.profiles);
  renderTabs();
  await loadSelectedFile();
}

async function loadSelectedFile() {
  if (!selectedProfileName) {
    els.previewSummary.textContent = 'No profiles configured';
    els.previewTitle.textContent = '';
    els.previewName.textContent = '';
    els.previewContent.textContent = '';
    return;
  }

  setStatus('Loading file');
  const params = new URLSearchParams({
    name: selectedProfileName,
    type: selectedFileType,
  });
  const file = await requestJson(`/api/file?${params.toString()}`);

  els.previewSummary.textContent = file.name;
  els.previewTitle.textContent = file.type[0].toUpperCase() + file.type.slice(1);
  els.previewName.textContent = file.fileName;
  const isOrigin = file.type === FILE_TYPES.ORIGIN;
  els.previewContent.hidden = isOrigin;
  els.previewEditor.hidden = !isOrigin;
  if (isOrigin) {
    els.previewEditor.value = file.content;
  } else {
    els.previewContent.textContent = file.content;
  }
  setStatus('Ready');
}

async function runRewrite() {
  setStatus('Running');
  els.runButton.disabled = true;

  try {
    await requestJson('/api/run', {
      method: 'POST',
      body: '{}',
    });

    if (currentView === VIEWS.FILES) {
      await loadSelectedFile();
    }

    notify('Rewrite complete');
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
  await requestJson('/api/file', {
    method: 'PUT',
    body: JSON.stringify({ name: selectedProfileName, type: FILE_TYPES.ORIGIN, content: els.previewEditor.value }),
  });
  setStatus('Ready');
  notify('Origin file saved');
}

window.addEventListener("popstate", (e) => {
  const view = e.state?.view || getViewFromPath();
  loadView(view).catch((error) => notify(error.message, "error"));
});

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
      loadSelectedFile().catch((error) => notify(error.message, 'error'));
    });
  }

  els.runButton.addEventListener('click', () => {
    runRewrite().catch((error) => notify(error.message, 'error'));
  });

  els.addConfigRowButton.addEventListener('click', () => appendConfigRow());
  els.saveConfigButton.addEventListener('click', () => saveConfig().catch((error) => notify(error.message, 'error')));
  els.saveRewriteButton.addEventListener('click', () => saveRewrite().catch((error) => notify(error.message, 'error')));
  els.copyConfigButton.addEventListener('click', () => {
    copyText(getConfigText())
      .then(() => notify('Config copied'))
      .catch((error) => notify(error.message, 'error'));
  });
  els.copyRewriteButton.addEventListener('click', () => {
    copyText(els.rewriteEditor.value)
      .then(() => notify('Rewrite copied'))
      .catch((error) => notify(error.message, 'error'));
  });
  els.copyPreviewButton.addEventListener('click', () => {
    copyText(selectedFileType === FILE_TYPES.ORIGIN ? els.previewEditor.value : els.previewContent.textContent)
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
const initialView = getViewFromPath();
if (initialView !== currentView) {
  showView(initialView, false);
}
loadView(initialView).catch((error) => notify(error.message, 'error'));
