import { BadRequestException, Body, Controller, Get, Headers, Inject, Injectable, Logger, Param, Patch, Post, Put, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Cron } from '@nestjs/schedule';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { SUPABASE } from '../comun/supabase.module';
import { ZodPipe } from '../comun/zod.pipe';
import { ok } from '../comun/db';
import { CorreoService } from '../comun/correo.service';
import { Remitente, remitenteDe } from '../comun/remitente';
import { enviarComoSchema } from '@stella/shared';
import { asuntoRecordatorio } from '../comun/plantilla-correo';
import { Publico } from '../comun/publico.decorator';
import { AvisosTelegramService } from './avisos-telegram.service';

const hoy = () => new Date().toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const euros = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(n);
const fechaLarga = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

const sumarMeses = (fecha: string, meses: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
};

/** «Hola,» → «Hola, Laura:» cuando el cliente tiene una persona de contacto */
const saludar = (texto: string, contacto?: string | null) => (contacto?.trim() ? texto.replace(/^Hola,\s*$/m, `Hola, ${contacto.trim()}:`) : texto);

const correo = z.string().trim().email('Revisa el correo del destinatario');

const enviarFacturaSchema = z.object({
  factura_id: z.string().uuid(),
  para: correo,
  asunto: z.string().trim().min(1, 'Falta el asunto'),
  mensaje: z.string().trim().min(1, 'Falta el mensaje'),
  pdf: z.string().min(100, 'Falta el PDF'),
  nombre_pdf: z.string().min(1),
  como: enviarComoSchema,
});

const recordatorioSchema = z.object({
  factura_id: z.string().uuid(),
  para: correo,
  mensaje: z.string().trim().min(1, 'Falta el mensaje'),
  como: enviarComoSchema,
});

const ajustesSchema = z.object({
  recordatorios_auto: z.boolean(),
  cada_dias: z.coerce.number().int().min(1).max(60),
  texto_recordatorio: z.string().trim().min(10, 'El texto del recordatorio es demasiado corto'),
});


/** Lógica compartida entre la pantalla de cobros y la tarea diaria de recordatorios */
@Injectable()
export class CobrosService {
  private readonly log = new Logger('Recordatorios');

  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly correo: CorreoService,
  ) {}

  async ajustes() {
    return ok(await this.db.from('ajustes_cobros').select('*').eq('id', 1).single());
  }

  /** Rellena {numero}, {total}, {vencimiento}, {iban}, {empresa} y {cliente} */
  async textoRecordatorio(factura: any, plantilla?: string) {
    const [ajustes, empresa] = await Promise.all([
      this.ajustes(),
      this.db.from('empresa').select('nombre, iban').eq('id', 1).single().then((r) => ok(r) as any),
    ]);
    const datos: Record<string, string> = {
      numero: factura.numero,
      total: euros(Number(factura.total)),
      vencimiento: factura.vencimiento ? fechaLarga(factura.vencimiento) : '—',
      iban: empresa.iban ?? '',
      empresa: empresa.nombre,
      cliente: factura.cliente?.nombre ?? '',
    };
    const texto = (plantilla ?? ajustes.texto_recordatorio).replace(/\{(\w+)\}/g, (m: string, k: string) => datos[k] ?? m);
    return saludar(texto, factura.cliente?.contacto);
  }

  async enviarRecordatorio(factura: any, para: string, texto: string, automatico = false, remitente: Remitente | null = null) {
    return this.correo.enviar({
      remitente,
      factura_id: factura.id,
      tipo: 'recordatorio',
      para,
      asunto: asuntoRecordatorio({ ...factura, total: Number(factura.total) }),
      texto,
      automatico,
    });
  }

  /** Todos los días a las 9:00: recordatorio a las facturas vencidas que no lo hayan recibido hace poco */
  @Cron('0 9 * * *', { timeZone: 'Europe/Madrid' })
  async recordatoriosAutomaticos() {
    const ajustes = await this.ajustes();
    if (!ajustes.recordatorios_auto) return { enviados: 0, fallidos: 0, desactivados: true };
    const vencidas = ok(
      await this.db
        .from('facturas')
        .select('id, numero, total, vencimiento, cliente:clientes(nombre, email, contacto), envios(enviado_en)')
        .eq('estado', 'emitida')
        .lt('vencimiento', hoy()),
    ) as any[];
    let enviados = 0;
    let fallidos = 0;
    for (const f of vencidas) {
      if (!f.cliente?.email) continue;
      const ultimo = f.envios.map((e: any) => e.enviado_en.slice(0, 10)).sort().at(-1);
      if (ultimo && diasEntre(ultimo, hoy()) < ajustes.cada_dias) continue;
      try {
        await this.enviarRecordatorio(f, f.cliente.email, await this.textoRecordatorio(f), true);
        enviados++;
      } catch (e: any) {
        fallidos++;
        this.log.error(`No se pudo enviar el recordatorio de ${f.numero}: ${e.message}`);
      }
    }
    if (enviados) this.log.log(`${enviados} recordatorios enviados`);
    return { enviados, fallidos };
  }
}

