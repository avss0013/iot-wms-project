const state = {
  role: 'manager',
  summary: {},
  orders: [],
  items: [],
  locations: [],
  alarms: [],
  system: { status: 'IDLE', active_order_id: null },
  offlineScanQueue: [],
  scanner: {
    active: false,
    detector: null,
    stream: null,
    frameHandle: null,
    lastDetectedValue: '',
  },
  installPromptEvent: null,
};

const STORAGE_KEYS = {
  dashboard: 'iwms.dashboard.snapshot',
  scanQueue: 'iwms.qr.scan.queue',
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
  jobTypeSelect: document.getElementById('jobTypeSelect'),
  itemLabelWrapper: document.getElementById('itemLabelWrapper'),
  rackLabelWrapper: document.getElementById('rackLabelWrapper'),
  rackSelect: document.getElementById('rackSelect'),
  qrScannerViewport: document.getElementById('qrScannerViewport'),
  qrScannerVideo: document.getElementById('qrScannerVideo'),
  qrScannerStatus: document.getElementById('qrScannerStatus'),
  qrScanForm: document.getElementById('qrScanForm'),
  qrCodeDataInput: document.getElementById('qrCodeDataInput'),
  qrJobSelect: document.getElementById('qrJobSelect'),
  qrQuantityInput: document.getElementById('qrQuantityInput'),
  qrScanMessage: document.getElementById('qrScanMessage'),
  startScannerButton: document.getElementById('startScannerButton'),
  stopScannerButton: document.getElementById('stopScannerButton'),
  scanImageButton: document.getElementById('scanImageButton'),
  scanImageInput: document.getElementById('scanImageInput'),
  installButton: document.getElementById('installButton'),
  ordersChartCtx: document.getElementById('ordersChart')?.getContext('2d'),
  statusChartCtx: document.getElementById('statusChart')?.getContext('2d'),
};

// Chart instances for managing lifecycle
let ordersChartInstance = null;
let statusChartInstance = null;

const roleButtons = document.querySelectorAll('[data-role-button]');
const viewPanels = document.querySelectorAll('[data-view]');
const systemActionButtons = document.querySelectorAll('[data-system-action]');

function readStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures in private browsing or when quota is full.
  }
}

function persistDashboardSnapshot() {
  writeStoredJson(STORAGE_KEYS.dashboard, {
    summary: state.summary,
    orders: state.orders,
    items: state.items,
    locations: state.locations,
    alarms: state.alarms,
    system: state.system,
  });
}

function hydrateDashboardSnapshot() {
  const snapshot = readStoredJson(STORAGE_KEYS.dashboard, null);
  if (!snapshot) return false;

  state.summary = snapshot.summary || {};
  state.orders = Array.isArray(snapshot.orders) ? snapshot.orders : [];
  state.items = Array.isArray(snapshot.items) ? snapshot.items : [];
  state.locations = Array.isArray(snapshot.locations) ? snapshot.locations : [];
  state.alarms = Array.isArray(snapshot.alarms) ? snapshot.alarms : [];
  state.system = snapshot.system || { status: 'IDLE', active_order_id: null };
  return true;
}

function persistOfflineQueue() {
  writeStoredJson(STORAGE_KEYS.scanQueue, state.offlineScanQueue);
}

function hydrateOfflineQueue() {
  const queued = readStoredJson(STORAGE_KEYS.scanQueue, []);
  state.offlineScanQueue = Array.isArray(queued) ? queued : [];
}

function setScanMessage(message, type = 'info') {
  if (!elements.qrScanMessage) return;
  elements.qrScanMessage.textContent = message;
  elements.qrScanMessage.dataset.type = type;
}

function setScannerStatus(message, active = false) {
  if (elements.qrScannerStatus) {
    elements.qrScannerStatus.textContent = message;
  }
  if (elements.qrScannerViewport) {
    elements.qrScannerViewport.classList.toggle('is-scanning', active);
  }
}

function setScanInputValue(value) {
  if (!elements.qrCodeDataInput) return;
  elements.qrCodeDataInput.value = value;
}

function isOfflineNetworkError(error) {
  const message = String(error?.message || '');
  return !navigator.onLine || /Failed to fetch|NetworkError|Load failed|Network request failed/i.test(message);
}

function getQueuedScanPayloads() {
  return state.offlineScanQueue.slice();
}

function enqueueScan(payload) {
  state.offlineScanQueue.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    payload,
    createdAt: new Date().toISOString(),
  });
  persistOfflineQueue();
}

