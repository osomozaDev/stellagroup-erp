import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Post, Put, Query, Req } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { GastoInput, gastoSchema, importesReparto } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ZodPipe } from '../comun/zod.pipe';
import { ok } from '../comun/db';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CAMPOS = '*, reparto:gasto_reparto(cliente_id, porcentaje, cliente:clientes(id, nombre))';

/** Con lo que le toca a cada cliente en euros */
const conImportes = (g: any) => ({
  ...g,
  reparto: importesReparto(Number(g.importe), [...(g.reparto ?? [])].sort((a: any, b: any) => Number(b.porcentaje) - Number(a.porcentaje))),
});

/**
 * Gastos (material, suscripciones, horas…) y su reparto por porcentaje entre clientes.
 * Los importes son sin IVA.
 */
@Controller('gastos')
export class GastosController {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  /** Gastos entre dos fechas (por defecto, el mes en curso) con lo imputado a cada cliente */
  @Get()
  async listar(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const hoy = new Date().toISOString().slice(0, 10);
    const d = desde && FECHA.test(desde) ? desde : `${hoy.slice(0, 7)}-01`;
    const finMes = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const h = hasta && FECHA.test(hasta) ? hasta : finMes;
    const gastos = ((ok(await this.db.from('gastos').select(CAMPOS).gte('fecha', d).lte('fecha', h).order('fecha', { ascending: false }).order('created_at', { ascending: false })) ?? []) as any[]).map(conImportes);

    const porCliente = new Map<string, { cliente_id: string; nombre: string; importe: number; gastos: number }>();
    let sinAsignar = 0;
    for (const g of gastos) {
      if (!g.reparto.length) sinAsignar += Number(g.importe);
      for (const r of g.reparto) {
        const c = porCliente.get(r.cliente_id) ?? { cliente_id: r.cliente_id, nombre: r.cliente?.nombre ?? '—', importe: 0, gastos: 0 };
        c.importe = Math.round((c.importe + r.importe) * 100) / 100;
        c.gastos += 1;
        porCliente.set(r.cliente_id, c);
      }
    }
    const total = Math.round(gastos.reduce((t, g) => t + Number(g.importe), 0) * 100) / 100;
    return {
      desde: d,
      hasta: h,
      gastos,
      total,
      sin_asignar: Math.round(sinAsignar * 100) / 100,
      por_cliente: [...porCliente.values()].sort((a, b) => b.importe - a.importe),
    };
  }

  /** Lo que se ha imputado a un cliente: total del año, total histórico y los últimos gastos */
  @Get('cliente/:id')
  async deCliente(@Param('id') id: string) {
    const filas = (ok(
      await this.db
        .from('gasto_reparto')
        .select('porcentaje, gasto:gastos(id, fecha, concepto, categoria, proveedor, importe, reparto:gasto_reparto(cliente_id, porcentaje))')
        .eq('cliente_id', id),
    ) ?? []) as any[];
    const anio = new Date().toISOString().slice(0, 4);
    const lista = filas
      .filter((f) => f.gasto)
      .map((f) => {
        const g = f.gasto;
        const parte = importesReparto(Number(g.importe), [...g.reparto].sort((a: any, b: any) => Number(b.porcentaje) - Number(a.porcentaje))).find((r) => r.cliente_id === id);
        const { reparto, ...resto } = g;
        return { ...resto, porcentaje: Number(f.porcentaje), parte: parte?.importe ?? 0, compartido: reparto.length > 1 };
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    const suma = (xs: any[]) => Math.round(xs.reduce((t, g) => t + g.parte, 0) * 100) / 100;
    return { total: suma(lista), total_anio: suma(lista.filter((g) => g.fecha.startsWith(anio))), gastos: lista.slice(0, 20), cuantos: lista.length };
  }

  @Post()
  async crear(@Body(new ZodPipe(gastoSchema)) body: GastoInput, @Req() req?: any) {
    const { reparto, ...datos } = body;
    const g = ok(await this.db.from('gastos').insert({ ...datos, registrado_por: req?.user?.id ?? null }).select('id').single()) as any;
    await this.guardarReparto(g.id, reparto);
    return this.uno(g.id);
  }

  @Put(':id')
  async editar(@Param('id') id: string, @Body(new ZodPipe(gastoSchema)) body: GastoInput) {
    const { reparto, ...datos } = body;
    const g = ok(await this.db.from('gastos').update(datos).eq('id', id).select('id').maybeSingle());
    if (!g) throw new NotFoundException('Ese gasto ya no existe');
    ok(await this.db.from('gasto_reparto').delete().eq('gasto_id', id));
    await this.guardarReparto(id, reparto);
    return this.uno(id);
  }

  @Delete(':id')
  async borrar(@Param('id') id: string) {
    ok(await this.db.from('gastos').delete().eq('id', id));
    return { ok: true };
  }

  private async guardarReparto(gastoId: string, reparto: GastoInput['reparto']) {
    if (!reparto.length) return;
    const { error } = await this.db.from('gasto_reparto').insert(reparto.map((r) => ({ gasto_id: gastoId, cliente_id: r.cliente_id, porcentaje: r.porcentaje })));
    if (error) throw new BadRequestException(error.code === '23503' ? 'Uno de los clientes ya no existe' : error.message);
  }

  private async uno(id: string) {
    return conImportes(ok(await this.db.from('gastos').select(CAMPOS).eq('id', id).single()));
  }
}
