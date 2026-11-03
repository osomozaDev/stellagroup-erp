import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

export async function api<T = any>(ruta: string, opciones: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${BASE}${ruta}`, {
    method: opciones.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) await supabase.auth.signOut();
    const msg = Array.isArray(json.message) ? json.message[0] : json.message;
    throw new Error(msg ?? 'Algo ha fallado. Vuelve a intentarlo.');
  }
  return json as T;
}

/** Archivo de la API con la sesión del usuario, con el nombre que manda el servidor si lo hay */
export async function bajarArchivo(ruta: string) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${BASE}${ruta}`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` } });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message ?? 'No se ha podido descargar el archivo');
  }
  const nombre = res.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  return { blob: await res.blob(), nombre: nombre ? decodeURIComponent(nombre) : undefined };
}

/** Descarga un archivo de la API (Excel, etc.) con la sesión del usuario */
export async function descargar(ruta: string, nombre: string) {
  const { blob } = await bajarArchivo(ruta);
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: nombre }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Archivo → base64 sin la cabecera «data:…;base64,» */
export const aBase64 = (archivo: Blob) =>
  new Promise<string>((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1]);
    r.onerror = mal;
    r.readAsDataURL(archivo);
  });
