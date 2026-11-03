-- Stella ERP: esquema inicial
-- Todo el acceso a datos pasa por la API (service role). RLS activado sin políticas
-- para que nadie pueda leer las tablas directamente con la clave pública.

create extension if not exists "pgcrypto";

-- ───────────── Empresa (una sola fila con los datos fiscales y ajustes) ─────────────
create table empresa (
  id int primary key default 1 check (id = 1),
  nombre text not null default 'Mi empresa',
  cif text,
  direccion text,
  cp text,
  ciudad text,
  provincia text,
  email text,
  telefono text,
  iban text,
  serie_factura text default 'F',
  -- 'anual': F2026-0001 (vuelve a 1 cada año) · 'continua': 29, 30, 31…
  numeracion text not null default 'anual' check (numeracion in ('anual', 'continua')),
  dias_vencimiento int not null default 30,
  iva_pct numeric(5,2) not null default 21,
  ss_trabajador_pct numeric(5,2) not null default 6.50,
  ss_empresa_pct numeric(5,2) not null default 31.50,
  pie_factura text,
  logo text,                                   -- imagen en data URL (se reduce en el navegador)
  color text not null default '#1f6feb',
  forma_pago text not null default 'Transferencia bancaria',
  -- Validez por defecto de los presupuestos y texto de condiciones que llevan al pie
  validez_presupuesto_dias int not null default 30,
  condiciones_presupuesto text,
  updated_at timestamptz not null default now()
);
insert into empresa (id) values (1);

-- ───────────── Clientes ─────────────
create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cif text,
  direccion text,
  cp text,
  ciudad text,
  provincia text,
  email text,
  telefono text,
  contacto text,
  web text,
  notas text,
  -- Condición de pago para calcular el vencimiento de sus facturas.
  --   empresa → usa los «días para pagar» de Mi empresa
  --   dias    → pago_valor días después de la fecha de la factura
  --   dia_mes → el día pago_valor del mes siguiente a la factura (p. ej. el 5)
  pago_tipo text not null default 'empresa' check (pago_tipo in ('empresa', 'dias', 'dia_mes')),
  pago_valor int check (pago_valor is null or pago_valor between 0 and 365),
  -- Portal de clientes: correos que pueden entrar además del de la ficha
  portal_activo boolean not null default false,
  portal_emails text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ───────────── Proyectos ─────────────
-- Se facturan por hitos (importe cerrado repartido en entregas) o por horas (cada mes lo trabajado)
create type estado_proyecto as enum ('activo', 'pausado', 'terminado');

create table proyectos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete restrict,
  nombre text not null,
  referencia text,
  tipo text not null default 'web' check (tipo in ('web', 'software', 'app', 'ecommerce', 'automatizacion', 'ia', 'integracion', 'seo', 'otro')),
  descripcion text,
  url text,                                    -- web publicada, repositorio o entorno de pruebas
  concepto text not null default 'Desarrollo de software a medida',
  modalidad text not null default 'hitos' check (modalidad in ('hitos', 'horas')),
  estado estado_proyecto not null default 'activo',
  fecha_inicio date,
  fecha_fin date,
  presupuesto numeric(12,2) not null default 0, -- importe cerrado (por hitos)
  horas_mes numeric(10,2) not null default 0,   -- horas previstas al mes (por horas)
  precio_hora numeric(10,2) not null default 0,
  iva_pct numeric(5,2) not null default 21,
  -- Retención de IRPF que aplica el cliente (si la factura la emite un profesional)
  retencion_pct numeric(5,2) not null default 0,
  notas text,
  created_at timestamptz not null default now()
);
create index proyectos_cliente_idx on proyectos(cliente_id);

-- ───────────── Facturas ─────────────
create type estado_factura as enum ('borrador', 'emitida', 'cobrada', 'anulada');

create table contadores_factura (
  serie text not null,
  anio int not null,
  ultimo int not null default 0,
  primary key (serie, anio)
);

