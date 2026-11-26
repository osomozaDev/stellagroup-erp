import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Copy, Divide, Pencil, Plus, Receipt, Trash2, X } from 'lucide-react';
import { aPartesIguales, CATEGORIAS_GASTO, nombreCategoriaGasto } from '@stella/shared';
import { api } from '../lib/api';
import { euros, fechaCorta, finDeMes, hoyISO, mesActual, moverMes, nombreMes } from '../lib/formato';
import { AreaTexto, Boton, Campo, Cargando, Confirmar, Entrada, Etiqueta, Filtros, Panel, Selector, Tarjeta, Vacio, cx, useAviso } from '../components/ui';

type Vista = 'mes' | 'anio';
const COLOR_CATEGORIA: Record<string, 'azul' | 'naranja' | 'verde' | 'gris'> = { material: 'azul', suscripcion: 'naranja', horas: 'verde', otro: 'gris' };

export default function Gastos() {
  const [vista, setVista] = useState<Vista>('mes');
  const [mes, setMes] = useState(mesActual());
  const [editar, setEditar] = useState<any | null>(null); // {} = nuevo
  const anio = mes.slice(0, 4);
  const desde = vista === 'mes' ? `${mes}-01` : `${anio}-01-01`;
  const hasta = vista === 'mes' ? finDeMes(mes) : `${anio}-12-31`;
  const { data: r, isLoading } = useQuery({ queryKey: ['gastos', desde, hasta], queryFn: () => api<any>(`/gastos?desde=${desde}&hasta=${hasta}`) });

  const mover = (d: number) => setMes(vista === 'mes' ? moverMes(mes, d) : `${Number(anio) + d}-${mes.slice(5)}`);
  const titulo = vista === 'mes' ? nombreMes(`${mes}-01`) : anio;
  const asignado = r ? Math.round((r.total - r.sin_asignar) * 100) / 100 : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Gastos</h1>
          <Boton icono={<Plus className="size-4" />} onClick={() => setEditar({})}>Nuevo gasto</Boton>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Filtros<Vista> opciones={[{ valor: 'mes', texto: 'Mes' }, { valor: 'anio', texto: 'Año' }]} valor={vista} onCambio={setVista} />
          <div className="flex items-center gap-2">
            <button onClick={() => mover(-1)} className="rounded-full bg-slate-100 p-2.5 hover:bg-slate-200" aria-label="Anterior"><ChevronLeft className="size-4" /></button>
            <span className="min-w-36 text-center font-semibold capitalize">{titulo}</span>
            <button onClick={() => mover(1)} className="rounded-full bg-slate-100 p-2.5 hover:bg-slate-200" aria-label="Siguiente"><ChevronRight className="size-4" /></button>
          </div>
        </div>

        {isLoading || !r ? <Cargando /> : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Cifra texto="Gastado" valor={euros(r.total)} detalle={`${r.gastos.length} ${r.gastos.length === 1 ? 'gasto' : 'gastos'} · sin IVA`} destacado />
              <Cifra texto="Repartido entre clientes" valor={euros(asignado)} detalle={`${r.por_cliente.length} ${r.por_cliente.length === 1 ? 'cliente' : 'clientes'}`} />
              <Cifra texto="Sin cliente" valor={euros(r.sin_asignar)} detalle="Gastos generales de la empresa" />
            </div>

            {r.gastos.length === 0 ? (
              <Vacio
                icono={<Receipt className="size-7" />}
                titulo={`Sin gastos en ${titulo}`}
                texto="Apunta el material (plásticos QR…), las suscripciones o las horas y repártelos entre los clientes a los que corresponden."
                accion={<Boton onClick={() => setEditar({})}>Apuntar un gasto</Boton>}
              />
            ) : (
              <div className="grid lg:grid-cols-5 gap-5 items-start">
                <Tarjeta titulo="Gastos" className="lg:col-span-3">
                  <ul className="-my-3 divide-y divide-slate-100">
                    {r.gastos.map((g: any) => (
                      <li key={g.id}>
                        <button onClick={() => setEditar(g)} className="w-full text-left py-3 flex items-start gap-3 hover:bg-slate-50 -mx-2 px-2 rounded-lg">
                          <span className="w-14 shrink-0 pt-0.5 text-xs text-slate-500">{fechaCorta(g.fecha)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{g.concepto}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                              <Etiqueta color={COLOR_CATEGORIA[g.categoria]}>{nombreCategoriaGasto(g.categoria)}</Etiqueta>
                              {g.proveedor && <span>{g.proveedor}</span>}
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {g.reparto.length === 0
                                ? 'Sin cliente'
                                : g.reparto.map((x: any) => `${x.cliente?.nombre ?? '—'}${g.reparto.length > 1 ? ` ${Number(x.porcentaje)} %` : ''}`).join(' · ')}
                            </p>
                          </div>
                          <span className="shrink-0 font-semibold">{euros(g.importe)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Tarjeta>

                <Tarjeta titulo="Por cliente" className="lg:col-span-2">
                  {r.por_cliente.length === 0 ? <p className="text-sm text-slate-500">Ningún gasto está repartido entre clientes.</p> : (
                    <ul className="-my-2 divide-y divide-slate-100">
                      {r.por_cliente.map((c: any) => (
                        <li key={c.cliente_id}>
                          <Link to={`/clientes/${c.cliente_id}`} className="flex items-center gap-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{c.nombre}</p>
                              <p className="text-xs text-slate-500">{c.gastos} {c.gastos === 1 ? 'gasto' : 'gastos'}</p>
                            </div>
                            <span className="text-sm font-semibold">{euros(c.importe)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Tarjeta>
              </div>
            )}
          </>
        )}
      </div>

      {editar && <PanelGasto key={editar.id ?? (editar.copia ? 'copia' : 'nuevo')} gasto={editar.id || editar.copia ? editar : null} copia={editar.copia} onCerrar={() => setEditar(null)} onDuplicar={(g) => setEditar({ ...g, id: undefined, copia: true })} />}
    </div>
  );
}

const Cifra = ({ texto, valor, detalle, destacado }: { texto: string; valor: string; detalle?: string; destacado?: boolean }) => (
  <div className={cx('rounded-2xl p-4 border', destacado ? 'bg-marca-600 border-marca-600 text-white' : 'bg-white border-slate-200/70')}>
    <p className={cx('text-sm', destacado ? 'text-marca-100' : 'text-slate-500')}>{texto}</p>
    <p className="text-lg md:text-xl font-bold mt-1">{valor}</p>
    {detalle && <p className={cx('text-xs mt-0.5', destacado ? 'text-marca-100' : 'text-slate-500')}>{detalle}</p>}
  </div>
);

type Fila = { cliente_id: string; porcentaje: string };

/** Nuevo gasto, editar uno o duplicarlo (la suscripción del mes siguiente, por ejemplo) */
function PanelGasto({ gasto, copia, onCerrar, onDuplicar }: { gasto: any | null; copia?: boolean; onCerrar: () => void; onDuplicar: (g: any) => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [borrar, setBorrar] = useState(false);
  const [v, setV] = useState(() => ({
    fecha: copia || !gasto ? hoyISO() : gasto.fecha,
    concepto: gasto?.concepto ?? '',
    categoria: gasto?.categoria ?? 'material',
    proveedor: gasto?.proveedor ?? '',
    importe: gasto ? String(Number(gasto.importe)) : '',
    nota: gasto?.nota ?? '',
  }));
  const [filas, setFilas] = useState<Fila[]>(() => (gasto?.reparto ?? []).map((x: any) => ({ cliente_id: x.cliente_id, porcentaje: String(Number(x.porcentaje)) })));
  const { data: clientes } = useQuery({ queryKey: ['clientes', ''], queryFn: () => api<any[]>('/clientes?q=') });

  const editando = !!gasto?.id;
  const importe = Number(v.importe.replace(',', '.')) || 0;
  const suma = filas.reduce((t, f) => t + (Number(f.porcentaje.replace(',', '.')) || 0), 0);
  const cuadra = !filas.length || Math.abs(suma - 100) < 0.01;

  const repartirIgual = (lista = filas) => {
    const p = aPartesIguales(lista.length);
    setFilas(lista.map((f, i) => ({ ...f, porcentaje: String(p[i]) })));
  };
  const anadir = () => {
    const libre = clientes?.find((c) => !filas.some((f) => f.cliente_id === c.id));
    // Al añadir uno, si los que había iban a partes iguales, se vuelve a repartir igual
    const iguales = filas.length > 0 && filas.every((f, i) => Number(f.porcentaje) === aPartesIguales(filas.length)[i]);
    const nuevas = [...filas, { cliente_id: libre?.id ?? '', porcentaje: filas.length ? '0' : '100' }];
    if (!filas.length || iguales) repartirIgual(nuevas);
    else setFilas(nuevas);
  };
  const cambiar = (i: number, cambio: Partial<Fila>) => setFilas(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  const quitar = (i: number) => {
    const resto = filas.filter((_, j) => j !== i);
    if (resto.length === 1) setFilas([{ ...resto[0], porcentaje: '100' }]);
    else setFilas(resto);
  };

  const cuerpo = () => ({
    ...v,
    importe,
    reparto: filas.map((f) => ({ cliente_id: f.cliente_id, porcentaje: Number(f.porcentaje.replace(',', '.')) })),
  });
  const guardar = useMutation({
    mutationFn: () => api(editando ? `/gastos/${gasto.id}` : '/gastos', { method: editando ? 'PUT' : 'POST', body: cuerpo() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gastos'] }); avisar(editando ? 'Gasto guardado' : `Gasto de ${euros(importe)} apuntado`); onCerrar(); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const eliminar = useMutation({
    mutationFn: () => api(`/gastos/${gasto.id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gastos'] }); avisar('Gasto borrado'); onCerrar(); },
    onError: (e: Error) => avisar(e.message, true),
  });

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={editando ? 'Gasto' : copia ? 'Duplicar gasto' : 'Nuevo gasto'}
      pie={
        <>
          {editando && (
            <>
              <Boton variante="fantasma" icono={<Trash2 className="size-4" />} onClick={() => setBorrar(true)} aria-label="Borrar" />
              <Boton variante="secundario" icono={<Copy className="size-4" />} onClick={() => onDuplicar({ ...gasto, ...cuerpo(), importe: v.importe, reparto: filas })}>Duplicar</Boton>
            </>
          )}
          <span className="flex-1" />
          <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          <Boton onClick={() => guardar.mutate()} cargando={guardar.isPending} disabled={!cuadra || filas.some((f) => !f.cliente_id)}>Guardar</Boton>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo etiqueta="Concepto" className="sm:col-span-2">
            <Entrada value={v.concepto} onChange={(e) => setV({ ...v, concepto: e.target.value })} placeholder="Plásticos QR, licencia de Figma…" autoFocus={!editando} />
          </Campo>
          <Campo etiqueta="Tipo">
            <Selector value={v.categoria} onChange={(e) => setV({ ...v, categoria: e.target.value })}>
              {CATEGORIAS_GASTO.map((c) => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Importe sin IVA (€)">
            <Entrada type="number" inputMode="decimal" min={0} step="0.01" value={v.importe} onChange={(e) => setV({ ...v, importe: e.target.value })} />
          </Campo>
          <Campo etiqueta="Fecha">
            <Entrada type="date" value={v.fecha} onChange={(e) => setV({ ...v, fecha: e.target.value })} />
          </Campo>
          <Campo etiqueta="Proveedor">
            <Entrada value={v.proveedor} onChange={(e) => setV({ ...v, proveedor: e.target.value })} placeholder="Opcional" />
          </Campo>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">¿De qué clientes es?</p>
            {filas.length > 1 && (
              <button onClick={() => repartirIgual()} className="inline-flex items-center gap-1 text-sm font-medium text-marca-600">
                <Divide className="size-3.5" /> A partes iguales
              </button>
            )}
          </div>
          {filas.length === 0 ? (
            <p className="text-sm text-slate-500">Sin cliente: cuenta como gasto general de la empresa.</p>
          ) : (
            <ul className="space-y-2">
              {filas.map((f, i) => {
                const pct = Number(f.porcentaje.replace(',', '.')) || 0;
                return (
                  <li key={i} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Selector value={f.cliente_id} onChange={(e) => cambiar(i, { cliente_id: e.target.value })}>
                        <option value="">Elige el cliente</option>
                        {(clientes ?? []).map((c) => (
                          <option key={c.id} value={c.id} disabled={c.id !== f.cliente_id && filas.some((x) => x.cliente_id === c.id)}>{c.nombre}</option>
                        ))}
                      </Selector>
                    </div>
                    {filas.length > 1 && (
                      <div className="relative w-24 shrink-0">
                        <Entrada type="number" inputMode="decimal" min={0} max={100} step="0.01" value={f.porcentaje} onChange={(e) => cambiar(i, { porcentaje: e.target.value })} className="pr-7" aria-label="Porcentaje" />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                      </div>
                    )}
                    <span className="hidden sm:block w-24 shrink-0 text-right text-sm text-slate-600">{euros((importe * pct) / 100)}</span>
                    <button onClick={() => quitar(i)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="Quitar cliente"><X className="size-4" /></button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Boton variante="secundario" icono={<Plus className="size-4" />} onClick={anadir}>{filas.length ? 'Añadir otro cliente' : 'Asignar a un cliente'}</Boton>
            {filas.length > 1 && (
              <span className={cx('text-sm font-medium', cuadra ? 'text-emerald-700' : 'text-red-600')}>
                Suma {Math.round(suma * 100) / 100} %{cuadra ? '' : ' · tiene que ser 100 %'}
              </span>
            )}
          </div>
        </div>

        <Campo etiqueta="Nota">
          <AreaTexto rows={2} value={v.nota} onChange={(e) => setV({ ...v, nota: e.target.value })} placeholder="Opcional" />
        </Campo>
      </div>

      <Confirmar
        abierto={borrar}
        titulo="¿Borrar este gasto?"
        texto={`${v.concepto} · ${euros(importe)}. Se quita también de los clientes a los que estaba repartido.`}
        botonSi="Borrar"
        peligro
        onNo={() => setBorrar(false)}
        onSi={() => { setBorrar(false); eliminar.mutate(); }}
      />
    </Panel>
  );
}

/** En la ficha del cliente: lo que se le ha imputado de los gastos */
export function GastosDelCliente({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ['gastos', 'cliente', id], queryFn: () => api<any>(`/gastos/cliente/${id}`) });
  if (!data) return null;
  return (
    <Tarjeta titulo="Gastos" accion={<Link to="/gastos" className="text-sm font-medium text-marca-600">Gastos</Link>}>
      {data.cuantos === 0 ? <p className="text-sm text-slate-500">No tiene gastos asignados.</p> : (
        <>
          <p className="text-sm text-slate-600 mb-3">
            <b>{euros(data.total_anio)}</b> este año · {euros(data.total)} en total ({data.cuantos} {data.cuantos === 1 ? 'gasto' : 'gastos'}, sin IVA)
          </p>
          <ul className="-my-2 divide-y divide-slate-100">
            {data.gastos.map((g: any) => (
              <li key={g.id} className="flex items-center gap-3 py-2.5">
                <span className="w-14 shrink-0 text-xs text-slate-500">{fechaCorta(g.fecha)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{g.concepto}</p>
                  <p className="truncate text-xs text-slate-500">
                    {nombreCategoriaGasto(g.categoria)}{g.compartido ? ` · su ${g.porcentaje} % de ${euros(g.importe)}` : ''}
                  </p>
                </div>
                <span className="text-sm font-semibold">{euros(g.parte)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Tarjeta>
  );
}
