import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  AceptarPresupuestoInput, aceptarPresupuestoSchema, calcularTotales, EnviarFirmaInput, enviarFirmaSchema, ESTADOS_PRESUPUESTO, EstadoPresupuesto, PresupuestoInput,
  presupuestoSchema, redondear,
} from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ZodPipe } from '../comun/zod.pipe';
import { busqueda, ok } from '../comun/db';
import { EnvioFacturaService } from './envio-factura.service';
import { FirmasService } from './firmas.service';

const hoy = () => new Date().toISOString().slice(0, 10);

@Controller('presupuestos')
export class PresupuestosController {
  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly envio: EnvioFacturaService,
    private readonly firmas: FirmasService,
  ) {}

  @Get()
  async listar(@Query('q') q?: string, @Query('estado') estado?: string) {
    let query = this.db
      .from('presupuestos')
      .select('id, numero, titulo, fecha, valido_hasta, estado, total, base, cliente:clientes(id, nombre), proyecto:proyectos(id, nombre)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (estado && ESTADOS_PRESUPUESTO.includes(estado as EstadoPresupuesto)) query = query.eq('estado', estado);
    if (q && (q = busqueda(q))) query = query.or(`numero.ilike.%${q}%,titulo.ilike.%${q}%`);
    const lista = ok(await query) as any[];
    // Un presupuesto enviado que ya pasó su validez se marca como caducado (sin cambiar su estado)
    return lista.map((p) => ({ ...p, caducado: p.estado === 'enviado' && !!p.valido_hasta && p.valido_hasta < hoy() }));
  }

  @Get(':id')
  async ver(@Param('id') id: string) {
    const p = ok(
      await this.db
        .from('presupuestos')
        .select('*, cliente:clientes(*), proyecto:proyectos(id, nombre), lineas:presupuesto_lineas(*)')
        .eq('id', id)
        .order('orden', { referencedTable: 'presupuesto_lineas' })
        .single(),
    ) as any;
    const [empresa, firmas] = await Promise.all([
      this.db.from('empresa').select('*').eq('id', 1).single().then((r) => ok(r)),
      this.firmas.deDocumento('presupuesto', id),
    ]);
    return { ...p, empresa, firmas, tipo_documento: 'presupuesto' };
  }

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    // Si está firmado, la copia firmada (con su certificado); si no, el presupuesto tal cual
    const { pdf, nombre } = (await this.firmas.pdfFirmado('presupuesto', id)) ?? (await this.envio.pdfDe(await this.ver(id)));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`);
    res.send(pdf);
  }

  private filas(input: PresupuestoInput) {
    const t = calcularTotales(input.lineas, input.iva_pct, input.retencion_pct);
    const { lineas, ...cabecera } = input;
    return {
      cabecera: { ...cabecera, ...t },
      lineas: lineas.map((l, i) => ({ ...l, orden: i, importe: redondear(l.cantidad * l.precio) })),
    };
  }

  @Post()
  async crear(@Body(new ZodPipe(presupuestoSchema)) body: PresupuestoInput) {
    const { cabecera, lineas } = this.filas(body);
    const anio = Number(body.fecha.slice(0, 4));
    if (!cabecera.valido_hasta) {
      const e = ok(await this.db.from('empresa').select('validez_presupuesto_dias').eq('id', 1).single()) as any;
      cabecera.valido_hasta = new Date(Date.parse(body.fecha) + e.validez_presupuesto_dias * 864e5).toISOString().slice(0, 10);
    }
    const numero = ok(await this.db.rpc('siguiente_numero_presupuesto', { p_anio: anio })) as string;
    const p = ok(await this.db.from('presupuestos').insert({ ...cabecera, numero, anio }).select().single()) as any;
    ok(await this.db.from('presupuesto_lineas').insert(lineas.map((l) => ({ ...l, presupuesto_id: p.id }))));
    return p;
  }

  @Patch(':id')
  async editar(@Param('id') id: string, @Body(new ZodPipe(presupuestoSchema)) body: PresupuestoInput) {
    const actual = ok(await this.db.from('presupuestos').select('estado').eq('id', id).single()) as any;
    if (actual.estado === 'aceptado') throw new BadRequestException('Un presupuesto aceptado no se cambia: el proyecto ya tiene sus hitos');
    await this.firmas.comprobarEditable('presupuesto', id);
    const { cabecera, lineas } = this.filas(body);
    const p = ok(await this.db.from('presupuestos').update(cabecera).eq('id', id).select().single());
    ok(await this.db.from('presupuesto_lineas').delete().eq('presupuesto_id', id));
    ok(await this.db.from('presupuesto_lineas').insert(lineas.map((l) => ({ ...l, presupuesto_id: id }))));
    return p;
  }

  /** Enviado, rechazado o de vuelta a borrador. Para aceptarlo está /aceptar */
  @Patch(':id/estado')
  async cambiarEstado(@Param('id') id: string, @Body('estado') estado: EstadoPresupuesto) {
    if (!ESTADOS_PRESUPUESTO.includes(estado) || estado === 'aceptado') throw new BadRequestException('Estado no válido');
    const actual = ok(await this.db.from('presupuestos').select('estado').eq('id', id).single()) as any;
    if (actual.estado === 'aceptado') throw new BadRequestException('Este presupuesto ya está aceptado');
    const respondido_en = estado === 'rechazado' ? hoy() : null;
    // Si se vuelve a borrador o se da por rechazado a mano, el enlace de firma deja de valer
    if (estado !== 'enviado') ok(await this.db.from('firmas').update({ estado: 'anulado' }).eq('documento_tipo', 'presupuesto').eq('documento_id', id).eq('estado', 'pendiente'));
    return ok(await this.db.from('presupuestos').update({ estado, respondido_en }).eq('id', id).select().single());
  }

  /**
   * El cliente dice que sí: se crea el proyecto (por hitos, con el importe del
   * presupuesto) y cada línea pasa a ser un hito con su importe.
   */
  @Post(':id/aceptar')
  async aceptar(@Param('id') id: string, @Body(new ZodPipe(aceptarPresupuestoSchema)) body: AceptarPresupuestoInput) {
    const p = await this.ver(id);
    // Un presupuesto firmado por el cliente ya está aceptado: aquí solo falta crear el proyecto
    if (p.estado === 'aceptado' && (p.proyecto_id || !body.crear_proyecto)) throw new BadRequestException('Este presupuesto ya está aceptado');
    let proyectoId: string | null = p.proyecto_id ?? null;
    if (body.crear_proyecto && !proyectoId) {
      const proyecto = ok(
        await this.db
          .from('proyectos')
          .insert({
            cliente_id: p.cliente_id,
            nombre: body.nombre || p.titulo,
            referencia: p.numero,
            tipo: body.tipo,
            descripcion: p.introduccion,
            concepto: p.titulo,
            modalidad: 'hitos',
            estado: 'activo',
            fecha_inicio: body.fecha_inicio || hoy(),
            presupuesto: p.base,
            iva_pct: p.iva_pct,
            retencion_pct: p.retencion_pct,
          })
          .select('id')
          .single(),
      ) as any;
      proyectoId = proyecto.id;
      ok(
        await this.db.from('hitos').insert(
          p.lineas.map((l: any, i: number) => ({
            proyecto_id: proyectoId,
            orden: i,
            nombre: l.concepto.split('\n')[0].slice(0, 200),
            descripcion: l.concepto.includes('\n') ? l.concepto.split('\n').slice(1).join('\n') : null,
            importe: l.importe,
          })),
        ),
      );
    }
    // Aceptado a mano (p. ej. firmado en papel): el enlace de firma pendiente deja de valer
    ok(await this.db.from('firmas').update({ estado: 'anulado' }).eq('documento_tipo', 'presupuesto').eq('documento_id', id).eq('estado', 'pendiente'));
    return ok(
      await this.db.from('presupuestos').update({ estado: 'aceptado', respondido_en: p.respondido_en ?? hoy(), proyecto_id: proyectoId }).eq('id', id).select().single(),
    );
  }

  @Post(':id/firma')
  enviarFirma(@Param('id') id: string, @Body(new ZodPipe(enviarFirmaSchema)) body: EnviarFirmaInput, @Req() req: any) {
    return this.firmas.enviar('presupuesto', id, body, req.user?.email ?? null);
  }

  @Delete(':id/firma')
  anularFirma(@Param('id') id: string) {
    return this.firmas.anular('presupuesto', id);
  }

  /** Copia de un presupuesto (p. ej. para hacer una versión con otro alcance) */
  @Post(':id/duplicar')
  async duplicar(@Param('id') id: string) {
    const p = await this.ver(id);
    return this.crear({
      cliente_id: p.cliente_id,
      titulo: `${p.titulo} (copia)`,
      introduccion: p.introduccion,
      fecha: hoy(),
      valido_hasta: null,
      iva_pct: Number(p.iva_pct),
      retencion_pct: Number(p.retencion_pct),
      condiciones: p.condiciones,
      notas: p.notas,
      lineas: p.lineas.map((l: any) => ({ concepto: l.concepto, cantidad: Number(l.cantidad), unidad: l.unidad, precio: Number(l.precio) })),
    });
  }

  @Delete(':id')
  async borrar(@Param('id') id: string) {
    const p = ok(await this.db.from('presupuestos').select('estado').eq('id', id).single()) as any;
    if (p.estado === 'aceptado') throw new BadRequestException('Un presupuesto aceptado no se puede borrar');
    ok(await this.db.from('presupuestos').delete().eq('id', id));
    return { ok: true };
  }
}