async function flushQueuedScans() {
  if (!navigator.onLine || !state.offlineScanQueue.length) return;

  const queue = getQueuedScanPayloads();
  const remaining = [];

  for (const [index, entry] of queue.entries()) {
    try {
      await requestJson('/api/qr/read', {
        method: 'POST',
        body: JSON.stringify(entry.payload),
      });
    } catch (error) {
      if (isOfflineNetworkError(error)) {
        remaining.push(entry);
        remaining.push(...queue.slice(index + 1));
        setScanMessage('Offline again. The remaining scans stay queued.', 'warning');
        break;
      }
      setScanMessage(`Queued QR scan ${entry.id} could not sync: ${error.message}`, 'error');
    }
  }

  state.offlineScanQueue = remaining;
  persistOfflineQueue();

  if (!remaining.length && queue.length) {
    setScanMessage('Queued QR scans synced successfully.', 'success');
    await loadDashboard(true);
  }
}

function renderQrJobOptions() {
  if (!elements.qrJobSelect) return;

  const scanableOrders = state.orders.filter((order) => order.status !== 'Completed');
  const preferredOrder = String(state.system.active_order_id ?? '');

  if (!scanableOrders.length) {
    elements.qrJobSelect.innerHTML = '<option value="">No active jobs available</option>';
    return;
  }

  elements.qrJobSelect.innerHTML = scanableOrders
    .map((order) => {
      const selected = preferredOrder && String(order.job_id) === preferredOrder ? ' selected' : '';
      const label = `#${order.job_id} ${order.job_type} · ${itemLabel(order.item_id)}`;
      return `<option value="${order.job_id}"${selected}>${escapeHtml(label)}</option>`;
    })
    .join('');

  if (!elements.qrJobSelect.value && scanableOrders[0]) {
    elements.qrJobSelect.value = String(scanableOrders[0].job_id);
  }
}

function updateInstallPromptVisibility() {
  if (!elements.installButton) return;
  elements.installButton.hidden = !state.installPromptEvent;
}

function setOnlineState() {
  if (!elements.qrScannerStatus) return;
  if (navigator.onLine) {
    elements.qrScannerStatus.dataset.connection = 'online';
    if (!state.scanner.active) {
      setScannerStatus('Camera idle', false);
    }
  } else {
    elements.qrScannerStatus.dataset.connection = 'offline';
    setScannerStatus('Offline mode active. Scans will queue until the connection returns.', false);
  }
}

function createBarcodeDetector() {
  if (!('BarcodeDetector' in window)) return null;

  try {
    return new BarcodeDetector({ formats: ['qr_code'] });
  } catch {
    return new BarcodeDetector();
  }
}

async function detectQrFromImage(file) {
  const detector = state.scanner.detector || createBarcodeDetector();
  if (!detector) {
    throw new Error('This browser does not support QR detection from images.');
  }

  state.scanner.detector = detector;
  const bitmap = typeof createImageBitmap === 'function' ? await createImageBitmap(file) : null;
  try {
    if (bitmap) {
      const barcodes = await detector.detect(bitmap);
      if (!barcodes.length) {
        throw new Error('No QR code was detected in that image.');
      }
      handleDetectedQr(barcodes[0].rawValue);
      return;
    }

    const image = new Image();
    image.src = URL.createObjectURL(file);
    await image.decode();
    const barcodes = await detector.detect(image);
    if (!barcodes.length) {
      throw new Error('No QR code was detected in that image.');
    }
    handleDetectedQr(barcodes[0].rawValue);
  } finally {
    bitmap?.close?.();
  }
}

function stopQrScanner(message = 'Camera idle') {
  state.scanner.active = false;
  if (state.scanner.frameHandle) {
    clearTimeout(state.scanner.frameHandle);
    state.scanner.frameHandle = null;
  }

  if (state.scanner.stream) {
    state.scanner.stream.getTracks().forEach((track) => track.stop());
    state.scanner.stream = null;
  }

  if (elements.qrScannerVideo) {
    elements.qrScannerVideo.srcObject = null;
  }

  setScannerStatus(message, false);
}

function handleDetectedQr(value) {
  const code = String(value || '').trim();
  if (!code) return;

  state.scanner.lastDetectedValue = code;
  setScanInputValue(code);
  setScanMessage(`Captured ${code}. Confirm the job to log it.`, 'success');
  stopQrScanner('QR code captured');
}

