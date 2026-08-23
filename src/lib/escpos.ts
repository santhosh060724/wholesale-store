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

const line = (s = '') => enc.encode(s + '\n');
const raw = (s: string) => enc.encode(s);

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

// A small blank margin (in characters) reserved on each side of every
// left-aligned line, so the receipt doesn't run text edge-to-edge on the
// paper. Purely cosmetic spacing — has nothing to do with the paper-width
// bug (that's charsPerLine below); this is what makes it look neat rather
// than cramped once the width itself is already correct.
const MARGIN = 2;

/**
 * Builds the raw ESC/POS byte stream for a receipt.
 *
 * @param charsPerLine  How many monospace characters fit on one printed
 *   line at the printer's normal/default font size. This depends on the
 *   physical paper width — NOT something detectable automatically over
 *   Bluetooth, so it's passed in from the user's Printer Settings (see
 *   bluetoothPrinter.ts). Common values: 32 for 58mm paper, 48 for 80mm
 *   paper. Getting this wrong is what causes a big blank margin on ONE
 *   side only (too narrow) or wrapped/cut-off text (too wide) — different
 *   from the deliberate small MARGIN above, which is applied evenly on
 *   both sides once the width itself is correct.
 */
export function buildEscPosReceipt(
  bill: Bill,
  items: BillItem[],
  store: StoreInfo,
  charsPerLine = 48,
): Uint8Array {
  const W = charsPerLine;
  const contentW = W - MARGIN * 2;
  const chunks: Uint8Array[] = [];

  // A left-aligned line, with the margin baked in on both sides.
  const marginLine = (s = '') => line(' '.repeat(MARGIN) + pad(s, contentW) + ' '.repeat(MARGIN));

  // Column widths for the item table, sized to contentW so the columns
  // plus the margins together exactly fill the physical paper width.
  const wide = contentW >= 36;
  const qtyW = wide ? 7 : 5;
  const priceW = wide ? 10 : 7;
  const amtW = wide ? 10 : 7;
  const nameW = contentW - qtyW - priceW - amtW;

  // Two-column label/value layout for the header block, also sized to
  // contentW.
  const labelW = Math.floor(contentW / 2);
  const valueW = contentW - labelW;

  // Label/value layout for the totals block — value column stays a fixed
  // width wide enough for large currency amounts, label takes the rest.
  const totalsValueW = 12;
  const totalsLabelW = contentW - totalsValueW;

  chunks.push(init());
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
  chunks.push(marginLine('-'.repeat(contentW)));
  chunks.push(marginLine(pad('Bill No:', labelW) + pad(bill.bill_number, valueW, 'right')));
  chunks.push(marginLine(pad('Date:', labelW) + pad(formatDate(bill.created_at), valueW, 'right')));
  if (bill.customer_name) {
    chunks.push(marginLine(pad('Customer:', labelW) + pad(bill.customer_name, valueW, 'right')));
  }
  chunks.push(marginLine(pad('Payment:', labelW) + pad(bill.payment_method, valueW, 'right')));
  chunks.push(marginLine('-'.repeat(contentW)));

  // Items header
  chunks.push(boldOn());
  chunks.push(marginLine(
    pad('Item', nameW) + pad('Qty', qtyW) + pad('Price', priceW, 'right') + pad('Amt', amtW, 'right'),
  ));
  chunks.push(boldOff());
  chunks.push(marginLine('='.repeat(contentW)));

  // Items
  for (const item of items) {
    const name = item.product_name.length > nameW ? item.product_name.slice(0, nameW) : item.product_name;
    chunks.push(marginLine(
      pad(name, nameW) +
        pad(formatQty(item.quantity), qtyW) +
        pad(formatAmount(item.unit_price), priceW, 'right') +
        pad(formatAmount(item.total_price), amtW, 'right'),
    ));
  }

  chunks.push(marginLine('-'.repeat(contentW)));

  // Totals
  chunks.push(marginLine(pad('Total Items:', totalsLabelW) + pad(String(bill.total_items), totalsValueW, 'right')));
  chunks.push(marginLine(pad('Subtotal:', totalsLabelW) + pad(formatAmount(bill.subtotal), totalsValueW, 'right')));
  if (bill.discount_amount > 0) {
    const label =
      'Discount (' +
      (bill.discount_type === 'percent' ? `${bill.discount_value}%` : 'Flat') +
      '):';
    chunks.push(marginLine(pad(label, totalsLabelW) + pad('-' + formatAmount(bill.discount_amount), totalsValueW, 'right')));
  }
  chunks.push(marginLine('='.repeat(contentW)));
  chunks.push(boldOn());

  // The TOTAL row prints at double width (GS ! 0x11) to make it stand out,
  // but a double-width glyph takes up the physical space of TWO normal
  // glyphs. marginLine()/pad() above always pad text out to the full
  // contentW character count (44 on 80mm paper) for normal-width lines —
  // reusing that here would mean printing contentW *double-width*
  // characters, which needs 2x contentW worth of physical space and runs
  // off the edge of the paper, wrapping the amount onto a stray extra
  // line or letting the printer cut it off entirely. dblContentW is the
  // number of double-width characters that actually fit in the same
  // physical space contentW normal characters do.
  const dblContentW = Math.max(10, Math.floor(contentW / 2));
  const dblValueW = Math.max(7, Math.min(10, Math.ceil(dblContentW * 0.45)));
  const dblLabelW = Math.max(4, dblContentW - dblValueW);

  // Margin is written at normal width (before switching size) so it stays
  // visually consistent with the rest of the receipt instead of also
  // doubling in width.
  chunks.push(raw(' '.repeat(MARGIN)));
  chunks.push(textSize(0x11));
  chunks.push(raw(pad('TOTAL:', dblLabelW) + pad(formatAmount(bill.total), dblValueW, 'right')));
  chunks.push(textSize(0x00));
  chunks.push(line(' '.repeat(MARGIN)));
  chunks.push(boldOff());

  chunks.push(marginLine('-'.repeat(contentW)));
  chunks.push(alignCenter());
  chunks.push(boldOn());
  chunks.push(line('Thank You!'));
  chunks.push(boldOff());
  chunks.push(line('Visit Again'));
  chunks.push(feed(1));
  chunks.push(line('This is a computer generated bill'));
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