import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { EmpresaInput, empresaSchema } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ZodPipe } from '../comun/zod.pipe';
import { ok } from '../comun/db';

@Controller('empresa')
export class EmpresaController {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  @Get()
  async ver() {
    const empresa = ok(await this.db.from('empresa').select('*').eq('id', 1).single());
    const proximo = ok(await this.db.rpc('proximo_numero_factura')) as number;
    return { ...empresa, proximo_numero: proximo };
  }

  @Put()
  async guardar(@Body(new ZodPipe(empresaSchema)) body: EmpresaInput) {
    const { proximo_numero, ...datos } = body;
    ok(await this.db.from('empresa').update({ ...datos, updated_at: new Date().toISOString() }).eq('id', 1));
    // Solo se toca el contador si el número ha cambiado de verdad
    if (proximo_numero && proximo_numero !== (ok(await this.db.rpc('proximo_numero_factura')) as number)) {
      ok(await this.db.rpc('fijar_proximo_numero', { p_numero: proximo_numero }));
    }
    return this.ver();
  }
}
