const stateKey = 'judes-timekeeper-v1';

const state = loadState();

const entriesTable = document.querySelector('#entries-table tbody');
const clientsTable = document.querySelector('#clients-table tbody');
const invoicesTable = document.querySelector('#invoices-table tbody');
const paymentsTable = document.querySelector('#payments-table tbody');
const owedTable = document.querySelector('#owed-table tbody');

const entryModal = document.querySelector('#entry-modal');
const clientModal = document.querySelector('#client-modal');
const invoiceModal = document.querySelector('#invoice-modal');
const paymentModal = document.querySelector('#payment-modal');
const invoicePrint = document.querySelector('#invoice-print');
const invoicePrintContent = document.querySelector('#invoice-print-content');

const entryClientSelect = document.querySelector('#entry-client');
const invoiceClientSelect = document.querySelector('#invoice-client');
const paymentClientSelect = document.querySelector('#payment-client');

const today = new Date();
let lastInvoiceHTML = '';
const saveStamp = document.querySelector('#save-stamp');
const loadStamp = document.querySelector('#load-stamp');
const stampKey = 'judes-timekeeper-stamps';

const githubStamp = document.querySelector('#github-stamp');
const githubTokenKey = 'judes-timekeeper-github-token';
const githubConfig = {
  owner: 'thinker270178-creator',
  repo: 'judes-timekeeper',
  branch: 'main',
  path: 'judes-timekeeper-data.json'
};
const autoBackupDelayMs = 800;
let backupPending = false;

document.querySelector('#add-entry').addEventListener('click', () => {
  fillClientOptions();
  document.querySelector('#entry-date').value = toDateInput(today);
  entryModal.showModal();
});

document.querySelector('#add-client').addEventListener('click', () => {
  clientModal.showModal();
});

document.querySelector('#add-invoice').addEventListener('click', () => {
  fillClientOptions();
  document.querySelector('#invoice-number').value = makeInvoiceNumber();
  document.querySelector('#invoice-start').value = toDateInput(today);
  document.querySelector('#invoice-end').value = toDateInput(today);
  invoiceModal.showModal();
});

document.querySelector('#add-payment').addEventListener('click', () => {
  fillClientOptions();
  document.querySelector('#payment-date').value = toDateInput(today);
  paymentModal.showModal();
});

document.querySelector('#close-print').addEventListener('click', () => invoicePrint.close());
document.querySelector('#print-invoice').addEventListener('click', () => openPrintWindow());
document.querySelector('#backup-close').addEventListener('click', () => backupAndClose());

document.querySelector('#search-entries').addEventListener('input', () => renderEntries());
document.querySelector('#search-clients').addEventListener('input', () => renderClients());
document.querySelector('#search-invoices').addEventListener('input', () => renderInvoices());
document.querySelector('#search-owed').addEventListener('input', () => renderOwed());
document.querySelector('#search-payments').addEventListener('input', () => renderPayments());

setupTabs();
renderAll();
restoreStamps();
restoreGitHubStamp();

// Forms

document.querySelector('#entry-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const entry = {
    id: makeId(),
    date: document.querySelector('#entry-date').value,
    hours: Number(document.querySelector('#entry-hours').value),
    clientId: entryClientSelect.value || null,
    notes: document.querySelector('#entry-notes').value.trim()
  };
  state.entries.push(entry);
  saveState();
  entryModal.close();
  event.target.reset();
  renderAll();
});

document.querySelector('#client-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const client = {
    id: makeId(),
    name: document.querySelector('#client-name').value.trim(),
    rate: Number(document.querySelector('#client-rate').value),
    notes: document.querySelector('#client-notes').value.trim()
  };
  state.clients.push(client);
  saveState();
  clientModal.close();
  event.target.reset();
  renderAll();
});

document.querySelector('#invoice-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const clientId = invoiceClientSelect.value || null;
  const startDate = document.querySelector('#invoice-start').value;
  const endDate = document.querySelector('#invoice-end').value;
  const number = document.querySelector('#invoice-number').value.trim();
  const notes = document.querySelector('#invoice-notes').value.trim();
  const entries = filterEntries(clientId, startDate, endDate);
  const total = entries.reduce((sum, entry) => sum + entry.hours * getClientRate(entry.clientId), 0);

  const invoice = {
    id: makeId(),
    number,
    clientId,
    startDate,
    endDate,
    notes,
    total
  };
  state.invoices.push(invoice);
  saveState();
  invoiceModal.close();
  event.target.reset();
  renderAll();
  showInvoice(invoice, entries);
});

