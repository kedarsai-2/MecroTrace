import { registerPlugin } from '@capacitor/core';

/** Native MercoPrinter Capacitor plugin — register in one module only (HMR-safe). */
export type MercoPrinterPlugin = {
  printHtml(options: {
    html: string;
    thermalText?: string;
    mode?: 'auto' | 'system' | 'thermal';
    deviceMac?: string;
    jobName?: string;
  }): Promise<{ ok?: boolean }>;
  listPrinters(): Promise<{ printers: { mac: string; name: string }[] }>;
  requestBluetoothPermissions(): Promise<{ granted: boolean }>;
};

const g = globalThis as unknown as { __mercoPrinterPlugin?: MercoPrinterPlugin };

export const mercoPrinter: MercoPrinterPlugin =
  g.__mercoPrinterPlugin ?? (g.__mercoPrinterPlugin = registerPlugin<MercoPrinterPlugin>('MercoPrinter'));
