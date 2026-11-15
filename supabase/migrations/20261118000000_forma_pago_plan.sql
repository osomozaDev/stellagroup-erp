-- Plan de pagos «a convenir»: fecha y cantidad de cada pago, elegidas en el presupuesto.
-- [{ "fecha": "2026-12-01", "importe": 300, "concepto": "reserva" }, …]
alter table presupuestos add column if not exists forma_pago_plan jsonb not null default '[]'::jsonb;
