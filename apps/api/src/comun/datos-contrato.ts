import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { rellenarPlantilla } from '@stella/shared';
import { ok } from './db';

/**
 * Datos que le faltan a un contrato (los «[falta …]» de su texto), agrupados por la
 * ficha donde se guardan: Mi empresa, el cliente, el proyecto o solo este contrato.
 */

type Entidad = 'empresa' | 'cliente' | 'proyecto';
type Campo = { campo: string; etiqueta: string; tipo?: 'number' | 'date' | 'email' };

const DIRECCION: Campo[] = [
  { campo: 'direccion', etiqueta: 'Dirección' },
  { campo: 'cp', etiqueta: 'Código postal' },
  { campo: 'ciudad', etiqueta: 'Ciudad' },
  { campo: 'provincia', etiqueta: 'Provincia' },
];

/** Qué campos de qué ficha rellenan cada dato de la plantilla */
const MAPA: Record<string, [Entidad, Campo[]]> = {
  'empresa.nombre': ['empresa', [{ campo: 'nombre', etiqueta: 'Nombre o razón social' }]],
  'empresa.cif': ['empresa', [{ campo: 'cif', etiqueta: 'CIF o DNI' }]],
  'empresa.direccion_completa': ['empresa', DIRECCION],
  'empresa.ciudad': ['empresa', [{ campo: 'ciudad', etiqueta: 'Ciudad' }]],
  'fecha.ciudad': ['empresa', [{ campo: 'ciudad', etiqueta: 'Ciudad' }]],
  'empresa.dias_pago': ['empresa', [{ campo: 'dias_vencimiento', etiqueta: 'Días para pagar las facturas', tipo: 'number' }]],
  'empresa.email': ['empresa', [{ campo: 'email', etiqueta: 'Correo', tipo: 'email' }]],
  'empresa.telefono': ['empresa', [{ campo: 'telefono', etiqueta: 'Teléfono' }]],
  'empresa.iban': ['empresa', [{ campo: 'iban', etiqueta: 'IBAN' }]],
  'cliente.nombre': ['cliente', [{ campo: 'nombre', etiqueta: 'Nombre o razón social' }]],
  'cliente.cif': ['cliente', [{ campo: 'cif', etiqueta: 'CIF / NIF' }]],
  'cliente.direccion_completa': ['cliente', DIRECCION],
  'cliente.contacto': ['cliente', [{ campo: 'contacto', etiqueta: 'Persona de contacto' }]],
  'cliente.email': ['cliente', [{ campo: 'email', etiqueta: 'Correo', tipo: 'email' }]],
  'cliente.telefono': ['cliente', [{ campo: 'telefono', etiqueta: 'Teléfono' }]],
  'proyecto.nombre': ['proyecto', [{ campo: 'nombre', etiqueta: 'Nombre del proyecto' }]],
  'proyecto.inicio': ['proyecto', [{ campo: 'fecha_inicio', etiqueta: 'Fecha de inicio', tipo: 'date' }]],
  'proyecto.entrega': ['proyecto', [{ campo: 'fecha_fin', etiqueta: 'Entrega prevista', tipo: 'date' }]],
};

const PERMISO: Record<Entidad, string> = { empresa: 'empresa', cliente: 'clientes', proyecto: 'proyectos' };
const TABLA: Record<Entidad, string> = { empresa: 'empresa', cliente: 'clientes', proyecto: 'proyectos' };

