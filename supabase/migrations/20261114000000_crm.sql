-- Capa de CRM: oportunidades de venta, agenda y ficha de cada proyecto.

-- ───────────── Oportunidades ─────────────
-- Una posible venta, desde el primer contacto hasta que se gana o se pierde.
-- Puede ser de un cliente de la lista o de alguien que aún no lo es (contacto_*).
create table oportunidades (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  etapa text not null default 'nuevo' check (etapa in ('nuevo', 'contactado', 'reunion', 'propuesta', 'ganado', 'perdido')),
  cliente_id uuid references clientes(id) on delete set null,
  contacto_empresa text,
  contacto_nombre text,
  contacto_email text,
  contacto_telefono text,
  origen text not null default 'otro' check (origen in ('web', 'recomendacion', 'redes', 'llamada', 'evento', 'otro')),
  tipo_proyecto text,
  importe numeric(12,2) not null default 0,
  cierre_previsto date,
  responsable_id uuid references empleados(id) on delete set null,
  proyecto_id uuid references proyectos(id) on delete set null,
  motivo_perdida text,
  notas text,
  orden int not null default 0,
  cerrada_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cliente_id is not null or nullif(trim(coalesce(contacto_empresa, contacto_nombre, '')), '') is not null)
);
create index oportunidades_etapa_idx on oportunidades(etapa, orden);
create index oportunidades_cliente_idx on oportunidades(cliente_id);

-- Un presupuesto puede salir de una oportunidad y sabe qué tipo de proyecto será
alter table presupuestos
  add column oportunidad_id uuid references oportunidades(id) on delete set null,
  add column tipo_proyecto text;
create index presupuestos_oportunidad_idx on presupuestos(oportunidad_id) where oportunidad_id is not null;

-- ───────────── Agenda ─────────────
create table eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  tipo text not null default 'reunion' check (tipo in ('reunion', 'llamada', 'tarea', 'entrega', 'otro')),
  inicio timestamptz not null,
  fin timestamptz,
  todo_el_dia boolean not null default false,
  lugar text,                                  -- dirección o enlace de la videollamada
  descripcion text,
  enlaces jsonb not null default '[]',         -- [{nombre, url}]: web demo, documentos…
  completado_en timestamptz,
  cliente_id uuid references clientes(id) on delete cascade,
  oportunidad_id uuid references oportunidades(id) on delete cascade,
  proyecto_id uuid references proyectos(id) on delete cascade,
  responsable_id uuid references empleados(id) on delete set null,
  created_at timestamptz not null default now()
);
create index eventos_inicio_idx on eventos(inicio);
create index eventos_oportunidad_idx on eventos(oportunidad_id) where oportunidad_id is not null;
create index eventos_proyecto_idx on eventos(proyecto_id) where proyecto_id is not null;

-- ───────────── Ficha del proyecto ─────────────
-- Los detalles de cada tipo de proyecto (dominio, páginas, plataforma…). Los campos
-- de cada tipo están en packages/shared (CAMPOS_FICHA).
alter table proyectos add column ficha jsonb not null default '{}';

alter table oportunidades enable row level security;
alter table eventos enable row level security;
grant all on oportunidades, eventos to service_role;

-- Permisos de partida de los roles que ya existen
update roles set permisos = array(select distinct unnest(permisos || '{crm,agenda}'::text[]))
where nombre in ('Oficina', 'Director/a comercial', 'Comercial', 'Marketing');
update roles set permisos = array(select distinct unnest(permisos || '{agenda}'::text[]))
where nombre in ('Director/a de operaciones', 'Jefe/a de proyecto', 'Soporte técnico', 'Administración y finanzas');
