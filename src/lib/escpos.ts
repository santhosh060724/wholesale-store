import type { Bill, BillItem } from './types';
import { formatCurrency, formatDate } from './utils';

// ESC/POS command helpers
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const enc = new TextEncoder();

const cmd = (...bytes: number[]) => new Uint8Array(bytes);

const init = () => cmd(ESC, 0x40);
const feed = (n = 1) => cmd(ESC, 0x64, n);
const cut = () => cmd(GS, 0x56, 0x00);
const alignCenter = () => cmd(ESC, 0x61, 0x01);
const alignLeft = () => cmd(ESC, 0x61, 0x00);
const alignRight = () => cmd(ESC, 0x61, 0x02);
const boldOn = () => cmd(ESC, 0x45, 0x01);
const boldOff = () => cmd(ESC, 0x45, 0x00);
const doubleWidthOn = () => cmd(GS, 0x21, 0x10);
const doubleWidthOff = () => cmd(GS, 0x21, 0x00);
const textSize = (n: number) => cmd(GS, 0x21, n);

const text = (s: string) => enc.encode(s);
const line = (s = '') => enc.encode(s + '\n');

const dashedLine = (width = 32) => line('-'.repeat(width));

const pad = (s: string, len: number, align: 'left' | 'right' = 'left') => {
  const str = String(s);
  if (str.length >= len) return str.slice(0, len);
  return align === 'right' ? ' '.repeat(len - str.length) + str : str + ' '.repeat(len - str.length);
};

const formatAmount = (n: number) => n.toFixed(2);

export type StoreInfo = {
  storeName: string;
  storeAddress: string;
  storePhone: string;
};

export function buildEscPosReceipt(
  bill: Bill,
  items: BillItem[],
  store: StoreInfo,
): Uint8Array {
  const W = 32;
  const chunks: Uint8Array[] = [];

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
  chunks.push(dashedLine(W));
  chunks.push(line(pad('Bill No:', 16, 'left') + pad(bill.bill_number, 16, 'right')));
  chunks.push(line(pad('Date:', 16, 'left') + pad(formatDate(bill.created_at), 16, 'right')));
  if (bill.customer_name) {
    chunks.push(line(pad('Customer:', 16, 'left') + pad(bill.customer_name, 16, 'right')));
  }
  chunks.push(line(pad('Payment:', 16, 'left') + pad(bill.payment_method, 16, 'right')));
  chunks.push(dashedLine(W));

  // Items header
  chunks.push(boldOn());
  chunks.push(line(
    pad('Item', 14) + pad('Qty', 4) + pad('Price', 7, 'right') + pad('Amt', 7, 'right'),
  ));
  chunks.push(boldOff());
  chunks.push(line('='.repeat(W)));

  // Items
  for (const item of items) {
    const name = item.product_name.length > 14 ? item.product_name.slice(0, 14) : item.product_name;
    chunks.push(line(
      pad(name, 14) +
        pad(String(item.quantity), 4) +
        pad(formatAmount(item.unit_price), 7, 'right') +
        pad(formatAmount(item.total_price), 7, 'right'),
    ));
  }

  chunks.push(dashedLine(W));

  // Totals
  chunks.push(line(pad('Total Items:', 20) + pad(String(bill.total_items), 12, 'right')));
  chunks.push(line(pad('Subtotal:', 20) + pad(formatAmount(bill.subtotal), 12, 'right')));
  if (bill.discount_amount > 0) {
    const label =
      'Discount (' +
      (bill.discount_type === 'percent' ? `${bill.discount_value}%` : 'Flat') +
      '):';
    chunks.push(line(pad(label, 20) + pad('-' + formatAmount(bill.discount_amount), 12, 'right')));
  }
  chunks.push(line('='.repeat(W)));
  chunks.push(boldOn());
  chunks.push(textSize(0x11));
  chunks.push(line(pad('TOTAL:', 16) + pad(formatAmount(bill.total), 16, 'right')));
  chunks.push(textSize(0x00));
  chunks.push(boldOff());

  chunks.push(dashedLine(W));
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