document.querySelector('#payment-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const payment = {
    id: makeId(),
    date: document.querySelector('#payment-date').value,
    clientId: paymentClientSelect.value || null,
    method: document.querySelector('#payment-method').value,
    amount: Number(document.querySelector('#payment-amount').value),
    notes: document.querySelector('#payment-notes').value.trim()
  };
  state.payments.push(payment);
  saveState();
  paymentModal.close();
  event.target.reset();
  renderAll();
});

// Export/import

document.querySelector('#export-data').addEventListener('click', () => {
  downloadBackup();
});

document.querySelector('#export-github').addEventListener('click', () => {
  saveToGitHub();
});

document.querySelector('#import-data').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      state.clients = parsed.clients || [];
      state.entries = parsed.entries || [];
      state.invoices = parsed.invoices || [];
      state.payments = parsed.payments || [];
      saveState();
      renderAll();
      setStamp('load', new Date());
    } catch {
      alert('Invalid JSON file');
    }
  };
  reader.readAsText(file);
});

function loadState() {
  const raw = localStorage.getItem(stateKey);
  if (!raw) {
    return { clients: [], entries: [], invoices: [], payments: [] };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { clients: [], entries: [], invoices: [], payments: [] };
  }
}

function saveState() {
  localStorage.setItem(stateKey, JSON.stringify(state));
  scheduleAutoBackup();
}

function renderAll() {
  renderClients();
  renderEntries();
  renderInvoices();
  renderPayments();
  renderStats();
  renderOwed();
}

function renderEntries() {
  entriesTable.innerHTML = '';
  const query = getSearchValue('search-entries');
  state.entries
    .filter(entry => matchesQuery([
      entry.date,
      entry.hours,
      getClientName(entry.clientId),
      entry.notes
    ], query))
    .sort((a, b) => {
      const nameA = getClientName(a.clientId).toLowerCase();
      const nameB = getClientName(b.clientId).toLowerCase();
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      return a.date.localeCompare(b.date);
    })
    .forEach(entry => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${entry.date}</td>
        <td>${entry.hours.toFixed(2)}</td>
        <td>${getClientName(entry.clientId)}</td>
        <td>${entry.notes || ''}</td>
        <td class="table-actions"><button class="ghost" data-del-entry="${entry.id}">Delete</button></td>
      `;
      entriesTable.appendChild(tr);
    });

  entriesTable.querySelectorAll('[data-del-entry]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.delEntry;
      state.entries = state.entries.filter(e => e.id !== id);
      saveState();
      renderAll();
    });
  });
}

function renderClients() {
  clientsTable.innerHTML = '';
  const query = getSearchValue('search-clients');
  state.clients
    .filter(client => matchesQuery([client.name, client.rate, client.notes], query))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(client => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${client.name}</td>
        <td>${formatCurrency(client.rate)}</td>
        <td>${client.notes || ''}</td>
        <td class="table-actions"><button class="ghost" data-del-client="${client.id}">Delete</button></td>
      `;
      clientsTable.appendChild(tr);
    });

  clientsTable.querySelectorAll('[data-del-client]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.delClient;
      state.clients = state.clients.filter(c => c.id !== id);
      state.entries = state.entries.filter(e => e.clientId !== id);
      state.invoices = state.invoices.filter(i => i.clientId !== id);
      state.payments = state.payments.filter(p => p.clientId !== id);
      saveState();
      renderAll();
    });
  });
}

