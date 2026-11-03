import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  ESTADOS_PROYECTO, EstadoProyecto, facturarHitoSchema, HitoInput, hitoSchema, HorasSemanaInput, horasSemanaSchema, ProyectoInput, proyectoSchema, semanasDelMes,
} from '@stella/shared';
import { z } from 'zod';
import { SUPABASE } from '../comun/supabase.module';
import { ZodPipe } from '../comun/zod.pipe';
import { busqueda, ok } from '../comun/db';
import { FacturasService } from './facturas.service';

@Controller('proyectos')
export class ProyectosController {
  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly facturas: FacturasService,
  ) {}

  @Get()
  async listar(@Query('q') q?: string, @Query('estado') estado?: string) {
    let query = this.db
      .from('proyectos')
      .select('*, cliente:clientes(id, nombre), facturas(total, base, estado, periodo, rectifica_id), hitos(importe, completado_en, factura_id)')
      .order('created_at', { ascending: false });
    if (estado) query = query.eq('estado', estado);
    if (q && (q = busqueda(q))) query = query.or(`nombre.ilike.%${q}%,referencia.ilike.%${q}%,descripcion.ilike.%${q}%`);
    const proyectos = ok(await query) as any[];
    return proyectos.map(({ facturas, hitos, ...o }) => {
      const validas = facturas.filter((f: any) => f.estado === 'emitida' || f.estado === 'cobrada');
      // Las horas cambian cada mes: lo real es lo último facturado y la media, no la previsión
      const mensuales = validas.filter((f: any) => f.periodo && !f.rectifica_id).sort((a: any, b: any) => a.periodo.localeCompare(b.periodo));
      const ultima = mensuales.at(-1);
      return {
        ...o,
        facturado: validas.reduce((s: number, f: any) => s + Number(f.total), 0),
        ultimo_periodo: ultima?.periodo ?? null,
        ultimo_base: ultima ? Number(ultima.base) : null,
        media_base: mensuales.length ? mensuales.reduce((s: number, f: any) => s + Number(f.base), 0) / mensuales.length : null,
        hitos_total: hitos.length,
        hitos_completados: hitos.filter((h: any) => h.completado_en).length,
        hitos_facturados: hitos.filter((h: any) => h.factura_id).length,
      };
    });
  }

  @Get(':id')
  async ver(@Param('id') id: string) {
    return ok(
      await this.db
        .from('proyectos')
        .select(
          '*, cliente:clientes(*), facturas(id, numero, fecha, vencimiento, total, base, retencion_importe, estado, periodo, rectifica_id), empleados(id, nombre, apellidos, puesto), hitos(*, factura:facturas(id, numero, estado, total)), servicios(id, nombre, tipo, precio, periodicidad, proxima_renovacion, estado), presupuestos(id, numero, titulo, total, estado)',
        )
        .eq('id', id)
        .order('fecha', { referencedTable: 'facturas', ascending: false })
        .order('orden', { referencedTable: 'hitos' })
        .single(),
    );
  }

  /** Horas de cada semana del mes (semanas cortadas a los límites del mes) */
  @Get(':id/horas')
  async horas(@Param('id') id: string, @Query('mes') mes: string) {
    if (!/^\d{4}-\d{2}$/.test(mes ?? '')) throw new BadRequestException('Falta el mes');
    const semanas = semanasDelMes(mes);
    const guardadas = ok(
      await this.db
        .from('horas_semana')
        .select('inicio, horas, notas, updated_at')
        .eq('proyecto_id', id)
        .gte('inicio', semanas[0].inicio)
        .lte('inicio', semanas.at(-1)!.fin),
    ) as any[];
    const lista = semanas.map((s) => {
      const g = guardadas.find((h) => h.inicio === s.inicio);
      return { ...s, horas: g ? Number(g.horas) : null, notas: g?.notas ?? null, actualizado: g?.updated_at ?? null };
    });
    return { semanas: lista, total: lista.reduce((t, s) => t + (s.horas ?? 0), 0) };
  }

  @Put(':id/horas/:inicio')
  async guardarHoras(@Param('id') id: string, @Param('inicio') inicio: string, @Body(new ZodPipe(horasSemanaSchema)) body: HorasSemanaInput, @Req() req: any) {
    if (!semanasDelMes(inicio.slice(0, 7)).some((s) => s.inicio === inicio)) throw new BadRequestException('Esa fecha no es el inicio de una semana');
    return ok(
      await this.db
        .from('horas_semana')
        .upsert({ proyecto_id: id, inicio, ...body, actualizado_por: req.user?.id ?? null, updated_at: new Date().toISOString() })
        .select()
        .single(),
    );
  }

  @Delete(':id/horas/:inicio')
  async borrarHoras(@Param('id') id: string, @Param('inicio') inicio: string) {
    ok(await this.db.from('horas_semana').delete().eq('proyecto_id', id).eq('inicio', inicio));
    return { ok: true };
  }

  /** Prefacturas de todos los meses del proyecto */
  @Post(':id/prefacturas')
  prefacturas(@Param('id') id: string, @Body('actualizar') actualizar?: boolean) {
    return this.facturas.generarPrefacturas(id, actualizar === true);
  }

  // ───────── Hitos ─────────

  @Post(':id/hitos')
  async crearHito(@Param('id') id: string, @Body(new ZodPipe(hitoSchema)) body: HitoInput) {
    const { count } = await this.db.from('hitos').select('id', { count: 'exact', head: true }).eq('proyecto_id', id);
    return ok(await this.db.from('hitos').insert({ ...body, proyecto_id: id, orden: count ?? 0 }).select().single());
  }

  @Patch(':id/hitos/:hito')
  async editarHito(@Param('id') id: string, @Param('hito') hito: string, @Body(new ZodPipe(hitoSchema)) body: HitoInput) {
    return ok(await this.db.from('hitos').update(body).eq('id', hito).eq('proyecto_id', id).select().single());
  }

  /** Marcar o desmarcar un hito como entregado */
  @Patch(':id/hitos/:hito/completado')
  async completarHito(@Param('id') id: string, @Param('hito') hito: string, @Body(new ZodPipe(z.object({ completado: z.boolean() }))) body: { completado: boolean }) {
    const completado_en = body.completado ? new Date().toISOString().slice(0, 10) : null;
    return ok(await this.db.from('hitos').update({ completado_en }).eq('id', hito).eq('proyecto_id', id).select().single());
  }

  /** Cambia el orden de los hitos: llega la lista de ids en el orden nuevo */
  @Put(':id/hitos/orden')
  async ordenarHitos(@Param('id') id: string, @Body(new ZodPipe(z.object({ ids: z.array(z.string().uuid()) }))) body: { ids: string[] }) {
    await Promise.all(body.ids.map((h, orden) => this.db.from('hitos').update({ orden }).eq('id', h).eq('proyecto_id', id)));
    return { ok: true };
  }

  @Delete(':id/hitos/:hito')
  async borrarHito(@Param('id') id: string, @Param('hito') hito: string) {
    const h = ok(await this.db.from('hitos').select('factura_id').eq('id', hito).eq('proyecto_id', id).single()) as any;
    if (h.factura_id) throw new BadRequestException('Este hito ya está facturado. Anula o rectifica la factura antes de borrarlo.');
    ok(await this.db.from('hitos').delete().eq('id', hito));
    return { ok: true };
  }

  @Post(':id/hitos/:hito/facturar')
  facturarHito(@Param('id') id: string, @Param('hito') hito: string, @Body(new ZodPipe(facturarHitoSchema)) body: { fecha?: string; borrador?: boolean }) {
    return this.facturas.facturarHito(id, hito, body);
  }

  @Post()
  async crear(@Body(new ZodPipe(proyectoSchema)) body: ProyectoInput) {
    return ok(await this.db.from('proyectos').insert(body).select().single());
  }

  /** Pausar, terminar o reactivar un proyecto. Al terminarlo se pueden borrar las prefacturas que quedaban. */
  @Patch(':id/estado')
  async cambiarEstado(
    @Param('id') id: string,
    @Body('estado') estado: EstadoProyecto,
    @Body('borrarPrefacturas') borrarPrefacturas?: boolean,
  ) {
    if (!ESTADOS_PROYECTO.includes(estado)) throw new BadRequestException('Estado no válido');
    if (estado === 'terminado' && borrarPrefacturas === true) {
      ok(await this.db.from('facturas').delete().eq('proyecto_id', id).eq('estado', 'borrador'));
    }
    return ok(await this.db.from('proyectos').update({ estado }).eq('id', id).select().single());
  }

  @Patch(':id')
  async editar(@Param('id') id: string, @Body(new ZodPipe(proyectoSchema)) body: ProyectoInput) {
    return ok(await this.db.from('proyectos').update(body).eq('id', id).select().single());
  }

  @Delete(':id')
  async borrar(@Param('id') id: string) {
    // Las prefacturas no tienen número: se van con el proyecto. Las facturas emitidas se conservan.
    ok(await this.db.from('facturas').delete().eq('proyecto_id', id).eq('estado', 'borrador'));
    ok(await this.db.from('proyectos').delete().eq('id', id));
    return { ok: true };
  }
}
