-- Contratos (a partir de plantillas) y firma electrónica de contratos y presupuestos.
--
-- La firma es una firma electrónica (art. 25 del Reglamento eIDAS y Ley 6/2020): el
-- cliente abre un enlace único, revisa el documento, confirma con un código que le
-- llega a su correo y firma a mano en la pantalla. Se guardan las evidencias (quién,
-- cuándo, desde dónde y la huella del documento firmado) y salen en el PDF.

-- ───────────── Plantillas de contrato ─────────────
-- El texto usa un formato sencillo: «# Título», «## Apartado», párrafos separados por
-- una línea en blanco, «- » para listas y **negrita**. Las variables van entre llaves:
-- {cliente.nombre}, {empresa.cif}, {presupuesto.total}…
create table plantillas_contrato (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  cuerpo text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────── Contratos ─────────────
create type estado_contrato as enum ('borrador', 'enviado', 'firmado', 'rechazado', 'anulado');

create table contratos (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,                 -- C2026-001
  anio int not null,
  cliente_id uuid not null references clientes(id) on delete restrict,
  proyecto_id uuid references proyectos(id) on delete set null,
  presupuesto_id uuid references presupuestos(id) on delete set null,
  plantilla_id uuid references plantillas_contrato(id) on delete set null,
  titulo text not null,
  cuerpo text not null,                        -- texto final, ya con las variables puestas
  fecha date not null default current_date,
  estado estado_contrato not null default 'borrador',
  firmado_en timestamptz,
  notas text,                                  -- internas, no salen en el contrato
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contratos_cliente_idx on contratos(cliente_id);
create index contratos_fecha_idx on contratos(fecha desc);

create table contadores_contrato (
  anio int primary key,
  ultimo int not null default 0
);

create or replace function siguiente_numero_contrato(p_anio int)
returns text language plpgsql as $$
declare n int;
begin
  insert into contadores_contrato (anio, ultimo) values (p_anio, 1)
  on conflict (anio) do update set ultimo = contadores_contrato.ultimo + 1
  returning ultimo into n;
  return 'C' || p_anio::text || '-' || lpad(n::text, 3, '0');
end $$;

-- ───────────── Firmas ─────────────
-- Una petición de firma por documento enviado. El documento se congela al enviarlo
-- (documento + huella SHA-256): lo que se firma es exactamente lo que se envió.
create table firmas (
  id uuid primary key default gen_random_uuid(),
  documento_tipo text not null check (documento_tipo in ('presupuesto', 'contrato')),
  documento_id uuid not null,
  documento jsonb not null,                    -- copia del documento tal como se envió
  huella text not null,                        -- SHA-256 de esa copia
  estado text not null default 'pendiente' check (estado in ('pendiente', 'firmado', 'rechazado', 'anulado')),
  -- A quién se le pide
  email text not null,
  nombre text,
  mensaje text,
  enlace_hash text not null unique,            -- se guarda el hash, nunca el enlace
  caduca timestamptz not null,
  enviado_por text,                            -- quién de la oficina lo envió
  enviado_en timestamptz not null default now(),
  visto_en timestamptz,
  -- Código de verificación por correo
  codigo_hash text,
  codigo_caduca timestamptz,
  codigo_intentos int not null default 0,
  codigos_enviados int not null default 0,
  verificado_en timestamptz,
  -- Lo que deja el firmante
  firmante_nombre text,
  firmante_nif text,
  firma_imagen text,                           -- trazo de la firma (PNG en data URL)
  firmado_en timestamptz,
  rechazado_en timestamptz,
  motivo_rechazo text,
  ip text,
  navegador text,
  created_at timestamptz not null default now()
);
create index firmas_documento_idx on firmas(documento_tipo, documento_id, created_at desc);
create unique index firmas_una_pendiente on firmas(documento_tipo, documento_id) where estado = 'pendiente';

alter table plantillas_contrato enable row level security;
alter table contratos enable row level security;
alter table contadores_contrato enable row level security;
alter table firmas enable row level security;
grant all on plantillas_contrato, contratos, contadores_contrato, firmas to service_role;
grant execute on function siguiente_numero_contrato(int) to service_role;

-- Los usuarios de oficina con el rol por defecto también ven los contratos
update roles set permisos = array_append(permisos, 'contratos') where nombre = 'Oficina' and not 'contratos' = any(permisos);

-- Aviso de Telegram cuando un cliente firma o rechaza
alter table telegram_chats alter column avisos set default '{rebotes,cobradas,vencidas,facturar,renovaciones,firmas,semanal}';
update telegram_chats set avisos = array_append(avisos, 'firmas') where not 'firmas' = any(avisos);

-- ───────────── Plantillas de partida ─────────────
insert into plantillas_contrato (nombre, descripcion, cuerpo) values
('Contrato de desarrollo de software', 'Para webs, apps y software a medida con precio cerrado o por hitos.', $$# Contrato de prestación de servicios de desarrollo

En {fecha.ciudad}, a {fecha.larga}.

## Reunidos

De una parte, **{empresa.nombre}**, con CIF {empresa.cif} y domicilio en {empresa.direccion_completa} (en adelante, «el Proveedor»).

De otra parte, **{cliente.nombre}**, con CIF {cliente.cif} y domicilio en {cliente.direccion_completa} (en adelante, «el Cliente»).

Ambas partes se reconocen capacidad para contratar y acuerdan las siguientes cláusulas.

## 1. Objeto

El Proveedor desarrollará para el Cliente el proyecto **{proyecto.nombre}**, con el alcance descrito en el presupuesto {presupuesto.numero}, que se adjunta como anexo y forma parte de este contrato.

## 2. Precio y forma de pago

El precio total es de **{presupuesto.base}** más IVA ({presupuesto.total} IVA incluido). Se facturará por hitos, a la entrega de cada uno, según el presupuesto. Las facturas se pagarán por transferencia en un plazo de {empresa.dias_pago} días.

## 3. Plazos

El trabajo empezará el {proyecto.inicio} y la entrega prevista es el {proyecto.entrega}. Los plazos dependen de que el Cliente entregue a tiempo los contenidos, accesos y validaciones que se le pidan.

## 4. Cambios en el alcance

Lo que no esté en el presupuesto se presupuestará aparte antes de hacerlo. Cada cambio aceptado por escrito puede modificar el precio y los plazos.

## 5. Propiedad intelectual

Una vez pagado el precio completo, el Cliente será titular de los derechos de explotación del desarrollo a medida. El Proveedor conserva sus herramientas, librerías y componentes previos, y el Cliente recibe una licencia de uso indefinida sobre ellos. El software libre de terceros se rige por sus propias licencias.

## 6. Garantía

El Proveedor corregirá sin coste los errores de lo desarrollado que aparezcan durante los tres meses siguientes a la entrega. No cubre cambios de alcance, fallos de servicios de terceros ni modificaciones hechas por otros.

## 7. Confidencialidad y protección de datos

Las partes guardarán secreto sobre la información de la otra a la que tengan acceso. Si el Proveedor trata datos personales por cuenta del Cliente, lo hará solo para prestar el servicio y conforme al Reglamento (UE) 2016/679 y a la Ley Orgánica 3/2018, como encargado del tratamiento.

## 8. Duración y resolución

El contrato dura hasta la entrega y el pago del último hito. Cualquiera de las partes puede resolverlo si la otra incumple sus obligaciones y no lo corrige en quince días desde que se le avise por escrito. En ese caso se pagará el trabajo hecho hasta entonces.

## 9. Ley aplicable

El contrato se rige por la ley española. Para cualquier conflicto, las partes se someten a los juzgados y tribunales de {empresa.ciudad}.

Y en prueba de conformidad, las partes firman este contrato electrónicamente.
$$),
('Contrato de mantenimiento y hosting', 'Para servicios recurrentes: mantenimiento web, hosting, dominios y soporte.', $$# Contrato de mantenimiento, alojamiento y soporte

En {fecha.ciudad}, a {fecha.larga}.

## Reunidos

De una parte, **{empresa.nombre}**, con CIF {empresa.cif} (en adelante, «el Proveedor»), y de otra **{cliente.nombre}**, con CIF {cliente.cif} (en adelante, «el Cliente»).

## 1. Servicios

El Proveedor prestará al Cliente los siguientes servicios recurrentes:

{servicios.lista}

## 2. Qué incluye

- Actualizaciones de seguridad y de versiones del software instalado.
- Copias de seguridad periódicas y restauración en caso de fallo.
- Vigilancia de la disponibilidad y del rendimiento.
- Atención de incidencias por correo en horario laboral.

Los desarrollos nuevos, rediseños y cambios de contenido no están incluidos y se presupuestan aparte.

## 3. Precio y facturación

Cada servicio se factura por adelantado al inicio de su periodo, según la periodicidad indicada. El precio podrá actualizarse una vez al año avisando con un mes de antelación.

## 4. Duración

El contrato empieza el {fecha.larga} y se renueva automáticamente por periodos iguales, salvo que una parte avise de que no quiere renovarlo con al menos treinta días de antelación.

## 5. Protección de datos

El Proveedor actúa como encargado del tratamiento de los datos personales alojados en los servicios, siguiendo las instrucciones del Cliente y aplicando las medidas de seguridad adecuadas.

## 6. Ley aplicable

El contrato se rige por la ley española. Para cualquier conflicto, las partes se someten a los juzgados y tribunales de {empresa.ciudad}.
$$),
('Acuerdo de confidencialidad (NDA)', 'Para proteger la información que se comparte antes de presupuestar o durante un proyecto.', $$# Acuerdo de confidencialidad

En {fecha.ciudad}, a {fecha.larga}.

Entre **{empresa.nombre}**, con CIF {empresa.cif}, y **{cliente.nombre}**, con CIF {cliente.cif}.

## 1. Información confidencial

Es confidencial toda la información técnica, comercial o de negocio que una parte comparta con la otra, por cualquier medio, con motivo de la colaboración entre ambas.

## 2. Obligaciones

La parte que reciba la información la usará solo para valorar o ejecutar la colaboración, no la compartirá con terceros sin permiso por escrito y la protegerá con el mismo cuidado que su propia información.

## 3. Excepciones

No es confidencial la información que ya fuera pública, la que la parte receptora ya conociera o la que deba revelarse por obligación legal.

## 4. Duración

Este acuerdo dura mientras dure la colaboración y los tres años siguientes.

## 5. Ley aplicable

El acuerdo se rige por la ley española. Para cualquier conflicto, las partes se someten a los juzgados y tribunales de {empresa.ciudad}.
$$);
