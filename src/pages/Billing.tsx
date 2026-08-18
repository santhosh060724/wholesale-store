import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Product, Bill, BillItem } from '../lib/types';
import { formatCurrency, generateBillNumber } from '../lib/utils';
import ThermalReceipt from '../components/ThermalReceipt';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  X,
  Check,
  Printer,
  User,
  CreditCard,
  Banknote,
  Percent,
  IndianRupee,
} from 'lucide-react';

type CartItem = BillItem & { product_id: string };

export default function Billing() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState('0');
  const [showCheckout, setShowCheckout] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [completedBill, setCompletedBill] = useState<{ bill: Bill; items: BillItem[] } | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });
      if (error) {
        setError(error.message);
      } else {
        setProducts(data || []);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.code.toLowerCase().includes(search.toLowerCase()),
      ),
    [products, search],
  );

  const addToCart = (p: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === p.id);
      if (existing) {
        return prev.map((c) =>
          c.product_id === p.id
            ? {
                ...c,
                quantity: c.quantity + 1,
                total_price: (c.quantity + 1) * c.unit_price,
              }
            : c,
        );
      }
      return [
        ...prev,
        {
          product_id: p.id,
          product_code: p.code,
          product_name: p.name,
          quantity: 1,
          unit_price: p.selling_price,
          total_price: p.selling_price,
        },
      ];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.product_id !== productId) return c;
          const newQty = c.quantity + delta;
          if (newQty <= 0) return null;
          return { ...c, quantity: newQty, total_price: newQty * c.unit_price };
        })
        .filter(Boolean) as CartItem[],
    );
  };

  const setQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.product_id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((c) =>
        c.product_id === productId
          ? { ...c, quantity: qty, total_price: qty * c.unit_price }
          : c,
      ),
    );
  };

  const setUnitPrice = (productId: string, price: number) => {
    if (isNaN(price) || price < 0) price = 0;
    setCart((prev) =>
      prev.map((c) =>
        c.product_id === productId
          ? { ...c, unit_price: price, total_price: c.quantity * price }
          : c,
      ),
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((c) => c.product_id !== productId));
  };

  const subtotal = cart.reduce((sum, c) => sum + c.total_price, 0);
  const discountNum = parseFloat(discountValue) || 0;
  const discountAmount =
    discountType === 'percent'
      ? (subtotal * discountNum) / 100
      : Math.min(discountNum, subtotal);
  const total = subtotal - discountAmount;
  // Unique product lines in the cart, not the summed quantity of all items
  const totalItems = cart.length;

  const handleCheckout = async () => {
    if (cart.length === 0) {
      setError('Cart is empty.');
      return;
    }
    setSaving(true);
    setError('');

    const billNumber = generateBillNumber();
    const billPayload = {
      bill_number: billNumber,
      customer_name: customerName.trim() || null,
      payment_method: paymentMethod,
      bill_language: 'English',
      discount_type: discountType,
      discount_value: discountNum,
      subtotal,
      discount_amount: discountAmount,
      total,
      total_items: totalItems,
    };

    const { data: billData, error: billError } = await supabase
      .from('bills')
      .insert(billPayload)
      .select()
      .single();

    if (billError) {
      setError(billError.message);
      setSaving(false);
      return;
    }

    const itemsPayload = cart.map((c) => ({
      bill_id: billData.id,
      product_id: c.product_id,
      product_code: c.product_code,
      product_name: c.product_name,
      quantity: c.quantity,
      unit_price: c.unit_price,
      total_price: c.total_price,
    }));

    const { error: itemsError } = await supabase.from('bill_items').insert(itemsPayload);
    if (itemsError) {
      setError(itemsError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowCheckout(false);
    setCompletedBill({ bill: billData, items: cart });
    // reset cart
    setCart([]);
    setCustomerName('');
    setDiscountValue('0');
    setDiscountType('percent');
  };

  const closeReceipt = () => {
    setCompletedBill(null);
  };

  if (completedBill) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-center mb-4 print:hidden">
            <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-sm font-medium">
              <Check size={18} />
              Bill saved successfully
            </div>
          </div>
          <ThermalReceipt bill={completedBill.bill} items={completedBill.items} />
          <div className="flex gap-3 mt-4 print:hidden max-w-md mx-auto">
            <button
              onClick={closeReceipt}
              className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition-colors"
            >
              New Bill
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">New Bill</h1>
        <p className="text-sm text-slate-500 mt-1">Tap products to add them to the bill</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Product grid */}
        <div className="lg:col-span-2">
          <div className="relative mb-4">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 bg-white"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <ShoppingCart className="animate-pulse" size={32} />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.map((p) => {
                const inCart = cart.find((c) => c.product_id === p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className={`text-left bg-white rounded-xl border p-3 hover:shadow-md transition-all relative ${
                      inCart
                        ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                        : 'border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    {inCart && (
                      <span className="absolute -top-2 -right-2 bg-emerald-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow">
                        {inCart.quantity}
                      </span>
                    )}
                    <span className="inline-block bg-emerald-50 text-emerald-700 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded mb-2">
                      {p.code}
                    </span>
                    <h3 className="font-semibold text-slate-800 text-xs leading-snug mb-2 min-h-[2rem]">
                      {p.name}
                    </h3>
                    <p className="text-base font-bold text-emerald-600">
                      {formatCurrency(p.selling_price)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart sidebar */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <ShoppingCart size={18} />
                Cart
                {totalItems > 0 && (
                  <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {totalItems}
                  </span>
                )}
              </h2>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Clear all
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <ShoppingCart size={36} className="mb-2" />
                <p className="text-sm">Cart is empty</p>
              </div>
            ) : (
              <>
                <div className="max-h-[40vh] overflow-y-auto p-3 space-y-2">
                  {cart.map((c) => (
                    <div
                      key={c.product_id}
                      className="flex items-center gap-2 bg-slate-50 rounded-lg p-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">
                          {c.product_name}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] text-slate-400">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            value={c.unit_price}
                            onChange={(e) =>
                              setUnitPrice(c.product_id, parseFloat(e.target.value) || 0)
                            }
                            className="w-16 text-xs font-medium border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                          />
                          <span className="text-[10px] text-slate-400">/each</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQty(c.product_id, -1)}
                          className="w-6 h-6 flex items-center justify-center bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-100"
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={c.quantity}
                          onChange={(e) =>
                            setQty(c.product_id, parseFloat(e.target.value) || 0)
                          }
                          onBlur={(e) => {
                            // If left blank or invalid on blur, snap back to a safe value
                            if (e.target.value === '' || isNaN(parseFloat(e.target.value))) {
                              setQty(c.product_id, c.quantity);
                            }
                          }}
                          className="w-14 text-center text-sm font-semibold border border-slate-200 rounded py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <button
                          onClick={() => updateQty(c.product_id, 1)}
                          className="w-6 h-6 flex items-center justify-center bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-100"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <div className="text-right w-16">
                        <p className="text-sm font-bold text-slate-800">
                          {formatCurrency(c.total_price)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeFromCart(c.product_id)}
                        className="text-slate-300 hover:text-red-500 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="p-4 border-t border-slate-100 space-y-3">
                  {/* Discount */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">
                      Discount
                    </label>
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
                    onClick={() => setShowCheckout(true)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-semibold transition-colors shadow-sm flex items-center justify-center gap-2"
                  >
                    <Printer size={18} />
                    Checkout & Print
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Checkout modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-800">Checkout</h2>
              <button
                onClick={() => setShowCheckout(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
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

              <div className="bg-slate-50 rounded-lg p-4 space-y-1.5">
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Items</span>
                  <span>{totalItems}</span>
                </div>
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
                <div className="flex justify-between font-bold text-slate-800 pt-1.5 border-t border-slate-200">
                  <span>Total Payable</span>
                  <span className="text-emerald-600">{formatCurrency(total)}</span>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCheckout(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCheckout}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {saving ? (
                  'Saving...'
                ) : (
                  <>
                    <Check size={18} />
                    Confirm & Print
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
