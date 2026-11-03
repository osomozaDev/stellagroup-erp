import { Controller, Get, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE } from '../comun/supabase.module';
import { ok } from '../comun/db';
import { ParaTrabajador, Perfil, PerfilActual } from '../comun/trabajador.decorator';

/** Quién soy y, si soy trabajador, mis datos: proyecto y nóminas */
@Controller('yo')
export class YoController {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  @Get()
  @ParaTrabajador()
  async yo(@PerfilActual() perfil: Perfil) {
    const { data } = await this.db.auth.admin.getUserById(perfil.usuario_id);
    // Nombre para firmar correos: el del empleado vinculado o el guardado en el usuario
    const vinculado = perfil.empleado_id
      ? ((await this.db.from('empleados').select('nombre, apellidos').eq('id', perfil.empleado_id).maybeSingle()).data as any)
      : null;
    const meta = data.user?.user_metadata ?? {};
    const nombre = vinculado ? [vinculado.nombre, vinculado.apellidos].filter(Boolean).join(' ') : (meta.nombre ?? meta.full_name ?? meta.name ?? null);
    const base = { tipo: perfil.tipo, rol: perfil.rol, permisos: perfil.permisos, email: data.user?.email ?? null, nombre };
    if (perfil.tipo !== 'trabajador' || !perfil.empleado_id) return base;

    // Solo los campos que le interesan al trabajador (nada de notas internas)
    const empleado = ok(
      await this.db
        .from('empleados')
        .select(
          'id, nombre, apellidos, puesto, fecha_alta, proyecto:proyectos(nombre, url, cliente:clientes(nombre))',
        )
        .eq('id', perfil.empleado_id)
        .single(),
    );
    const nominas = ok(
      await this.db
        .from('nominas')
        .select('id, periodo, bruto, irpf, ss_trabajador, neto, estado, pagada_en')
        .eq('empleado_id', perfil.empleado_id)
        .order('periodo', { ascending: false })
        .limit(24),
    );
    const empresa = ok(await this.db.from('empresa').select('nombre').eq('id', 1).single());
    return { ...base, empresa: empresa?.nombre ?? '', empleado, nominas };
  }
}
