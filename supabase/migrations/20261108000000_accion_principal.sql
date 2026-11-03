-- Qué es lo más importante del día a día de la empresa: decide el botón grande del menú,
-- el central de la barra del móvil y lo primero que sale en el inicio.
--   presupuesto  → crear presupuestos (agencias, empresas que venden por proyecto)
--   facturar_mes → facturar las horas del mes (empresas que facturan cada mes)
alter table empresa
  add column accion_principal text not null default 'presupuesto' check (accion_principal in ('presupuesto', 'facturar_mes'));
