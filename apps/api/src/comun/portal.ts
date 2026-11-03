import { SupabaseClient } from '@supabase/supabase-js';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ok } from './db';

/**
 * Portal de clientes: el cliente entra con un enlace de un solo uso que le llega
 * al correo, y luego navega con una sesión firmada por la API (no es un usuario de
 * Supabase, así que nunca puede entrar en la app de la oficina).
 */

export const DIAS_SESION_PORTAL = 30;

export const normalizarEmail = (e: string) => e.trim().toLowerCase();
const hash = (codigo: string) => createHash('sha256').update(codigo).digest('hex');

/** Correos que pueden entrar al portal de un cliente: el de su ficha y los añadidos */
export function correosPortal(c: { email?: string | null; portal_emails?: string[] | null }) {
  return [...new Set([c.email, ...(c.portal_emails ?? [])].filter((e): e is string => !!e?.trim()).map(normalizarEmail))];
}

/** Crea un enlace de entrada y devuelve la dirección completa */
export async function crearEnlacePortal(db: SupabaseClient, web: string, clienteId: string, email: string, minutos: number) {
  const codigo = randomBytes(24).toString('base64url');
  ok(
    await db.from('portal_enlaces').insert({
      cliente_id: clienteId,
      email: normalizarEmail(email),
      codigo_hash: hash(codigo),
      caduca: new Date(Date.now() + minutos * 60e3).toISOString(),
    }),
  );
  // En el «#»: no llega a ningún servidor ni queda en los registros
  return `${web.replace(/\/$/, '')}/portal#codigo=${codigo}`;
}

/** Canjea un código (una sola vez); null si no vale */
export async function canjearCodigoPortal(db: SupabaseClient, codigo: string) {
  const fila = ok(
    await db
      .from('portal_enlaces')
      .update({ usado_en: new Date().toISOString() })
      .eq('codigo_hash', hash(codigo))
      .is('usado_en', null)
      .gt('caduca', new Date().toISOString())
      .select('cliente_id, email')
      .maybeSingle(),
  ) as { cliente_id: string; email: string } | null;
  return fila;
}

export interface SesionPortal {
  cliente_id: string;
  email: string;
  caduca: number;
}

/** Sesión del portal: datos + firma HMAC con una clave que solo tiene la API */
export function firmarSesionPortal(secreto: string, cliente_id: string, email: string) {
  const datos: SesionPortal = { cliente_id, email, caduca: Date.now() + DIAS_SESION_PORTAL * 864e5 };
  const cuerpo = Buffer.from(JSON.stringify(datos)).toString('base64url');
  return `${cuerpo}.${createHmac('sha256', secreto).update(cuerpo).digest('base64url')}`;
}

export function leerSesionPortal(secreto: string, token?: string | null): SesionPortal | null {
  const [cuerpo, firma] = String(token ?? '').split('.');
  if (!cuerpo || !firma) return null;
  const esperada = Buffer.from(createHmac('sha256', secreto).update(cuerpo).digest('base64url'));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const s = JSON.parse(Buffer.from(cuerpo, 'base64url').toString()) as SesionPortal;
    return s.caduca > Date.now() ? s : null;
  } catch {
    return null;
  }
}