function renderInvoices() {
  invoicesTable.innerHTML = '';
  const query = getSearchValue('search-invoices');
  state.invoices
    .filter(invoice => matchesQuery([
      invoice.number,
      getClientName(invoice.clientId),
      invoice.startDate,
      invoice.endDate,
      invoice.total
    ], query))
    .sort((a, b) => {
      const nameA = getClientName(a.clientId).toLowerCase();
      const nameB = getClientName(b.clientId).toLowerCase();
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      return a.startDate.localeCompare(b.startDate);
    })
    .forEach(invoice => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${invoice.number}</td>
        <td>${getClientName(invoice.clientId)}</td>
        <td>${invoice.startDate} → ${invoice.endDate}</td>
        <td>${formatCurrency(invoice.total)}</td>
        <td class="table-actions"><button class="ghost" data-print-invoice="${invoice.id}">Print</button><button class="ghost" data-del-invoice="${invoice.id}">Delete</button></td>
      `;
      invoicesTable.appendChild(tr);
    });

  invoicesTable.querySelectorAll('[data-del-invoice]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.delInvoice;
      state.invoices = state.invoices.filter(i => i.id !== id);
      saveState();
      renderAll();
    });
  });

  invoicesTable.querySelectorAll('[data-print-invoice]').forEach(btn => {
    btn.addEventListener('click', () => {
      const invoice = state.invoices.find(i => i.id === btn.dataset.printInvoice);
      if (!invoice) return;
      const entries = filterEntries(invoice.clientId, invoice.startDate, invoice.endDate);
      showInvoice(invoice, entries);
    });
  });
}

function renderPayments() {
  paymentsTable.innerHTML = '';
  const query = getSearchValue('search-payments');
  state.payments
    .filter(payment => matchesQuery([
      payment.date,
      getClientName(payment.clientId),
      payment.method,
      payment.amount,
      payment.notes
    ], query))
    .sort((a, b) => {
      const nameA = getClientName(a.clientId).toLowerCase();
      const nameB = getClientName(b.clientId).toLowerCase();
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      return a.date.localeCompare(b.date);
    })
    .forEach(payment => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${payment.date}</td>
        <td>${getClientName(payment.clientId)}</td>
        <td>${payment.method}</td>
        <td>${formatCurrency(payment.amount)}</td>
        <td>${payment.notes || ''}</td>
        <td class="table-actions"><button class="ghost" data-del-payment="${payment.id}">Delete</button></td>
      `;
      paymentsTable.appendChild(tr);
    });

  paymentsTable.querySelectorAll('[data-del-payment]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.delPayment;
      state.payments = state.payments.filter(p => p.id !== id);
      saveState();
      renderAll();
    });
  });
}

function renderStats() {
  const todayIncome = state.entries
    .filter(e => e.date === toDateInput(new Date()))
    .reduce((sum, e) => sum + e.hours * getClientRate(e.clientId), 0);

  const month = new Date().toISOString().slice(0, 7);
  const monthIncome = state.entries
    .filter(e => e.date.startsWith(month))
    .reduce((sum, e) => sum + e.hours * getClientRate(e.clientId), 0);

  const year = new Date().toISOString().slice(0, 4);
  const yearIncome = state.entries
    .filter(e => e.date.startsWith(year))
    .reduce((sum, e) => sum + e.hours * getClientRate(e.clientId), 0);

  const invoiced = state.entries.reduce((sum, entry) => sum + entry.hours * getClientRate(entry.clientId), 0);
  const paid = state.payments.reduce((sum, p) => sum + p.amount, 0);
  const owed = Math.max(invoiced - paid, 0);

  document.querySelector('#stat-today').textContent = formatCurrency(todayIncome);
  document.querySelector('#stat-month').textContent = formatCurrency(monthIncome);
  document.querySelector('#stat-year').textContent = formatCurrency(yearIncome);
  document.querySelector('#stat-owed').textContent = formatCurrency(owed);

  renderStatsChart({
    today: todayIncome,
    month: monthIncome,
    year: yearIncome,
    owed
  });
  renderClientPie();
}

