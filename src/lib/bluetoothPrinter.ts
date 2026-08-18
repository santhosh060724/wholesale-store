/*
 * Bluetooth thermal printing using the standard Web Bluetooth API
 * (navigator.bluetooth) — built into Chrome/Edge on desktop and Chrome on
 * Android. No native app, plugin, or USB cable required.
 *
 * Platform support (as of 2026, set by the browser vendors, not this code):
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
 */

const COMMON_PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // common "GP"-style BLE printer service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10/HC-08 UART clone, used by many generic printers
  '0000ff00-0000-1000-8000-00805f9b34fb', // another common vendor print service
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC/Microchip UART service, seen on some printers
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service (NUS)
];

const SETTINGS_KEY = 'bt_printer_settings_v1';

export type BluetoothPrinterSettings = {
  serviceUuid: string;
  characteristicUuid: string;
};

export function getBluetoothPrinterSettings(): BluetoothPrinterSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.serviceUuid && parsed.characteristicUuid) return parsed;
    }
  } catch {
    // fall through to empty defaults (means: auto-detect)
  }
  return { serviceUuid: '', characteristicUuid: '' };
}

export function saveBluetoothPrinterSettings(settings: BluetoothPrinterSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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

type ConnectedState = {
  device: any;
  characteristic: any;
  writeWithoutResponse: boolean;
  name: string;
};

let connected: ConnectedState | null = null;

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
  const device = await bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices,
  });

  const server = await device.gatt.connect();
  const { characteristic, writeWithoutResponse } = await findWritableCharacteristic(server);

  device.addEventListener('gattserverdisconnected', () => {
    connected = null;
  });

  connected = {
    device,
    characteristic,
    writeWithoutResponse,
    name: device.name || 'Bluetooth Printer',
  };

  return { name: connected.name };
}

export async function printViaBluetooth(data: Uint8Array): Promise<void> {
  if (!connected || !connected.device?.gatt?.connected) {
    throw new Error('Printer not connected. Connect first.');
  }

  const { characteristic, writeWithoutResponse } = connected;

  // BLE writes are capped by the negotiated MTU (commonly ~20-180 bytes on
  // budget printers even when the browser supports larger packets). Split
  // the receipt into small chunks and write them one at a time, with a
  // short pause between writes, so long receipts don't overrun the
  // printer's input buffer and get silently dropped or garbled.
  const CHUNK_SIZE = 100;
  for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
    const chunk = data.slice(offset, offset + CHUNK_SIZE);
    if (writeWithoutResponse && characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else if (characteristic.writeValueWithResponse) {
      await characteristic.writeValueWithResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    // Small pause between chunks improves reliability on slower printers.
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export async function disconnectBluetoothPrinter(): Promise<void> {
  if (connected?.device?.gatt?.connected) {
    try {
      connected.device.gatt.disconnect();
    } catch {
      // ignore
    }
  }
  connected = null;
}

export function isBluetoothPrinterConnected(): boolean {
  return !!connected?.device?.gatt?.connected;
}

export function getConnectedBluetoothPrinterName(): string | null {
  return connected?.name || null;
}
