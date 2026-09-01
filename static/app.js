// State Management
let currentTab = 'dashboard';
let debounceTimer = null;
let currentRole = null;

let clientsState = { q: '', agent: 'ALL', province: 'ALL', offset: 0, limit: 30, total: 0 };
let articlesState = { q: '', stock_filter: 'all', offset: 0, limit: 30, total: 0 };
let ordersState = { q: '', evaso: 'all', offset: 0, limit: 30, total: 0 };
let transportsState = { q: '', date_filter: 'all', exact_date: '', carrier: 'ALL', offset: 0, limit: 30, total: 0 };

let deferredPrompt = null;

const AUTH_TOKEN_KEY = 'gestionale_auth_token';
const AUTH_ROLE_KEY = 'gestionale_auth_role';

// Helper for Authenticated Requests
async function authFetch(url, options = {}) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
  const headers = options.headers || {};
  
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  headers['X-App-Token'] = token;
  options.headers = headers;

  const res = await fetch(url, options);
  if (res.status === 401) {
    showLoginOverlay();
    throw new Error('Sessione scaduta o non autorizzata');
  }
  return res;
}

// Helpers
function formatCurrency(val) {
  const num = parseFloat(val) || 0;
  return '€ ' + num.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function formatNumber(val) {
  const num = parseFloat(val) || 0;
  return num.toLocaleString('it-IT');
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'warning') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================
// AUTHENTICATION & LOGIN
// ==========================================
function showLoginOverlay() {
  document.getElementById('login-overlay').style.display = 'flex';
  const pwdInput = document.getElementById('login-password');
  if (pwdInput) {
    pwdInput.value = '';
    pwdInput.focus();
  }
  document.getElementById('login-error').style.display = 'none';
}

function hideLoginOverlay() {
  document.getElementById('login-overlay').style.display = 'none';
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const pwd = document.getElementById('login-password').value.trim();
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit-btn');

  if (!pwd) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifica in corso...';
  errorEl.style.display = 'none';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });

    const data = await res.json();
    if (res.ok && data.authenticated) {
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      localStorage.setItem(AUTH_ROLE_KEY, data.role);
      currentRole = data.role;
      hideLoginOverlay();
      updateRoleUI();
      showToast(data.role === 'admin' ? 'Benvenuto Amministratore!' : 'Accesso effettuato con successo!', 'success');
      fetchStats();
      loadDashboardOrders();
    } else {
      errorEl.textContent = data.detail || 'Password errata. Riprova.';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = 'Errore di connessione. Riprova.';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Accedi all'App";
  }
}

function logout() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_ROLE_KEY);
  currentRole = null;
  showLoginOverlay();
  showToast('Disconnessione effettuata.', 'info');
}

function updateRoleUI() {
  const isAdmin = currentRole === 'admin';
  const navAdmin = document.getElementById('nav-btn-admin');
  const mobileNavAdmin = document.getElementById('mobile-nav-admin');

  if (navAdmin) navAdmin.style.display = isAdmin ? 'inline-flex' : 'none';
  if (mobileNavAdmin) mobileNavAdmin.style.display = isAdmin ? 'flex' : 'none';
}

async function checkAuthAndInit() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) {
    showLoginOverlay();
    return;
  }

  try {
    const res = await fetch('/api/auth/check', {
      headers: { 'X-App-Token': token }
    });
    const data = await res.json();

    if (res.ok && data.authenticated) {
      currentRole = data.role;
      hideLoginOverlay();
      updateRoleUI();
      fetchStats();
      loadDashboardOrders();
      loadClientFilters();
    } else {
      showLoginOverlay();
    }
  } catch (err) {
    showLoginOverlay();
  }
}

