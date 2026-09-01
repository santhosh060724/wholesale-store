import type { Bill, BillItem } from './types';
import { formatDate } from './utils';

// ESC/POS command helpers
const ESC = 0x1b;
const GS = 0x1d;

const enc = new TextEncoder();

const cmd = (...bytes: number[]) => new Uint8Array(bytes);

const init = () => cmd(ESC, 0x40);
const feed = (n = 1) => cmd(ESC, 0x64, n);
const cut = () => cmd(GS, 0x56, 0x00);
const alignCenter = () => cmd(ESC, 0x61, 0x01);
const alignLeft = () => cmd(ESC, 0x61, 0x00);
const boldOn = () => cmd(ESC, 0x45, 0x01);
const boldOff = () => cmd(ESC, 0x45, 0x00);
const doubleWidthOn = () => cmd(GS, 0x21, 0x10);
const doubleWidthOff = () => cmd(GS, 0x21, 0x00);
const textSize = (n: number) => cmd(GS, 0x21, n);
const fontB = () => cmd(ESC, 0x4d, 0x01); // compact font for 80mm / 74-column receipts

const line = (s = '') => enc.encode(s + '\n');

const pad = (s: string, len: number, align: 'left' | 'right' = 'left') => {
  const str = String(s);
  if (str.length >= len) return str.slice(0, len);
  return align === 'right' ? ' '.repeat(len - str.length) + str : str + ' '.repeat(len - str.length);
};

const formatAmount = (n: number) => n.toFixed(2);

// Quantities can be decimals (e.g. 0.250 kg of loose sugar). Trim trailing
// zeros so whole numbers still print as "5" instead of "5.000", but keep
// real decimals visible — e.g. 2.5, 0.25.
const formatQty = (n: number) => {
  const rounded = Math.round(n * 1000) / 1000;
  if (rounded % 1 === 0) return String(rounded);
  return String(rounded).replace(/0+$/, '').replace(/\.$/, '');
};

export type StoreInfo = {
  storeName: string;
  storeAddress: string;
  storePhone: string;
};

/**
 * Builds the raw ESC/POS byte stream for a receipt.
 *
 * @param charsPerLine  How many monospace characters fit on one printed
 *   line. This depends on the physical paper width and the printer's
 *   default font — NOT something we can detect automatically over
 *   Bluetooth, so it's passed in from the user's Printer Settings (see
 *   bluetoothPrinter.ts). Common values: 32 for 58mm paper, 74 for 80mm
 *   paper (both at the printer's normal/default font size). Getting this
 *   wrong is exactly what causes a big blank margin on one side of the
 *   printed receipt (too narrow) or wrapped/cut-off text (too wide).
 */
export function buildEscPosReceipt(
  bill: Bill,
  items: BillItem[],
  store: StoreInfo,
  charsPerLine = 74,
): Uint8Array {
  // 80mm printers are commonly driven in a compact ESC/POS font. The
  // requested 74 columns use the printable area much more effectively than
  // the old 48-column layout. Keep 58mm at its traditional 32 columns.
  const W = charsPerLine;
  const chunks: Uint8Array[] = [];

  // Column widths for the item table, sized to the actual paper width so
  // the whole line — not just the left third of it — gets used.
  const wide = W >= 40;
  const qtyW = wide ? 7 : 5;
  const priceW = wide ? 10 : 7;
  const amtW = wide ? 10 : 7;
  const nameW = W - qtyW - priceW - amtW;

  // Two-column label/value layout for the header block, also sized to W.
  const labelW = Math.floor(W / 2);
  const valueW = W - labelW;

  // Label/value layout for the totals block — value column stays a fixed
  // width wide enough for large currency amounts, label takes the rest.
  const totalsValueW = 12;
  const totalsLabelW = W - totalsValueW;

  chunks.push(init());
  if (W >= 70) chunks.push(fontB());
  chunks.push(alignCenter());
  chunks.push(boldOn());
  chunks.push(doubleWidthOn());
  chunks.push(line(store.storeName.toUpperCase()));
  chunks.push(doubleWidthOff());
  chunks.push(boldOff());
  chunks.push(line(store.storeAddress));
  chunks.push(line('Tel: ' + store.storePhone));
  chunks.push(feed(1));

  chunks.push(alignLeft());
  chunks.push(line('-'.repeat(W)));
  chunks.push(line(pad('Bill No:', labelW) + pad(bill.bill_number, valueW, 'right')));
  chunks.push(line(pad('Date:', labelW) + pad(formatDate(bill.created_at), valueW, 'right')));
  if (bill.customer_name) {
    chunks.push(line(pad('Customer:', labelW) + pad(bill.customer_name, valueW, 'right')));
  }
  chunks.push(line(pad('Payment:', labelW) + pad(bill.payment_method, valueW, 'right')));
  chunks.push(line('-'.repeat(W)));

  // Items header
  chunks.push(boldOn());
  chunks.push(line(
    pad('Item', nameW) + pad('Qty', qtyW) + pad('Price', priceW, 'right') + pad('Amt', amtW, 'right'),
  ));
  chunks.push(boldOff());
  chunks.push(line('='.repeat(W)));

  // Items
  for (const item of items) {
    const name = item.product_name.length > nameW ? item.product_name.slice(0, nameW) : item.product_name;
    chunks.push(line(
      pad(name, nameW) +
        pad(formatQty(item.quantity), qtyW) +
        pad(formatAmount(item.unit_price), priceW, 'right') +
        pad(formatAmount(item.total_price), amtW, 'right'),
    ));
  }

  chunks.push(line('-'.repeat(W)));

  // Totals
  chunks.push(line(pad('Total Items:', totalsLabelW) + pad(String(bill.total_items), totalsValueW, 'right')));
  chunks.push(line(pad('Subtotal:', totalsLabelW) + pad(formatAmount(bill.subtotal), totalsValueW, 'right')));
  if (bill.discount_amount > 0) {
    const label =
      'Discount (' +
      (bill.discount_type === 'percent' ? `${bill.discount_value}%` : 'Flat') +
      '):';
    chunks.push(line(pad(label, totalsLabelW) + pad('-' + formatAmount(bill.discount_amount), totalsValueW, 'right')));
  }
  chunks.push(line('='.repeat(W)));
  chunks.push(boldOn());
  chunks.push(textSize(0x11));
  chunks.push(line(pad('TOTAL:', labelW) + pad(formatAmount(bill.total), valueW, 'right')));
  chunks.push(textSize(0x00));
  chunks.push(boldOff());

  chunks.push(line('-'.repeat(W)));
  chunks.push(alignCenter());
  chunks.push(boldOn());
  chunks.push(line('Thank You!'));
  chunks.push(boldOff());
  chunks.push(line('Visit Again'));
  chunks.push(feed(1));
  // chunks.push(line('This is a computer generated bill'));
  chunks.push(feed(1));
  chunks.push(line(bill.bill_number));

  chunks.push(feed(3));
  chunks.push(cut());

  // merge all chunks
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}