function renderStatsChart({ today, month, year, owed }) {
  const chart = document.querySelector('#stats-chart');
  if (!chart) return;
  const values = [today, month, year, owed];
  const max = Math.max(...values, 1);
  chart.innerHTML = `
    <div class="chart-bar blue">
      <div class="label">Today</div>
      <div class="value">${formatCurrency(today)}</div>
      <div class="bar" style="width:${(today / max) * 100}%"></div>
    </div>
    <div class="chart-bar green">
      <div class="label">This Month</div>
      <div class="value">${formatCurrency(month)}</div>
      <div class="bar" style="width:${(month / max) * 100}%"></div>
    </div>
    <div class="chart-bar orange">
      <div class="label">This Year</div>
      <div class="value">${formatCurrency(year)}</div>
      <div class="bar" style="width:${(year / max) * 100}%"></div>
    </div>
    <div class="chart-bar purple">
      <div class="label">Money Owed</div>
      <div class="value">${formatCurrency(owed)}</div>
      <div class="bar" style="width:${(owed / max) * 100}%"></div>
    </div>
  `;
}

function renderClientPie() {
  const pie = document.querySelector('#client-pie');
  const legend = document.querySelector('#client-legend');
  if (!pie || !legend) return;

  const totals = state.clients.map(client => {
    const earned = state.entries
      .filter(e => e.clientId === client.id)
      .reduce((sum, e) => sum + e.hours * getClientRate(e.clientId), 0);
    return { name: client.name, value: earned };
  }).filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);

  if (totals.length === 0) {
    pie.style.background = 'conic-gradient(#1f2937 0deg 360deg)';
    legend.innerHTML = '<div class="pie-item">No client earnings yet.</div>';
    return;
  }

  const colors = ['#2563eb', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#f97316', '#84cc16'];
  const sum = totals.reduce((acc, item) => acc + item.value, 0);
  let current = 0;
  const slices = totals.map((item, index) => {
    const start = current;
    const angle = (item.value / sum) * 360;
    current += angle;
    const color = colors[index % colors.length];
    return { ...item, color, start, end: current };
  });

  pie.style.background = `conic-gradient(${slices.map(s => `${s.color} ${s.start}deg ${s.end}deg`).join(', ')})`;
  legend.innerHTML = slices.map(s => `
    <div class="pie-item">
      <span class="pie-swatch" style="background:${s.color}"></span>
      <span>${s.name}</span>
      <span style="margin-left:auto">${formatCurrency(s.value)}</span>
    </div>
  `).join('');
}

