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
const fontB = () => cmd(ESC, 0x4d, 0x01); // compact ESC/POS Font B (reliable 64-column layout on standard 80mm printers)

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
 *   bluetoothPrinter.ts). Common values: 32 for 58mm paper, 64 for 80mm paper.
 *   Getting this
 *   wrong is exactly what causes a big blank margin on one side of the
 *   printed receipt (too narrow) or wrapped/cut-off text (too wide).
 */
export function buildEscPosReceipt(
  bill: Bill,
  items: BillItem[],
  store: StoreInfo,
  charsPerLine = 64,
): Uint8Array {
  // Standard 80mm thermal printers typically expose 64 printable columns
  // in ESC/POS Font B. Using 74 characters here is too wide for these printers
  // and causes the fourth column (Amt) to wrap underneath the item name.
  // 64 columns fills the printable width cleanly while keeping all four
  // columns on one physical line. Keep 58mm at 32 columns.
  const W = charsPerLine;
  const chunks: Uint8Array[] = [];

  // Keep a small physical margin on both sides of the receipt. For the
  // standard 80mm layout this gives 64 total columns = 2 margin + 60 content
  // + 2 margin. This is wide enough to use the paper properly while avoiding
  // the wrapping seen when 74 characters are sent to a 64-column printer.
  const marginW = W >= 60 ? 2 : 1;
  const contentW = W - marginW * 2;
  const withMargins = (s = '') => line(
    ' '.repeat(marginW) + pad(s, contentW) + ' '.repeat(marginW),
  );
  const divider = (char: string) => withMargins(char.repeat(contentW));

  // Column widths for the item table. The four columns always remain on one
  // physical line: Item | Qty | Price | Amt.
  const wide = contentW >= 40;
  const qtyW = wide ? 7 : 5;
  const priceW = wide ? 11 : 7;
  const amtW = wide ? 11 : 7;
  const nameW = contentW - qtyW - priceW - amtW;

  // Two-column label/value layout for the header block.
  const labelW = Math.floor(contentW / 2);
  const valueW = contentW - labelW;

  // Label/value layout for the totals block — value column stays fixed and
  // the label gets the remaining content width.
  const totalsValueW = wide ? 11 : 9;
  const totalsLabelW = contentW - totalsValueW;

  chunks.push(init());
  if (W >= 60) chunks.push(fontB());
  chunks.push(alignCenter());
  chunks.push(boldOn());
  chunks.push(doubleWidthOn());
  // The printer centers the store name; do not pad this line to 64
  // characters while double-width mode is active, or the padding itself
  // would also be doubled and could wrap.
  chunks.push(line(store.storeName.toUpperCase()));
  chunks.push(doubleWidthOff());
  chunks.push(boldOff());
  chunks.push(withMargins(store.storeAddress));
  chunks.push(withMargins('Tel: ' + store.storePhone));
  chunks.push(feed(1));

  chunks.push(alignLeft());
  chunks.push(divider('-'));
  chunks.push(withMargins(pad('Bill No:', labelW) + pad(bill.bill_number, valueW, 'right')));
  chunks.push(withMargins(pad('Date:', labelW) + pad(formatDate(bill.created_at), valueW, 'right')));
  if (bill.customer_name) {
    chunks.push(withMargins(pad('Customer:', labelW) + pad(bill.customer_name, valueW, 'right')));
  }
  chunks.push(withMargins(pad('Payment:', labelW) + pad(bill.payment_method, valueW, 'right')));
  chunks.push(divider('-'));

  // Items header
  chunks.push(boldOn());
  chunks.push(withMargins(
    pad('Name', nameW) + pad('Quantity', qtyW) + pad('Price', priceW, 'right') + pad('Amount', amtW, 'right'),
  ));
  chunks.push(boldOff());
  chunks.push(divider('='));

  // Items
  for (const item of items) {
    const name = item.product_name.length > nameW
      ? item.product_name.slice(0, Math.max(0, nameW - 3)) + '...'
      : item.product_name;
    chunks.push(withMargins(
      pad(name, nameW) +
        pad(formatQty(item.quantity), qtyW) +
        pad(formatAmount(item.unit_price), priceW, 'right') +
        pad(formatAmount(item.total_price), amtW, 'right'),
    ));
  }

  chunks.push(divider('-'));

  // Totals
  chunks.push(withMargins(pad('Total Items:', totalsLabelW) + pad(String(bill.total_items), totalsValueW, 'right')));
  chunks.push(withMargins(pad('Subtotal:', totalsLabelW) + pad(formatAmount(bill.subtotal), totalsValueW, 'right')));
  if (bill.discount_amount > 0) {
    const label =
      'Discount (' +
      (bill.discount_type === 'percent' ? `${bill.discount_value}%` : 'Flat') +
      '):';
    chunks.push(withMargins(pad(label, totalsLabelW) + pad('-' + formatAmount(bill.discount_amount), totalsValueW, 'right')));
  }
  chunks.push(divider('='));
  chunks.push(boldOn());
  // Double-height only: double-width would turn a 64-column totals row
  // into a 128-column line and make the amount wrap.
  chunks.push(textSize(0x01));
  chunks.push(withMargins(pad('TOTAL:', labelW) + pad(formatAmount(bill.total), valueW, 'right')));
  chunks.push(textSize(0x00));
  chunks.push(boldOff());

  chunks.push(divider('-'));
  chunks.push(alignCenter());
  chunks.push(boldOn());
  chunks.push(withMargins('Thank You!'));
  chunks.push(boldOff());
  chunks.push(withMargins('Visit Again'));
  chunks.push(feed(1));
  chunks.push(withMargins('This is a computer generated bill'));
  chunks.push(feed(1));
  chunks.push(withMargins(bill.bill_number));

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