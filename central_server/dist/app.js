const state = {
  role: 'manager',
  summary: {},
  orders: [],
  items: [],
  locations: [],
  alarms: [],
  system: { status: 'IDLE', active_order_id: null },
};

const elements = {
  systemStatus: document.getElementById('systemStatus'),
  activeOrder: document.getElementById('activeOrder'),
  mqttState: document.getElementById('mqttState'),
  statusRing: document.getElementById('statusRing'),
  metricLocations: document.getElementById('metricLocations'),
  metricItems: document.getElementById('metricItems'),
  metricPending: document.getElementById('metricPending'),
  metricInProgress: document.getElementById('metricInProgress'),
  metricCompleted: document.getElementById('metricCompleted'),
  ordersTable: document.getElementById('ordersTable'),
  locationList: document.getElementById('locationList'),
  alarmList: document.getElementById('alarmList'),
  workerQueue: document.getElementById('workerQueue'),
  itemSelect: document.getElementById('itemSelect'),
  itemLocationSelect: document.getElementById('itemLocationSelect'),
  workerName: document.getElementById('workerName'),
  orderForm: document.getElementById('orderForm'),
  itemForm: document.getElementById('itemForm'),
  locationForm: document.getElementById('locationForm'),
  formMessage: document.getElementById('formMessage'),
  itemFormMessage: document.getElementById('itemFormMessage'),
  locationFormMessage: document.getElementById('locationFormMessage'),
  claimNextButton: document.getElementById('claimNextButton'),
  refreshWorkerButton: document.getElementById('refreshWorkerButton'),
  shelfGrid: document.getElementById('shelfGrid'),
  ordersChartCtx: document.getElementById('ordersChart')?.getContext('2d'),
  statusChartCtx: document.getElementById('statusChart')?.getContext('2d'),
};

// Chart instances for managing lifecycle
let ordersChartInstance = null;
let statusChartInstance = null;

const roleButtons = document.querySelectorAll('[data-role-button]');
const viewPanels = document.querySelectorAll('[data-view]');
const systemActionButtons = document.querySelectorAll('[data-system-action]');

function setRole(role) {
  state.role = role;
  roleButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.roleButton === role));
  viewPanels.forEach((panel) => panel.classList.toggle('is-visible', panel.dataset.view === role));
}

function statusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('progress')) return 'status-progress';
  if (normalized.includes('complete')) return 'status-completed';
  if (normalized.includes('running')) return 'status-running';
  if (normalized.includes('idle') || normalized.includes('error')) return 'status-idle';
  return 'status-pending';
}

