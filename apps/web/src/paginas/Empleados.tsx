import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePuede } from '../lib/permisos';
import { FormularioUsuario, textoTipoRol } from './Usuarios';
import { KeyRound, Pencil, Phone, Plus, Trash2, UserX } from 'lucide-react';
import { calcularNomina, PUESTOS } from '@stella/shared';
import { UserRound } from 'lucide-react';
import { api } from '../lib/api';
import { euros, fecha, hoyISO, mesActual, nombreCompleto, nombreMes, num } from '../lib/formato';
import {
  AreaTexto, Avatar, Boton, Buscador, CabeceraDetalle, CabeceraLista, Campo, Cargando, Confirmar, Dato, Entrada, Etiqueta,
  FilaLista, Filtros, Interruptor, ListaDetalle, Panel, Selector, SinSeleccion, Tarjeta, Vacio, useAviso, useFormulario, cx,
} from '../components/ui';

export default function Empleados() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [q, setQ] = useState('');
  const [activos, setActivos] = useState<'1' | ''>('1');
  const [nuevo, setNuevo] = useState(false);
  const { data: empleados, isLoading } = useQuery({
    queryKey: ['empleados', q, activos],
    queryFn: () => api<any[]>(`/empleados?q=${encodeURIComponent(q)}&activos=${activos}`),
  });

  const lista = (
    <>
      <CabeceraLista titulo="Equipo" accion={<Boton icono={<Plus className="size-4" />} onClick={() => setNuevo(true)}>Nuevo</Boton>}>
        <Buscador valor={q} onCambio={setQ} texto="Buscar por nombre, DNI o puesto" />
        <Filtros valor={activos} onCambio={setActivos} opciones={[{ valor: '1', texto: 'En plantilla' }, { valor: '', texto: 'Todos' }]} />
      </CabeceraLista>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <Cargando /> : !empleados?.length ? (
          <Vacio icono={<UserRound className="size-7" />} titulo="Aún no hay nadie en el equipo" texto="Añade a las personas del equipo para llevar sus nóminas y en qué proyecto están." accion={<Boton onClick={() => setNuevo(true)}>Añadir persona</Boton>} />
        ) : (
          empleados.map((e) => (
            <FilaLista key={e.id} activa={e.id === id} onClick={() => navegar(`/empleados/${e.id}`)}>
              <Avatar texto={nombreCompleto(e)} />
              <div className="min-w-0 flex-1">
                <p className={cx('truncate font-semibold', !e.activo && 'text-slate-400')}>{nombreCompleto(e)}</p>
                <p className="truncate text-sm text-slate-500">{e.puesto ?? 'Sin puesto'}{e.proyecto && ` · ${e.proyecto.nombre}`}</p>
              </div>
            </FilaLista>
          ))
        )}
      </div>
    </>
  );

  return (
    <>
      <ListaDetalle hayDetalle={!!id} lista={lista} detalle={id ? <DetalleEmpleado id={id} /> : <SinSeleccion texto="Elige a alguien para ver su ficha" />} />
      {nuevo && <FormularioEmpleado onCerrar={() => setNuevo(false)} onCreado={(e) => navegar(`/empleados/${e.id}`)} />}
    </>
  );
}

