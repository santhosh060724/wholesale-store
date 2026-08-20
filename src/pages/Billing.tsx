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

/**
 * A text-based numeric input for quantities/rates that need free decimal
 * typing (e.g. 0.100, 0.250, 0.5 for loose grocery items sold by weight).
 *
 * A plain <input type="number"> re-formats its displayed value from the
 * bound number on every keystroke. That's fine for whole numbers, but it
 * breaks decimals that start with "0." — the moment you type the ".", the
 * number 0 renders back as "0", silently deleting the decimal point you
 * just typed, so "0.25" becomes "025" (parsed as 25) instead of 0.25.
 *
 * This component keeps whatever text you've actually typed on screen while
 * you're typing (only re-syncing from the outside value when the field
 * isn't focused — e.g. after the +/- buttons change it), so partial states
 * like "0.", "0.2", "0.25" all stay exactly as typed. The parsed number is
 * still reported on every valid keystroke, so totals keep updating live.
 */
function DecimalInput({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const raw = e.target.value;
        // Only allow digits with at most one decimal point while typing.
        if (!/^\d*\.?\d*$/.test(raw)) return;
        setText(raw);
        const parsed = parseFloat(raw);
        if (!isNaN(parsed)) onChange(parsed);
      }}
      onBlur={() => {
        setFocused(false);
        const parsed = parseFloat(text);
        if (text === '' || isNaN(parsed)) {
          onChange(0);
        } else {
          setText(String(parsed));
          onChange(parsed);
        }
      }}
      className={className}
    />
  );
}

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
  const [showAddItems, setShowAddItems] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [draftCart, setDraftCart] = useState<CartItem[]>([]);
  const [savingAddItems, setSavingAddItems] = useState(false);
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
    // Called on every keystroke while typing (not from the +/- buttons).
    // Unlike updateQty, this must NOT remove the row when the typed value
    // is momentarily 0 — that would delete the item before the user can
    // finish typing something like "0.25" (grocery items sold by
    // fraction of a kg: 100g = 0.100, 250g = 0.250, etc).
    const safeQty = qty < 0 ? 0 : qty;
    setCart((prev) =>
      prev.map((c) =>
        c.product_id === productId
          ? { ...c, quantity: safeQty, total_price: safeQty * c.unit_price }
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

  // --- "Add Items to Bill" modal: works on its own draft copy of the cart,
  // so Cancel discards changes and only "Save to Bill" commits them back
  // onto the real, currently-open bill. ---

  const modalFiltered = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(modalSearch.toLowerCase()) ||
          p.code.toLowerCase().includes(modalSearch.toLowerCase()),
      ),
    [products, modalSearch],
  );

  const openAddItems = () => {
    // This now edits the bill that's already been saved and is on screen
    // (post-checkout), not the pre-checkout cart. Start the draft from
    // whatever items are currently on that saved bill.
    if (!completedBill) return;
    setDraftCart(
      completedBill.items.map((it) => ({
        product_id: it.product_id || '',
        product_code: it.product_code,
        product_name: it.product_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total_price,
      })),
    );
    setModalSearch('');
    setShowAddItems(true);
  };

  const closeAddItemsWithoutSaving = () => {
    if (savingAddItems) return;
    setShowAddItems(false);
    setDraftCart([]);
    setModalSearch('');
  };

  const addToDraft = (p: Product) => {
    setDraftCart((prev) => {
      const existing = prev.find((c) => c.product_id === p.id);
      if (existing) {
        const newQty = existing.quantity + 1;
        return prev.map((c) =>
          c.product_id === p.id
            ? { ...c, quantity: newQty, total_price: newQty * c.unit_price }
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

  const updateDraftQty = (productId: string, delta: number) => {
    setDraftCart((prev) =>
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

  const setDraftQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setDraftCart((prev) => prev.filter((c) => c.product_id !== productId));
      return;
    }
    setDraftCart((prev) =>
      prev.map((c) =>
        c.product_id === productId
          ? { ...c, quantity: qty, total_price: qty * c.unit_price }
          : c,
      ),
    );
  };

  const setDraftUnitPrice = (productId: string, price: number) => {
    if (isNaN(price) || price < 0) price = 0;
    setDraftCart((prev) =>
      prev.map((c) =>
        c.product_id === productId
          ? { ...c, unit_price: price, total_price: c.quantity * price }
          : c,
      ),
    );
  };

  const removeDraftItem = (productId: string) => {
    setDraftCart((prev) => prev.filter((c) => c.product_id !== productId));
  };

  const saveDraftToBill = async () => {
    if (!completedBill) return;
    setSavingAddItems(true);
    setError('');

    const existingBill = completedBill.bill;
    const newSubtotal = draftCart.reduce((sum, c) => sum + c.total_price, 0);
    // Keep the bill's existing discount rule (type + value), just
    // reapply it to the new subtotal.
    const newDiscountAmount =
      existingBill.discount_type === 'percent'
        ? (newSubtotal * existingBill.discount_value) / 100
        : Math.min(existingBill.discount_value, newSubtotal);
    const newTotal = newSubtotal - newDiscountAmount;
    const newTotalItems = draftCart.length;

    // Replace this bill's line items: delete the old set, insert the new
    // one. Simplest way to correctly handle added items, edited
    // quantities, and untouched items all at once.
    const { error: deleteError } = await supabase
      .from('bill_items')
      .delete()
      .eq('bill_id', existingBill.id);
    if (deleteError) {
      setError(deleteError.message);
      setSavingAddItems(false);
      return;
    }

    if (draftCart.length > 0) {
      const itemsPayload = draftCart.map((c) => ({
        bill_id: existingBill.id,
        product_id: c.product_id || null,
        product_code: c.product_code,
        product_name: c.product_name,
        quantity: c.quantity,
        unit_price: c.unit_price,
        total_price: c.total_price,
      }));
      const { error: insertError } = await supabase.from('bill_items').insert(itemsPayload);
      if (insertError) {
        setError(insertError.message);
        setSavingAddItems(false);
        return;
      }
    }

    const { data: updatedBill, error: updateBillError } = await supabase
      .from('bills')
      .update({
        subtotal: newSubtotal,
        discount_amount: newDiscountAmount,
        total: newTotal,
        total_items: newTotalItems,
      })
      .eq('id', existingBill.id)
      .select()
      .single();

    if (updateBillError) {
      setError(updateBillError.message);
      setSavingAddItems(false);
      return;
    }

    // Refresh the on-screen receipt immediately with the updated bill + items.
    setCompletedBill({ bill: updatedBill, items: draftCart });
    setSavingAddItems(false);
    setShowAddItems(false);
    setDraftCart([]);
    setModalSearch('');
  };

  const draftSubtotal = draftCart.reduce((sum, c) => sum + c.total_price, 0);

  // Defined once here (not inline further down) so it's available to BOTH
  // the "bill saved" receipt screen and the "New Bill" screen below — this
  // is what makes the button work correctly on both screens instead of
  // only where the modal JSX happens to be physically written.
  const addItemsModal = showAddItems && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-bold text-slate-800">Add Items to Bill</h2>
          <button
            onClick={closeAddItemsWithoutSaving}
            className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search products..."
              value={modalSearch}
              onChange={(e) => setModalSearch(e.target.value)}
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 bg-white"
            />
          </div>
        </div>

        {/* Body: available products + selected items */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Available products */}
            <div className="lg:col-span-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Available Products
              </h3>
              {modalFiltered.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">No products found</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {modalFiltered.map((p) => {
                    const inDraft = draftCart.find((c) => c.product_id === p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => addToDraft(p)}
                        className={`text-left bg-white rounded-xl border p-3 hover:shadow-md transition-all relative ${
                          inDraft
                            ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                            : 'border-slate-200 hover:border-emerald-300'
                        }`}
                      >
                        {inDraft && (
                          <span className="absolute -top-2 -right-2 bg-emerald-600 text-white text-xs font-bold min-w-6 h-6 px-1 rounded-full flex items-center justify-center shadow">
                            {inDraft.quantity}
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

            {/* Selected items */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Selected Items{draftCart.length > 0 ? ` (${draftCart.length})` : ''}
                </h3>
                {draftCart.length > 0 && (
                  <button
                    onClick={() => setDraftCart([])}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {draftCart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  <ShoppingCart size={28} className="mb-2" />
                  <p className="text-sm">No items selected yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {draftCart.map((c) => (
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
                          <DecimalInput
                            value={c.unit_price}
                            onChange={(n) => setDraftUnitPrice(c.product_id, n)}
                            className="w-16 text-xs font-medium border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                          />
                          <span className="text-[10px] text-slate-400">/each</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateDraftQty(c.product_id, -1)}
                          className="w-6 h-6 flex items-center justify-center bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-100"
                        >
                          <Minus size={12} />
                        </button>
                        <DecimalInput
                          value={c.quantity}
                          onChange={(n) => setDraftQty(c.product_id, n)}
                          className="w-14 text-center text-sm font-semibold border border-slate-200 rounded py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <button
                          onClick={() => updateDraftQty(c.product_id, 1)}
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
                        onClick={() => removeDraftItem(c.product_id)}
                        className="text-slate-300 hover:text-red-500 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {draftCart.length > 0 && (
                <div className="flex justify-between text-sm font-semibold text-slate-700 pt-3 mt-3 border-t border-slate-100">
                  <span>Items Subtotal</span>
                  <span>{formatCurrency(draftSubtotal)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-slate-100 shrink-0">
          <button
            onClick={closeAddItemsWithoutSaving}
            className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={saveDraftToBill}
            disabled={savingAddItems}
            className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {savingAddItems ? (
              'Saving...'
            ) : (
              <>
                <Check size={18} />
                Save to Bill
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

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
              onClick={openAddItems}
              className="flex-1 inline-flex items-center justify-center gap-2 border-2 border-dashed border-emerald-400 text-emerald-700 hover:bg-emerald-50 px-4 py-2.5 rounded-lg font-semibold transition-colors"
            >
              <Plus size={18} />
              Add Items
            </button>
            <button
              onClick={closeReceipt}
              className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition-colors"
            >
              New Bill
            </button>
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-3 max-w-md mx-auto">
              {error}
            </p>
          )}
        </div>
        {addItemsModal}
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
                          <DecimalInput
                            value={c.unit_price}
                            onChange={(n) => setUnitPrice(c.product_id, n)}
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
                        <DecimalInput
                          value={c.quantity}
                          onChange={(n) => setQty(c.product_id, n)}
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
            )}

            {cart.length > 0 && (
              <>
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

      {addItemsModal}

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