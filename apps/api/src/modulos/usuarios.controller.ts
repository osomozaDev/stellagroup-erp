import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { SupabaseClient, User } from '@supabase/supabase-js';
import {
  contrasenaSchema,
  RolInput,
  rolSchema,
  UsuarioCrearInput,
  usuarioCrearSchema,
  UsuarioEditarInput,
  usuarioEditarSchema,
} from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ZodPipe } from '../comun/zod.pipe';
import { ok } from '../comun/db';
import { TelegramService } from '../comun/telegram.service';
import { Perfil, PerfilActual } from '../comun/trabajador.decorator';

type Rol = { id: string; nombre: string; tipo: 'admin' | 'oficina' | 'trabajador'; permisos: string[]; sistema: boolean };

/** Usuarios de la app y sus roles. Solo para administradores (permiso «usuarios»). */
@Controller()
export class UsuariosController {
  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly telegram: TelegramService,
  ) {}

  private async todosLosUsuarios() {
    const usuarios: User[] = [];
    for (let page = 1; ; page++) {
      const { data, error } = await this.db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new BadRequestException(error.message);
      usuarios.push(...data.users);
      if (data.users.length < 200) return usuarios;
    }
  }

  private async rol(id: string): Promise<Rol> {
    const rol = ok(await this.db.from('roles').select('*').eq('id', id).maybeSingle()) as Rol | null;
    if (!rol) throw new BadRequestException('Ese rol no existe');
    return rol;
  }

  /** Comprueba que el cambio deja la combinación de rol y empleado en un estado válido */
  private async validar(rol: Rol, empleadoId: string | null, usuarioId?: string) {
    if (rol.tipo === 'trabajador' && !empleadoId) throw new BadRequestException('Un trabajador tiene que estar vinculado a su ficha de empleado');
    if (!empleadoId) return;
    const empleado = ok(await this.db.from('empleados').select('nombre, activo').eq('id', empleadoId).maybeSingle());
    if (!empleado) throw new BadRequestException('Esa ficha de empleado no existe');
    if (rol.tipo === 'trabajador' && !empleado.activo) throw new BadRequestException(`${empleado.nombre} está de baja: no puede tener acceso de trabajador`);
    const otro = ok(await this.db.from('perfiles').select('usuario_id').eq('empleado_id', empleadoId).maybeSingle());
    if (otro && otro.usuario_id !== usuarioId) throw new BadRequestException(`${empleado.nombre} ya está vinculado a otro usuario`);
  }

  /** Que nunca se quede la empresa sin nadie que pueda gestionar usuarios */
  private async noQuitarUltimoAdmin(usuarioId: string) {
    const admins = ok(await this.db.from('perfiles').select('usuario_id, rol:roles!inner(tipo)').eq('rol.tipo', 'admin')) as any[];
    if (admins.length === 1 && admins[0].usuario_id === usuarioId) {
      throw new BadRequestException('Es el único administrador: antes nombra a otro administrador');
    }
  }

  // ───────────── Usuarios ─────────────

  @Get('usuarios')
  async listar(@PerfilActual() yo: Perfil) {
    const [usuarios, perfiles] = await Promise.all([
      this.todosLosUsuarios(),
      this.db.from('perfiles').select('usuario_id, permisos, rol:roles(id, nombre, tipo, permisos), empleado:empleados(id, nombre, apellidos, puesto)'),
    ]);
    const porId = new Map((ok(perfiles) as any[]).map((p) => [p.usuario_id, p]));
    return usuarios
      .map((u) => {
        const p = porId.get(u.id);
        return {
          id: u.id,
          email: u.email,
          creado: u.created_at,
          ultimo_acceso: u.last_sign_in_at ?? null,
          rol: p?.rol ?? null,
          permisos: p?.permisos ?? null,
          empleado: p?.empleado ?? null,
          soy_yo: u.id === yo.usuario_id,
        };
      })
      .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''));
  }

  @Post('usuarios')
  async crear(@Body(new ZodPipe(usuarioCrearSchema)) body: UsuarioCrearInput) {
    const rol = await this.rol(body.rol_id);
    await this.validar(rol, body.empleado_id);
    const yaExiste = (await this.todosLosUsuarios()).some((u) => u.email?.toLowerCase() === body.email);
    if (yaExiste) throw new BadRequestException('Ya hay un usuario con ese email');

    const { data, error } = await this.db.auth.admin.createUser({ email: body.email, password: body.password, email_confirm: true });
    if (error || !data.user) throw new BadRequestException(error?.message ?? 'No se ha podido crear el usuario');
    const { error: errorPerfil } = await this.db.from('perfiles').insert({
      usuario_id: data.user.id,
      rol_id: rol.id,
      empleado_id: body.empleado_id,
      permisos: rol.tipo === 'oficina' ? body.permisos : null,
    });
    if (errorPerfil) {
      await this.db.auth.admin.deleteUser(data.user.id);
      throw new BadRequestException('No se ha podido guardar el rol del usuario');
    }
    return { id: data.user.id, email: data.user.email };
  }

  @Patch('usuarios/:id')
  async editar(@Param('id') id: string, @Body(new ZodPipe(usuarioEditarSchema)) body: UsuarioEditarInput) {
    const rol = await this.rol(body.rol_id);
    if (rol.tipo !== 'admin') await this.noQuitarUltimoAdmin(id);
    await this.validar(rol, body.empleado_id, id);
    ok(
      await this.db.from('perfiles').upsert({
        usuario_id: id,
        rol_id: rol.id,
        empleado_id: body.empleado_id,
        permisos: rol.tipo === 'oficina' ? body.permisos : null,
      }),
    );
    return { ok: true };
  }

  @Post('usuarios/:id/contrasena')
  async contrasena(@Param('id') id: string, @Body(new ZodPipe(contrasenaSchema)) body: { password: string }) {
    const { error } = await this.db.auth.admin.updateUserById(id, { password: body.password });
    if (error) throw new BadRequestException(error.message);
    return { ok: true };
  }

  /** Telegram de un usuario: si está conectado y, si no, un enlace para mandárselo */
  @Get('usuarios/:id/telegram')
  async telegramDe(@Param('id') id: string) {
    const chat = ok(await this.db.from('telegram_chats').select('chat_id, nombre, vinculado_en, codigo, codigo_caduca').eq('usuario_id', id).maybeSingle());
    const pendiente = !!chat?.codigo && Date.parse(chat.codigo_caduca) > Date.now();
    return {
      configurado: this.telegram.configurado,
      conectado: !!chat?.chat_id,
      nombre: chat?.nombre ?? null,
      vinculado_en: chat?.vinculado_en ?? null,
      enlace_caduca: pendiente ? chat!.codigo_caduca : null,
    };
  }

  @Post('usuarios/:id/telegram')
  async enlaceTelegram(@Param('id') id: string) {
    return this.telegram.crearEnlace(id, 7 * 24 * 60);
  }

  @Delete('usuarios/:id/telegram')
  async desconectarTelegram(@Param('id') id: string) {
    const chat = ok(await this.db.from('telegram_chats').select('chat_id').eq('usuario_id', id).maybeSingle());
    ok(await this.db.from('telegram_chats').delete().eq('usuario_id', id));
    if (chat?.chat_id) await this.telegram.enviar(chat.chat_id, 'Te han desconectado de Stella ERP. Ya no te llegarán avisos.').catch(() => undefined);
    return { ok: true };
  }

  @Delete('usuarios/:id')
  async borrar(@Param('id') id: string, @PerfilActual() yo: Perfil) {
    if (id === yo.usuario_id) throw new BadRequestException('No puedes borrar tu propio usuario');
    await this.noQuitarUltimoAdmin(id);
    const { error } = await this.db.auth.admin.deleteUser(id); // el perfil se borra con él
    if (error) throw new BadRequestException(error.message);
    return { ok: true };
  }

  // ───────────── Roles ─────────────

  @Get('roles')
  async roles() {
    const roles = ok(await this.db.from('roles').select('*, perfiles(count)').order('created_at')) as any[];
    return roles.map(({ perfiles, ...r }) => ({ ...r, usuarios: perfiles?.[0]?.count ?? 0 }));
  }

  @Post('roles')
  async crearRol(@Body(new ZodPipe(rolSchema)) body: RolInput) {
    return ok(await this.db.from('roles').insert({ nombre: body.nombre, tipo: 'oficina', permisos: body.permisos }).select().single());
  }

  @Patch('roles/:id')
  async editarRol(@Param('id') id: string, @Body(new ZodPipe(rolSchema)) body: RolInput) {
    const rol = await this.rol(id);
    if (rol.tipo !== 'oficina') throw new BadRequestException(`Los permisos de «${rol.nombre}» son fijos`);
    const cambios = rol.sistema ? { permisos: body.permisos } : { nombre: body.nombre, permisos: body.permisos };
    return ok(await this.db.from('roles').update(cambios).eq('id', id).select().single());
  }

  @Delete('roles/:id')
  async borrarRol(@Param('id') id: string) {
    const rol = await this.rol(id);
    if (rol.sistema) throw new BadRequestException(`El rol «${rol.nombre}» no se puede borrar`);
    const { count } = await this.db.from('perfiles').select('usuario_id', { count: 'exact', head: true }).eq('rol_id', id);
    if (count) throw new BadRequestException('Hay usuarios con este rol: cámbiales el rol antes de borrarlo');
    ok(await this.db.from('roles').delete().eq('id', id));
    return { ok: true };
  }
}
