import { SupabaseClient, User } from '@supabase/supabase-js';
import { EnviarComo } from '@stella/shared';

/** Quién firma un correo cuando no sale como la empresa */
export interface Remitente {
  nombre: string;
  email: string;
}

/**
 * Nombre con el que firma un usuario: el que se ha puesto él mismo, el de su ficha
 * de empleado o el de su cuenta y, si no hay ninguno, la parte del correo antes de la @.
 */
export async function nombreUsuario(db: SupabaseClient, user: Pick<User, 'id' | 'email' | 'user_metadata'>, empleadoId?: string | null) {
  const meta = user.user_metadata ?? {};
  if (meta.nombre) return String(meta.nombre);
  if (empleadoId) {
    const { data } = await db.from('empleados').select('nombre, apellidos').eq('id', empleadoId).maybeSingle();
    if (data) return [data.nombre, data.apellidos].filter(Boolean).join(' ');
  }
  if (meta.full_name ?? meta.name) return String(meta.full_name ?? meta.name);
  const local = (user.email ?? '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  return local ? local.replace(/^./, (x) => x.toUpperCase()) : 'Equipo';
}

/** Remitente de un envío hecho desde la app: null si sale como la empresa */
export async function remitenteDe(db: SupabaseClient, req: { user?: User; perfil?: { empleado_id: string | null } }, como?: EnviarComo): Promise<Remitente | null> {
  if (como !== 'usuario' || !req.user?.email) return null;
  return { nombre: await nombreUsuario(db, req.user, req.perfil?.empleado_id), email: req.user.email };
}
