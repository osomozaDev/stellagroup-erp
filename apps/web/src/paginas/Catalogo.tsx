import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Check, Package, Pencil, Plus, Search, Trash2, Wrench } from 'lucide-react';
import { TIPOS_CATALOGO, UNIDADES } from '@stella/shared';
import { api } from '../lib/api';
import { euros } from '../lib/formato';
import {
  AreaTexto, Boton, Buscador, Campo, Cargando, Confirmar, Entrada, Etiqueta, Filtros, Interruptor, Panel, Selector, Vacio, cx, useAviso, useFormulario,
} from '../components/ui';

const nombreUnidad = (u: string) => UNIDADES.find((x) => x.clave === u)?.nombre ?? u;
/** «55 € / hora», «2.400 €» */
export const precioCatalogo = (c: any) => `${euros(c.precio)}${c.unidad !== 'ud' ? ` / ${nombreUnidad(c.unidad).replace(/s$/, '').replace(/^mese$/, 'mes')}` : ''}`;

/** Agrupa por categoría, con las que no tienen al final */
const porCategoria = (lista: any[]) => {
  const grupos = new Map<string, any[]>();
  for (const c of lista) grupos.set(c.categoria || 'Sin categoría', [...(grupos.get(c.categoria || 'Sin categoría') ?? []), c]);
  return [...grupos.entries()];
};

