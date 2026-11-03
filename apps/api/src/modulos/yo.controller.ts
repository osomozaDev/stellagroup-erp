import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE } from '../comun/supabase.module';
import { ok } from '../comun/db';
import { ParaTrabajador, Perfil, PerfilActual } from '../comun/trabajador.decorator';
import { ZodPipe } from '../comun/zod.pipe';
import { nombreUsuario } from '../comun/remitente';
import { nombreUsuarioSchema } from '@stella/shared';

/** Quién soy y, si soy trabajador, mis datos: proyecto y nóminas */
@Controller('yo')
export class YoController {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  /** Cambia el nombre con el que firmo los correos que envío como usuario */
  @Patch('nombre')
  @ParaTrabajador()
  async cambiarNombre(@PerfilActual() perfil: Perfil, @Body(new ZodPipe(nombreUsuarioSchema)) body: { nombre: string }) {
    const { data } = await this.db.auth.admin.getUserById(perfil.usuario_id);
    const { error } = await this.db.auth.admin.updateUserById(perfil.usuario_id, { user_metadata: { ...(data.user?.user_metadata ?? {}), nombre: body.nombre } });
    if (error) throw error;
    return { nombre: body.nombre };
  }

  @Get()
  @ParaTrabajador()
  async yo(@PerfilActual() perfil: Perfil) {
    const { data } = await this.db.auth.admin.getUserById(perfil.usuario_id);
    // Nombre para firmar correos: el que se ha puesto, el del empleado vinculado o el de la cuenta
    const nombre = data.user ? await nombreUsuario(this.db, data.user, perfil.empleado_id) : null;
    const nombre_propio = !!data.user?.user_metadata?.nombre;
    const base = { tipo: perfil.tipo, rol: perfil.rol, permisos: perfil.permisos, email: data.user?.email ?? null, nombre, nombre_propio };
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
