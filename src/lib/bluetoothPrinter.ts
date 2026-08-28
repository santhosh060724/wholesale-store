/*
 * Bluetooth thermal printing using the standard Web Bluetooth API
 * (navigator.bluetooth) — built into Chrome/Edge on desktop and Chrome on
 * Android. No native app, plugin, or USB cable required.
 *
 * Platform support (set by the browser vendors, not this code):
 *   - Windows / macOS / Linux / ChromeOS: Chrome, Edge, Opera  -> supported
 *   - Android: Chrome, Edge, Samsung Internet, Opera            -> supported
 *   - iOS / iPadOS: Safari AND Chrome-on-iOS (WebKit-based)     -> NOT supported
 *     (Apple has not implemented Web Bluetooth in WebKit; this is a
 *     platform-level restriction, not something fixable from JavaScript.)
 *   - Firefox (any OS): not supported.
 * Use isWebBluetoothSupported() to detect this and show the right UI.
 *
 * Most budget ESC/POS Bluetooth receipt printers expose a single BLE
 * "write" characteristic under one of a handful of common service UUIDs
 * (HM-10/UART-style clones, or vendor-specific print services). Rather than
 * gambling on one exact UUID, we:
 *   1. List the common candidates as optionalServices so the browser is
 *      allowed to access them after pairing.
 *   2. After connecting, walk every advertised GATT service/characteristic
 *      and pick the first one that supports writing.
 *   3. Let advanced users override with an exact Service/Characteristic UUID
 *      from Printer Settings, for the rare printer that doesn't match.
 *
 * --- "GATT operation already in progress" ---
 * Chrome throws this if two GATT calls (connect/read/write) on the same
 * device overlap in time — e.g. a background auto-reconnect attempt racing
 * a user's manual tap, or a double-tap firing two connects before the UI
 * disables the button. Every GATT-touching call in this file is routed
 * through withGattLock() below, which serializes them so only one is ever
 * in flight at a time, no matter what triggered it.
 *
 * --- Auto-reconnect without a picker every time ---
 * Once the browser has granted permission for a device (via a manual
 * requestDevice() pairing), navigator.bluetooth.getDevices() can list it on
 * later visits, and device.gatt.connect() can be called directly on it —
 * no picker dialog needed — as long as the printer is on and in range. We
 * remember the last-connected device's id and use this to auto-reconnect
 * silently when the receipt screen opens.
 *
 * --- Hangs (stuck "Printing...", stuck on connect) ---
 * Real BLE hardware sometimes accepts a request and then never responds at
 * all — no success, no error, nothing. A bare `await
 * characteristic.writeValue(...)` (or `await device.gatt.connect()`) on
 * that kind of hardware never settles, which — combined with the GATT lock
 * above — means every operation after it is stuck too, forever, until the
 * page is reloaded. To make that impossible, every step that talks to the
 * device (connect, service/characteristic discovery, each chunk write) is
 * wrapped in withTimeout(), which always settles one way or another. On a
 * timeout, forceReset() tears the connection down instead of leaving the
 * app believing it's still connected to a printer that's gone silent — so
 * the lock is guaranteed to free up and the next print attempt starts
 * clean rather than inheriting a wedged connection.
 */

const COMMON_PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // common "GP"-style BLE printer service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10/HC-08 UART clone, used by many generic printers
  '0000ff00-0000-1000-8000-00805f9b34fb', // common CN811/vendor print service
  '0000ff10-0000-1000-8000-00805f9b34fb', // CN811-family BLE service seen on Windows
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC/Microchip UART service, seen on some printers
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service (NUS)
];

const SETTINGS_KEY = 'bt_printer_settings_v1';
const LAST_DEVICE_KEY = 'bt_last_device_v1';

export type PaperWidth = '58mm' | '80mm';

export type BluetoothPrinterSettings = {
  serviceUuid: string;
  characteristicUuid: string;
  paperWidth: PaperWidth;
};

