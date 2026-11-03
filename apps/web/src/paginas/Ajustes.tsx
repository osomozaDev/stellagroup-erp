import { useEffect, useRef } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { ejemploNumero } from '@stella/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { AreaTexto, Boton, Campo, Cargando, Entrada, Selector, Tarjeta, cx, useAviso, useFormulario } from '../components/ui';
import AvisosTelegram from '../components/AvisosTelegram';
import { usePuede } from '../lib/permisos';

/** Reduce el logo a un tamaño razonable y lo devuelve como data URL */
function leerLogo(archivo: File): Promise<string> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      // Hasta 1200 px de ancho: el PDF y el correo lo muestran a unos 200 px y así se ve nítido en pantallas retina
      const escala = Math.min(1, 1200 / img.width, 400 / img.height);
      const lienzo = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * escala), height: Math.round(img.height * escala) });
      lienzo.getContext('2d')!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
      ok(lienzo.toDataURL('image/png'));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = mal;
    img.src = URL.createObjectURL(archivo);
  });
}

const COLORES = ['#1f6feb', '#0b1220', '#0891b2', '#4338ca', '#0f766e', '#b91c1c'];

const vacio = {
  nombre: '', cif: '', direccion: '', cp: '', ciudad: '', provincia: '', email: '', telefono: '', iban: '',
  serie_factura: 'F', numeracion: 'anual' as 'anual' | 'continua', proximo_numero: 1, forma_pago: 'Transferencia bancaria',
  color: '#1f6feb', logo: '' as string | null, dias_vencimiento: 30, iva_pct: 21, ss_trabajador_pct: 6.5, ss_empresa_pct: 31.5, pie_factura: '',
  validez_presupuesto_dias: 30, condiciones_presupuesto: '', accion_principal: 'presupuesto' as 'presupuesto' | 'facturar_mes',
};