async function scanFrame() {
  if (!state.scanner.active || !elements.qrScannerVideo || !state.scanner.detector) return;

  try {
    const barcodes = await state.scanner.detector.detect(elements.qrScannerVideo);
    if (barcodes.length) {
      handleDetectedQr(barcodes[0].rawValue);
      return;
    }
  } catch (error) {
    setScannerStatus(error.message || 'Unable to scan the current frame.', false);
    stopQrScanner('Camera idle');
    return;
  }

  state.scanner.frameHandle = window.setTimeout(scanFrame, 220);
}

async function startQrScanner() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setScanMessage('Camera access is not available in this browser.', 'error');
    return;
  }

  const detector = state.scanner.detector || createBarcodeDetector();
  if (!detector) {
    setScanMessage('This browser does not support live QR detection. Use the image picker or type the code manually.', 'error');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });

    state.scanner.detector = detector;
    state.scanner.stream = stream;
    state.scanner.active = true;

    if (elements.qrScannerVideo) {
      elements.qrScannerVideo.srcObject = stream;
      await elements.qrScannerVideo.play();
    }

    setScannerStatus('Scanning for QR codes...', true);
    setScanMessage('Camera started. Hold the QR code inside the frame.', 'info');
    scanFrame();
  } catch (error) {
    stopQrScanner('Camera idle');
    setScanMessage(error.message || 'Unable to start the camera.', 'error');
  }
}

function hydrateLiveState() {
  hydrateDashboardSnapshot();
  hydrateOfflineQueue();
  renderQrJobOptions();
  renderSystem();
  renderMetrics();
  renderItems();
  renderLocationSelects();
  renderLocations();
  renderAlarms();
  renderOrders();
  renderShelf();
  renderCharts();
}

function setRole(role) {
  state.role = role;
  roleButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.roleButton === role));
  viewPanels.forEach((panel) => panel.classList.toggle('is-visible', panel.dataset.view === role));
}

function statusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('progress') || normalized.includes('scanned') || normalized.includes('partial')) return 'status-progress';
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
            <div class="shelf-content">
              <strong>${escapeHtml(location.description || location.id || 'Rack')}</strong>
              <div class="shelf-count">${itemsInRack}</div>
              <small>${itemsInRack} item${itemsInRack !== 1 ? 's' : ''}</small>
            </div>
          </div>
        `;
      },
    )
    .join('');
}

function renderRackSelect() {
  if (!elements.rackSelect) return;
  elements.rackSelect.innerHTML = state.locations.length
    ? state.locations
        .map((location) => {
          const itemsInRack = state.items.filter(
            (item) => Number(item.location_id) === Number(location.location_id || location.id),
          ).length;
          const label = `${location.description || location.id || 'Rack'} (${itemsInRack} items)`;
          return `<option value="${location.location_id || location.id}">${escapeHtml(label)}</option>`;
        })
        .join('')
    : '<option value="">No racks available</option>';
}

function toggleJobTypeFields() {
  const selectedType = elements.jobTypeSelect?.value;
  if (selectedType === 'count') {
    elements.itemLabelWrapper.style.display = 'none';
    elements.rackLabelWrapper.style.display = 'block';
    elements.itemSelect.removeAttribute('required');
    elements.rackSelect.setAttribute('required', 'required');
  } else {
    elements.itemLabelWrapper.style.display = 'block';
    elements.rackLabelWrapper.style.display = 'none';
    elements.itemSelect.setAttribute('required', 'required');
    elements.rackSelect.removeAttribute('required');
  }
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
      const normalizedStatus = String(order.status || '').toLowerCase();

      if (normalizedStatus === 'pending') {
        actions.push(`<button class="secondary order-claim" data-order-id="${order.job_id}" type="button">Claim</button>`);
      }

      if (normalizedStatus === 'awaiting scan') {
        actions.push('<span class="form-message" data-type="info">Scan bundle RFID to start</span>');
      }

      if (['in progress', 'at location', 'item scanned', 'partially picked'].includes(normalizedStatus)) {
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
                String(order.status || '').toLowerCase() === 'pending'
                  ? `<button class="secondary queue-claim" data-order-id="${order.job_id}" type="button">Claim</button>`
                  : String(order.status || '').toLowerCase() === 'awaiting scan'
                    ? `<span class="form-message" data-type="info">Scan to confirm</span>`
                    : `<button class="secondary queue-complete" data-order-id="${order.job_id}" type="button">Complete</button>`
              }
            </article>
          `,
        )
        .join('')
    : '<div class="empty-state">No work queued.</div>';

  renderQrJobOptions();
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