create table facturas (
  id uuid primary key default gen_random_uuid(),
  numero text unique,                          -- los borradores (prefacturas) no tienen número
  serie text,
  anio int,
  cliente_id uuid not null references clientes(id) on delete restrict,
  proyecto_id uuid references proyectos(id) on delete set null,
  periodo date, -- primer día del mes facturado (facturas mensuales por horas)
  fecha date not null default current_date,
  vencimiento date,
  estado estado_factura not null default 'emitida',
  cobrada_en date,
  base numeric(12,2) not null default 0,
  iva_pct numeric(5,2) not null default 21,
  iva_importe numeric(12,2) not null default 0,
  retencion_pct numeric(5,2) not null default 0,
  retencion_importe numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notas text,
  -- Rectificativas (art. 15 del Reglamento de facturación): serie R y a qué factura corrigen
  rectifica_id uuid references facturas(id),
  motivo_rectificacion text,
  created_at timestamptz not null default now()
);
create index facturas_cliente_idx on facturas(cliente_id);
create index facturas_proyecto_idx on facturas(proyecto_id);
create index facturas_fecha_idx on facturas(fecha desc);
create index facturas_rectifica_idx on facturas(rectifica_id) where rectifica_id is not null;
-- Una sola factura mensual (no anulada) por proyecto y mes
create unique index facturas_proyecto_periodo_uniq on facturas(proyecto_id, periodo)
  where proyecto_id is not null and periodo is not null and estado <> 'anulada' and rectifica_id is null;

create table factura_lineas (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references facturas(id) on delete cascade,
  orden int not null default 0,
  concepto text not null,
  cantidad numeric(12,2) not null default 1,
  unidad text not null default 'h',
  precio numeric(12,2) not null default 0,
  importe numeric(12,2) not null default 0
);
create index factura_lineas_factura_idx on factura_lineas(factura_id);

-- Número correlativo sin huecos. En numeración continua el contador se guarda con año 0
create or replace function siguiente_numero_factura(p_serie text, p_anio int)
returns text language plpgsql as $$
declare
  n int;
  modo text;
  clave int;
begin
  select numeracion into modo from empresa where id = 1;
  clave := case when modo = 'continua' then 0 else p_anio end;
  insert into contadores_factura (serie, anio, ultimo) values (p_serie, clave, 1)
  on conflict (serie, anio) do update set ultimo = contadores_factura.ultimo + 1
  returning ultimo into n;
  if modo = 'continua' then
    return case when p_serie = '' then n::text else p_serie || n::text end;
  end if;
  return p_serie || p_anio::text || '-' || lpad(n::text, 4, '0');
end $$;

-- Qué número llevará la próxima factura (sin gastarlo)
create or replace function proximo_numero_factura()
returns int language sql stable as $$
  select coalesce(max(c.ultimo), 0) + 1
  from empresa e
  left join contadores_factura c
    on c.serie = e.serie_factura
   and c.anio = case when e.numeracion = 'continua' then 0 else extract(year from current_date)::int end
  where e.id = 1;
$$;

-- Para seguir la numeración que ya traía la empresa
create or replace function fijar_proximo_numero(p_numero int)
returns void language plpgsql as $$
declare
  e empresa;
  clave int;
begin
  select * into e from empresa where id = 1;
  clave := case when e.numeracion = 'continua' then 0 else extract(year from current_date)::int end;
  insert into contadores_factura (serie, anio, ultimo) values (e.serie_factura, clave, p_numero - 1)
  on conflict (serie, anio) do update set ultimo = p_numero - 1;
end $$;

-- Si al guardar una factura falla algo, el número que se cogió se devuelve
-- para que no quede un hueco en la numeración (solo si nadie ha cogido otro después)
create or replace function liberar_numero_factura(p_serie text, p_anio int, p_numero text)
returns void language plpgsql as $$
declare
  modo text;
  clave int;
  n int := substring(p_numero from '(\d+)$')::int;
begin
  select numeracion into modo from empresa where id = 1;
  clave := case when modo = 'continua' then 0 else p_anio end;
  update contadores_factura set ultimo = ultimo - 1
  where serie = p_serie and anio = clave and ultimo = n;
end $$;

-- ───────────── Hitos de proyecto ─────────────
-- Entregas con su importe. Al terminarlas se facturan (o se preparan como prefactura).
create table hitos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  orden int not null default 0,
  nombre text not null,
  descripcion text,
  importe numeric(12,2) not null default 0,
  fecha_prevista date,
  completado_en date,
  factura_id uuid references facturas(id) on delete set null,
  created_at timestamptz not null default now()
);
create index hitos_proyecto_idx on hitos(proyecto_id, orden);

-- Horas trabajadas en cada proyecto, semana a semana. Las semanas se cortan a fin de
-- mes (p. ej. 27–31 oct y 1–2 nov) para que la suma de cada mes salga exacta.
create table horas_semana (
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  inicio date not null,
  horas numeric(10,2) not null check (horas >= 0),
  notas text,
  actualizado_por uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (proyecto_id, inicio)
);