// A BluetoothServiceUUID/characteristic UUID the Web Bluetooth API will
// actually accept is a full 128-bit UUID in this exact dashed-hex shape
// (e.g. '0000ffe0-0000-1000-8000-00805f9b34fb'). Anything else —
// mistyped, pasted from the wrong field, garbage — makes
// bluetooth.requestDevice() throw synchronously with "Invalid Service
// name", before the device picker even opens. That single bad value can
// silently break *every* connect/print attempt from then on, since it's
// read from localStorage on every call. So: validate on the way in
// (saveBluetoothPrinterSettings) AND on the way out (getBluetoothPrinterSettings) —
// a previously-saved bad value should stop being used as soon as this
// check exists, without the user having to find Printer Settings again.
const UUID_128_BIT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidBluetoothUuid(value: string): boolean {
  return UUID_128_BIT_RE.test(value.trim());
}

function sanitizeUuidField(value: unknown): string {
  return typeof value === 'string' && isValidBluetoothUuid(value) ? value.trim().toLowerCase() : '';
}

export function getBluetoothPrinterSettings(): BluetoothPrinterSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        serviceUuid: sanitizeUuidField(parsed.serviceUuid),
        characteristicUuid: sanitizeUuidField(parsed.characteristicUuid),
        paperWidth: parsed.paperWidth === '58mm' ? '58mm' : '80mm',
      };
    }
  } catch {
    // fall through to defaults
  }
  return { serviceUuid: '', characteristicUuid: '', paperWidth: '80mm' };
}

/**
 * Saves printer settings. Invalid Service/Characteristic UUIDs are dropped
 * (treated as "leave blank for auto-detect") rather than stored as-is —
 * see the note above UUID_128_BIT_RE for why a bad value here can brick
 * every future connect attempt.
 */
export function saveBluetoothPrinterSettings(settings: BluetoothPrinterSettings): void {
  const clean: BluetoothPrinterSettings = {
    serviceUuid: sanitizeUuidField(settings.serviceUuid),
    characteristicUuid: sanitizeUuidField(settings.characteristicUuid),
    paperWidth: settings.paperWidth === '58mm' ? '58mm' : '80mm',
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean));
}

/** Characters-per-line to hand to buildEscPosReceipt for the saved paper width. */
export function getCharsPerLine(): number {
  return getBluetoothPrinterSettings().paperWidth === '58mm' ? 32 : 48;
}

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/** True specifically for iOS/iPadOS, where no browser can support Web Bluetooth. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

// --- Remembered device (for silent auto-reconnect) ---

function getRememberedDeviceId(): string | null {
  try {
    const raw = localStorage.getItem(LAST_DEVICE_KEY);
    if (!raw) return null;
    return JSON.parse(raw).id || null;
  } catch {
    return null;
  }
}

function rememberDevice(device: any): void {
  try {
    localStorage.setItem(LAST_DEVICE_KEY, JSON.stringify({ id: device.id, name: device.name || '' }));
  } catch {
    // ignore storage errors (e.g. private browsing)
  }
}

export function forgetRememberedPrinter(): void {
  localStorage.removeItem(LAST_DEVICE_KEY);
}

export function hasRememberedPrinter(): boolean {
  return !!getRememberedDeviceId();
}

// --- GATT operation lock ---
// Every function below that touches device.gatt (connect, discover
// services/characteristics, or write) goes through this so calls never
// overlap, which is what triggers Chrome's "GATT operation already in
// progress" error. This only works as a *lock* (rather than a permanent
// jam) because every operation queued through it is timeout-bounded below —
// see withTimeout().
let gattChain: Promise<any> = Promise.resolve();
function withGattLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = gattChain.then(fn, fn);
  // Keep the chain alive even if this operation fails, so the next one
  // still gets its turn instead of being stuck behind a rejected promise.
  gattChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// Timeouts for each stage of talking to the printer. Generous enough for a
// slow budget printer, short enough that a hung operation fails fast
// instead of leaving the UI spinning indefinitely.
const CONNECT_TIMEOUT_MS = 15000;
const DISCOVERY_TIMEOUT_MS = 10000;
const WRITE_TIMEOUT_MS = 5000;
const AUTO_RECONNECT_TIMEOUT_MS = 10000;

/**
 * Races `promise` against a timer so the result *always* settles within
 * `ms` — even if `promise` itself never calls back, which is exactly what
 * real BLE hardware sometimes does on a connect or a write.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

type ConnectedState = {
  device: any;
  characteristic: any;
  writeWithoutResponse: boolean;
  name: string;
};

let connected: ConnectedState | null = null;

/**
 * Tears down the current connection and clears local state. Called any
 * time a GATT operation times out or otherwise fails in a way that leaves
 * the connection in an unknown state, so the app never gets stuck
 * believing it's still connected to a printer that stopped responding.
 */
