import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FolderKanban, Copy, Mail, Pencil, Phone, Plus, Send, Trash2, Users } from 'lucide-react';
import { api } from '../lib/api';
import { euros, fecha, fechaCorta } from '../lib/formato';
import { calcularVencimiento, nombreTipoServicio, textoCondicionPago } from '@stella/shared';
import {
  AreaTexto, Avatar, Boton, Buscador, CabeceraDetalle, CabeceraLista, Campo, Cargando, Confirmar, Dato, Entrada, Etiqueta,
  FilaLista, Interruptor, ListaDetalle, Panel, Selector, SinSeleccion, Tarjeta, Vacio, useAviso, useFormulario,
} from '../components/ui';
import { estadoFactura } from './Facturas';
import { FormularioProyecto, estadoProyecto } from './Proyectos';

export default function Clientes() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [q, setQ] = useState('');
  const [params, setParams] = useSearchParams();
  // ?nuevo=1 abre el formulario directamente (lo usa la guía de primeros pasos)
  const [nuevo, setNuevoEstado] = useState(params.get('nuevo') === '1');
  const setNuevo = (v: boolean) => { setNuevoEstado(v); if (!v && params.has('nuevo')) setParams({}, { replace: true }); };
  const { data: clientes, isLoading } = useQuery({ queryKey: ['clientes', q], queryFn: () => api<any[]>(`/clientes?q=${encodeURIComponent(q)}`) });

  const lista = (
    <>
      <CabeceraLista titulo="Clientes" accion={<Boton icono={<Plus className="size-4" />} onClick={() => setNuevo(true)}>Nuevo</Boton>}>
        <Buscador valor={q} onCambio={setQ} texto="Buscar por nombre, CIF o ciudad" />
      </CabeceraLista>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <Cargando /> : !clientes?.length ? (
          <Vacio icono={<Users className="size-7" />} titulo={q ? 'No hay resultados' : 'Aún no tienes clientes'} texto="Añade las empresas para las que haces webs, software o mantenimiento." accion={!q && <Boton onClick={() => setNuevo(true)}>Añadir cliente</Boton>} />
        ) : (
          clientes.map((c) => (
            <FilaLista key={c.id} activa={c.id === id} onClick={() => navegar(`/clientes/${c.id}`)}>
              <Avatar texto={c.nombre} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.nombre}</p>
                <p className="truncate text-sm text-slate-500">
                  {c.proyectos_activos ? `${c.proyectos_activos} ${c.proyectos_activos === 1 ? 'proyecto activo' : 'proyectos activos'}` : 'Sin proyectos activos'}
                  {c.ciudad && ` · ${c.ciudad}`}
                </p>
              </div>
              {c.pendiente > 0 && <span className="text-sm font-semibold text-amber-700">{euros(c.pendiente)}</span>}
            </FilaLista>
          ))
        )}
      </div>
    </>
  );

  return (
    <>
      <ListaDetalle hayDetalle={!!id} lista={lista} detalle={id ? <DetalleCliente id={id} /> : <SinSeleccion texto="Elige un cliente para ver sus proyectos y facturas" />} />
      {nuevo && <FormularioCliente onCerrar={() => setNuevo(false)} onCreado={(c) => navegar(`/clientes/${c.id}`)} />}
    </>
  );
}

const ACCION_PORTAL: Record<string, string> = { entrada: 'Ha entrado', descarga: 'Ha descargado', zip: 'Ha descargado un ZIP' };