export default function Catalogo() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [q, setQ] = useState('');
  const [ver, setVer] = useState<'activos' | 'todos'>('activos');
  const [editando, setEditando] = useState<any | null>(null);
  const [borrando, setBorrando] = useState<any | null>(null);
  const { data: lista, isLoading } = useQuery({
    queryKey: ['catalogo', q, ver],
    queryFn: () => api<any[]>(`/catalogo?q=${encodeURIComponent(q)}${ver === 'todos' ? '&todos=1' : ''}`),
  });
  const borrar = useMutation({
    mutationFn: (id: string) => api(`/catalogo/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalogo'] }); avisar('Borrado del catálogo'); },
    onError: (e: Error) => avisar(e.message, true),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Productos y servicios</h1>
            <p className="text-slate-500 mt-1">Lo que vendes, con su precio. En los presupuestos se añade con un clic.</p>
          </div>
          <Boton icono={<Plus className="size-4" />} onClick={() => setEditando({})}>Nuevo</Boton>
        </div>
        <div className="space-y-3">
          <Buscador valor={q} onCambio={setQ} texto="Buscar por nombre, descripción o categoría" />
          <Filtros valor={ver} onCambio={setVer} opciones={[{ valor: 'activos', texto: 'En venta' }, { valor: 'todos', texto: 'Todos' }]} />
        </div>

        {isLoading ? <Cargando /> : !lista?.length ? (
          <Vacio
            icono={<Package className="size-7" />}
            titulo={q ? 'No hay resultados' : 'El catálogo está vacío'}
            texto="Añade los servicios (una web, una hora de desarrollo, una auditoría…) y los productos (hosting, dominios, licencias) que vendes."
            accion={!q && <Boton onClick={() => setEditando({})}>Añadir el primero</Boton>}
          />
        ) : (
          porCategoria(lista).map(([categoria, elementos]) => (
            <section key={categoria} className="rounded-2xl bg-white border border-slate-200/70">
              <h2 className="px-4 md:px-5 pt-4 text-sm font-semibold text-slate-500 uppercase tracking-wide">{categoria}</h2>
              <ul className="divide-y divide-slate-100 px-4 md:px-5 pb-1">
                {elementos.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 py-3">
                    <span className={cx('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl', c.activo ? 'bg-marca-50 text-marca-600' : 'bg-slate-100 text-slate-400')}>
                      {c.tipo === 'producto' ? <Box className="size-4" /> : <Wrench className="size-4" />}
                    </span>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setEditando(c)}>
                      <p className={cx('font-medium', !c.activo && 'text-slate-400')}>{c.nombre}</p>
                      {c.descripcion && <p className="text-sm text-slate-500 line-clamp-2 whitespace-pre-line">{c.descripcion}</p>}
                      {!c.activo && <div className="mt-1"><Etiqueta>No está en venta</Etiqueta></div>}
                    </button>
                    <div className="text-right shrink-0">
                      <p className="font-semibold">{precioCatalogo(c)}</p>
                      {c.coste != null && Number(c.precio) > 0 && (
                        <p className="text-xs text-slate-500">margen {Math.round(((Number(c.precio) - Number(c.coste)) / Number(c.precio)) * 100)} %</p>
                      )}
                    </div>
                    <div className="flex shrink-0">
                      <button onClick={() => setEditando(c)} className="p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Editar"><Pencil className="size-4" /></button>
                      <button onClick={() => setBorrando(c)} className="p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label="Borrar"><Trash2 className="size-4" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {editando && <FormularioCatalogo elemento={editando.id ? editando : null} onCerrar={() => setEditando(null)} />}
      <Confirmar
        abierto={!!borrando}
        titulo="¿Borrarlo del catálogo?"
        texto="Los presupuestos donde ya lo usaste no cambian. Si solo quieres que deje de salir, desactiva «En venta»."
        botonSi="Borrar"
        peligro
        onNo={() => setBorrando(null)}
        onSi={() => { borrar.mutate(borrando.id); setBorrando(null); }}
      />
    </div>
  );
}

export function FormularioCatalogo({ elemento, inicial, onCerrar, onGuardado }: { elemento: any | null; inicial?: any; onCerrar: () => void; onGuardado?: (c: any) => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: categorias } = useQuery({
    queryKey: ['catalogo', '', 'todos'],
    queryFn: () => api<any[]>('/catalogo?todos=1'),
    select: (l) => [...new Set(l.map((c) => c.categoria).filter(Boolean))] as string[],
  });
  const { valores, campo, poner } = useFormulario({
    tipo: elemento?.tipo ?? inicial?.tipo ?? 'servicio',
    nombre: elemento?.nombre ?? inicial?.nombre ?? '',
    descripcion: elemento?.descripcion ?? inicial?.descripcion ?? '',
    categoria: elemento?.categoria ?? inicial?.categoria ?? '',
    unidad: elemento?.unidad ?? inicial?.unidad ?? 'ud',
    precio: elemento?.precio ?? inicial?.precio ?? '',
    coste: elemento?.coste ?? '',
    activo: elemento?.activo ?? true,
  });
  const guardar = useMutation({
    mutationFn: () => {
      const body = { ...valores, coste: valores.coste === '' ? null : valores.coste };
      return elemento ? api<any>(`/catalogo/${elemento.id}`, { method: 'PUT', body }) : api<any>('/catalogo', { method: 'POST', body });
    },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['catalogo'] }); avisar(elemento ? 'Guardado' : `${r.nombre} añadido al catálogo`); onGuardado?.(r); onCerrar(); },
    onError: (e: Error) => avisar(e.message, true),
  });
  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={elemento ? 'Editar' : 'Nuevo producto o servicio'}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton onClick={() => guardar.mutate()} cargando={guardar.isPending}>Guardar</Boton></>}
    >
      <div className="space-y-4">
        <Filtros valor={valores.tipo} onCambio={(v) => poner('tipo', v)} opciones={TIPOS_CATALOGO.map((t) => ({ valor: t.clave, texto: t.nombre }))} />
        <Campo etiqueta="Nombre"><Entrada {...campo('nombre')} placeholder="Web corporativa" autoFocus /></Campo>
        <Campo etiqueta="Descripción" ayuda="Sale debajo del nombre en el presupuesto"><AreaTexto rows={3} {...campo('descripcion')} /></Campo>
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Precio € (sin IVA)"><Entrada type="number" inputMode="decimal" step="0.01" {...campo('precio')} /></Campo>
          <Campo etiqueta="Por">
            <Selector {...campo('unidad')}>{UNIDADES.map((u) => <option key={u.clave} value={u.clave}>{u.nombre}</option>)}</Selector>
          </Campo>
          <Campo etiqueta="Categoría">
            <Entrada {...campo('categoria')} list="categorias-catalogo" placeholder="Web, Desarrollo, Hosting…" />
            <datalist id="categorias-catalogo">{categorias?.map((c) => <option key={c} value={c} />)}</datalist>
          </Campo>
          <Campo etiqueta="Nos cuesta €" ayuda="Opcional, para ver el margen"><Entrada type="number" inputMode="decimal" step="0.01" {...campo('coste')} /></Campo>
        </div>
        <Interruptor activo={valores.activo} onChange={(x) => poner('activo', x)} etiqueta="En venta" ayuda="Si lo quitas, deja de salir al hacer presupuestos" />
      </div>
    </Panel>
  );
}

/** Buscador del catálogo para añadir líneas a un presupuesto: cada clic añade una línea */
export function ElegirDelCatalogo({ onElegir, onCerrar }: { onElegir: (c: any) => void; onCerrar: () => void }) {
  const [q, setQ] = useState('');
  const [añadidos, setAñadidos] = useState<Record<string, number>>({});
  const [nuevo, setNuevo] = useState(false);
  const { data: lista, isLoading } = useQuery({ queryKey: ['catalogo', q, 'activos'], queryFn: () => api<any[]>(`/catalogo?q=${encodeURIComponent(q)}`) });
  const elegir = (c: any) => {
    onElegir(c);
    setAñadidos((a) => ({ ...a, [c.id]: (a[c.id] ?? 0) + 1 }));
  };
  const total = Object.values(añadidos).reduce((t, n) => t + n, 0);

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo="Añadir del catálogo"
      pie={
        <>
          <Boton variante="secundario" icono={<Plus className="size-4" />} onClick={() => setNuevo(true)}>Nuevo en el catálogo</Boton>
          <Boton onClick={onCerrar}>{total ? `Hecho (${total} ${total === 1 ? 'línea' : 'líneas'})` : 'Cerrar'}</Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Buscador valor={q} onCambio={setQ} texto="Buscar producto o servicio" />
        {isLoading ? <Cargando /> : !lista?.length ? (
          <Vacio icono={<Search className="size-7" />} titulo={q ? 'No hay nada con ese nombre' : 'El catálogo está vacío'} texto="Añádelo al catálogo y lo tendrás para los siguientes presupuestos." />
        ) : (
          porCategoria(lista).map(([categoria, elementos]) => (
            <div key={categoria}>
              <p className="mb-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{categoria}</p>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {elementos.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => elegir(c)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-marca-50/60">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{c.nombre}</p>
                        {c.descripcion && <p className="text-xs text-slate-500 truncate">{c.descripcion.split('\n')[0]}</p>}
                      </div>
                      <span className="text-sm font-semibold shrink-0">{precioCatalogo(c)}</span>
                      <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-full', añadidos[c.id] ? 'bg-marca-600 text-white' : 'bg-slate-100 text-slate-500')}>
                        {añadidos[c.id] ? (añadidos[c.id] > 1 ? <span className="text-xs font-bold">×{añadidos[c.id]}</span> : <Check className="size-4" />) : <Plus className="size-4" />}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
      {nuevo && <FormularioCatalogo elemento={null} inicial={{ nombre: q }} onCerrar={() => setNuevo(false)} onGuardado={elegir} />}
    </Panel>
  );
}
