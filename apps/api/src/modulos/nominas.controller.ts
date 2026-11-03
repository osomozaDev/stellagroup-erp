import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { calcularNomina, generarNominasSchema, primerDiaMes } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ZodPipe } from '../comun/zod.pipe';
import { ok } from '../comun/db';

@Controller('nominas')
export class NominasController {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  @Get()
  async listar(@Query('periodo') periodo?: string) {
    let query = this.db
      .from('nominas')
      .select('*, empleado:empleados(id, nombre, apellidos, puesto, iban)')
      .order('periodo', { ascending: false });
    if (periodo) query = query.eq('periodo', primerDiaMes(periodo));
    return ok(await query);
  }

  /** Crea las nóminas del mes para todos los empleados activos que aún no la tengan */
  @Post('generar')
  async generar(@Body(new ZodPipe(generarNominasSchema)) body: { periodo: string }) {
    const periodo = primerDiaMes(body.periodo);
    const empresa = ok(await this.db.from('empresa').select('*').eq('id', 1).single());
    const empleados = ok(await this.db.from('empleados').select('*').eq('activo', true)) as any[];
    const existentes = ok(await this.db.from('nominas').select('empleado_id').eq('periodo', periodo)) as any[];
    const nuevas = empleados
      .filter((e) => !existentes.some((n) => n.empleado_id === e.id))
      .filter((e) => Number(e.salario_bruto_anual) > 0)
      .map((e) => ({
        empleado_id: e.id,
        periodo,
        ...calcularNomina(
          Number(e.salario_bruto_anual),
          e.pagas,
          Number(e.irpf_pct),
          periodo,
          Number(empresa.ss_trabajador_pct),
          Number(empresa.ss_empresa_pct),
        ),
      }));
    if (nuevas.length) ok(await this.db.from('nominas').insert(nuevas));
    return { creadas: nuevas.length };
  }

  @Patch(':id/estado')
  async cambiarEstado(@Param('id') id: string, @Body('estado') estado: string) {
    if (estado !== 'pendiente' && estado !== 'pagada') throw new BadRequestException('Estado no válido');
    const pagada_en = estado === 'pagada' ? new Date().toISOString().slice(0, 10) : null;
    return ok(await this.db.from('nominas').update({ estado, pagada_en }).eq('id', id).select().single());
  }

  @Delete(':id')
  async borrar(@Param('id') id: string) {
    ok(await this.db.from('nominas').delete().eq('id', id));
    return { ok: true };
  }
}