function DetalleEmpleado({ id }: { id: string }) {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [editar, setEditar] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const { data: e, isLoading } = useQuery({ queryKey: ['empleado', id], queryFn: () => api(`/empleados/${id}`) });
  const { data: empresa } = useQuery({ queryKey: ['empresa'], queryFn: () => api('/empresa') });

  const eliminar = useMutation({
    mutationFn: () => api(`/empleados/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Empleado borrado'); navegar('/empleados'); },
    onError: (err: Error) => avisar(err.message, true),
  });

  if (isLoading || !e) return <Cargando />;
  const n = calcularNomina(Number(e.salario_bruto_anual), e.pagas, Number(e.irpf_pct), `${mesActual()}-01`, Number(empresa?.ss_trabajador_pct ?? 6.5), Number(empresa?.ss_empresa_pct ?? 35));
  const costeAnual = Number(e.salario_bruto_anual) * (1 + Number(empresa?.ss_empresa_pct ?? 35) / 100);

  return (
    <div className="min-h-full bg-fondo">
      <CabeceraDetalle
        volver="/empleados"
        avatar={<Avatar texto={nombreCompleto(e)} />}
        titulo={nombreCompleto(e)}
        subtitulo={<span className="flex items-center gap-2">{!e.activo && <Etiqueta>De baja</Etiqueta>}{e.puesto}</span>}
        acciones={
          <>
            <Boton variante="secundario" icono={<Pencil className="size-4" />} onClick={() => setEditar(true)}>Editar</Boton>
            {e.telefono && <a href={`tel:${e.telefono}`}><Boton variante="secundario" icono={<Phone className="size-4" />}>Llamar</Boton></a>}
            <Boton variante="fantasma" icono={<Trash2 className="size-4" />} onClick={() => setBorrar(true)} aria-label="Borrar" />
          </>
        }
      />
      <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
        <AccesoApp empleado={e} />

        <Tarjeta titulo="Sueldo">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Dato etiqueta="Bruto al año" valor={euros(e.salario_bruto_anual)} />
            <Dato etiqueta={`Neto al mes (aprox.)`} valor={euros(n.neto)} />
            <Dato etiqueta="Le cuesta a la empresa al año" valor={euros(costeAnual)} />
            <Dato etiqueta="Pagas · IRPF" valor={`${e.pagas} · ${num(e.irpf_pct)} %`} />
          </div>
        </Tarjeta>

        <Tarjeta titulo="Datos personales">
          <dl className="grid sm:grid-cols-2 gap-4">
            <Dato etiqueta="DNI / NIE" valor={e.dni} />
            <Dato etiqueta="Nº Seguridad Social" valor={e.nss} />
            <Dato etiqueta="Teléfono" valor={e.telefono} />
            <Dato etiqueta="Correo" valor={e.email} />
            <Dato etiqueta="IBAN" valor={e.iban} />
            <Dato etiqueta="Fecha de alta" valor={fecha(e.fecha_alta)} />
            <Dato etiqueta="Proyecto actual" valor={e.proyecto && <Link to={`/proyectos/${e.proyecto.id}`} className="text-marca-600">{e.proyecto.nombre}</Link>} />
            {e.notas && <Dato etiqueta="Notas" valor={e.notas} />}
          </dl>
        </Tarjeta>

        <Tarjeta titulo="Nóminas" accion={<Link to="/nominas" className="text-sm font-medium text-marca-600">Ir a nóminas</Link>}>
          {e.nominas.length === 0 ? <p className="text-sm text-slate-500">Todavía no hay nóminas.</p> : (
            <ul className="-my-2 divide-y divide-slate-100">
              {e.nominas.map((nm: any) => (
                <li key={nm.id} className="flex items-center gap-3 py-3">
                  <span className="flex-1 text-sm font-medium capitalize">{nombreMes(nm.periodo)}</span>
                  <Etiqueta color={nm.estado === 'pagada' ? 'verde' : 'naranja'}>{nm.estado === 'pagada' ? 'Pagada' : 'Pendiente'}</Etiqueta>
                  <span className="w-24 text-right text-sm font-semibold">{euros(nm.neto)}</span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      {editar && <FormularioEmpleado empleado={e} onCerrar={() => setEditar(false)} />}
      <Confirmar
        abierto={borrar}
        titulo="¿Borrar este empleado?"
        texto="Se borrarán también sus nóminas. Si se ha ido de la empresa, mejor márcalo como «de baja»."
        botonSi="Borrar"
        peligro
        onNo={() => setBorrar(false)}
        onSi={() => { setBorrar(false); eliminar.mutate(); }}
      />
    </div>
  );
}

function FormularioEmpleado({ empleado: e, onCerrar, onCreado }: { empleado?: any; onCerrar: () => void; onCreado?: (e: any) => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: proyectos } = useQuery({ queryKey: ['proyectos', '', 'activo'], queryFn: () => api<any[]>('/proyectos?estado=activo') });
  const { valores, campo, poner } = useFormulario({
    nombre: e?.nombre ?? '', apellidos: e?.apellidos ?? '', dni: e?.dni ?? '', nss: e?.nss ?? '', puesto: e?.puesto ?? '',
    telefono: e?.telefono ?? '', email: e?.email ?? '', iban: e?.iban ?? '', fecha_alta: e?.fecha_alta ?? '', fecha_baja: e?.fecha_baja ?? '',
    activo: e?.activo ?? true, salario_bruto_anual: e?.salario_bruto_anual ?? '', pagas: e?.pagas ?? 14, irpf_pct: e?.irpf_pct ?? 12,
    coste_hora: e?.coste_hora ?? '', proyecto_id: e?.proyecto_id ?? '', notas: e?.notas ?? '',
  });
  const guardar = useMutation({
    mutationFn: () => (e ? api(`/empleados/${e.id}`, { method: 'PATCH', body: valores }) : api('/empleados', { method: 'POST', body: valores })),
    onSuccess: (r) => { qc.invalidateQueries(); avisar(e ? 'Empleado guardado' : 'Empleado creado'); onCerrar(); onCreado?.(r); },
    onError: (err: Error) => avisar(err.message, true),
  });

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={e ? 'Editar empleado' : 'Nuevo empleado'}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton onClick={() => guardar.mutate()} cargando={guardar.isPending}>Guardar</Boton></>}
    >
      <div className="space-y-6">
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo etiqueta="Nombre"><Entrada {...campo('nombre')} autoFocus /></Campo>
          <Campo etiqueta="Apellidos"><Entrada {...campo('apellidos')} /></Campo>
          <Campo etiqueta="Puesto">
            <Selector {...campo('puesto')}>
              <option value="">Elige…</option>
              {PUESTOS.map((p) => <option key={p}>{p}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Proyecto donde trabaja ahora">
            <Selector {...campo('proyecto_id')}>
              <option value="">Ninguna</option>
              {proyectos?.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Teléfono"><Entrada type="tel" {...campo('telefono')} /></Campo>
          <Campo etiqueta="Correo"><Entrada type="email" {...campo('email')} /></Campo>
          <Campo etiqueta="DNI / NIE"><Entrada {...campo('dni')} /></Campo>
          <Campo etiqueta="Nº Seguridad Social"><Entrada {...campo('nss')} /></Campo>
          <Campo etiqueta="IBAN para la nómina" className="sm:col-span-2"><Entrada {...campo('iban')} /></Campo>
          <Campo etiqueta="Fecha de alta"><Entrada type="date" {...campo('fecha_alta')} /></Campo>
          <Campo etiqueta="Fecha de baja"><Entrada type="date" {...campo('fecha_baja')} /></Campo>
        </div>
        <Interruptor activo={valores.activo} onChange={(x) => poner('activo', x)} etiqueta="Está en plantilla" ayuda="Desactívalo cuando deje la empresa. No se le harán más nóminas." />

        <div className="rounded-2xl bg-marca-50/60 border border-marca-100 p-4 space-y-4">
          <p className="font-semibold">Sueldo</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Campo etiqueta="Bruto anual €" className="col-span-2 sm:col-span-1"><Entrada type="number" inputMode="decimal" {...campo('salario_bruto_anual')} placeholder="24000" /></Campo>
            <Campo etiqueta="Pagas">
              <Selector {...campo('pagas')}><option value={14}>14</option><option value={12}>12 (prorrateadas)</option></Selector>
            </Campo>
            <Campo etiqueta="IRPF %"><Entrada type="number" inputMode="decimal" {...campo('irpf_pct')} /></Campo>
            <Campo etiqueta="Coste por hora €" className="col-span-2 sm:col-span-3"><Entrada type="number" inputMode="decimal" step="0.01" {...campo('coste_hora')} placeholder="Para saber si un proyecto por horas sale rentable" /></Campo>
          </div>
        </div>

        <Campo etiqueta="Notas"><AreaTexto {...campo('notas')} /></Campo>
      </div>
    </Panel>
  );
}

/** Usuario de la app vinculado al empleado. Se gestiona aquí o en Usuarios (solo administradores). */
function AccesoApp({ empleado: e }: { empleado: any }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const puede = usePuede();
  const [alta, setAlta] = useState(false);
  const [quitar, setQuitar] = useState(false);

  const borrar = useMutation({
    mutationFn: () => api(`/usuarios/${e.acceso.usuario_id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Acceso quitado'); },
    onError: (err: Error) => avisar(err.message, true),
  });

  if (!puede('usuarios')) return null;
  return (
    <Tarjeta titulo="Acceso a la app">
      {e.acceso ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="font-medium">{e.acceso.email} <span className="ml-1"><Etiqueta color={e.acceso.rol.tipo === 'trabajador' ? 'naranja' : 'azul'}>{e.acceso.rol.nombre}</Etiqueta></span></p>
            <p className="text-sm text-slate-500">
              {textoTipoRol[e.acceso.rol.tipo as keyof typeof textoTipoRol]}.
              {e.acceso.ultimo_acceso ? ` Último acceso: ${fecha(e.acceso.ultimo_acceso)}.` : ' Todavía no ha entrado.'}
            </p>
          </div>
          <Link to="/usuarios"><Boton variante="secundario">Cambiar rol o permisos</Boton></Link>
          <Boton variante="peligro" icono={<UserX className="size-4" />} onClick={() => setQuitar(true)} cargando={borrar.isPending}>Quitar acceso</Boton>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="flex-1 text-sm text-slate-600">
            Dale un usuario para que entre en la app. Como trabajador solo verá sus nóminas y su proyecto; también puedes darle un rol de oficina.
          </p>
          <Boton variante="secundario" icono={<KeyRound className="size-4" />} onClick={() => setAlta(true)} disabled={!e.activo}>
            Dar de alta como usuario
          </Boton>
        </div>
      )}
      {alta && <FormularioUsuario empleadoId={e.id} emailInicial={e.email ?? ''} onCerrar={() => setAlta(false)} />}
      <Confirmar
        abierto={quitar}
        titulo="¿Quitar el acceso?"
        texto="Su usuario se borra y ya no podrá entrar. Su ficha y sus nóminas no se tocan."
        botonSi="Quitar acceso"
        peligro
        onNo={() => setQuitar(false)}
        onSi={() => { setQuitar(false); borrar.mutate(); }}
      />
    </Tarjeta>
  );
}
