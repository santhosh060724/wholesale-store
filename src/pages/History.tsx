import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { SavedBillWithItems, BillItem } from '../lib/types';
import { formatCurrency, formatDate } from '../lib/utils';
import ThermalReceipt from '../components/ThermalReceipt';
import { Receipt, Eye, X, Trash2, AlertTriangle } from 'lucide-react';

export default function History() {
  const [bills, setBills] = useState<SavedBillWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<{ bill: SavedBillWithItems; items: BillItem[] } | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const fetchBills = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bills')
      .select('*, bill_items(*)')
      .order('created_at', { ascending: false });
    if (error) {
      setError(error.message);
    } else {
      setBills(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBills();
  }, []);

  const viewBill = (b: SavedBillWithItems) => {
    const items: BillItem[] = b.bill_items.map((bi) => ({
      product_id: bi.product_id,
      product_code: bi.product_code,
      product_name: bi.product_name,
      quantity: bi.quantity,
      unit_price: bi.unit_price,
      total_price: bi.total_price,
    }));
    setViewing({ bill: b, items });
  };

  const deleteBill = async (id: string, billNumber: string) => {
    if (!confirm(`Delete bill ${billNumber}? This cannot be undone.`)) return;
    setDeletingId(id);
    const { error } = await supabase.from('bills').delete().eq('id', id);
    if (error) {
      setError(error.message);
    } else {
      setBills((prev) => prev.filter((b) => b.id !== id));
    }
    setDeletingId(null);
  };

  const deleteAllBills = async () => {
    setDeletingAll(true);
    // Supabase requires a filter on bulk deletes; this "id is not null" filter
    // matches every row, effectively deleting all bills (bill_items cascade too).
    const { error } = await supabase.from('bills').delete().not('id', 'is', null);
    if (error) {
      setError(error.message);
    } else {
      setBills([]);
    }
    setDeletingAll(false);
    setConfirmDeleteAll(false);
  };

  if (viewing) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-4 print:hidden">
            <h2 className="font-bold text-slate-800">Receipt</h2>
            <button
              onClick={() => setViewing(null)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
            >
              <X size={20} />
            </button>
          </div>
          <ThermalReceipt bill={viewing.bill} items={viewing.items} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Bill History</h1>
          <p className="text-sm text-slate-500 mt-1">{bills.length} bills generated</p>
        </div>
        {bills.length > 0 && (
          <button
            onClick={() => setConfirmDeleteAll(true)}
            className="inline-flex items-center gap-1.5 text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
          >
            <Trash2 size={15} />
            Delete All
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Receipt className="animate-pulse" size={32} />
        </div>
      ) : bills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Receipt size={48} className="mb-3" />
          <p className="text-sm">No bills yet</p>
        </div>
      ) : (
        <>
          {/* Desktop / tablet: table */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-4 py-3">
                    Bill No
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-4 py-3">
                    Date
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-4 py-3">
                    Customer
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase px-4 py-3">
                    Payment
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase px-4 py-3">
                    Items
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase px-4 py-3">
                    Total
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-700">
                      {b.bill_number}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatDate(b.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {b.customer_name || 'Walk-in'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex bg-slate-100 text-slate-600 text-xs font-medium px-2 py-1 rounded">
                        {b.payment_method}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">
                      {b.total_items}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800">
                      {formatCurrency(b.total)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => viewBill(b)}
                          className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                        >
                          <Eye size={16} />
                          View
                        </button>
                        <button
                          onClick={() => deleteBill(b.id, b.bill_number)}
                          disabled={deletingId === b.id}
                          className="inline-flex items-center gap-1 text-red-500 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards, so nothing gets cut off */}
          <div className="md:hidden space-y-3">
            {bills.map((b) => (
              <div key={b.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-slate-700">{b.bill_number}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(b.created_at)}</p>
                  </div>
                  <span className="inline-flex bg-slate-100 text-slate-600 text-xs font-medium px-2 py-1 rounded shrink-0">
                    {b.payment_method}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm text-slate-600 border-t border-slate-100 pt-2.5 mt-1">
                  <span>{b.customer_name || 'Walk-in'}</span>
                  <span>{b.total_items} item{b.total_items !== 1 ? 's' : ''}</span>
                </div>

                <div className="flex items-center justify-between mt-2.5">
                  <span className="text-lg font-bold text-slate-800">{formatCurrency(b.total)}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => viewBill(b)}
                      className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-lg"
                    >
                      <Eye size={14} />
                      View
                    </button>
                    <button
                      onClick={() => deleteBill(b.id, b.bill_number)}
                      disabled={deletingId === b.id}
                      className="inline-flex items-center gap-1 bg-red-50 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {confirmDeleteAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-3">
                <AlertTriangle size={22} />
              </div>
              <h2 className="text-lg font-bold text-slate-800 mb-1.5">Delete all bills?</h2>
              <p className="text-sm text-slate-500 mb-6">
                This will permanently delete all {bills.length} bill{bills.length !== 1 ? 's' : ''} and
                their items. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteAll(false)}
                disabled={deletingAll}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteAllBills}
                disabled={deletingAll}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {deletingAll ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
