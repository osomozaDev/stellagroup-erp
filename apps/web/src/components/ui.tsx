import { Children, cloneElement, createContext, Fragment, isValidElement, ReactElement, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, Search, X, AlertCircle, ArrowLeft, MoreHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { iniciales } from '../lib/formato';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ───────────── Botones ─────────────

type Variante = 'principal' | 'secundario' | 'fantasma' | 'peligro';
const variantes: Record<Variante, string> = {
  principal: 'bg-marca-600 text-white hover:bg-marca-700 shadow-sm',
  secundario: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
  fantasma: 'text-slate-600 hover:bg-slate-100',
  peligro: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
};

export function Boton({
  variante = 'principal',
  icono,
  children,
  className,
  cargando,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; icono?: ReactNode; cargando?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || cargando}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 h-11 md:h-10 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
        variantes[variante],
        className,
      )}
    >
      {cargando ? <span className="size-4 rounded-full border-2 border-current border-r-transparent animate-spin" /> : icono}
      {children}
    </button>
  );
}

// ───────────── Formularios ─────────────

export function Campo({ etiqueta, ayuda, children, className }: { etiqueta: string; ayuda?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="block text-sm font-medium text-slate-700 mb-1.5">{etiqueta}</span>
      {children}
      {ayuda && <span className="block text-xs text-slate-500 mt-1">{ayuda}</span>}
    </label>
  );
}

const claseInput =
  'w-full h-11 md:h-10 rounded-xl border border-slate-200 bg-white px-3 text-slate-800 placeholder:text-slate-400 outline-none focus:border-marca-500 focus:ring-4 focus:ring-marca-100 transition';

export const Entrada = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} value={props.value ?? ''} className={cx(claseInput, props.className)} />
);

export const Selector = ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} value={props.value ?? ''} className={cx(claseInput, 'pr-8', props.className)}>
    {children}
  </select>
);

export const AreaTexto = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} value={props.value ?? ''} className={cx(claseInput, 'h-auto md:h-auto min-h-20 py-2.5', props.className)} />
);

export function Interruptor({ activo, onChange, etiqueta, ayuda }: { activo: boolean; onChange: (v: boolean) => void; etiqueta: string; ayuda?: string }) {
  return (
    <button type="button" onClick={() => onChange(!activo)} className="flex w-full items-start gap-3 text-left rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50">
      <span className={cx('mt-0.5 relative inline-flex h-6 w-10 shrink-0 rounded-full transition', activo ? 'bg-marca-600' : 'bg-slate-300')}>
        <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition', activo ? 'left-[18px]' : 'left-0.5')} />
      </span>
      <span>
        <span className="block text-sm font-medium text-slate-800">{etiqueta}</span>
        {ayuda && <span className="block text-xs text-slate-500 mt-0.5">{ayuda}</span>}
      </span>
    </button>
  );
}

/** Estado de formulario sencillo */
export function useFormulario<T extends Record<string, any>>(inicial: T) {
  const [valores, setValores] = useState<T>(inicial);
  const campo = (nombre: keyof T) => ({
    name: String(nombre),
    value: valores[nombre] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValores((v) => ({ ...v, [nombre]: e.target.value })),
  });
  const poner = (nombre: keyof T, valor: any) => setValores((v) => ({ ...v, [nombre]: valor }));
  return { valores, setValores, campo, poner };
}

// ───────────── Panel lateral (formularios) ─────────────

export function Panel({
  abierto,
  onCerrar,
  titulo,
  children,
  pie,
  ancho = 'max-w-xl',
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: string;
}) {
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end no-imprimir">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" onClick={onCerrar} />
      <div className={cx('relative flex h-full w-full flex-col bg-white shadow-2xl md:rounded-l-2xl', ancho)}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 md:px-6 h-16 shrink-0">
          <button onClick={onCerrar} className="-ml-2 rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X className="size-5" />
          </button>
          <h2 className="text-lg font-semibold">{titulo}</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5">{children}</div>
        {pie && <div className="flex gap-2 justify-end border-t border-slate-100 px-4 md:px-6 py-3 pb-seguro bg-white">{pie}</div>}
      </div>
    </div>
  );
}

export function Confirmar({ abierto, titulo, texto, onSi, onNo, botonSi = 'Sí, continuar', peligro }: { abierto: boolean; titulo: string; texto: string; onSi: () => void; onNo: () => void; botonSi?: string; peligro?: boolean }) {
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onNo} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="text-base font-semibold">{titulo}</h3>
        <p className="mt-1.5 text-sm text-slate-600">{texto}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Boton variante="secundario" onClick={onNo}>Cancelar</Boton>
          <Boton variante={peligro ? 'peligro' : 'principal'} onClick={onSi}>{botonSi}</Boton>
        </div>
      </div>
    </div>
  );
}

