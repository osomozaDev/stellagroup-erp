import { Controller, Get, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { clienteDeTexto, importeMensual, instanteMadrid, primerDiaMes } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ok } from '../comun/db';

/** Resumen de la pantalla de inicio: lo que hay que hacer hoy */
@Controller('inicio')
export class InicioController {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  @Get()
  async resumen() {
    const hoy = new Date().toISOString().slice(0, 10);
    const periodo = primerDiaMes(hoy);
    const en30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const anio = hoy.slice(0, 4);

    const [proyectos, facturasMes, pendientes, facturadoAnio, empleados, nominasMes, empresa, clientes, proyectosConPrecio, emitidas, hitos, servicios, presupuestos, presupuestosAnio] = await Promise.all([
      this.db.from('proyectos').select('id, modalidad').eq('estado', 'activo'),
      this.db.from('facturas').select('proyecto_id').eq('periodo', periodo).in('estado', ['emitida', 'cobrada']),
      this.db
        .from('facturas')
        .select('id, numero, total, vencimiento, cliente:clientes(nombre)')
        .eq('estado', 'emitida')
        .order('vencimiento'),
      // Este año y el anterior, para comparar mes a mes
      this.db.from('facturas').select('base, fecha').in('estado', ['emitida', 'cobrada']).gte('fecha', `${Number(anio) - 1}-01-01`),
      this.db.from('empleados').select('id').eq('activo', true),
      this.db.from('nominas').select('id', { count: 'exact', head: true }).eq('periodo', periodo),
      // Para la guía de primeros pasos
      this.db.from('empresa').select('cif, iban, accion_principal').eq('id', 1).single(),
      this.db.from('clientes').select('id', { count: 'exact', head: true }),
      this.db.from('proyectos').select('id', { count: 'exact', head: true }).or('precio_hora.gt.0,presupuesto.gt.0'),
      this.db.from('facturas').select('id', { count: 'exact', head: true }).in('estado', ['emitida', 'cobrada']),
      // Hitos entregados que aún no se han facturado
      this.db
        .from('hitos')
        .select('id, nombre, importe, completado_en, proyecto:proyectos!inner(id, nombre, estado, cliente:clientes(nombre))')
        .not('completado_en', 'is', null)
        .is('factura_id', null)
        .order('completado_en'),
      this.db.from('servicios').select('id, nombre, tipo, precio, coste, periodicidad, proxima_renovacion, cliente:clientes(nombre)').eq('estado', 'activo').order('proxima_renovacion'),
      this.db.from('presupuestos').select('id, numero, titulo, total, fecha, valido_hasta, cliente_texto, cliente:clientes(nombre)').eq('estado', 'enviado').order('fecha'),
      // Para las cifras de presupuestos del inicio
      this.db.from('presupuestos').select('estado, base, fecha, respondido_en').gte('fecha', `${anio}-01-01`),
    ]);
    // Lo de hoy y lo atrasado de la agenda, y lo que hay abierto en el embudo
    const [agenda, embudo] = await Promise.all([
      this.db.from('eventos').select('id, titulo, tipo, inicio, todo_el_dia, cliente:clientes(nombre)').is('completado_en', null).lte('inicio', instanteMadrid(hoy, '23:59:59')).order('inicio').limit(8),
      this.db.from('oportunidades').select('importe').not('etapa', 'in', '(ganado,perdido)'),
    ]);
    const datosEmpresa = ok(empresa) as { cif: string | null; iban: string | null; accion_principal: string };
    const presAnio = ok(presupuestosAnio) as any[];
    const sumaBase = (l: any[]) => l.reduce((t, p) => t + Number(p.base), 0);
    const aceptadosAnio = presAnio.filter((p) => p.estado === 'aceptado');
    const respondidos = presAnio.filter((p) => p.estado === 'aceptado' || p.estado === 'rechazado');

    const activos = ok(proyectos) as any[];
    const porHoras = activos.filter((p) => p.modalidad === 'horas');
    const facturadosMes = new Set((ok(facturasMes) as any[]).map((f) => f.proyecto_id));
    const porCobrar = ok(pendientes) as any[];
    const emps = ok(empleados) as any[];
    const servs = ok(servicios) as any[];


    const porMes = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, base: 0, anterior: 0 }));
    for (const f of ok(facturadoAnio) as any[]) {
      const m = porMes[Number(f.fecha.slice(5, 7)) - 1];
      if (f.fecha.startsWith(anio)) m.base += Number(f.base);
      else m.anterior += Number(f.base);
    }
    // Lo facturado el año pasado hasta el mismo mes, para comparar de igual a igual
    const mesActual = Number(hoy.slice(5, 7));
    const anteriorHastaHoy = porMes.slice(0, mesActual).reduce((s, m) => s + m.anterior, 0);

    return {
      pasos: {
        empresa: !!(datosEmpresa.cif && datosEmpresa.iban),
        cliente: (clientes.count ?? 0) > 0,
        proyecto: (proyectosConPrecio.count ?? 0) > 0,
        factura: (emitidas.count ?? 0) > 0,
      },
      periodo,
      proyectos_activos: activos.length,
      proyectos_sin_facturar: porHoras.filter((p) => !facturadosMes.has(p.id)).length,
      hitos_por_facturar: ok(hitos) as any[],
      renovaciones: servs.filter((x) => x.proxima_renovacion <= en30).map((x) => ({ ...x, vencida: x.proxima_renovacion < hoy })),
      recurrente_mes: servs.reduce((t, x) => t + importeMensual(Number(x.precio), x.periodicidad), 0),
      margen_recurrente_mes: servs.reduce((t, x) => t + importeMensual(Number(x.precio) - Number(x.coste), x.periodicidad), 0),
      servicios_activos: servs.length,
      accion_principal: datosEmpresa.accion_principal,
      presupuestos_resumen: {
        borradores: presAnio.filter((p) => p.estado === 'borrador').length,
        hechos_mes: presAnio.filter((p) => p.fecha >= periodo).length,
        aceptados_anio: aceptadosAnio.length,
        aceptado_anio: sumaBase(aceptadosAnio),
        // Qué parte de los presupuestos que ya tienen respuesta se han aceptado
        tasa_aceptacion: respondidos.length ? Math.round((aceptadosAnio.length / respondidos.length) * 100) : null,
      },
      agenda_hoy: ok(agenda) as any[],
      embudo: { abiertas: (ok(embudo) as any[]).length, importe: (ok(embudo) as any[]).reduce((t, o) => t + Number(o.importe), 0) },
      presupuestos_pendientes: (ok(presupuestos) as any[]).map((p) => ({ ...p, cliente: p.cliente ?? clienteDeTexto(p.cliente_texto) })),
      por_cobrar: porCobrar.reduce((s, f) => s + Number(f.total), 0),
      vencidas: porCobrar.filter((f) => f.vencimiento && f.vencimiento < hoy),
      pendientes: porCobrar.map((f) => ({ ...f, vencida: !!f.vencimiento && f.vencimiento < hoy })),
      facturado_anio: porMes.reduce((s, m) => s + m.base, 0),
      facturado_por_mes: porMes,
      facturado_anterior_hasta_hoy: anteriorHastaHoy,
      facturado_anterior: porMes.reduce((s, m) => s + m.anterior, 0),
      empleados_activos: emps.length,
      nominas_mes: nominasMes.count ?? 0,
    };
  }
}
