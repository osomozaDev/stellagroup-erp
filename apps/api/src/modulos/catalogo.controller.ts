import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CatalogoInput, catalogoSchema } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ZodPipe } from '../comun/zod.pipe';
import { busqueda, ok } from '../comun/db';

/** Productos y servicios con su precio, para añadirlos a los presupuestos */
@Controller('catalogo')
export class CatalogoController {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  @Get()
  async listar(@Query('q') q?: string, @Query('todos') todos?: string) {
    // Dentro de cada categoría, de más barato a más caro (Básico, Estándar, Avanzado…)
    let query = this.db.from('catalogo').select('*').order('categoria', { nullsFirst: false }).order('precio').order('nombre');
    if (todos !== '1') query = query.eq('activo', true);
    if (q && (q = busqueda(q))) query = query.or(`nombre.ilike.%${q}%,descripcion.ilike.%${q}%,categoria.ilike.%${q}%`);
    return ok(await query);
  }

  @Post()
  async crear(@Body(new ZodPipe(catalogoSchema)) body: CatalogoInput) {
    return ok(await this.db.from('catalogo').insert(body).select().single());
  }

  @Put(':id')
  async editar(@Param('id') id: string, @Body(new ZodPipe(catalogoSchema)) body: CatalogoInput) {
    return ok(await this.db.from('catalogo').update({ ...body, updated_at: new Date().toISOString() }).eq('id', id).select().single());
  }

  /** Los presupuestos guardan su propia copia de cada línea: borrar del catálogo no les afecta */
  @Delete(':id')
  async borrar(@Param('id') id: string) {
    ok(await this.db.from('catalogo').delete().eq('id', id));
    return { ok: true };
  }
}