// ==========================================
// TAB SWITCHING
// ==========================================
function switchTab(tabId) {
  currentTab = tabId;
  
  // Update nav buttons (Desktop & Mobile)
  document.querySelectorAll('.nav-btn, .mobile-nav-item').forEach(el => {
    if (el.getAttribute('data-tab') === tabId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Toggle content sections
  document.querySelectorAll('.tab-content').forEach(el => {
    el.style.display = (el.id === `tab-${tabId}`) ? 'block' : 'none';
  });

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Load tab specific data
  if (tabId === 'dashboard') {
    fetchStats();
    loadDashboardOrders();
  } else if (tabId === 'clients') {
    if (clientsState.total === 0) fetchClients();
  } else if (tabId === 'articles') {
    if (articlesState.total === 0) fetchArticles();
  } else if (tabId === 'orders') {
    if (ordersState.total === 0) fetchOrders();
  } else if (tabId === 'transports') {
    if (transportsState.total === 0) fetchTransports();
  } else if (tabId === 'admin') {
    loadAdminSettings();
    loadAdminLogs();
  }
}

// Theme Switcher
function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('theme-toggle').textContent = saved === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.getElementById('theme-toggle').textContent = next === 'dark' ? '☀️' : '🌙';
}

// ==========================================
// STATS & DASHBOARD
// ==========================================
async function fetchStats() {
  try {
    const res = await authFetch('/api/stats');
    const data = await res.json();

    document.getElementById('stat-clients').textContent = formatNumber(data.clients_count);
    document.getElementById('stat-articles').textContent = formatNumber(data.articles_count);
    document.getElementById('stat-articles-disp').textContent = `${formatNumber(data.available_articles_count)} disponibili subito`;
    document.getElementById('stat-pending-orders').textContent = formatNumber(data.pending_orders_count);
    document.getElementById('stat-pending-amount').textContent = `${formatCurrency(data.pending_orders_amount)} in attesa`;
    document.getElementById('stat-orders').textContent = formatNumber(data.orders_count);
    document.getElementById('stat-turnover').textContent = `Volume totale ${formatCurrency(data.total_turnover)}`;

    const statTransports = document.getElementById('stat-transports');
    if (statTransports) {
      statTransports.textContent = formatNumber(data.transports_count || 0);
      document.getElementById('stat-transports-sub').textContent = `${formatNumber(data.today_transports_count || 0)} previsti oggi`;
    }

    if (data.last_sync) {
      document.getElementById('header-sync-status').textContent = `Ultimo sync: ${data.last_sync.timestamp}`;
    }
  } catch (err) {
    console.error('Error fetching stats:', err);
  }
}

async function loadDashboardOrders() {
  const container = document.getElementById('dashboard-recent-orders');
  try {
    const res = await authFetch('/api/orders?limit=6');
    const data = await res.json();
    if (!data.items || data.items.length === 0) {
      container.innerHTML = '<div class="empty-state">Nessun ordine recente</div>';
      return;
    }

    container.innerHTML = data.items.map(order => renderOrderCardHtml(order)).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Errore nel caricamento ordini</div>';
  }
}

// ==========================================
// SYNCHRONIZATION
// ==========================================
async function triggerSync() {
  const btn = document.getElementById('admin-sync-btn') || document.getElementById('sync-btn');
  const icon = document.getElementById('admin-sync-icon') || document.getElementById('sync-icon');
  
  if (btn) btn.disabled = true;
  if (icon) icon.classList.add('spin');
  showToast('Sincronizzazione in corso da Google Drive...', 'info');

  try {
    const res = await authFetch('/api/sync', { method: 'POST' });
    const data = await res.json();

    if (data.status === 'success' || data.drive_success) {
      showToast(`Aggiornato! ${data.clients} clienti, ${data.articles} articoli, ${data.orders} ordini`, 'success');
    } else {
      showToast(`Sync completato: ${data.clients} clienti caricati`, 'warning');
    }

    fetchStats();
    if (currentTab === 'clients') fetchClients();
    if (currentTab === 'articles') fetchArticles();
    if (currentTab === 'orders') fetchOrders();
    if (currentTab === 'dashboard') loadDashboardOrders();
    if (currentTab === 'admin') loadAdminLogs();

  } catch (err) {
    showToast('Errore durante la sincronizzazione', 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (icon) icon.classList.remove('spin');
  }
}

// ==========================================
// OMNI SEARCH (DASHBOARD)
// ==========================================
function handleOmniSearch(val) {
  const clearBtn = document.getElementById('omni-clear');
  clearBtn.style.display = val ? 'flex' : 'none';

  clearTimeout(debounceTimer);
  if (!val || val.trim().length < 2) {
    document.getElementById('omni-results').style.display = 'none';
    return;
  }

  debounceTimer = setTimeout(async () => {
    const q = encodeURIComponent(val.trim());
    try {
      const [resClients, resArticles] = await Promise.all([
        authFetch(`/api/clients?q=${q}&limit=4`).then(r => r.json()),
        authFetch(`/api/articles?q=${q}&limit=4`).then(r => r.json())
      ]);

      const list = document.getElementById('omni-results-list');
      let html = '';

      if (resClients.items && resClients.items.length > 0) {
        html += '<div style="font-size: 0.75rem; font-weight: 700; color: var(--primary); margin: 6px 0;">CLIENTI TROVATI:</div>';
        html += resClients.items.map(c => renderClientCardHtml(c)).join('');
      }

      if (resArticles.items && resArticles.items.length > 0) {
        html += '<div style="font-size: 0.75rem; font-weight: 700; color: var(--success); margin: 10px 0 6px 0;">ARTICOLI TROVATI:</div>';
        html += resArticles.items.map(a => renderArticleCardHtml(a)).join('');
      }

      if (!html) {
        html = '<div class="empty-state" style="padding: 16px;">Nessun risultato trovato per "' + val + '"</div>';
      }

      list.innerHTML = html;
      document.getElementById('omni-results').style.display = 'block';
    } catch (err) {
      console.error(err);
    }
  }, 250);
}

function clearOmniSearch() {
  const input = document.getElementById('omni-search');
  input.value = '';
  document.getElementById('omni-clear').style.display = 'none';
  document.getElementById('omni-results').style.display = 'none';
  input.focus();
}

// ==========================================
// CLIENTS TAB & FILTERS
// ==========================================
async function loadClientFilters() {
  try {
    const res = await authFetch('/api/clients/filters');
    const data = await res.json();

    const agentSelect = document.getElementById('clients-agent-filter');
    if (agentSelect && data.agents) {
      agentSelect.innerHTML = '<option value="ALL">Tutti gli agenti</option>' + 
        data.agents.map(a => `<option value="${a}">${a}</option>`).join('');
    }

    const provSelect = document.getElementById('clients-province-filter');
    if (provSelect && data.provinces) {
      provSelect.innerHTML = '<option value="ALL">Tutte le province</option>' + 
        data.provinces.map(p => `<option value="${p}">${p}</option>`).join('');
    }
  } catch (err) {
    console.error('Error loading client filters:', err);
  }
}

function onClientsFilterChange() {
  const agentSelect = document.getElementById('clients-agent-filter');
  const provSelect = document.getElementById('clients-province-filter');

  clientsState.agent = agentSelect ? agentSelect.value : 'ALL';
  clientsState.province = provSelect ? provSelect.value : 'ALL';
  clientsState.offset = 0;
  fetchClients();
}

function resetClientsFilters() {
  const agentSelect = document.getElementById('clients-agent-filter');
  const provSelect = document.getElementById('clients-province-filter');
  const searchInput = document.getElementById('clients-search');
  const clearBtn = document.getElementById('clients-clear');

  if (agentSelect) agentSelect.value = 'ALL';
  if (provSelect) provSelect.value = 'ALL';
  if (searchInput) searchInput.value = '';
  if (clearBtn) clearBtn.style.display = 'none';

  clientsState.q = '';
  clientsState.agent = 'ALL';
  clientsState.province = 'ALL';
  clientsState.offset = 0;
  fetchClients();
}

function onClientsSearch(val) {
  const clearBtn = document.getElementById('clients-clear');
  clearBtn.style.display = val ? 'flex' : 'none';

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    clientsState.q = val.trim();
    clientsState.offset = 0;
    fetchClients();
  }, 250);
}

function clearClientsSearch() {
  const input = document.getElementById('clients-search');
  input.value = '';
  document.getElementById('clients-clear').style.display = 'none';
  clientsState.q = '';
  clientsState.offset = 0;
  fetchClients();
}

async function fetchClients() {
  const container = document.getElementById('clients-list');
  container.innerHTML = '<div class="loading-spinner">Ricerca clienti in corso...</div>';

  try {
    const params = new URLSearchParams({
      limit: clientsState.limit,
      offset: clientsState.offset
    });
    if (clientsState.q) params.append('q', clientsState.q);
    if (clientsState.agent && clientsState.agent !== 'ALL') params.append('agent', clientsState.agent);
    if (clientsState.province && clientsState.province !== 'ALL') params.append('province', clientsState.province);

    const res = await authFetch(`/api/clients?${params.toString()}`);
    const data = await res.json();

    clientsState.total = data.total;
    document.getElementById('clients-count-badge').textContent = `${formatNumber(data.total)} clienti trovati`;

    if (!data.items || data.items.length === 0) {
      container.innerHTML = '<div class="empty-state">Nessun cliente trovato con i filtri selezionati</div>';
      renderPagination('clients-pagination', 0, 0, 0, () => {});
      return;
    }

    container.innerHTML = data.items.map(client => renderClientCardHtml(client)).join('');
    renderPagination('clients-pagination', clientsState.total, clientsState.limit, clientsState.offset, (newOffset) => {
      clientsState.offset = newOffset;
      fetchClients();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

  } catch (err) {
    container.innerHTML = '<div class="empty-state">Errore nel caricamento clienti</div>';
  }
}

function renderClientCardHtml(client) {
  const phone = client.phone || client.mobile || '';
  const city = client.city || 'Città n.d.';
  const prov = client.province ? `(${client.province})` : '';
  const fullAddress = [client.address, city, prov].filter(Boolean).join(' - ');

  const ordersBadge = client.orders_count > 0 
    ? `<span class="badge badge-blue">${client.orders_count} ordini 2026</span>` 
    : `<span class="badge badge-gray">Nessun ordine</span>`;
  
  const pendingBadge = client.pending_orders_count > 0
    ? `<span class="badge badge-yellow">${client.pending_orders_count} da evadere</span>`
    : '';

  const agentBadge = client.agent_name
    ? `<span class="badge badge-purple" style="background:#f3e8ff; color:#7e22ce; font-weight:600;">👤 ${client.agent_name}</span>`
    : '';

  const provBadge = client.province
    ? `<span class="badge badge-blue" style="background:#e0f2fe; color:#0369a1; font-weight:700;">📍 ${client.province}</span>`
    : '';

  return `
    <div class="item-card" onclick="openClientDetail('${client.code}')">
      <div class="card-top">
        <div>
          <div class="card-title">${client.name}</div>
          <div class="card-subtitle">📍 ${fullAddress} &bull; Cod: <strong>${client.code}</strong></div>
        </div>
      </div>

      <div class="card-badges">
        ${agentBadge}
        ${provBadge}
        ${ordersBadge}
        ${pendingBadge}
        ${client.email ? `<span class="badge badge-gray" style="text-transform:lowercase;">✉️ ${client.email}</span>` : ''}
      </div>

      <div class="card-actions" onclick="event.stopPropagation()">
        ${phone ? `<a href="tel:${phone}" class="action-btn action-call">📞 Chiama (${phone})</a>` : ''}
        ${client.email ? `<a href="mailto:${client.email}" class="action-btn action-email">✉️ Email</a>` : ''}
        ${client.city ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.name + ' ' + (client.address || '') + ' ' + client.city)}" target="_blank" class="action-btn action-map">🗺️ Mappa</a>` : ''}
        <button class="action-btn action-email" onclick="openClientDetail('${client.code}')">📄 Scheda</button>
      </div>
    </div>
  `;
}

async function openClientDetail(code) {
  const modal = document.getElementById('modal-client');
  modal.classList.add('active');

  document.getElementById('modal-client-name').textContent = 'Caricamento...';
  document.getElementById('modal-client-code').textContent = code;
  document.getElementById('modal-client-agent').textContent = '-';
  document.getElementById('modal-client-city').textContent = '-';
  document.getElementById('modal-client-address').textContent = '-';
  document.getElementById('modal-client-email').textContent = '-';
  document.getElementById('modal-client-phone').textContent = '-';
  document.getElementById('modal-client-mobile').textContent = '-';
  document.getElementById('modal-client-contact').textContent = '-';
  document.getElementById('modal-client-vat').textContent = '-';
  document.getElementById('modal-client-actions').innerHTML = '';
  document.getElementById('modal-client-orders-list').innerHTML = '<div class="loading-spinner">Caricamento ordini...</div>';
  document.getElementById('modal-client-transports-list').innerHTML = '<div class="loading-spinner">Caricamento trasporti...</div>';

  try {
    const res = await authFetch(`/api/clients/${code}`);
    const data = await res.json();
    const c = data.client;

    document.getElementById('modal-client-name').textContent = c.name + (c.name2 ? ' - ' + c.name2 : '');
    document.getElementById('modal-client-code').textContent = `Cod. ${c.code}`;
    document.getElementById('modal-client-agent').textContent = c.agent_name || 'Nessun agente assegnato';
    document.getElementById('modal-client-city').textContent = `${c.city || '-'} ${c.province ? '(' + c.province + ')' : ''}`;
    document.getElementById('modal-client-address').textContent = `${c.address || '-'} ${c.cap ? 'CAP ' + c.cap : ''}`;
    
    if (c.email) {
      document.getElementById('modal-client-email').innerHTML = `<a href="mailto:${c.email}" style="color:var(--primary); font-weight:600;">${c.email}</a>`;
    } else {
      document.getElementById('modal-client-email').textContent = '-';
    }

    document.getElementById('modal-client-phone').textContent = c.phone || '-';
    document.getElementById('modal-client-mobile').textContent = c.mobile || '-';
    document.getElementById('modal-client-contact').textContent = c.contact || '-';
    document.getElementById('modal-client-vat').textContent = c.vat || c.tax_code || '-';

    let actionButtons = '';
    if (c.phone || c.mobile) {
      const p = c.mobile || c.phone;
      actionButtons += `<a href="tel:${p}" class="action-btn action-call" style="font-size:0.9rem; padding:8px 16px;">📞 Chiama ${p}</a>`;
      if (c.mobile) {
        actionButtons += `<a href="https://wa.me/${c.mobile.replace(/\D/g, '')}" target="_blank" class="action-btn action-call" style="font-size:0.9rem; padding:8px 16px; background:#25d366; color:white;">💬 WhatsApp</a>`;
      }
    }
    if (c.email) {
      actionButtons += `<a href="mailto:${c.email}" class="action-btn action-email" style="font-size:0.9rem; padding:8px 16px;">✉️ Invia Email</a>`;
    }
    if (c.city) {
      actionButtons += `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.name + ' ' + (c.address || '') + ' ' + c.city)}" target="_blank" class="action-btn action-map" style="font-size:0.9rem; padding:8px 16px;">🗺️ Indicazioni Mappa</a>`;
    }
    document.getElementById('modal-client-actions').innerHTML = actionButtons;

    // Transports Section for this Client
    const transportsCountEl = document.getElementById('modal-client-transports-count');
    const transportsListEl = document.getElementById('modal-client-transports-list');
    if (data.transports && data.transports.length > 0) {
      transportsCountEl.textContent = data.transports.length;
      transportsListEl.innerHTML = data.transports.map(t => `
        <div class="order-mini-card">
          <div>
            <div style="font-weight: 700; font-size: 0.9rem;">🚚 ${formatDate(t.transport_date)} (${t.day_name || ''})</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              📍 ${t.city || ''} (${t.province || ''}) &bull; Vettore: <strong>${t.carrier || 'N/D'}</strong>
            </div>
            ${t.notes ? `<div style="font-size: 0.75rem; color: var(--primary); font-weight: 600; margin-top:2px;">Note: ${t.notes}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 800; font-size: 0.95rem;">${t.weight_kg ? t.weight_kg + ' Kg' : ''}</div>
            <span class="badge badge-blue">${t.time_slot || 'Programmato'}</span>
          </div>
        </div>
      `).join('');
    } else {
      transportsCountEl.textContent = '0';
      transportsListEl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 10px 0;">Nessun trasporto recente programmato.</div>';
    }

    // Orders Section
    document.getElementById('modal-client-orders-count').textContent = data.summary.total_orders;
    document.getElementById('modal-client-orders-total').textContent = `Tot: ${formatCurrency(data.summary.total_amount)}`;

    const ordersList = document.getElementById('modal-client-orders-list');
    if (!data.orders || data.orders.length === 0) {
      ordersList.innerHTML = '<div class="empty-state" style="padding: 20px;">Nessun ordine registrato nel 2026</div>';
    } else {
      ordersList.innerHTML = data.orders.map(o => `
        <div class="order-mini-card">
          <div>
            <div style="font-weight: 700; font-size: 0.9rem;">Ord. N. ${o.number} (${o.year})</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              Data: ${formatDate(o.order_date)} &bull; Consegna: ${formatDate(o.delivery_date)}
            </div>
            ${o.reference ? `<div style="font-size: 0.75rem; color: var(--primary); font-weight: 600; margin-top:2px;">Rif: ${o.reference}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 800; font-size: 0.95rem;">${formatCurrency(o.total_amount)}</div>
            ${renderEvasoBadge(o.evaso)}
          </div>
        </div>
      `).join('');
    }

  } catch (err) {
    document.getElementById('modal-client-name').textContent = 'Errore nel caricamento';
  }
}

