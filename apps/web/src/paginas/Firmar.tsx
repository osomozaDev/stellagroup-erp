import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Eraser, FileWarning, MailCheck, PenLine, ShieldCheck, XCircle } from 'lucide-react';
import { Boton, Campo, Cargando, Entrada, AreaTexto, cx } from '../components/ui';
import Marca from '../components/Marca';
import FacturaDocumento from '../components/FacturaDocumento';
import ContratoDocumento from '../components/ContratoDocumento';

/**
 * Firma de documentos (/firmar): el cliente llega con el enlace personal del correo,
 * revisa el presupuesto o el contrato, confirma con un código que le llega al correo
 * y firma en la pantalla. No necesita usuario ni contraseña.
 */

const BASE = import.meta.env.VITE_API_URL ?? '/api';
const CLAVE = 'firma-enlace';

// El enlace se lee al arrancar y se quita de la barra de direcciones (se guarda solo en esta pestaña)
const enlaceInicial = (() => {
  const t = new URLSearchParams(window.location.hash.slice(1)).get('t');
  if (t) {
    try { sessionStorage.setItem(CLAVE, t); } catch { /* sin almacenamiento */ }
    history.replaceState(null, '', window.location.pathname);
    return t;
  }
  try { return sessionStorage.getItem(CLAVE); } catch { return null; }
})();

async function pedir(ruta: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/firmar/${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: enlaceInicial, ...body }) });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error((Array.isArray(json.message) ? json.message[0] : json.message) ?? 'Algo ha fallado. Vuelve a intentarlo.');
  }
  return res;
}

const fechaHora = (f?: string | null) =>
  f ? new Date(f).toLocaleString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export default function Firmar() {
  const [datos, setDatos] = useState<any>(null);
  const [error, setError] = useState<string | null>(enlaceInicial ? null : 'Abre el enlace que te ha llegado al correo para ver el documento.');
  const cargar = () =>
    pedir('ver', {})
      .then((r) => r.json())
      .then(setDatos)
      .catch((e: Error) => setError(e.message));
  useEffect(() => { if (enlaceInicial) cargar(); }, []);

  const [bajando, setBajando] = useState(false);
  const bajarPdf = async () => {
    setBajando(true);
    try {
      const res = await pedir('pdf', {});
      const nombre = res.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
      const url = URL.createObjectURL(await res.blob());
      Object.assign(document.createElement('a'), { href: url, download: nombre ? decodeURIComponent(nombre) : 'documento.pdf' }).click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBajando(false);
    }
  };

  if (error) {
    return (
      <Marco>
        <div className="rounded-2xl bg-white border border-slate-200 p-6 text-center space-y-3">
          <FileWarning className="mx-auto size-10 text-amber-500" />
          <p className="font-semibold">No se puede abrir el documento</p>
          <p className="text-slate-600">{error}</p>
        </div>
      </Marco>
    );
  }
  if (!datos) return <Cargando />;

  const d = datos.documento;
  const que = datos.tipo === 'contrato' ? 'el contrato' : 'el presupuesto';
  return (
    <Marco>
      {datos.estado === 'firmado' ? (
        <Aviso icono={<CheckCircle2 className="size-7 text-emerald-600" />} color="bg-emerald-50 border-emerald-100">
          <p className="font-semibold text-emerald-900">Firmado por {datos.firmante_nombre} el {fechaHora(datos.firmado_en)}</p>
          <p className="text-sm text-emerald-800">Te hemos enviado una copia firmada a tu correo. También puedes descargarla aquí.</p>
          <div className="pt-2"><Boton icono={<Download className="size-4" />} onClick={bajarPdf} cargando={bajando}>Descargar copia firmada</Boton></div>
        </Aviso>
      ) : datos.estado === 'rechazado' ? (
        <Aviso icono={<XCircle className="size-7 text-red-500" />} color="bg-red-50 border-red-100">
          <p className="font-semibold text-red-900">Has rechazado {que}</p>
          <p className="text-sm text-red-800">Se lo hemos comunicado a {d.empresa?.nombre}. Se pondrán en contacto contigo.</p>
        </Aviso>
      ) : datos.caducada ? (
        <Aviso icono={<FileWarning className="size-7 text-amber-500" />} color="bg-amber-50 border-amber-100">
          <p className="font-semibold text-amber-900">El enlace ha caducado</p>
          <p className="text-sm text-amber-800">Pide a {d.empresa?.nombre} que te lo vuelva a enviar.</p>
        </Aviso>
      ) : (
        <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-2">
          <p className="text-lg font-semibold">{d.empresa?.nombre} te envía {que} «{d.titulo}» para firmar</p>
          {datos.mensaje && <p className="text-slate-600 whitespace-pre-line border-l-2 border-marca-200 pl-3">{datos.mensaje}</p>}
          <p className="text-sm text-slate-500">Léelo con calma. Cuando estés de acuerdo, firma al final de la página.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Boton variante="secundario" icono={<Download className="size-4" />} onClick={bajarPdf} cargando={bajando}>Descargar PDF</Boton>
            <Boton icono={<PenLine className="size-4" />} onClick={() => document.getElementById('firmar')?.scrollIntoView({ behavior: 'smooth' })}>Ir a firmar</Boton>
          </div>
        </div>
      )}

      {datos.tipo === 'contrato' ? <ContratoDocumento c={d} /> : <FacturaDocumento f={d} />}

      {datos.estado === 'pendiente' && !datos.caducada && <FormularioFirma datos={datos} onFirmado={cargar} />}
    </Marco>
  );
}

