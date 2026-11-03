import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Briefcase, CalendarPlus, ExternalLink, FileSignature, FileText, ScrollText, FolderKanban, HandCoins, Home, LogOut, Menu, RefreshCw, Settings, ShieldCheck, UserRound, Users, Wallet, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { abrirFuera, enTelegram } from '../lib/telegram';
import { cx, useAviso } from './ui';
import { PERMISO_DE_PAGINA, usePuede } from '../lib/permisos';
import Marca from './Marca';

const menu = [
  { a: '/', texto: 'Inicio', icono: Home },
  { a: '/facturas', texto: 'Facturas', icono: FileText },
  { a: '/clientes', texto: 'Clientes', icono: Users },
  { a: '/proyectos', texto: 'Proyectos', icono: FolderKanban },
  { a: '/presupuestos', texto: 'Presupuestos', icono: FileSignature },
  { a: '/contratos', texto: 'Contratos', icono: ScrollText },
  { a: '/servicios', texto: 'Servicios', icono: RefreshCw },
  { a: '/cobros', texto: 'Cobros', icono: HandCoins },
  { a: '/empleados', texto: 'Equipo', icono: UserRound },
  { a: '/nominas', texto: 'Nóminas', icono: Wallet },
  { a: '/gestoria', texto: 'Gestoría', icono: Briefcase },
];

const Logo = () => <div className="px-4"><Marca /></div>;

function EnlaceMenu({ a, texto, icono: Icono, onClick }: (typeof menu)[number] & { onClick?: () => void }) {
  return (
    <NavLink
      to={a}
      end={a === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-3 rounded-r-full pl-5 pr-4 h-11 short:h-9 text-[15px] font-medium transition',
          isActive ? 'bg-marca-100 text-marca-700 font-semibold' : 'text-slate-600 hover:bg-slate-200/60',
        )
      }
    >
      <Icono className="size-5" />
      {texto}
    </NavLink>
  );
}

