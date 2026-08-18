import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { TrendingUp, Receipt, Package, IndianRupee } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalSales: 0,
    totalBills: 0,
    totalProducts: 0,
    todaySales: 0,
    todayBills: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentBills, setRecentBills] = useState<
    { bill_number: string; total: number; created_at: string; customer_name: string | null }[]
  >([]);

  useEffect(() => {
    (async () => {
      const [{ data: bills }, { data: products }] = await Promise.all([
        supabase.from('bills').select('total, created_at, bill_number, customer_name'),
        supabase.from('products').select('id'),
      ]);

      const allBills = bills || [];
      const totalSales = allBills.reduce((s, b) => s + (b.total || 0), 0);
      const today = new Date().toISOString().slice(0, 10);
      const todayBills = allBills.filter(
        (b) => b.created_at && b.created_at.slice(0, 10) === today,
      );
      const todaySales = todayBills.reduce((s, b) => s + (b.total || 0), 0);

      setStats({
        totalSales,
        totalBills: allBills.length,
        totalProducts: products?.length || 0,
        todaySales,
        todayBills: todayBills.length,
      });
      setRecentBills(
        [...allBills]
          .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
          .slice(0, 5),
      );
      setLoading(false);
    })();
  }, []);

  const cards = [
    {
      label: "Today's Sales",
      value: formatCurrency(stats.todaySales),
      sub: `${stats.todayBills} bills today`,
      icon: IndianRupee,
      color: 'emerald',
    },
    {
      label: 'Total Sales',
      value: formatCurrency(stats.totalSales),
      sub: 'All time',
      icon: TrendingUp,
      color: 'blue',
    },
    {
      label: 'Total Bills',
      value: String(stats.totalBills),
      sub: 'Generated',
      icon: Receipt,
      color: 'amber',
    },
    {
      label: 'Products',
      value: String(stats.totalProducts),
      sub: 'In catalog',
      icon: Package,
      color: 'slate',
    },
  ];

  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Overview of your store performance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-500">{c.label}</span>
                <div className={`p-2 rounded-lg ${colorMap[c.color]}`}>
                  <Icon size={18} />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {loading ? '—' : c.value}
              </p>
              <p className="text-xs text-slate-400 mt-1">{c.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-bold text-slate-800 mb-4">Recent Bills</h2>
        {recentBills.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No bills yet</p>
        ) : (
          <div className="space-y-2">
            {recentBills.map((b, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0"
              >
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-700">
                    {b.bill_number}
                  </p>
                  <p className="text-xs text-slate-400">
                    {b.customer_name || 'Walk-in customer'}
                  </p>
                </div>
                <p className="font-bold text-emerald-600">{formatCurrency(b.total)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