@Controller('cobros')
export class CobrosController {
  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly cobros: CobrosService,
    private readonly correo: CorreoService,
  ) {}

  @Get()
  async resumen() {
    const [pendientes, ajustes] = await Promise.all([
      this.db
        .from('facturas')
        .select('id, numero, fecha, vencimiento, total, cliente:clientes(id, nombre, email), proyecto:proyectos(id, nombre), envios(tipo, enviado_en, modo, automatico)')
        .eq('estado', 'emitida')
        .order('vencimiento'),
      this.cobros.ajustes(),
    ]);

    const facturas = (ok(pendientes) as any[]).map(({ envios, ...f }) => {
      const ordenados = [...envios].sort((a: any, b: any) => b.enviado_en.localeCompare(a.enviado_en));
      return {
        ...f,
        dias_vencida: f.vencimiento ? diasEntre(f.vencimiento, hoy()) : null,
        recordatorios: envios.filter((e: any) => e.tipo === 'recordatorio').length,
        ultimo_envio: ordenados[0] ?? null,
      };
    });

    return { facturas, ajustes, correo_configurado: this.correo.configurado };
  }

  /** Texto del recordatorio ya relleno, para que la persona lo revise antes de enviarlo */
  @Get('recordatorio/:id')
  async borradorRecordatorio(@Param('id') id: string) {
    const f = ok(await this.db.from('facturas').select('id, numero, total, vencimiento, cliente:clientes(nombre, email, contacto)').eq('id', id).single()) as any;
    return { para: f.cliente?.email ?? '', mensaje: await this.cobros.textoRecordatorio(f) };
  }

  @Post('recordatorio')
  async recordatorio(@Body(new ZodPipe(recordatorioSchema)) body: z.infer<typeof recordatorioSchema>, @Req() req: any) {
    const f = ok(await this.db.from('facturas').select('id, numero, estado, total, vencimiento').eq('id', body.factura_id).single()) as any;
    if (f.estado !== 'emitida') throw new BadRequestException('Esta factura no está pendiente de cobro');
    return this.cobros.enviarRecordatorio(f, body.para, body.mensaje, false, await remitenteDe(this.db, req, body.como));
  }

  @Post('enviar-factura')
  async enviarFactura(@Body(new ZodPipe(enviarFacturaSchema)) body: z.infer<typeof enviarFacturaSchema>, @Req() req: any) {
    const f = ok(await this.db.from('facturas').select('id, estado').eq('id', body.factura_id).single()) as any;
    if (f.estado === 'anulada') throw new BadRequestException('Esta factura está anulada');
    return this.correo.enviar({
      factura_id: f.id,
      tipo: 'factura',
      para: body.para,
      asunto: body.asunto,
      texto: body.mensaje,
      adjunto: { nombre: body.nombre_pdf, base64: body.pdf },
      remitente: await remitenteDe(this.db, req, body.como),
    });
  }

  /** Últimos correos enviados (facturas y recordatorios), del más reciente al más antiguo */
  @Get('envios')
  async historial() {
    return ok(
      await this.db
        .from('envios')
        .select('*, factura:facturas(id, numero, total, periodo, cliente:clientes(nombre))')
        .order('enviado_en', { ascending: false })
        .limit(300),
    );
  }

  @Get('envios/:facturaId')
  async envios(@Param('facturaId') facturaId: string) {
    return ok(await this.db.from('envios').select('*').eq('factura_id', facturaId).order('enviado_en', { ascending: false }));
  }

  /** Correos rebotados o en spam que nadie ha revisado aún */
  @Get('rebotes')
  async rebotes() {
    return ok(
      await this.db
        .from('envios')
        .select('id, para, asunto, estado, motivo, estado_en, enviado_en, factura:facturas(id, numero, cliente:clientes(id, nombre))')
        .in('estado', ['rebotado', 'spam'])
        .eq('revisado', false)
        .order('enviado_en', { ascending: false }),
    );
  }

  @Patch('envios/:id/revisado')
  async revisado(@Param('id') id: string) {
    return ok(await this.db.from('envios').update({ revisado: true }).eq('id', id).select('id').single());
  }

  @Put('ajustes')
  async guardarAjustes(@Body(new ZodPipe(ajustesSchema)) body: z.infer<typeof ajustesSchema>) {
    return ok(await this.db.from('ajustes_cobros').update(body).eq('id', 1).select().single());
  }

}

/**
 * En Vercel no hay un servidor encendido que ejecute el @Cron: Vercel Cron llama a esta
 * ruta cada día con la cabecera «Authorization: Bearer CRON_SECRET».
 */
@Controller('cron')
export class CronController {
  constructor(
    private readonly cobros: CobrosService,
    private readonly config: ConfigService,
    private readonly avisos: AvisosTelegramService,
  ) {}

  /** Una sola llamada diaria (Vercel Hobby limita los cron): recordatorios a clientes y avisos de Telegram */
  @Publico()
  @Get('recordatorios')
  async recordatorios(@Headers('authorization') cabecera?: string) {
    const secreto = this.config.get<string>('CRON_SECRET');
    const recibido = Buffer.from(cabecera ?? '');
    const esperado = Buffer.from(`Bearer ${secreto}`);
    // Sin CRON_SECRET configurado la ruta queda cerrada
    if (!secreto || recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
      throw new UnauthorizedException('No autorizado');
    }
    const recordatorios = await this.cobros.recordatoriosAutomaticos();
    const telegram = await this.avisos.diarios().catch((e) => ({ error: e.message }));
    return { ...recordatorios, telegram };
  }
}