const Marco = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-full bg-fondo">
    <header className="bg-white border-b border-slate-100">
      <div className="max-w-3xl mx-auto px-4 h-16 flex items-center"><Marca /></div>
    </header>
    <main className="max-w-3xl mx-auto p-4 space-y-4 pb-16">{children}</main>
  </div>
);

const Aviso = ({ icono, color, children }: { icono: React.ReactNode; color: string; children: React.ReactNode }) => (
  <div className={cx('flex items-start gap-3 rounded-2xl border p-5', color)}>
    {icono}
    <div className="flex-1 space-y-1">{children}</div>
  </div>
);

function FormularioFirma({ datos, onFirmado }: { datos: any; onFirmado: () => void }) {
  const [nombre, setNombre] = useState(datos.nombre ?? '');
  const [nif, setNif] = useState('');
  const [firma, setFirma] = useState<string | null>(null);
  const [acepto, setAcepto] = useState(false);
  const [codigoEnviado, setCodigoEnviado] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState<'codigo' | 'firmar' | 'rechazar' | null>(null);
  const [rechazar, setRechazar] = useState(false);
  const [motivo, setMotivo] = useState('');

  const listo = nombre.trim().length >= 3 && !!firma && acepto;

  const pedirCodigo = async () => {
    setError(null);
    if (!listo) return setError('Escribe tu nombre, firma en el recuadro y marca que lo aceptas.');
    setCargando('codigo');
    try {
      const r = await (await pedir('codigo', {})).json();
      setCodigoEnviado(r.email);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(null);
    }
  };

  const enviarFirma = async () => {
    setError(null);
    setCargando('firmar');
    try {
      await pedir('firmar', { codigo, nombre, nif: nif || null, firma, acepto });
      onFirmado();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(null);
    }
  };

  const enviarRechazo = async () => {
    setError(null);
    setCargando('rechazar');
    try {
      await pedir('rechazar', { motivo });
      onFirmado();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(null);
    }
  };

  return (
    <section id="firmar" className="rounded-2xl bg-white border border-slate-200 p-5 space-y-5 scroll-mt-4">
      <div>
        <h2 className="text-lg font-semibold">Firmar {datos.tipo === 'contrato' ? 'el contrato' : 'el presupuesto'}</h2>
        <p className="text-sm text-slate-500">Para confirmar que eres tú, te enviaremos un código a {datos.email}.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Campo etiqueta="Nombre y apellidos"><Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" disabled={!!codigoEnviado} /></Campo>
        <Campo etiqueta="DNI o NIF (opcional)"><Entrada value={nif} onChange={(e) => setNif(e.target.value)} disabled={!!codigoEnviado} /></Campo>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">Tu firma</p>
        <PanelFirma onCambio={setFirma} bloqueado={!!codigoEnviado} />
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" className="mt-1 size-5 accent-[var(--color-marca-600)]" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} disabled={!!codigoEnviado} />
        <span className="text-sm text-slate-700">
          He leído {datos.tipo === 'contrato' ? 'el contrato' : 'el presupuesto'} «{datos.documento.titulo}» y lo acepto. Firmo electrónicamente en nombre de {String(datos.documento.cliente?.nombre ?? '').replace(/\.$/, '')}.
        </span>
      </label>

      {!codigoEnviado ? (
        <Boton className="w-full h-12" icono={<MailCheck className="size-5" />} onClick={pedirCodigo} cargando={cargando === 'codigo'} disabled={!listo}>
          Enviarme el código para firmar
        </Boton>
      ) : (
        <div className="rounded-2xl bg-marca-50 border border-marca-100 p-4 space-y-3">
          <p className="text-sm text-slate-700">Te hemos enviado un código de 6 números a <b>{codigoEnviado}</b>. Caduca en 10 minutos.</p>
          <div className="flex gap-2">
            <Entrada
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="text-center text-2xl tracking-[0.4em] font-semibold h-14"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
          <Boton className="w-full h-12" icono={<ShieldCheck className="size-5" />} onClick={enviarFirma} cargando={cargando === 'firmar'} disabled={codigo.length !== 6}>
            Firmar ahora
          </Boton>
          <div className="flex justify-between text-sm">
            <button className="text-marca-700 font-medium" onClick={pedirCodigo} disabled={cargando !== null}>Enviarme otro código</button>
            <button className="text-slate-500" onClick={() => { setCodigoEnviado(null); setCodigo(''); }}>Cambiar mis datos</button>
          </div>
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="border-t border-slate-100 pt-4">
        {!rechazar ? (
          <button className="text-sm text-slate-500 hover:text-red-600" onClick={() => setRechazar(true)}>No estoy de acuerdo y no quiero firmarlo</button>
        ) : (
          <div className="space-y-3">
            <Campo etiqueta="¿Por qué no lo firmas?" ayuda={`Se lo haremos llegar a ${datos.documento.empresa?.nombre}`}>
              <AreaTexto rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Campo>
            <div className="flex gap-2">
              <Boton variante="secundario" onClick={() => setRechazar(false)}>Volver</Boton>
              <Boton variante="peligro" onClick={enviarRechazo} cargando={cargando === 'rechazar'} disabled={motivo.trim().length < 3}>Rechazar</Boton>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Recuadro para firmar con el dedo o el ratón. Devuelve la firma en PNG con fondo transparente. */
function PanelFirma({ onCambio, bloqueado }: { onCambio: (png: string | null) => void; bloqueado?: boolean }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [vacio, setVacio] = useState(true);

  // El lienzo se dibuja a la resolución real de la pantalla para que la firma no salga borrosa
  useEffect(() => {
    const c = lienzo.current!;
    const escala = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = width * escala;
    c.height = height * escala;
    const ctx = c.getContext('2d')!;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b1220';
  }, []);

  const punto = (e: React.PointerEvent) => {
    const r = lienzo.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const empezar = (e: React.PointerEvent) => {
    if (bloqueado) return;
    lienzo.current!.setPointerCapture(e.pointerId);
    dibujando.current = true;
    const ctx = lienzo.current!.getContext('2d')!;
    const [x, y] = punto(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
  };
  const mover = (e: React.PointerEvent) => {
    if (!dibujando.current) return;
    const ctx = lienzo.current!.getContext('2d')!;
    const [x, y] = punto(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const terminar = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    setVacio(false);
    onCambio(lienzo.current!.toDataURL('image/png'));
  };
  const borrar = () => {
    const c = lienzo.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setVacio(true);
    onCambio(null);
  };

  return (
    <div className={cx('relative rounded-2xl border-2 border-dashed bg-white', bloqueado ? 'border-slate-200 opacity-70' : 'border-slate-300')}>
      <canvas
        ref={lienzo}
        className="block h-44 w-full touch-none cursor-crosshair"
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerLeave={terminar}
        aria-label="Recuadro para firmar"
      />
      {vacio && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-400">Firma aquí con el dedo o el ratón</p>}
      <div className="pointer-events-none absolute left-6 right-6 bottom-10 border-b border-slate-200" />
      {!vacio && !bloqueado && (
        <button onClick={borrar} className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-sm text-slate-600 shadow-sm hover:text-red-600">
          <Eraser className="size-4" /> Borrar
        </button>
      )}
    </div>
  );
}
