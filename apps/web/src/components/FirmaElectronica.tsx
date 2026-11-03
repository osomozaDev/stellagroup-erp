import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, Copy, Download, Eye, MailCheck, PenLine, Send, ShieldCheck, XCircle } from 'lucide-react';
import { api, descargar } from '../lib/api';
import { AreaTexto, Boton, Campo, Confirmar, Entrada, Etiqueta, Panel, Tarjeta, useAviso } from './ui';

const fechaHora = (f?: string | null) =>
  f ? new Date(f).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * Firma electrónica de un presupuesto o un contrato: enviar a firmar, ver en qué
 * punto está (enviado, abierto, firmado o rechazado) y descargar la copia firmada.
 */
export default function FirmaElectronica({
  tipo, documento, puedeEnviar, nombrePdf,
}: { tipo: 'presupuesto' | 'contrato'; documento: any; puedeEnviar: boolean; nombrePdf: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [enviar, setEnviar] = useState(false);
  const [anular, setAnular] = useState(false);
  const [enlace, setEnlace] = useState<{ url: string; modo: string; error?: string } | null>(null);
  const [bajando, setBajando] = useState(false);
  const ruta = `/${tipo === 'contrato' ? 'contratos' : 'presupuestos'}/${documento.id}`;
  const firmas: any[] = documento.firmas ?? [];
  const actual = firmas.find((f) => f.estado === 'pendiente' || f.estado === 'firmado') ?? firmas.find((f) => f.estado === 'rechazado');

  const anularFirma = useMutation({
    mutationFn: () => api(`${ruta}/firma`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Petición de firma anulada: el enlace ya no sirve'); },
    onError: (e: Error) => avisar(e.message, true),
  });

  const bajar = async () => {
    setBajando(true);
    try {
      await descargar(`${ruta}/pdf`, nombrePdf);
    } catch (e: any) {
      avisar(e.message, true);
    } finally {
      setBajando(false);
    }
  };

  return (
    <Tarjeta titulo="Firma electrónica">
      {!actual ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <PenLine className="size-8 text-marca-500 shrink-0" />
          <p className="flex-1 text-sm text-slate-600">
            Envíaselo al cliente para que lo firme desde el móvil o el ordenador: recibe un enlace, confirma con un código que le llega al correo y firma con el dedo o el ratón.
          </p>
          {puedeEnviar && <Boton icono={<Send className="size-4" />} onClick={() => setEnviar(true)}>Enviar a firmar</Boton>}
        </div>
      ) : actual.estado === 'firmado' ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-6 text-emerald-600 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Firmado por {actual.firmante_nombre}{actual.firmante_nif && ` · ${actual.firmante_nif}`}</p>
              <p className="text-sm text-slate-500">{fechaHora(actual.firmado_en)} · {actual.email}</p>
            </div>
            <Boton variante="secundario" icono={<Download className="size-4" />} onClick={bajar} cargando={bajando}>PDF firmado</Boton>
          </div>
          <Evidencias f={actual} />
        </div>
      ) : actual.estado === 'rechazado' ? (
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <XCircle className="size-6 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Rechazado por {actual.email} el {fechaHora(actual.rechazado_en)}</p>
            {actual.motivo_rechazo && <p className="text-sm text-slate-600 mt-1">«{actual.motivo_rechazo}»</p>}
          </div>
          {puedeEnviar && <Boton variante="secundario" icono={<Send className="size-4" />} onClick={() => setEnviar(true)}>Enviar otra vez</Boton>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <MailCheck className="size-6 text-amber-500 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Esperando la firma de {actual.nombre ?? actual.email}</p>
              <p className="text-sm text-slate-500">
                Enviado a {actual.email} el {fechaHora(actual.enviado_en)} · el enlace vale hasta el {fechaHora(actual.caduca)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Etiqueta color={actual.visto_en ? 'azul' : 'gris'}>
                  <span className="inline-flex items-center gap-1"><Eye className="size-3" />{actual.visto_en ? `Abierto el ${fechaHora(actual.visto_en)}` : 'Aún no lo ha abierto'}</span>
                </Etiqueta>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Boton variante="secundario" icono={<Send className="size-4" />} onClick={() => setEnviar(true)}>Reenviar</Boton>
            <Boton variante="fantasma" icono={<Ban className="size-4" />} onClick={() => setAnular(true)}>Anular petición</Boton>
          </div>
        </div>
      )}

      {firmas.length > 1 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-slate-500">Historial ({firmas.length} peticiones)</summary>
          <ul className="mt-2 space-y-1 text-slate-600">
            {firmas.map((f) => (
              <li key={f.id}>{fechaHora(f.enviado_en)} · {f.email} · {{ pendiente: 'pendiente', firmado: 'firmado', rechazado: 'rechazado', anulado: 'anulado' }[f.estado as string]}</li>
            ))}
          </ul>
        </details>
      )}

      {enviar && (
        <EnviarAFirmar
          tipo={tipo}
          documento={documento}
          ruta={ruta}
          onCerrar={() => setEnviar(false)}
          onEnviado={(r) => { setEnviar(false); setEnlace(r); }}
        />
      )}
      {enlace && <EnlaceFirma {...enlace} onCerrar={() => setEnlace(null)} />}
      <Confirmar
        abierto={anular}
        titulo="¿Anular la petición de firma?"
        texto="El enlace que tiene el cliente dejará de funcionar. Podrás enviarlo de nuevo cuando quieras."
        botonSi="Anular"
        onNo={() => setAnular(false)}
        onSi={() => { setAnular(false); anularFirma.mutate(); }}
      />
    </Tarjeta>
  );
}

function Evidencias({ f }: { f: any }) {
  return (
    <details className="rounded-xl bg-slate-50 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-slate-700 inline-flex items-center gap-1.5"><ShieldCheck className="size-4 text-emerald-600" />Evidencias de la firma</summary>
      <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2">
        {[
          ['Enviado', `${fechaHora(f.enviado_en)}${f.enviado_por ? ` por ${f.enviado_por}` : ''}`],
          ['Abierto', fechaHora(f.visto_en)],
          ['Código verificado', fechaHora(f.verificado_en)],
          ['Firmado', fechaHora(f.firmado_en)],
          ['IP', f.ip ?? '—'],
          ['Navegador', f.navegador ?? '—'],
        ].map(([t, v]) => (
          <div key={t}>
            <dt className="text-xs text-slate-500">{t}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
        <div className="sm:col-span-2">
          <dt className="text-xs text-slate-500">Huella SHA-256 del documento firmado</dt>
          <dd className="font-mono text-xs break-all">{f.huella}</dd>
        </div>
      </dl>
    </details>
  );
}

function EnviarAFirmar({ tipo, documento, ruta, onCerrar, onEnviado }: {
  tipo: 'presupuesto' | 'contrato'; documento: any; ruta: string; onCerrar: () => void; onEnviado: (r: { url: string; modo: string; error?: string }) => void;
}) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [v, setV] = useState({ email: documento.cliente?.email ?? '', nombre: documento.cliente?.contacto ?? '', mensaje: '', dias: 30 });
  const enviar = useMutation({
    mutationFn: () => api<any>(`${ruta}/firma`, { method: 'POST', body: v }),
    onSuccess: (r) => { qc.invalidateQueries(); onEnviado({ url: r.enlace, modo: r.modo, error: r.error }); },
    onError: (e: Error) => avisar(e.message, true),
  });
  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={`Enviar a firmar el ${tipo}`}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton icono={<Send className="size-4" />} onClick={() => enviar.mutate()} cargando={enviar.isPending}>Enviar</Boton></>}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Le llega un correo con un enlace personal. Lo revisa, confirma con un código que le mandamos a ese mismo correo y firma. Desde que lo envías, el documento ya no se puede cambiar
          (si hace falta, anulas la petición, lo cambias y lo vuelves a enviar).
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo etiqueta="Correo de quien firma"><Entrada type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Campo>
          <Campo etiqueta="Nombre"><Entrada value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} placeholder="Opcional" /></Campo>
        </div>
        <Campo etiqueta="Mensaje (opcional)" ayuda="Sale en el correo, antes del botón">
          <AreaTexto rows={3} value={v.mensaje} onChange={(e) => setV({ ...v, mensaje: e.target.value })} placeholder="Como hablamos ayer, te paso el documento para que lo firmes." />
        </Campo>
        <Campo etiqueta="El enlace vale">
          <select className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3" value={v.dias} onChange={(e) => setV({ ...v, dias: Number(e.target.value) })}>
            {[7, 15, 30, 60].map((d) => <option key={d} value={d}>{d} días</option>)}
          </select>
        </Campo>
      </div>
    </Panel>
  );
}