function formatDate(value) {
  if (!value) return '—';
  const parsed = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function itemLabel(itemId) {
  const item = state.items.find((entry) => Number(entry.item_id) === Number(itemId));
  if (!item) return `Item ${itemId}`;
  return `${item.description || item.qr_code_data || `Item ${item.item_id}`} (${item.qr_code_data || 'no code'})`;
}

function renderMetrics() {
  elements.metricLocations.textContent = state.summary.locations ?? state.locations.length ?? 0;
  elements.metricItems.textContent = state.summary.items ?? state.items.length ?? 0;
  elements.metricPending.textContent = state.summary.pending_orders ?? state.orders.filter((order) => order.status === 'Pending').length;
  elements.metricInProgress.textContent = state.summary.in_progress_orders ?? state.orders.filter((order) => order.status === 'In Progress').length;
  elements.metricCompleted.textContent = state.summary.completed_orders ?? state.orders.filter((order) => order.status === 'Completed').length;
}

function renderSystem() {
  elements.systemStatus.textContent = state.system.status || 'UNKNOWN';
  elements.activeOrder.textContent = state.system.active_order_id ?? 'None';
  elements.statusRing.dataset.status = (state.system.status || 'idle').toLowerCase();
}

function renderItems() {
  if (!elements.itemSelect) return;
  elements.itemSelect.innerHTML = state.items.length
    ? state.items
        .map((item) => {
          const label = `${item.item_id} - ${item.description || item.qr_code_data || 'Untitled item'}`;
          return `<option value="${item.item_id}">${escapeHtml(label)}</option>`;
        })
        .join('')
    : '<option value="">No items available</option>';
}

function renderLocations() {
  if (!state.locations.length) {
    elements.locationList.innerHTML = '<div class="empty-state">No locations available.</div>';
    return;
  }

  elements.locationList.innerHTML = state.locations
    .map(
      (location) => `
        <div class="stack-item">
          <strong>${escapeHtml(location.id)}</strong>
          <small>Status: ${escapeHtml(location.status)} · Contents: ${escapeHtml(location.contents)}</small>
        </div>
      `,
    )
    .join('');
}

function renderLocations() {
  if (!state.locations.length) {
    elements.locationList.innerHTML = '<div class="empty-state">No locations available.</div>';
    return;
  }

  elements.locationList.innerHTML = state.locations
    .map(
      (location) => `
        <div class="stack-item">
          <strong>${escapeHtml(location.id)}</strong>
          <small>Status: ${escapeHtml(location.status)} · Contents: ${escapeHtml(location.contents)}</small>
        </div>
      `,
    )
    .join('');
}

function renderLocationSelects() {
  if (!elements.itemLocationSelect) return;
  elements.itemLocationSelect.innerHTML = state.locations.length
    ? state.locations
        .map(
          (location) => `<option value="">${escapeHtml(location.id)}</option>`,
        )
        .join('')
    : '<option value="">No locations available</option>';
}

function renderShelf() {
  if (!state.locations.length) {
    elements.shelfGrid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">No storage racks configured.</div>';
    return;
  }

  elements.shelfGrid.innerHTML = state.locations
    .map(
      (location) => {
        const itemsInRack = state.items.filter(
          (item) => Number(item.location_id) === Number(location.location_id || location.id),
        ).length;
        return `
          <div class="shelf-item">
            <div>
              <strong>${escapeHtml(location.id || location.description || 'Rack')}</strong>
              <small>${itemsInRack} item${itemsInRack !== 1 ? 's' : ''}</small>
            </div>
          </div>
        `;
      },
    )
    .join('');
}

function renderCharts() {
  if (!window.Chart) return;

  renderOrdersTrendChart();
  renderStatusDistributionChart();
}

function renderOrdersTrendChart() {
  if (!elements.ordersChartCtx) return;

  // Destroy existing chart instance to prevent "canvas already in use" error
  if (ordersChartInstance) {
    ordersChartInstance.destroy();
  }

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const orderCounts = [12, 19, 3, 5, 2, 8, 15].map((v) => Math.floor(v * (state.orders.length / 35)));

  ordersChartInstance = new Chart(elements.ordersChartCtx, {
    type: 'line',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Orders',
          data: orderCounts,
          borderColor: '#7c8cff',
          backgroundColor: 'rgba(124, 140, 255, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#36d1b5',
          pointBorderColor: '#7c8cff',
          pointBorderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#edf2ff', font: { size: 12 } },
        },
      },
      scales: {
        y: {
          ticks: { color: '#94a3c4' },
          grid: { color: 'rgba(159, 178, 255, 0.1)' },
          beginAtZero: true,
        },
        x: {
          ticks: { color: '#94a3c4' },
          grid: { display: false },
        },
      },
    },
  });
}

function renderStatusDistributionChart() {
  if (!elements.statusChartCtx) return;

  // Destroy existing chart instance to prevent "canvas already in use" error
  if (statusChartInstance) {
    statusChartInstance.destroy();
  }

  const pending = state.orders.filter((o) => o.status === 'Pending').length;
  const progress = state.orders.filter((o) => o.status === 'In Progress').length;
  const completed = state.orders.filter((o) => o.status === 'Completed').length;

  statusChartInstance = new Chart(elements.statusChartCtx, {
    type: 'doughnut',
    data: {
      labels: ['Pending', 'In Progress', 'Completed'],
      datasets: [
        {
          data: [pending, progress, completed],
          backgroundColor: ['#ffcb6b', '#7dd3fc', '#39d98a'],
          borderColor: 'rgba(14, 20, 41, 0.9)',
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#edf2ff', font: { size: 11 } },
          position: 'bottom',
        },
      },
    },
  });
}

