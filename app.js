(() => {
  'use strict';

  // ---------- Config ----------
  const COLUMNS = ['id', 'name', 'contact', 'status', 'meeting_day', 'meeting_time', 'frequency',
    'location', 'met_by', 'last_contact', 'next_followup', 'notes', 'updated'];
  const STATUSES = ['New', 'Active', 'On hold', 'Inactive'];
  const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Varies'];
  const FREQS = ['', 'Weekly', 'Every 2 weeks', 'Monthly', 'As needed'];
  const DRAFT_KEY = 'caretracker.draft.v1';
  const SETTINGS_KEY = 'caretracker.settings.v1';

  // ---------- State ----------
  let people = [];
  let dirty = false;
  let editingId = null;

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    if (isNaN(h)) return t;
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${ap}`;
  }
  function fmtDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-').map(Number);
    if (!y) return d;
    return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function banner(msg, kind) {
    const b = $('banner');
    b.textContent = msg;
    b.className = 'show' + (kind ? ' ' + kind : '');
    if (kind === 'ok') setTimeout(() => { if (b.textContent === msg) b.className = ''; }, 5000);
  }
  function clearBanner() { $('banner').className = ''; }

  // ---------- CSV ----------
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((v) => v.trim() !== ''));
  }

  function csvToPeople(text) {
    const rows = parseCSV(text);
    if (!rows.length) return [];
    const header = rows[0].map((h) => h.trim());
    return rows.slice(1).map((r) => {
      const p = {};
      COLUMNS.forEach((col) => {
        const idx = header.indexOf(col);
        p[col] = idx >= 0 ? (r[idx] ?? '') : '';
      });
      if (!p.id) p.id = newId();
      return p;
    });
  }

  function peopleToCSV(list) {
    const q = (v) => {
      v = String(v ?? '');
      return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const lines = [COLUMNS.join(',')];
    list.forEach((p) => lines.push(COLUMNS.map((c) => q(p[c])).join(',')));
    return lines.join('\n') + '\n';
  }

  // ---------- Settings ----------
  function defaultSettings() {
    const s = { owner: '', repo: '', branch: 'main', path: 'data.csv', token: '' };
    const host = location.hostname;
    if (host.endsWith('.github.io')) {
      s.owner = host.split('.')[0];
      s.repo = location.pathname.split('/').filter(Boolean)[0] || host;
    }
    return s;
  }
  function loadSettings() {
    try {
      return { ...defaultSettings(), ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    } catch { return defaultSettings(); }
  }
  function storeSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }

  // ---------- Draft (local safety net) ----------
  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(people)); } catch { /* ignore */ }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }
  function loadDraft() {
    try {
      const d = localStorage.getItem(DRAFT_KEY);
      return d ? JSON.parse(d) : null;
    } catch { return null; }
  }

  function markDirty() {
    dirty = true;
    $('saveBtn').disabled = false;
    saveDraft();
  }

  // ---------- Load ----------
  async function load() {
    let remote = null;
    try {
      const res = await fetch('data.csv?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      remote = csvToPeople(await res.text());
    } catch (e) {
      banner('Could not load data.csv (' + e.message + '). If you opened index.html directly from your computer, ' +
        'browsers block this — use the GitHub Pages link or run a local server.', 'err');
    }

    const draft = loadDraft();
    if (draft && draft.length && (!remote || JSON.stringify(draft) !== JSON.stringify(remote))) {
      people = draft;
      dirty = true;
      $('saveBtn').disabled = false;
      banner('Showing unsaved changes from this browser. Press Save to publish them, or use the CSV button to download a copy.');
    } else {
      people = remote || [];
    }
    render();
  }

  // ---------- Save ----------
  function b64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  async function saveToGitHub(s) {
    const base = `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${s.path.split('/').map(encodeURIComponent).join('/')}`;
    const headers = {
      Authorization: 'Bearer ' + s.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    let sha;
    const get = await fetch(`${base}?ref=${encodeURIComponent(s.branch)}`, { headers, cache: 'no-store' });
    if (get.ok) sha = (await get.json()).sha;
    else if (get.status !== 404) throw new Error(`Could not read file (HTTP ${get.status}). Check owner, repo, branch and token.`);

    const body = {
      message: 'Update care tracker data',
      content: b64(peopleToCSV(people)),
      branch: s.branch
    };
    if (sha) body.sha = sha;
    const put = await fetch(base, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!put.ok) {
      let detail = '';
      try { detail = (await put.json()).message; } catch { /* ignore */ }
      throw new Error(`Save failed (HTTP ${put.status}) ${detail}`);
    }
  }

  function downloadCSV() {
    const blob = new Blob([peopleToCSV(people)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function save() {
    const s = loadSettings();
    if (!s.token || !s.owner || !s.repo) {
      downloadCSV();
      banner('No GitHub token set, so a data.csv file was downloaded instead. Upload it to your repo to publish the changes ' +
        '(or add a token under ⚙ to save directly).');
      return;
    }
    const btn = $('saveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await saveToGitHub(s);
      dirty = false;
      clearDraft();
      banner('Saved to GitHub. The live site can take a minute or two to show the update.', 'ok');
    } catch (e) {
      btn.disabled = false;
      banner(e.message, 'err');
    } finally {
      btn.textContent = 'Save';
      if (!dirty) btn.disabled = true;
    }
  }

  // ---------- Render ----------
  function matches(p, q) {
    if (!q) return true;
    const hay = COLUMNS.filter((c) => c !== 'id').map((c) => p[c]).join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  }

  function render() {
    const q = $('search').value.trim();
    const st = $('filterStatus').value;
    const sort = $('sortBy').value;

    let list = people.filter((p) => matches(p, q) && (!st || p.status === st));
    list.sort((a, b) => {
      if (sort === 'followup') {
        const x = a.next_followup || '9999', y = b.next_followup || '9999';
        return x.localeCompare(y) || a.name.localeCompare(b.name);
      }
      if (sort === 'updated') return (b.updated || '').localeCompare(a.updated || '');
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    $('count').textContent = `${list.length} of ${people.length} ${people.length === 1 ? 'person' : 'people'}`;

    if (!list.length) {
      $('list').innerHTML = `<div class="empty">${people.length ? 'No matches.' : 'No one added yet. Press “+ Add person” to start.'}</div>`;
      return;
    }

    const today = todayStr();
    $('list').innerHTML = list.map((p) => {
      const sched = [p.meeting_day, fmtTime(p.meeting_time), p.frequency].filter(Boolean).join(' · ');
      const overdue = p.next_followup && p.next_followup < today && p.status !== 'Inactive';
      const bits = [];
      if (sched) bits.push(`<strong>Meeting:</strong> ${esc(sched)}`);
      if (p.location) bits.push(`<strong>Where:</strong> ${esc(p.location)}`);
      if (p.met_by) bits.push(`<strong>With:</strong> ${esc(p.met_by)}`);
      const dates = [];
      if (p.last_contact) dates.push(`Last contact ${esc(fmtDate(p.last_contact))}`);
      if (p.next_followup) dates.push(`<span class="${overdue ? 'overdue' : ''}">Follow up ${esc(fmtDate(p.next_followup))}${overdue ? ' (overdue)' : ''}</span>`);
      return `<div class="card" data-id="${esc(p.id)}">
        <div class="row1"><span class="name">${esc(p.name)}</span><span class="badge ${esc(p.status)}">${esc(p.status || 'No status')}</span></div>
        ${bits.length ? `<div class="meta">${bits.join(' &nbsp;|&nbsp; ')}</div>` : ''}
        ${dates.length ? `<div class="meta">${dates.join(' &nbsp;|&nbsp; ')}</div>` : ''}
        ${p.contact ? `<div class="meta">${esc(p.contact)}</div>` : ''}
        ${p.notes ? `<div class="notes">${esc(p.notes.length > 220 ? p.notes.slice(0, 220) + '…' : p.notes)}</div>` : ''}
      </div>`;
    }).join('');
  }

  // ---------- Dialogs ----------
  function fillSelect(sel, options, emptyLabel) {
    sel.innerHTML = options.map((o) => `<option value="${esc(o)}">${esc(o || emptyLabel || '—')}</option>`).join('');
  }

  function openPerson(id) {
    editingId = id || null;
    const form = $('personForm');
    const p = id ? people.find((x) => x.id === id) : null;
    $('dlgTitle').textContent = p ? 'Edit ' + p.name : 'Add person';
    $('deleteBtn').style.display = p ? '' : 'none';
    COLUMNS.forEach((c) => {
      if (form.elements[c]) form.elements[c].value = p ? (p[c] ?? '') : '';
    });
    if (!p) form.elements.status.value = 'New';
    $('personDlg').showModal();
    if (!p) form.elements.name.focus();
  }

  function submitPerson(e) {
    e.preventDefault();
    const form = e.target;
    const data = {};
    COLUMNS.forEach((c) => { if (form.elements[c]) data[c] = form.elements[c].value.trim(); });
    // notes: keep internal line breaks, only trim ends
    data.notes = form.elements.notes.value.replace(/\s+$/, '');
    data.updated = todayStr();
    if (editingId) {
      const i = people.findIndex((x) => x.id === editingId);
      people[i] = { ...people[i], ...data, id: editingId };
    } else {
      people.push({ ...data, id: newId() });
    }
    $('personDlg').close();
    markDirty();
    render();
  }

  function deletePerson() {
    const p = people.find((x) => x.id === editingId);
    if (!p) return;
    if (!confirm(`Delete ${p.name}? This can't be undone once saved.`)) return;
    people = people.filter((x) => x.id !== editingId);
    $('personDlg').close();
    markDirty();
    render();
  }

  function openSettings() {
    const s = loadSettings();
    const f = $('settingsForm');
    ['owner', 'repo', 'branch', 'path', 'token'].forEach((k) => { f.elements[k].value = s[k] || ''; });
    $('settingsDlg').showModal();
  }
  function submitSettings(e) {
    e.preventDefault();
    const f = e.target;
    const s = {};
    ['owner', 'repo', 'branch', 'path', 'token'].forEach((k) => { s[k] = f.elements[k].value.trim(); });
    s.branch = s.branch || 'main';
    s.path = s.path || 'data.csv';
    storeSettings(s);
    $('settingsDlg').close();
    banner('Settings saved in this browser.', 'ok');
  }

  // ---------- Init ----------
  function init() {
    fillSelect($('filterStatus'), ['', ...STATUSES], 'All statuses');
    fillSelect($('personForm').elements.status, STATUSES);
    fillSelect($('personForm').elements.meeting_day, DAYS, '—');
    fillSelect($('personForm').elements.frequency, FREQS, '—');

    $('search').addEventListener('input', render);
    $('filterStatus').addEventListener('change', render);
    $('sortBy').addEventListener('change', render);
    $('addBtn').addEventListener('click', () => openPerson(null));
    $('saveBtn').addEventListener('click', save);
    $('downloadBtn').addEventListener('click', downloadCSV);
    $('settingsBtn').addEventListener('click', openSettings);
    $('list').addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (card) openPerson(card.dataset.id);
    });
    $('personForm').addEventListener('submit', submitPerson);
    $('cancelBtn').addEventListener('click', () => $('personDlg').close());
    $('deleteBtn').addEventListener('click', deletePerson);
    $('settingsForm').addEventListener('submit', submitSettings);
    $('settingsCancel').addEventListener('click', () => $('settingsDlg').close());
    $('clearTokenBtn').addEventListener('click', () => {
      const s = loadSettings(); s.token = ''; storeSettings(s);
      $('settingsForm').elements.token.value = '';
      banner('Token removed from this browser.', 'ok');
    });
    window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

    load();
  }

  init();
})();
