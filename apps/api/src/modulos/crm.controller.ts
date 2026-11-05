import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { EventoInput, eventoSchema, instanteMadrid, MoverOportunidadInput, moverOportunidadSchema, OportunidadInput, oportunidadSchema } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ZodPipe } from '../comun/zod.pipe';
import { busqueda, ok } from '../comun/db';

const SELECCION_LISTA = 'id, titulo, etapa, importe, cierre_previsto, tipo_proyecto, origen, orden, contacto_empresa, contacto_nombre, proyecto_id, created_at, cliente:clientes(id, nombre), responsable:empleados(id, nombre, apellidos)';

/** Con quién es: el cliente de la lista o el contacto escrito */
const conQuien = (o: any) => o.cliente?.nombre ?? o.contacto_empresa ?? o.contacto_nombre ?? '';

@Controller('oportunidades')
export class OportunidadesController {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  @Get()
  async listar(@Query('q') q?: string) {
    let query = this.db.from('oportunidades').select(SELECCION_LISTA).order('orden').order('created_at', { ascending: false });
    if (q && (q = busqueda(q))) query = query.or(`titulo.ilike.%${q}%,contacto_empresa.ilike.%${q}%,contacto_nombre.ilike.%${q}%`);
    const lista = ok(await query) as any[];
    // Próximo evento pendiente de cada oportunidad: lo primero que hay que mirar en el embudo
    const ids = lista.filter((o) => !['ganado', 'perdido'].includes(o.etapa)).map((o) => o.id);
    const proximos = ids.length
      ? (ok(await this.db.from('eventos').select('oportunidad_id, titulo, inicio').in('oportunidad_id', ids).is('completado_en', null).order('inicio')) as any[])
      : [];
    return lista.map((o) => ({ ...o, con_quien: conQuien(o), proximo: proximos.find((e) => e.oportunidad_id === o.id) ?? null }));
  }

  @Get(':id')
  async ver(@Param('id') id: string) {
    const o = ok(
      await this.db
        .from('oportunidades')
        .select('*, cliente:clientes(id, nombre, email, telefono, contacto), responsable:empleados(id, nombre, apellidos), proyecto:proyectos(id, nombre), presupuestos(id, numero, titulo, total, estado), eventos(*)')
        .eq('id', id)
        .order('inicio', { referencedTable: 'eventos' })
        .single(),
    ) as any;
    return { ...o, con_quien: conQuien(o) };
  }

  private cierre(etapa: string) {
    return ['ganado', 'perdido'].includes(etapa) ? new Date().toISOString() : null;
  }

  @Post()
  async crear(@Body(new ZodPipe(oportunidadSchema)) body: OportunidadInput) {
    return ok(await this.db.from('oportunidades').insert({ ...body, cerrada_en: this.cierre(body.etapa) }).select().single());
  }

  @Patch(':id')
  async editar(@Param('id') id: string, @Body(new ZodPipe(oportunidadSchema)) body: OportunidadInput) {
    const { etapa: _etapa, ...datos } = body; // la etapa se cambia al moverla
    return ok(await this.db.from('oportunidades').update({ ...datos, updated_at: new Date().toISOString() }).eq('id', id).select().single());
  }

