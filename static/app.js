// State Management
let currentTab = 'dashboard';
let debounceTimer = null;

let clientsState = { q: '', offset: 0, limit: 30, total: 0 };
let articlesState = { q: '', stock_filter: 'all', offset: 0, limit: 30, total: 0 };
let ordersState = { q: '', evaso: 'all', offset: 0, limit: 30, total: 0 };

let deferredPrompt = null;

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

// Tab Switching
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
    const res = await fetch('/api/stats');
    const data = await res.json();

    document.getElementById('stat-clients').textContent = formatNumber(data.clients_count);
    document.getElementById('stat-articles').textContent = formatNumber(data.articles_count);
    document.getElementById('stat-articles-disp').textContent = `${formatNumber(data.available_articles_count)} disponibili subito`;
    document.getElementById('stat-pending-orders').textContent = formatNumber(data.pending_orders_count);
    document.getElementById('stat-pending-amount').textContent = `${formatCurrency(data.pending_orders_amount)} in attesa`;
    document.getElementById('stat-orders').textContent = formatNumber(data.orders_count);
    document.getElementById('stat-turnover').textContent = `Volume totale ${formatCurrency(data.total_turnover)}`;

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
    const res = await fetch('/api/orders?limit=6');
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
  const btn = document.getElementById('sync-btn');
  const icon = document.getElementById('sync-icon');
  
  btn.disabled = true;
  icon.classList.add('spin');
  showToast('Sincronizzazione in corso da Google Drive...', 'info');

  try {
    const res = await fetch('/api/sync', { method: 'POST' });
    const data = await res.json();

    if (data.status === 'success' || data.drive_success) {
      showToast(`Aggiornato! ${data.clients} clienti, ${data.articles} articoli, ${data.orders} ordini`, 'success');
    } else {
      showToast(`Sync parziale (File locali): ${data.clients} clienti caricati`, 'warning');
    }

    // Refresh active data
    fetchStats();
    if (currentTab === 'clients') fetchClients();
    if (currentTab === 'articles') fetchArticles();
    if (currentTab === 'orders') fetchOrders();
    if (currentTab === 'dashboard') loadDashboardOrders();

  } catch (err) {
    showToast('Errore di connessione durante la sincronizzazione', 'error');
  } finally {
    btn.disabled = false;
    icon.classList.remove('spin');
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
        fetch(`/api/clients?q=${q}&limit=4`).then(r => r.json()),
        fetch(`/api/articles?q=${q}&limit=4`).then(r => r.json())
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
// CLIENTS TAB
// ==========================================
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
    const qParam = clientsState.q ? `&q=${encodeURIComponent(clientsState.q)}` : '';
    const res = await fetch(`/api/clients?limit=${clientsState.limit}&offset=${clientsState.offset}${qParam}`);
    const data = await res.json();

    clientsState.total = data.total;
    document.getElementById('clients-count-badge').textContent = `${formatNumber(data.total)} clienti trovati`;

    if (!data.items || data.items.length === 0) {
      container.innerHTML = '<div class="empty-state">Nessun cliente trovato</div>';
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
  const city = client.city || 'Città non specificata';
  const ordersBadge = client.orders_count > 0 
    ? `<span class="badge badge-blue">${client.orders_count} ordini 2026</span>` 
    : `<span class="badge badge-gray">Nessun ordine</span>`;
  
  const pendingBadge = client.pending_orders_count > 0
    ? `<span class="badge badge-yellow">${client.pending_orders_count} da evadere</span>`
    : '';

  return `
    <div class="item-card" onclick="openClientDetail('${client.code}')">
      <div class="card-top">
        <div>
          <div class="card-title">${client.name}</div>
          <div class="card-subtitle">📍 ${city} &bull; Cod: <strong>${client.code}</strong></div>
        </div>
      </div>

      <div class="card-badges">
        ${ordersBadge}
        ${pendingBadge}
        ${client.vat ? `<span class="badge badge-gray">P.IVA: ${client.vat}</span>` : ''}
      </div>

      <div class="card-actions" onclick="event.stopPropagation()">
        ${phone ? `<a href="tel:${phone}" class="action-btn action-call">📞 Chiama (${phone})</a>` : ''}
        ${client.city ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.name + ' ' + client.city)}" target="_blank" class="action-btn action-map">🗺️ Mappa</a>` : ''}
        <button class="action-btn action-email" onclick="openClientDetail('${client.code}')">📄 Scheda Completa</button>
      </div>
    </div>
  `;
}

async function openClientDetail(code) {
  const modal = document.getElementById('modal-client');
  modal.classList.add('active');

  document.getElementById('modal-client-name').textContent = 'Caricamento...';
  document.getElementById('modal-client-code').textContent = code;
  document.getElementById('modal-client-city').textContent = '-';
  document.getElementById('modal-client-vat').textContent = '-';
  document.getElementById('modal-client-phone').textContent = '-';
  document.getElementById('modal-client-mobile').textContent = '-';
  document.getElementById('modal-client-actions').innerHTML = '';
  document.getElementById('modal-client-orders-list').innerHTML = '<div class="loading-spinner">Caricamento ordini...</div>';

  try {
    const res = await fetch(`/api/clients/${code}`);
    const data = await res.json();
    const c = data.client;

    document.getElementById('modal-client-name').textContent = c.name + (c.name2 ? ' - ' + c.name2 : '');
    document.getElementById('modal-client-code').textContent = `Cod. ${c.code}`;
    document.getElementById('modal-client-city').textContent = c.city || '-';
    document.getElementById('modal-client-vat').textContent = c.vat || c.tax_code || '-';
    document.getElementById('modal-client-phone').textContent = c.phone || '-';
    document.getElementById('modal-client-mobile').textContent = c.mobile || '-';

    // Action buttons in modal
    let actionButtons = '';
    if (c.phone || c.mobile) {
      const p = c.mobile || c.phone;
      actionButtons += `<a href="tel:${p}" class="action-btn action-call" style="font-size:0.9rem; padding:8px 16px;">📞 Chiama ${p}</a>`;
      if (c.mobile) {
        actionButtons += `<a href="https://wa.me/${c.mobile.replace(/\D/g, '')}" target="_blank" class="action-btn action-call" style="font-size:0.9rem; padding:8px 16px; background:#25d366; color:white;">💬 WhatsApp</a>`;
      }
    }
    if (c.city) {
      actionButtons += `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.name + ' ' + c.city)}" target="_blank" class="action-btn action-map" style="font-size:0.9rem; padding:8px 16px;">🗺️ Indicazioni Mappa</a>`;
    }
    document.getElementById('modal-client-actions').innerHTML = actionButtons;

    // Render orders
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
    const res = await fetch(`/api/articles?limit=${articlesState.limit}&offset=${articlesState.offset}${qParam}${filterParam}`);
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

  const priceBadge = article.listino_prezzo > 0
    ? `<span class="badge badge-blue" style="font-size:0.8rem;">Listino: ${formatCurrency(article.listino_prezzo)}</span>`
    : '';

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

  try {
    const res = await fetch(`/api/articles/${encodedCode}`);
    const art = await res.json();

    document.getElementById('modal-art-code').textContent = art.code;
    document.getElementById('modal-art-desc').textContent = art.description;
    document.getElementById('modal-art-price').textContent = art.listino_prezzo > 0 ? formatCurrency(art.listino_prezzo) : 'Da Concordare';
    document.getElementById('modal-art-cost').textContent = art.ultimo_costo > 0 ? formatCurrency(art.ultimo_costo) : '-';

    document.getElementById('modal-art-disp').textContent = `${formatNumber(art.disp_netta)} ${art.um}`;
    document.getElementById('modal-art-disp').style.color = art.disp_netta > 0 ? 'var(--success)' : 'var(--danger)';

    document.getElementById('modal-art-esist').textContent = `${formatNumber(art.esistenza)} ${art.um}`;
    document.getElementById('modal-art-imp').textContent = `${formatNumber(art.impegnato)} ${art.um}`;
    document.getElementById('modal-art-ord').textContent = `${formatNumber(art.ordinato)} ${art.um}`;
    document.getElementById('modal-art-um').textContent = art.um || '-';
    document.getElementById('modal-art-alt').textContent = art.cod_altern || '-';
    document.getElementById('modal-art-alistino').textContent = art.a_listino === 'S' ? 'Sì' : 'No';
    document.getElementById('modal-art-esaurim').textContent = art.in_esaurim === 'S' ? 'In Esaurimento' : 'Regolare';

  } catch (err) {
    document.getElementById('modal-art-desc').textContent = 'Errore nel caricamento articolo';
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
    const res = await fetch(`/api/orders?limit=${ordersState.limit}&offset=${ordersState.offset}${qParam}${filterParam}`);
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
  fetchStats();
  loadDashboardOrders();
});
