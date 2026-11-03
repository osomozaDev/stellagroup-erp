import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, Copy, KeyRound, Plus, Send, Share2, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { PERMISOS, PUESTOS } from '@stella/shared';
import { api } from '../lib/api';
import { fecha, nombreCompleto } from '../lib/formato';
import {
  Avatar, Boton, Campo, Cargando, Confirmar, Entrada, Etiqueta, Filtros, Interruptor, Panel, Selector, Tarjeta, cx, useAviso,
} from '../components/ui';

type Rol = { id: string; nombre: string; tipo: 'admin' | 'oficina' | 'trabajador'; permisos: string[]; sistema: boolean; usuarios: number };
type Usuario = {
  id: string; email: string; ultimo_acceso: string | null; soy_yo: boolean;
  rol: { id: string; nombre: string; tipo: Rol['tipo']; permisos: string[] } | null;
  permisos: string[] | null;
  empleado: { id: string; nombre: string; apellidos: string | null; puesto: string | null } | null;
};

const colorRol = { admin: 'azul', oficina: 'gris', trabajador: 'naranja' } as const;
export const textoTipoRol = { admin: 'Ve y gestiona todo', oficina: 'Ve los módulos marcados', trabajador: 'Solo su proyecto y sus nóminas' };

/** Contraseña inicial sin letras que se confunden (l, 1, O, 0) para poder dictarla */
export function contrasenaAleatoria() {
  const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => letras[n % letras.length]).join('');
}

export default function Usuarios() {
  const [pestana, setPestana] = useState<'usuarios' | 'roles'>('usuarios');
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
          <p className="text-slate-500 mt-1">Quién entra en la app y qué puede ver cada uno.</p>
        </div>
        <Filtros valor={pestana} onCambio={setPestana} opciones={[{ valor: 'usuarios', texto: 'Usuarios' }, { valor: 'roles', texto: 'Roles y permisos' }]} />
        {pestana === 'usuarios' ? <ListaUsuarios /> : <ListaRoles />}
      </div>
    </div>
  );
}

