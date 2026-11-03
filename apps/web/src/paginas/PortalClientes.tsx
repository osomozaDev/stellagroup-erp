import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Download, FileText, LogOut, MailCheck } from 'lucide-react';
import { euros, fecha, hoyISO } from '../lib/formato';
import { Boton, Campo, Cargando, ColorEtiqueta, Entrada, Etiqueta, cx } from '../components/ui';
import Marca from '../components/Marca';

/**
 * Portal de clientes (/portal): el cliente entra con el enlace que le llega al correo
 * y ve y descarga sus facturas. No usa la sesión de la app de oficina: la API le da
 * una sesión propia que solo sirve para sus facturas.
 */

const BASE = import.meta.env.VITE_API_URL ?? '/api';
const CLAVE = 'portal-clientes';

const leerToken = () => { try { return localStorage.getItem(CLAVE); } catch { return null; } };
const guardarToken = (t: string | null) => { try { t ? localStorage.setItem(CLAVE, t) : localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento: dura lo que la pestaña */ } };

// El código del enlace se lee al arrancar y se quita de la barra de direcciones
const codigoInicial = new URLSearchParams(window.location.hash.slice(1)).get('codigo');
if (codigoInicial) history.replaceState(null, '', window.location.pathname);

async function pedir(ruta: string, token: string | null, opciones: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}/portal${ruta}`, {
    method: opciones.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Portal ${token}` } : {}) },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    const error = new Error((Array.isArray(json.message) ? json.message[0] : json.message) ?? 'Algo ha fallado. Vuelve a intentarlo.');
    (error as any).estado = res.status;
    throw error;
  }
  return res;
}

function guardarArchivo(blob: Blob, res: Response, porDefecto: string) {
  const nombre = res.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: nombre ? decodeURIComponent(nombre) : porDefecto }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

interface Factura {
  id: string;
  numero: string;
  fecha: string | null;
  vencimiento: string | null;
  total: number;
  estado: 'emitida' | 'cobrada' | 'anulada';
  rectifica_id: string | null;
  proyecto: { nombre: string } | null;
}
interface Datos {
  cliente: { nombre: string; cif: string | null };
  email: string;
  empresa: { nombre: string; email: string | null; telefono: string | null; iban: string | null };
  facturas: Factura[];
}

function estado(f: Factura): { texto: string; color: ColorEtiqueta } {
  if (f.estado === 'anulada') return { texto: 'Anulada', color: 'gris' };
  if (f.rectifica_id) return { texto: 'Rectificativa', color: 'gris' };
  if (f.estado === 'cobrada') return { texto: 'Pagada', color: 'verde' };
  if (f.vencimiento && f.vencimiento < hoyISO()) return { texto: 'Vencida', color: 'rojo' };
  return { texto: 'Pendiente', color: 'naranja' };
}

const ibanBonito = (iban: string) => iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

export default function PortalClientes() {
  const [token, setToken] = useState<string | null>(leerToken);
  const [entrando, setEntrando] = useState(!!codigoInicial);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!codigoInicial) return;
    pedir('/entrar', null, { method: 'POST', body: { codigo: codigoInicial } })
      .then((r) => r.json())
      .then(({ token }) => { guardarToken(token); setToken(token); })
      // Si ya tenía sesión en este navegador, sigue con ella aunque el enlace esté usado
      .catch((e: Error) => { if (!leerToken()) setAviso(e.message); })
      .finally(() => setEntrando(false));
  }, []);

  const salir = (motivo?: string) => { guardarToken(null); setToken(null); setAviso(motivo ?? null); };

  if (entrando) return <Cargando />;
  if (!token) return <PedirEnlace aviso={aviso} />;
  return <MisFacturas token={token} onSalir={salir} />;
}

