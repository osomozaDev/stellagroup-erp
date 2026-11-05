import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { TIPOS_EVENTO } from '@stella/shared';
import { api } from '../lib/api';
import { nombreCompleto } from '../lib/formato';
import { AreaTexto, Boton, Campo, Confirmar, Entrada, Interruptor, Panel, Selector, useAviso } from './ui';

/** Hora local en el formato de los campos de fecha y hora: «2026-11-05T10:30» */
export const fechaHoraLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);

/** Crear o editar una reunión, llamada, tarea o entrega. `inicial` trae lo que ya se sabe (día, cliente, oportunidad…) */
export default function FormularioEvento({ evento, inicial, onCerrar }: { evento?: any; inicial?: Record<string, any>; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [borrar, setBorrar] = useState(false);
  const { data: clientes } = useQuery({ queryKey: ['clientes', ''], queryFn: () => api<any[]>('/clientes') });
  const { data: equipo } = useQuery({ queryKey: ['empleados', 'activos'], queryFn: () => api<any[]>('/empleados?activos=1') });
  const base = evento ?? inicial ?? {};
  const [v, setV] = useState(() => ({
    titulo: base.titulo ?? '',
    tipo: base.tipo ?? 'reunion',
    inicio: fechaHoraLocal(base.inicio ? new Date(base.inicio) : new Date(Math.ceil(Date.now() / 36e5) * 36e5)),
    fin: base.fin ? fechaHoraLocal(new Date(base.fin)) : '',
    todo_el_dia: base.todo_el_dia ?? false,
    lugar: base.lugar ?? '',
    descripcion: base.descripcion ?? '',
    cliente_id: base.cliente_id ?? '',
    oportunidad_id: base.oportunidad_id ?? '',
    proyecto_id: base.proyecto_id ?? '',
    responsable_id: base.responsable_id ?? '',
  }));
  const [enlaces, setEnlaces] = useState<{ nombre: string; url: string }[]>(() => (base.enlaces ?? []).map((e: any) => ({ nombre: e.nombre ?? '', url: e.url })));
  const ponerEnlace = (i: number, k: 'nombre' | 'url', valor: string) => setEnlaces((l) => l.map((e, j) => (j === i ? { ...e, [k]: valor } : e)));
  const poner = (k: keyof typeof v, valor: any) => setV((x) => ({ ...x, [k]: valor }));

  const guardar = useMutation({
    mutationFn: () => {
      // Un evento de todo el día se guarda a las 00:00 de ese día, en la hora de quien lo crea
      const inicio = v.todo_el_dia ? new Date(`${v.inicio.slice(0, 10)}T00:00`) : new Date(v.inicio);
      const body = { ...v, inicio: inicio.toISOString(), fin: v.fin && !v.todo_el_dia ? new Date(v.fin).toISOString() : null, enlaces: enlaces.filter((e) => e.url.trim()) };
      return evento ? api(`/agenda/${evento.id}`, { method: 'PATCH', body }) : api('/agenda', { method: 'POST', body });
    },
    onSuccess: () => { qc.invalidateQueries(); avisar(evento ? 'Guardado' : 'Añadido a la agenda'); onCerrar(); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const eliminar = useMutation({
    mutationFn: () => api(`/agenda/${evento.id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Borrado de la agenda'); onCerrar(); },
    onError: (e: Error) => avisar(e.message, true),
  });

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={evento ? 'Editar evento' : 'Nuevo evento'}
      pie={
        <>
          {evento && <Boton variante="fantasma" onClick={() => setBorrar(true)}>Borrar</Boton>}
          <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          <Boton onClick={() => guardar.mutate()} cargando={guardar.isPending}>Guardar</Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-[1fr_10rem] gap-4">
          <Campo etiqueta="Título"><Entrada value={v.titulo} onChange={(e) => poner('titulo', e.target.value)} autoFocus placeholder="Reunión con el cliente" /></Campo>
          <Campo etiqueta="Tipo">
            <Selector value={v.tipo} onChange={(e) => poner('tipo', e.target.value)}>
              {TIPOS_EVENTO.map((t) => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
            </Selector>
          </Campo>
        </div>
        <Interruptor activo={v.todo_el_dia} onChange={(x) => poner('todo_el_dia', x)} etiqueta="Todo el día" />
        <div className="grid sm:grid-cols-2 gap-4">
          {v.todo_el_dia ? (
            <Campo etiqueta="Día"><Entrada type="date" value={v.inicio.slice(0, 10)} onChange={(e) => poner('inicio', `${e.target.value}T00:00`)} /></Campo>
          ) : (
            <>
              <Campo etiqueta="Empieza"><Entrada type="datetime-local" value={v.inicio} onChange={(e) => poner('inicio', e.target.value)} /></Campo>
              <Campo etiqueta="Acaba (opcional)"><Entrada type="datetime-local" value={v.fin} onChange={(e) => poner('fin', e.target.value)} /></Campo>
            </>
          )}
        </div>
        <Campo etiqueta="Lugar o enlace"><Entrada value={v.lugar} onChange={(e) => poner('lugar', e.target.value)} placeholder="Oficina, dirección o enlace de la videollamada" /></Campo>
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Enlaces</p>
          {enlaces.map((e, i) => (
            <div key={i} className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-2">
              <Entrada aria-label="Nombre del enlace" value={e.nombre} onChange={(x) => ponerEnlace(i, 'nombre', x.target.value)} placeholder="Web demo" />
              <Entrada aria-label="Dirección del enlace" inputMode="url" value={e.url} onChange={(x) => ponerEnlace(i, 'url', x.target.value)} placeholder="demo.cliente.es" />
              <button type="button" onClick={() => setEnlaces((l) => l.filter((_, j) => j !== i))} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Quitar enlace"><X className="size-4" /></button>
            </div>
          ))}
          {enlaces.length < 10 && (
            <button type="button" onClick={() => setEnlaces((l) => [...l, { nombre: '', url: '' }])} className="inline-flex items-center gap-1 text-sm font-medium text-marca-600"><Plus className="size-4" />Añadir enlace</button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo etiqueta="Cliente (opcional)">
            <Selector value={v.cliente_id} onChange={(e) => poner('cliente_id', e.target.value)}>
              <option value="">Sin cliente</option>
              {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Responsable">
            <Selector value={v.responsable_id} onChange={(e) => poner('responsable_id', e.target.value)}>
              <option value="">Sin asignar</option>
              {equipo?.map((e) => <option key={e.id} value={e.id}>{nombreCompleto(e)}</option>)}
            </Selector>
          </Campo>
        </div>
        <Campo etiqueta="Notas"><AreaTexto rows={3} value={v.descripcion} onChange={(e) => poner('descripcion', e.target.value)} /></Campo>
      </div>
      <Confirmar
        abierto={borrar}
        titulo="¿Borrar este evento?"
        texto="Se quita de la agenda."
        botonSi="Borrar"
        peligro
        onNo={() => setBorrar(false)}
        onSi={() => { setBorrar(false); eliminar.mutate(); }}
      />
    </Panel>
  );
}
