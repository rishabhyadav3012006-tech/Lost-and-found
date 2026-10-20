/* ═══════════════════════════════════════════════════
   ReUnite AI – Frontend JavaScript Application
   Pure Vanilla JS SPA (no frameworks needed)
   ═══════════════════════════════════════════════════ */

const API = window.__API_URL__ || localStorage.getItem('reunite_api_url') || '/api';
const UPLOADS_BASE = window.__UPLOADS_URL__ || localStorage.getItem('reunite_uploads_url') || '/uploads/photos';
let currentUser = null;
let authToken = localStorage.getItem('reunite_token') || null;
let filterDebounceTimer = null;
let currentPage = 1;

// ═══════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════

function apiHeaders(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (authToken) h['Authorization'] = `Bearer ${authToken}`;
  return h;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: authToken
      ? { 'Authorization': `Bearer ${authToken}`, ...options.headers }
      : options.headers,
  });
  if (res.status === 204) return null;
  return readApiResponse(res);
}

// Parses a JSON API response, turning non-JSON replies (e.g. an HTML error page)
// into a readable error instead of a JSON syntax error.
async function readApiResponse(res, fallbackMsg = 'Request failed') {
  const data = await res.json().catch(() => null);
  if (!res.ok || data === null) {
    const detail = data?.detail;
    const msg = typeof detail === 'string' ? detail
      : Array.isArray(detail) ? detail.map(d => d.msg || String(d)).join(', ')
      : data === null ? `Server unavailable (HTTP ${res.status}). Please try again later.`
      : fallbackMsg;
    throw new Error(msg);
  }
  return data;
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { info: 'ℹ️', success: '✅', error: '❌' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function showModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-content').innerHTML = '';
}

function setLoading(btnId, loading, text = '') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) btn.dataset.origText = btn.textContent;
  btn.textContent = loading ? (text || 'Please wait…') : (btn.dataset.origText || btn.textContent);
}

function formatDate(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function capitalize(str) {
  if (!str) return '–';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function ageRange(min, max) {
  if (!min && !max) return '–';
  if (min && max) return `${min}–${max} yrs`;
  return `${min || max} yrs`;
}

function scoreClass(score) {
  if (score >= 0.65) return 'score-high';
  if (score >= 0.45) return 'score-medium';
  return 'score-low';
}

function photoUrl(filename) {
  if (!filename) return '';
  if (filename.startsWith('http://') || filename.startsWith('https://')) return filename;
  return `${UPLOADS_BASE}/${filename}`;
}

// ═══════════════════════════════════════════════════
// ROUTING / PAGE MANAGEMENT
// ═══════════════════════════════════════════════════

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(`page-${name}`);
  if (!page) return;
  page.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  onPageLoad(name);
}

function onPageLoad(name) {
  if (name === 'home') loadHomeStats();
  if (name === 'reports') { currentPage = 1; loadReports(); }
  if (name === 'report-missing') renderReportForm('missing');
  if (name === 'report-found') renderReportForm('found');
  if (name === 'dashboard') {
    if (!currentUser) { showPage('login'); return; }
    loadDashboard();
  }
  if (name === 'admin') {
    if (!currentUser?.is_admin) { showPage('home'); return; }
    loadAdminStats();
    loadAdminMatches();
    loadAdminPendingReports();
    loadAdminUsers();
  }
}

function toggleMenu() {
  document.getElementById('nav-links').classList.toggle('open');
}

// ═══════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════

async function initAuth() {
  if (!authToken) return updateAuthUI(null);
  try {
    currentUser = await apiFetch('/auth/me');
    updateAuthUI(currentUser);
  } catch {
    authToken = null;
    localStorage.removeItem('reunite_token');
    updateAuthUI(null);
  }
}

function updateAuthUI(user) {
  const container = document.getElementById('auth-nav-links');
  if (user) {
    container.innerHTML = `
      <a href="#" class="nav-link" onclick="showPage('dashboard')">Dashboard</a>
      ${user.is_admin ? `<a href="#" class="nav-link" onclick="showPage('admin')">Admin</a>` : ''}
      <a href="#" class="nav-link btn-primary-nav" onclick="logout()">Sign Out</a>
    `;
  } else {
    container.innerHTML = `<a href="#" class="nav-link btn-primary-nav" onclick="showPage('login')">Sign In</a>`;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  setLoading('login-btn', true, 'Signing in…');
  document.getElementById('login-error').classList.add('hidden');
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  try {
    const form = new FormData();
    form.append('username', email);
    form.append('password', password);
    const res = await fetch(API + '/auth/login', { method: 'POST', body: form });
    const data = await readApiResponse(res, 'Login failed');
    authToken = data.access_token;
    localStorage.setItem('reunite_token', authToken);
    currentUser = data.user;
    updateAuthUI(currentUser);
    showToast('Welcome back, ' + currentUser.full_name + '!', 'success');
    showPage('dashboard');
  } catch (err) {
    const errEl = document.getElementById('login-error');
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    setLoading('login-btn', false);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  setLoading('register-btn', true, 'Creating account…');
  document.getElementById('register-error').classList.add('hidden');
  try {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: document.getElementById('reg-name').value,
        email: document.getElementById('reg-email').value,
        phone: document.getElementById('reg-phone').value || null,
        password: document.getElementById('reg-password').value,
      }),
    });
    authToken = data.access_token;
    localStorage.setItem('reunite_token', authToken);
    currentUser = data.user;
    updateAuthUI(currentUser);
    showToast('Account created! Welcome, ' + currentUser.full_name, 'success');
    showPage('dashboard');
  } catch (err) {
    const errEl = document.getElementById('register-error');
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    setLoading('register-btn', false);
  }
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('reunite_token');
  updateAuthUI(null);
  showToast('Signed out', 'info');
  showPage('home');
}

