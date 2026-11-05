import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  AceptarPresupuestoInput, aceptarPresupuestoSchema, calcularTotales, clienteDeTexto, EnviarFirmaInput, enviarFirmaSchema, ESTADOS_PRESUPUESTO, EstadoPresupuesto, PresupuestoInput,
  presupuestoSchema, redondear,
} from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ZodPipe } from '../comun/zod.pipe';
import { busqueda, ok } from '../comun/db';
import { EnvioFacturaService } from './envio-factura.service';
import { FirmasService } from './firmas.service';
import { remitenteDe } from '../comun/remitente';
import { clienteDePresupuesto } from '../comun/alta-cliente';
import { proyectoDePresupuesto } from '../comun/proyecto-presupuesto';
import { textoDeContrato } from '../comun/contrato-de-plantilla';
import { z } from 'zod';

const hoy = () => new Date().toISOString().slice(0, 10);

/** Pasar un presupuesto a contrato: la plantilla y los dos datos que cambian en cada contrato */
/** Días naturales de entrega de una web cuando no se dice otro plazo */
const PLAZO_HABITUAL = 15;

const aContratoSchema = z.object({
  plantilla_id: z.string().uuid().optional().nullable(),
  plazo_dias: z.coerce.number().int().min(1, 'Pon el plazo de entrega en días').max(730).optional().nullable(),
  precio_hora: z.coerce.number().min(0).max(10000).optional().nullable(),
});

