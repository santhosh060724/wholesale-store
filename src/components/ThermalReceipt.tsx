import { useEffect, useRef, useState } from 'react';
import type { Bill, BillItem } from '../lib/types';
import { formatCurrency, formatDate } from '../lib/utils';
import { buildEscPosReceipt, type StoreInfo } from '../lib/escpos';
import {
  connectBluetoothPrinter,
  printViaBluetooth,
  isBluetoothPrinterConnected,
  getConnectedBluetoothPrinterName,
  isWebBluetoothSupported,
  isIOS,
  getBluetoothPrinterSettings,
  saveBluetoothPrinterSettings,
  getCharsPerLine,
  tryAutoReconnect,
  hasRememberedPrinter,
  forgetRememberedPrinter,
  type PaperWidth,
} from '../lib/bluetoothPrinter';
import { Printer, Bluetooth, Check, AlertCircle, Loader2, Settings, X } from 'lucide-react';

type Props = {
  bill: Bill;
  items: BillItem[];
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
};

const defaultStore: StoreInfo = {
  storeName: 'New Manikanta Agencies',
  storeAddress: 'Main Road, Shadnagar',
  storePhone: '9440297367, 9985653474, 9030522597',
};

export default function ThermalReceipt({
  bill,
  items,
  storeName = defaultStore.storeName,
  storeAddress = defaultStore.storeAddress,
  storePhone = defaultStore.storePhone,
}: Props) {
  const [printerStatus, setPrinterStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'printing' | 'done' | 'error'
  >('idle');
  const [printerMsg, setPrinterMsg] = useState('');
  const [btSupported] = useState(() => isWebBluetoothSupported());
  const [onIOS] = useState(() => isIOS());
  const [showBtSettings, setShowBtSettings] = useState(false);
  const [btSettings, setBtSettings] = useState(getBluetoothPrinterSettings());
  const [autoReconnectTried, setAutoReconnectTried] = useState(false);
  // Tracks ONLY the silent background auto-reconnect attempt — deliberately
  // separate from `printerStatus`. Buttons below check `printerStatus`, not
  // this, so a slow/failing background check on mount can never disable
  // "Connect" or "Print" or make them look stuck. A user's manual tap
  // always takes priority and is never blocked by this.
  const [autoReconnecting, setAutoReconnecting] = useState(false);
  const attemptedRef = useRef(false);

  const store: StoreInfo = { storeName, storeAddress, storePhone };

  // Try to silently reconnect to the last-used printer as soon as the
  // receipt is shown, so "Print to Thermal Printer" usually just works
  // without a manual "Connect" tap first. Fails silently — this is a
  // background nicety, not a user-initiated action, so no error is shown
  // if there's no remembered printer or it's unreachable right now. This
  // must NEVER disable or block the buttons below — see autoReconnecting
  // above.
  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    if (!btSupported || !hasRememberedPrinter()) {
      setAutoReconnectTried(true);
      return;
    }
    setAutoReconnecting(true);
    tryAutoReconnect()
      .then((device) => {
        if (device) {
          setPrinterStatus('connected');
          setPrinterMsg(`Auto-connected to ${device.name}`);
        }
        // On failure, deliberately leave printerStatus at 'idle' — nothing
        // to show, nothing to unstick, buttons were never disabled.
      })
      .finally(() => {
        setAutoReconnecting(false);
        setAutoReconnectTried(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBrowserPrint = () => {
    window.print();
  };

  const handleConnectBluetooth = async () => {
    setPrinterStatus('connecting');
    setPrinterMsg('');
    try {
      const device = await connectBluetoothPrinter();
      setPrinterStatus('connected');
      setPrinterMsg(`Connected to ${device.name}`);
    } catch (err: any) {
      setPrinterStatus('error');
      setPrinterMsg(err.message || 'Failed to connect to Bluetooth printer');
    }
  };

  const handleBluetoothPrint = async () => {
    if (!isBluetoothPrinterConnected()) {
      await handleConnectBluetooth();
      if (!isBluetoothPrinterConnected()) return;
    }
    setPrinterStatus('printing');
    setPrinterMsg('');
    try {
      const data = buildEscPosReceipt(bill, items, store, getCharsPerLine());
      await printViaBluetooth(data);
      setPrinterStatus('done');
      setPrinterMsg('Receipt sent to printer');
      setTimeout(() => setPrinterStatus('connected'), 3000);
    } catch (err: any) {
      setPrinterStatus('error');
      setPrinterMsg(err.message || 'Print failed. Check Printer Settings if this keeps happening.');
    }
  };

  const handleSaveBtSettings = () => {
    saveBluetoothPrinterSettings(btSettings);
    setShowBtSettings(false);
  };

  const handleForgetPrinter = () => {
    forgetRememberedPrinter();
    setShowBtSettings(false);
  };

  const statusColor = {
    idle: 'text-slate-400',
    connecting: 'text-amber-500',
    connected: 'text-emerald-600',
    printing: 'text-blue-500',
    done: 'text-emerald-600',
    error: 'text-red-500',
  }[printerStatus];

  const isConnected = printerStatus === 'connected' || printerStatus === 'printing' || printerStatus === 'done';

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #thermal-receipt, #thermal-receipt * { visibility: visible !important; }
          #thermal-receipt {
            position: absolute !important;
            left: 0; top: 0;
            width: 80mm;
            margin: 0;
            box-shadow: none !important;
            border: none !important;
            padding: 4mm !important;
          }
          @page { size: 80mm auto; margin: 0; }
        }
      `}</style>

      {/* Print controls */}
      <div className="print:hidden mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleBrowserPrint}
            className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Printer size={18} />
            Browser Print
          </button>

          {btSupported ? (
            <>
              {!isConnected && (
                <button
                  onClick={handleConnectBluetooth}
                  disabled={printerStatus === 'connecting'}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
                >
                  {printerStatus === 'connecting' ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Bluetooth size={18} />
                  )}
                  Connect Bluetooth Printer
                </button>
              )}
              <button
                onClick={handleBluetoothPrint}
                disabled={printerStatus === 'printing' || printerStatus === 'connecting'}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
              >
                {printerStatus === 'printing' ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : printerStatus === 'done' ? (
                  <Check size={18} />
                ) : (
                  <Printer size={18} />
                )}
                {printerStatus === 'printing'
                  ? 'Printing...'
                  : printerStatus === 'done'
                    ? 'Printed!'
                    : 'Print to Thermal Printer'}
              </button>
              <button
                onClick={() => setShowBtSettings(true)}
                className="inline-flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2.5 rounded-lg font-medium transition-colors"
                title="Printer Settings"
              >
                <Settings size={18} />
              </button>
            </>
          ) : (
            <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-2.5 rounded-lg text-sm max-w-md">
              <AlertCircle size={18} className="shrink-0" />
              {onIOS
                ? "Bluetooth printing isn't supported on iPhone/iPad in any browser (Apple restriction). Use Browser Print instead, or switch to Android/PC with Chrome or Edge for direct printing."
                : 'Bluetooth printing needs Chrome or Edge. Use Browser Print instead, or open this app in Chrome/Edge for direct printing.'}
            </div>
          )}
        </div>

        {/* Status line */}
        {(printerMsg || isConnected) && (
          <div className={`flex items-center gap-1.5 text-sm font-medium ${statusColor}`}>
            {printerStatus === 'done' && <Check size={14} />}
            {printerStatus === 'error' && <AlertCircle size={14} />}
            {printerStatus === 'printing' && <Loader2 size={14} className="animate-spin" />}
            {printerStatus === 'connected' && <Bluetooth size={14} />}
            {printerMsg ||
              (printerStatus === 'connected'
                ? `Connected to ${getConnectedBluetoothPrinterName() || 'printer'}`
                : '')}
          </div>
        )}

        {/* Silent background check for a remembered printer — purely
            informational. The buttons above are never disabled by this,
            so tapping "Print to Thermal Printer" right now still works
            immediately; it just won't have to wait as long for the
            background attempt to clear out of the way first. */}
        {autoReconnecting && printerStatus === 'idle' && (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 size={12} className="animate-spin" />
            Checking for your saved printer...
          </p>
        )}

        {btSupported && printerStatus === 'idle' && !autoReconnecting && autoReconnectTried && (
          <p className="text-xs text-slate-400">
            {hasRememberedPrinter()
              ? "Couldn't reach your saved printer (off or out of range) — tap \"Connect Bluetooth Printer\" to pick it again."
              : 'Tip: Tap "Connect Bluetooth Printer" once and pick your printer — after that, it should auto-connect on future bills without asking again.'}
          </p>
        )}
      </div>

      {/* Bluetooth printer settings modal */}
      {showBtSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800">Printer Settings</h2>
              <button
                onClick={() => setShowBtSettings(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Paper Width
              </label>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                {(['58mm', '80mm'] as PaperWidth[]).map((w) => (
                  <button
                    key={w}
                    onClick={() => setBtSettings({ ...btSettings, paperWidth: w })}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      btSettings.paperWidth === w
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                If your receipt only fills half the paper (blank space on the right), your
                printer is probably 80mm — pick that. Most standard shop receipt printers are
                80mm.
              </p>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              Leave both fields below blank to auto-detect (works for most budget Bluetooth
              ESC/POS printers). If printing connects but nothing comes out, check your printer's
              manual for its exact Service/Characteristic UUIDs and enter them here.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Service UUID <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={btSettings.serviceUuid}
                  onChange={(e) => setBtSettings({ ...btSettings, serviceUuid: e.target.value })}
                  placeholder="e.g. 0000ffe0-0000-1000-8000-00805f9b34fb"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Characteristic UUID <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={btSettings.characteristicUuid}
                  onChange={(e) => setBtSettings({ ...btSettings, characteristicUuid: e.target.value })}
                  placeholder="e.g. 0000ffe1-0000-1000-8000-00805f9b34fb"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            {hasRememberedPrinter() && (
              <button
                onClick={handleForgetPrinter}
                className="w-full mt-4 text-xs text-red-500 hover:text-red-700 font-medium text-center"
              >
                Forget saved printer (switching to a different one)
              </button>
            )}

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowBtSettings(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBtSettings}
                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual receipt */}
      <div
        id="thermal-receipt"
        className="bg-white text-black mx-auto font-mono"
        style={{ width: '80mm', padding: '4mm', fontSize: '12px', lineHeight: '1.4' }}
      >
        {/* Header */}
        <div className="text-center">
          <div className="font-bold text-base uppercase tracking-wide">{storeName}</div>
          <div className="text-[11px]">{storeAddress}</div>
          <div className="text-[11px]">Tel: {storePhone}</div>
        </div>

        <div className="border-t border-dashed border-black my-2" />

        {/* Bill info */}
        <div className="text-[11px]">
          <div className="flex justify-between">
            <span>Bill No:</span>
            <span className="font-semibold">{bill.bill_number}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span>{formatDate(bill.created_at)}</span>
          </div>
          {bill.customer_name && (
            <div className="flex justify-between">
              <span>Customer:</span>
              <span>{bill.customer_name}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Payment:</span>
            <span>{bill.payment_method}</span>
          </div>
        </div>

        <div className="border-t border-dashed border-black my-2" />

        {/* Items header */}
        <div className="flex font-bold text-[11px]">
          <span className="flex-1">Item</span>
          <span className="w-10 text-center">Qty</span>
          <span className="w-16 text-right">Price</span>
          <span className="w-16 text-right">Amt</span>
        </div>
        <div className="border-t border-black my-1" />

        {/* Items */}
        {items.map((item, i) => (
          <div key={i} className="flex text-[11px] py-0.5">
            <span className="flex-1 truncate pr-1">
              {item.product_name}
            </span>
            <span className="w-10 text-center">{item.quantity}</span>
            <span className="w-16 text-right">{item.unit_price.toFixed(2)}</span>
            <span className="w-16 text-right font-semibold">{item.total_price.toFixed(2)}</span>
          </div>
        ))}

        <div className="border-t border-dashed border-black my-2" />

        {/* Totals */}
        <div className="text-[11px] space-y-0.5">
          <div className="flex justify-between">
            <span>Total Items:</span>
            <span>{bill.total_items}</span>
          </div>
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>{formatCurrency(bill.subtotal)}</span>
          </div>
          {bill.discount_amount > 0 && (
            <>
              <div className="flex justify-between">
                <span>
                  Discount ({bill.discount_type === 'percent' ? `${bill.discount_value}%` : 'Flat'}):
                </span>
                <span>-{formatCurrency(bill.discount_amount)}</span>
              </div>
            </>
          )}
          <div className="border-t border-black my-1" />
          <div className="flex justify-between font-bold text-sm">
            <span>TOTAL:</span>
            <span>{formatCurrency(bill.total)}</span>
          </div>
        </div>

        <div className="border-t border-dashed border-black my-2" />

        {/* Footer */}
        <div className="text-center text-[11px]">
          <p className="font-bold">Thank You!</p>
          <p>Visit Again</p>
        </div>
      </div>
    </>
  );
}