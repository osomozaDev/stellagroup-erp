import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';

/** Convierte errores de Postgres en mensajes comprensibles */
export function ok<T>(res: { data: T; error: PostgrestError | null }): T {
  if (res.error) {
    if (res.error.code === '23503') throw new BadRequestException('No se puede borrar: tiene datos asociados');
    if (res.error.code === '23505') throw new BadRequestException('Ya existe un registro igual');
    if (res.error.code === 'PGRST116') throw new NotFoundException('No encontrado');
    throw new BadRequestException(res.error.message);
  }
  return res.data;
}

/** Quita caracteres con significado en los filtros de PostgREST */
export const busqueda = (q: string) => q.replace(/[,()*%\\]/g, ' ').trim();