-- ───────────── Presupuestos ─────────────
create type estado_presupuesto as enum ('borrador', 'enviado', 'aceptado', 'rechazado');

create table presupuestos (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,                 -- P2026-001
  anio int not null,
  cliente_id uuid not null references clientes(id) on delete restrict,
  proyecto_id uuid references proyectos(id) on delete set null, -- el proyecto que salió al aceptarlo
  titulo text not null,
  introduccion text,
  fecha date not null default current_date,
  valido_hasta date,
  estado estado_presupuesto not null default 'borrador',
  respondido_en date,
  base numeric(12,2) not null default 0,
  iva_pct numeric(5,2) not null default 21,
  iva_importe numeric(12,2) not null default 0,
  retencion_pct numeric(5,2) not null default 0,
  retencion_importe numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  condiciones text,
  notas text,
  created_at timestamptz not null default now()
);
create index presupuestos_cliente_idx on presupuestos(cliente_id);
create index presupuestos_fecha_idx on presupuestos(fecha desc);

-- Cada línea del presupuesto se convierte en un hito del proyecto al aceptarlo
create table presupuesto_lineas (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references presupuestos(id) on delete cascade,
  orden int not null default 0,
  concepto text not null,
  cantidad numeric(12,2) not null default 1,
  unidad text not null default 'ud',
  precio numeric(12,2) not null default 0,
  importe numeric(12,2) not null default 0
);
create index presupuesto_lineas_idx on presupuesto_lineas(presupuesto_id);

create table contadores_presupuesto (
  anio int primary key,
  ultimo int not null default 0
);

create or replace function siguiente_numero_presupuesto(p_anio int)
returns text language plpgsql as $$
declare n int;
begin
  insert into contadores_presupuesto (anio, ultimo) values (p_anio, 1)
  on conflict (anio) do update set ultimo = contadores_presupuesto.ultimo + 1
  returning ultimo into n;
  return 'P' || p_anio::text || '-' || lpad(n::text, 3, '0');
end $$;

-- ───────────── Servicios recurrentes (hosting, dominios, mantenimiento, licencias…) ─────────────
create type estado_servicio as enum ('activo', 'cancelado');

create table servicios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete restrict,
  proyecto_id uuid references proyectos(id) on delete set null,
  tipo text not null default 'hosting' check (tipo in ('hosting', 'dominio', 'mantenimiento', 'soporte', 'licencia', 'saas', 'correo', 'otro')),
  nombre text not null,
  detalle text,                                -- dominio, plan, servidor…
  proveedor text,                              -- a quién se lo compramos (OVH, Hetzner, Google…)
  precio numeric(12,2) not null default 0,     -- lo que paga el cliente por periodo
  coste numeric(12,2) not null default 0,      -- lo que nos cuesta por periodo
  periodicidad text not null default 'mensual' check (periodicidad in ('mensual', 'trimestral', 'semestral', 'anual')),
  iva_pct numeric(5,2) not null default 21,
  fecha_inicio date not null default current_date,
  proxima_renovacion date not null,
  renovacion_auto boolean not null default true,
  estado estado_servicio not null default 'activo',
  cancelado_en date,
  notas text,
  created_at timestamptz not null default now()
);
create index servicios_cliente_idx on servicios(cliente_id);
create index servicios_renovacion_idx on servicios(proxima_renovacion) where estado = 'activo';

-- Cada periodo facturado de un servicio
create table servicio_renovaciones (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references servicios(id) on delete cascade,
  desde date not null,
  hasta date not null,
  importe numeric(12,2) not null,
  factura_id uuid references facturas(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (servicio_id, desde)
);

-- ───────────── Equipo y nóminas ─────────────
create table empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellidos text,
  dni text,
  nss text,
  puesto text,
  telefono text,
  email text,
  iban text,
  fecha_alta date,
  fecha_baja date,
  activo boolean not null default true,
  salario_bruto_anual numeric(12,2) not null default 0,
  pagas int not null default 14 check (pagas in (12, 14)),
  irpf_pct numeric(5,2) not null default 12,
  coste_hora numeric(10,2),                    -- para saber si un proyecto por horas sale rentable
  proyecto_id uuid references proyectos(id) on delete set null, -- proyecto principal en el que está
  notas text,
  created_at timestamptz not null default now()
);

create type estado_nomina as enum ('pendiente', 'pagada');