export default function Ajustes() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data, isLoading } = useQuery({ queryKey: ['empresa'], queryFn: () => api('/empresa') });
  const { valores, campo, setValores, poner } = useFormulario(vacio);
  const entradaLogo = useRef<HTMLInputElement>(null);
  const puede = usePuede();

  const elegirLogo = async (archivo?: File) => {
    if (!archivo) return;
    try {
      poner('logo', await leerLogo(archivo));
    } catch {
      avisar('No se ha podido leer la imagen', true);
    }
  };

  useEffect(() => {
    if (data) setValores(Object.fromEntries(Object.keys(vacio).map((k) => [k, data[k] ?? ''])) as typeof vacio);
  }, [data, setValores]);

  const guardar = useMutation({
    mutationFn: () => api('/empresa', { method: 'PUT', body: valores }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Datos guardados'); },
    onError: (e: Error) => avisar(e.message, true),
  });

  if (isLoading) return <Cargando />;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mi empresa</h1>
          <p className="text-slate-500 mt-1">Estos datos salen en todas tus facturas.</p>
        </div>

        {puede('cobros') && <AvisosTelegram />}

        <Tarjeta titulo="Datos fiscales">
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo etiqueta="Razón social" className="sm:col-span-2"><Entrada {...campo('nombre')} /></Campo>
            <Campo etiqueta="CIF"><Entrada {...campo('cif')} /></Campo>
            <Campo etiqueta="Teléfono"><Entrada {...campo('telefono')} /></Campo>
            <Campo etiqueta="Correo" className="sm:col-span-2"><Entrada type="email" {...campo('email')} /></Campo>
            <Campo etiqueta="Dirección" className="sm:col-span-2"><Entrada {...campo('direccion')} /></Campo>
            <Campo etiqueta="Código postal"><Entrada {...campo('cp')} /></Campo>
            <Campo etiqueta="Ciudad"><Entrada {...campo('ciudad')} /></Campo>
            <Campo etiqueta="Provincia"><Entrada {...campo('provincia')} /></Campo>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Cómo se ven tus facturas">
          <div className="space-y-5">
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Logo</span>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-20 w-44 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2">
                  {valores.logo ? <img src={valores.logo} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">Sin logo</span>}
                </div>
                <input ref={entradaLogo} type="file" accept="image/*" className="hidden" onChange={(e) => elegirLogo(e.target.files?.[0])} />
                <Boton variante="secundario" icono={<ImagePlus className="size-4" />} onClick={() => entradaLogo.current?.click()}>{valores.logo ? 'Cambiar' : 'Subir logo'}</Boton>
                {valores.logo && <Boton variante="fantasma" icono={<Trash2 className="size-4" />} onClick={() => poner('logo', null)}>Quitar</Boton>}
              </div>
            </div>
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Color de la factura</span>
              <div className="flex flex-wrap items-center gap-2">
                {COLORES.map((c) => (
                  <button key={c} type="button" onClick={() => poner('color', c)} aria-label={`Color ${c}`}
                    className={`size-10 rounded-full ring-offset-2 transition ${valores.color === c ? 'ring-2 ring-slate-800' : ''}`} style={{ background: c }} />
                ))}
                <label className="flex items-center gap-2 text-sm text-slate-600 ml-1">
                  <input type="color" value={valores.color} onChange={(e) => poner('color', e.target.value)} className="size-10 rounded-full cursor-pointer" />
                  Otro
                </label>
              </div>
            </div>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Facturas">
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo etiqueta="Forma de pago"><Entrada {...campo('forma_pago')} /></Campo>
            <Campo etiqueta="IBAN donde te pagan"><Entrada {...campo('iban')} /></Campo>
            <Campo etiqueta="Numeración">
              <Selector {...campo('numeracion')}>
                <option value="continua">Seguida: 29, 30, 31…</option>
                <option value="anual">Por años: F2026-0001</option>
              </Selector>
            </Campo>
            <Campo etiqueta="Letras delante (opcional)" ayuda="Déjalo vacío si tus facturas son solo números"><Entrada {...campo('serie_factura')} /></Campo>
            <Campo
              etiqueta="Número de la próxima factura"
              ayuda={`La próxima saldrá como «${ejemploNumero(valores.serie_factura ?? '', valores.numeracion, Number(valores.proximo_numero) || 1)}». Cámbialo para seguir con tu numeración de antes.`}
            >
              <Entrada type="number" min={1} {...campo('proximo_numero')} />
            </Campo>
            <Campo etiqueta="Días para pagar"><Entrada type="number" {...campo('dias_vencimiento')} /></Campo>
            <Campo etiqueta="IVA habitual %"><Entrada type="number" {...campo('iva_pct')} /></Campo>
            <Campo etiqueta="Texto al pie de la factura" className="sm:col-span-2"><AreaTexto {...campo('pie_factura')} /></Campo>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Cómo trabajáis">
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Lo más importante de vuestro día a día: es el botón grande del menú, el del centro en el móvil y lo primero que sale en el inicio.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {([
                ['presupuesto', 'Crear presupuestos', 'Vendéis por proyecto: lo principal es preparar y enviar presupuestos.'],
                ['facturar_mes', 'Facturar el mes', 'Facturáis cada mes por horas: lo principal es sacar las facturas del mes.'],
              ] as const).map(([clave, titulo, texto]) => (
                <button
                  key={clave}
                  type="button"
                  onClick={() => poner('accion_principal', clave)}
                  className={cx('rounded-xl border p-4 text-left transition', valores.accion_principal === clave ? 'border-marca-500 bg-marca-50 ring-1 ring-marca-500' : 'border-slate-200 hover:bg-slate-50')}
                >
                  <p className="font-semibold">{titulo}</p>
                  <p className="mt-1 text-sm text-slate-500">{texto}</p>
                </button>
              ))}
            </div>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Presupuestos">
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo etiqueta="Validez en días" ayuda="Fecha hasta la que vale cada presupuesto nuevo"><Entrada type="number" min={1} {...campo('validez_presupuesto_dias')} /></Campo>
            <Campo etiqueta="Condiciones al pie del presupuesto" className="sm:col-span-2" ayuda="Forma de pago, plazos, qué no incluye…">
              <AreaTexto rows={4} {...campo('condiciones_presupuesto')} />
            </Campo>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Nóminas">
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo etiqueta="Seguridad Social del trabajador %" ayuda="Contingencias comunes, desempleo, FP y MEI"><Entrada type="number" step="0.01" {...campo('ss_trabajador_pct')} /></Campo>
            <Campo etiqueta="Seguridad Social de la empresa %" ayuda="Incluye contingencias comunes, desempleo, FOGASA, FP y accidentes"><Entrada type="number" step="0.01" {...campo('ss_empresa_pct')} /></Campo>
          </div>
        </Tarjeta>
        <div className="sticky bottom-0 -mx-4 md:mx-0 px-4 md:px-0 py-3 bg-white/90 backdrop-blur flex justify-end no-imprimir">
          <Boton className="h-12 px-8 w-full sm:w-auto" onClick={() => guardar.mutate()} cargando={guardar.isPending}>Guardar cambios</Boton>
        </div>
      </div>
    </div>
  );
}
