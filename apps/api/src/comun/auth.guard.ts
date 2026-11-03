import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { puedeAcceder } from '@stella/shared';
import { SUPABASE } from './supabase.module';
import { ES_PUBLICO } from './publico.decorator';
import { PARA_TRABAJADOR } from './trabajador.decorator';
import { cargarPerfil } from './perfil';

/**
 * Comprueba en cada petición quién llama y si su rol le deja hacerlo:
 *  - administrador: todo
 *  - oficina: los módulos de sus permisos (ver puedeAcceder en shared)
 *  - trabajador: solo las rutas @ParaTrabajador, y si sigue en plantilla
 * Un usuario sin perfil no entra.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest();
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Inicia sesión');
    const { data, error } = await this.db.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Sesión caducada');
    req.user = data.user;

    const cargado = await cargarPerfil(this.db, data.user.id).catch(() => {
      throw new UnauthorizedException('No se ha podido comprobar tu acceso');
    });
    if (!cargado) throw new ForbiddenException('Tu usuario no tiene permisos. Pide acceso al administrador.');
    const { perfil, activo } = cargado;
    req.perfil = perfil;

    const paraTrabajador = this.reflector.getAllAndOverride<boolean>(PARA_TRABAJADOR, [context.getHandler(), context.getClass()]);
    if (perfil.tipo === 'trabajador') {
      if (!activo) throw new ForbiddenException('Tu acceso está desactivado. Habla con la oficina.');
      if (!paraTrabajador) throw new ForbiddenException('Tu usuario solo puede ver tus propios datos');
      return true;
    }
    if (perfil.tipo === 'admin' || paraTrabajador) return true;

    const ruta = String(req.originalUrl ?? req.url).replace(/^\/api/, '');
    if (!puedeAcceder(req.method, ruta, perfil.permisos)) throw new ForbiddenException('No tienes permiso para esto. Pídeselo al administrador.');
    return true;
  }
}
