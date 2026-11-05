import { SupabaseClient } from '@supabase/supabase-js';
import { ok } from './db';
import { clienteDePresupuesto } from './alta-cliente';

/**
 * El presupuesto se ha cerrado: crea su proyecto por hitos, con un hito por partida.
 * Si solo estaba escrito a mano, da de alta al cliente. Apunta el arranque en la agenda
 * y marca como ganada la oportunidad de la que venía. No hace nada si ya tiene proyecto.
 */
export async function proyectoDePresupuesto(
  db: SupabaseClient,
  presupuestoId: string,
  opciones: { nombre?: string; tipo?: string | null; fecha_inicio?: string | null } = {},
): Promise<{ id: string; nuevo: boolean }> {
  const p = ok(
    await db
      .from('presupuestos')
      .select('id, numero, titulo, introduccion, base, iva_pct, retencion_pct, proyecto_id, tipo_proyecto, oportunidad_id, lineas:presupuesto_lineas(concepto, importe, orden)')
      .eq('id', presupuestoId)
      .order('orden', { referencedTable: 'presupuesto_lineas' })
      .single(),
  ) as any;
  if (p.proyecto_id) return { id: p.proyecto_id, nuevo: false };

  const cliente = await clienteDePresupuesto(db, presupuestoId);
  const oportunidad = p.oportunidad_id
    ? (ok(await db.from('oportunidades').select('tipo_proyecto, responsable_id').eq('id', p.oportunidad_id).maybeSingle()) as any)
    : null;
  const fechaInicio = opciones.fecha_inicio || new Date().toISOString().slice(0, 10);
  const nombre = opciones.nombre || p.titulo;
  const proyecto = ok(
    await db
      .from('proyectos')
      .insert({
        cliente_id: cliente.id,
        nombre,
        referencia: p.numero,
        tipo: opciones.tipo ?? p.tipo_proyecto ?? oportunidad?.tipo_proyecto ?? 'web',
        descripcion: p.introduccion,
        concepto: p.titulo,
        modalidad: 'hitos',
        estado: 'activo',
        fecha_inicio: fechaInicio,
        presupuesto: p.base,
        iva_pct: p.iva_pct,
        retencion_pct: p.retencion_pct,
      })
      .select('id')
      .single(),
  ) as any;
  ok(
    await db.from('hitos').insert(
      p.lineas.map((l: any, i: number) => ({
        proyecto_id: proyecto.id,
        orden: i,
        nombre: l.concepto.split('\n')[0].slice(0, 200),
        descripcion: l.concepto.includes('\n') ? l.concepto.split('\n').slice(1).join('\n') : null,
        importe: l.importe,
      })),
    ),
  );
  ok(await db.from('presupuestos').update({ proyecto_id: proyecto.id }).eq('id', presupuestoId));
  ok(
    await db.from('eventos').insert({
      titulo: `Arranque: ${nombre}`,
      tipo: 'tarea',
      inicio: `${fechaInicio}T00:00:00+01:00`,
      todo_el_dia: true,
      descripcion: 'Completar la ficha del proyecto y fijar la reunión de arranque con el cliente.',
      cliente_id: cliente.id,
      proyecto_id: proyecto.id,
      responsable_id: oportunidad?.responsable_id ?? null,
    }),
  );
  if (p.oportunidad_id) {
    ok(await db.from('oportunidades').update({ etapa: 'ganado', proyecto_id: proyecto.id, cliente_id: cliente.id, cerrada_en: new Date().toISOString() }).eq('id', p.oportunidad_id));
  }
  return { id: proyecto.id, nuevo: true };
}
