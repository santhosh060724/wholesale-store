import { useState } from 'react';
import type { Bill, BillItem } from '../lib/types';
import { formatCurrency, generateBillNumber } from '../lib/utils';
import ThermalReceipt from '../components/ThermalReceipt';
import {
  Calculator as CalculatorIcon,
  Plus,
  Trash2,
  Percent,
  IndianRupee,
  Banknote,
  CreditCard,
  User,
  Printer,
  Check,
  Delete,
} from 'lucide-react';

type CalcItem = {
  id: string;
  price: number;
  qty: number;
};

/**
 * Parses one line of quick-entry text into a price/quantity pair.
 *
 * Accepted formats:
 *   "50"          -> price 50, qty 1 (quantity defaults to 1 when omitted)
 *   "50*2"        -> price 50, qty 2
 *   "50 * 2"      -> price 50, qty 2 (spaces allowed)
 *   "50x2" / "50X2" -> same, using x/X instead of *
 *
 * Returns null for a blank or unparseable line.
 */
function parseEntry(raw: string): { price: number; qty: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Supports:
  // 50*2
  // 50*.25
  // 50*0.500
  // 50 * .25
  // 50x2
  // 50X.25
  // 50×0.500
  const match = trimmed.match(
    /^(\d+(?:\.\d+)?|\.\d+)\s*[*xX×]\s*(\d+(?:\.\d+)?|\.\d+)$/
  );

  if (match) {
    const price = parseFloat(match[1]);
    const qty = parseFloat(match[2]);

    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) {
      return null;
    }

    return { price, qty };
  }

  // If a quantity separator is present but quantity is missing,
  // the entry is invalid. Do not default quantity to 1.
  if (/[*xX×]/.test(trimmed)) {
    return null;
  }

  // No quantity mentioned -> quantity defaults to 1.
  // Supports prices such as 50, 50.50, .25 and .500.
  const price = parseFloat(trimmed);

  if (!Number.isFinite(price)) return null;

  return { price, qty: 1 };
}

