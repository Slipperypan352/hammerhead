(() => {
  'use strict';

  const FIELDS = ['name', 'contact', 'status', 'meeting_day', 'meeting_time', 'frequency',
    'location', 'met_by', 'last_contact', 'next_followup', 'notes'];
  const DATE_FIELDS = ['last_contact', 'next_followup'];
  const STATUSES = ['New', 'Active', 'On hold', 'Inactive'];
  const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Varies'];
  const FREQS = ['', 'Weekly', 'Every 2 weeks', 'Monthly', 'As needed'];

  let sb = null;
  let people = [];
  let editingId = null;
  let userEmail = '';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    if (isNaN(h)) return t;
    return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
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
    if (kind === 'ok') setTimeout(() => { if (b.textContent === msg) b.className = ''; }, 4000);
  }
  const clearBanner = () => { $('banner').className = ''; };

  // ---------- Views ----------
  function showLogin() {
    $('appView').hidden = true;
    $('loginView').hidden = false;
    people = [];
  }
  async function showApp(session) {
    userEmail = session.user.email || '';
    $('loginView').hidden = true;
    $('appView').hidden = false;
    $('whoami').textContent = 'Signed in as ' + userEmail;
    await loadPeople();
  }

  // ---------- Data ----------
  function normalize(row) {
    const p = { ...row };
    FIELDS.forEach((f) => { if (p[f] == null) p[f] = ''; });
    if (p.meeting_time) p.meeting_time = String(p.meeting_time).slice(0, 5);
    return p;
  }

  async function loadPeople() {
    const { data, error } = await sb.from('people').select('*').order('name');
    if (error) { banner('Could not load data: ' + error.message, 'err'); return; }
    people = data.map(normalize);
    render();
  }

  function toPayload(obj) {
    const out = {};
    FIELDS.forEach((f) => {
      let v = obj[f];
      v = v == null ? '' : String(v);
      if (f !== 'notes') v = v.trim();
      if (f === 'name' || f === 'status') out[f] = v || (f === 'status' ? 'New' : v);
      else out[f] = v === '' ? null : v;
    });
    return out;
  }

  // ---------- CSV (backup / import) ----------
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = ''; rows.push(row); row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((v) => v.trim() !== ''));
  }

  function toCSV(list) {
    const q = (v) => {
      v = String(v ?? '');
      return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const lines = [FIELDS.join(',')];
    list.forEach((p) => lines.push(FIELDS.map((f) => q(p[f])).join(',')));
    return lines.join('\n') + '\n';
  }

  function exportCSV() {
    const blob = new Blob([toCSV(people)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `care-tracker-backup-${todayStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importCSV(file) {
    const rows = parseCSV(await file.text());
    if (rows.length < 2) { banner('That CSV has no rows to import.', 'err'); return; }
    const header = rows[0].map((h) => h.trim());
    if (!header.includes('name')) { banner('CSV must have a "name" column.', 'err'); return; }
    const records = rows.slice(1).map((r) => {
      const o = {};
      FIELDS.forEach((f) => { const i = header.indexOf(f); o[f] = i >= 0 ? (r[i] ?? '') : ''; });
      return toPayload(o);
    }).filter((o) => o.name);
    if (!records.length) { banner('No valid rows found.', 'err'); return; }
    if (!confirm(`Import ${records.length} ${records.length === 1 ? 'person' : 'people'}? They will be added to the existing list.`)) return;
    const { error } = await sb.from('people').insert(records);
    if (error) { banner('Import failed: ' + error.message, 'err'); return; }
    banner(`Imported ${records.length}.`, 'ok');
    await loadPeople();
  }

  // ---------- Render ----------
  function matches(p, q) {
    if (!q) return true;
    const hay = FIELDS.map((f) => p[f]).join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  }

  function render() {
    const q = $('search').value.trim();
    const st = $('filterStatus').value;
    const sort = $('sortBy').value;

    const list = people.filter((p) => matches(p, q) && (!st || p.status === st));
    list.sort((a, b) => {
      if (sort === 'followup') {
        const x = a.next_followup || '9999', y = b.next_followup || '9999';
        return x.localeCompare(y) || a.name.localeCompare(b.name);
      }
      if (sort === 'updated') return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
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

  // ---------- Person dialog ----------
  function fillSelect(sel, options, emptyLabel) {
    sel.innerHTML = options.map((o) => `<option value="${esc(o)}">${esc(o || emptyLabel || '—')}</option>`).join('');
  }

  function openPerson(id) {
    editingId = id || null;
    const form = $('personForm');
    const p = id ? people.find((x) => x.id === id) : null;
    $('dlgTitle').textContent = p ? 'Edit ' + p.name : 'Add person';
    $('deleteBtn').hidden = !p;
    FIELDS.forEach((f) => { form.elements[f].value = p ? (p[f] ?? '') : ''; });
    if (!p) form.elements.status.value = 'New';
    $('personDlg').showModal();
    if (!p) form.elements.name.focus();
  }

  async function submitPerson(e) {
    e.preventDefault();
    const form = e.target;
    const raw = {};
    FIELDS.forEach((f) => { raw[f] = form.elements[f].value; });
    const payload = toPayload(raw);
    const btn = $('savePersonBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const q = editingId
        ? sb.from('people').update(payload).eq('id', editingId)
        : sb.from('people').insert(payload);
      const { data, error } = await q.select().single();
      if (error) throw error;
      const row = normalize(data);
      const i = people.findIndex((x) => x.id === row.id);
      if (i >= 0) people[i] = row; else people.push(row);
      $('personDlg').close();
      render();
    } catch (err) {
      banner('Save failed: ' + (err.message || err), 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save entry';
    }
  }

  async function deletePerson() {
    const p = people.find((x) => x.id === editingId);
    if (!p) return;
    if (!confirm(`Delete ${p.name}? This cannot be undone.`)) return;
    const { error } = await sb.from('people').delete().eq('id', editingId);
    if (error) { banner('Delete failed: ' + error.message, 'err'); return; }
    people = people.filter((x) => x.id !== editingId);
    $('personDlg').close();
    render();
  }

  // ---------- Auth ----------
  async function login(e) {
    e.preventDefault();
    const f = e.target;
    const btn = $('loginBtn');
    btn.disabled = true;
    clearBanner();
    const { error } = await sb.auth.signInWithPassword({
      email: f.elements.email.value.trim(),
      password: f.elements.password.value
    });
    btn.disabled = false;
    if (error) banner(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message, 'err');
    else f.elements.password.value = '';
  }

  async function changePassword() {
    const pw = prompt('New password (at least 8 characters):');
    if (!pw) return;
    if (pw.length < 8) { banner('Password must be at least 8 characters.', 'err'); return; }
    const { error } = await sb.auth.updateUser({ password: pw });
    $('menuDlg').close();
    if (error) banner(error.message, 'err'); else banner('Password changed.', 'ok');
  }

  // ---------- Init ----------
  function init() {
    const cfg = window.CARE_CONFIG || {};
    if (!window.supabase || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR-PROJECT') ||
        !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.startsWith('YOUR-')) {
      banner('Not configured yet: edit config.js with your Supabase project URL and anon key (see SETUP.md).', 'err');
      return;
    }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

    fillSelect($('filterStatus'), ['', ...STATUSES], 'All statuses');
    fillSelect($('personForm').elements.status, STATUSES);
    fillSelect($('personForm').elements.meeting_day, DAYS, '—');
    fillSelect($('personForm').elements.frequency, FREQS, '—');

    $('loginForm').addEventListener('submit', login);
    $('search').addEventListener('input', render);
    $('filterStatus').addEventListener('change', render);
    $('sortBy').addEventListener('change', render);
    $('addBtn').addEventListener('click', () => openPerson(null));
    $('list').addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (card) openPerson(card.dataset.id);
    });
    $('personForm').addEventListener('submit', submitPerson);
    $('cancelBtn').addEventListener('click', () => $('personDlg').close());
    $('deleteBtn').addEventListener('click', deletePerson);

    $('menuBtn').addEventListener('click', () => $('menuDlg').showModal());
    $('exportBtn').addEventListener('click', exportCSV);
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) { $('menuDlg').close(); await importCSV(file); }
    });
    $('pwBtn').addEventListener('click', changePassword);
    $('signOutBtn').addEventListener('click', async () => { $('menuDlg').close(); await sb.auth.signOut(); });

    sb.auth.onAuthStateChange((event, session) => {
      // Defer to avoid deadlocks inside the auth callback
      setTimeout(() => {
        if (session) {
          // Ignore token refreshes and tab-refocus sign-ins when already showing the app
          if (!$('appView').hidden && session.user.email === userEmail) return;
          clearBanner();
          showApp(session);
        } else showLogin();
      }, 0);
    });
  }

  init();
})();
