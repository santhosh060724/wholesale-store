import { useState } from 'react';
import { LayoutDashboard, ShoppingCart, Package, Receipt, Store, Users, Calculator as CalculatorIcon } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Billing from './pages/Billing';
import Products from './pages/Products';
import History from './pages/History';
import StaffPage from './pages/Staff';
import CalculatorPage from './pages/Calculator';

type Tab = 'dashboard' | 'billing' | 'products' | 'history' | 'staff' | 'calculator';

const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'billing', label: 'New Bill', icon: ShoppingCart },
  { id: 'calculator', label: 'Calculator', icon: CalculatorIcon },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'history', label: 'History', icon: Receipt },
  { id: 'staff', label: 'Staff', icon: Users },
];

function App() {
  const [active, setActive] = useState<Tab>('billing');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex w-60 bg-white border-r border-slate-200 flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-100">
          {/* <div className="bg-emerald-600 text-white p-2 rounded-lg">
            <Store size={20} />
          </div> */}
          {/* This is the new line */}
          <img src="/favicon.png" alt="New Manikanta Agencies" className="w-10 h-10 rounded-lg object-contain"/> 
          <div>
            <h1 className="font-bold text-slate-800 text-sm leading-tight">New Manikanta Agencies</h1>
            <p className="text-[11px] text-slate-400">Billing System</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active === t.id
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Icon size={18} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Top bar (mobile) */}
      <header className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2.5 sticky top-0 z-40">
        {/* <div className="bg-emerald-600 text-white p-1.5 rounded-lg">
          <Store size={18} />
        </div> */}
        {/* This is the new line */}
        <img src="/favicon.png" alt="New Manikanta Agencies" className="w-10 h-10 rounded-lg object-contain"/>
        <h1 className="font-bold text-slate-800 text-sm">New Manikanta Agencies</h1>
      </header>

      {/* Mobile nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-40">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                active === t.id ? 'text-emerald-600' : 'text-slate-400'
              }`}
            >
              <Icon size={20} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
        {active === 'dashboard' && <Dashboard />}
        {active === 'billing' && <Billing />}
        {active === 'calculator' && <CalculatorPage />}
        {active === 'products' && <Products />}
        {active === 'history' && <History />}
        {active === 'staff' && <StaffPage />}
      </main>
    </div>
  );
}

export default App;
