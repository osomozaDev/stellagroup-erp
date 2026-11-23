-- Pagos que el cliente ya ha hecho de un presupuesto (la señal, el 50 %…). Se comparan con
-- los pagos previstos (el plan «a convenir» o el 100 %, 50/50 o tres tercios del precio cerrado).
create table presupuesto_pagos (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references presupuestos(id) on delete cascade,
  fecha date not null default current_date,
  importe numeric(12,2) not null check (importe > 0),
  concepto text,
  nota text,
  registrado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index presupuesto_pagos_idx on presupuesto_pagos(presupuesto_id, fecha);
alter table presupuesto_pagos enable row level security;