create table nominas (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete cascade,
  periodo date not null,
  bruto numeric(12,2) not null,
  ss_trabajador numeric(12,2) not null,
  irpf numeric(12,2) not null,
  neto numeric(12,2) not null,
  ss_empresa numeric(12,2) not null,
  coste_empresa numeric(12,2) not null,
  estado estado_nomina not null default 'pendiente',
  pagada_en date,
  notas text,
  created_at timestamptz not null default now(),
  unique (empleado_id, periodo)
);

-- ───────────── Usuarios, roles y permisos ─────────────
--   admin       → todo, incluida la gestión de usuarios y roles
--   oficina     → los módulos marcados en permisos
--   trabajador  → solo su portal (proyecto y nóminas propias)
create table roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tipo text not null check (tipo in ('admin', 'oficina', 'trabajador')),
  permisos text[] not null default '{}',
  sistema boolean not null default false, -- los de partida no se pueden borrar
  created_at timestamptz not null default now()
);

insert into roles (nombre, tipo, permisos, sistema) values
  ('Administrador', 'admin', '{}', true),
  ('Oficina', 'oficina', '{inicio,facturas,clientes,proyectos,presupuestos,servicios,empleados,nominas,cobros,gestoria}', true),
  ('Trabajador', 'trabajador', '{}', true);

create table perfiles (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  rol_id uuid not null references roles(id),
  permisos text[], -- null = los del rol
  -- Borrar la ficha de un empleado no quita el acceso a un usuario de oficina: solo se desvincula
  empleado_id uuid unique references empleados(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────────── Cobros: envíos por correo y recordatorios ─────────────
create table envios (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references facturas(id) on delete cascade,
  tipo text not null check (tipo in ('factura', 'recordatorio')),
  para text not null,
  asunto text not null,
  modo text not null default 'real' check (modo in ('real', 'prueba')),
  automatico boolean not null default false,
  enviado_en timestamptz not null default now(),
  -- Estado real de cada correo según los avisos de Resend (entregado, rebotado, spam)
  estado text not null default 'enviado' check (estado in ('enviado', 'entregado', 'retrasado', 'rebotado', 'spam')),
  motivo text,
  estado_en timestamptz,
  proveedor_id text,
  revisado boolean not null default false
);
create index envios_factura_idx on envios(factura_id, enviado_en desc);
create index envios_proveedor_idx on envios(proveedor_id) where proveedor_id is not null;
create index envios_problemas_idx on envios(estado) where estado in ('rebotado', 'spam') and not revisado;

create table ajustes_cobros (
  id int primary key default 1 check (id = 1),
  recordatorios_auto boolean not null default false,
  cada_dias int not null default 7 check (cada_dias between 1 and 60),
  texto_recordatorio text not null default
    E'Hola,\n\nTe escribimos para recordarte que la factura {numero} por importe de {total} venció el {vencimiento}.\n\nPuedes pagarla por transferencia a la cuenta {iban}. Si ya la has pagado, no hagas caso de este mensaje.\n\nUn saludo,\n{empresa}'
);
insert into ajustes_cobros (id) values (1);

-- ───────────── Telegram ─────────────
create table telegram_chats (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  chat_id bigint unique,
  nombre text,
  -- Código de un solo uso para conectar el chat (t.me/bot?start=código)
  codigo text unique,
  codigo_caduca timestamptz,
  avisos text[] not null default '{rebotes,cobradas,vencidas,facturar,renovaciones,semanal}',
  vinculado_en timestamptz
);

-- Avisos ya mandados, para no repetir el mismo (p. ej. «vencida:<factura>» o «semanal:2026-11-02»)
create table avisos_enviados (
  clave text primary key,
  enviado_en timestamptz not null default now()
);

-- ───────────── Portal de clientes ─────────────
-- Enlaces de entrada de un solo uso; se guarda el hash, nunca el código
create table portal_enlaces (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  email text not null,
  codigo_hash text not null unique,
  caduca timestamptz not null,
  usado_en timestamptz,
  created_at timestamptz not null default now()
);
create index on portal_enlaces (email, created_at);

-- Quién ha entrado y qué ha descargado
create table portal_accesos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  email text not null,
  accion text not null check (accion in ('entrada', 'descarga', 'zip')),
  factura_id uuid references facturas(id) on delete set null,
  cuantas int,
  created_at timestamptz not null default now()
);
create index on portal_accesos (cliente_id, created_at desc);

-- ───────────── Permisos ─────────────
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Solo la API (service_role) trabaja con las tablas
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