function renderOwed() {
  owedTable.innerHTML = '';
  const query = getSearchValue('search-owed');
  const rows = state.clients.map(client => {
    const earned = state.entries
      .filter(e => e.clientId === client.id)
      .reduce((sum, e) => sum + e.hours * getClientRate(e.clientId), 0);
    const paid = state.payments
      .filter(p => p.clientId === client.id)
      .reduce((sum, p) => sum + p.amount, 0);
    return {
      name: client.name,
      invoiced: earned,
      paid,
      owed: Math.max(earned - paid, 0)
    };
  }).filter(row => row.invoiced > 0 || row.paid > 0 || row.owed > 0)
    .filter(row => matchesQuery([row.name, row.invoiced, row.paid, row.owed], query))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (rows.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4">No outstanding balances yet.</td>`;
    owedTable.appendChild(tr);
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.name}</td>
      <td>${formatCurrency(row.invoiced)}</td>
      <td>${formatCurrency(row.paid)}</td>
      <td><strong>${formatCurrency(row.owed)}</strong></td>
    `;
    owedTable.appendChild(tr);
  });
}

function fillClientOptions() {
  const options = state.clients
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(client => `<option value="${client.id}">${client.name}</option>`)
    .join('');
  entryClientSelect.innerHTML = `<option value="">No Client</option>${options}`;
  invoiceClientSelect.innerHTML = `<option value="">No Client</option>${options}`;
  paymentClientSelect.innerHTML = `<option value="">No Client</option>${options}`;
}

function filterEntries(clientId, start, end) {
  return state.entries.filter(entry => {
    if (clientId && entry.clientId !== clientId) return false;
    return entry.date >= start && entry.date <= end;
  });
}

function getClientRate(clientId) {
  const client = state.clients.find(c => c.id === clientId);
  return client ? client.rate : 0;
}

function getClientName(clientId) {
  const client = state.clients.find(c => c.id === clientId);
  return client ? client.name : 'No Client';
}

function showInvoice(invoice, entries) {
  const clientName = getClientName(invoice.clientId);
  const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const rate = invoice.clientId ? getClientRate(invoice.clientId) : 0;
  const payments = state.payments.filter(p => {
    if (invoice.clientId && p.clientId !== invoice.clientId) return false;
    return p.date >= invoice.startDate && p.date <= invoice.endDate;
  });
  const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  const balanceDue = Math.max(invoice.total - paidTotal, 0);
  const lines = entries.map(entry => {
    const rate = getClientRate(entry.clientId);
    const total = entry.hours * rate;
    return `<tr><td>${entry.date}</td><td>${entry.hours.toFixed(2)}</td><td>${formatCurrency(rate)}</td><td>${formatCurrency(total)}</td></tr>`;
  }).join('');
  const paymentsLines = payments.length
    ? payments.map(p => `<tr><td>${p.date}</td><td>${p.method}</td><td>${p.notes || '-'}</td><td>${formatCurrency(p.amount)}</td></tr>`).join('')
    : `<tr><td colspan="4">No payments recorded</td></tr>`;

  invoicePrintContent.innerHTML = `
    <div class="invoice-page">
      <div class="invoice-header">
        <h2>INVOICE</h2>
        <div class="date">${new Date().toLocaleDateString()}</div>
      </div>
      <div class="invoice-meta">
        <div>
          <h4>Client</h4>
          <p>${clientName}</p>
        </div>
        <div>
          <h4>Hourly Rate</h4>
          <p>${formatCurrency(rate)} / hr</p>
        </div>
        <div>
          <h4>Period</h4>
          <p>${invoice.startDate} → ${invoice.endDate}</p>
        </div>
      </div>

      <div class="invoice-balance">
        <div>Balance Due</div>
        <h3>${formatCurrency(balanceDue)}</h3>
      </div>

      <div class="invoice-section-title">Work History</div>
      <table class="invoice-table">
        <thead><tr><th>Date</th><th>Description</th><th>Hours</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>${entries.map(entry => {
          const rate = getClientRate(entry.clientId);
          const total = entry.hours * rate;
          return `<tr><td>${entry.date}</td><td>${entry.notes || '-'}</td><td>${entry.hours.toFixed(2)}</td><td>${formatCurrency(rate)}</td><td>${formatCurrency(total)}</td></tr>`;
        }).join('')}</tbody>
        <tfoot>
          <tr><td colspan="4">Total Hours</td><td>${totalHours.toFixed(2)}</td></tr>
          <tr><td colspan="4">Total Earned</td><td>${formatCurrency(invoice.total)}</td></tr>
        </tfoot>
      </table>

      <div class="invoice-section-title">Payment History</div>
      <table class="invoice-table">
        <thead><tr><th>Date</th><th>Method</th><th>Notes</th><th>Amount</th></tr></thead>
        <tbody>${paymentsLines}</tbody>
        <tfoot>
          <tr><td colspan="3">Total Paid</td><td>${formatCurrency(paidTotal)}</td></tr>
        </tfoot>
      </table>

      ${invoice.notes ? `<div class="invoice-notes"><strong>Notes:</strong> ${invoice.notes}</div>` : ''}
      <div class="invoice-footer">Thank you for your business. Generated on ${new Date().toLocaleDateString()}.</div>
    </div>
  `;
  lastInvoiceHTML = invoicePrintContent.innerHTML;
  invoicePrint.showModal();
}

function openPrintWindow() {
  if (!lastInvoiceHTML) {
    alert('No invoice data to print. Please generate an invoice first.');
    return;
  }
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Pop-up blocked. Please allow pop-ups to print.');
    return;
  }

  const html = `
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>Invoice</title>
      <style>
        body { background: white; margin: 0; padding: 24px; font-family: "DM Sans", Arial, sans-serif; color: #0f172a; }
        h2,h3,h4 { font-family: "Plus Jakarta Sans", Arial, sans-serif; }
        .invoice-page { background: white; padding: 36px 42px; border-radius: 0; }
        .invoice-header { text-align: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 18px; margin-bottom: 20px; }
        .invoice-header h2 { letter-spacing: 0.12em; font-size: 18px; margin-bottom: 6px; }
        .invoice-header .date { color: #64748b; font-size: 13px; }
        .invoice-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 16px; }
        .invoice-meta h4 { margin: 0 0 6px 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
        .invoice-balance { margin: 18px 0 8px; background: linear-gradient(140deg, #0f172a, #1e293b); color: white; border-radius: 8px; padding: 16px; text-align: center; }
        .invoice-balance h3 { margin: 8px 0 0 0; font-size: 28px; color: #fbbf24; }
        .invoice-section-title { margin: 18px 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
        .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        .invoice-table th, .invoice-table td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; }
        .invoice-table tfoot td { font-weight: 600; }
        .invoice-notes { padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
        .invoice-footer { margin-top: 20px; text-align: center; color: #64748b; font-size: 12px; }
      </style>
    </head>
    <body>
      ${lastInvoiceHTML}
      <script>
        window.onload = () => { window.print(); };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function backupAndClose() {
  downloadBackup();
  setTimeout(() => {
    window.close();
    alert('Backup saved. If the tab did not close, you can close it manually.');
  }, 300);
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'judes-timekeeper-data.json';
  a.click();
  URL.revokeObjectURL(url);
  setStamp('save', new Date());
  backupPending = false;
  updateBackupIndicator();
}
let backupTimer = null;
function scheduleAutoBackup() {
  if (document.visibilityState !== 'visible') return;
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    backupPending = true;
    updateBackupIndicator();
  }, autoBackupDelayMs);
}

function updateBackupIndicator() {
  if (!saveStamp) return;
  if (backupPending) {
    saveStamp.textContent = 'Backup ready';
  } else {
    const existing = JSON.parse(localStorage.getItem(stampKey) || '{}');
    saveStamp.textContent = existing.save || 'Never';
  }
}

function setStamp(type, date) {
  const formatted = new Date(date).toLocaleString();
  if (type === 'save' && saveStamp) saveStamp.textContent = formatted;
  if (type === 'load' && loadStamp) loadStamp.textContent = formatted;
  if (type === 'github' && githubStamp) githubStamp.textContent = formatted;
  const existing = JSON.parse(localStorage.getItem(stampKey) || '{}');
  existing[type] = formatted;
  localStorage.setItem(stampKey, JSON.stringify(existing));
}

function restoreStamps() {
  const existing = JSON.parse(localStorage.getItem(stampKey) || '{}');
  if (saveStamp && existing.save) saveStamp.textContent = existing.save;
  if (loadStamp && existing.load) loadStamp.textContent = existing.load;
  updateBackupIndicator();
}

function restoreGitHubStamp() {
  const existing = JSON.parse(localStorage.getItem(stampKey) || '{}');
  if (githubStamp && existing.github) githubStamp.textContent = existing.github;
}

function getSearchValue(id) {
  const el = document.querySelector(`#${id}`);
  return el ? el.value.trim().toLowerCase() : '';
}

function matchesQuery(fields, query) {
  if (!query) return true;
  return fields.some(field => String(field ?? '').toLowerCase().includes(query));
}


async function saveToGitHub() {
  const token = getGitHubToken();
  if (!token) return;

  const content = JSON.stringify(state, null, 2);
  const base64 = toBase64(content);
  const apiBase = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${githubConfig.path}`;

  let sha = null;
  try {
    const getResp = await fetch(`${apiBase}?ref=${githubConfig.branch}`, {
      headers: { Authorization: `token ${token}` }
    });
    if (getResp.ok) {
      const data = await getResp.json();
      sha = data.sha;
    }
  } catch {}

  const putResp = await fetch(apiBase, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'Backup from Jude's Timekeeper',
      content: base64,
      branch: githubConfig.branch,
      sha: sha || undefined
    })
  });

  if (!putResp.ok) {
    const text = await putResp.text();
    alert('GitHub save failed. Check token permissions.
' + text);
    return;
  }

  setStamp('github', new Date());
  if (githubStamp) githubStamp.textContent = new Date().toLocaleString();
  alert('Saved to GitHub successfully.');
}

function getGitHubToken() {
  let token = localStorage.getItem(githubTokenKey);
  if (!token) {
    token = prompt('Enter your GitHub token (stored locally in this browser):');
    if (!token) return null;
    localStorage.setItem(githubTokenKey, token);
  }
  return token;
}

function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

function toDateInput(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function subtractDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - days);
  return copy;
}

function makeInvoiceNumber() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`#tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}
