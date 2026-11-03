import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { ClienteInput, clienteSchema } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ZodPipe } from '../comun/zod.pipe';
import { busqueda, ok } from '../comun/db';
import { CorreoService } from '../comun/correo.service';
import { correosPortal, crearEnlacePortal, normalizarEmail } from '../comun/portal';

const portalSchema = z.object({
  activo: z.boolean(),
  emails: z.array(z.string().trim().email('Hay un correo mal escrito')).max(10).default([]),
});

@Controller('clientes')
export class ClientesController {
  private readonly web: string;

  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly correo: CorreoService,
    config: ConfigService,
  ) {
    this.web = (config.get<string>('WEB_URL')?.split(',')[0] ?? 'http://localhost:5183').replace(/\/$/, '');
  }

  @Get()
  async listar(@Query('q') q?: string) {
    let query = this.db
      .from('clientes')
      .select('*, proyectos(id, estado), facturas(total, estado)')
      .order('nombre');
    if (q && (q = busqueda(q))) query = query.or(`nombre.ilike.%${q}%,cif.ilike.%${q}%,ciudad.ilike.%${q}%`);
    const clientes = ok(await query) as any[];
    return clientes.map(({ proyectos, facturas, ...c }) => ({
      ...c,
      proyectos_activos: proyectos.filter((o: any) => o.estado === 'activo').length,
      pendiente: facturas
        .filter((f: any) => f.estado === 'emitida')
        .reduce((s: number, f: any) => s + Number(f.total), 0),
    }));
  }

  @Get(':id')
  async ver(@Param('id') id: string) {
    return ok(
      await this.db
        .from('clientes')
        .select('*, proyectos(*), facturas(id, numero, fecha, vencimiento, total, estado, periodo, proyecto_id), servicios(id, nombre, tipo, precio, periodicidad, proxima_renovacion, estado), presupuestos(id, numero, titulo, total, estado, fecha)')
        .eq('id', id)
        .order('fecha', { referencedTable: 'facturas', ascending: false })
        .single(),
    );
  }

  // ───────────── Portal de clientes ─────────────

  /** Si tiene el portal, quién puede entrar y lo último que ha hecho */
  @Get(':id/portal')
  async portal(@Param('id') id: string) {
    const [cliente, accesos] = await Promise.all([
      this.db.from('clientes').select('email, portal_activo, portal_emails').eq('id', id).single().then((r) => ok(r) as any),
      this.db
        .from('portal_accesos')
        .select('email, accion, cuantas, created_at, factura:facturas(id, numero)')
        .eq('cliente_id', id)
        .order('created_at', { ascending: false })
        .limit(15)
        .then((r) => ok(r) as any[]),
    ]);
    return { activo: cliente.portal_activo, email: cliente.email, emails: cliente.portal_emails, correos: correosPortal(cliente), url: `${this.web}/portal`, accesos };
  }

  @Patch(':id/portal')
  async guardarPortal(@Param('id') id: string, @Body(new ZodPipe(portalSchema)) body: z.infer<typeof portalSchema>) {
    const emails = [...new Set(body.emails.map(normalizarEmail))];
    ok(await this.db.from('clientes').update({ portal_activo: body.activo, portal_emails: emails }).eq('id', id));
    return this.portal(id);
  }

  /** Manda ahora el enlace de entrada a todos los correos autorizados */
  @Post(':id/portal/invitar')
  async invitar(@Param('id') id: string) {
    const c = ok(await this.db.from('clientes').select('id, nombre, email, portal_activo, portal_emails').eq('id', id).single()) as any;
    if (!c.portal_activo) throw new BadRequestException('Activa primero el portal para este cliente');
    const correos = correosPortal(c);
    if (!correos.length) throw new BadRequestException('Este cliente no tiene ningún correo. Añade uno.');
    let modo = 'real';
    // La invitación vale una semana: el cliente puede tardar en verla
    for (const para of correos) modo = (await this.correo.enviarAcceso(para, c.nombre, await crearEnlacePortal(this.db, this.web, c.id, para, 7 * 24 * 60))).modo;
    return { enviados: correos, modo };
  }

  @Post()
  async crear(@Body(new ZodPipe(clienteSchema)) body: ClienteInput) {
    return ok(await this.db.from('clientes').insert(body).select().single());
  }

  @Patch(':id')
  async editar(@Param('id') id: string, @Body(new ZodPipe(clienteSchema)) body: ClienteInput) {
    return ok(await this.db.from('clientes').update(body).eq('id', id).select().single());
  }

  @Delete(':id')
  async borrar(@Param('id') id: string) {
    ok(await this.db.from('clientes').delete().eq('id', id));
    return { ok: true };
  }
}
