import { BadRequestException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { rellenarPlantilla } from '@stella/shared';
import { ok } from './db';

const hoy = () => new Date().toISOString().slice(0, 10);

/**
 * Texto de un contrato nuevo: la plantilla con los datos de la empresa, el cliente,
 * el proyecto, el presupuesto (con sus partidas) y los servicios del cliente. No guarda nada.
 */
export async function textoDeContrato(
  db: SupabaseClient,
  a: { plantillaId: string; clienteId: string; proyectoId?: string | null; presupuestoId?: string | null; fecha?: string | null },
) {
  if (!a.plantillaId || !a.clienteId) throw new BadRequestException('Elige la plantilla y el cliente');
  const [plantilla, empresa, cliente, proyecto, presupuesto, servicios] = await Promise.all([
    db.from('plantillas_contrato').select('nombre, cuerpo').eq('id', a.plantillaId).single().then((r) => ok(r) as any),
    db.from('empresa').select('*').eq('id', 1).single().then((r) => ok(r)),
    db.from('clientes').select('*').eq('id', a.clienteId).single().then((r) => ok(r)),
    a.proyectoId ? db.from('proyectos').select('*').eq('id', a.proyectoId).single().then((r) => ok(r)) : null,
    a.presupuestoId ? db.from('presupuestos').select('*, lineas:presupuesto_lineas(*)').eq('id', a.presupuestoId).single().then((r) => ok(r) as any) : null,
    db.from('servicios').select('nombre, detalle, precio, periodicidad, iva_pct').eq('cliente_id', a.clienteId).eq('estado', 'activo').order('nombre').then((r) => ok(r) as any[]),
  ]);
  // Sin proyecto elegido, el del presupuesto
  const proyectoFinal = proyecto ?? (presupuesto?.proyecto_id ? ok(await db.from('proyectos').select('*').eq('id', presupuesto.proyecto_id).single()) : null);
  return {
    titulo: `${plantilla.nombre}${proyectoFinal?.nombre ? ` · ${proyectoFinal.nombre}` : presupuesto ? ` · ${presupuesto.titulo}` : ''}`,
    cuerpo: rellenarPlantilla(plantilla.cuerpo, { empresa, cliente, proyecto: proyectoFinal, presupuesto, servicios, fecha: a.fecha || hoy() }),
    proyecto_id: (proyectoFinal as any)?.id ?? null,
  };
}
