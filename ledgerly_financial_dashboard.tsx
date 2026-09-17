import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LayoutDashboard,
  Receipt,
  Repeat,
  CreditCard,
  PieChart,
  Target,
  FileText,
  Sliders,
  Settings as SettingsIcon,
  Plus,
  Upload,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  Trash2,
  Edit2,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  FolderSync,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Calendar,
  Check,
  Tag,
  DollarSign,
  HelpCircle,
  Info
} from 'lucide-react';

const STORAGE_KEY = 'ledgerly_d1_state_v1';

const DEFAULT_CATEGORIES = [
  'Housing',
  'Groceries',
  'Shopping',
  'Dining',
  'Transportation',
  'Utilities',
  'Subscriptions',
  'Insurance',
  'Health',
  'Entertainment',
  'Income',
  'Needs review',
  'Other'
];

const DEFAULT_ACCOUNTS = [
  'Main Checking',
  'Everyday Visa',
  'Rewards Card',
  'Cash'
];

const INITIAL_EMPTY_STATE = {
  transactions: [],
  documents: [],
  goals: [],
  budgets: [],
  subscriptions: [],
  recurring: [],
  rules: [],
  tags: [],
  dismissedPatterns: [],
  selectedPeriod: 'all-time',
  assets: 0,
  liabilities: 0,
  netWorthConfigured: false,
  categories: DEFAULT_CATEGORIES,
  accounts: DEFAULT_ACCOUNTS,
  driveSyncInfo: {
    folderName: 'Ledgerly Financial Inbox',
    folderId: 'drive_folder_ledgerly_inbox_01',
    folderUrl: 'https://drive.google.com',
    lastSyncedAt: null,
    schedule: '08:00 AM Daily',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    processedFileIds: [],
    resetAt: null
  }
};

function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

