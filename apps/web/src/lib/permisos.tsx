import { createContext, ReactNode, useContext } from 'react';
import { Navigate } from 'react-router-dom';

export interface Yo {
  tipo: 'admin' | 'oficina' | 'trabajador';
  rol: string;
  permisos: string[];
  email: string | null;
  nombre?: string | null;
}

const PermisosCtx = createContext<Yo | null>(null);
export const ProveedorPermisos = ({ yo, children }: { yo: Yo; children: ReactNode }) => (
  <PermisosCtx.Provider value={yo}>{children}</PermisosCtx.Provider>
);

/** ¿Puede el usuario actual usar este módulo? (la API lo vuelve a comprobar) */
export function usePuede() {
  const yo = useContext(PermisosCtx);
  return (permiso: string) => !!yo && (yo.tipo === 'admin' || yo.permisos.includes(permiso));
}
export const useYo = () => useContext(PermisosCtx);

/** Permiso que necesita cada pantalla */
export const PERMISO_DE_PAGINA: [string, string][] = [
  ['/', 'inicio'],
  ['/facturar-mes', 'facturas'],
  ['/facturas', 'facturas'],
  ['/clientes', 'clientes'],
  ['/proyectos', 'proyectos'],
  ['/empleados', 'empleados'],
  ['/nominas', 'nominas'],
  ['/presupuestos', 'presupuestos'],
  ['/servicios', 'servicios'],
  ['/cobros', 'cobros'],
  ['/gestoria', 'gestoria'],
  ['/ajustes', 'empresa'],
  ['/usuarios', 'usuarios'],
];

/** Envuelve una pantalla: si no hay permiso, lleva a la primera que sí tenga */
export function ConPermiso({ permiso, children }: { permiso: string; children: ReactNode }) {
  const puede = usePuede();
  if (puede(permiso)) return <>{children}</>;
  const destino = PERMISO_DE_PAGINA.find(([, p]) => puede(p))?.[0];
  if (destino) return <Navigate to={destino} replace />;
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-slate-500">
      Tu usuario todavía no tiene permisos. Pídeselos al administrador.
    </div>
  );
}
