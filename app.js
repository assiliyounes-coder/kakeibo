/**
 * ══════════════════════════════════════════════════════
 * KAKEIBO — app.js
 * Full Vanilla JS · Mobile First · RTL · MAD Currency
 * ══════════════════════════════════════════════════════
 *
 * ⚙️  CONFIGURATION — CHANGE THIS BEFORE DEPLOYMENT
 * Remplacez cette URL par votre Google Apps Script Web App URL
 * ══════════════════════════════════════════════════════
 */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbw7hmeCP1dC9XEmBSB_pKAJkWYmZqZyM2mfZ_xmAUVjju-86worRW02iuQV6KrU4M-Q4Q/exec';

/** Budget mensuel fixe en MAD */
const MONTHLY_BUDGET = 6000;

/** Icônes et couleurs par catégorie */
const CATEGORIES = {
  Needs:      { emoji: '🏠', color: '#4ecca3', label: 'Needs' },
  Wants:      { emoji: '🛍️', color: '#a78bfa', label: 'Wants' },
  Culture:    { emoji: '📚', color: '#60a5fa', label: 'Culture' },
  Unexpected: { emoji: '⚡', color: '#f87171', label: 'Unexpected' },
};

/* ── State ─────────────────────────────────────── */
let selectedCategory = 'Needs';
let expenses = [];

/* ── DOM Refs ───────────────────────────────────── */
const $ = id => document.getElementById(id);

const DOM = {
  amount:         $('inputAmount'),
  note:           $('inputNote'),
  catPicker:      $('catPicker'),
  btnAdd:         $('btnAdd'),
  btnAddText:     $('btnAddText'),
  btnAddSpinner:  $('btnAddSpinner'),
  btnRefresh:     $('btnRefresh'),
  expenseList:    $('expenseList'),
  loadingList:    $('loadingList'),
  emptyState:     $('emptyState'),
  toast:          $('toast'),
  budgetAmount:   $('budgetAmount'),
  totalSpent:     $('totalSpent'),
  totalRemaining: $('totalRemaining'),
  progressBar:    $('progressBar'),
  progressMeta:   $('progressMeta'),
  catGrid:        $('catGrid'),
  currentMonth:   $('currentMonth'),
};

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  renderCurrentMonth();
  bindEvents();
  loadExpenses();

  // تحديث تلقائي كل 30 ثانية
  setInterval(loadExpenses, 30000);

  // تحديث عند العودة للتطبيق من الخلفية
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadExpenses();
    }
  });
});

/* ══════════════════════════════════════════════════
   EVENTS
══════════════════════════════════════════════════ */
function bindEvents() {
  // Category picker
  DOM.catPicker.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.catPicker.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCategory = btn.dataset.cat;
    });
  });

  // Add button
  DOM.btnAdd.addEventListener('click', handleAdd);

  // Refresh button
  DOM.btnRefresh.addEventListener('click', () => {
    DOM.btnRefresh.style.transform = 'rotate(180deg)';
    loadExpenses().finally(() => {
      setTimeout(() => { DOM.btnRefresh.style.transform = ''; }, 400);
    });
  });

  // Allow Enter on note field to submit
  DOM.note.addEventListener('keypress', e => {
    if (e.key === 'Enter') handleAdd();
  });
}