function ListaUsuarios() {
  const { data: usuarios, isLoading } = useQuery({ queryKey: ['usuarios'], queryFn: () => api<Usuario[]>('/usuarios') });
  const [abierto, setAbierto] = useState<Usuario | 'nuevo' | null>(null);
  if (isLoading || !usuarios) return <Cargando />;

  return (
    <>
      <div className="flex justify-end">
        <Boton icono={<UserPlus className="size-4" />} onClick={() => setAbierto('nuevo')}>Nuevo usuario</Boton>
      </div>
      <div className="rounded-2xl border border-slate-200/70 bg-white overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {usuarios.map((u) => (
            <li key={u.id}>
              <button onClick={() => setAbierto(u)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <Avatar texto={u.empleado ? nombreCompleto(u.empleado) : u.email} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {u.empleado ? nombreCompleto(u.empleado) : u.email}
                    {u.soy_yo && <span className="ml-2 text-xs font-normal text-slate-500">(tú)</span>}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {u.empleado ? `${u.email}${u.empleado.puesto ? ` · ${u.empleado.puesto}` : ''}` : 'Sin vincular a ningún empleado'}
                    {' · '}
                    {u.ultimo_acceso ? `entró el ${fecha(u.ultimo_acceso)}` : 'todavía no ha entrado'}
                  </p>
                </div>
                {u.rol ? <Etiqueta color={colorRol[u.rol.tipo]}>{u.rol.nombre}{u.permisos ? ' *' : ''}</Etiqueta> : <Etiqueta color="rojo">Sin rol</Etiqueta>}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-slate-500">* Con permisos personalizados, distintos de los de su rol.</p>
      {abierto && <FormularioUsuario usuario={abierto === 'nuevo' ? undefined : abierto} onCerrar={() => setAbierto(null)} />}
    </>
  );
}

/** Crear o editar un usuario. `empleadoId` lo usa la ficha del empleado para darle de alta directamente. */
export function FormularioUsuario({ usuario, empleadoId, emailInicial, onCerrar }: { usuario?: Usuario; empleadoId?: string; emailInicial?: string; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => api<Rol[]>('/roles') });
  const { data: empleados } = useQuery({ queryKey: ['empleados', '', ''], queryFn: () => api<any[]>('/empleados?activos=') });
  const { data: usuarios } = useQuery({ queryKey: ['usuarios'], queryFn: () => api<Usuario[]>('/usuarios') });

  const [email, setEmail] = useState(usuario?.email ?? emailInicial ?? '');
  const [clave, setClave] = useState(usuario ? '' : contrasenaAleatoria());
  const [rolId, setRolId] = useState(usuario?.rol?.id ?? '');
  const [empleado, setEmpleado] = useState(usuario?.empleado?.id ?? empleadoId ?? '');
  // «nueva»: se crea la ficha de empleado a la vez que se guarda el usuario
  const [ficha, setFicha] = useState({ nombre: '', apellidos: '', puesto: '' });
  const [personalizar, setPersonalizar] = useState(!!usuario?.permisos);
  const [permisos, setPermisos] = useState<string[]>(usuario?.permisos ?? usuario?.rol?.permisos ?? []);
  const [borrar, setBorrar] = useState(false);

  // Por defecto, quien se da de alta desde su ficha de empleado entra como Trabajador
  const rolPorDefecto = roles?.find((r) => r.tipo === (empleadoId ? 'trabajador' : 'oficina'))?.id;
  const rol = roles?.find((r) => r.id === (rolId || rolPorDefecto));
  const ocupados = new Set((usuarios ?? []).filter((u) => u.id !== usuario?.id && u.empleado).map((u) => u.empleado!.id));

  const elegirRol = (id: string) => {
    setRolId(id);
    const r = roles?.find((x) => x.id === id);
    if (r && !personalizar) setPermisos(r.permisos);
  };
  const alternar = (clave: string) => setPermisos((ps) => (ps.includes(clave) ? ps.filter((p) => p !== clave) : [...ps, clave]));

  const guardar = useMutation({
    mutationFn: async () => {
      let empleadoId = empleado === 'nueva' ? null : empleado || null;
      if (empleado === 'nueva') {
        if (ficha.nombre.trim().length < 2) throw new Error('Escribe el nombre de la persona para crear su ficha');
        const e = await api<any>('/empleados', {
          method: 'POST',
          body: { ...ficha, email: usuario?.email ?? email, activo: true, salario_bruto_anual: 0, irpf_pct: 0, pagas: 14 },
        });
        empleadoId = e.id;
      }
      const datos = { rol_id: rol?.id, empleado_id: empleadoId, permisos: rol?.tipo === 'oficina' && personalizar ? permisos : null };
      return usuario
        ? api(`/usuarios/${usuario.id}`, { method: 'PATCH', body: datos })
        : api('/usuarios', { method: 'POST', body: { ...datos, email, password: clave } });
    },
    onSuccess: () => { qc.invalidateQueries(); avisar(usuario ? 'Usuario guardado' : 'Usuario creado'); onCerrar(); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const cambiarClave = useMutation({
    mutationFn: () => api(`/usuarios/${usuario!.id}/contrasena`, { method: 'POST', body: { password: clave } }),
    onSuccess: () => avisar('Contraseña cambiada. Pásale la nueva.'),
    onError: (e: Error) => avisar(e.message, true),
  });
  const eliminar = useMutation({
    mutationFn: () => api(`/usuarios/${usuario!.id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Usuario borrado'); onCerrar(); },
    onError: (e: Error) => avisar(e.message, true),
  });

  const copiar = () => navigator.clipboard?.writeText(clave).then(() => avisar('Contraseña copiada'));

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={usuario ? usuario.email : 'Nuevo usuario'}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton onClick={() => guardar.mutate()} cargando={guardar.isPending} disabled={!rol}>{usuario ? 'Guardar' : 'Crear usuario'}</Boton></>}
    >
      <div className="space-y-5">
        {!usuario && (
          <>
            <Campo etiqueta="Email con el que entrará"><Entrada type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@correo.com" autoFocus /></Campo>
            <Campo etiqueta="Contraseña inicial" ayuda="Pásasela tú (por WhatsApp o en mano). Mínimo 8 caracteres.">
              <div className="flex gap-2">
                <Entrada value={clave} onChange={(e) => setClave(e.target.value)} className="font-mono" />
                <Boton variante="secundario" icono={<Copy className="size-4" />} onClick={copiar}>Copiar</Boton>
              </div>
            </Campo>
          </>
        )}

        <Campo etiqueta="Rol">
          <Selector value={rol?.id ?? ''} onChange={(e) => elegirRol(e.target.value)}>
            {roles?.map((r) => <option key={r.id} value={r.id}>{r.nombre} — {textoTipoRol[r.tipo]}</option>)}
          </Selector>
        </Campo>

        <div className="space-y-3">
          <Campo
            etiqueta="Empleado"
            ayuda={rol?.tipo === 'trabajador' ? 'Obligatorio: es lo que verá en su portal.' : 'Para saber quién es cada usuario: su nombre sale en la app y en los correos que envía.'}
          >
            <Selector value={empleado} onChange={(e) => setEmpleado(e.target.value)} disabled={!!empleadoId}>
              <option value="">Sin vincular</option>
              {empleados?.filter((e) => !ocupados.has(e.id) || e.id === empleado).map((e) => (
                <option key={e.id} value={e.id}>{nombreCompleto(e)}{e.puesto ? ` · ${e.puesto}` : ''}{e.activo ? '' : ' (de baja)'}</option>
              ))}
              {!empleadoId && <option value="nueva">+ Crear su ficha de empleado…</option>}
            </Selector>
          </Campo>
          {empleado === 'nueva' && (
            <div className="grid sm:grid-cols-2 gap-3 rounded-2xl border border-marca-100 bg-marca-50/50 p-4">
              <Campo etiqueta="Nombre"><Entrada value={ficha.nombre} onChange={(e) => setFicha({ ...ficha, nombre: e.target.value })} /></Campo>
              <Campo etiqueta="Apellidos"><Entrada value={ficha.apellidos} onChange={(e) => setFicha({ ...ficha, apellidos: e.target.value })} /></Campo>
              <Campo etiqueta="Puesto" className="sm:col-span-2">
                <Entrada value={ficha.puesto} onChange={(e) => setFicha({ ...ficha, puesto: e.target.value })} list="puestos-usuario" placeholder="Comercial, Desarrollador/a…" />
                <datalist id="puestos-usuario">{PUESTOS.map((p) => <option key={p} value={p} />)}</datalist>
              </Campo>
              <p className="sm:col-span-2 text-xs text-slate-500">El sueldo y el resto de datos se completan luego en Equipo.</p>
            </div>
          )}
        </div>

        {rol?.tipo === 'oficina' && (
          <div className="space-y-3">
            <Interruptor
              activo={personalizar}
              onChange={(v) => { setPersonalizar(v); if (!v) setPermisos(rol.permisos); }}
              etiqueta="Permisos personalizados"
              ayuda={`Si lo dejas apagado, tendrá los del rol «${rol.nombre}».`}
            />
            <ListaPermisos permisos={personalizar ? permisos : rol.permisos} onAlternar={personalizar ? alternar : undefined} />
          </div>
        )}

        {usuario && (
          <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
            <p className="font-semibold">Cambiar contraseña</p>
            <div className="flex gap-2">
              <Entrada value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Nueva contraseña" className="font-mono" />
              <Boton variante="fantasma" onClick={() => setClave(contrasenaAleatoria())}>Generar</Boton>
            </div>
            <div className="flex gap-2">
              <Boton variante="secundario" icono={<KeyRound className="size-4" />} onClick={() => cambiarClave.mutate()} cargando={cambiarClave.isPending} disabled={clave.length < 8}>Cambiar</Boton>
              {clave && <Boton variante="fantasma" icono={<Copy className="size-4" />} onClick={copiar}>Copiar</Boton>}
            </div>
          </div>
        )}

        {usuario && <TelegramUsuario usuario={usuario} />}

        {usuario && !usuario.soy_yo && (
          <Boton variante="peligro" icono={<Trash2 className="size-4" />} onClick={() => setBorrar(true)}>Borrar usuario</Boton>
        )}
        {usuario?.empleado && (
          <p className="text-sm text-slate-500">Ficha: <Link to={`/empleados/${usuario.empleado.id}`} className="text-marca-600 font-medium" onClick={onCerrar}>{nombreCompleto(usuario.empleado)}</Link></p>
        )}
      </div>
      <Confirmar
        abierto={borrar}
        titulo="¿Borrar este usuario?"
        texto="Ya no podrá entrar. Su ficha de empleado, si tiene, no se toca."
        botonSi="Borrar"
        peligro
        onNo={() => setBorrar(false)}
        onSi={() => { setBorrar(false); eliminar.mutate(); }}
      />
    </Panel>
  );
}

/**
 * Enlace para que un usuario conecte su Telegram sin entrar en la app: se le manda
 * por WhatsApp o como sea y, al abrirlo, el bot le conecta a esta cuenta.
 */
function TelegramUsuario({ usuario }: { usuario: Usuario }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const clave = ['telegram-usuario', usuario.id];
  const [enlace, setEnlace] = useState<{ enlace: string; caduca: string } | null>(null);
  const { data } = useQuery({
    queryKey: clave,
    queryFn: () => api<{ configurado: boolean; conectado: boolean; nombre: string | null; vinculado_en: string | null; enlace_caduca: string | null }>(`/usuarios/${usuario.id}/telegram`),
    // Con un enlace recién generado, se mira cada pocos segundos si ya lo ha abierto
    refetchInterval: (q) => (enlace && !q.state.data?.conectado ? 4000 : false),
  });
  const generar = useMutation({
    mutationFn: () => api<{ enlace: string; caduca: string }>(`/usuarios/${usuario.id}/telegram`, { method: 'POST' }),
    onSuccess: (r) => { setEnlace(r); qc.invalidateQueries({ queryKey: clave }); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const desconectar = useMutation({
    mutationFn: () => api(`/usuarios/${usuario.id}/telegram`, { method: 'DELETE' }),
    onSuccess: () => { setEnlace(null); qc.invalidateQueries({ queryKey: clave }); avisar('Telegram desconectado'); },
    onError: (e: Error) => avisar(e.message, true),
  });

  if (!data) return null;
  const mensaje = enlace && `Hola, para recibir los avisos de la app y abrirla desde Telegram, pulsa este enlace y luego «Iniciar»:\n${enlace.enlace}`;
  const copiar = async () => {
    await navigator.clipboard.writeText(enlace!.enlace);
    avisar('Enlace copiado');
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <p className="flex items-center gap-2 font-semibold"><Send className="size-4 text-marca-600" /> Telegram</p>
      {!data.configurado ? (
        <p className="text-sm text-slate-500">El bot de Telegram aún no está configurado.</p>
      ) : data.conectado ? (
        <>
          <p className="text-sm text-emerald-700">
            Conectado{data.nombre ? ` como ${data.nombre}` : ''}{data.vinculado_en ? ` desde el ${fecha(data.vinculado_en)}` : ''}.
          </p>
          <Boton variante="secundario" onClick={() => desconectar.mutate()} cargando={desconectar.isPending}>Desconectar</Boton>
        </>
      ) : enlace ? (
        <>
          <p className="text-sm text-slate-600">Mándale este enlace. Al abrirlo y pulsar «Iniciar» quedará conectado; esta pantalla se actualizará sola.</p>
          <Entrada readOnly value={enlace.enlace} onFocus={(e) => e.target.select()} className="font-mono text-sm" />
          <div className="flex flex-wrap gap-2">
            <Boton variante="secundario" icono={<Copy className="size-4" />} onClick={copiar}>Copiar</Boton>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(mensaje!)}`}
              target="_blank"
              rel="noopener"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Share2 className="size-4" /> Enviar por WhatsApp
            </a>
          </div>
          <p className="text-xs text-amber-700">
            Quien abra este enlace entrará en la app como {usuario.email}. Mándaselo solo a esa persona. Sirve una vez y caduca el {fecha(enlace.caduca)}.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {data.enlace_caduca
              ? `Tiene un enlace sin usar hasta el ${fecha(data.enlace_caduca)}. Si lo generas otra vez, el anterior deja de valer.`
              : 'Genera un enlace y mándaselo: al abrirlo, su Telegram queda conectado a este usuario, sin que tenga que entrar en la app.'}
          </p>
          <Boton variante="secundario" icono={<Send className="size-4" />} onClick={() => generar.mutate()} cargando={generar.isPending}>
            Generar enlace
          </Boton>
        </>
      )}
    </div>
  );
}

function ListaPermisos({ permisos, onAlternar }: { permisos: string[]; onAlternar?: (p: string) => void }) {
  return (
    <ul className="grid sm:grid-cols-2 gap-2">
      {PERMISOS.map((p) => {
        const si = permisos.includes(p.clave);
        return (
          <li key={p.clave}>
            <button
              type="button"
              disabled={!onAlternar}
              onClick={() => onAlternar?.(p.clave)}
              className={cx('flex w-full items-start gap-3 rounded-xl border p-3 text-left transition', si ? 'border-marca-200 bg-marca-50/60' : 'border-slate-200', onAlternar ? 'hover:bg-slate-50' : 'cursor-default')}
            >
              <span className={cx('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2', si ? 'border-marca-600 bg-marca-600 text-white' : 'border-slate-300 bg-white')}>
                {si && <Check className="size-3.5" strokeWidth={3} />}
              </span>
              <span>
                <span className="block text-sm font-semibold">{p.nombre}</span>
                <span className="block text-xs text-slate-500">{p.descripcion}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ListaRoles() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: roles, isLoading } = useQuery({ queryKey: ['roles'], queryFn: () => api<Rol[]>('/roles') });
  const [editando, setEditando] = useState<Rol | 'nuevo' | null>(null);
  const [nombre, setNombre] = useState('');
  const [permisos, setPermisos] = useState<string[]>([]);
  const [borrar, setBorrar] = useState<Rol | null>(null);

  const abrir = (r: Rol | 'nuevo') => {
    setEditando(r);
    setNombre(r === 'nuevo' ? '' : r.nombre);
    setPermisos(r === 'nuevo' ? ['inicio'] : r.permisos);
  };
  const guardar = useMutation({
    mutationFn: () =>
      editando === 'nuevo'
        ? api('/roles', { method: 'POST', body: { nombre, permisos } })
        : api(`/roles/${(editando as Rol).id}`, { method: 'PATCH', body: { nombre, permisos } }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Rol guardado'); setEditando(null); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const eliminar = useMutation({
    mutationFn: (r: Rol) => api(`/roles/${r.id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Rol borrado'); },
    onError: (e: Error) => avisar(e.message, true),
  });

  if (isLoading || !roles) return <Cargando />;
  return (
    <>
      <div className="flex justify-end">
        <Boton icono={<Plus className="size-4" />} onClick={() => abrir('nuevo')}>Nuevo rol</Boton>
      </div>
      <div className="grid gap-3">
        {roles.map((r) => (
          <Tarjeta key={r.id}>
            <div className="flex flex-wrap items-center gap-3">
              <ShieldCheck className="size-5 text-marca-600" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{r.nombre}</p>
                <p className="text-sm text-slate-500">
                  {r.tipo === 'oficina' ? (r.permisos.length ? PERMISOS.filter((p) => r.permisos.includes(p.clave)).map((p) => p.nombre).join(', ') : 'Sin permisos') : textoTipoRol[r.tipo]}
                  {' · '}{r.usuarios === 1 ? '1 usuario' : `${r.usuarios} usuarios`}
                </p>
              </div>
              {r.tipo === 'oficina' && <Boton variante="secundario" onClick={() => abrir(r)}>Editar</Boton>}
              {!r.sistema && <Boton variante="fantasma" icono={<Trash2 className="size-4" />} onClick={() => setBorrar(r)} aria-label="Borrar rol" />}
            </div>
          </Tarjeta>
        ))}
      </div>
      {editando && (
        <Panel
          abierto
          onCerrar={() => setEditando(null)}
          titulo={editando === 'nuevo' ? 'Nuevo rol' : `Rol «${editando.nombre}»`}
          pie={<><Boton variante="secundario" onClick={() => setEditando(null)}>Cancelar</Boton><Boton onClick={() => guardar.mutate()} cargando={guardar.isPending}>Guardar</Boton></>}
        >
          <div className="space-y-5">
            <Campo etiqueta="Nombre" ayuda={editando !== 'nuevo' && editando.sistema ? 'Es un rol de partida: el nombre no se cambia.' : 'Por ejemplo: Encargado, Contabilidad…'}>
              <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={editando !== 'nuevo' && editando.sistema} />
            </Campo>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Qué puede ver y hacer</p>
              <ListaPermisos permisos={permisos} onAlternar={(p) => setPermisos((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]))} />
            </div>
            <p className="text-xs text-slate-500">La gestión de usuarios solo la tienen los administradores.</p>
          </div>
        </Panel>
      )}
      <Confirmar
        abierto={!!borrar}
        titulo={`¿Borrar el rol «${borrar?.nombre}»?`}
        texto="Solo se puede si nadie lo tiene."
        botonSi="Borrar"
        peligro
        onNo={() => setBorrar(null)}
        onSi={() => { if (borrar) eliminar.mutate(borrar); setBorrar(null); }}
      />
    </>
  );
}
