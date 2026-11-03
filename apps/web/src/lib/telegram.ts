/**
 * Mini App de Telegram: la misma web abierta dentro de Telegram. Telegram añade al
 * enlace «#tgWebAppData=…» con los datos firmados de quien la abre; se leen al
 * arrancar (antes de que el router cambie la URL) y la API los canjea por una sesión.
 */
const parametros = new URLSearchParams(window.location.hash.slice(1));
export const initDataTelegram = parametros.get('tgWebAppData');
export const enTelegram = !!initDataTelegram;
/** «Abrir en el navegador» desde la Mini App: #entrar=… es una sesión de un solo uso */
export const tokenEntrada = parametros.get('entrar');

if (tokenEntrada) history.replaceState(null, '', window.location.pathname + window.location.search);

/** Abre un enlace fuera de Telegram, en el navegador del móvil u ordenador */
export function abrirFuera(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

if (enTelegram) {
  // Quita los datos de Telegram de la barra de direcciones
  history.replaceState(null, '', window.location.pathname + window.location.search);
  const script = Object.assign(document.createElement('script'), { src: 'https://telegram.org/js/telegram-web-app.js', async: true });
  script.onload = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;
    tg.ready();
    tg.expand();
    // Sin esto, al hacer scroll hacia abajo Telegram cierra la app
    tg.disableVerticalSwipes?.();
    tg.setHeaderColor?.('#ffffff');
    tg.setBackgroundColor?.('#f5f7fa');
  };
  document.head.appendChild(script);
}
