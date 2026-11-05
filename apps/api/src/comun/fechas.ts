export const fechaCorta = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
/** Fecha de hoy en España (el servidor de Vercel va en UTC) */
export const hoyMadrid = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
