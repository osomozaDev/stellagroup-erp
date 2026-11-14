-- Dos formas de pago más: «a convenir» y una personalizada, con el plan de pagos escrito
-- a mano (una línea por pago), para clientes que pagan en fechas o partes distintas.
alter table presupuestos drop constraint if exists presupuestos_forma_pago_check;
alter table presupuestos add constraint presupuestos_forma_pago_check
  check (forma_pago in ('unico', 'dos', 'tres', 'convenir', 'personalizada'));

alter table presupuestos add column if not exists forma_pago_texto text;