/** «[falta empresa · direccion completa]» → «empresa.direccion_completa»; lo que no es un dato de ficha, null */
const claveDe = (marcador: string) => {
  const texto = marcador.slice('[falta '.length, -1);
  if (!texto.includes(' · ')) return null;
  const [entidad, resto] = texto.split(' · ');
  return `${entidad}.${resto.replace(/ /g, '_')}`;
};
const marcadores = (cuerpo: string) => [...new Set(cuerpo.match(/\[falta [^\]]+\]/g) ?? [])];
/** «plazo de entrega en días» → «Plazo de entrega en días» */
const etiquetaLibre = (marcador: string) => {
  const t = marcador.slice('[falta '.length, -1).replace(' · ', ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

async function cargar(db: SupabaseClient, contratoId: string) {
  const c = ok(await db.from('contratos').select('*').eq('id', contratoId).single()) as any;
  const [empresa, cliente, proyecto, presupuesto, servicios] = await Promise.all([
    db.from('empresa').select('*').eq('id', 1).single().then((r) => ok(r) as any),
    db.from('clientes').select('*').eq('id', c.cliente_id).single().then((r) => ok(r) as any),
    c.proyecto_id ? db.from('proyectos').select('*').eq('id', c.proyecto_id).single().then((r) => ok(r) as any) : null,
    c.presupuesto_id ? db.from('presupuestos').select('*, lineas:presupuesto_lineas(*)').eq('id', c.presupuesto_id).single().then((r) => ok(r) as any) : null,
    db.from('servicios').select('nombre, detalle, precio, periodicidad').eq('cliente_id', c.cliente_id).eq('estado', 'activo').order('nombre').then((r) => ok(r) as any[]),
  ]);
  return { c, empresa, cliente, proyecto, presupuesto, servicios };
}

const puede = (perfil: any, entidad: Entidad) => perfil?.tipo === 'admin' || (perfil?.permisos ?? []).includes(PERMISO[entidad]);

/** Lo que falta, por ficha, con los valores actuales para poder completarlos */
export async function datosQueFaltan(db: SupabaseClient, contratoId: string, perfil: any) {
  const d = await cargar(db, contratoId);
  const fichas: Record<Entidad, { campos: Map<string, Campo>; datos: string[] }> = {
    empresa: { campos: new Map(), datos: [] },
    cliente: { campos: new Map(), datos: [] },
    proyecto: { campos: new Map(), datos: [] },
  };
  const libres: { marcador: string; etiqueta: string }[] = [];
  for (const m of marcadores(d.c.cuerpo)) {
    const clave = claveDe(m);
    const destino = clave ? MAPA[clave] : undefined;
    // Sin ficha donde guardarlo (o sin permiso para tocarla): se escribe solo en este contrato
    if (!destino || (destino[0] === 'proyecto' && !d.proyecto) || !puede(perfil, destino[0])) {
      libres.push({ marcador: m, etiqueta: etiquetaLibre(m) });
      continue;
    }
    const [entidad, campos] = destino;
    for (const c of campos) fichas[entidad].campos.set(c.campo, c);
    fichas[entidad].datos.push(etiquetaLibre(m));
  }
  const fila: Record<Entidad, any> = { empresa: d.empresa, cliente: d.cliente, proyecto: d.proyecto };
  const nombres: Record<Entidad, string> = { empresa: d.empresa.nombre, cliente: d.cliente.nombre, proyecto: d.proyecto?.nombre ?? '' };
  return {
    total: marcadores(d.c.cuerpo).length,
    fichas: (Object.keys(fichas) as Entidad[])
      .filter((e) => fichas[e].campos.size)
      .map((e) => ({
        entidad: e,
        id: fila[e]?.id ?? null,
        nombre: nombres[e],
        campos: [...fichas[e].campos.values()].map((c) => ({ ...c, valor: fila[e]?.[c.campo] ?? '' })),
      })),
    libres,
  };
}

/**
 * Guarda lo completado en sus fichas (si el usuario puede tocarlas) y rehace en el
 * texto del contrato los datos que ya se pueden rellenar. Lo libre va solo al contrato.
 */
export async function completarDatos(
  db: SupabaseClient,
  contratoId: string,
  perfil: any,
  body: { empresa?: Record<string, unknown>; cliente?: Record<string, unknown>; proyecto?: Record<string, unknown>; libres?: Record<string, string> },
) {
  let d = await cargar(db, contratoId);
  if (!['borrador', 'enviado', 'rechazado'].includes(d.c.estado)) throw new BadRequestException('Este contrato ya no se puede cambiar');
  const permitidos = (e: Entidad) => new Set(Object.values(MAPA).filter(([x]) => x === e).flatMap(([, cs]) => cs.map((c) => c.campo)));

  for (const entidad of ['empresa', 'cliente', 'proyecto'] as Entidad[]) {
    const datos = body[entidad];
    if (!datos || !Object.keys(datos).length) continue;
    if (!puede(perfil, entidad)) throw new ForbiddenException(`No tienes permiso para cambiar los datos de ${entidad === 'empresa' ? 'Mi empresa' : `el ${entidad}`}`);
    const validos = permitidos(entidad);
    const cambios: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(datos)) {
      if (!validos.has(k)) continue;
      const t = typeof v === 'string' ? v.trim() : v;
      if (t === '' || t == null) continue;
      if (k === 'dias_vencimiento') {
        const n = Number(t);
        if (!Number.isInteger(n) || n < 0 || n > 365) throw new BadRequestException('Los días para pagar tienen que ser un número entre 0 y 365');
        cambios[k] = n;
      } else cambios[k] = t;
    }
    if (!Object.keys(cambios).length) continue;
    const id = entidad === 'empresa' ? 1 : entidad === 'cliente' ? d.c.cliente_id : d.c.proyecto_id;
    if (!id) continue;
    ok(await db.from(TABLA[entidad]).update(cambios).eq('id', id));
  }

  // Con las fichas ya guardadas, cada dato que falta se vuelve a rellenar
  d = await cargar(db, contratoId);
  let cuerpo: string = d.c.cuerpo;
  for (const m of marcadores(cuerpo)) {
    const clave = claveDe(m);
    const enviado = body.libres?.[m];
    const libre = typeof enviado === 'string' ? enviado.trim() : '';
    let valor: string | null = libre || null;
    if (!valor && clave) {
      const r = rellenarPlantilla(`{${clave}}`, { empresa: d.empresa, cliente: d.cliente, proyecto: d.proyecto, presupuesto: d.presupuesto, servicios: d.servicios, fecha: d.c.fecha });
      if (!r.startsWith('[falta ') && !r.startsWith('{')) valor = r;
    }
    if (valor) cuerpo = cuerpo.split(m).join(valor);
  }
  ok(await db.from('contratos').update({ cuerpo, updated_at: new Date().toISOString() }).eq('id', contratoId));
  return { faltan: marcadores(cuerpo).length };
}

/**
 * Para preguntar los datos de uno en uno (desde Telegram): en qué ficha se guarda un dato
 * que falta (solo si es un único campo) y cómo se llama. Lo demás va solo al contrato.
 */
export function destinoDato(marcador: string): { entidad: Entidad | null; campo: string | null; etiqueta: string } {
  const clave = claveDe(marcador);
  const destino = clave ? MAPA[clave] : undefined;
  if (!destino) return { entidad: null, campo: null, etiqueta: etiquetaLibre(marcador) };
  const [entidad, campos] = destino;
  const de = entidad === 'empresa' ? 'de Mi empresa' : `del ${entidad}`;
  if (campos.length > 1) return { entidad: null, campo: null, etiqueta: `Dirección completa ${de}` };
  return { entidad, campo: campos[0].campo, etiqueta: `${campos[0].etiqueta} ${de}` };
}

/** Guarda un dato que falta: en su ficha si se puede, si no solo en el contrato */
export async function completarUnDato(db: SupabaseClient, contratoId: string, perfil: any, marcador: string, valor: string) {
  const c = ok(await db.from('contratos').select('proyecto_id').eq('id', contratoId).single()) as any;
  const d = destinoDato(marcador);
  const enFicha = d.entidad && d.campo && (d.entidad !== 'proyecto' || c.proyecto_id) && puede(perfil, d.entidad);
  return completarDatos(db, contratoId, perfil, enFicha ? { [d.entidad!]: { [d.campo!]: valor } } : { libres: { [marcador]: valor } });
}

export const marcadoresDe = marcadores;