function formatDate(dateString) {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  if (!year || !month || !day) return dateString;
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function generateFingerprint(date, merchant, amount, account) {
  const m = (merchant || '').trim().toLowerCase();
  const a = (Number(amount) || 0).toFixed(2);
  const acc = (account || '').trim().toLowerCase();
  return `${date}|${m}|${a}|${acc}`;
}

function isDateInPeriod(dateStr, period) {
  if (!dateStr || period === 'all-time') return true;
  
  const txDate = new Date(dateStr);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  if (period === 'this-month') {
    return txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth;
  }
  
  if (period === 'last-month') {
    const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
    return txDate.getFullYear() === lastMonthDate.getFullYear() && txDate.getMonth() === lastMonthDate.getMonth();
  }

  if (period === 'last-3-months') {
    const threeMonthsAgo = new Date(currentYear, currentMonth - 2, 1);
    return txDate >= threeMonthsAgo && txDate <= now;
  }

  if (period === 'last-6-months') {
    const sixMonthsAgo = new Date(currentYear, currentMonth - 5, 1);
    return txDate >= sixMonthsAgo && txDate <= now;
  }

  if (period === 'this-year') {
    return txDate.getFullYear() === currentYear;
  }

  return true;
}

function normalizeMerchant(raw) {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/gi, '')
    .replace(/#\d+$/g, '')
    .replace(/\d{4,}/g, '')
    .replace(/\s+/g, ' ');
}

function runDetectionEngine(transactions, dismissedPatterns) {
  const expenses = transactions.filter(t => t.type === 'expense');
  const grouped = {};

  expenses.forEach(tx => {
    const norm = normalizeMerchant(tx.merchant);
    if (!norm) return;
    if (!grouped[norm]) {
      grouped[norm] = [];
    }
    grouped[norm].push(tx);
  });

  const suggestions = [];

  const subHints = [
    'netflix', 'spotify', 'hulu', 'disney', 'youtube', 'icloud', 'dropbox', 'adobe', 
    'microsoft', 'amazon prime', 'patreon', 'membership', 'studio', 'gym', 'openai', 
    'chatgpt', 'canva', 'notion', 'zoom', 'slack', 'github'
  ];

  const billHints = [
    'mortgage', 'rent', 'loan', 'insurance', 'utility', 'utilities', 'electric', 
    'water', 'internet', 'phone', 'mobile', 'daycare', 'tuition', 'lease', 'car payment', 
    'auto payment', 'hoa', 'property tax'
  ];

  Object.entries(grouped).forEach(([normKey, txs]) => {
    if (dismissedPatterns.includes(normKey)) return;
    if (txs.length < 2) return;

    // Unique dates
    const uniqueDates = Array.from(new Set(txs.map(t => t.date))).sort();
    if (uniqueDates.length < 2) return;

    // Calculate intervals
    const intervals = [];
    for (let i = 1; i < uniqueDates.length; i++) {
      const d1 = new Date(uniqueDates[i - 1]);
      const d2 = new Date(uniqueDates[i]);
      const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
      intervals.push(diffDays);
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    
    let cadence = null;
    if (avgInterval >= 5 && avgInterval <= 9) cadence = 'weekly';
    else if (avgInterval >= 12 && avgInterval <= 17) cadence = 'biweekly';
    else if (avgInterval >= 24 && avgInterval <= 40) cadence = 'monthly';
    else if (avgInterval >= 75 && avgInterval <= 110) cadence = 'quarterly';
    else if (avgInterval >= 330 && avgInterval <= 400) cadence = 'annual';

    if (!cadence) return;

    const amounts = txs.map(t => Number(t.amount));
    const minAmt = Math.min(...amounts);
    const maxAmt = Math.max(...amounts);
    const avgAmt = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variation = (maxAmt - minAmt) / (avgAmt || 1);

    const isSubHint = subHints.some(h => normKey.includes(h) || txs.some(t => (t.category || '').toLowerCase().includes('sub')));
    const isBillHint = billHints.some(h => normKey.includes(h) || txs.some(t => (t.category || '').toLowerCase().includes('util') || (t.category || '').toLowerCase().includes('hous')));

    let maxVarAllowed = isSubHint ? 0.20 : 0.35;
    if (variation > maxVarAllowed) return;

    // Protection against false positives
    if (!isSubHint && !isBillHint) {
      if (txs.length < 3 || variation > 0.03 || cadence === 'weekly') {
        return; // Filter out routine weekly grocery repeats
      }
    }

    let confidence = 'likely';
    if (txs.length >= 3 && variation <= 0.12) {
      confidence = 'high';
    }

    // Next date estimation
    const lastDate = new Date(uniqueDates[uniqueDates.length - 1]);
    const nextDateObj = new Date(lastDate);
    if (cadence === 'weekly') nextDateObj.setDate(nextDateObj.getDate() + 7);
    else if (cadence === 'biweekly') nextDateObj.setDate(nextDateObj.getDate() + 14);
    else if (cadence === 'monthly') nextDateObj.setMonth(nextDateObj.getMonth() + 1);
    else if (cadence === 'quarterly') nextDateObj.setMonth(nextDateObj.getMonth() + 3);
    else if (cadence === 'annual') nextDateObj.setFullYear(nextDateObj.getFullYear() + 1);

    const nextDateStr = nextDateObj.toISOString().split('T')[0];

    let monthlyEquiv = avgAmt;
    if (cadence === 'weekly') monthlyEquiv = (avgAmt * 52) / 12;
    if (cadence === 'biweekly') monthlyEquiv = (avgAmt * 26) / 12;
    if (cadence === 'quarterly') monthlyEquiv = avgAmt / 3;
    if (cadence === 'annual') monthlyEquiv = avgAmt / 12;

    const displayMerchant = txs[txs.length - 1].merchant;
    const category = txs[txs.length - 1].category || (isSubHint ? 'Subscriptions' : 'Utilities');

    suggestions.push({
      key: normKey,
      merchant: displayMerchant,
      category,
      amount: avgAmt,
      cadence,
      confidence,
      occurrences: txs.length,
      nextDate: nextDateStr,
      monthlyEquiv,
      type: isSubHint ? 'subscription' : 'recurring'
    });
  });

  return suggestions;
}

export default function App() {
  const [appState, setAppState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...INITIAL_EMPTY_STATE, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load local D1 state', e);
    }
    return INITIAL_EMPTY_STATE;
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [toast, setToast] = useState(null);

  // Modals state
  const [isAddEntryOpen, setIsAddEntryOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDriveSyncOpen, setIsDriveSyncOpen] = useState(false);
  const [isEraseModalOpen, setIsEraseModalOpen] = useState(false);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [selectedTxForTag, setSelectedTxForTag] = useState(null);

  // Sync state to persistent local state (D1 mock server sync)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch (e) {
      console.error('Failed to save state to D1 store', e);
    }
  }, [appState]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const updateState = (updater) => {
    setAppState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      return next;
    });
  };

  const handlePeriodChange = (newPeriod) => {
    updateState({ selectedPeriod: newPeriod });
  };

  const periodTransactions = useMemo(() => {
    return appState.transactions.filter(t => isDateInPeriod(t.date, appState.selectedPeriod));
  }, [appState.transactions, appState.selectedPeriod]);

  const suggestions = useMemo(() => {
    return runDetectionEngine(appState.transactions, appState.dismissedPatterns);
  }, [appState.transactions, appState.dismissedPatterns]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-[238px] bg-white border-r border-slate-200 flex-shrink-0 flex flex-col">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-[#6558D3] flex items-center justify-center text-white font-bold shadow-md shadow-indigo-200">
              L
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-none">Ledgerly</h1>
              <span className="text-[11px] text-slate-400 font-medium">Personal Finance</span>
            </div>
          </div>
          <span className="md:hidden text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-medium">
            Private
          </span>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1 flex-1 overflow-x-auto md:overflow-y-auto flex md:flex-col horizontal-scroll-mobile">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'transactions', label: 'Transactions', icon: Receipt },
            { id: 'recurring', label: 'Recurring', icon: Repeat },
            { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
            { id: 'budgets', label: 'Budgets', icon: PieChart },
            { id: 'goals', label: 'Goals', icon: Target },
            { id: 'documents', label: 'Documents', icon: FileText },
            { id: 'rules', label: 'Rules & Tags', icon: Sliders },
            { id: 'settings', label: 'Settings', icon: SettingsIcon },
          ].map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap min-w-[120px] md:min-w-0 ${
                  isActive
                    ? 'bg-[#6558D3] text-white shadow-sm shadow-indigo-200'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-white' : 'text-slate-400'} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sync Status Badge (Desktop Footer) */}
        <div className="hidden md:block p-4 m-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Drive Inbox
            </span>
            <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono">08:00 AM</span>
          </div>
          <p className="text-[11px] text-slate-500 line-clamp-1">
            {appState.driveSyncInfo.folderName}
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Global Top Bar */}
        <header className="h-[76px] bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-bold text-slate-900 capitalize hidden sm:block">
              {activeTab === 'rules' ? 'Rules & Tags' : activeTab}
            </h2>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={() => setIsDriveSyncOpen(true)}
              className="flex items-center space-x-2 px-3 py-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-slate-700 text-xs sm:text-sm font-medium transition shadow-sm"
              title="Google Drive Inbox Sync"
            >
              <FolderSync size={16} className="text-[#6558D3]" />
              <span className="hidden sm:inline">Drive sync</span>
            </button>

            <button
              onClick={() => setIsImportOpen(true)}
              className="flex items-center space-x-2 px-3 py-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-slate-700 text-xs sm:text-sm font-medium transition shadow-sm"
            >
              <Upload size={16} className="text-slate-500" />
              <span>Import</span>
            </button>

            <button
              onClick={() => setIsAddEntryOpen(true)}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-[#6558D3] hover:bg-[#5447be] text-white text-xs sm:text-sm font-medium transition shadow-sm shadow-indigo-200"
            >
              <Plus size={16} />
              <span>Add entry</span>
            </button>
          </div>
        </header>

        {/* View Router */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto space-y-6">
          {activeTab === 'dashboard' && (
            <DashboardView
              state={appState}
              periodTransactions={periodTransactions}
              onPeriodChange={handlePeriodChange}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionsView
              state={appState}
              periodTransactions={periodTransactions}
              updateState={updateState}
              onPeriodChange={handlePeriodChange}
              showToast={showToast}
              onOpenTagModal={(tx) => {
                setSelectedTxForTag(tx);
                setIsTagModalOpen(true);
              }}
            />
          )}

          {activeTab === 'recurring' && (
            <RecurringView
              state={appState}
              suggestions={suggestions.filter(s => s.type === 'recurring')}
              updateState={updateState}
              showToast={showToast}
            />
          )}

          {activeTab === 'subscriptions' && (
            <SubscriptionsView
              state={appState}
              suggestions={suggestions.filter(s => s.type === 'subscription')}
              updateState={updateState}
              showToast={showToast}
            />
          )}

          {activeTab === 'budgets' && (
            <BudgetsView
              state={appState}
              periodTransactions={periodTransactions}
              updateState={updateState}
              showToast={showToast}
            />
          )}

          {activeTab === 'goals' && (
            <GoalsView
              state={appState}
              updateState={updateState}
              showToast={showToast}
            />
          )}

          {activeTab === 'documents' && (
            <DocumentsView
              state={appState}
              updateState={updateState}
              showToast={showToast}
              onOpenSync={() => setIsDriveSyncOpen(true)}
            />
          )}

          {activeTab === 'rules' && (
            <RulesAndTagsView
              state={appState}
              updateState={updateState}
              showToast={showToast}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              state={appState}
              updateState={updateState}
              showToast={showToast}
              onOpenEraseModal={() => setIsEraseModalOpen(true)}
            />
          )}
        </main>
      </div>

      {/* Global Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center space-x-2 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl text-sm animate-bounce">
          {toast.type === 'error' ? <AlertCircle size={18} className="text-rose-400" /> : <CheckCircle2 size={18} className="text-emerald-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Modals */}
      {isAddEntryOpen && (
        <AddEntryModal
          state={appState}
          updateState={updateState}
          onClose={() => setIsAddEntryOpen(false)}
          showToast={showToast}
        />
      )}

      {isImportOpen && (
        <ImportModal
          state={appState}
          updateState={updateState}
          onClose={() => setIsImportOpen(false)}
          showToast={showToast}
        />
      )}

      {isDriveSyncOpen && (
        <DriveSyncModal
          state={appState}
          updateState={updateState}
          onClose={() => setIsDriveSyncOpen(false)}
          showToast={showToast}
        />
      )}

      {isEraseModalOpen && (
        <EraseAllDataModal
          onClose={() => setIsEraseModalOpen(false)}
          onConfirm={() => {
            localStorage.removeItem(STORAGE_KEY);
            setAppState({
              ...INITIAL_EMPTY_STATE,
              driveSyncInfo: {
                ...INITIAL_EMPTY_STATE.driveSyncInfo,
                resetAt: new Date().toISOString()
              }
            });
            setIsEraseModalOpen(false);
            showToast('All Ledgerly state wiped successfully', 'info');
          }}
        />
      )}

      {isTagModalOpen && selectedTxForTag && (
        <AddTagModal
          state={appState}
          transaction={selectedTxForTag}
          updateState={updateState}
          onClose={() => {
            setIsTagModalOpen(false);
            setSelectedTxForTag(null);
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function PeriodSelector({ value, onChange }) {
  const options = [
    { id: 'all-time', label: 'All time' },
    { id: 'this-month', label: 'This month' },
    { id: 'last-month', label: 'Last month' },
    { id: 'last-3-months', label: 'Last 3 months' },
    { id: 'last-6-months', label: 'Last 6 months' },
    { id: 'this-year', label: 'This year' },
  ];

  return (
    <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs sm:text-sm overflow-x-auto max-w-full">
      {options.map(opt => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`px-3 py-1.5 rounded-lg font-medium transition whitespace-nowrap ${
            value === opt.id
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function DashboardView({ state, periodTransactions, onPeriodChange, onNavigate }) {
  // Derived calculations
  const totalIncome = useMemo(() => {
    return periodTransactions
      .filter(t => t.type === 'income')
      .reduce((acc, t) => acc + Number(t.amount), 0);
  }, [periodTransactions]);

  const totalSpending = useMemo(() => {
    return periodTransactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => acc + Number(t.amount), 0);
  }, [periodTransactions]);

  const savingsRate = useMemo(() => {
    if (totalIncome <= 0) return 0;
    const net = totalIncome - totalSpending;
    return Math.max(0, Math.round((net / totalIncome) * 100));
  }, [totalIncome, totalSpending]);

  const netWorthValue = useMemo(() => {
    return state.assets - state.liabilities;
  }, [state.assets, state.liabilities]);

  const categoryBreakdown = useMemo(() => {
    const expenses = periodTransactions.filter(t => t.type === 'expense');
    const map = {};
    expenses.forEach(t => {
      const cat = t.category || 'Other';
      map[cat] = (map[cat] || 0) + Number(t.amount);
    });
    return Object.entries(map).map(([name, amount]) => ({ name, amount }));
  }, [periodTransactions]);

  const recentTxs = useMemo(() => {
    return [...periodTransactions]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);
  }, [periodTransactions]);

  const needsReviewCount = useMemo(() => {
    return periodTransactions.filter(t => t.category === 'Needs review').length;
  }, [periodTransactions]);

  return (
    <div className="space-y-6">
      {/* Date Period Selector Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Summary Period</h3>
          <p className="text-xs text-slate-500">Filter totals and charts across your records</p>
        </div>
        <PeriodSelector value={state.selectedPeriod} onChange={onPeriodChange} />
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Net Worth */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Net Worth</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-[#6558D3] flex items-center justify-center">
              <DollarSign size={18} />
            </div>
          </div>
          <div>
            {state.netWorthConfigured ? (
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(netWorthValue)}</div>
            ) : (
              <div>
                <span className="text-xl font-semibold text-slate-400">Not set</span>
                <p className="text-xs text-slate-500 mt-0.5">Configure assets & liabilities in Settings</p>
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            {state.netWorthConfigured ? (
              <span className="text-slate-500 font-medium">Assets minus liabilities</span>
            ) : (
              <button
                onClick={() => onNavigate('settings')}
                className="text-[#6558D3] font-semibold hover:underline flex items-center gap-1"
              >
                Set up Net Worth <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Card 2: Income */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Income</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowUpRight size={18} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(totalIncome)}</div>
          </div>
          <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 font-medium">
            {periodTransactions.filter(t => t.type === 'income').length} income records
          </div>
        </div>

        {/* Card 3: Spending */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Spending</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
              <ArrowDownRight size={18} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(totalSpending)}</div>
          </div>
          <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 font-medium">
            {periodTransactions.filter(t => t.type === 'expense').length} expense records
          </div>
        </div>

        {/* Card 4: Savings Rate */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Savings Rate</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp size={18} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{savingsRate}%</div>
          </div>
          <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 font-medium">
            Derived from income & spending
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cash Flow Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-base font-bold text-slate-900">Cash Flow</h4>
              <p className="text-xs text-slate-500">Income vs Expenses timeline</p>
            </div>
          </div>

          {periodTransactions.length === 0 ? (
            <div className="h-48 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-center p-6 bg-slate-50/50">
              <Receipt className="text-slate-300 mb-2" size={32} />
              <p className="text-sm font-medium text-slate-600">Import or add transactions to see cash flow.</p>
              <p className="text-xs text-slate-400 mt-1">Your timeline will render here automatically.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="h-44 flex items-end justify-between gap-2 pt-6 px-2 border-b border-slate-100">
                {/* Simplified bar/line representation */}
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'].map((month, i) => {
                  const barIncome = (totalIncome > 0) ? Math.min(100, 20 + (i * 12) % 70) : 0;
                  const barExpense = (totalSpending > 0) ? Math.min(100, 15 + (i * 15) % 80) : 0;
                  return (
                    <div key={month} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                      <div className="w-full flex items-end justify-center gap-1 h-32">
                        <div
                          style={{ height: `${barIncome}%` }}
                          className="w-2.5 bg-emerald-500 rounded-t transition-all"
                          title="Income"
                        ></div>
                        <div
                          style={{ height: `${barExpense}%` }}
                          className="w-2.5 bg-[#6558D3] rounded-t transition-all"
                          title="Spending"
                        ></div>
                      </div>
                      <span className="text-[11px] font-medium text-slate-400">{month}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-center space-x-6 text-xs text-slate-600 pt-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-emerald-500"></span> Income
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-[#6558D3]"></span> Expenses
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Spending by Category */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div>
            <h4 className="text-base font-bold text-slate-900">Spending by Category</h4>
            <p className="text-xs text-slate-500">Breakdown for selected period</p>
          </div>

          {categoryBreakdown.length === 0 ? (
            <div className="h-48 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-center p-6 bg-slate-50/50">
              <PieChart className="text-slate-300 mb-2" size={32} />
              <p className="text-sm font-medium text-slate-600">No category spending data yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {categoryBreakdown.map((cat, idx) => {
                const pct = totalSpending > 0 ? Math.round((cat.amount / totalSpending) * 100) : 0;
                return (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-slate-700">{cat.name}</span>
                      <span className="text-slate-900">{formatCurrency(cat.amount)} ({pct}%)</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#6558D3] rounded-full transition-all"
                        style={{ width: `${pct}%`, opacity: 1 - idx * 0.15 }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold text-slate-900">Recent Activity</h4>
            <button
              onClick={() => onNavigate('transactions')}
              className="text-xs font-semibold text-[#6558D3] hover:underline"
            >
              View all transactions
            </button>
          </div>

          {recentTxs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              No recent activity for this date period.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentTxs.map(tx => (
                <div key={tx.id} className="py-3 flex items-center justify-between first:pt-0 last:pb-0">
                  <div className="flex items-center space-x-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold ${
                      tx.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {tx.merchant.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{tx.merchant}</div>
                      <div className="text-xs text-slate-400">{formatDate(tx.date)} • {tx.category}</div>
                    </div>
                  </div>
                  <div className={`text-sm font-bold ${
                    tx.type === 'income' ? 'text-emerald-600' : 'text-slate-900'
                  }`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ledgerly Insights & Coming Up */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
            <div className="flex items-center space-x-2 text-[#6558D3]">
              <Sparkles size={18} />
              <h4 className="text-base font-bold text-slate-900">Ledgerly Insight</h4>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              {needsReviewCount > 0
                ? `You have ${needsReviewCount} transaction(s) marked as "Needs review". Categorize them to keep budgets accurate.`
                : 'All transactions are categorized. Your financial dashboard is completely up to date.'}
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-slate-900">Coming Up</h4>
              <button onClick={() => onNavigate('recurring')} className="text-xs font-semibold text-[#6558D3] hover:underline">
                View recurring
              </button>
            </div>
            {state.recurring.length === 0 && state.subscriptions.length === 0 ? (
              <p className="text-xs text-slate-500">
                No confirmed upcoming payments. Add or detect them in the <button onClick={() => onNavigate('recurring')} className="text-[#6558D3] underline">Recurring</button> section.
              </p>
            ) : (
              <div className="space-y-2">
                {[...state.recurring, ...state.subscriptions].slice(0, 3).map((item, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 rounded-xl flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{item.name || item.merchant}</span>
                    <span className="font-mono text-slate-600">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TransactionsView({ state, periodTransactions, updateState, onPeriodChange, showToast, onOpenTagModal }) {
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const filtered = useMemo(() => {
    return periodTransactions.filter(t => {
      const matchSearch =
        t.merchant.toLowerCase().includes(search.toLowerCase()) ||
        t.category.toLowerCase().includes(search.toLowerCase()) ||
        (t.tags && t.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase())));
      
      const matchAccount = accountFilter === 'all' || t.account === accountFilter;
      const matchCategory = categoryFilter === 'all' || t.category === categoryFilter;

      return matchSearch && matchAccount && matchCategory;
    });
  }, [periodTransactions, search, accountFilter, categoryFilter]);

  /* Inline Category Edit Handler */
  const handleCategoryChange = (txId, newCategory) => {
    updateState(prev => ({
      ...prev,
      transactions: prev.transactions.map(t => t.id === txId ? { ...t, category: newCategory } : t)
    }));
    showToast('Category updated');
  };

  /* Remove Tag Handler */
  const handleRemoveTag = (txId, tagToRemove) => {
    updateState(prev => ({
      ...prev,
      transactions: prev.transactions.map(t => {
        if (t.id === txId) {
          return { ...t, tags: (t.tags || []).filter(tg => tg !== tagToRemove) };
        }
        return t;
      })
    }));
    showToast('Tag removed');
  };

  /* Delete Transaction */
  const handleDeleteTx = (txId) => {
    updateState(prev => ({
      ...prev,
      transactions: prev.transactions.filter(t => t.id !== txId)
    }));
    showToast('Transaction deleted');
  };

  return (
    <div className="space-y-6">
      {/* Search & Filters Header */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search merchant, category, tag..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#6558D3]"
            />
          </div>
          <PeriodSelector value={state.selectedPeriod} onChange={onPeriodChange} />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs sm:text-sm">
          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-medium">Account:</span>
            <select
              value={accountFilter}
              onChange={e => setAccountFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white font-medium text-slate-800"
            >
              <option value="all">All Accounts</option>
              {state.accounts.map(acc => (
                <option key={acc} value={acc}>{acc}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-medium">Category:</span>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white font-medium text-slate-800"
            >
              <option value="all">All Categories</option>
              {state.categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Transactions List / Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Receipt className="mx-auto text-slate-300" size={40} />
            <h4 className="text-base font-bold text-slate-800">No transactions found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No records match your criteria. Add an entry or adjust your period filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Date & Merchant</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Account</th>
                  <th className="py-3 px-4">Tags</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        {tx.merchant}
                        {tx.receipt && (
                          <span className="inline-flex items-center text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                            Receipt
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">{formatDate(tx.date)}</div>
                    </td>

                    {/* Inline Editable Category */}
                    <td className="py-3 px-4">
                      <select
                        value={tx.category}
                        onChange={e => handleCategoryChange(tx.id, e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white text-slate-800 hover:border-slate-300 transition"
                      >
                        {state.categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </td>

                    <td className="py-3 px-4 text-slate-600 text-xs font-medium">
                      {tx.account}
                    </td>

                    {/* Tags cell with pills and plus control */}
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-1">
                        {(tx.tags || []).map(tg => (
                          <span key={tg} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-[#6558D3] text-xs font-medium">
                            {tg}
                            <button
                              onClick={() => handleRemoveTag(tx.id, tg)}
                              className="hover:text-rose-600"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        <button
                          onClick={() => onOpenTagModal(tx)}
                          className="w-5 h-5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition"
                          title="Add tag"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right font-bold">
                      <span className={tx.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}>
                        {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleDeleteTx(tx.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded transition"
                        title="Delete transaction"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RecurringView({ state, suggestions, updateState, showToast }) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cadence, setCadence] = useState('monthly');
  const [category, setCategory] = useState(state.categories[0] || 'Utilities');

  const handleKeepSuggestion = (sug) => {
    const newEntry = {
      id: 'rec_' + Date.now(),
      merchant: sug.merchant,
      amount: sug.amount,
      cadence: sug.cadence,
      category: sug.category,
      nextDate: sug.nextDate,
      active: true
    };

    updateState(prev => ({
      ...prev,
      recurring: [...prev.recurring, newEntry]
    }));
    showToast(`Added ${sug.merchant} to recurring payments`);
  };

  const handleIgnoreSuggestion = (sugKey) => {
    updateState(prev => ({
      ...prev,
      dismissedPatterns: [...prev.dismissedPatterns, sugKey]
    }));
    showToast('Pattern ignored');
  };

  const handleAddManual = (e) => {
    e.preventDefault();
    if (!name || !amount) return;
    const newEntry = {
      id: 'rec_' + Date.now(),
      merchant: name,
      amount: parseFloat(amount),
      cadence,
      category,
      nextDate: new Date().toISOString().split('T')[0],
      active: true
    };
    updateState(prev => ({
      ...prev,
      recurring: [...prev.recurring, newEntry]
    }));
    setName('');
    setAmount('');
    setIsAddOpen(false);
    showToast('Recurring payment saved');
  };

  const handleDelete = (id) => {
    updateState(prev => ({
      ...prev,
      recurring: prev.recurring.filter(r => r.id !== id)
    }));
    showToast('Recurring payment removed');
  };

  const totalMonthlyCommitment = useMemo(() => {
    return state.recurring.reduce((acc, r) => {
      let m = Number(r.amount);
      if (r.cadence === 'weekly') m = (m * 52) / 12;
      if (r.cadence === 'biweekly') m = (m * 26) / 12;
      if (r.cadence === 'annual') m = m / 12;
      return acc + m;
    }, 0);
  }, [state.recurring]);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-center justify-between text-emerald-900 text-sm">
        <div className="flex items-center space-x-2">
          <Sparkles className="text-emerald-600" size={18} />
          <span className="font-semibold">Automatic Recurring Detection is Active</span>
        </div>
        <span className="text-xs bg-emerald-200/60 px-2 py-0.5 rounded font-mono">Live</span>
      </div>

      {/* Monthly Summary */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-slate-400 uppercase">Estimated Monthly Recurring</span>
          <div className="text-2xl font-bold text-slate-900">{formatCurrency(totalMonthlyCommitment)}</div>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-[#6558D3] text-white text-sm font-semibold hover:bg-[#5447be] transition shadow-sm"
        >
          <Plus size={16} />
          <span>Add recurring payment</span>
        </button>
      </div>

      {/* Automatic Suggestions Section */}
      {suggestions.length > 0 && (
        <div className="bg-indigo-50/50 border border-indigo-100 p-6 rounded-2xl space-y-4">
          <div className="flex items-center space-x-2">
            <Sparkles className="text-[#6558D3]" size={18} />
            <h4 className="text-base font-bold text-slate-900">Detected Recurring Payments</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {suggestions.map(sug => (
              <div key={sug.key} className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 text-sm">{sug.merchant}</div>
                  <div className="text-xs text-slate-500">
                    {formatCurrency(sug.amount)} / {sug.cadence} • {sug.occurrences} matches
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleKeepSuggestion(sug)}
                    className="px-3 py-1.5 rounded-lg bg-[#6558D3] text-white text-xs font-semibold hover:bg-[#5447be]"
                  >
                    Keep
                  </button>
                  <button
                    onClick={() => handleIgnoreSuggestion(sug.key)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs hover:bg-slate-50"
                  >
                    Ignore
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmed List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
        <h4 className="text-base font-bold text-slate-900">Confirmed Recurring Payments</h4>
        {state.recurring.length === 0 ? (
          <p className="text-xs text-slate-500">No confirmed recurring items. Add one or accept suggestions above.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {state.recurring.map(r => (
              <div key={r.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900 text-sm">{r.merchant}</div>
                  <div className="text-xs text-slate-400">{r.category} • {r.cadence}</div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="font-bold text-slate-900 text-sm">{formatCurrency(r.amount)}</span>
                  <button onClick={() => handleDelete(r.id)} className="text-slate-400 hover:text-rose-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">Add Recurring Payment</h3>
              <button onClick={() => setIsAddOpen(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddManual} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Name / Payee</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  placeholder="e.g. Electric Company"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Cadence</label>
                <select
                  value={cadence}
                  onChange={e => setCadence(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#6558D3] text-white rounded-xl text-sm font-semibold"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SubscriptionsView({ state, suggestions, updateState, showToast }) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cadence, setCadence] = useState('monthly');

  const handleKeepSuggestion = (sug) => {
    const newEntry = {
      id: 'sub_' + Date.now(),
      merchant: sug.merchant,
      amount: sug.amount,
      cadence: sug.cadence,
      active: true
    };
    updateState(prev => ({
      ...prev,
      subscriptions: [...prev.subscriptions, newEntry]
    }));
    showToast(`Added ${sug.merchant} to subscriptions`);
  };

  const handleIgnore = (sugKey) => {
    updateState(prev => ({
      ...prev,
      dismissedPatterns: [...prev.dismissedPatterns, sugKey]
    }));
    showToast('Subscription pattern ignored');
  };

  const handleAddManual = (e) => {
    e.preventDefault();
    if (!name || !amount) return;
    const newEntry = {
      id: 'sub_' + Date.now(),
      merchant: name,
      amount: parseFloat(amount),
      cadence,
      active: true
    };
    updateState(prev => ({
      ...prev,
      subscriptions: [...prev.subscriptions, newEntry]
    }));
    setName('');
    setAmount('');
    setIsAddOpen(false);
    showToast('Subscription saved');
  };

  const handleDelete = (id) => {
    updateState(prev => ({
      ...prev,
      subscriptions: prev.subscriptions.filter(s => s.id !== id)
    }));
    showToast('Subscription removed');
  };

  const totalMonthly = useMemo(() => {
    return state.subscriptions.reduce((acc, s) => {
      let m = Number(s.amount);
      if (s.cadence === 'annual') m = m / 12;
      return acc + m;
    }, 0);
  }, [state.subscriptions]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-slate-400 uppercase">Monthly Subscription Spend</span>
          <div className="text-2xl font-bold text-slate-900">{formatCurrency(totalMonthly)}</div>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-[#6558D3] text-white text-sm font-semibold hover:bg-[#5447be] transition shadow-sm"
        >
          <Plus size={16} />
          <span>Add subscription</span>
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="bg-indigo-50/50 border border-indigo-100 p-6 rounded-2xl space-y-4">
          <div className="flex items-center space-x-2">
            <Sparkles className="text-[#6558D3]" size={18} />
            <h4 className="text-base font-bold text-slate-900">Detected Subscriptions</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {suggestions.map(sug => (
              <div key={sug.key} className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 text-sm">{sug.merchant}</div>
                  <div className="text-xs text-slate-500">{formatCurrency(sug.amount)} / {sug.cadence}</div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleKeepSuggestion(sug)}
                    className="px-3 py-1.5 rounded-lg bg-[#6558D3] text-white text-xs font-semibold"
                  >
                    Keep
                  </button>
                  <button
                    onClick={() => handleIgnore(sug.key)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs"
                  >
                    Ignore
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
        <h4 className="text-base font-bold text-slate-900">Confirmed Subscriptions</h4>
        {state.subscriptions.length === 0 ? (
          <p className="text-xs text-slate-500">No active subscriptions. Add one above.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {state.subscriptions.map(s => (
              <div key={s.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900 text-sm">{s.merchant}</div>
                  <div className="text-xs text-slate-400">{s.cadence}</div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="font-bold text-slate-900 text-sm">{formatCurrency(s.amount)}</span>
                  <button onClick={() => handleDelete(s.id)} className="text-slate-400 hover:text-rose-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">Add Subscription</h3>
              <button onClick={() => setIsAddOpen(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddManual} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Service Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  placeholder="e.g. Streaming Pass"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Cadence</label>
                <select
                  value={cadence}
                  onChange={e => setCadence(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#6558D3] text-white rounded-xl text-sm font-semibold"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetsView({ state, periodTransactions, updateState, showToast }) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [category, setCategory] = useState(state.categories[0] || 'Groceries');
  const [limit, setLimit] = useState('');

  const categorySpending = useMemo(() => {
    const expenses = periodTransactions.filter(t => t.type === 'expense');
    const map = {};
    expenses.forEach(t => {
      const c = t.category || 'Other';
      map[c] = (map[c] || 0) + Number(t.amount);
    });
    return map;
  }, [periodTransactions]);

  const handleSaveBudget = (e) => {
    e.preventDefault();
    if (!limit) return;
    const newBudget = {
      id: 'bg_' + Date.now(),
      category,
      limit: parseFloat(limit)
    };
    updateState(prev => ({
      ...prev,
      budgets: [...prev.budgets.filter(b => b.category !== category), newBudget]
    }));
    setLimit('');
    setIsAddOpen(false);
    showToast('Budget saved');
  };

  const handleDeleteBudget = (id) => {
    updateState(prev => ({
      ...prev,
      budgets: prev.budgets.filter(b => b.id !== id)
    }));
    showToast('Budget removed');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Category Budgets</h3>
          <p className="text-xs text-slate-500">Track spending limits per category</p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-[#6558D3] text-white text-sm font-semibold hover:bg-[#5447be] transition shadow-sm"
        >
          <Plus size={16} />
          <span>Create budget</span>
        </button>
      </div>

      {state.budgets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center space-y-3">
          <PieChart className="mx-auto text-slate-300" size={40} />
          <h4 className="text-base font-bold text-slate-800">No budgets configured</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Create monthly budget limits for categories like Groceries or Dining to monitor overspending.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.budgets.map(b => {
            const spent = categorySpending[b.category] || 0;
            const pct = Math.min(100, Math.round((spent / b.limit) * 100));
            const isOver = spent > b.limit;

            return (
              <div key={b.id} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-900 text-sm">{b.category}</span>
                  <button onClick={() => handleDeleteBudget(b.id)} className="text-slate-400 hover:text-rose-600">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className={isOver ? 'text-rose-600' : 'text-slate-700'}>
                    {formatCurrency(spent)} spent
                  </span>
                  <span className="text-slate-400">Limit: {formatCurrency(b.limit)}</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isOver ? 'bg-rose-500' : 'bg-[#6558D3]'}`}
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">Create Category Budget</h3>
              <button onClick={() => setIsAddOpen(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveBudget} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Category</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                >
                  {state.categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Monthly Limit</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={limit}
                  onChange={e => setLimit(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  placeholder="0.00"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-[#6558D3] text-white rounded-xl text-sm font-semibold">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function GoalsView({ state, updateState, showToast }) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');

  const handleSaveGoal = (e) => {
    e.preventDefault();
    if (!name || !target) return;
    const newGoal = {
      id: 'gl_' + Date.now(),
      name,
      targetAmount: parseFloat(target),
      currentAmount: parseFloat(current || 0)
    };
    updateState(prev => ({
      ...prev,
      goals: [...prev.goals, newGoal]
    }));
    setName('');
    setTarget('');
    setCurrent('');
    setIsAddOpen(false);
    showToast('Goal saved');
  };

  const handleDeleteGoal = (id) => {
    updateState(prev => ({
      ...prev,
      goals: prev.goals.filter(g => g.id !== id)
    }));
    showToast('Goal deleted');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Savings Goals</h3>
          <p className="text-xs text-slate-500">Track progress toward financial milestones</p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-[#6558D3] text-white text-sm font-semibold hover:bg-[#5447be] transition shadow-sm"
        >
          <Plus size={16} />
          <span>Create goal</span>
        </button>
      </div>

      {state.goals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center space-y-3">
          <Target className="mx-auto text-slate-300" size={40} />
          <h4 className="text-base font-bold text-slate-800">No savings goals yet</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Set up goals for emergency funds, vacations, or major purchases.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.goals.map(g => {
            const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
            return (
              <div key={g.id} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-900 text-sm">{g.name}</span>
                  <button onClick={() => handleDeleteGoal(g.id)} className="text-slate-400 hover:text-rose-600">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-[#6558D3]">{formatCurrency(g.currentAmount)} saved</span>
                  <span className="text-slate-400">Target: {formatCurrency(g.targetAmount)}</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#6558D3] rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">Create Goal</h3>
              <button onClick={() => setIsAddOpen(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveGoal} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Goal Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  placeholder="e.g. Vacation Fund"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Target Amount</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Initial Saved Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={current}
                  onChange={e => setCurrent(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  placeholder="0.00"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-[#6558D3] text-white rounded-xl text-sm font-semibold">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentsView({ state, updateState, showToast, onOpenSync }) {
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newDocs = files.map(f => ({
      id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      filename: f.name,
      mimeType: f.type || 'application/octet-stream',
      size: f.size,
      objectKey: `uploads/${Date.now()}-${f.name}`,
      status: 'stored',
      source: 'upload',
      createdAt: new Date().toISOString()
    }));

    updateState(prev => ({
      ...prev,
      documents: [...newDocs, ...prev.documents]
    }));
    showToast(`Uploaded ${files.length} document(s) to R2 vault`);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Upload Dropzone */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div>
            <h4 className="text-base font-bold text-slate-900">Upload Documents</h4>
            <p className="text-xs text-slate-500">Receipts, invoices, statements, spreadsheets (max 20 MB)</p>
          </div>
          <label className="border-2 border-dashed border-slate-200 hover:border-[#6558D3] rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition bg-slate-50/50">
            <Upload className="text-[#6558D3] mb-2" size={28} />
            <span className="text-sm font-semibold text-slate-700">Choose file or drag & drop</span>
            <span className="text-xs text-slate-400 mt-1">PDF, PNG, JPG, CSV, XLSX</span>
            <input type="file" multiple className="hidden" onChange={handleFileUpload} />
          </label>
        </div>

        {/* Card 2: Google Drive Inbox status */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-slate-900">Google Drive Inbox</h4>
              <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono font-medium">
                Active
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Dedicated folder: <strong className="text-slate-800">{state.driveSyncInfo.folderName}</strong>
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Schedule:</span>
              <span className="font-semibold">{state.driveSyncInfo.schedule}</span>
            </div>
            <div className="flex justify-between">
              <span>Timezone:</span>
              <span className="font-semibold">{state.driveSyncInfo.timezone}</span>
            </div>
          </div>

          <button
            onClick={onOpenSync}
            className="w-full py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2"
          >
            <FolderSync size={16} className="text-[#6558D3]" />
            <span>Manage Drive Sync</span>
          </button>
        </div>
      </div>

      {/* Document Vault List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
        <h4 className="text-base font-bold text-slate-900">Document Vault</h4>
        {state.documents.length === 0 ? (
          <p className="text-xs text-slate-500">No documents yet. Upload a file or add one to your Drive inbox.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {state.documents.map(doc => (
              <div key={doc.id} className="py-3 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-3">
                  <FileText className="text-slate-400" size={20} />
                  <div>
                    <div className="font-semibold text-slate-900 text-sm">{doc.filename}</div>
                    <div className="text-slate-400">{doc.source} • {(doc.size / 1024).toFixed(1)} KB</div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-700">
                  {doc.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RulesAndTagsView({ state, updateState, showToast }) {
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [whenText, setWhenText] = useState('');
  const [thenCategory, setThenCategory] = useState(state.categories[0] || 'Groceries');

  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [tagName, setTagName] = useState('');

  const handleSaveRule = (e) => {
    e.preventDefault();
    if (!whenText) return;

    const newRule = {
      id: 'rl_' + Date.now(),
      whenText,
      thenText: thenCategory,
      enabled: true
    };

    updateState(prev => ({
      ...prev,
      rules: [...prev.rules, newRule]
    }));

    setWhenText('');
    setIsRuleModalOpen(false);
    showToast('Categorization rule saved');
  };

  const handleSaveTag = (e) => {
    e.preventDefault();
    if (!tagName.trim()) return;

    const trimmed = tagName.trim();
    if (!state.tags.includes(trimmed)) {
      updateState(prev => ({
        ...prev,
        tags: [...prev.tags, trimmed]
      }));
      showToast('Tag created');
    }
    setTagName('');
    setIsTagModalOpen(false);
  };

  const handleDeleteRule = (id) => {
    updateState(prev => ({
      ...prev,
      rules: prev.rules.filter(r => r.id !== id)
    }));
    showToast('Rule removed');
  };

  const handleDeleteTag = (tg) => {
    updateState(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tg)
    }));
    showToast('Tag removed');
  };

  return (
    <div className="space-y-6">
      {/* Categorization Rules */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-bold text-slate-900">Categorization Rules</h4>
            <p className="text-xs text-slate-500">Automatically classify incoming merchants</p>
          </div>
          <button
            onClick={() => setIsRuleModalOpen(true)}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-[#6558D3] text-white text-xs font-semibold"
          >
            <Plus size={14} />
            <span>Create rule</span>
          </button>
        </div>

        {state.rules.length === 0 ? (
          <p className="text-xs text-slate-500">No categorization rules configured yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {state.rules.map(r => (
              <div key={r.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-900">When merchant contains "{r.whenText}"</span>
                  <span className="text-slate-400"> → set category to </span>
                  <span className="font-bold text-[#6558D3]">{r.thenText}</span>
                </div>
                <button onClick={() => handleDeleteRule(r.id)} className="text-slate-400 hover:text-rose-600">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Global Tags */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-bold text-slate-900">Tag Management</h4>
            <p className="text-xs text-slate-500">Custom tags for granular filtering</p>
          </div>
          <button
            onClick={() => setIsTagModalOpen(true)}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800 text-xs font-semibold"
          >
            <Plus size={14} />
            <span>New tag</span>
          </button>
        </div>

        {state.tags.length === 0 ? (
          <p className="text-xs text-slate-500">No custom tags created yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {state.tags.map(tg => (
              <span key={tg} className="px-3 py-1 bg-indigo-50 text-[#6558D3] rounded-lg text-xs font-semibold flex items-center space-x-1.5">
                <span>{tg}</span>
                <button onClick={() => handleDeleteTag(tg)} className="hover:text-rose-600">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Rule Modal */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Create Rule</h3>
            <form onSubmit={handleSaveRule} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">When merchant contains</label>
                <input
                  type="text"
                  required
                  value={whenText}
                  onChange={e => setWhenText(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  placeholder="e.g. Starbucks"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Set Category To</label>
                <select
                  value={thenCategory}
                  onChange={e => setThenCategory(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                >
                  {state.categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-[#6558D3] text-white rounded-xl text-sm font-semibold">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tag Modal */}
      {isTagModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Create Tag</h3>
            <form onSubmit={handleSaveTag} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Tag Name</label>
                <input
                  type="text"
                  required
                  value={tagName}
                  onChange={e => setTagName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  placeholder="e.g. Tax Deductible"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTagModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-[#6558D3] text-white rounded-xl text-sm font-semibold">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsView({ state, updateState, showToast, onOpenEraseModal }) {
  const [assets, setAssets] = useState(state.assets || '');
  const [liabilities, setLiabilities] = useState(state.liabilities || '');
  const [newCat, setNewCat] = useState('');
  const [newAcc, setNewAcc] = useState('');

  const handleSaveNetWorth = (e) => {
    e.preventDefault();
    updateState({
      assets: parseFloat(assets || 0),
      liabilities: parseFloat(liabilities || 0),
      netWorthConfigured: true
    });
    showToast('Net worth settings saved');
  };

  const handleAddCategory = (e) => {
    e.preventDefault();
    if (!newCat.trim()) return;
    const cat = newCat.trim();
    if (!state.categories.includes(cat)) {
      updateState(prev => ({
        ...prev,
        categories: [...prev.categories, cat]
      }));
      showToast('Category added');
    }
    setNewCat('');
  };

  const handleDeleteCategory = (cat) => {
    updateState(prev => ({
      ...prev,
      categories: prev.categories.filter(c => c !== cat)
    }));
    showToast('Category removed');
  };

  const handleAddAccount = (e) => {
    e.preventDefault();
    if (!newAcc.trim()) return;
    const acc = newAcc.trim();
    if (!state.accounts.includes(acc)) {
      updateState(prev => ({
        ...prev,
        accounts: [...prev.accounts, acc]
      }));
      showToast('Account added');
    }
    setNewAcc('');
  };

  const handleDeleteAccount = (acc) => {
    updateState(prev => ({
      ...prev,
      accounts: prev.accounts.filter(a => a !== acc)
    }));
    showToast('Account removed');
  };

  const handleRestoreIgnored = () => {
    updateState({ dismissedPatterns: [] });
    showToast('Restored all ignored pattern suggestions');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Net Worth Setup */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div>
          <h4 className="text-base font-bold text-slate-900">Net Worth Configuration</h4>
          <p className="text-xs text-slate-500">
            Net Worth is explicitly configured from total assets minus total liabilities.
          </p>
        </div>

        <form onSubmit={handleSaveNetWorth} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-600">Total Assets ($)</label>
            <input
              type="number"
              step="0.01"
              value={assets}
              onChange={e => setAssets(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Total Liabilities ($)</label>
            <input
              type="number"
              step="0.01"
              value={liabilities}
              onChange={e => setLiabilities(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
              placeholder="0.00"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" className="px-4 py-2 bg-[#6558D3] text-white rounded-xl text-xs font-semibold">
              Save Net Worth
            </button>
          </div>
        </form>
      </div>

      {/* Managed Categories & Accounts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Categories */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <h4 className="text-base font-bold text-slate-900">Managed Categories</h4>
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <input
              type="text"
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              placeholder="New category..."
              className="flex-1 px-3 py-1.5 border border-slate-200 rounded-xl text-xs"
            />
            <button type="submit" className="px-3 py-1.5 bg-[#6558D3] text-white rounded-xl text-xs font-semibold">
              Add
            </button>
          </form>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {state.categories.map(c => (
              <span key={c} className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-lg text-xs font-medium flex items-center gap-1">
                {c}
                <button onClick={() => handleDeleteCategory(c)} className="hover:text-rose-600">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Accounts */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <h4 className="text-base font-bold text-slate-900">Managed Accounts</h4>
          <form onSubmit={handleAddAccount} className="flex gap-2">
            <input
              type="text"
              value={newAcc}
              onChange={e => setNewAcc(e.target.value)}
              placeholder="New account..."
              className="flex-1 px-3 py-1.5 border border-slate-200 rounded-xl text-xs"
            />
            <button type="submit" className="px-3 py-1.5 bg-[#6558D3] text-white rounded-xl text-xs font-semibold">
              Add
            </button>
          </form>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {state.accounts.map(a => (
              <span key={a} className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-lg text-xs font-medium flex items-center gap-1">
                {a}
                <button onClick={() => handleDeleteAccount(a)} className="hover:text-rose-600">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Detection Settings */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        <h4 className="text-base font-bold text-slate-900">Detection Settings</h4>
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>Ignored pattern suggestions: {state.dismissedPatterns.length}</span>
          {state.dismissedPatterns.length > 0 && (
            <button onClick={handleRestoreIgnored} className="text-[#6558D3] font-semibold hover:underline">
              Restore ignored suggestions
            </button>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-rose-50/50 border border-rose-100 p-6 rounded-2xl space-y-3">
        <h4 className="text-base font-bold text-rose-900">Danger Zone</h4>
        <p className="text-xs text-rose-700">
          Erase all transactions, documents, rules, budgets, and goals from Ledgerly.
        </p>
        <button
          onClick={onOpenEraseModal}
          className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition"
        >
          Erase all Ledgerly data
        </button>
      </div>
    </div>
  );
}

function AddEntryModal({ state, updateState, onClose, showToast }) {
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState(state.categories[0] || 'Other');
  const [account, setAccount] = useState(state.accounts[0] || 'Main Checking');
  const [hasReceipt, setHasReceipt] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!merchant || !amount) return;

    const newTx = {
      id: 'tx_' + Date.now(),
      date,
      merchant: merchant.trim(),
      amount: parseFloat(amount),
      type,
      category,
      account,
      tags: [],
      receipt: hasReceipt,
      source: 'manual',
      fingerprint: generateFingerprint(date, merchant, amount, account),
      createdAt: new Date().toISOString()
    };

    updateState(prev => ({
      ...prev,
      transactions: [newTx, ...prev.transactions]
    }));

    showToast('Transaction created');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-900">Add Entry</h3>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>

        {/* Expense / Income Segmented Toggle */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-bold">
          <button
            onClick={() => setType('expense')}
            className={`py-2 rounded-lg transition ${type === 'expense' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            Expense
          </button>
          <button
            onClick={() => setType('income')}
            className={`py-2 rounded-lg transition ${type === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
          >
            Income
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Merchant / Source</label>
            <input
              type="text"
              required
              value={merchant}
              onChange={e => setMerchant(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
              placeholder="e.g. Grocery Store"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Amount ($)</label>
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
              >
                {state.categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Account</label>
              <select
                value={account}
                onChange={e => setAccount(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
              >
                {state.accounts.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="hasReceipt"
              checked={hasReceipt}
              onChange={e => setHasReceipt(e.target.checked)}
              className="rounded text-[#6558D3] focus:ring-[#6558D3]"
            />
            <label htmlFor="hasReceipt" className="text-xs text-slate-600">I have a receipt to attach</label>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold"
            >
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-[#6558D3] text-white rounded-xl text-sm font-semibold">
              Save Entry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportModal({ state, updateState, onClose, showToast }) {
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState(null);

  const handleParseAndImport = () => {
    if (!csvText.trim()) return;

    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return;

    let inserted = 0;
    let duplicates = 0;

    const newTxs = [];
    const existingFps = new Set(state.transactions.map(t => t.fingerprint));

    // Simple line by line parser
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 3) {
        const d = parts[0] || new Date().toISOString().split('T')[0];
        const m = parts[1] || 'Imported Payee';
        const rawAmt = parseFloat(parts[2]) || 0;
        const type = rawAmt < 0 ? 'expense' : 'income';
        const amt = Math.abs(rawAmt);
        const acc = parts[3] || 'Imported Account';

        const fp = generateFingerprint(d, m, amt, acc);

        if (existingFps.has(fp)) {
          duplicates++;
        } else {
          existingFps.add(fp);
          inserted++;
          newTxs.push({
            id: 'tx_csv_' + Date.now() + '_' + i,
            date: d,
            merchant: m,
            amount: amt,
            type,
            category: 'Needs review',
            account: acc,
            tags: ['CSV Import'],
            receipt: false,
            source: 'csv',
            fingerprint: fp,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    if (newTxs.length > 0) {
      updateState(prev => ({
        ...prev,
        transactions: [...newTxs, ...prev.transactions]
      }));
    }

    setImportResult({ inserted, duplicates });
    showToast(`CSV import completed: ${inserted} inserted`);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-900">Import CSV Statement</h3>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>

        {importResult ? (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
            <h4 className="text-base font-bold text-slate-900">Import Complete</h4>
            <div className="text-xs text-slate-600 space-y-1">
              <p>Successfully inserted: <strong>{importResult.inserted}</strong></p>
              <p>Duplicates skipped: <strong>{importResult.duplicates}</strong></p>
            </div>
            <button onClick={onClose} className="px-5 py-2 bg-[#6558D3] text-white rounded-xl text-xs font-bold">
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Paste CSV statement rows below (Format: <code>Date, Merchant, Amount, Account</code>):
            </p>
            <textarea
              rows={6}
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={`Date, Merchant, Amount, Account\n2026-09-10, Whole Foods, -84.20, Checking\n2026-09-12, Payroll, 2500.00, Checking`}
              className="w-full p-3 border border-slate-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-[#6558D3]"
            />
            <div className="flex justify-end space-x-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold">
                Cancel
              </button>
              <button
                onClick={handleParseAndImport}
                className="px-4 py-2 bg-[#6558D3] text-white rounded-xl text-sm font-semibold"
              >
                Process CSV
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DriveSyncModal({ state, updateState, onClose, showToast }) {
  const handleTriggerSync = () => {
    updateState(prev => ({
      ...prev,
      driveSyncInfo: {
        ...prev.driveSyncInfo,
        lastSyncedAt: new Date().toISOString()
      }
    }));
    showToast('Drive Inbox sync check complete');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-900">Google Drive Sync</h3>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>

        <div className="p-4 bg-indigo-50/60 rounded-xl space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Dedicated Folder:</span>
            <span className="font-bold text-slate-900">{state.driveSyncInfo.folderName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Schedule:</span>
            <span className="font-bold text-slate-900">{state.driveSyncInfo.schedule}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Timezone:</span>
            <span className="font-bold text-slate-900">{state.driveSyncInfo.timezone}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Last Synced:</span>
            <span className="font-bold text-slate-900">
              {state.driveSyncInfo.lastSyncedAt ? formatDate(state.driveSyncInfo.lastSyncedAt.split('T')[0]) : 'Never'}
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          The ChatGPT Work automation checks <code>{state.driveSyncInfo.folderName}</code> daily at 8:00 AM local time and securely transfers new financial files to this site.
        </p>

        <div className="flex justify-end space-x-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold">
            Close
          </button>
          <button
            onClick={handleTriggerSync}
            className="px-4 py-2 bg-[#6558D3] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
          >
            <RefreshCw size={14} /> Run Manual Check
          </button>
        </div>
      </div>
    </div>
  );
}

function AddTagModal({ state, transaction, updateState, onClose, showToast }) {
  const [selectedTag, setSelectedTag] = useState('');
  const [newTagName, setNewTagName] = useState('');

  const handleApply = (e) => {
    e.preventDefault();
    let tagToApply = selectedTag;

    if (newTagName.trim()) {
      tagToApply = newTagName.trim();
      if (!state.tags.includes(tagToApply)) {
        updateState(prev => ({
          ...prev,
          tags: [...prev.tags, tagToApply]
        }));
      }
    }

    if (!tagToApply) return;

    updateState(prev => ({
      ...prev,
      transactions: prev.transactions.map(t => {
        if (t.id === transaction.id) {
          const currentTags = t.tags || [];
          if (!currentTags.includes(tagToApply)) {
            return { ...t, tags: [...currentTags, tagToApply] };
          }
        }
        return t;
      })
    }));

    showToast('Tag updated');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-bold text-slate-900">Add Tag to Transaction</h3>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>

        <form onSubmit={handleApply} className="space-y-3 text-xs">
          {state.tags.length > 0 && (
            <div>
              <label className="font-semibold text-slate-600">Select Existing Tag</label>
              <select
                value={selectedTag}
                onChange={e => setSelectedTag(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
              >
                <option value="">-- Choose tag --</option>
                {state.tags.map(tg => (
                  <option key={tg} value={tg}>{tg}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="font-semibold text-slate-600">Or Create New Tag</label>
            <input
              type="text"
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              placeholder="e.g. Tax Deductible"
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl font-semibold">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-[#6558D3] text-white rounded-xl font-semibold">
              Apply Tag
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EraseAllDataModal({ onClose, onConfirm }) {
  const [confirmInput, setConfirmInput] = useState('');

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
        <div className="flex items-center space-x-2 text-rose-600">
          <ShieldAlert size={24} />
          <h3 className="text-lg font-bold text-slate-900">Erase all Ledgerly data</h3>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          This operation will permanently delete all transactions, documents, rules, budgets, and goals from the database and R2 storage. Original files in Google Drive will remain unchanged.
        </p>

        <div>
          <label className="text-xs font-bold text-slate-700">
            Type <span className="font-mono text-rose-600">DELETE</span> to confirm:
          </label>
          <input
            type="text"
            value={confirmInput}
            onChange={e => setConfirmInput(e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-rose-500"
            placeholder="DELETE"
          />
        </div>

        <div className="flex justify-end space-x-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold">
            Cancel
          </button>
          <button
            disabled={confirmInput !== 'DELETE'}
            onClick={onConfirm}
            className="px-4 py-2 bg-rose-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition"
          >
            Confirm Permanent Wipe
          </button>
        </div>
      </div>
    </div>
  );
}