export default function Estructura({ email }: { email: string }) {
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const [menuMovil, setMenuMovil] = useState(false);
  const salir = () => supabase.auth.signOut();
  const avisar = useAviso();
  const [abriendo, setAbriendo] = useState(false);
  // Desde Telegram: la misma pantalla en el navegador, ya con la sesión iniciada
  const abrirNavegador = async () => {
    setAbriendo(true);
    try {
      const { url } = await api<{ url: string }>('/telegram/navegador', { method: 'POST', body: { ruta: pathname + window.location.search } });
      abrirFuera(url);
    } catch (e: any) {
      avisar(e.message, true);
    } finally {
      setAbriendo(false);
    }
  };
  // Solo se ve lo que el rol del usuario permite usar
  const puede = usePuede();
  const permitido = (a: string) => puede(PERMISO_DE_PAGINA.find(([p]) => p === a)?.[1] ?? 'usuarios');
  const visibles = menu.filter((m) => permitido(m.a));
  const facturar = puede('facturas');

  const lateral = (cerrar?: () => void) => (
    <>
      <div className="h-16 short:h-12 shrink-0 flex items-center"><Logo /></div>
      {facturar && <div className="px-3 mb-4 short:mb-2 shrink-0">
        <button
          onClick={() => { cerrar?.(); navegar('/facturar-mes'); }}
          className="flex items-center gap-3 rounded-2xl bg-white shadow-md hover:shadow-lg px-5 h-14 short:h-11 text-[15px] font-semibold text-slate-800 transition border border-slate-100"
        >
          <CalendarPlus className="size-5 text-marca-600" />
          Facturar el mes
        </button>
      </div>}
      <nav className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pr-3">
        {visibles.map((m) => <EnlaceMenu key={m.a} {...m} onClick={cerrar} />)}
      </nav>
      <div className="pr-3 pb-4 short:pb-2 pt-1 space-y-0.5 shrink-0 border-t border-slate-200/60">
        {puede('usuarios') && <EnlaceMenu a="/usuarios" texto="Usuarios" icono={ShieldCheck} onClick={cerrar} />}
        {puede('empresa') && <EnlaceMenu a="/ajustes" texto="Mi empresa" icono={Settings} onClick={cerrar} />}
        {enTelegram && (
          <button onClick={abrirNavegador} disabled={abriendo} className="flex w-full items-center gap-3 rounded-r-full pl-5 h-11 short:h-9 text-[15px] font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-60">
            <ExternalLink className="size-5" /> {abriendo ? 'Abriendo…' : 'Abrir en el navegador'}
          </button>
        )}
        <button onClick={salir} className="flex w-full items-center gap-3 rounded-r-full pl-5 h-11 short:h-9 text-[15px] font-medium text-slate-600 hover:bg-slate-200/60">
          <LogOut className="size-5" /> Salir
        </button>
        <p className="pl-5 pt-2 short:pt-0.5 text-xs text-slate-400 truncate">{email}</p>
      </div>
    </>
  );

  // En móvil la barra inferior se oculta dentro de un detalle para dejar sitio
  const enDetalle = /^\/(facturas|clientes|proyectos|presupuestos|contratos|servicios|empleados)\/.+/.test(pathname) || pathname === '/facturar-mes';

  return (
    <div className="flex h-full">
      {/* Escritorio */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col no-imprimir">{lateral()}</aside>

      {/* Móvil: menú completo */}
      {menuMovil && (
        <div className="md:hidden fixed inset-0 z-50 no-imprimir">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setMenuMovil(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-fondo flex flex-col shadow-2xl">
            <button onClick={() => setMenuMovil(false)} className="absolute right-3 top-4 p-2 rounded-full hover:bg-slate-200" aria-label="Cerrar menú">
              <X className="size-5" />
            </button>
            {lateral(() => setMenuMovil(false))}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col md:py-2 md:pr-2">
        {!enDetalle && (
          <header className="md:hidden flex items-center gap-2 h-14 px-2 bg-white border-b border-slate-100 no-imprimir">
            <button onClick={() => setMenuMovil(true)} className="p-2.5 rounded-full hover:bg-slate-100" aria-label="Abrir menú">
              <Menu className="size-5" />
            </button>
            <Logo />
          </header>
        )}
        <main className="relative isolate flex-1 min-h-0 overflow-hidden bg-white md:rounded-2xl md:border md:border-slate-200/70">
          {/* Marca de agua: el símbolo de la empresa, quieto detrás del contenido */}
          {/* Recortado en su propia capa: si sobresaliera, el navegador podría desplazar la pantalla al tocar un campo */}
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden no-imprimir">
            <img src="/simbolo.svg" alt="" className="select-none absolute -right-16 -bottom-16 w-[28rem] max-w-[90%] opacity-[0.04]" />
          </div>
          <Outlet />
        </main>
        {/* Barra inferior en z-20: en iOS la zona con scroll se pintaba encima y cortaba el botón central */}
        {!enDetalle && (
          <nav className="md:hidden relative z-20 grid grid-cols-5 bg-white border-t border-slate-200 pb-seguro no-imprimir">
            {visibles.slice(0, 2).map((m) => <Pestana key={m.a} {...m} />)}
            {facturar ? (
              <button onClick={() => navegar('/facturar-mes')} className="relative flex flex-col items-center justify-center -mt-5" aria-label="Facturar el mes">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-marca-600 text-white shadow-lg shadow-marca-600/30">
                  <CalendarPlus className="size-6" />
                </span>
                <span className="text-[11px] font-medium text-marca-700 mt-0.5">Facturar</span>
              </button>
            ) : visibles[4] && <Pestana {...visibles[4]} />}
            {visibles.slice(2, 4).map((m) => <Pestana key={m.a} {...m} />)}
          </nav>
        )}
      </div>
    </div>
  );
}

function Pestana({ a, texto, icono: Icono }: (typeof menu)[number]) {
  return (
    <NavLink
      to={a}
      end={a === '/'}
      className={({ isActive }) => cx('flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-medium', isActive ? 'text-marca-700' : 'text-slate-500')}
    >
      {({ isActive }) => (
        <>
          <span className={cx('flex h-7 w-14 items-center justify-center rounded-full transition', isActive && 'bg-marca-100')}>
            <Icono className="size-5" />
          </span>
          {texto}
        </>
      )}
    </NavLink>
  );
}