async function loadDashboard(preserveMessages = false) {
  const snapshot = preserveMessages ? readStoredJson(STORAGE_KEYS.dashboard, null) : null;
  const [summaryResult, systemResult, ordersResult, itemsResult, locationsResult, alarmsResult] = await Promise.allSettled([
    requestJson('/api/dashboard/summary'),
    requestJson('/api/system/status'),
    requestJson('/api/orders'),
    requestJson('/api/items'),
    requestJson('/api/storage/locations'),
    requestJson('/api/alarms'),
  ]);

  state.summary = summaryResult.status === 'fulfilled' ? summaryResult.value : snapshot?.summary || state.summary || {};
  state.system = systemResult.status === 'fulfilled' ? systemResult.value : snapshot?.system || state.system || { status: 'IDLE', active_order_id: null };
  state.orders = ordersResult.status === 'fulfilled' ? ordersResult.value : snapshot?.orders || state.orders || [];
  state.items = itemsResult.status === 'fulfilled' ? itemsResult.value : snapshot?.items || state.items || [];
  state.locations = locationsResult.status === 'fulfilled' ? locationsResult.value : snapshot?.locations || state.locations || [];
  state.alarms = alarmsResult.status === 'fulfilled' ? alarmsResult.value : snapshot?.alarms || state.alarms || [];

  persistDashboardSnapshot();
  renderSystem();
  renderMetrics();
  renderItems();
  renderLocationSelects();
  renderLocations();
  renderAlarms();
  renderOrders();
  renderRackSelect();
  renderShelf();
  renderCharts();
  bindTableActions();
  renderQrJobOptions();

  if (!preserveMessages) {
    await flushQueuedScans();
  }
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

  payload.require_scan = true;
  payload.requested_quantity = payload.requested_quantity ? Number.parseInt(payload.requested_quantity, 10) : null;

  try {
    setMessage('Creating order...');
    const response = await requestJson('/api/orders', {
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

async function submitQrScan(event) {
  event.preventDefault();

  const formData = new FormData(elements.qrScanForm);
  const payload = Object.fromEntries(formData.entries());
  payload.job_id = payload.job_id ? Number.parseInt(payload.job_id, 10) : null;
  payload.quantity = payload.quantity ? Number.parseInt(payload.quantity, 10) : null;
  payload.worker_name = (elements.workerName?.value || 'Worker').trim() || 'Worker';

  if (!payload.qr_code_data) {
    setScanMessage('Scan or enter a QR code first.', 'error');
    return;
  }

  if (!payload.job_id) {
    setScanMessage('Choose the job this scan belongs to.', 'error');
    return;
  }

  try {
    setScanMessage('Submitting QR scan...', 'info');
    await requestJson('/api/qr/read', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setScanMessage('QR scan logged successfully.', 'success');
    elements.qrScanForm.reset();
    elements.qrQuantityInput.value = '1';
    await loadDashboard();
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      enqueueScan(payload);
      setScanMessage('Offline right now. The scan has been queued and will sync when you reconnect.', 'warning');
      return;
    }

    setScanMessage(error.message, 'error');
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
elements.jobTypeSelect?.addEventListener('change', toggleJobTypeFields);
elements.itemForm?.addEventListener('submit', createItem);
elements.locationForm?.addEventListener('submit', createLocation);
elements.qrScanForm?.addEventListener('submit', submitQrScan);
elements.startScannerButton?.addEventListener('click', startQrScanner);
elements.stopScannerButton?.addEventListener('click', () => stopQrScanner());
elements.scanImageButton?.addEventListener('click', () => elements.scanImageInput?.click());
elements.scanImageInput?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    setScanMessage('Scanning image...', 'info');
    await detectQrFromImage(file);
  } catch (error) {
    setScanMessage(error.message, 'error');
  } finally {
    event.target.value = '';
  }
});

elements.installButton?.addEventListener('click', async () => {
  if (!state.installPromptEvent) return;

  state.installPromptEvent.prompt();
  await state.installPromptEvent.userChoice;
  state.installPromptEvent = null;
  updateInstallPromptVisibility();
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.installPromptEvent = event;
  updateInstallPromptVisibility();
});

window.addEventListener('appinstalled', () => {
  state.installPromptEvent = null;
  updateInstallPromptVisibility();
});

window.addEventListener('online', async () => {
  setOnlineState();
  await flushQueuedScans();
});

window.addEventListener('offline', setOnlineState);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((error) => {
    console.warn('Service worker registration failed:', error);
  });
}

setRole('manager');
hydrateLiveState();
setOnlineState();
updateInstallPromptVisibility();
loadDashboard();
setInterval(loadDashboard, 5000);