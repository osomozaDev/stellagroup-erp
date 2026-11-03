import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  ContratoInput, contratoSchema, EnviarFirmaInput, enviarFirmaSchema, PlantillaContratoInput, plantillaContratoSchema,
} from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ZodPipe } from '../comun/zod.pipe';
import { busqueda, ok } from '../comun/db';
import { EnvioFacturaService } from './envio-factura.service';
import { FirmasService } from './firmas.service';
import { remitenteDe } from '../comun/remitente';
import { textoDeContrato } from '../comun/contrato-de-plantilla';
import { completarDatos, datosQueFaltan } from '../comun/datos-contrato';

const hoy = () => new Date().toISOString().slice(0, 10);

@Controller('contratos')
export class ContratosController {
  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly firmas: FirmasService,
    private readonly envio: EnvioFacturaService,
  ) {}

  @Get()
  async listar(@Query('q') q?: string, @Query('estado') estado?: string) {
    let query = this.db
      .from('contratos')
      .select('id, numero, titulo, fecha, estado, firmado_en, cliente:clientes(id, nombre), proyecto:proyectos(id, nombre)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    if (estado) query = query.eq('estado', estado);
    if (q && (q = busqueda(q))) query = query.or(`numero.ilike.%${q}%,titulo.ilike.%${q}%`);
    return ok(await query);
  }

  /**
   * Texto de un contrato nuevo: la plantilla con los datos del cliente, el proyecto,
   * el presupuesto y los servicios del cliente ya puestos. No guarda nada.
   */
  @Get('rellenar')
  async rellenar(
    @Query('plantilla') plantillaId: string,
    @Query('cliente') clienteId: string,
    @Query('proyecto') proyectoId?: string,
    @Query('presupuesto') presupuestoId?: string,
    @Query('fecha') fecha?: string,
  ) {
    return textoDeContrato(this.db, { plantillaId, clienteId, proyectoId, presupuestoId, fecha });
  }

  /** Los datos que faltan para poder enviarlo a firmar, por ficha (Mi empresa, cliente, proyecto o solo el contrato) */
  @Get(':id/faltan')
  faltan(@Param('id') id: string, @Req() req: any) {
    return datosQueFaltan(this.db, id, req.perfil);
  }

  /** Guarda en sus fichas lo completado y lo pone en el texto del contrato */
  @Post(':id/completar')
  async completar(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    await this.firmas.comprobarEditable('contrato', id);
    return completarDatos(this.db, id, req.perfil, body ?? {});
  }

  @Get(':id')
  async ver(@Param('id') id: string) {
    const [c, firmas] = await Promise.all([this.firmas.documento('contrato', id), this.firmas.deDocumento('contrato', id)]);
    return { ...c, firmas };
  }

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const { pdf, nombre } = (await this.firmas.pdfFirmado('contrato', id)) ?? (await this.envio.pdfDe(await this.firmas.documento('contrato', id)));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`);
    res.send(pdf);
  }

  @Post()
  async crear(@Body(new ZodPipe(contratoSchema)) body: ContratoInput) {
    const anio = Number(body.fecha.slice(0, 4));
    const numero = ok(await this.db.rpc('siguiente_numero_contrato', { p_anio: anio })) as string;
    return ok(await this.db.from('contratos').insert({ ...body, numero, anio }).select().single());
  }

  @Patch(':id')
  async editar(@Param('id') id: string, @Body(new ZodPipe(contratoSchema)) body: ContratoInput) {
    await this.firmas.comprobarEditable('contrato', id);
    const c = ok(await this.db.from('contratos').select('estado').eq('id', id).single()) as any;
    if (c.estado === 'anulado') throw new BadRequestException('Este contrato está anulado');
    return ok(await this.db.from('contratos').update({ ...body, updated_at: new Date().toISOString() }).eq('id', id).select().single());
  }

  /** Anular un contrato (también uno firmado, p. ej. si se rescinde): se conserva con sus firmas */
  @Patch(':id/anular')
  async anular(@Param('id') id: string) {
    ok(await this.db.from('firmas').update({ estado: 'anulado' }).eq('documento_tipo', 'contrato').eq('documento_id', id).eq('estado', 'pendiente'));
    return ok(await this.db.from('contratos').update({ estado: 'anulado' }).eq('id', id).select().single());
  }

  @Post(':id/firma')
  async enviarFirma(@Param('id') id: string, @Body(new ZodPipe(enviarFirmaSchema)) body: EnviarFirmaInput, @Req() req: any) {
    return this.firmas.enviar('contrato', id, body, req.user?.email ?? null, await remitenteDe(this.db, req, body.como));
  }

  @Delete(':id/firma')
  anularFirma(@Param('id') id: string) {
    return this.firmas.anular('contrato', id);
  }

  @Post(':id/duplicar')
  async duplicar(@Param('id') id: string) {
    const c = ok(await this.db.from('contratos').select('*').eq('id', id).single()) as any;
    return this.crear({
      cliente_id: c.cliente_id, proyecto_id: c.proyecto_id, presupuesto_id: c.presupuesto_id, plantilla_id: c.plantilla_id,
      titulo: `${c.titulo} (copia)`, cuerpo: c.cuerpo, fecha: hoy(), notas: c.notas,
    });
  }

  @Delete(':id')
  async borrar(@Param('id') id: string) {
    const c = ok(await this.db.from('contratos').select('estado').eq('id', id).single()) as any;
    if (c.estado !== 'borrador') throw new BadRequestException('Solo se pueden borrar los borradores. Los enviados se anulan.');
    ok(await this.db.from('contratos').delete().eq('id', id));
    return { ok: true };
  }
}

@Controller('plantillas-contrato')
export class PlantillasContratoController {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  @Get()
  async listar() {
    return ok(await this.db.from('plantillas_contrato').select('*').order('activa', { ascending: false }).order('nombre'));
  }

  @Post()
  async crear(@Body(new ZodPipe(plantillaContratoSchema)) body: PlantillaContratoInput) {
    return ok(await this.db.from('plantillas_contrato').insert(body).select().single());
  }

  @Put(':id')
  async editar(@Param('id') id: string, @Body(new ZodPipe(plantillaContratoSchema)) body: PlantillaContratoInput) {
    return ok(await this.db.from('plantillas_contrato').update({ ...body, updated_at: new Date().toISOString() }).eq('id', id).select().single());
  }

  @Delete(':id')
  async borrar(@Param('id') id: string) {
    // Los contratos hechos con ella se quedan como están (guardan su propio texto)
    ok(await this.db.from('plantillas_contrato').delete().eq('id', id));
    return { ok: true };
  }
}
