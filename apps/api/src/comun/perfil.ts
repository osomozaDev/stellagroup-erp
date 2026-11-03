import { SupabaseClient } from '@supabase/supabase-js';
import { TODOS_LOS_PERMISOS } from '@stella/shared';
import { Perfil } from './trabajador.decorator';

/**
 * Rol y permisos efectivos de un usuario (null si no tiene perfil). Lo usan el
 * AuthGuard y el bot de Telegram, que actúa en nombre de quien conectó el chat.
 */
export async function cargarPerfil(db: SupabaseClient, usuarioId: string) {
  const { data: fila, error } = await db
    .from('perfiles')
    .select('empleado_id, permisos, rol:roles(nombre, tipo, permisos), empleado:empleados(activo)')
    .eq('usuario_id', usuarioId)
    .maybeSingle();
  if (error) throw new Error('No se ha podido comprobar tu acceso');
  const rol = fila?.rol as unknown as { nombre: string; tipo: Perfil['tipo']; permisos: string[] } | null;
  if (!fila || !rol) return null;
  const perfil: Perfil = {
    usuario_id: usuarioId,
    tipo: rol.tipo,
    rol: rol.nombre,
    permisos: rol.tipo === 'admin' ? [...TODOS_LOS_PERMISOS, 'usuarios'] : rol.tipo === 'trabajador' ? [] : (fila.permisos ?? rol.permisos),
    empleado_id: fila.empleado_id,
  };
  return { perfil, activo: !!(fila.empleado as { activo?: boolean } | null)?.activo };
}