// ───────────── Avisos ─────────────

type Aviso = { id: number; texto: string; error?: boolean };
const AvisosCtx = createContext<(texto: string, error?: boolean) => void>(() => {});
export const useAviso = () => useContext(AvisosCtx);

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((texto: string, error?: boolean) => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, error }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <AvisosCtx.Provider value={avisar}>
      {children}
      <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-md no-imprimir">
        {avisos.map((a) => (
          <div key={a.id} className={cx('flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg', a.error ? 'bg-red-600' : 'bg-slate-900')}>
            {a.error ? <AlertCircle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />}
            {a.texto}
          </div>
        ))}
      </div>
    </AvisosCtx.Provider>
  );
}

// ───────────── Piezas de lista / detalle ─────────────

const coloresEtiqueta = {
  gris: 'bg-slate-100 text-slate-600',
  verde: 'bg-emerald-50 text-emerald-700',
  azul: 'bg-marca-50 text-marca-700',
  naranja: 'bg-amber-50 text-amber-700',
  rojo: 'bg-red-50 text-red-700',
};
export type ColorEtiqueta = keyof typeof coloresEtiqueta;

export const Etiqueta = ({ color = 'gris', children }: { color?: ColorEtiqueta; children: ReactNode }) => (
  <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', coloresEtiqueta[color])}>{children}</span>
);

const fondosAvatar = ['bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-teal-100 text-teal-700'];
export function Avatar({ texto, grande }: { texto: string; grande?: boolean }) {
  const i = [...texto].reduce((s, c) => s + c.charCodeAt(0), 0) % fondosAvatar.length;
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', fondosAvatar[i], grande ? 'size-14 text-lg' : 'size-10 text-sm')}>
      {iniciales(texto) || '?'}
    </span>
  );
}

export function Buscador({ valor, onCambio, texto }: { valor: string; onCambio: (v: string) => void; texto: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
      <input
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={texto}
        className="w-full h-11 rounded-full bg-slate-100 pl-10 pr-4 outline-none focus:bg-white focus:ring-4 focus:ring-marca-100 border border-transparent focus:border-marca-200 transition"
      />
    </div>
  );
}