/** Tras enviar: el enlace por si se quiere mandar también por WhatsApp u otro medio */
function EnlaceFirma({ url, modo, error, onCerrar }: { url: string; modo: string; error?: string; onCerrar: () => void }) {
  const avisar = useAviso();
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      avisar('Enlace copiado');
    } catch {
      avisar('No se ha podido copiar: selecciónalo y cópialo a mano', true);
    }
  };
  return (
    <Panel abierto onCerrar={onCerrar} titulo="Enviado a firmar" pie={<Boton onClick={onCerrar}>Hecho</Boton>}>
      <div className="space-y-4">
        {modo === 'real' && <p className="text-sm text-slate-600">Le hemos mandado el correo. También puedes pasarle el enlace por otro medio:</p>}
        {modo === 'prueba' && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Modo prueba: el correo no ha salido porque no está configurado el correo de la empresa. Pásale el enlace por otro medio.</p>}
        {modo === 'error' && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error ?? 'No se ha podido mandar el correo.'} El enlace funciona igualmente: pásaselo por otro medio.</p>}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs break-all select-all">{url}</div>
        <Boton variante="secundario" icono={<Copy className="size-4" />} onClick={copiar}>Copiar enlace</Boton>
        <p className="text-xs text-slate-500">Es personal: quien lo tenga puede abrir el documento, pero para firmar necesita el código que llega a su correo. Por seguridad no se vuelve a mostrar.</p>
      </div>
    </Panel>
  );
}
