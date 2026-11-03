export { nombreMes, MESES } from '@stella/shared';

const eurosFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as Intl.NumberFormatOptions);
const numFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions);

export const euros = (n: number | string | null | undefined) => eurosFmt.format(Number(n ?? 0));
export const num = (n: number | string | null | undefined) => numFmt.format(Number(n ?? 0));

export const fecha = (f?: string | null) =>
  f ? new Date(`${f.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const fechaCorta = (f?: string | null) => {
  if (!f) return '';
  const d = new Date(`${f.slice(0, 10)}T12:00:00`);
  const hoy = new Date();
  return d.toLocaleDateString('es-ES', d.getFullYear() === hoy.getFullYear() ? { day: 'numeric', month: 'short' } : { day: '2-digit', month: '2-digit', year: '2-digit' });
};

export const hoyISO = () => new Date().toISOString().slice(0, 10);
export const mesActual = () => hoyISO().slice(0, 7);

/** '2026-10' movido unos meses: moverMes('2026-10', -1) → '2026-09' */
export const moverMes = (mes: string, delta: number) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + delta, 1)).toISOString().slice(0, 7);
};

/** Último día del mes de '2026-10' */
export const finDeMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

export const iniciales = (texto: string) =>
  texto.split(/\s+/).filter((p) => p.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(p)).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export const nombreCompleto = (e: { nombre: string; apellidos?: string | null }) => `${e.nombre} ${e.apellidos ?? ''}`.trim();

/** Mezcla un color con blanco: 0 = color, 1 = blanco */
export const aclarar = (hex: string, cuanto: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * cuanto));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
