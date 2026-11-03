import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { EmpleadoInput, empleadoSchema } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ZodPipe } from '../comun/zod.pipe';
import { busqueda, ok } from '../comun/db';

@Controller('empleados')
export class EmpleadosController {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  @Get()
  async listar(@Query('q') q?: string, @Query('activos') activos?: string) {
    let query = this.db.from('empleados').select('*, proyecto:proyectos(id, nombre)').order('nombre');
    if (activos === '1') query = query.eq('activo', true);
    if (q && (q = busqueda(q))) query = query.or(`nombre.ilike.%${q}%,apellidos.ilike.%${q}%,dni.ilike.%${q}%,puesto.ilike.%${q}%`);
    return ok(await query);
  }

  @Get(':id')
  async ver(@Param('id') id: string) {
    const empleado = ok(
      await this.db
        .from('empleados')
        .select('*, proyecto:proyectos(id, nombre), nominas(*)')
        .eq('id', id)
        .order('periodo', { referencedTable: 'nominas', ascending: false })
        .single(),
    );
    return { ...empleado, acceso: await this.acceso(id) };
  }

  /** Usuario de la app vinculado a este empleado, si tiene (se gestiona en /usuarios) */
  private async acceso(empleadoId: string) {
    const perfil = ok(
      await this.db.from('perfiles').select('usuario_id, rol:roles(id, nombre, tipo)').eq('empleado_id', empleadoId).maybeSingle(),
    ) as { usuario_id: string; rol: { id: string; nombre: string; tipo: string } } | null;
    if (!perfil) return null;
    const { data } = await this.db.auth.admin.getUserById(perfil.usuario_id);
    return {
      usuario_id: perfil.usuario_id,
      email: data.user?.email ?? null,
      ultimo_acceso: data.user?.last_sign_in_at ?? null,
      rol: perfil.rol,
    };
  }

  @Post()
  async crear(@Body(new ZodPipe(empleadoSchema)) body: EmpleadoInput) {
    return ok(await this.db.from('empleados').insert(body).select().single());
  }

  @Patch(':id')
  async editar(@Param('id') id: string, @Body(new ZodPipe(empleadoSchema)) body: EmpleadoInput) {
    return ok(await this.db.from('empleados').update(body).eq('id', id).select().single());
  }

  @Delete(':id')
  async borrar(@Param('id') id: string) {
    // Un trabajador sin ficha no sirve de nada: se borra su usuario. Si es de oficina,
    // la base de datos solo lo desvincula y conserva su acceso.
    const acceso = await this.acceso(id);
    if (acceso?.rol.tipo === 'trabajador') await this.db.auth.admin.deleteUser(acceso.usuario_id);
    ok(await this.db.from('empleados').delete().eq('id', id));
    return { ok: true };
  }
}
