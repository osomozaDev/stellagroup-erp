import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { CAMPOS_FICHA, CAMPOS_FICHA_COMUNES, nombreTipoProyecto, TipoProyecto } from '@stella/shared';
import { api } from '../lib/api';
import { AreaTexto, Boton, Campo, Dato, Entrada, Panel, Tarjeta, useAviso } from './ui';

/** Detalles del proyecto según su tipo: de una web, el dominio y las páginas; de una app, las plataformas… */
export default function FichaProyecto({ proyecto }: { proyecto: any }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [editar, setEditar] = useState(false);
  const campos = [...(CAMPOS_FICHA[proyecto.tipo as TipoProyecto] ?? []), ...CAMPOS_FICHA_COMUNES];
  const ficha: Record<string, string> = proyecto.ficha ?? {};
  const [v, setV] = useState(ficha);
  const rellenos = campos.filter((c) => ficha[c.clave]);

  const guardar = useMutation({
    mutationFn: () => api(`/proyectos/${proyecto.id}/ficha`, { method: 'PATCH', body: { ficha: Object.fromEntries(Object.entries(v).filter(([, x]) => x?.trim())) } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proyecto', proyecto.id] }); avisar('Ficha guardada'); setEditar(false); },
    onError: (e: Error) => avisar(e.message, true),
  });

  return (
    <Tarjeta
      titulo={`Ficha · ${nombreTipoProyecto(proyecto.tipo)}`}
      accion={<button onClick={() => { setV(ficha); setEditar(true); }} className="inline-flex items-center gap-1 text-sm font-medium text-marca-600"><Pencil className="size-3.5" />{rellenos.length ? 'Editar' : 'Completar'}</button>}
    >
      {!rellenos.length ? (
        <p className="text-sm text-slate-500">Apunta aquí todos los detalles del proyecto para que el equipo los tenga a mano: {campos.slice(0, 3).map((c) => c.nombre.toLowerCase()).join(', ')}…</p>
      ) : (
        <dl className="grid sm:grid-cols-2 gap-4">
          {rellenos.map((c) => <Dato key={c.clave} etiqueta={c.nombre} valor={<span className="whitespace-pre-line">{ficha[c.clave]}</span>} />)}
        </dl>
      )}
      {editar && (
        <Panel
          abierto
          onCerrar={() => setEditar(false)}
          titulo={`Ficha de ${proyecto.nombre}`}
          pie={<><Boton variante="secundario" onClick={() => setEditar(false)}>Cancelar</Boton><Boton onClick={() => guardar.mutate()} cargando={guardar.isPending}>Guardar</Boton></>}
        >
          <div className="grid sm:grid-cols-2 gap-4">
            {campos.map((c) => (
              <Campo key={c.clave} etiqueta={c.nombre} ayuda={c.ayuda} className={c.largo ? 'sm:col-span-2' : undefined}>
                {c.largo
                  ? <AreaTexto rows={3} value={v[c.clave] ?? ''} onChange={(e) => setV({ ...v, [c.clave]: e.target.value })} />
                  : <Entrada value={v[c.clave] ?? ''} onChange={(e) => setV({ ...v, [c.clave]: e.target.value })} />}
              </Campo>
            ))}
          </div>
        </Panel>
      )}
    </Tarjeta>
  );
}