// ═══════════════════════════════════════════════════
// HOME PAGE
// ═══════════════════════════════════════════════════

async function loadHomeStats() {
  try {
    const [missing, found] = await Promise.all([
      apiFetch('/reports/?report_type=missing&page_size=1'),
      apiFetch('/reports/?report_type=found&page_size=1'),
    ]);
    const total = (missing?.total || 0) + (found?.total || 0);
    document.getElementById('stat-total').textContent = total.toLocaleString();
    document.getElementById('stat-matches').textContent = '–';
    document.getElementById('stat-reunited').textContent = '–';
  } catch (e) {
    console.warn('Stats load failed', e);
  }
  loadHomeRecentReports();
}

async function loadHomeRecentReports() {
  const grid = document.getElementById('home-reports-grid');
  try {
    const data = await apiFetch('/reports/?page_size=6');
    if (!data.items.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>No reports yet — be the first to submit one.</p></div>`;
      return;
    }
    grid.innerHTML = data.items.map(renderReportCard).join('');
  } catch (e) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Could not load reports.</p></div>`;
  }
}

// ═══════════════════════════════════════════════════
// REPORTS BROWSE
// ═══════════════════════════════════════════════════

let filterDebounce = null;

function debounceFilter() {
  clearTimeout(filterDebounce);
  filterDebounce = setTimeout(() => { currentPage = 1; loadReports(); }, 400);
}

function filterReports() {
  currentPage = 1;
  loadReports();
}

function clearFilters() {
  document.getElementById('filter-type').value = '';
  document.getElementById('filter-gender').value = '';
  document.getElementById('filter-search').value = '';
  currentPage = 1;
  loadReports();
}

async function loadReports() {
  const grid = document.getElementById('reports-grid');
  const countEl = document.getElementById('reports-count');
  const paginationEl = document.getElementById('reports-pagination');
  grid.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading…</p></div>';

  const type = document.getElementById('filter-type')?.value || '';
  const gender = document.getElementById('filter-gender')?.value || '';
  const search = document.getElementById('filter-search')?.value || '';
  const pageSize = 12;

  let url = `/reports/?page=${currentPage}&page_size=${pageSize}`;
  if (type) url += `&report_type=${type}`;
  if (gender) url += `&gender=${gender}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  try {
    const data = await apiFetch(url);
    countEl.textContent = `${data.total} report${data.total !== 1 ? 's' : ''} found`;

    if (!data.items.length) {
      grid.innerHTML = `<div class="empty-state"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><h3>No reports found</h3><p>Try adjusting your filters.</p></div>`;
      paginationEl.innerHTML = '';
      return;
    }

    grid.innerHTML = data.items.map(renderReportCard).join('');
    renderPagination(data.total, data.pages, paginationEl);
  } catch (e) {
    grid.innerHTML = `<div class="empty-state"><p>Error loading reports: ${e.message}</p></div>`;
  }
}

function renderPagination(total, pages, container) {
  if (pages <= 1) { container.innerHTML = ''; return; }
  let html = `<button class="page-btn" onclick="gotoPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>&laquo; Prev</button>`;
  for (let i = 1; i <= pages; i++) {
    if (pages > 7 && Math.abs(i - currentPage) > 2 && i !== 1 && i !== pages) {
      if (i === 2 || i === pages - 1) html += `<span class="page-btn" style="cursor:default">…</span>`;
      continue;
    }
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="gotoPage(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" onclick="gotoPage(${currentPage + 1})" ${currentPage === pages ? 'disabled' : ''}>Next &raquo;</button>`;
  container.innerHTML = html;
}

function gotoPage(n) {
  currentPage = n;
  loadReports();
  document.querySelector('#page-reports .page-container')?.scrollIntoView({ behavior: 'smooth' });
}

function renderReportCard(r) {
  const photo = r.photos?.[0];
  const photoHtml = photo
    ? `<img src="${photoUrl(photo.filename)}" alt="Photo" class="report-card-photo" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="report-card-photo-placeholder" style="display:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>`
    : `<div class="report-card-photo-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>`;

  const typeLabel = r.report_type === 'missing' ? '🔍 Missing' : '🙋 Found';
  const typeClass = r.report_type === 'missing' ? 'type-missing' : 'type-found';

  return `
    <div class="report-card" onclick="viewReport(${r.id})" tabindex="0" role="button" aria-label="View report ${r.id}">
      ${photoHtml}
      <div class="report-card-body">
        <span class="report-card-type ${typeClass}">${typeLabel}</span>
        <div class="report-card-name">${r.person_name || 'Unknown name'}</div>
        <div class="report-card-meta">
          ${r.gender !== 'unknown' ? `<span class="meta-chip">${capitalize(r.gender)}</span>` : ''}
          ${(r.approximate_age_min || r.approximate_age_max) ? `<span class="meta-chip">${ageRange(r.approximate_age_min, r.approximate_age_max)}</span>` : ''}
        </div>
        ${r.location_description ? `<div class="report-card-location"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${r.location_description}</div>` : ''}
        <div class="report-card-date">${formatDate(r.created_at)}</div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════
// REPORT DETAIL
// ═══════════════════════════════════════════════════

async function viewReport(id) {
  showPage('report-detail');
  const container = document.getElementById('report-detail-content');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading report…</p></div>';
  try {
    const r = await apiFetch(`/reports/${id}`);
    renderReportDetail(r, container);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><h3>Report not found</h3><p>${e.message}</p><button class="btn btn-outline" onclick="showPage('reports')">← Back to Reports</button></div>`;
  }
}

function renderReportDetail(r, container) {
  const isOwner = currentUser && currentUser.id === r.submitter_id;
  const isAdmin = currentUser?.is_admin;

  const photosHtml = r.photos?.length
    ? `<img src="${photoUrl(r.photos[0].filename)}" alt="Report photo" class="report-detail-photo-main" onerror="this.src=''" />`
    : `<div class="report-detail-photo-main" style="display:flex;align-items:center;justify-content:center;background:var(--bg-input);color:var(--text-muted)"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>`;

  const typeClass = r.report_type === 'missing' ? 'type-missing missing-badge' : 'type-found found-badge';
  const typeLabel = r.report_type === 'missing' ? '🔍 Missing Person' : '🙋 Found Person';

  container.innerHTML = `
    <a href="#" onclick="showPage('reports')" class="btn btn-outline" style="margin-bottom:24px">← Back to Reports</a>
    
    <div class="report-type-badge ${typeClass}">${typeLabel}</div>
    <h1 style="margin-bottom:8px">${r.person_name || 'Unknown Name'}</h1>
    <div style="margin-bottom:24px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <span class="status-badge status-${r.status}">${capitalize(r.status)}</span>
      <span style="color:var(--text-muted);font-size:0.85rem">Filed ${formatDate(r.created_at)}</span>
    </div>

    <div class="report-detail-header">
      <div class="report-detail-photos">${photosHtml}</div>
      <div class="report-detail-info">
        <div class="detail-grid">
          <div class="detail-item"><div class="report-detail-label">Age Range</div><div class="report-detail-value">${ageRange(r.approximate_age_min, r.approximate_age_max)}</div></div>
          <div class="detail-item"><div class="report-detail-label">Gender</div><div class="report-detail-value">${capitalize(r.gender)}</div></div>
          <div class="detail-item"><div class="report-detail-label">Height</div><div class="report-detail-value">${r.height_cm_min || r.height_cm_max ? `${r.height_cm_min||'?'}–${r.height_cm_max||'?'} cm` : '–'}</div></div>
          <div class="detail-item"><div class="report-detail-label">Build</div><div class="report-detail-value">${r.build || '–'}</div></div>
          <div class="detail-item"><div class="report-detail-label">Hair</div><div class="report-detail-value">${r.hair_color || '–'}</div></div>
          <div class="detail-item"><div class="report-detail-label">Eyes</div><div class="report-detail-value">${r.eye_color || '–'}</div></div>
          <div class="detail-item"><div class="report-detail-label">Skin Tone</div><div class="report-detail-value">${r.skin_tone || '–'}</div></div>
          <div class="detail-item"><div class="report-detail-label">Last Seen</div><div class="report-detail-value">${formatDate(r.incident_date)}</div></div>
        </div>
        ${r.location_description ? `<div><div class="report-detail-label">Location</div><div class="report-detail-value">📍 ${r.location_description}</div></div>` : ''}
        ${r.clothing_description ? `<div><div class="report-detail-label">Clothing</div><div class="report-detail-value">${r.clothing_description}</div></div>` : ''}
        ${r.distinguishing_features ? `<div><div class="report-detail-label">Distinguishing Features</div><div class="report-detail-value">${r.distinguishing_features}</div></div>` : ''}
      </div>
    </div>

    ${r.additional_info ? `<div class="card" style="margin-bottom:24px"><div class="report-detail-label">Additional Information</div><p style="margin-top:8px;color:var(--text-secondary)">${r.additional_info}</p></div>` : ''}

    ${(r.contact_name || r.contact_email || r.contact_phone) && currentUser ? `
    <div class="card" style="margin-bottom:24px;border-color:rgba(124,58,237,0.3)">
      <h3 style="margin-bottom:12px">Contact Information</h3>
      ${r.contact_name ? `<p><strong>Name:</strong> ${r.contact_name}</p>` : ''}
      ${r.contact_phone ? `<p><strong>Phone:</strong> <a href="tel:${r.contact_phone}">${r.contact_phone}</a></p>` : ''}
      ${r.contact_email ? `<p><strong>Email:</strong> <a href="mailto:${r.contact_email}">${r.contact_email}</a></p>` : ''}
    </div>` : currentUser ? '' : `<div class="card" style="margin-bottom:24px;background:rgba(124,58,237,0.08);border-color:rgba(124,58,237,0.2)"><p>🔒 <a href="#" onclick="showPage('login')">Sign in</a> to view contact information for this report.</p></div>`}

    ${(isOwner || isAdmin) ? `
    <div style="display:flex;gap:12px;margin-bottom:32px;flex-wrap:wrap">
      ${isOwner ? `<button class="btn btn-primary" onclick="showEditModal(${r.id})">✏️ Edit Report</button>` : ''}
      ${isOwner ? `<button class="btn btn-danger" onclick="deleteReport(${r.id})">🗑️ Delete</button>` : ''}
      ${isAdmin ? `<button class="btn btn-success" onclick="adminCloseReport(${r.id}, 'reunited')">🎉 Mark Reunited</button>` : ''}
      ${isAdmin ? `<button class="btn btn-secondary" onclick="adminCloseReport(${r.id}, 'closed')">Close Report</button>` : ''}
    </div>` : ''}

    <div class="matches-section">
      <h2 style="margin-bottom:8px">Potential Matches</h2>
      <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:24px">
        ⚠️ These are AI-suggested similarities only. A match score does not confirm identity. 
        Human verification is required before any action is taken.
      </p>
      <div id="report-matches-${r.id}">
        <div class="loading-spinner"><div class="spinner"></div><p>Loading matches…</p></div>
      </div>
    </div>
  `;

  loadReportMatches(r.id);
}

async function loadReportMatches(reportId) {
  const container = document.getElementById(`report-matches-${reportId}`);
  if (!container) return;
  if (!currentUser) {
    container.innerHTML = `<div class="card" style="background:rgba(124,58,237,0.08);border-color:rgba(124,58,237,0.2)"><p>🔒 <a href="#" onclick="showPage('login')">Sign in</a> to see potential matches.</p></div>`;
    return;
  }
  try {
    const data = await apiFetch('/matches/?page_size=100');
    const relevantMatches = data.items.filter(
      m => m.missing_report_id === reportId || m.found_report_id === reportId
    );
    if (!relevantMatches.length) {
      container.innerHTML = `<div class="empty-state"><p style="color:var(--text-secondary)">No potential matches found yet. The system checks continuously as new reports are filed.</p></div>`;
      return;
    }
    container.innerHTML = relevantMatches.map(m => {
      const other = m.missing_report_id === reportId ? m.found_report : m.missing_report;
      const pct = Math.round(m.score * 100);
      const sc = scoreClass(m.score);
      return `<div class="match-card">
        <div class="match-score-badge ${sc}">
          <span>${pct}%</span>
          <span style="font-size:0.65rem;font-weight:500">match</span>
        </div>
        <div style="flex:1">
          <div style="font-weight:700;margin-bottom:4px">${other?.person_name || 'Unknown'} 
            <span class="status-badge status-${m.status}" style="margin-left:8px">${m.status}</span>
          </div>
          <div style="color:var(--text-secondary);font-size:0.85rem">
            ${other?.gender !== 'unknown' ? capitalize(other?.gender) + ' · ' : ''}
            ${ageRange(other?.approximate_age_min, other?.approximate_age_max)} · 
            ${other?.location_description || 'Unknown location'}
          </div>
          <div style="margin-top:12px;display:flex;gap:8px">
            <button class="btn btn-sm btn-outline" onclick="viewReport(${other?.id})">View Report</button>
            ${currentUser ? `
            <button class="btn btn-sm btn-success" onclick="updateMatchStatus(${m.id},'confirmed')">✓ Confirm</button>
            <button class="btn btn-sm btn-danger" onclick="updateMatchStatus(${m.id},'rejected')">✗ Reject</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<p style="color:var(--text-muted)">Could not load matches.</p>`;
  }
}

async function updateMatchStatus(matchId, status) {
  try {
    await apiFetch(`/matches/${matchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    showToast(`Match marked as ${status}`, 'success');
    // Refresh just the matches section without full page reload
    const detail = document.getElementById('page-report-detail');
    if (detail?.classList.contains('active')) {
      const container = document.getElementById('report-detail-content');
      const activeReportId = container?.querySelector('[id^="report-matches-"]')?.id?.replace('report-matches-', '');
      if (activeReportId) loadReportMatches(parseInt(activeReportId));
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════
// REPORT SUBMISSION FORM
// ═══════════════════════════════════════════════════

function renderReportForm(type) {
  const containerId = type === 'missing' ? 'report-form-missing' : 'report-form-found';
  const container = document.getElementById(containerId);
  const isMissing = type === 'missing';

  container.innerHTML = `
    <form id="submit-report-form" onsubmit="handleReportSubmit(event,'${type}')">
      
      <div class="form-section">
        <div class="form-section-title">Person Information</div>
        <div class="form-grid">
          <div class="form-group">
            <label for="f-name">${isMissing ? 'Full Name' : 'Name (if known)'}</label>
            <input type="text" id="f-name" class="form-control" placeholder="${isMissing ? 'Enter full name' : 'If unknown, leave blank'}" />
          </div>
          <div class="form-group">
            <label for="f-gender">Gender</label>
            <select id="f-gender" class="form-control">
              <option value="unknown">Unknown / Not specified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label for="f-age-min">Approximate Age – From</label>
            <input type="number" id="f-age-min" class="form-control" min="0" max="120" placeholder="e.g. 30" />
          </div>
          <div class="form-group">
            <label for="f-age-max">Approximate Age – To</label>
            <input type="number" id="f-age-max" class="form-control" min="0" max="120" placeholder="e.g. 40" />
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Physical Description</div>
        <div class="form-grid">
          <div class="form-group">
            <label for="f-height-min">Height (cm) – Min</label>
            <input type="number" id="f-height-min" class="form-control" min="50" max="250" placeholder="e.g. 160" />
          </div>
          <div class="form-group">
            <label for="f-height-max">Height (cm) – Max</label>
            <input type="number" id="f-height-max" class="form-control" min="50" max="250" placeholder="e.g. 175" />
          </div>
          <div class="form-group">
            <label for="f-build">Build</label>
            <select id="f-build" class="form-control">
              <option value="">Not specified</option>
              <option value="slim">Slim</option>
              <option value="medium">Medium</option>
              <option value="heavy">Heavy</option>
              <option value="muscular">Muscular</option>
            </select>
          </div>
          <div class="form-group">
            <label for="f-skin">Skin Tone</label>
            <select id="f-skin" class="form-control">
              <option value="">Not specified</option>
              <option value="fair">Fair</option>
              <option value="medium">Medium/Wheatish</option>
              <option value="dark">Dark</option>
              <option value="very dark">Very Dark</option>
            </select>
          </div>
          <div class="form-group">
            <label for="f-hair">Hair Color</label>
            <input type="text" id="f-hair" class="form-control" placeholder="e.g. Black, Grey, Brown" />
          </div>
          <div class="form-group">
            <label for="f-eyes">Eye Color</label>
            <input type="text" id="f-eyes" class="form-control" placeholder="e.g. Brown, Black" />
          </div>
        </div>
        <div class="form-group">
          <label for="f-features">Distinguishing Features</label>
          <textarea id="f-features" class="form-control" placeholder="e.g. scar on left cheek, mole above lip, tattoo on right arm…"></textarea>
        </div>
        <div class="form-group">
          <label for="f-clothing">Clothing When ${isMissing ? 'Last Seen' : 'Found'}</label>
          <textarea id="f-clothing" class="form-control" placeholder="e.g. blue denim jeans, white shirt, black sandals…"></textarea>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Location & Time</div>
        <div class="form-group">
          <label for="f-location">${isMissing ? 'Last Seen Location' : 'Location Found'}</label>
          <input type="text" id="f-location" class="form-control" placeholder="e.g. Connaught Place, New Delhi" />
        </div>
        <div class="form-group">
          <label for="f-date">${isMissing ? 'Date Last Seen' : 'Date Found'}</label>
          <input type="date" id="f-date" class="form-control" max="${new Date().toISOString().split('T')[0]}" />
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Photos</div>
        <div class="photo-upload-zone" id="photo-drop-zone">
          <input type="file" id="f-photos" accept="image/*" multiple onchange="previewPhotos(this)" />
          <div class="upload-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          </div>
          <div class="upload-text">Click to upload or drag & drop photos</div>
          <div class="upload-hint">JPEG, PNG or WebP · Max 5 MB each</div>
        </div>
        <div id="photo-previews" class="photo-previews"></div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Additional Information</div>
        <div class="form-group">
          <label for="f-info">Any other relevant details</label>
          <textarea id="f-info" class="form-control" rows="4" placeholder="${isMissing ? 'Medical conditions, usual routes, habits, last known activity…' : 'Circumstances found, any items found with the person, current location of the person…'}"></textarea>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Contact Details (Private)</div>
        <p style="color:var(--text-secondary);font-size:0.875rem;margin-bottom:16px">Your contact details are only shown to verified users and are not publicly visible.</p>
        <div class="form-grid">
          <div class="form-group">
            <label for="f-cname">Your Name *</label>
            <input type="text" id="f-cname" class="form-control" required placeholder="Full name" />
          </div>
          <div class="form-group">
            <label for="f-cphone">Phone *</label>
            <input type="tel" id="f-cphone" class="form-control" required placeholder="+91 98765 43210" />
          </div>
          <div class="form-group">
            <label for="f-cemail">Email</label>
            <input type="email" id="f-cemail" class="form-control" placeholder="Optional" />
          </div>
        </div>
      </div>

      <div id="submit-report-error" class="form-error hidden"></div>
      <div id="submit-report-success" class="form-success hidden"></div>

      <div style="display:flex;gap:16px;justify-content:flex-end;flex-wrap:wrap">
        <button type="button" class="btn btn-secondary" onclick="showPage('home')">Cancel</button>
        <button type="submit" class="btn btn-primary btn-lg" id="submit-report-btn">
          Submit ${isMissing ? 'Missing Person' : 'Found Person'} Report
        </button>
      </div>
    </form>
  `;
}

function previewPhotos(input) {
  const container = document.getElementById('photo-previews');
  container.innerHTML = '';
  Array.from(input.files).forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement('div');
      div.className = 'photo-preview';
      div.innerHTML = `
        <img src="${e.target.result}" alt="Preview ${i+1}" />
        <button type="button" class="photo-preview-remove" onclick="removePhotoPreview(${i})">×</button>
      `;
      container.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
}

function removePhotoPreview(index) {
  const input = document.getElementById('f-photos');
  const dt = new DataTransfer();
  Array.from(input.files).forEach((f, i) => { if (i !== index) dt.items.add(f); });
  input.files = dt.files;
  previewPhotos(input);
}

async function handleReportSubmit(e, type) {
  e.preventDefault();
  const errEl = document.getElementById('submit-report-error');
  const sucEl = document.getElementById('submit-report-success');
  errEl.classList.add('hidden');
  sucEl.classList.add('hidden');

  const cname = document.getElementById('f-cname').value.trim();
  const cphone = document.getElementById('f-cphone').value.trim();
  if (!cname || !cphone) {
    errEl.textContent = 'Contact name and phone are required.';
    errEl.classList.remove('hidden');
    return;
  }

  setLoading('submit-report-btn', true, 'Submitting…');

  try {
    const form = new FormData();
    form.append('report_type', type);

    const fields = {
      person_name: 'f-name',
      gender: 'f-gender',
      approximate_age_min: 'f-age-min',
      approximate_age_max: 'f-age-max',
      height_cm_min: 'f-height-min',
      height_cm_max: 'f-height-max',
      build: 'f-build',
      skin_tone: 'f-skin',
      hair_color: 'f-hair',
      eye_color: 'f-eyes',
      distinguishing_features: 'f-features',
      clothing_description: 'f-clothing',
      location_description: 'f-location',
      incident_date: 'f-date',
      additional_info: 'f-info',
      contact_name: 'f-cname',
      contact_phone: 'f-cphone',
      contact_email: 'f-cemail',
    };

    for (const [key, id] of Object.entries(fields)) {
      const el = document.getElementById(id);
      if (el && el.value.trim()) form.append(key, el.value.trim());
    }

    const photosInput = document.getElementById('f-photos');
    if (photosInput?.files) {
      Array.from(photosInput.files).forEach(f => form.append('photos', f));
    }

    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch(API + '/reports/', { method: 'POST', body: form, headers });
    const data = await readApiResponse(res, 'Submission failed');

    sucEl.textContent = `✅ Report submitted successfully! Report ID: #${data.id}. Our system will search for potential matches.`;
    sucEl.classList.remove('hidden');
    showToast('Report submitted! ID #' + data.id, 'success');

    setTimeout(() => viewReport(data.id), 1500);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    showToast(err.message, 'error');
  } finally {
    setLoading('submit-report-btn', false);
  }
}

// ═══════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════

async function loadDashboard() {
  document.getElementById('dashboard-welcome').textContent = `Welcome back, ${currentUser.full_name}!`;

  // Load user's reports
  const reportsContainer = document.getElementById('my-reports-list');
  try {
    const reports = await apiFetch('/reports/my');
    if (!reports.length) {
      reportsContainer.innerHTML = `<div class="empty-state"><p>No reports yet. <a href="#" onclick="showPage('report-missing')">File your first report</a>.</p></div>`;
    } else {
      reportsContainer.innerHTML = reports.map(r => {
        const photo = r.photos?.[0];
        return `<div class="my-report-item">
          ${photo
            ? `<img src="${photoUrl(photo.filename)}" alt="" class="my-report-thumb" onerror="this.style.background='var(--bg-input)'" />`
            : `<div class="my-report-thumb" style="display:flex;align-items:center;justify-content:center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>`
          }
          <div class="my-report-info">
            <div class="my-report-name">${r.person_name || 'Unknown'}</div>
            <div class="my-report-meta">
              <span class="report-card-type ${r.report_type === 'missing' ? 'type-missing' : 'type-found'}" style="font-size:0.7rem;padding:2px 8px">${capitalize(r.report_type)}</span>
              · <span class="status-badge status-${r.status}" style="font-size:0.7rem">${r.status}</span>
              · ${formatDate(r.created_at)}
            </div>
          </div>
          <div class="my-report-actions">
            <button class="btn btn-sm btn-outline" onclick="viewReport(${r.id})">View</button>
            <button class="btn btn-sm btn-danger" onclick="deleteReport(${r.id})">Delete</button>
          </div>
        </div>`;
      }).join('');
    }
  } catch (e) {
    reportsContainer.innerHTML = `<p style="color:var(--error)">Error: ${e.message}</p>`;
  }

  // Load matches
  const matchContainer = document.getElementById('my-matches-list');
  try {
    const matchData = await apiFetch('/matches/?page_size=5');
    if (!matchData.items.length) {
      matchContainer.innerHTML = `<div class="empty-state"><p style="color:var(--text-muted)">No potential matches yet. File a report to start matching.</p></div>`;
    } else {
      matchContainer.innerHTML = matchData.items.map(m => {
        const pct = Math.round(m.score * 100);
        const sc = scoreClass(m.score);
        const labelA = m.missing_report?.person_name || 'Missing #' + m.missing_report_id;
        const labelB = m.found_report?.person_name || 'Found #' + m.found_report_id;
        return `<div class="match-mini" onclick="viewReport(${m.missing_report_id})">
          <div class="match-mini-score ${sc}">${pct}%</div>
          <div class="match-mini-info">
            <div class="match-mini-name">${labelA} ↔ ${labelB}</div>
            <div class="match-mini-sub">${capitalize(m.status)} · ${formatDate(m.created_at)}</div>
          </div>
        </div>`;
      }).join('');
    }
  } catch (e) {
    matchContainer.innerHTML = `<p style="color:var(--text-muted)">Sign in to see matches.</p>`;
  }
}

async function deleteReport(id) {
  if (!confirm('Are you sure you want to delete this report? This cannot be undone.')) return;
  try {
    await apiFetch(`/reports/${id}`, { method: 'DELETE' });
    showToast('Report deleted', 'success');
    showPage('dashboard');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════

async function loadAdminStats() {
  const container = document.getElementById('admin-stats-grid');
  try {
    const s = await apiFetch('/admin/stats');
    container.innerHTML = `
      <div class="stat-card stat-card-violet"><span class="stat-card-num">${s.total_users}</span><div class="stat-card-label">Total Users</div></div>
      <div class="stat-card stat-card-orange"><span class="stat-card-num">${s.total_reports}</span><div class="stat-card-label">Total Reports</div></div>
      <div class="stat-card"><span class="stat-card-num" style="color:#FC8181">${s.missing_reports}</span><div class="stat-card-label">Missing Reports</div></div>
      <div class="stat-card"><span class="stat-card-num" style="color:#6EE7B7">${s.found_reports}</span><div class="stat-card-label">Found Reports</div></div>
      <div class="stat-card stat-card-green"><span class="stat-card-num">${s.active_reports}</span><div class="stat-card-label">Active Reports</div></div>
      <div class="stat-card stat-card-violet"><span class="stat-card-num">${s.reunited_reports}</span><div class="stat-card-label">Reunited</div></div>
      <div class="stat-card stat-card-orange"><span class="stat-card-num">${s.total_matches}</span><div class="stat-card-label">Total Matches</div></div>
      <div class="stat-card stat-card-green"><span class="stat-card-num">${s.confirmed_matches}</span><div class="stat-card-label">Confirmed</div></div>
    `;
  } catch (e) {
    container.innerHTML = `<p style="color:var(--error)">Error loading stats: ${e.message}</p>`;
  }
}

async function loadAdminMatches() {
  const container = document.getElementById('admin-matches-list');
  const status = document.getElementById('admin-match-filter')?.value || '';
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading…</p></div>';
  try {
    let url = '/matches/admin/all?page_size=20';
    if (status) url += `&status=${status}`;
    const data = await apiFetch(url);
    if (!data.items.length) {
      container.innerHTML = `<div class="empty-state"><p>No matches found.</p></div>`;
      return;
    }
    container.innerHTML = data.items.map(m => {
      const pct = Math.round(m.score * 100);
      const sc = scoreClass(m.score);
      return `<div class="admin-match-row">
        <div class="match-score-badge ${sc}" style="width:52px;height:52px;font-size:0.85rem">${pct}%</div>
        <div class="admin-match-reports">
          <div class="admin-match-report">
            <div class="admin-match-label">Missing</div>
            <div class="admin-match-name">${m.missing_report?.person_name || '#' + m.missing_report_id}</div>
            <div class="admin-match-sub">${m.missing_report?.location_description || '–'}</div>
          </div>
          <div style="align-self:center;color:var(--text-muted)">↔</div>
          <div class="admin-match-report">
            <div class="admin-match-label">Found</div>
            <div class="admin-match-name">${m.found_report?.person_name || '#' + m.found_report_id}</div>
            <div class="admin-match-sub">${m.found_report?.location_description || '–'}</div>
          </div>
        </div>
        <div class="admin-match-actions">
          <span class="status-badge status-${m.status}">${m.status}</span>
          ${m.status === 'suggested' ? `
          <button class="btn btn-sm btn-success" onclick="updateMatchStatus(${m.id},'confirmed').then(()=>loadAdminMatches())">✓</button>
          <button class="btn btn-sm btn-danger" onclick="updateMatchStatus(${m.id},'rejected').then(()=>loadAdminMatches())">✗</button>
          ` : ''}
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<p style="color:var(--error)">Error: ${e.message}</p>`;
  }
}

async function adminCloseReport(id, status) {
  // Uses the admin-only status endpoint so we bypass the owner check.
  try {
    await apiFetch(`/admin/reports/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    showToast(`Report marked as ${status}`, 'success');
    viewReport(id);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════
// ADMIN – PENDING REPORTS
// ═══════════════════════════════════════════════════

async function loadAdminPendingReports() {
  const container = document.getElementById('admin-pending-list');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading…</p></div>';
  try {
    const items = await apiFetch('/admin/reports/pending');
    if (!items.length) {
      container.innerHTML = `<div class="empty-state"><p>No reports pending review. 🎉</p></div>`;
      return;
    }
    container.innerHTML = items.map(r => `
      <div class="admin-match-row">
        <div style="flex:1">
          <div class="admin-match-name">${r.person_name || 'Unknown'}
            <span class="report-card-type ${r.report_type === 'missing' ? 'type-missing' : 'type-found'}" style="font-size:0.7rem;margin-left:8px">${r.report_type}</span>
          </div>
          <div class="admin-match-sub">${r.location_description || '–'} · ${formatDate(r.created_at)}</div>
        </div>
        <div class="admin-match-actions">
          <button class="btn btn-sm btn-success" onclick="adminApproveReport(${r.id})">✓ Approve</button>
          <button class="btn btn-sm btn-danger" onclick="adminSetStatus(${r.id},'closed')">✗ Reject</button>
          <button class="btn btn-sm btn-outline" onclick="viewReport(${r.id})">View</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<p style="color:var(--error)">Error: ${e.message}</p>`;
  }
}

async function adminApproveReport(id) {
  try {
    await apiFetch(`/admin/reports/${id}/approve`, { method: 'PATCH' });
    showToast('Report approved and set to active', 'success');
    loadAdminPendingReports();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function adminSetStatus(id, status) {
  try {
    await apiFetch(`/admin/reports/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    showToast(`Report status set to ${status}`, 'success');
    loadAdminPendingReports();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════
// ADMIN – USER MANAGEMENT
// ═══════════════════════════════════════════════════

async function loadAdminUsers() {
  const container = document.getElementById('admin-users-list');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading users…</p></div>';
  try {
    const users = await apiFetch('/admin/users?page_size=50');
    if (!users.length) {
      container.innerHTML = `<div class="empty-state"><p>No users found.</p></div>`;
      return;
    }
    container.innerHTML = users.map(u => `
      <div class="admin-user-row">
        <div class="admin-user-info">
          <div class="admin-user-name">${u.full_name}
            ${u.is_admin ? '<span class="status-badge" style="background:rgba(124,58,237,0.2);color:#a78bfa;margin-left:6px">Admin</span>' : ''}
            ${!u.is_active ? '<span class="status-badge status-closed" style="margin-left:6px">Inactive</span>' : ''}
          </div>
          <div class="admin-user-meta">${u.email} · Joined ${formatDate(u.created_at)}</div>
        </div>
        <div class="admin-match-actions">
          <button class="btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-success'}" onclick="toggleUserActive(${u.id})">
            ${u.is_active ? '🚫 Deactivate' : '✓ Activate'}
          </button>
          ${!u.is_admin ? `<button class="btn btn-sm btn-outline" onclick="makeUserAdmin(${u.id})">Make Admin</button>` : ''}
        </div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<p style="color:var(--error)">Error: ${e.message}</p>`;
  }
}

async function toggleUserActive(userId) {
  try {
    await apiFetch(`/admin/users/${userId}/toggle-active`, { method: 'PATCH' });
    showToast('User status updated', 'success');
    loadAdminUsers();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function makeUserAdmin(userId) {
  if (!confirm('Grant admin privileges to this user? This cannot be easily reversed.')) return;
  try {
    await apiFetch(`/admin/users/${userId}/make-admin`, { method: 'PATCH' });
    showToast('User promoted to admin', 'success');
    loadAdminUsers();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════
// EDIT MODAL
// ═══════════════════════════════════════════════════

async function showEditModal(id) {
  try {
    const r = await apiFetch(`/reports/${id}`);
    showModal(`
      <h2 style="margin-bottom:20px">Edit Report #${id}</h2>
      <form onsubmit="handleEditSubmit(event,${id})">
        <div class="form-group"><label>Person Name</label><input type="text" id="edit-name" class="form-control" value="${r.person_name || ''}" /></div>
        <div class="form-group"><label>Status</label>
          <select id="edit-status" class="form-control">
            <option value="active" ${r.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="closed" ${r.status === 'closed' ? 'selected' : ''}>Closed</option>
            <option value="reunited" ${r.status === 'reunited' ? 'selected' : ''}>Reunited 🎉</option>
          </select>
        </div>
        <div class="form-group"><label>Location Description</label><input type="text" id="edit-location" class="form-control" value="${r.location_description || ''}" /></div>
        <div class="form-group"><label>Additional Info</label><textarea id="edit-info" class="form-control">${r.additional_info || ''}</textarea></div>
        <div id="edit-error" class="form-error hidden"></div>
        <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="edit-save-btn">Save Changes</button>
        </div>
      </form>
    `);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function handleEditSubmit(e, id) {
  e.preventDefault();
  setLoading('edit-save-btn', true, 'Saving…');
  try {
    await apiFetch(`/reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person_name: document.getElementById('edit-name').value || null,
        status: document.getElementById('edit-status').value,
        location_description: document.getElementById('edit-location').value || null,
        additional_info: document.getElementById('edit-info').value || null,
      }),
    });
    closeModal();
    showToast('Report updated!', 'success');
    viewReport(id);
  } catch (err) {
    document.getElementById('edit-error').textContent = err.message;
    document.getElementById('edit-error').classList.remove('hidden');
  } finally {
    setLoading('edit-save-btn', false);
  }
}

// ═══════════════════════════════════════════════════
// NAVBAR SCROLL EFFECT
// ═══════════════════════════════════════════════════

window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  if (window.scrollY > 20) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');
});

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  showPage('home');
});