function forceReset(reason: string): void {
  const device = connected?.device;
  connected = null;
  if (device?.gatt?.connected) {
    try {
      device.gatt.disconnect();
    } catch {
      // best-effort; nothing more we can do
    }
  }
  if (typeof console !== 'undefined') {
    console.warn(`[bluetoothPrinter] connection reset: ${reason}`);
  }
}

async function findWritableCharacteristic(server: any): Promise<{ characteristic: any; writeWithoutResponse: boolean }> {
  const { serviceUuid, characteristicUuid } = getBluetoothPrinterSettings();

  // 1. Try the user's manually-configured UUIDs first, if set.
  if (serviceUuid && characteristicUuid) {
    try {
      const service = await server.getPrimaryService(serviceUuid.trim());
      const characteristic = await service.getCharacteristic(characteristicUuid.trim());
      return {
        characteristic,
        writeWithoutResponse: !!characteristic.properties?.writeWithoutResponse,
      };
    } catch {
      // fall through to auto-detect below
    }
  }

  // 2. Auto-detect: walk every service/characteristic and use the first
  // one that supports writing.
  const services = await server.getPrimaryServices();
  for (const service of services) {
    let characteristics: any[] = [];
    try {
      characteristics = await service.getCharacteristics();
    } catch {
      continue;
    }
    for (const characteristic of characteristics) {
      const props = characteristic.properties;
      if (props?.write || props?.writeWithoutResponse) {
        return { characteristic, writeWithoutResponse: !!props.writeWithoutResponse };
      }
    }
  }

  throw new Error(
    'Connected to the device, but could not find a writable printer channel. If your printer manual lists exact Service/Characteristic UUIDs, enter them in Printer Settings (gear icon).',
  );
}

/** Shared finish-up logic for both manual pairing and silent auto-reconnect. */
async function finishConnectingToDevice(device: any): Promise<{ name: string }> {
  // Skip a redundant connect() call if we're somehow already connected to
  // this exact device — calling connect() again while connected is one of
  // the known ways to trigger "GATT operation already in progress".
  let server: any;
  try {
    server = device.gatt.connected
      ? device.gatt
      : await withTimeout(device.gatt.connect(), CONNECT_TIMEOUT_MS, 'The printer took too long to connect. Turn it off and on, then try again.');
  } catch (err) {
    forceReset(`gatt.connect() did not complete: ${(err as any)?.message || err}`);
    throw err;
  }

  let characteristic: any;
  let writeWithoutResponse: boolean;
  try {
    ({ characteristic, writeWithoutResponse } = await withTimeout(
      findWritableCharacteristic(server),
      DISCOVERY_TIMEOUT_MS,
      'Connected, but the printer stopped responding while setting up. Try again.',
    ));
  } catch (err) {
    forceReset(`characteristic discovery did not complete: ${(err as any)?.message || err}`);
    throw err;
  }

  device.addEventListener('gattserverdisconnected', () => {
    connected = null;
  });

  connected = {
    device,
    characteristic,
    writeWithoutResponse,
    name: device.name || 'Bluetooth Printer',
  };
  rememberDevice(device);

  return { name: connected.name };
}

export async function connectBluetoothPrinter(): Promise<{ name: string }> {
  if (!isWebBluetoothSupported()) {
    if (isIOS()) {
      throw new Error(
        'Bluetooth printing is not supported on iPhone/iPad in any browser — Apple does not allow Web Bluetooth on iOS. Use an Android phone, or a Windows/Mac computer with Chrome or Edge.',
      );
    }
    throw new Error(
      'This browser does not support Bluetooth printing. Use Chrome or Edge (desktop or Android).',
    );
  }

  const { serviceUuid } = getBluetoothPrinterSettings();
  const optionalServices = [...COMMON_PRINTER_SERVICE_UUIDS];
  if (serviceUuid && !optionalServices.includes(serviceUuid.trim())) {
    optionalServices.push(serviceUuid.trim());
  }

  const bluetooth = (navigator as any).bluetooth;
  // requestDevice() shows the picker — must stay directly in the click
  // handler's call chain (it is, since this whole function is only called
  // from a button's onClick). Not wrapped in withGattLock or a timeout:
  // it's paced by the user picking a device or cancelling, not a "hang",
  // and the browser guarantees it settles as soon as the user acts.
  const device = await bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices,
  });

  return withGattLock(() => finishConnectingToDevice(device));
}