function PedirEnlace({ aviso }: { aviso: string | null }) {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  const [error, setError] = useState('');

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      const r = await pedir('/enlace', null, { method: 'POST', body: { email } });
      setHecho((await r.json()).mensaje);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 md:p-8 shadow-xl shadow-slate-200/60 border border-slate-100">
        <Marca grande className="mb-8" />
        {hecho ? (
          <div className="text-center">
            <MailCheck className="mx-auto size-10 text-marca-600" />
            <h1 className="mt-4 text-xl font-bold tracking-tight">Revisa tu correo</h1>
            <p className="mt-2 text-slate-500">{hecho}</p>
            <button onClick={() => setHecho(null)} className="mt-6 text-sm font-medium text-marca-600">Usar otro correo</button>
          </div>
        ) : (
          <form onSubmit={enviar}>
            <h1 className="text-xl font-bold tracking-tight">Tus facturas</h1>
            <p className="text-slate-500 mt-1 mb-6">Escribe tu correo y te enviaremos un enlace para entrar, sin contraseña.</p>
            {aviso && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{aviso}</p>}
            <div className="space-y-4">
              <Campo etiqueta="Correo">
                <Entrada type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.es" />
              </Campo>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Boton type="submit" className="w-full h-12" cargando={enviando}>Enviarme el enlace</Boton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function MisFacturas({ token, onSalir }: { token: string; onSalir: (motivo?: string) => void }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anio, setAnio] = useState('todos');
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [bajando, setBajando] = useState<string | null>(null);

  // Sesión caducada o acceso retirado: vuelve a pedir el correo
  const fallo = (e: any) => (e.estado === 401 ? onSalir(e.message) : setError(e.message));

  useEffect(() => {
    pedir('', token).then((r) => r.json()).then(setDatos).catch(fallo);
  }, [token]);

  const anios = useMemo(() => [...new Set((datos?.facturas ?? []).map((f) => f.fecha?.slice(0, 4)).filter(Boolean) as string[])], [datos]);
  const visibles = (datos?.facturas ?? []).filter((f) => anio === 'todos' || f.fecha?.startsWith(anio));

  if (!datos) {
    return error ? <p className="p-6 text-center text-slate-600">{error}</p> : <Cargando />;
  }

  const pendientes = datos.facturas.filter((f) => f.estado === 'emitida');
  const pendiente = pendientes.reduce((s, f) => s + f.total, 0);
  const vencido = pendientes.filter((f) => f.vencimiento && f.vencimiento < hoyISO()).reduce((s, f) => s + f.total, 0);

  const bajarPdf = async (f: Factura) => {
    setBajando(f.id);
    try {
      const res = await pedir(`/facturas/${f.id}/pdf`, token);
      guardarArchivo(await res.blob(), res, `Factura ${f.numero}.pdf`);
    } catch (e) {
      fallo(e);
    } finally {
      setBajando(null);
    }
  };

  const bajarZip = async () => {
    setBajando('zip');
    try {
      const res = await pedir('/zip', token, { method: 'POST', body: { ids: [...elegidas] } });
      guardarArchivo(await res.blob(), res, 'Facturas.zip');
    } catch (e) {
      fallo(e);
    } finally {
      setBajando(null);
    }
  };

  const cambiar = (id: string) => setElegidas((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const todasElegidas = visibles.length > 0 && visibles.every((f) => elegidas.has(f.id));

  return (
    <div className="min-h-full bg-fondo">
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 h-16">
          <Marca />
          <div className="flex-1" />
          <button onClick={() => onSalir()} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
            <LogOut className="size-4" /> Salir
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4 pb-28">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{datos.cliente.nombre}</h1>
          <p className="text-sm text-slate-500">Has entrado como {datos.email}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white border border-slate-200/70 p-4">
            <p className="text-sm text-slate-500">Pendiente de pago</p>
            <p className="text-xl font-bold mt-1">{euros(pendiente)}</p>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200/70 p-4">
            <p className="text-sm text-slate-500">Vencido</p>
            <p className={cx('text-xl font-bold mt-1', vencido > 0 && 'text-red-600')}>{euros(vencido)}</p>
          </div>
        </div>

        {pendiente > 0 && datos.empresa.iban && (
          <section className="rounded-2xl bg-white border border-slate-200/70 p-4 text-sm leading-relaxed">
            <p className="font-semibold">Pago por transferencia</p>
            <p><span className="text-slate-500">Titular:</span> {datos.empresa.nombre}</p>
            <p><span className="text-slate-500">IBAN:</span> <span className="font-mono">{ibanBonito(datos.empresa.iban)}</span></p>
            <p className="text-slate-500 mt-1">Pon el número de factura en el concepto.</p>
          </section>
        )}

        <section className="rounded-2xl bg-white border border-slate-200/70">
          <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex-1">Facturas</h2>
            {anios.length > 1 && (
              <select value={anio} onChange={(e) => { setAnio(e.target.value); setElegidas(new Set()); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
                <option value="todos">Todos los años</option>
                {anios.map((a) => <option key={a}>{a}</option>)}
              </select>
            )}
          </div>
          {visibles.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Aún no hay facturas.</p>
          ) : (
            <ul className="divide-y divide-slate-100 mt-2">
              <li className="flex items-center gap-3 px-4 py-2 text-xs text-slate-500">
                <input type="checkbox" className="size-4 accent-marca-600" checked={todasElegidas} onChange={() => setElegidas(todasElegidas ? new Set() : new Set(visibles.map((f) => f.id)))} aria-label="Elegir todas" />
                Elegir todas
              </li>
              {visibles.map((f) => {
                const e = estado(f);
                return (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <input type="checkbox" className="size-4 accent-marca-600 shrink-0" checked={elegidas.has(f.id)} onChange={() => cambiar(f.id)} aria-label={`Elegir factura ${f.numero}`} />
                    <FileText className="size-5 text-slate-400 shrink-0 hidden sm:block" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">Factura {f.numero}</p>
                      <p className="truncate text-xs text-slate-500">{[fecha(f.fecha), f.proyecto?.nombre].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{euros(f.total)}</p>
                      <Etiqueta color={e.color}>{e.texto}</Etiqueta>
                    </div>
                    <Boton variante="secundario" className="shrink-0 px-3" icono={<Download className="size-4" />} cargando={bajando === f.id} onClick={() => bajarPdf(f)} aria-label={`Descargar factura ${f.numero}`}>
                      <span className="hidden sm:inline">PDF</span>
                    </Boton>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {(datos.empresa.email || datos.empresa.telefono) && (
          <p className="text-center text-sm text-slate-500">
            ¿Alguna duda?
            {datos.empresa.email && <> Escríbenos a <a className="text-marca-600" href={`mailto:${datos.empresa.email}`}>{datos.empresa.email}</a></>}
            {datos.empresa.telefono && <>{datos.empresa.email ? ' o llama' : ' Llama'} al <a className="text-marca-600" href={`tel:${datos.empresa.telefono}`}>{datos.empresa.telefono}</a></>}.
          </p>
        )}
      </main>

      {elegidas.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-fondo via-fondo">
          <div className="max-w-3xl mx-auto">
            <Boton className="w-full h-12" icono={<Download className="size-4" />} cargando={bajando === 'zip'} onClick={bajarZip}>
              Descargar {elegidas.size === 1 ? '1 factura' : `${elegidas.size} facturas`} (ZIP)
            </Boton>
          </div>
        </div>
      )}
    </div>
  );
}