/* ══════════════════════════════════════════════════
   ADD EXPENSE
══════════════════════════════════════════════════ */
async function handleAdd() {
  const amountRaw = DOM.amount.value.trim();
  const note      = DOM.note.value.trim();

  // Validation
  if (!amountRaw || isNaN(amountRaw) || parseFloat(amountRaw) <= 0) {
    shakeInput(DOM.amount);
    showToast('يرجى إدخال مبلغ صحيح', 'error');
    DOM.amount.focus();
    return;
  }

  const amount = parseFloat(parseFloat(amountRaw).toFixed(2));

  setLoading(true);

  try {
    // POST via fetch — Apps Script web app
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // avoid preflight CORS
      body: JSON.stringify({
        action:    'addExpense',
        montant:   amount,
        categorie: selectedCategory,
        note:      note,
      }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json();

    if (result.status === 'ok') {
      resetForm();
      showToast('✅ تمت الإضافة بنجاح');
      await loadExpenses(); // refresh list + dashboard
    } else {
      throw new Error(result.message || 'خطأ غير معروف');
    }

  } catch (err) {
    console.error('[ADD] Error:', err);

    // ── Offline / Demo mode ──────────────────────
    // إذا لم يتم ربط Apps Script بعد، نعمل locally
    if (GAS_URL.includes('YOUR_SCRIPT_ID') || err.message.includes('Failed to fetch')) {
      const newExpense = {
        date:      new Date().toLocaleDateString('fr-MA'),
        montant:   amount,
        categorie: selectedCategory,
        note:      note,
      };
      expenses.unshift(newExpense);
      if (expenses.length > 20) expenses = expenses.slice(0, 20);
      resetForm();
      renderExpenses();
      updateDashboard();
      showToast('✅ تمت الإضافة (وضع تجريبي)');
    } else {
      showToast('❌ خطأ في الإضافة: ' + err.message, 'error');
    }
  } finally {
    setLoading(false);
  }
}

/* ══════════════════════════════════════════════════
   LOAD EXPENSES (GET)
══════════════════════════════════════════════════ */
async function loadExpenses() {
  showListLoading(true);

  try {
    const url = `${GAS_URL}?action=getExpenses&t=${Date.now()}`; // cache bust
    const response = await fetch(url);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json();

    if (result.status === 'ok') {
      expenses = result.data || [];
      renderExpenses();
      updateDashboard();
    } else {
      throw new Error(result.message);
    }

  } catch (err) {
    console.warn('[LOAD] Falling back to local data:', err.message);
    // Si API pas encore configurée → affiche données locales en mémoire
    renderExpenses();
    updateDashboard();
  } finally {
    showListLoading(false);
  }
}

/* ══════════════════════════════════════════════════
   RENDER EXPENSES LIST
══════════════════════════════════════════════════ */
function renderExpenses() {
  const list = DOM.expenseList;
  list.innerHTML = '';

  if (!expenses.length) {
    DOM.emptyState.classList.remove('hidden');
    return;
  }

  DOM.emptyState.classList.add('hidden');

  // Afficher les 20 dernières
  const recent = expenses.slice(0, 20);

  recent.forEach(exp => {
    const cat  = CATEGORIES[exp.categorie] || CATEGORIES['Needs'];
    const li   = document.createElement('li');
    li.className = 'expense-item';

    li.innerHTML = `
      <div class="expense-left">
        <div class="expense-cat-icon ${exp.categorie}">
          ${cat.emoji}
        </div>
        <div class="expense-info">
          <div class="expense-cat ${exp.categorie}">${exp.categorie}</div>
          <div class="expense-note">${exp.note || '—'}</div>
        </div>
      </div>
      <div class="expense-right">
        <div class="expense-amount">${formatAmount(exp.montant)}</div>
        <div class="expense-date">${formatDate(exp.date)}</div>
      </div>
    `;

    list.appendChild(li);
  });
}

/* ══════════════════════════════════════════════════
   DASHBOARD — TOTALS + PROGRESS + CATEGORY BREAKDOWN
══════════════════════════════════════════════════ */
function updateDashboard() {
  // Calculer le mois courant
  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();

  // Filtrer les dépenses du mois courant
  const monthExpenses = expenses.filter(exp => {
    const d = parseExpenseDate(exp.date);
    return d && d.getMonth() === month && d.getFullYear() === year;
  });

  // Totaux
  const total    = monthExpenses.reduce((s, e) => s + parseFloat(e.montant || 0), 0);
  const remaining = MONTHLY_BUDGET - total;
  const pct       = Math.min((total / MONTHLY_BUDGET) * 100, 100);

  // Cards
  DOM.totalSpent.textContent     = formatNumber(total);
  DOM.totalRemaining.textContent = formatNumber(Math.max(remaining, 0));

  // Progress bar
  DOM.progressBar.style.width = `${pct}%`;
  DOM.progressBar.classList.toggle('danger', pct >= 90);
  DOM.progressMeta.textContent = `${pct.toFixed(0)}% من الميزانية مستهلك`;

  // Category breakdown
  renderCategoryBreakdown(monthExpenses, total);
}

function renderCategoryBreakdown(monthExpenses, total) {
  const grid = DOM.catGrid;
  grid.innerHTML = '';

  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const catTotal = monthExpenses
      .filter(e => e.categorie === key)
      .reduce((s, e) => s + parseFloat(e.montant || 0), 0);

    const pct = total > 0 ? (catTotal / total) * 100 : 0;

    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <div class="cat-row-label">
        <span class="cat-dot" style="background:${cat.color}"></span>
        <span>${cat.emoji} ${key}</span>
      </div>
      <div class="cat-row-bar-wrap">
        <div class="cat-row-bar" style="width:${pct}%;background:${cat.color}"></div>
      </div>
      <div class="cat-row-amount">${formatNumber(catTotal)}</div>
    `;
    grid.appendChild(row);
  });
}

/* ══════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════ */

/** Formater un montant en MAD */
function formatAmount(val) {
  const n = parseFloat(val) || 0;
  return `${formatNumber(n)} MAD`;
}

/** Formater un nombre avec séparateurs */
function formatNumber(n) {
  return new Intl.NumberFormat('fr-MA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Formater une date affichée */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = parseExpenseDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' });
}

/** Parser une date depuis différents formats */
function parseExpenseDate(dateStr) {
  if (!dateStr) return null;
  // Tenter le format JS standard
  const d = new Date(dateStr);
  if (!isNaN(d)) return d;

  // Format dd/mm/yyyy
  const parts = String(dateStr).split('/');
  if (parts.length === 3) {
    const [day, mon, yr] = parts;
    return new Date(`${yr}-${mon.padStart(2,'0')}-${day.padStart(2,'0')}`);
  }
  return null;
}

/** Afficher le mois courant dans le header */
function renderCurrentMonth() {
  const now = new Date();
  DOM.currentMonth.textContent = now.toLocaleDateString('ar-MA', {
    month: 'long', year: 'numeric'
  });
}

/** Toast notification */
let toastTimer;
function showToast(msg, type = 'success') {
  clearTimeout(toastTimer);
  DOM.toast.textContent = msg;
  DOM.toast.className   = `toast show${type === 'error' ? ' error' : ''}`;
  toastTimer = setTimeout(() => {
    DOM.toast.classList.remove('show');
  }, 3000);
}

/** Animation shake sur input invalide */
function shakeInput(el) {
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'shake 0.4s ease';
  el.addEventListener('animationend', () => { el.style.animation = ''; }, { once: true });
}

// Injection de l'animation shake dans le CSS
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
@keyframes shake {
  0%,100% { transform: translateX(0); }
  20%,60%  { transform: translateX(-8px); }
  40%,80%  { transform: translateX(8px); }
}`;
document.head.appendChild(shakeStyle);

/** État de chargement du bouton */
function setLoading(state) {
  DOM.btnAdd.disabled = state;
  DOM.btnAddText.classList.toggle('hidden', state);
  DOM.btnAddSpinner.classList.toggle('hidden', !state);
}

/** État de chargement de la liste */
function showListLoading(state) {
  DOM.loadingList.classList.toggle('hidden', !state);
}

/** Reset le formulaire */
function resetForm() {
  DOM.amount.value = '';
  DOM.note.value   = '';
  // Reset catégorie → Needs
  DOM.catPicker.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  DOM.catPicker.querySelector('[data-cat="Needs"]').classList.add('active');
  selectedCategory = 'Needs';
  DOM.amount.focus();
}