export default function Calculator() {
  const [entryText, setEntryText] = useState('');
  const [entryError, setEntryError] = useState('');
  const [items, setItems] = useState<CalcItem[]>([]);

  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState('0');

  const [generatedBill, setGeneratedBill] = useState<{ bill: Bill; items: BillItem[] } | null>(
    null,
  );

  const addEntry = () => {
    if (!entryText.trim()) return;
    // Supports pasting/typing several lines at once (one entry per line),
    // as well as the normal single "price*qty" -> Enter flow.
    const lines = entryText.split('\n');
    const parsed: { price: number; qty: number }[] = [];
    for (const line of lines) {
      const p = parseEntry(line);
      if (p) parsed.push(p);
    }

    if (parsed.length === 0) {
      setEntryError('Enter a valid amount, e.g. 50 or 50*2');
      return;
    }

    setEntryError('');
    setItems((prev) => [
      ...prev,
      ...parsed.map((p) => ({ id: crypto.randomUUID(), price: p.price, qty: p.qty })),
    ]);
    setEntryText('');
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const clearAll = () => {
    setItems([]);
    setEntryText('');
    setEntryError('');
  };

  const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const discountNum = parseFloat(discountValue) || 0;
  const discountAmount =
    discountType === 'percent'
      ? (subtotal * discountNum) / 100
      : Math.min(discountNum, subtotal);
  const total = subtotal - discountAmount;

  const handleGenerateReceipt = () => {
    if (items.length === 0) return;

    const billItems: BillItem[] = items.map((it, idx) => ({
      product_id: null,
      product_code: '',
      product_name: `Item ${idx + 1}`,
      quantity: it.qty,
      unit_price: it.price,
      total_price: it.price * it.qty,
    }));

    const bill: Bill = {
      id: crypto.randomUUID(),
      bill_number: generateBillNumber(),
      customer_name: customerName.trim() || null,
      payment_method: paymentMethod,
      bill_language: 'English',
      discount_type: discountType,
      discount_value: discountNum,
      subtotal,
      discount_amount: discountAmount,
      total,
      total_items: billItems.length,
      created_at: new Date().toISOString(),
    };

    setGeneratedBill({ bill, items: billItems });
  };

  const startNewCalculation = () => {
    setGeneratedBill(null);
    clearAll();
    setCustomerName('');
    setPaymentMethod('Cash');
    setDiscountType('percent');
    setDiscountValue('0');
  };

  const addMoreItems = () => {
    setGeneratedBill(null);
    setEntryText('');
    setEntryError('');
  };

  if (generatedBill) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-center mb-4 print:hidden">
            <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-sm font-medium">
              <Check size={18} />
              Receipt ready
            </div>
          </div>
          <ThermalReceipt bill={generatedBill.bill} items={generatedBill.items} />
          <div className="flex gap-3 mt-4 print:hidden max-w-md mx-auto">
            <button
              onClick={addMoreItems}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
            >
              Add Items
            </button>
            <button
              onClick={startNewCalculation}
              className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition-colors"
            >
              New Calculation
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <CalculatorIcon size={24} />
          Calculator
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Type a price and press Enter. Use <span className="font-mono">price*qty</span> (e.g.{' '}
          <span className="font-mono">50*2</span>) when there's more than one — quantity defaults
          to 1 if you just enter a price.
        </p>
      </div>

      {/* Full virtual calculator */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-5">
        <div className="mb-3">
          <label className="block text-sm font-medium text-slate-600 mb-1">
            Enter Price / Quantity
          </label>

          <input
            type="text"
            inputMode="none"
            readOnly
            autoFocus
            value={entryText}
            placeholder="0"
            className="w-full px-4 py-3 border border-slate-200 rounded-lg text-right text-2xl font-bold text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
          />

          {entryError && (
            <p className="text-sm text-red-600 mt-2">
              {entryError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            '7', '8', '9', '×',
            '4', '5', '6', 'C',
            '1', '2', '3', '⌫',
            '0', '.', '00', '+',
          ].map((key) => {
            const isOperator = key === '×' || key === '+';
            const isAction = key === 'C' || key === '⌫';

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setEntryError('');

                  if (key === 'C') {
                    setEntryText('');
                    return;
                  }

                  if (key === '⌫') {
                    setEntryText((prev) => prev.slice(0, -1));
                    return;
                  }

                  if (key === '+') {
                    // Plus is not a valid item separator, so keep it
                    // unavailable as an accidental bill entry.
                    return;
                  }

                  setEntryText((prev) => {
                    // Only allow one multiplication symbol.
                    if (key === '×' && /[*xX×]/.test(prev)) {
                      return prev;
                    }

                    // Prevent a multiplication symbol as the first character.
                    if (key === '×' && !prev.trim()) {
                      return prev;
                    }

                    // Prevent multiple decimal points in the same
                    // price or quantity portion.
                    if (key === '.') {
                      const parts = prev.split(/[×*xX]/);
                      const currentPart = parts[parts.length - 1];

                      if (currentPart.includes('.')) {
                        return prev;
                      }

                      // Allow ".25" as requested.
                      if (!currentPart) {
                        return `${prev}.`;
                      }
                    }

                    return `${prev}${key}`;
                  });
                }}
                className={`h-14 sm:h-16 rounded-lg text-xl sm:text-2xl font-bold transition-colors active:scale-95 ${
                  key === '×'
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : key === 'C'
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : key === '⌫'
                        ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                        : isOperator
                          ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          : 'bg-slate-50 text-slate-800 hover:bg-slate-100'
                }`}
              >
                {key === '⌫' ? <Delete size={22} className="mx-auto" /> : key}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addEntry}
          className="w-full mt-3 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white py-3.5 rounded-lg font-semibold text-lg transition-colors shadow-sm"
        >
          <Plus size={20} />
          Add Item
        </button>

        <p className="text-xs text-slate-400 text-center mt-2">
          Examples: 50 = quantity 1 &nbsp;•&nbsp; 50 × 2 &nbsp;•&nbsp; 50 × .25
        </p>
      </div>

      {/* Items list */}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-5">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            Items
            {items.length > 0 && (
              <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                {items.length}
              </span>
            )}
          </h2>
          {items.length > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Clear all
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <CalculatorIcon size={36} className="mb-2" />
            <p className="text-sm">No items yet — add your first amount above</p>
          </div>
        ) : (
          <div className="max-h-[45vh] overflow-y-auto p-3 space-y-2">
            {items.map((it, idx) => (
              <div
                key={it.id}
                className="flex items-center gap-3 bg-slate-50 rounded-lg p-2.5"
              >
                <span className="w-14 shrink-0 text-xs font-semibold text-slate-500">
                  Item {idx + 1}
                </span>
                <span className="flex-1 text-sm text-slate-600">
                  {formatCurrency(it.price)} &times; {it.qty}
                </span>
                <span className="w-24 text-right text-sm font-bold text-slate-800">
                  {formatCurrency(it.price * it.qty)}
                </span>
                <button
                  onClick={() => removeItem(it.id)}
                  className="text-slate-300 hover:text-red-500 p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
          {/* Customer name (optional) */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Customer Name (optional)
            </label>
            <div className="relative">
              <User
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                placeholder="Walk-in customer"
              />
            </div>
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              Payment Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Cash', icon: Banknote },
                { label: 'Card', icon: CreditCard },
                { label: 'UPI', icon: IndianRupee },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.label}
                    onClick={() => setPaymentMethod(m.label)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-lg border text-xs font-medium transition-colors ${
                      paymentMethod === m.label
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={18} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Discount */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Discount</label>
            <div className="flex gap-2">
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setDiscountType('percent')}
                  className={`px-2.5 py-1.5 text-xs font-medium ${
                    discountType === 'percent'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <Percent size={14} />
                </button>
                <button
                  onClick={() => setDiscountType('amount')}
                  className={`px-2.5 py-1.5 text-xs font-medium ${
                    discountType === 'amount'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <IndianRupee size={14} />
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                placeholder="0"
              />
            </div>
          </div>

          {/* Totals */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-red-500">
                <span>Discount</span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <span className="font-bold text-slate-800">Total</span>
              <span className="text-2xl font-bold text-emerald-600">
                {formatCurrency(total)}
              </span>
            </div>
          </div>

          <button
            onClick={handleGenerateReceipt}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-semibold transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            <Printer size={18} />
            Generate Receipt
          </button>
        </div>
      )}
    </div>
  );
}