/**
 * Tries to silently reconnect to the last printer this site was granted
 * permission for — no picker dialog. Returns null (never throws) if there's
 * no remembered printer, the browser doesn't support getDevices(), or the
 * printer isn't currently reachable (off / out of range) — all of these
 * are normal, expected outcomes for a background attempt, not errors.
 */
export async function tryAutoReconnect(): Promise<{ name: string } | null> {
  if (!isWebBluetoothSupported()) return null;
  const bluetooth = (navigator as any).bluetooth;
  if (typeof bluetooth.getDevices !== 'function') return null;

  const rememberedId = getRememberedDeviceId();
  if (!rememberedId) return null;

  try {
    const devices: any[] = await bluetooth.getDevices();
    const device = devices.find((d) => d.id === rememberedId);
    if (!device) return null;

    return await withGattLock(() =>
      withTimeout(
        finishConnectingToDevice(device),
        AUTO_RECONNECT_TIMEOUT_MS,
        'Printer not reachable (off or out of range)',
      ),
    );
  } catch {
    // Printer off, out of range, or permission revoked — silently give up
    // and let the user connect manually instead.
    return null;
  }
}

/**
 * Print-button connection path. First reuse the live connection, then try
 * the previously-authorized printer silently, and only then show the
 * browser's Bluetooth picker. This prevents a manual reconnect on every bill
 * while keeping the picker available when the printer was replaced.
 */
export async function ensureBluetoothPrinterConnected(): Promise<{ name: string }> {
  if (isBluetoothPrinterConnected()) {
    return { name: getConnectedBluetoothPrinterName() || 'Bluetooth Printer' };
  }

  const auto = await tryAutoReconnect();
  if (auto) return auto;

  return connectBluetoothPrinter();
}

export async function printViaBluetooth(data: Uint8Array): Promise<void> {
  if (!connected || !connected.device?.gatt?.connected) {
    throw new Error('Printer not connected. Connect first.');
  }

  return withGattLock(async () => {
    if (!connected) throw new Error('Printer not connected. Connect first.');
    const { characteristic, writeWithoutResponse } = connected;

    // BLE writes are capped by the negotiated MTU (commonly ~20-180 bytes on
    // budget printers even when the browser supports larger packets). Split
    // the receipt into small chunks and write them one at a time, with a
    // short pause between writes, so long receipts don't overrun the
    // printer's input buffer and get silently dropped or garbled.
    // 20 bytes is the safest cross-printer BLE payload size. It works with
    // older BLE UART/thermal printers whose negotiated ATT payload remains
    // at the default 23-byte MTU (20 usable bytes), while still working on
    // printers that support larger MTUs. The small pause prevents cheap
    // printer buffers from being overrun.
    const CHUNK_SIZE = 20;
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      try {
        if (writeWithoutResponse && characteristic.writeValueWithoutResponse) {
          await withTimeout(
            characteristic.writeValueWithoutResponse(chunk),
            WRITE_TIMEOUT_MS,
            'Sending data to printer timed out',
          );
        } else if (characteristic.writeValueWithResponse) {
          await withTimeout(
            characteristic.writeValueWithResponse(chunk),
            WRITE_TIMEOUT_MS,
            'Sending data to printer timed out',
          );
        } else {
          await withTimeout(characteristic.writeValue(chunk), WRITE_TIMEOUT_MS, 'Sending data to printer timed out');
        }
      } catch (err) {
        // A write that times out (or fails outright) leaves the connection
        // in an unknown state — don't keep using it. Reset now so the next
        // print attempt starts clean instead of hanging too.
        forceReset(`a chunk write did not complete: ${(err as any)?.message || err}`);
        throw new Error('The printer stopped responding mid-print and was disconnected. Reconnect and try again.');
      }
      // Small pause between chunks improves reliability on slower printers.
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
  });
}

export async function disconnectBluetoothPrinter(): Promise<void> {
  return withGattLock(async () => {
    forceReset('manual disconnect');
  });
}

export function isBluetoothPrinterConnected(): boolean {
  return !!connected?.device?.gatt?.connected;
}

export function getConnectedBluetoothPrinterName(): string | null {
  return connected?.name || null;
}