/** Si el presupuesto no tiene cliente de la lista, el escrito a mano con la misma forma */
const conCliente = (p: any) => ({ ...p, cliente: p.cliente ?? clienteDeTexto(p.cliente_texto) });

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
      .select('id, numero, titulo, fecha, valido_hasta, estado, total, base, cliente_texto, cliente:clientes(id, nombre), proyecto:proyectos(id, nombre)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (estado && ESTADOS_PRESUPUESTO.includes(estado as EstadoPresupuesto)) query = query.eq('estado', estado);
    if (q && (q = busqueda(q))) query = query.or(`numero.ilike.%${q}%,titulo.ilike.%${q}%,cliente_texto.ilike.%${q}%`);
    const lista = ok(await query) as any[];
    // Un presupuesto enviado que ya pasó su validez se marca como caducado (sin cambiar su estado)
    return lista.map((p) => ({ ...conCliente(p), caducado: p.estado === 'enviado' && !!p.valido_hasta && p.valido_hasta < hoy() }));
  }

  @Get(':id')
  async ver(@Param('id') id: string) {
    const p = ok(
      await this.db
        .from('presupuestos')
        .select('*, cliente:clientes(*), proyecto:proyectos(id, nombre), lineas:presupuesto_lineas(*), contratos(id, numero, titulo, estado, firmado_en, created_at)')
        .eq('id', id)
        .order('orden', { referencedTable: 'presupuesto_lineas' })
        .single(),
    ) as any;
    const [empresa, firmas] = await Promise.all([
      this.db.from('empresa').select('*').eq('id', 1).single().then((r) => ok(r)),
      this.firmas.deDocumento('presupuesto', id),
    ]);
    return { ...conCliente(p), empresa, firmas, tipo_documento: 'presupuesto' };
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
      // Con cliente de la lista, el texto escrito a mano ya no hace falta
      cabecera: { ...cabecera, cliente_texto: cabecera.cliente_id ? null : cabecera.cliente_texto, ...t },
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
    // La oportunidad de la que sale pasa a la etapa de propuesta
    if (body.oportunidad_id) ok(await this.db.from('oportunidades').update({ etapa: 'propuesta' }).eq('id', body.oportunidad_id).in('etapa', ['nuevo', 'contactado', 'reunion']));
    // Desde Telegram se empieza sin partidas y se van añadiendo
    if (lineas.length) ok(await this.db.from('presupuesto_lineas').insert(lineas.map((l) => ({ ...l, presupuesto_id: p.id }))));
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
    if (lineas.length) ok(await this.db.from('presupuesto_lineas').insert(lineas.map((l) => ({ ...l, presupuesto_id: id }))));
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
    // Al aceptarlo pasa a ser cliente: si solo estaba escrito a mano, se da de alta (con o sin proyecto)
    await clienteDePresupuesto(this.db, id);
    if (body.crear_proyecto) proyectoId = (await proyectoDePresupuesto(this.db, id, body)).id;
    // Sin proyecto, la venta también está cerrada
    if (p.oportunidad_id) ok(await this.db.from('oportunidades').update({ etapa: 'ganado', cerrada_en: new Date().toISOString() }).eq('id', p.oportunidad_id).neq('etapa', 'ganado'));
    // Aceptado a mano (p. ej. firmado en papel): el enlace de firma pendiente deja de valer
    ok(await this.db.from('firmas').update({ estado: 'anulado' }).eq('documento_tipo', 'presupuesto').eq('documento_id', id).eq('estado', 'pendiente'));
    return ok(
      await this.db.from('presupuestos').update({ estado: 'aceptado', respondido_en: p.respondido_en ?? hoy(), proyecto_id: proyectoId }).eq('id', id).select().single(),
    );
  }

  /**
   * Convierte el presupuesto en contrato con la plantilla elegida (por defecto, la de
   * servicios web): da de alta al cliente si estaba escrito a mano, rellena la plantilla
   * con el presupuesto como Anexo I y pone el plazo de entrega (15 días si no se dice otro) y el precio por hora.
   * Si el presupuesto ya tiene un contrato que no está anulado, devuelve ese.
   */
  @Post(':id/contrato')
  async aContrato(@Param('id') id: string, @Body(new ZodPipe(aContratoSchema)) body: z.infer<typeof aContratoSchema>) {
    const p = ok(await this.db.from('presupuestos').select('id, numero, titulo, estado, proyecto_id, contratos(id, numero, estado)').eq('id', id).single()) as any;
    if (p.estado === 'rechazado') throw new BadRequestException('Este presupuesto está rechazado');
    const vivo = (p.contratos ?? []).find((c: any) => c.estado !== 'anulado');
    if (vivo) return { ...vivo, existente: true };

    const cliente = await clienteDePresupuesto(this.db, id);
    let plantillaId = body.plantilla_id ?? null;
    if (!plantillaId) {
      const activas = ok(await this.db.from('plantillas_contrato').select('id, nombre').eq('activa', true).order('created_at')) as any[];
      plantillaId = (activas.find((x) => /servicios web/i.test(x.nombre)) ?? activas.find((x) => /desarrollo/i.test(x.nombre)) ?? activas[0])?.id ?? null;
    }
    if (!plantillaId) throw new BadRequestException('No hay ninguna plantilla de contrato activa');

    const t = await textoDeContrato(this.db, { plantillaId, clienteId: cliente.id, presupuestoId: id, proyectoId: p.proyecto_id, fecha: hoy() });
    let cuerpo = t.cuerpo;
    cuerpo = cuerpo.replace(/\[falta plazo de entrega[^\]]*\]/g, String(body.plazo_dias || PLAZO_HABITUAL));
    if (body.precio_hora != null) cuerpo = cuerpo.replace(/\[falta precio por hora[^\]]*\]/g, new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(body.precio_hora));

    const fecha = hoy();
    const numero = ok(await this.db.rpc('siguiente_numero_contrato', { p_anio: Number(fecha.slice(0, 4)) })) as string;
    const c = ok(
      await this.db
        .from('contratos')
        .insert({ numero, anio: Number(fecha.slice(0, 4)), cliente_id: cliente.id, presupuesto_id: id, proyecto_id: t.proyecto_id, plantilla_id: plantillaId, titulo: t.titulo, cuerpo, fecha })
        .select('id, numero, estado, cuerpo')
        .single(),
    ) as any;
    const { cuerpo: texto, ...resto } = c;
    return { ...resto, existente: false, faltan: texto.match(/\[falta [^\]]+\]/g) ?? [] };
  }

  /** Da de alta como cliente a quien solo estaba escrito en el presupuesto */
  @Post(':id/alta-cliente')
  async altaCliente(@Param('id') id: string) {
    const p = ok(await this.db.from('presupuestos').select('cliente_id').eq('id', id).single()) as any;
    if (p.cliente_id) throw new BadRequestException('Este presupuesto ya tiene un cliente de la lista');
    return clienteDePresupuesto(this.db, id);
  }

  @Post(':id/firma')
  async enviarFirma(@Param('id') id: string, @Body(new ZodPipe(enviarFirmaSchema)) body: EnviarFirmaInput, @Req() req: any) {
    return this.firmas.enviar('presupuesto', id, body, req.user?.email ?? null, await remitenteDe(this.db, req, body.como));
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
      cliente_texto: p.cliente_texto,
      tipo_proyecto: p.tipo_proyecto,
      oportunidad_id: p.oportunidad_id,
      titulo: `${p.titulo} (copia)`,
      introduccion: p.introduccion,
      fecha: hoy(),
      valido_hasta: null,
      iva_pct: Number(p.iva_pct),
      retencion_pct: Number(p.retencion_pct),
      forma_pago: p.forma_pago,
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