/** Portal de clientes: si puede entrar, con qué correos, y lo último que ha hecho */
function PortalCliente({ id }: { id: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: p } = useQuery({ queryKey: ['cliente-portal', id], queryFn: () => api(`/clientes/${id}/portal`) });
  const [otros, setOtros] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: (body: { activo: boolean; emails: string[] }) => api(`/clientes/${id}/portal`, { method: 'PATCH', body }),
    onSuccess: (r) => { qc.setQueryData(['cliente-portal', id], r); setOtros(null); avisar('Guardado'); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const invitar = useMutation({
    mutationFn: () => api<{ enviados: string[]; modo: string }>(`/clientes/${id}/portal/invitar`, { method: 'POST' }),
    onSuccess: (r) => avisar(r.modo === 'prueba' ? 'Modo prueba: no se ha enviado ningún correo' : `Acceso enviado a ${r.enviados.join(', ')}`),
    onError: (e: Error) => avisar(e.message, true),
  });

  if (!p) return null;
  const listaOtros = (otros ?? p.emails.join(', ')).split(/[\s,;]+/).filter(Boolean);
  const copiar = () => navigator.clipboard.writeText(p.url).then(() => avisar('Enlace copiado'), () => avisar(p.url));

  return (
    <Tarjeta titulo="Portal del cliente">
      <div className="space-y-4">
        <Interruptor
          activo={p.activo}
          onChange={(activo) => guardar.mutate({ activo, emails: p.emails })}
          etiqueta="Puede ver y descargar sus facturas"
          ayuda="Entra con un enlace que le llega al correo, sin contraseña. Solo ve sus facturas emitidas."
        />
        {p.activo && (
          <>
            <Campo etiqueta="Correos que pueden entrar" ayuda={`${p.email ? `Además de ${p.email} (el de la ficha). ` : ''}Separa varios con comas.`}>
              <div className="flex gap-2">
                <Entrada value={otros ?? p.emails.join(', ')} onChange={(e) => setOtros(e.target.value)} placeholder="contabilidad@cliente.es" />
                {otros !== null && <Boton cargando={guardar.isPending} onClick={() => guardar.mutate({ activo: true, emails: listaOtros })}>Guardar</Boton>}
              </div>
            </Campo>
            <div className="flex flex-wrap gap-2">
              <Boton variante="secundario" icono={<Send className="size-4" />} cargando={invitar.isPending} disabled={!p.correos.length} onClick={() => invitar.mutate()}>
                Mandarle el acceso
              </Boton>
              <Boton variante="secundario" icono={<Copy className="size-4" />} onClick={copiar}>Copiar enlace del portal</Boton>
            </div>
            {!p.correos.length && <p className="text-sm text-amber-700">Añade un correo para que pueda entrar.</p>}
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Últimos movimientos</p>
              {p.accesos.length === 0 ? <p className="text-sm text-slate-500">Todavía no ha entrado.</p> : (
                <ul className="text-sm divide-y divide-slate-100">
                  {p.accesos.map((a: any, i: number) => (
                    <li key={i} className="flex gap-2 py-1.5">
                      <span className="text-slate-500 w-28 shrink-0">{new Date(a.created_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="min-w-0 truncate">
                        {ACCION_PORTAL[a.accion]}
                        {a.accion === 'descarga' && a.factura && <> la <Link className="text-marca-600" to={`/facturas/${a.factura.id}`}>factura {a.factura.numero}</Link></>}
                        {a.accion === 'zip' && a.cuantas && ` (${a.cuantas} facturas)`}
                        <span className="text-slate-400"> · {a.email}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </Tarjeta>
  );
}

function DetalleCliente({ id }: { id: string }) {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [editar, setEditar] = useState(false);
  const [nuevaProyecto, setNuevaProyecto] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const { data: c, isLoading } = useQuery({ queryKey: ['cliente', id], queryFn: () => api(`/clientes/${id}`) });
  const { data: empresa } = useQuery({ queryKey: ['empresa'], queryFn: () => api('/empresa') });

  const eliminar = useMutation({
    mutationFn: () => api(`/clientes/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Cliente borrado'); navegar('/clientes'); },
    onError: (e: Error) => avisar(e.message, true),
  });

  if (isLoading || !c) return <Cargando />;
  const pendiente = c.facturas.filter((f: any) => f.estado === 'emitida').reduce((s: number, f: any) => s + Number(f.total), 0);
  // Las prefacturas se ven en cada proyecto; aquí solo lo que ya es factura
  const facturas = c.facturas.filter((f: any) => f.estado !== 'borrador');

  return (
    <div className="min-h-full bg-fondo">
      <CabeceraDetalle
        volver="/clientes"
        avatar={<Avatar texto={c.nombre} />}
        titulo={c.nombre}
        subtitulo={c.cif ? `CIF ${c.cif}` : undefined}
        acciones={
          <>
            <Boton icono={<Plus className="size-4" />} onClick={() => setNuevaProyecto(true)}>Nuevo proyecto</Boton>
            <Boton variante="secundario" icono={<Pencil className="size-4" />} onClick={() => setEditar(true)}>Editar</Boton>
            <Boton variante="fantasma" icono={<Trash2 className="size-4" />} onClick={() => setBorrar(true)} aria-label="Borrar" />
          </>
        }
      />
      <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white border border-slate-200/70 p-4">
            <p className="text-sm text-slate-500">Pendiente de cobro</p>
            <p className="text-xl font-bold mt-1">{euros(pendiente)}</p>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200/70 p-4">
            <p className="text-sm text-slate-500">Facturas</p>
            <p className="text-xl font-bold mt-1">{facturas.length}</p>
          </div>
        </div>

        <Tarjeta titulo="Datos">
          <dl className="grid sm:grid-cols-2 gap-4">
            <Dato etiqueta="Persona de contacto" valor={c.contacto} />
            <Dato etiqueta="Teléfono" valor={c.telefono && <a href={`tel:${c.telefono}`} className="text-marca-600 inline-flex items-center gap-1"><Phone className="size-3.5" />{c.telefono}</a>} />
            <Dato etiqueta="Correo" valor={c.email && <a href={`mailto:${c.email}`} className="text-marca-600 inline-flex items-center gap-1"><Mail className="size-3.5" />{c.email}</a>} />
            {c.web && <Dato etiqueta="Web" valor={<a href={/^https?:/.test(c.web) ? c.web : `https://${c.web}`} target="_blank" rel="noreferrer" className="text-marca-600 hover:underline">{c.web.replace(/^https?:\/\//, '')}</a>} />}
            <Dato etiqueta="Dirección" valor={[c.direccion, c.cp, c.ciudad, c.provincia].filter(Boolean).join(', ')} />
            <Dato etiqueta="Paga" valor={textoCondicionPago(c, empresa?.dias_vencimiento ?? 30)} />
            {c.notas && <Dato etiqueta="Notas" valor={c.notas} />}
          </dl>
        </Tarjeta>

        <PortalCliente id={c.id} />

        <Tarjeta titulo="Proyectos" accion={<button onClick={() => setNuevaProyecto(true)} className="text-sm font-medium text-marca-600">Añadir</button>}>
          {c.proyectos.length === 0 ? <p className="text-sm text-slate-500">Este cliente aún no tiene proyectos.</p> : (
            <ul className="-my-2 divide-y divide-slate-100">
              {c.proyectos.map((o: any) => {
                const e = estadoProyecto(o.estado);
                return (
                  <li key={o.id}>
                    <Link to={`/proyectos/${o.id}`} className="flex items-center gap-3 py-3">
                      <FolderKanban className="size-5 text-slate-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{o.nombre}</p>
                        <p className="text-xs text-slate-500">{o.modalidad === 'horas' ? `Por horas · ${Number(o.horas_mes)} h/mes × ${euros(o.precio_hora)}` : `Por hitos · ${euros(o.presupuesto)}`}</p>
                      </div>
                      <Etiqueta color={e.color}>{e.texto}</Etiqueta>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>

        {(c.servicios.length > 0 || c.presupuestos.length > 0) && (
          <Tarjeta titulo="Presupuestos y servicios">
            <ul className="-my-2 divide-y divide-slate-100">
              {c.presupuestos.map((p: any) => (
                <li key={p.id}>
                  <Link to={`/presupuestos/${p.id}`} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.titulo}</p>
                      <p className="text-xs text-slate-500">Presupuesto {p.numero} · {p.estado}</p>
                    </div>
                    <span className="text-sm font-semibold">{euros(p.total)}</span>
                  </Link>
                </li>
              ))}
              {c.servicios.filter((x: any) => x.estado === 'activo').map((x: any) => (
                <li key={x.id}>
                  <Link to={`/servicios/${x.id}`} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{x.nombre}</p>
                      <p className="text-xs text-slate-500">{nombreTipoServicio(x.tipo)} · renueva el {fecha(x.proxima_renovacion)}</p>
                    </div>
                    <span className="text-sm font-semibold">{euros(x.precio)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}

        <Tarjeta titulo="Facturas">
          {facturas.length === 0 ? <p className="text-sm text-slate-500">Sin facturas todavía.</p> : (
            <ul className="-my-2 divide-y divide-slate-100">
              {facturas.map((f: any) => {
                const e = estadoFactura(f);
                return (
                  <li key={f.id}>
                    <Link to={`/facturas/${f.id}`} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{f.numero}</p>
                        <p className="text-xs text-slate-500">{fechaCorta(f.fecha)}</p>
                      </div>
                      <Etiqueta color={e.color}>{e.texto}</Etiqueta>
                      <span className="w-24 text-right text-sm font-semibold">{euros(f.total)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>
      </div>

      {editar && <FormularioCliente cliente={c} onCerrar={() => setEditar(false)} />}
      {nuevaProyecto && <FormularioProyecto clienteId={c.id} onCerrar={() => setNuevaProyecto(false)} onCreada={(o) => navegar(`/proyectos/${o.id}`)} />}
      <Confirmar
        abierto={borrar}
        titulo="¿Borrar este cliente?"
        texto="Solo se puede borrar si no tiene proyectos ni facturas."
        botonSi="Borrar"
        peligro
        onNo={() => setBorrar(false)}
        onSi={() => { setBorrar(false); eliminar.mutate(); }}
      />
    </div>
  );
}

export function FormularioCliente({ cliente, onCerrar, onCreado }: { cliente?: any; onCerrar: () => void; onCreado?: (c: any) => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: empresa } = useQuery({ queryKey: ['empresa'], queryFn: () => api('/empresa') });
  const { valores, campo } = useFormulario({
    nombre: cliente?.nombre ?? '', cif: cliente?.cif ?? '', contacto: cliente?.contacto ?? '', telefono: cliente?.telefono ?? '',
    email: cliente?.email ?? '', direccion: cliente?.direccion ?? '', cp: cliente?.cp ?? '', ciudad: cliente?.ciudad ?? '',
    provincia: cliente?.provincia ?? '', web: cliente?.web ?? '', notas: cliente?.notas ?? '',
    pago_tipo: (cliente?.pago_tipo ?? 'empresa') as 'empresa' | 'dias' | 'dia_mes', pago_valor: cliente?.pago_valor ?? '',
  });
  const diasEmpresa = empresa?.dias_vencimiento ?? 30;
  const condicion = { pago_tipo: valores.pago_tipo, pago_valor: valores.pago_valor === '' ? null : Number(valores.pago_valor) };
  const ejemplo = valores.pago_tipo === 'empresa' || condicion.pago_valor != null ? calcularVencimiento('2026-10-31', condicion, diasEmpresa) : null;
  const guardar = useMutation({
    mutationFn: () => {
      const body = { ...valores, pago_valor: valores.pago_tipo === 'empresa' || valores.pago_valor === '' ? null : valores.pago_valor };
      return cliente ? api(`/clientes/${cliente.id}`, { method: 'PATCH', body }) : api('/clientes', { method: 'POST', body });
    },
    onSuccess: (r) => { qc.invalidateQueries(); avisar(cliente ? 'Cliente guardado' : 'Cliente creado'); onCerrar(); onCreado?.(r); },
    onError: (e: Error) => avisar(e.message, true),
  });

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={cliente ? 'Editar cliente' : 'Nuevo cliente'}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton onClick={() => guardar.mutate()} cargando={guardar.isPending}>Guardar</Boton></>}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Campo etiqueta="Nombre o razón social" className="sm:col-span-2"><Entrada {...campo('nombre')} autoFocus placeholder="Café Origen S.L." /></Campo>
        <Campo etiqueta="CIF / NIF"><Entrada {...campo('cif')} /></Campo>
        <Campo etiqueta="Persona de contacto"><Entrada {...campo('contacto')} /></Campo>
        <Campo etiqueta="Teléfono"><Entrada {...campo('telefono')} type="tel" /></Campo>
        <Campo etiqueta="Correo"><Entrada {...campo('email')} type="email" /></Campo>
        <Campo etiqueta="Web" className="sm:col-span-2"><Entrada {...campo('web')} placeholder="cafeorigen.es" /></Campo>
        <Campo etiqueta="Dirección" className="sm:col-span-2"><Entrada {...campo('direccion')} /></Campo>
        <Campo etiqueta="Código postal"><Entrada {...campo('cp')} inputMode="numeric" /></Campo>
        <Campo etiqueta="Ciudad"><Entrada {...campo('ciudad')} /></Campo>
        <Campo etiqueta="Provincia"><Entrada {...campo('provincia')} /></Campo>

        <div className="sm:col-span-2 rounded-2xl bg-marca-50/60 border border-marca-100 p-4 space-y-3">
          <p className="font-semibold text-slate-800">¿Cuándo te paga?</p>
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Forma" className={valores.pago_tipo === 'empresa' ? 'col-span-2' : ''}>
              <Selector {...campo('pago_tipo')}>
                <option value="empresa">Como el resto ({textoCondicionPago(null, diasEmpresa)})</option>
                <option value="dias">A unos días de la factura</option>
                <option value="dia_mes">Un día fijo del mes siguiente</option>
              </Selector>
            </Campo>
            {valores.pago_tipo === 'dias' && (
              <Campo etiqueta="Días"><Entrada type="number" inputMode="numeric" min={0} {...campo('pago_valor')} placeholder="60" /></Campo>
            )}
            {valores.pago_tipo === 'dia_mes' && (
              <Campo etiqueta="Día del mes"><Entrada type="number" inputMode="numeric" min={1} max={31} {...campo('pago_valor')} placeholder="5" /></Campo>
            )}
          </div>
          {ejemplo && <p className="text-sm text-slate-600">Por ejemplo, una factura del 31 de octubre vencería el <b>{fecha(ejemplo)}</b>.</p>}
        </div>

        <Campo etiqueta="Notas" className="sm:col-span-2"><AreaTexto {...campo('notas')} /></Campo>
      </div>
    </Panel>
  );
}