function renderAlarms() {
  if (!state.alarms.length) {
    elements.alarmList.innerHTML = '<div class="empty-state">No active alarms.</div>';
    return;
  }

  elements.alarmList.innerHTML = state.alarms
    .map(
      (alarm) => `
        <div class="alarm-item">
          <strong>${escapeHtml(alarm.message || 'Alarm')}</strong>
          <small>${escapeHtml(alarm.severity || 'unknown')} severity</small>
        </div>
      `,
    )
    .join('');
}

function renderOrders() {
  if (!state.orders.length) {
    elements.ordersTable.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">No orders yet. Create the first one from Manager view.</div>
        </td>
      </tr>
    `;
    elements.workerQueue.innerHTML = '<div class="empty-state">No work queued.</div>';
    return;
  }

  elements.ordersTable.innerHTML = state.orders
    .map((order) => {
      const itemText = itemLabel(order.item_id);
      const statusTag = `<span class="status-tag ${statusClass(order.status)}">${escapeHtml(order.status)}</span>`;
      const actions = [];

      if (order.status === 'Pending') {
        actions.push(`<button class="secondary order-claim" data-order-id="${order.job_id}" type="button">Claim</button>`);
      }

      if (order.status === 'In Progress') {
        actions.push(`<button class="secondary order-complete" data-order-id="${order.job_id}" type="button">Complete</button>`);
      }

      return `
        <tr>
          <td>#${order.job_id}</td>
          <td>${escapeHtml(order.job_type)}</td>
          <td>${escapeHtml(itemText)}</td>
          <td>${statusTag}</td>
          <td>${escapeHtml(order.assigned_to || 'Unassigned')}</td>
          <td>${escapeHtml(formatDate(order.updated_at || order.created_at))}</td>
          <td>${actions.join(' ') || '<span class="form-message">No actions</span>'}</td>
        </tr>
      `;
    })
    .join('');

  const pendingQueue = state.orders.filter((order) => order.status !== 'Completed');
  elements.workerQueue.innerHTML = pendingQueue.length
    ? pendingQueue
        .slice(0, 6)
        .map(
          (order) => `
            <article class="queue-item">
              <div>
                <strong class="queue-title">#${order.job_id} ${escapeHtml(order.job_type)}</strong>
                <p class="queue-meta">${escapeHtml(itemLabel(order.item_id))} · ${escapeHtml(order.status)} · ${escapeHtml(order.assigned_to || 'Unassigned')}</p>
              </div>
              ${
                order.status === 'Pending'
                  ? `<button class="secondary queue-claim" data-order-id="${order.job_id}" type="button">Claim</button>`
                  : `<button class="secondary queue-complete" data-order-id="${order.job_id}" type="button">Complete</button>`
              }
            </article>
          `,
        )
        .join('')
    : '<div class="empty-state">No work queued.</div>';
}

function bindTableActions() {
  document.querySelectorAll('.order-claim').forEach((button) => {
    button.addEventListener('click', () => claimOrder(button.dataset.orderId));
  });

  document.querySelectorAll('.order-complete').forEach((button) => {
    button.addEventListener('click', () => completeOrder(button.dataset.orderId));
  });

  document.querySelectorAll('.queue-claim').forEach((button) => {
    button.addEventListener('click', () => claimOrder(button.dataset.orderId));
  });

  document.querySelectorAll('.queue-complete').forEach((button) => {
    button.addEventListener('click', () => completeOrder(button.dataset.orderId));
  });
}

function setMessage(message, type = 'info') {
  elements.formMessage.textContent = message;
  elements.formMessage.dataset.type = type;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(payload.message || `Request failed: ${response.status}`);
  }

  return payload;
}

async function loadDashboard() {
  const [summary, system, orders, items, locations, alarms] = await Promise.all([
    requestJson('/api/dashboard/summary').catch(() => ({})),
    requestJson('/api/system/status').catch(() => ({ status: 'UNKNOWN', active_order_id: null })),
    requestJson('/api/orders').catch(() => []),
    requestJson('/api/items').catch(() => []),
    requestJson('/api/storage/locations').catch(() => []),
    requestJson('/api/alarms').catch(() => []),
  ]);

  state.summary = summary;
  state.system = system;
  state.orders = orders;
  state.items = items;
  state.locations = locations;
  state.alarms = alarms;

  renderSystem();
  renderMetrics();
  renderItems();
  renderLocationSelects();
  renderLocations();
  renderAlarms();
  renderOrders();
  renderShelf();
  renderCharts();
  bindTableActions();
}

async function createItem(event) {
  event.preventDefault();
  const formData = new FormData(elements.itemForm);
  const payload = Object.fromEntries(formData.entries());

  if (payload.location_id) {
    payload.location_id = parseInt(payload.location_id) || null;
  }

  try {
    elements.itemFormMessage.textContent = 'Adding item...';
    await requestJson('/api/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    elements.itemForm.reset();
    elements.itemFormMessage.textContent = 'Item added successfully!';
    elements.itemFormMessage.dataset.type = 'success';
    await loadDashboard();
  } catch (error) {
    elements.itemFormMessage.textContent = error.message;
    elements.itemFormMessage.dataset.type = 'error';
  }
}

async function createLocation(event) {
  event.preventDefault();
  const formData = new FormData(elements.locationForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    elements.locationFormMessage.textContent = 'Adding location...';
    await requestJson('/api/locations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    elements.locationForm.reset();
    elements.locationFormMessage.textContent = 'Location added successfully!';
    elements.locationFormMessage.dataset.type = 'success';
    await loadDashboard();
  } catch (error) {
    elements.locationFormMessage.textContent = error.message;
    elements.locationFormMessage.dataset.type = 'error';
  }
}

async function createOrder(event) {
  event.preventDefault();
  const formData = new FormData(elements.orderForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    setMessage('Creating order...');
    await requestJson('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    elements.orderForm.reset();
    renderItems();
    setMessage('Order created successfully.', 'success');
    await loadDashboard();
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

async function claimOrder(jobId) {
  try {
    const worker_name = elements.workerName.value || 'Worker';
    const url = jobId ? `/api/orders/${jobId}/claim` : '/api/orders/claim-next';
    await requestJson(url, {
      method: 'POST',
      body: JSON.stringify({ worker_name }),
    });
    await loadDashboard();
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

async function completeOrder(jobId) {
  if (!jobId) return;

  try {
    const worker_name = elements.workerName.value || 'Worker';
    await requestJson(`/api/orders/${jobId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ worker_name }),
    });
    await loadDashboard();
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

async function runSystemAction(action) {
  try {
    await requestJson(`/api/system/${action}`, { method: 'POST' });
    await loadDashboard();
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

roleButtons.forEach((button) => {
  button.addEventListener('click', () => setRole(button.dataset.roleButton));
});

systemActionButtons.forEach((button) => {
  button.addEventListener('click', () => runSystemAction(button.dataset.systemAction));
});

document.querySelector('[data-action="refresh"]').addEventListener('click', loadDashboard);
document.querySelector('[data-action="claim-next"]').addEventListener('click', () => claimOrder());
elements.claimNextButton.addEventListener('click', () => claimOrder());
elements.refreshWorkerButton.addEventListener('click', loadDashboard);
elements.orderForm.addEventListener('submit', createOrder);
elements.itemForm?.addEventListener('submit', createItem);
elements.locationForm?.addEventListener('submit', createLocation);

setRole('manager');
loadDashboard();
setInterval(loadDashboard, 5000);