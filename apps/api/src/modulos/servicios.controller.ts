import { BadRequestException, Body, Controller, Delete, Get, Inject, Injectable, Param, Patch, Post, Query } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  FacturarRenovacionesInput, facturarRenovacionesSchema, importeMensual, mesesPeriodicidad, nombreTipoServicio, ServicioInput, servicioSchema, sumarMeses,
} from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ZodPipe } from '../comun/zod.pipe';
import { busqueda, ok } from '../comun/db';
import { FacturasService } from './facturas.service';

const hoy = () => new Date().toISOString().slice(0, 10);
const fechaCorta = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
/** Último día que cubre un periodo que empieza en «desde» */
const finPeriodo = (desde: string, periodicidad: string) =>
  new Date(Date.parse(`${sumarMeses(desde, mesesPeriodicidad(periodicidad))}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);

/** Renovaciones de hosting, dominios, mantenimientos y licencias */
@Injectable()
export class ServiciosService {
  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly facturas: FacturasService,
  ) {}

  /**
   * Factura el periodo siguiente de cada servicio marcado: una factura por cliente,
   * una línea por servicio. La próxima renovación avanza un periodo.
   */
  async facturar(input: FacturarRenovacionesInput) {
    const servicios = ok(
      await this.db.from('servicios').select('*').in('id', input.servicios).eq('estado', 'activo').lte('proxima_renovacion', input.hasta),
    ) as any[];
    if (!servicios.length) throw new BadRequestException('No hay renovaciones pendientes entre los servicios elegidos');
    const porCliente = new Map<string, any[]>();
    for (const s of servicios) porCliente.set(s.cliente_id, [...(porCliente.get(s.cliente_id) ?? []), s]);

    const creadas: any[] = [];
    const errores: string[] = [];
    for (const [cliente_id, lista] of porCliente) {
      // Todas las líneas de una factura llevan el mismo IVA: si hay varios tipos, una factura por tipo
      const porIva = new Map<number, any[]>();
      for (const s of lista) porIva.set(Number(s.iva_pct), [...(porIva.get(Number(s.iva_pct)) ?? []), s]);
      for (const [iva, grupo] of porIva) {
        try {
          const factura = await this.facturas.crear({
            cliente_id,
            proyecto_id: grupo.length === 1 ? grupo[0].proyecto_id : null,
            periodo: null,
            fecha: input.fecha,
            vencimiento: null,
            iva_pct: iva,
            retencion_pct: 0,
            notas: null,
            borrador: input.borrador ?? false,
            lineas: grupo.map((s) => ({
              concepto: `${nombreTipoServicio(s.tipo)}: ${s.nombre}${s.detalle ? ` (${s.detalle})` : ''}\nDel ${fechaCorta(s.proxima_renovacion)} al ${fechaCorta(finPeriodo(s.proxima_renovacion, s.periodicidad))}`,
              cantidad: 1,
              unidad: 'ud',
              precio: Number(s.precio),
            })),
          });
          for (const s of grupo) {
            const desde = s.proxima_renovacion;
            ok(await this.db.from('servicio_renovaciones').insert({ servicio_id: s.id, desde, hasta: finPeriodo(desde, s.periodicidad), importe: s.precio, factura_id: factura.id }));
            ok(await this.db.from('servicios').update({ proxima_renovacion: sumarMeses(desde, mesesPeriodicidad(s.periodicidad)) }).eq('id', s.id));
          }
          creadas.push(factura);
        } catch (e: any) {
          errores.push(`${grupo.map((s) => s.nombre).join(', ')}: ${e.message}`);
        }
      }
    }
    return { creadas: creadas.length, facturas: creadas, errores };
  }
}

@Controller('servicios')
export class ServiciosController {
  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly servicios: ServiciosService,
  ) {}

  @Get()
  async listar(@Query('q') q?: string, @Query('estado') estado?: string, @Query('tipo') tipo?: string, @Query('cliente') cliente?: string) {
    let query = this.db
      .from('servicios')
      .select('*, cliente:clientes(id, nombre), proyecto:proyectos(id, nombre)')
      .order('proxima_renovacion');
    query = query.eq('estado', estado === 'cancelado' ? 'cancelado' : 'activo');
    if (tipo) query = query.eq('tipo', tipo);
    if (cliente) query = query.eq('cliente_id', cliente);
    if (q && (q = busqueda(q))) query = query.or(`nombre.ilike.%${q}%,detalle.ilike.%${q}%,proveedor.ilike.%${q}%`);
    const lista = ok(await query) as any[];
    const en30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    return lista.map((s) => ({
      ...s,
      mensual: importeMensual(Number(s.precio), s.periodicidad),
      vencido: s.estado === 'activo' && s.proxima_renovacion < hoy(),
      renueva_pronto: s.estado === 'activo' && s.proxima_renovacion <= en30,
    }));
  }

  /** Lo que se cobra y lo que cuesta al mes, para la cabecera de la pantalla */
  @Get('resumen')
  async resumen() {
    const activos = ok(await this.db.from('servicios').select('precio, coste, periodicidad, proxima_renovacion').eq('estado', 'activo')) as any[];
    const en30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const ingresos = activos.reduce((t, s) => t + importeMensual(Number(s.precio), s.periodicidad), 0);
    const costes = activos.reduce((t, s) => t + importeMensual(Number(s.coste), s.periodicidad), 0);
    const proximas = activos.filter((s) => s.proxima_renovacion <= en30);
    return {
      activos: activos.length,
      ingresos_mes: ingresos,
      costes_mes: costes,
      margen_mes: ingresos - costes,
      renovaciones_30: proximas.length,
      importe_30: proximas.reduce((t, s) => t + Number(s.precio), 0),
    };
  }

  @Get(':id')
  async ver(@Param('id') id: string) {
    return ok(
      await this.db
        .from('servicios')
        .select('*, cliente:clientes(id, nombre, email), proyecto:proyectos(id, nombre), renovaciones:servicio_renovaciones(*, factura:facturas(id, numero, estado, total))')
        .eq('id', id)
        .order('desde', { referencedTable: 'servicio_renovaciones', ascending: false })
        .single(),
    );
  }

  @Post()
  async crear(@Body(new ZodPipe(servicioSchema)) body: ServicioInput) {
    return ok(await this.db.from('servicios').insert(body).select().single());
  }

  @Post('facturar')
  facturar(@Body(new ZodPipe(facturarRenovacionesSchema)) body: FacturarRenovacionesInput) {
    return this.servicios.facturar(body);
  }

  @Patch(':id')
  async editar(@Param('id') id: string, @Body(new ZodPipe(servicioSchema)) body: ServicioInput) {
    return ok(await this.db.from('servicios').update(body).eq('id', id).select().single());
  }

  /** Cancelar (deja de renovarse) o reactivar */
  @Patch(':id/estado')
  async cambiarEstado(@Param('id') id: string, @Body('estado') estado: string) {
    if (estado !== 'activo' && estado !== 'cancelado') throw new BadRequestException('Estado no válido');
    return ok(
      await this.db
        .from('servicios')
        .update({ estado, cancelado_en: estado === 'cancelado' ? hoy() : null })
        .eq('id', id)
        .select()
        .single(),
    );
  }

  @Delete(':id')
  async borrar(@Param('id') id: string) {
    const { count } = await this.db.from('servicio_renovaciones').select('id', { count: 'exact', head: true }).eq('servicio_id', id).not('factura_id', 'is', null);
    if (count) throw new BadRequestException('Este servicio ya se ha facturado: cancélalo en vez de borrarlo');
    ok(await this.db.from('servicios').delete().eq('id', id));
    return { ok: true };
  }
}
