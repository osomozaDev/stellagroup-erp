import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const PARA_TRABAJADOR = 'para_trabajador';

/**
 * Ruta que también pueden usar los trabajadores (siempre sobre sus propios datos).
 * Sin esta marca, la API rechaza a cualquier usuario con rol «trabajador».
 */
export const ParaTrabajador = () => SetMetadata(PARA_TRABAJADOR, true);

export interface Perfil {
  usuario_id: string;
  tipo: 'admin' | 'oficina' | 'trabajador';
  rol: string;
  /** Permisos efectivos: los personalizados del usuario o, si no tiene, los de su rol */
  permisos: string[];
  empleado_id: string | null;
}

/** Perfil de quien hace la petición (lo pone el AuthGuard) */
export const PerfilActual = createParamDecorator((_: unknown, ctx: ExecutionContext): Perfil => ctx.switchToHttp().getRequest().perfil);
