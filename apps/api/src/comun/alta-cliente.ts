import { BadRequestException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { ok } from './db';

/** Ficha de cliente a partir de los datos escritos a mano: nombre en la primera línea; CIF, correo y teléfono donde se reconozcan */
export function fichaDeTexto(texto: string) {
  const [nombre, ...resto] = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const quitar = (l: string) => l.replace(/^(cif|nif|dni|email|e-mail|correo|tel[eé]fono|tel|m[oó]vil)\.?\s*:?\s*/i, '').trim();
  const cif = resto.map(quitar).find((l) => /^([A-Z]\d{7}[A-Z0-9]|\d{8}[A-Z]|[XYZ]\d{7}[A-Z])$/i.test(l.replace(/[\s.-]/g, '')));
  const email = resto.map(quitar).find((l) => /^\S+@\S+\.\S+$/.test(l));
  const telefono = resto.map(quitar).find((l) => /^\+?[\d\s]{9,15}$/.test(l));
  const otras = resto.filter((l) => ![cif, email, telefono].includes(quitar(l)));
  return {
    nombre,
    cif: cif ? cif.replace(/[\s.-]/g, '').toUpperCase() : null,
    email: email ?? null,
    telefono: telefono ?? null,
    direccion: otras.join(', ') || null,
  };
}

/**
 * Cliente de un presupuesto: si se escribió a mano, lo da de alta (o reutiliza el que
 * ya exista con el mismo CIF o el mismo nombre) y lo deja enlazado al presupuesto.
 * Devuelve el cliente y si es nuevo.
 */
export async function clienteDePresupuesto(db: SupabaseClient, presupuestoId: string): Promise<{ id: string; nombre: string; nuevo: boolean }> {
  const p = ok(await db.from('presupuestos').select('cliente_id, cliente:clientes(id, nombre), cliente_texto').eq('id', presupuestoId).single()) as any;
  if (p.cliente_id) return { id: p.cliente_id, nombre: p.cliente?.nombre ?? '', nuevo: false };
  if (!p.cliente_texto?.trim()) throw new BadRequestException('El presupuesto no tiene datos del cliente');
  const ficha = fichaDeTexto(p.cliente_texto);
  const existente =
    (ficha.cif && (ok(await db.from('clientes').select('id, nombre').ilike('cif', ficha.cif).limit(1).maybeSingle()) as any)) ||
    (ok(await db.from('clientes').select('id, nombre').ilike('nombre', ficha.nombre.replace(/[%_]/g, '\\$&')).limit(1).maybeSingle()) as any);
  const cliente = existente ?? (ok(await db.from('clientes').insert(ficha).select('id, nombre').single()) as any);
  ok(await db.from('presupuestos').update({ cliente_id: cliente.id }).eq('id', presupuestoId));
  return { id: cliente.id, nombre: cliente.nombre, nuevo: !existente };
}