function closeClientModal(e) {
  if (e && e.target !== document.getElementById('modal-client') && !e.target.classList.contains('modal-close')) return;
  document.getElementById('modal-client').classList.remove('active');
}

// ==========================================
// ARTICLES TAB
// ==========================================
function onArticlesSearch(val) {
  const clearBtn = document.getElementById('articles-clear');
  clearBtn.style.display = val ? 'flex' : 'none';

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    articlesState.q = val.trim();
    articlesState.offset = 0;
    fetchArticles();
  }, 250);
}

function clearArticlesSearch() {
  const input = document.getElementById('articles-search');
  input.value = '';
  document.getElementById('articles-clear').style.display = 'none';
  articlesState.q = '';
  articlesState.offset = 0;
  fetchArticles();
}

function setArticleFilter(filterVal) {
  articlesState.stock_filter = filterVal;
  articlesState.offset = 0;

  document.querySelectorAll('[data-filter]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-filter') === filterVal);
  });

  fetchArticles();
}

function filterArticlesAndSwitch(filterVal) {
  switchTab('articles');
  setArticleFilter(filterVal);
}

async function fetchArticles() {
  const container = document.getElementById('articles-list');
  container.innerHTML = '<div class="loading-spinner">Ricerca articoli a magazzino...</div>';

  try {
    const qParam = articlesState.q ? `&q=${encodeURIComponent(articlesState.q)}` : '';
    const filterParam = `&stock_filter=${articlesState.stock_filter}`;
    const res = await authFetch(`/api/articles?limit=${articlesState.limit}&offset=${articlesState.offset}${qParam}${filterParam}`);
    const data = await res.json();

    articlesState.total = data.total;
    document.getElementById('articles-count-badge').textContent = `${formatNumber(data.total)} articoli`;

    if (!data.items || data.items.length === 0) {
      container.innerHTML = '<div class="empty-state">Nessun articolo trovato</div>';
      renderPagination('articles-pagination', 0, 0, 0, () => {});
      return;
    }

    container.innerHTML = data.items.map(article => renderArticleCardHtml(article)).join('');
    renderPagination('articles-pagination', articlesState.total, articlesState.limit, articlesState.offset, (newOffset) => {
      articlesState.offset = newOffset;
      fetchArticles();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

  } catch (err) {
    container.innerHTML = '<div class="empty-state">Errore nel caricamento articoli</div>';
  }
}

function renderArticleCardHtml(article) {
  const disp = article.disp_netta || 0;
  const dispBadge = disp > 0 
    ? `<span class="badge badge-green">Disp: ${formatNumber(disp)} ${article.um}</span>`
    : `<span class="badge badge-red">Esaurito (${formatNumber(disp)})</span>`;

  return `
    <div class="item-card" onclick="openArticleDetail('${encodeURIComponent(article.code)}')">
      <div class="card-top">
        <div>
          <div class="card-title">${article.description}</div>
          <div class="card-subtitle">Cod. <strong>${article.code}</strong> ${article.cod_altern ? `&bull; Alt: ${article.cod_altern}` : ''}</div>
        </div>
        <div style="text-align: right;">
          ${article.listino_prezzo > 0 ? `<div style="font-size:1.1rem; font-weight:800; color:var(--primary);">${formatCurrency(article.listino_prezzo)}</div>` : ''}
          <div style="font-size:0.75rem; color:var(--text-muted);">U.M. ${article.um}</div>
        </div>
      </div>

      <div class="card-badges">
        ${dispBadge}
        <span class="badge badge-gray">Giacenza: ${formatNumber(article.esistenza)}</span>
        ${article.impegnato > 0 ? `<span class="badge badge-yellow">Impegnato: ${formatNumber(article.impegnato)}</span>` : ''}
        ${article.ordinato > 0 ? `<span class="badge badge-blue">Ordinato: ${formatNumber(article.ordinato)}</span>` : ''}
      </div>
    </div>
  `;
}

async function openArticleDetail(encodedCode) {
  const modal = document.getElementById('modal-article');
  modal.classList.add('active');

  const setElText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const code = decodeURIComponent(encodedCode);
  setElText('modal-art-code', code);
  setElText('modal-art-desc', 'Caricamento articolo...');
  setElText('modal-art-price', '...');
  setElText('modal-art-cost', '...');

  try {
    const res = await authFetch(`/api/articles/${encodedCode}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const art = await res.json();

    setElText('modal-art-code', art.code || code);
    setElText('modal-art-desc', art.description || '-');
    setElText('modal-art-price', art.listino_prezzo > 0 ? formatCurrency(art.listino_prezzo) : 'Da Concordare');

    const costEl = document.getElementById('modal-art-cost');
    if (costEl) costEl.textContent = art.ultimo_costo > 0 ? formatCurrency(art.ultimo_costo) : '-';

    // Availability & stock quantities
    const dispEl = document.getElementById('modal-art-disp-netta') || document.getElementById('modal-art-disp');
    if (dispEl) {
      dispEl.textContent = `${formatNumber(art.disp_netta)} ${art.um || 'PZ'}`;
      dispEl.style.color = art.disp_netta > 0 ? 'var(--success)' : 'var(--danger)';
    }

    const esistEl = document.getElementById('modal-art-esistenza') || document.getElementById('modal-art-esist');
    if (esistEl) esistEl.textContent = `${formatNumber(art.esistenza)} ${art.um || 'PZ'}`;

    const impEl = document.getElementById('modal-art-impegnato') || document.getElementById('modal-art-imp');
    if (impEl) impEl.textContent = `${formatNumber(art.impegnato)} ${art.um || 'PZ'}`;

    const ordEl = document.getElementById('modal-art-ordinato') || document.getElementById('modal-art-ord');
    if (ordEl) ordEl.textContent = `${formatNumber(art.ordinato)} ${art.um || 'PZ'}`;

    setElText('modal-art-um', art.um || '-');
    setElText('modal-art-alt', art.cod_altern || '-');
    setElText('modal-art-alistino', art.a_listino === 'S' ? 'Sì' : 'No');
    setElText('modal-art-esaurim', art.in_esaurim === 'S' ? 'In Esaurimento' : 'Regolare');

  } catch (err) {
    console.error('Errore openArticleDetail:', err);
    setElText('modal-art-desc', 'Errore nel caricamento articolo');
  }
}

function closeArticleModal(e) {
  if (e && e.target !== document.getElementById('modal-article') && !e.target.classList.contains('modal-close')) return;
  document.getElementById('modal-article').classList.remove('active');
}

// ==========================================
// ORDERS TAB
// ==========================================
function onOrdersSearch(val) {
  const clearBtn = document.getElementById('orders-clear');
  clearBtn.style.display = val ? 'flex' : 'none';

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    ordersState.q = val.trim();
    ordersState.offset = 0;
    fetchOrders();
  }, 250);
}

function clearOrdersSearch() {
  const input = document.getElementById('orders-search');
  input.value = '';
  document.getElementById('orders-clear').style.display = 'none';
  ordersState.q = '';
  ordersState.offset = 0;
  fetchOrders();
}

function setOrderFilter(evasoVal) {
  ordersState.evaso = evasoVal;
  ordersState.offset = 0;

  document.querySelectorAll('[data-order-filter]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-order-filter') === evasoVal);
  });

  fetchOrders();
}

function filterOrdersAndSwitch(evasoVal) {
  switchTab('orders');
  setOrderFilter(evasoVal);
}

async function fetchOrders() {
  const container = document.getElementById('orders-list');
  container.innerHTML = '<div class="loading-spinner">Ricerca ordini...</div>';

  try {
    const qParam = ordersState.q ? `&q=${encodeURIComponent(ordersState.q)}` : '';
    const filterParam = `&evaso=${ordersState.evaso}`;
    const res = await authFetch(`/api/orders?limit=${ordersState.limit}&offset=${ordersState.offset}${qParam}${filterParam}`);
    const data = await res.json();

    ordersState.total = data.total;
    document.getElementById('orders-count-badge').textContent = `${formatNumber(data.total)} ordini`;

    if (!data.items || data.items.length === 0) {
      container.innerHTML = '<div class="empty-state">Nessun ordine trovato</div>';
      renderPagination('orders-pagination', 0, 0, 0, () => {});
      return;
    }

    container.innerHTML = data.items.map(order => renderOrderCardHtml(order)).join('');
    renderPagination('orders-pagination', ordersState.total, ordersState.limit, ordersState.offset, (newOffset) => {
      ordersState.offset = newOffset;
      fetchOrders();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

  } catch (err) {
    container.innerHTML = '<div class="empty-state">Errore nel caricamento ordini</div>';
  }
}

function renderEvasoBadge(evaso) {
  const status = (evaso || 'N').toUpperCase();
  if (status === 'S') return '<span class="badge badge-green">✅ Evaso</span>';
  if (status === 'P') return '<span class="badge badge-yellow">🟡 Parziale</span>';
  return '<span class="badge badge-red">⏳ Da Evadere</span>';
}

function renderOrderCardHtml(order) {
  return `
    <div class="item-card" onclick="openClientDetail('${order.client_code}')">
      <div class="card-top">
        <div>
          <div class="card-title">${order.client_name}</div>
          <div class="card-subtitle">
            Ord. N. <strong>${order.number}/${order.year}</strong> &bull; Data: ${formatDate(order.order_date)}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size:1.1rem; font-weight:800;">${formatCurrency(order.total_amount)}</div>
          ${renderEvasoBadge(order.evaso)}
        </div>
      </div>

      <div class="card-badges">
        ${order.delivery_date ? `<span class="badge badge-gray">📅 Consegna: ${formatDate(order.delivery_date)}</span>` : ''}
        ${order.reference ? `<span class="badge badge-blue">Rif: ${order.reference}</span>` : ''}
        ${order.warehouse ? `<span class="badge badge-gray">Mag: ${order.warehouse}</span>` : ''}
      </div>
    </div>
  `;
}

// ==========================================
// TRANSPORTS TAB
// ==========================================
function onTransportsSearch(val) {
  const clearBtn = document.getElementById('transports-clear');
  clearBtn.style.display = val ? 'flex' : 'none';

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    transportsState.q = val.trim();
    transportsState.offset = 0;
    fetchTransports();
  }, 250);
}

function clearTransportsSearch() {
  const input = document.getElementById('transports-search');
  input.value = '';
  document.getElementById('transports-clear').style.display = 'none';
  transportsState.q = '';
  transportsState.offset = 0;
  fetchTransports();
}

function setTransportDateFilter(val) {
  // Clear exact date picker if user clicks a preset pill
  const picker = document.getElementById('transports-date-picker');
  const clearBtn = document.getElementById('transports-date-clear-btn');
  if (picker) picker.value = '';
  if (clearBtn) clearBtn.style.display = 'none';

  transportsState.exact_date = '';
  transportsState.date_filter = val;
  transportsState.offset = 0;

  document.querySelectorAll('[data-date]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-date') === val);
  });

  fetchTransports();
}

function onTransportDatePickerChange(val) {
  const clearBtn = document.getElementById('transports-date-clear-btn');
  if (!val) {
    clearTransportDatePicker();
    return;
  }

  // Deactivate all preset pills when choosing an exact date
  document.querySelectorAll('[data-date]').forEach(el => el.classList.remove('active'));
  if (clearBtn) clearBtn.style.display = 'inline-flex';

  transportsState.exact_date = val;
  transportsState.offset = 0;
  fetchTransports();
}

function clearTransportDatePicker() {
  const picker = document.getElementById('transports-date-picker');
  const clearBtn = document.getElementById('transports-date-clear-btn');
  if (picker) picker.value = '';
  if (clearBtn) clearBtn.style.display = 'none';

  transportsState.exact_date = '';
  transportsState.date_filter = 'all';
  transportsState.offset = 0;

  document.querySelectorAll('[data-date]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-date') === 'all');
  });

  fetchTransports();
}

function onTransportsCarrierChange() {
  const select = document.getElementById('transports-carrier-filter');
  transportsState.carrier = select ? select.value : 'ALL';
  transportsState.offset = 0;
  fetchTransports();
}

async function fetchTransports() {
  const container = document.getElementById('transports-list');
  container.innerHTML = '<div class="loading-spinner">Caricamento trasporti in corso...</div>';

  try {
    const params = new URLSearchParams({
      limit: transportsState.limit,
      offset: transportsState.offset
    });

    if (transportsState.exact_date) {
      params.append('exact_date', transportsState.exact_date);
    } else {
      params.append('date_filter', transportsState.date_filter);
    }

    if (transportsState.q) params.append('q', transportsState.q);
    if (transportsState.carrier && transportsState.carrier !== 'ALL') params.append('carrier', transportsState.carrier);

    const res = await authFetch(`/api/transports?${params.toString()}`);
    const data = await res.json();

    transportsState.total = data.total;
    document.getElementById('transports-count-badge').textContent = `${formatNumber(data.total)} trasporti`;

    // Populate carriers dropdown if available and not yet populated
    const carrierSelect = document.getElementById('transports-carrier-filter');
    if (carrierSelect && data.carriers && carrierSelect.options.length <= 1) {
      carrierSelect.innerHTML = '<option value="ALL">Tutti i vettori</option>' + 
        data.carriers.map(c => `<option value="${c}">${c}</option>`).join('');
      carrierSelect.value = transportsState.carrier;
    }

    if (!data.items || data.items.length === 0) {
      container.innerHTML = '<div class="empty-state">Nessun trasporto trovato con i criteri selezionati</div>';
      renderPagination('transports-pagination', 0, 0, 0, () => {});
      return;
    }

    container.innerHTML = data.items.map(t => renderTransportCardHtml(t)).join('');
    renderPagination('transports-pagination', transportsState.total, transportsState.limit, transportsState.offset, (newOffset) => {
      transportsState.offset = newOffset;
      fetchTransports();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

  } catch (err) {
    container.innerHTML = '<div class="empty-state">Errore nel caricamento dei trasporti</div>';
  }
}

function renderTransportCardHtml(t) {
  const dest = [t.city, t.province ? `(${t.province})` : ''].filter(Boolean).join(' ');
  const dateFormatted = formatDate(t.transport_date);
  const dayStr = t.day_name ? `${t.day_name} ` : '';

  return `
    <div class="item-card">
      <div class="card-top">
        <div>
          <div class="card-title">${t.client_name}</div>
          <div class="card-subtitle">
            📍 <strong>${dest || 'Destinazione non specificata'}</strong> &bull; Previsto: <strong>${dayStr}${dateFormatted}</strong>
          </div>
        </div>
        <div style="text-align: right;">
          ${t.carrier ? `<span class="badge badge-blue" style="font-weight:700; font-size:0.85rem;">🚚 ${t.carrier}</span>` : '<span class="badge badge-gray">Vettore n.d.</span>'}
        </div>
      </div>

      <div class="card-badges">
        ${t.weight_kg ? `<span class="badge badge-gray">⚖️ Peso: <strong>${t.weight_kg} Kg</strong></span>` : ''}
        ${t.time_slot ? `<span class="badge badge-yellow">🕒 ${t.time_slot}</span>` : ''}
        ${t.zone ? `<span class="badge badge-gray">Zona: ${t.zone}</span>` : ''}
        ${t.notes ? `<span class="badge badge-purple" style="background:#fef3c7; color:#92400e; font-weight:600;">📝 ${t.notes}</span>` : ''}
      </div>

      <div class="card-actions" onclick="event.stopPropagation()">
        ${t.city ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.client_name + ' ' + t.city)}" target="_blank" class="action-btn action-map">🗺️ Mappa Destinazione</a>` : ''}
        <button class="action-btn action-email" onclick="searchClientFromTransport('${t.client_name.replace(/'/g, "\\'")}')">🔍 Cerca Cliente</button>
      </div>
    </div>
  `;
}

function searchClientFromTransport(clientName) {
  switchTab('clients');
  const searchInput = document.getElementById('clients-search');
  if (searchInput) {
    searchInput.value = clientName;
    onClientsSearch(clientName);
  }
}

// ==========================================
// ADMIN PANEL LOGIC
// ==========================================
function updateFileSelection(input, dropBoxId, label) {
  const dropBox = document.getElementById(dropBoxId);
  const nameEl = document.getElementById(`name-${label.toLowerCase()}`);
  if (input.files && input.files[0]) {
    dropBox.classList.add('has-file');
    nameEl.textContent = `✓ ${input.files[0].name}`;
  } else {
    dropBox.classList.remove('has-file');
    nameEl.textContent = '';
  }
}

function resetFileSelections() {
  ['anagra', 'artico', 'seor', 'listino', 'trasporti'].forEach(key => {
    const input = document.getElementById(`file-${key}`);
    const dropBox = document.getElementById(`drop-${key}`);
    const nameEl = document.getElementById(`name-${key}`);
    if (input) input.value = '';
    if (dropBox) dropBox.classList.remove('has-file');
    if (nameEl) nameEl.textContent = '';
  });
}

async function handleExcelUpload(e) {
  e.preventDefault();
  const inputs = ['file-anagra', 'file-artico', 'file-seor', 'file-listino', 'file-trasporti'];
  const formData = new FormData();
  let fileCount = 0;

  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.files && el.files[0]) {
      formData.append('files', el.files[0]);
      fileCount++;
    }
  });

  if (fileCount === 0) {
    showToast('Seleziona almeno un file Excel da caricare!', 'warning');
    return;
  }

  const uploadBtn = document.getElementById('upload-btn');
  const uploadIcon = document.getElementById('upload-icon');
  uploadBtn.disabled = true;
  uploadIcon.classList.add('spin');
  showToast(`Caricamento ed elaborazione di ${fileCount} file in corso...`, 'info');

  try {
    const res = await authFetch('/api/admin/upload-excel', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (res.ok && data.status === 'success') {
      showToast(data.message, 'success');
      resetFileSelections();
      fetchStats();
      loadAdminLogs();
    } else {
      showToast(data.detail || "Errore durante l'elaborazione dei file", 'error');
    }
  } catch (err) {
    showToast('Errore durante il caricamento', 'error');
  } finally {
    uploadBtn.disabled = false;
    uploadIcon.classList.remove('spin');
  }
}

async function loadAdminSettings() {
  try {
    const res = await authFetch('/api/admin/settings');
    const data = await res.json();
    if (data.app_password) {
      document.getElementById('current-app-pwd-display').textContent = data.app_password;
      document.getElementById('input-new-app-pwd').value = data.app_password;
    }
  } catch (err) {
    console.error('Error loading admin settings:', err);
  }
}

async function handlePasswordChange(e) {
  e.preventDefault();
  const newAppPwd = document.getElementById('input-new-app-pwd').value.trim();
  const newAdminPwd = document.getElementById('input-new-admin-pwd').value.trim();

  if (!newAppPwd && !newAdminPwd) {
    showToast('Inserisci almeno una nuova password!', 'warning');
    return;
  }

  const saveBtn = document.getElementById('pwd-save-btn');
  saveBtn.disabled = true;

  try {
    const res = await authFetch('/api/admin/change-passwords', {
      method: 'POST',
      body: JSON.stringify({
        app_password: newAppPwd,
        admin_password: newAdminPwd
      })
    });
    const data = await res.json();

    if (res.ok && data.status === 'success') {
      showToast('Password aggiornate con successo!', 'success');
      if (data.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      }
      loadAdminSettings();
      document.getElementById('input-new-admin-pwd').value = '';
    } else {
      showToast(data.detail || 'Errore durante il salvataggio', 'error');
    }
  } catch (err) {
    showToast('Errore di connessione', 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

async function loadAdminLogs() {
  const container = document.getElementById('admin-sync-logs');
  if (!container) return;

  try {
    const res = await authFetch('/api/sync/logs?limit=8');
    const logs = await res.json();

    if (!logs || logs.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding: 16px;">Nessun log disponibile</div>';
      return;
    }

    container.innerHTML = logs.map(l => `
      <div class="order-mini-card">
        <div>
          <div style="font-weight: 700; font-size: 0.88rem;">${l.source} &bull; <span style="font-size:0.75rem; color:var(--text-muted);">${l.timestamp}</span></div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">${l.details || ''}</div>
        </div>
        <div style="text-align: right;">
          <span class="badge ${l.status === 'SUCCESS' ? 'badge-green' : 'badge-yellow'}">${l.status}</span>
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 3px;">
            ${formatNumber(l.total_clients)} cli &bull; ${formatNumber(l.total_articles)} art
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state" style="padding: 16px;">Errore nel caricamento log</div>';
  }
}

// ==========================================
// PAGINATION COMPONENT
// ==========================================
function renderPagination(containerId, total, limit, currentOffset, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (total <= limit) {
    container.innerHTML = '';
    return;
  }

  const currentPage = Math.floor(currentOffset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  let html = `
    <button class="btn btn-secondary btn-sm" ${currentPage === 1 ? 'disabled' : ''} onclick="window.changePage('${containerId}', ${currentOffset - limit})">
      ◀ Precedente
    </button>
    <span style="font-size: 0.85rem; font-weight: 600; align-self: center;">
      Pagina ${currentPage} di ${totalPages}
    </span>
    <button class="btn btn-secondary btn-sm" ${currentPage === totalPages ? 'disabled' : ''} onclick="window.changePage('${containerId}', ${currentOffset + limit})">
      Successiva ▶
    </button>
  `;

  container.innerHTML = html;
  window[`_pageCallback_${containerId}`] = onPageChange;
}

window.changePage = function(containerId, newOffset) {
  if (window[`_pageCallback_${containerId}`]) {
    window[`_pageCallback_${containerId}`](newOffset);
  }
};

// ==========================================
// PWA INSTALLATION PROMPT
// ==========================================
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.style.display = 'flex';
});

function promptInstallPWA() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('App installata con successo!', 'success');
      }
      deferredPrompt = null;
      document.getElementById('pwa-install-banner').style.display = 'none';
    });
  } else {
    showToast('Per installare su iPhone/Android: tocca Condividi e "Aggiungi a Schermata Home"', 'info');
  }
}

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('SW registration failed: ', err);
    });
  });
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAuthAndInit();
});
