import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, NotFoundException, Param, Post, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Response } from 'express';
import { createHmac } from 'node:crypto';
import { zipSync } from 'fflate';
import { z } from 'zod';
import { SUPABASE } from '../comun/supabase.module';
import { ok } from '../comun/db';
import { Publico } from '../comun/publico.decorator';
import { ZodPipe } from '../comun/zod.pipe';
import { CorreoService } from '../comun/correo.service';
import { canjearCodigoPortal, correosPortal, crearEnlacePortal, firmarSesionPortal, leerSesionPortal, normalizarEmail, SesionPortal } from '../comun/portal';
import { EnvioFacturaService } from './envio-factura.service';

const MAX_ZIP = 50;
const enlaceSchema = z.object({ email: z.string().trim().email('Escribe un correo válido') });
const zipSchema = z.object({ ids: z.array(z.string().uuid()).min(1, 'Elige alguna factura').max(MAX_ZIP, `Como mucho ${MAX_ZIP} facturas a la vez`) });

/**
 * Portal de clientes: todo es público para el AuthGuard (los clientes no son usuarios
 * de la app) y cada ruta comprueba su propia sesión firmada, que solo da acceso a
 * las facturas emitidas de ese cliente.
 */
@Publico()
@Controller('portal')
export class PortalClientesController {
  private readonly secreto: string;
  private readonly web: string;

  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly correo: CorreoService,
    private readonly envio: EnvioFacturaService,
    config: ConfigService,
  ) {
    this.secreto = clavePortal(config.get<string>('SUPABASE_SERVICE_ROLE_KEY'));
    this.web = (config.get<string>('WEB_URL')?.split(',')[0] ?? 'http://localhost:5183').replace(/\/$/, '');
  }

  /** Sesión válida y cliente que sigue teniendo el portal activo con ese correo */
  private async sesion(autorizacion?: string): Promise<SesionPortal & { cliente: any }> {
    const s = leerSesionPortal(this.secreto, autorizacion?.replace(/^Portal\s+/i, ''));
    if (!s) throw new UnauthorizedException('Tu acceso ha caducado. Pide un enlace nuevo.');
    const cliente = ok(await this.db.from('clientes').select('id, nombre, cif, email, portal_activo, portal_emails').eq('id', s.cliente_id).maybeSingle()) as any;
    if (!cliente?.portal_activo || !correosPortal(cliente).includes(s.email)) throw new UnauthorizedException('Este correo ya no tiene acceso. Habla con nosotros.');
    return { ...s, cliente };
  }

  private registrar(s: SesionPortal, accion: 'entrada' | 'descarga' | 'zip', extra: { factura_id?: string; cuantas?: number } = {}) {
    return this.db.from('portal_accesos').insert({ cliente_id: s.cliente_id, email: s.email, accion, ...extra });
  }

  /**
   * Pide un enlace de entrada. Contesta siempre lo mismo, exista o no el correo,
   * para que nadie pueda averiguar quién es cliente.
   */
  @Post('enlace')
  @HttpCode(200)
  async enlace(@Body(new ZodPipe(enlaceSchema)) { email }: z.infer<typeof enlaceSchema>) {
    const correo = normalizarEmail(email);
    const respuesta = { ok: true, mensaje: 'Si ese correo tiene acceso, te acabamos de enviar un enlace para entrar. Revisa también la carpeta de spam.' };
    // Como mucho 3 enlaces por correo cada 15 minutos
    const { count } = await this.db
      .from('portal_enlaces')
      .select('id', { count: 'exact', head: true })
      .eq('email', correo)
      .gt('created_at', new Date(Date.now() - 15 * 60e3).toISOString());
    if ((count ?? 0) >= 3) return respuesta;

    const clientes = (ok(await this.db.from('clientes').select('id, nombre, email, portal_emails').eq('portal_activo', true)) ?? []) as any[];
    for (const c of clientes.filter((c) => correosPortal(c).includes(correo))) {
      const url = await crearEnlacePortal(this.db, this.web, c.id, correo, 60);
      // Si falla el envío se contesta igual: el error queda en el registro del servidor
      await this.correo.enviarAcceso(correo, c.nombre, url).catch(() => undefined);
    }
    return respuesta;
  }

  /** Canjea el código del enlace por una sesión de 30 días */
  @Post('entrar')
  @HttpCode(200)
  async entrar(@Body('codigo') codigo?: string) {
    if (!codigo) throw new BadRequestException('Falta el código');
    const fila = await canjearCodigoPortal(this.db, codigo);
    if (!fila) throw new UnauthorizedException('Este enlace ya se ha usado o ha caducado. Pide uno nuevo.');
    const token = firmarSesionPortal(this.secreto, fila.cliente_id, fila.email);
    const s = await this.sesion(`Portal ${token}`);
    await this.registrar(s, 'entrada');
    return { token };
  }

  @Get()
  async datos(@Headers('authorization') autorizacion?: string) {
    const s = await this.sesion(autorizacion);
    const [facturas, empresa] = await Promise.all([
      this.db
        .from('facturas')
        .select('id, numero, fecha, vencimiento, total, estado, cobrada_en, rectifica_id, proyecto:proyectos(nombre)')
        .eq('cliente_id', s.cliente_id)
        .in('estado', ['emitida', 'cobrada', 'anulada'])
        .not('numero', 'is', null)
        .order('fecha', { ascending: false })
        .order('numero', { ascending: false }),
      this.db.from('empresa').select('nombre, email, telefono, iban, logo, color').eq('id', 1).single(),
    ]);
    return {
      cliente: { nombre: s.cliente.nombre, cif: s.cliente.cif },
      email: s.email,
      empresa: ok(empresa),
      facturas: (ok(facturas) as any[]).map((f) => ({ ...f, total: Number(f.total) })),
    };
  }

  private async facturaDelCliente(s: SesionPortal, id: string) {
    const f = ok(await this.db.from('facturas').select('id, cliente_id, estado, numero').eq('id', id).maybeSingle()) as any;
    if (!f || f.cliente_id !== s.cliente_id || !f.numero || f.estado === 'borrador') throw new NotFoundException('No encontramos esa factura');
    return f;
  }

  @Get('facturas/:id/pdf')
  async pdf(@Param('id') id: string, @Headers('authorization') autorizacion: string | undefined, @Res() res: Response) {
    const s = await this.sesion(autorizacion);
    await this.facturaDelCliente(s, id);
    const { pdf, nombre } = await this.envio.pdf(id);
    await this.registrar(s, 'descarga', { factura_id: id });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`);
    res.send(pdf);
  }

  /** Varias facturas en un ZIP (para pasárselas a la gestoría) */
  @Post('zip')
  async zip(@Body(new ZodPipe(zipSchema)) { ids }: z.infer<typeof zipSchema>, @Headers('authorization') autorizacion: string | undefined, @Res() res: Response) {
    const s = await this.sesion(autorizacion);
    for (const id of ids) await this.facturaDelCliente(s, id);
    const archivos: Record<string, Uint8Array> = {};
    // De 4 en 4 para no tardar demasiado sin saturar el servidor
    for (let i = 0; i < ids.length; i += 4) {
      const hechos = await Promise.all(ids.slice(i, i + 4).map((id) => this.envio.pdf(id)));
      for (const { pdf, nombre } of hechos) archivos[nombre.replace(/[\\/:*?"<>|]/g, '')] = new Uint8Array(pdf);
    }
    await this.registrar(s, 'zip', { cuantas: ids.length });
    const nombre = `Facturas ${s.cliente.nombre.replace(/\.+$/, '')}.zip`.replace(/[\\/:*?"<>|]/g, '');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`);
    res.send(Buffer.from(zipSync(archivos, { level: 0 })));
  }
}

/** Clave propia del portal, sacada de la clave de servicio (así no hace falta otra variable) */
export function clavePortal(base?: string) {
  if (!base) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
  return createHmac('sha256', base).update('portal-clientes').digest('hex');
}
