export { nombreMes } from '@stella/shared';

const eurosFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as Intl.NumberFormatOptions);
const numFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions);

export const euros = (n: number | string | null | undefined) => eurosFmt.format(Number(n ?? 0));
export const num = (n: number | string | null | undefined) => numFmt.format(Number(n ?? 0));

// A mediodía UTC: así la fecha es la misma en el navegador y en el servidor
export const fecha = (f?: string | null) =>
  f ? new Date(`${f.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

/** Mezcla un color con blanco: 0 = color, 1 = blanco */
export const aclarar = (hex: string, cuanto: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * cuanto));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
