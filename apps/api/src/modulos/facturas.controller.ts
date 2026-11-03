import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  ESTADOS_FACTURA, EstadoFactura, FacturaInput, facturaSchema, FacturarMesInput, facturarMesSchema, RectificarInput, rectificarSchema,
} from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ZodPipe } from '../comun/zod.pipe';
import { busqueda, ok } from '../comun/db';
import { FacturasService } from './facturas.service';
import { EnvioFacturaService } from './envio-factura.service';
import { TelegramService } from '../comun/telegram.service';
import { enviarLibro, EUROS, fechaExcel, nuevoLibro, tabla } from './gestoria.controller';

@Controller('facturas')
export class FacturasController {
  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly facturas: FacturasService,
    private readonly envio: EnvioFacturaService,
    private readonly telegram: TelegramService,
  ) {}

  @Get()
  async listar(@Query('q') q?: string, @Query('estado') estado?: string, @Query('anio') anio?: string) {
    return ok(await this.consulta(
      'id, numero, fecha, vencimiento, total, estado, periodo, rectifica_id, rectificativas:facturas!rectifica_id(id), cliente:clientes(id, nombre), proyecto:proyectos(id, nombre)',
      q,
      estado,
      anio,
    ));
  }

  /** Las facturas de la lista (con los mismos filtros) en Excel */
  @Get('excel')
  async excel(@Res() res: Response, @Query('q') q?: string, @Query('estado') estado?: string, @Query('anio') anio?: string) {
    const [facturas, empresa] = await Promise.all([
      this.consulta(
        'numero, fecha, vencimiento, base, iva_pct, iva_importe, retencion_importe, total, estado, cobrada_en, periodo, cliente:clientes(nombre, cif), proyecto:proyectos(nombre)',
        q,
        estado,
        anio,
      ).then((r) => ok(r) as any[]),
      this.db.from('empresa').select('nombre').eq('id', 1).single().then((r) => ok(r) as any),
    ]);
    const textoEstado: Record<string, string> = { borrador: 'Prefactura', emitida: 'Por cobrar', cobrada: 'Cobrada', anulada: 'Anulada' };
    const libro = nuevoLibro(empresa);
    tabla(
      libro,
      'Facturas',
      [['Número', 12], ['Fecha', 12, 'fecha'], ['Vencimiento', 12, 'fecha'], ['Cliente', 34], ['CIF', 13], ['Proyecto', 30], ['Base', 14, EUROS], ['IVA %', 8], ['IVA', 13, EUROS], ['Retención', 13, EUROS], ['Total', 14, EUROS], ['Estado', 12], ['Cobrada el', 12, 'fecha']],
      facturas.map((f) => [
        f.numero ?? 'Prefactura', fechaExcel(f.fecha), fechaExcel(f.vencimiento), f.cliente?.nombre ?? '', f.cliente?.cif ?? '', f.proyecto?.nombre ?? '',
        Number(f.base), Number(f.iva_pct), Number(f.iva_importe), Number(f.retencion_importe), Number(f.total), textoEstado[f.estado] ?? f.estado, fechaExcel(f.cobrada_en),
      ]),
    );
    await enviarLibro(res, libro, `Facturas${anio ? ` ${anio}` : ''}.xlsx`);
  }

  private consulta(campos: string, q?: string, estado?: string, anio?: string) {
    let query = this.db
      .from('facturas')
      .select(campos)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5000);
    if (estado === 'vencida') {
      query = query.eq('estado', 'emitida').lt('vencimiento', new Date().toISOString().slice(0, 10));
    } else if (estado) {
      query = query.eq('estado', estado);
    } else {
      // Las prefacturas tienen su propio filtro: no llenan la lista con meses futuros
      query = query.neq('estado', 'borrador');
    }
    if (anio && /^\d{4}$/.test(anio)) query = query.gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`);
    if (q && (q = busqueda(q))) query = query.ilike('numero', `%${q}%`);
    return query;
  }

  @Get('pendientes-mes')
  pendientesMes(@Query('periodo') periodo: string) {
    if (!periodo) throw new BadRequestException('Falta el mes');
    return this.facturas.pendientesMes(periodo);
  }

  /** PDF generado en el servidor, el mismo que se manda desde Telegram */
  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const { pdf, nombre } = await this.envio.pdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`);
    res.send(pdf);
  }

  /** Desde la app abierta en Telegram: el PDF llega al chat del usuario */
  @Post(':id/pdf/telegram')
  async pdfATelegram(@Param('id') id: string, @Req() req: any) {
    const chat = ok(await this.db.from('telegram_chats').select('chat_id').eq('usuario_id', req.user.id).maybeSingle()) as any;
    if (!chat?.chat_id) throw new BadRequestException('Tu Telegram no está conectado. Conéctalo en Mi empresa → Avisos por Telegram.');
    const { pdf, nombre } = await this.envio.pdf(id);
    await this.telegram.enviarArchivo(chat.chat_id, pdf, nombre);
    return { ok: true };
  }

  @Get(':id')
  ver(@Param('id') id: string) {
    return this.facturas.ver(id);
  }

  @Post()
  crear(@Body(new ZodPipe(facturaSchema)) body: FacturaInput) {
    return this.facturas.crear(body);
  }

  @Post('facturar-mes')
  facturarMes(@Body(new ZodPipe(facturarMesSchema)) body: FacturarMesInput) {
    return this.facturas.facturarMes(body);
  }

  @Patch(':id')
  editar(@Param('id') id: string, @Body(new ZodPipe(facturaSchema)) body: FacturaInput) {
    return this.facturas.editar(id, body);
  }

  @Post(':id/rectificar')
  rectificar(@Param('id') id: string, @Body(new ZodPipe(rectificarSchema)) body: RectificarInput) {
    return this.facturas.rectificar(id, body);
  }

  @Post(':id/emitir')
  emitir(@Param('id') id: string, @Body('fecha') fecha?: string) {
    return this.facturas.emitir(id, fecha);
  }

  @Delete(':id')
  borrar(@Param('id') id: string) {
    return this.facturas.borrarBorrador(id);
  }

  @Patch(':id/estado')
  async cambiarEstado(@Param('id') id: string, @Body('estado') estado: EstadoFactura) {
    return this.facturas.cambiarEstado(id, estado);
  }
}
