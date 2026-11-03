import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Boton, Cargando } from './components/ui';
import { api } from './lib/api';
import { initDataTelegram, tokenEntrada } from './lib/telegram';
import Portal from './paginas/Portal';
import Usuarios from './paginas/Usuarios';
import { ConPermiso, ProveedorPermisos, Yo } from './lib/permisos';
import Estructura from './components/Estructura';
import Entrar from './paginas/Entrar';
import Inicio from './paginas/Inicio';
import Facturas from './paginas/Facturas';
import FacturarMes from './paginas/FacturarMes';
import Clientes from './paginas/Clientes';
import Proyectos from './paginas/Proyectos';
import Empleados from './paginas/Empleados';
import Nominas from './paginas/Nominas';
import Ajustes from './paginas/Ajustes';
import Cobros from './paginas/Cobros';
import Gestoria from './paginas/Gestoria';
import Presupuestos from './paginas/Presupuestos';
import Servicios from './paginas/Servicios';
import Contratos from './paginas/Contratos';
import Firmar from './paginas/Firmar';
import PortalClientes from './paginas/PortalClientes';

/** /portal es el portal de clientes y /firmar la firma de documentos, con su propio acceso; todo lo demás, la app de la oficina */
export default function App() {
  const ruta = window.location.pathname.replace(/\/$/, '');
  if (ruta === '/portal') return <PortalClientes />;
  if (ruta === '/firmar') return <Firmar />;
  return <AppOficina />;
}

// Una sola vez aunque React monte la app dos veces: el enlace solo vale para un uso
let canje: Promise<void> | null = null;
const canjearEntrada = () =>
  (canje ??= supabase.auth.verifyOtp({ token_hash: tokenEntrada!, type: 'magiclink' }).then(({ error }) => { if (error) throw error; }));

function AppOficina() {
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined);
  const qc = useQueryClient();
  // Dentro de Telegram se entra solo con la cuenta conectada; si no se puede, se pide el correo
  const [entrandoTelegram, setEntrandoTelegram] = useState(!!initDataTelegram || !!tokenEntrada);
  const [errorTelegram, setErrorTelegram] = useState<string | null>(null);

  // Llegando desde «Abrir en el navegador»: entra con el usuario de Telegram aunque aquí hubiera otra sesión
  useEffect(() => {
    if (!tokenEntrada) return;
    canjearEntrada()
      .catch(() => setErrorTelegram('Este enlace ya se ha usado o ha caducado. Vuelve a pulsar «Abrir en el navegador» en Telegram, o entra con tu correo.'))
      .finally(() => setEntrandoTelegram(false));
  }, []);

  useEffect(() => {
    if (!initDataTelegram || sesion !== null || !entrandoTelegram) return;
    api<{ token_hash: string }>('/telegram/entrar', { method: 'POST', body: { initData: initDataTelegram } })
      .then(({ token_hash }) => supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }))
      .then(({ error }) => { if (error) throw error; })
      .catch((e: Error) => setErrorTelegram(e.message))
      .finally(() => setEntrandoTelegram(false));
  }, [sesion, entrandoTelegram]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      // Al cambiar de usuario no puede quedar nada en caché del anterior
      if (!s) qc.clear();
      setSesion(s);
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  // Rol de quien ha entrado: un trabajador solo ve su portal
  const yo = useQuery({ queryKey: ['yo', sesion?.user.id], queryFn: () => api<Yo>('/yo'), enabled: !!sesion, retry: false });

  if (sesion === undefined) return <Cargando />;
  if (entrandoTelegram && (!sesion || tokenEntrada)) return <Cargando />;
  if (!sesion) return <Entrar aviso={errorTelegram} />;
  if (yo.isLoading) return <Cargando />;
  if (yo.isError) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="max-w-sm text-slate-600">{(yo.error as Error).message}</p>
        <Boton variante="secundario" onClick={() => supabase.auth.signOut()}>Salir</Boton>
      </div>
    );
  }
  if (!yo.data) return <Cargando />;
  if (yo.data.tipo === 'trabajador') return <Portal />;

  return (
    <ProveedorPermisos yo={yo.data}>
    <Routes>
      <Route element={<Estructura email={sesion.user.email ?? ''} />}>
        <Route index element={<ConPermiso permiso="inicio"><Inicio /></ConPermiso>} />
        <Route path="facturas/:id?" element={<ConPermiso permiso="facturas"><Facturas /></ConPermiso>} />
        <Route path="facturar-mes" element={<ConPermiso permiso="facturas"><FacturarMes /></ConPermiso>} />
        <Route path="clientes/:id?" element={<ConPermiso permiso="clientes"><Clientes /></ConPermiso>} />
        <Route path="proyectos/:id?" element={<ConPermiso permiso="proyectos"><Proyectos /></ConPermiso>} />
        <Route path="empleados/:id?" element={<ConPermiso permiso="empleados"><Empleados /></ConPermiso>} />
        <Route path="nominas" element={<ConPermiso permiso="nominas"><Nominas /></ConPermiso>} />
        <Route path="presupuestos/:id?" element={<ConPermiso permiso="presupuestos"><Presupuestos /></ConPermiso>} />
        <Route path="contratos/:id?" element={<ConPermiso permiso="contratos"><Contratos /></ConPermiso>} />
        <Route path="servicios/:id?" element={<ConPermiso permiso="servicios"><Servicios /></ConPermiso>} />
        <Route path="cobros" element={<ConPermiso permiso="cobros"><Cobros /></ConPermiso>} />
        <Route path="gestoria" element={<ConPermiso permiso="gestoria"><Gestoria /></ConPermiso>} />
        <Route path="ajustes" element={<ConPermiso permiso="empresa"><Ajustes /></ConPermiso>} />
        <Route path="usuarios" element={<ConPermiso permiso="usuarios"><Usuarios /></ConPermiso>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </ProveedorPermisos>
  );
}
