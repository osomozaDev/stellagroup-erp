import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { DemoListaInput, instanteMadrid, SolicitudDemoInput } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ok } from '../comun/db';
import { fechaCorta, hoyMadrid } from '../comun/fechas';
import { CorreoService } from '../comun/correo.service';
import { Botones, html, TelegramService } from '../comun/telegram.service';

const CERRADAS = ['ganado', 'perdido'];
const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const conQuien = (o: any) => o.cliente?.nombre ?? o.contacto_empresa ?? o.contacto_nombre ?? '';

/**
 * El camino de la demo dentro de la oportunidad: la comercial la solicita, llega como
 * tarea a los administradores y, cuando está lista, le vuelve a ella con la URL.
 * Avisa por Telegram y, a quien no lo tenga conectado, por correo.
 */
@Injectable()
export class DemosService {
  private readonly log = new Logger('Demos');

  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly telegram: TelegramService,
    private readonly correo: CorreoService,
  ) {}

  private async cargar(id: string) {
    return ok(await this.db.from('oportunidades').select('*, cliente:clientes(nombre)').eq('id', id).single()) as any;
  }

  private async administradores(): Promise<string[]> {
    const filas = (ok(await this.db.from('perfiles').select('usuario_id, rol:roles!inner(tipo)').eq('rol.tipo', 'admin')) ?? []) as any[];
    return filas.map((f) => f.usuario_id);
  }

  /** Nombre de un usuario: su ficha de empleado, el de su Telegram o, si no, su correo */
  async nombreDe(usuarioId?: string | null) {
    if (!usuarioId) return null;
    const [perfil, chat, usuario] = await Promise.all([
      this.db.from('perfiles').select('empleado:empleados(nombre, apellidos)').eq('usuario_id', usuarioId).maybeSingle(),
      this.db.from('telegram_chats').select('nombre').eq('usuario_id', usuarioId).maybeSingle(),
      this.db.auth.admin.getUserById(usuarioId),
    ]);
    const empleado = (perfil.data as any)?.empleado;
    return empleado?.nombre ?? chat.data?.nombre ?? usuario.data.user?.email ?? null;
  }

  /** Un fallo al avisar no deshace la solicitud: se anota y se sigue con el siguiente */
  private async avisar(usuarios: string[], aviso: { texto: string; botones: Botones; asunto: string; parrafos: string[]; destacado?: string; boton: { texto: string; url: string } }) {
    if (!usuarios.length) return;
    const chats = (ok(await this.db.from('telegram_chats').select('usuario_id, chat_id').in('usuario_id', usuarios).not('chat_id', 'is', null)) ?? []) as any[];
    await Promise.all(
      usuarios.map(async (u) => {
        try {
          const chat = this.telegram.configurado ? chats.find((c) => c.usuario_id === u) : null;
          if (chat) return await this.telegram.enviar(chat.chat_id, aviso.texto, aviso.botones);
          const email = (await this.db.auth.admin.getUserById(u)).data.user?.email;
          if (email) return await this.correo.enviarSimple({ para: email, asunto: aviso.asunto, parrafos: aviso.parrafos, destacado: aviso.destacado, boton: aviso.boton });
        } catch (e: any) {
          this.log.error(`No se ha podido avisar a ${u}: ${e.message}`);
        }
      }),
    );
  }

  /** Solicita la demo: guarda los datos, crea la tarea en la agenda y avisa a los administradores */
  async solicitar(id: string, body: SolicitudDemoInput, usuarioId: string) {
    const o = await this.cargar(id);
    if (CERRADAS.includes(o.etapa)) throw new BadRequestException('Esta oportunidad ya está cerrada');
    if (o.etapa === 'demo_solicitada') throw new BadRequestException('La demo ya está solicitada');
    const para = body.demo_para ?? sumarDias(hoyMadrid(), 2);
    const quien = conQuien(o);
    const asignados = (await this.administradores()).filter((u) => u !== usuarioId);
    const destinatarios = asignados.length ? asignados : [usuarioId];
    const evento = ok(
      await this.db
        .from('eventos')
        .insert({ titulo: `Hacer demo: ${quien}`, tipo: 'tarea', inicio: instanteMadrid(para), todo_el_dia: true, descripcion: `Sector: ${body.sector}\n\n${body.requisitos}`, oportunidad_id: id, cliente_id: o.cliente_id })
        .select('id')
        .single(),
    ) as any;
    const ahora = new Date().toISOString();
    ok(
      await this.db
        .from('oportunidades')
        .update({ sector: body.sector, requisitos: body.requisitos, demo_para: para, etapa: 'demo_solicitada', demo_solicitada_en: ahora, demo_solicitada_por: usuarioId, demo_asignados: destinatarios, demo_evento_id: evento.id, demo_url: null, demo_nota: null, demo_lista_en: null, updated_at: ahora })
        .eq('id', id),
    );
    const pide = (await this.nombreDe(usuarioId)) ?? 'Comercial';
    await this.avisar(destinatarios, {
      texto: [`🎬 <b>Nueva solicitud de demo</b> #${o.numero}`, '', `<b>${html(quien)}</b>`, `Sector: ${html(body.sector)}`, `Pide: ${html(pide)} · Para el ${fechaCorta(para)}`, '', '<b>Qué hay que crear</b>', html(body.requisitos.slice(0, 3000))].join('\n'),
      botones: [[{ text: '✅ Demo lista', callback_data: `odl:${id}` }], [this.telegram.abrir('Abrir oportunidad', `/crm/${id}`)]],
      asunto: `Nueva solicitud de demo: ${quien}`,
      parrafos: [`${pide} ha solicitado una demo para ${quien}, del sector ${body.sector}. La necesita para el ${fechaCorta(para)}.`, 'Cuando esté lista, abre la oportunidad y escribe su URL: le llegará directamente.'],
      destacado: body.requisitos.slice(0, 1500),
      boton: { texto: 'Abrir oportunidad', url: `${this.telegram.web}/crm/${id}` },
    });
    return { ok: true, avisados: destinatarios.length };
  }

  /** Demo hecha: guarda la URL, cierra la tarea y se la pasa a quien la pidió */
  async marcarLista(id: string, body: DemoListaInput, usuarioId: string) {
    const o = await this.cargar(id);
    if (CERRADAS.includes(o.etapa)) throw new BadRequestException('Esta oportunidad ya está cerrada');
    const ahora = new Date().toISOString();
    // Si ya va más adelante en el embudo (una URL corregida), se queda donde está
    const etapa = ['nuevo', 'demo_solicitada'].includes(o.etapa) ? 'demo_lista' : o.etapa;
    ok(await this.db.from('oportunidades').update({ demo_url: body.url, demo_nota: body.nota, demo_lista_en: o.demo_lista_en ?? ahora, etapa, updated_at: ahora }).eq('id', id));
    if (o.demo_evento_id) ok(await this.db.from('eventos').update({ completado_en: ahora }).eq('id', o.demo_evento_id).is('completado_en', null));
    const quien = conQuien(o);
    const comercial = o.demo_solicitada_por && o.demo_solicitada_por !== usuarioId ? [o.demo_solicitada_por] : [];
    await this.avisar(comercial, {
      texto: [`🎉 <b>Demo lista</b> · ${html(quien)}`, '', `🔗 ${html(body.url)}`, ...(body.nota ? ['', html(body.nota)] : []), '', 'Siguiente paso: presentarla al cliente.'].join('\n'),
      botones: [[{ text: '🌐 Abrir demo', url: body.url }], [{ text: 'Pasar a reunión de cierre', callback_data: `oe:${id}:reunion_cierre` }], [{ text: '🎯 Ver oportunidad', callback_data: `oo:${id}` }]],
      asunto: `Demo lista: ${quien}`,
      parrafos: [`La demo de ${quien} ya está lista. El siguiente paso es presentarla al cliente.`, ...(body.nota ? [body.nota] : [])],
      boton: { texto: 'Abrir demo', url: body.url },
    });
    return { ok: true };
  }

  /** Demos solicitadas que aún no están hechas, la más urgente primero */
  async pendientes() {
    return (ok(await this.db.from('oportunidades').select('id, numero, titulo, sector, demo_para, contacto_empresa, contacto_nombre, cliente:clientes(nombre)').eq('etapa', 'demo_solicitada').order('demo_para')) ?? []) as any[];
  }
}