export function Filtros<T extends string>({ opciones, valor, onCambio }: { opciones: { valor: T; texto: string }[]; valor: T; onCambio: (v: T) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1 [scrollbar-width:none]">
      {opciones.map((o) => (
        <button
          key={o.valor}
          onClick={() => onCambio(o.valor)}
          className={cx(
            'shrink-0 rounded-full px-3.5 h-9 text-sm font-medium border transition',
            valor === o.valor ? 'bg-marca-600 text-white border-marca-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function Vacio({ icono, titulo, texto, accion }: { icono: ReactNode; titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="mb-4 rounded-2xl bg-marca-50 p-4 text-marca-600">{icono}</div>
      <h3 className="font-semibold text-slate-800">{titulo}</h3>
      {texto && <p className="mt-1 text-sm text-slate-500 max-w-xs">{texto}</p>}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  );
}

export const Cargando = () => (
  <div className="flex justify-center py-16">
    <span className="size-6 rounded-full border-2 border-marca-600 border-r-transparent animate-spin" />
  </div>
);

export function Tarjeta({ children, className, titulo, accion }: { children: ReactNode; className?: string; titulo?: string; accion?: ReactNode }) {
  return (
    <section className={cx('min-w-0 rounded-2xl bg-white border border-slate-200/70', className)}>
      {titulo && (
        <div className="flex items-center justify-between px-4 md:px-5 pt-4">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{titulo}</h3>
          {accion}
        </div>
      )}
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
}

export function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800 break-words">{valor || '—'}</dd>
    </div>
  );
}

/** Cabecera de una pantalla de detalle, con "volver" en móvil */
export function CabeceraDetalle({
  volver, titulo, subtitulo, acciones, avatar, visiblesEstrecho = 1,
}: { volver: string; titulo: ReactNode; subtitulo?: ReactNode; acciones?: ReactNode; avatar?: ReactNode; visiblesEstrecho?: number }) {
  const navegar = useNavigate();
  return (
    <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 md:px-6 py-3 no-imprimir">
      <div className="flex items-center gap-3">
        <button onClick={() => navegar(volver)} className="xl:hidden -ml-2 rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Volver">
          <ArrowLeft className="size-5" />
        </button>
        {avatar}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg md:text-xl font-semibold">{titulo}</h1>
          {subtitulo && <div className="truncate text-sm text-slate-500">{subtitulo}</div>}
        </div>
      </div>
      {/* Las acciones van en su propia fila para no pelear por el espacio con el título */}
      {acciones && (
        <>
          {/* Estrecho (móvil o columna de detalle): la principal a todo el ancho y el resto en «Más» */}
          <div className="@2xl:hidden mt-3 flex gap-2 [&>*:first-child]:flex-1">
            <Acciones acciones={acciones} visibles={visiblesEstrecho} />
          </div>
          <div className="hidden @2xl:flex mt-3 gap-2">
            <Acciones acciones={acciones} visibles={3} />
          </div>
        </>
      )}
    </div>
  );
}

/** Saca los botones de los fragmentos y condicionales para poder contarlos */
function aplanar(nodo: ReactNode): ReactElement[] {
  return Children.toArray(nodo).flatMap((n) =>
    isValidElement(n) && n.type === Fragment ? aplanar((n.props as { children?: ReactNode }).children) : isValidElement(n) ? [n] : [],
  );
}

/**
 * Muestra las primeras acciones y mete el resto en «Más», para que ningún botón
 * quede escondido fuera de la pantalla en el móvil.
 */
function Acciones({ acciones, visibles }: { acciones: ReactNode; visibles: number }) {
  // Posición del botón «Más» (en pantalla grande el menú se abre justo debajo)
  const [abierto, setAbierto] = useState<DOMRect | null>(null);
  const todas = aplanar(acciones);
  // Si solo sobra una, cabe en lugar del botón «Más»
  const corte = todas.length <= visibles + 1 ? todas.length : visibles;
  const resto = todas.slice(corte);
  return (
    <>
      {todas.slice(0, corte)}
      {resto.length > 0 && (
        <div className="relative">
          <Boton
            variante="secundario"
            icono={<MoreHorizontal className="size-4" />}
            onClick={(e) => setAbierto(e.currentTarget.getBoundingClientRect())}
          >
            Más
          </Boton>
          {/* Ojo: la cabecera no puede llevar backdrop-blur ni transform, o estos fixed se colocan respecto a ella */}
          {abierto && (
              <>
                <div className="fixed inset-0 z-40 bg-slate-900/30 md:bg-transparent no-imprimir" onClick={() => setAbierto(null)} />
                <div
                  className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white p-3 pb-seguro shadow-2xl md:inset-x-auto md:bottom-auto md:w-60 md:rounded-xl md:p-1.5 md:border md:border-slate-200 no-imprimir"
                  style={window.innerWidth >= 768 ? { top: abierto.bottom + 8, right: window.innerWidth - abierto.right } : undefined}
                  onClick={() => setAbierto(null)}
                >
                  <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300 md:hidden" />
                  <div className="flex flex-col gap-1">
                    {resto.map((el, i) => <OpcionMenu key={i} el={el} />)}
                  </div>
                </div>
              </>
          )}
        </div>
      )}
    </>
  );
}

/** Una acción dentro de «Más»: ancho completo y siempre con su nombre */
function OpcionMenu({ el }: { el: ReactElement }) {
  const props = el.props as { children?: ReactNode; className?: string; 'aria-label'?: string };
  if (el.type === Boton) {
    return cloneElement(el as ReactElement<any>, {
      variante: 'fantasma',
      className: cx(props.className, 'w-full justify-start h-12 md:h-10 text-[15px] md:text-sm'),
      children: props.children ?? props['aria-label'],
    });
  }
  // Enlaces que envuelven un botón (p. ej. «Llamar»)
  return <div className="[&_button]:w-full [&_button]:justify-start [&_button]:border-0">{el}</div>;
}

/**
 * Vista "bandeja" estilo Gmail: lista a la izquierda y detalle a la derecha en
 * pantallas grandes; en móvil se ve una cosa u otra.
 */
export function ListaDetalle({ lista, detalle, hayDetalle }: { lista: ReactNode; detalle: ReactNode; hayDetalle: boolean }) {
  return (
    <div className="flex h-full min-h-0">
      <div className={cx('w-full xl:w-[420px] 2xl:w-[460px] xl:shrink-0 xl:border-r border-slate-200/70 flex-col min-h-0', hayDetalle ? 'hidden xl:flex' : 'flex')}>
        {lista}
      </div>
      <div className={cx('@container flex-1 min-w-0 min-h-0 overflow-y-auto', hayDetalle ? 'block' : 'hidden xl:block')}>{detalle}</div>
    </div>
  );
}

export function CabeceraLista({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-3 space-y-3 border-b border-slate-100">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {accion}
      </div>
      {children}
    </div>
  );
}

export function FilaLista({ activa, onClick, children }: { activa?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'w-full text-left flex items-center gap-3 px-4 py-3 border-b border-slate-100 transition',
        activa ? 'bg-marca-50' : 'hover:bg-slate-50 active:bg-slate-100',
      )}
    >
      {children}
    </button>
  );
}

export const SinSeleccion = ({ texto }: { texto: string }) => (
  <div className="hidden xl:flex h-full items-center justify-center text-slate-400 text-sm">{texto}</div>
);

export { cx };