  /** Mover por el embudo. Perderla pide el motivo; volver a abrirla lo borra. */
  @Patch(':id/etapa')
  async mover(@Param('id') id: string, @Body(new ZodPipe(moverOportunidadSchema)) body: MoverOportunidadInput) {
    if (body.etapa === 'perdido' && !body.motivo_perdida) throw new BadRequestException('Apunta por qué se ha perdido');
    return ok(
      await this.db
        .from('oportunidades')
        .update({ etapa: body.etapa, motivo_perdida: body.etapa === 'perdido' ? body.motivo_perdida : null, cerrada_en: this.cierre(body.etapa), updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single(),
    );
  }

  /** Orden dentro de una columna: llega la lista de ids en el orden nuevo */
  @Put('orden')
  async ordenar(@Body(new ZodPipe(z.object({ ids: z.array(z.string().uuid()) }))) body: { ids: string[] }) {
    await Promise.all(body.ids.map((id, orden) => this.db.from('oportunidades').update({ orden }).eq('id', id)));
    return { ok: true };
  }

  /** Da de alta como cliente al contacto de la oportunidad */
  @Post(':id/alta-cliente')
  async altaCliente(@Param('id') id: string) {
    const o = ok(await this.db.from('oportunidades').select('cliente_id, contacto_empresa, contacto_nombre, contacto_email, contacto_telefono').eq('id', id).single()) as any;
    if (o.cliente_id) throw new BadRequestException('Esta oportunidad ya tiene un cliente de la lista');
    const nombre = o.contacto_empresa ?? o.contacto_nombre;
    const existente = ok(await this.db.from('clientes').select('id, nombre').ilike('nombre', nombre.replace(/[%_]/g, '\\$&')).limit(1).maybeSingle()) as any;
    const cliente = existente ?? (ok(
      await this.db.from('clientes').insert({ nombre, contacto: o.contacto_empresa ? o.contacto_nombre : null, email: o.contacto_email, telefono: o.contacto_telefono }).select('id, nombre').single(),
    ) as any);
    ok(await this.db.from('oportunidades').update({ cliente_id: cliente.id }).eq('id', id));
    return cliente;
  }

  @Delete(':id')
  async borrar(@Param('id') id: string) {
    ok(await this.db.from('oportunidades').delete().eq('id', id));
    return { ok: true };
  }
}

const SELECCION_EVENTO = '*, cliente:clientes(id, nombre), oportunidad:oportunidades(id, titulo), proyecto:proyectos(id, nombre), responsable:empleados(id, nombre, apellidos)';

@Controller('agenda')
export class AgendaController {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  /**
   * Todo lo que hay entre dos fechas: los eventos y, a modo de recordatorio, lo que
   * ya tiene fecha en otros módulos (hitos, entregas, renovaciones y cierres previstos).
   */
  @Get()
  async rango(@Query('desde') desde: string, @Query('hasta') hasta: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta ?? '')) throw new BadRequestException('Faltan las fechas');
    const [eventos, hitos, entregas, renovaciones, cierres] = await Promise.all([
      this.db.from('eventos').select(SELECCION_EVENTO).gte('inicio', instanteMadrid(desde)).lte('inicio', instanteMadrid(hasta, '23:59:59')).order('inicio'),
      this.db.from('hitos').select('id, nombre, fecha_prevista, proyecto:proyectos!inner(id, nombre, estado)').is('completado_en', null).gte('fecha_prevista', desde).lte('fecha_prevista', hasta),
      this.db.from('proyectos').select('id, nombre, fecha_fin').eq('estado', 'activo').gte('fecha_fin', desde).lte('fecha_fin', hasta),
      this.db.from('servicios').select('id, nombre, proxima_renovacion, cliente:clientes(nombre)').eq('estado', 'activo').gte('proxima_renovacion', desde).lte('proxima_renovacion', hasta),
      this.db.from('oportunidades').select('id, titulo, cierre_previsto').not('etapa', 'in', '(ganado,perdido)').gte('cierre_previsto', desde).lte('cierre_previsto', hasta),
    ]);
    const avisos = [
      ...(ok(hitos) as any[]).filter((h) => h.proyecto.estado === 'activo').map((h) => ({ clave: `hito-${h.id}`, tipo: 'hito', fecha: h.fecha_prevista, titulo: h.nombre, detalle: h.proyecto.nombre, a: `/proyectos/${h.proyecto.id}` })),
      ...(ok(entregas) as any[]).map((p) => ({ clave: `entrega-${p.id}`, tipo: 'entrega', fecha: p.fecha_fin, titulo: `Entrega: ${p.nombre}`, detalle: null, a: `/proyectos/${p.id}` })),
      ...(ok(renovaciones) as any[]).map((s) => ({ clave: `renovacion-${s.id}`, tipo: 'renovacion', fecha: s.proxima_renovacion, titulo: `Renueva: ${s.nombre}`, detalle: s.cliente?.nombre, a: `/servicios/${s.id}` })),
      ...(ok(cierres) as any[]).map((o) => ({ clave: `cierre-${o.id}`, tipo: 'cierre', fecha: o.cierre_previsto, titulo: `Cierre previsto: ${o.titulo}`, detalle: null, a: `/crm/${o.id}` })),
    ];
    return { eventos: ok(eventos), avisos };
  }

  @Post()
  async crear(@Body(new ZodPipe(eventoSchema)) body: EventoInput) {
    return ok(await this.db.from('eventos').insert(body).select().single());
  }

  @Patch(':id')
  async editar(@Param('id') id: string, @Body(new ZodPipe(eventoSchema)) body: EventoInput) {
    return ok(await this.db.from('eventos').update(body).eq('id', id).select().single());
  }

  @Patch(':id/completado')
  async completar(@Param('id') id: string, @Body(new ZodPipe(z.object({ completado: z.boolean() }))) body: { completado: boolean }) {
    return ok(await this.db.from('eventos').update({ completado_en: body.completado ? new Date().toISOString() : null }).eq('id', id).select().single());
  }

  @Delete(':id')
  async borrar(@Param('id') id: string) {
    ok(await this.db.from('eventos').delete().eq('id', id));
    return { ok: true };
  }
}
