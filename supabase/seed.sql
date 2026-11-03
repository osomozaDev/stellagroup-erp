-- Datos de ejemplo para probar Stella ERP en local (supabase db reset).
-- Los clientes, proyectos e importes son inventados. Los datos fiscales de la empresa
-- (CIF, dirección, IBAN) son de relleno: hay que poner los reales en «Mi empresa».

update empresa set
  nombre = 'Stella Group',
  cif = 'B00000000',
  direccion = 'Dirección por completar',
  cp = '28001', ciudad = 'Madrid', provincia = 'Madrid',
  email = 'contacto@stella.com', telefono = null,
  iban = 'ES00 0000 0000 0000 0000 0000',
  serie_factura = 'F',
  color = '#006fea',
  -- Monograma «SG» de stellagroup.es (sale en las facturas y presupuestos)
  logo = 'data:image/png;base64,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',
  validez_presupuesto_dias = 30,
  condiciones_presupuesto = E'Precios sin IVA. Forma de pago: 50 % al aceptar el presupuesto y 50 % a la entrega de cada hito.\nIncluye 3 meses de garantía sobre lo desarrollado. El hosting, los dominios y las licencias de terceros se facturan aparte.',
  pie_factura = 'Stella Group · Soluciones tecnológicas que impulsan tu negocio.'
where id = 1;

-- ───────────── Clientes ─────────────
insert into clientes (id, nombre, cif, direccion, cp, ciudad, provincia, email, telefono, contacto, web, pago_tipo, pago_valor, portal_activo) values
  ('11111111-1111-4111-8111-111111111111', 'Café Origen S.L.', 'B87654321', 'C/ Fuencarral 45', '28004', 'Madrid', 'Madrid', 'hola@cafeorigen.es', '910 111 222', 'Lucía Prieto', 'cafeorigen.es', 'empresa', null, true),
  ('22222222-2222-4222-8222-222222222222', 'Clínica Dental Sonrisa Norte S.L.P.', 'B65432198', 'Av. de Burgos 12', '28036', 'Madrid', 'Madrid', 'administracion@sonrisanorte.es', '913 456 789', 'Dra. Elena Ruiz', 'sonrisanorte.es', 'dias', 15, false),
  ('33333333-3333-4333-8333-333333333333', 'Logística Levante Express S.A.', 'A46998877', 'Pol. Ind. Fuente del Jarro, C/ Ciudad de Sevilla 8', '46988', 'Paterna', 'Valencia', 'it@levanteexpress.es', '961 222 333', 'Jorge Martí', 'levanteexpress.es', 'dia_mes', 10, true),
  ('44444444-4444-4444-8444-444444444444', 'Inmobiliaria Altamar S.L.', 'B29112233', 'Paseo Marítimo 21', '29016', 'Málaga', 'Málaga', 'gestion@altamarhomes.es', '952 333 444', 'Carlos Vega', 'altamarhomes.es', 'empresa', null, false),
  ('55555555-5555-4555-8555-555555555555', 'Academia Lingua S.L.', 'B50443322', 'C/ Alfonso I 17', '50003', 'Zaragoza', 'Zaragoza', 'direccion@academialingua.es', '976 444 555', 'Sara Gil', 'academialingua.es', 'empresa', null, false);

-- ───────────── Proyectos ─────────────
insert into proyectos (id, cliente_id, nombre, referencia, tipo, descripcion, url, concepto, modalidad, estado, fecha_inicio, fecha_fin, presupuesto, horas_mes, precio_hora, iva_pct) values
  ('a1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Tienda online Café Origen', 'P2026-001', 'ecommerce',
   'Tienda en Shopify a medida con suscripciones de café, pasarela de pago y envíos con seguimiento.', 'https://cafeorigen.es', 'Desarrollo de tienda online', 'hitos', 'activo', '2026-07-01', '2026-11-30', 8400, 0, 0, 21),
  ('a2222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'Plataforma de rutas y repartos', 'LEX-PLAT', 'software',
   'Planificador de rutas, app para conductores e integración con su ERP. Evolución continua por bolsa de horas.', 'https://rutas.levanteexpress.es', 'Desarrollo y evolución de la plataforma de rutas', 'horas', 'activo', '2026-07-01', '2026-12-31', 0, 60, 55, 21),
  ('a3333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'Web corporativa Sonrisa Norte', 'P2025-014', 'web',
   'Web con citas online, blog y SEO local.', 'https://sonrisanorte.es', 'Diseño y desarrollo de web corporativa', 'hitos', 'terminado', '2026-07-15', '2026-10-01', 3600, 0, 0, 21),
  ('a4444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444', 'Asistente IA para captar compradores', 'P2026-002', 'ia',
   'Chatbot en la web y WhatsApp que responde sobre inmuebles, cualifica al comprador y lo pasa al CRM.', null, 'Asistente de inteligencia artificial', 'hitos', 'activo', '2026-09-15', '2027-01-31', 5500, 0, 0, 21),
  ('a5555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', 'Soporte y mejoras de la app de alumnos', 'LIN-SOP', 'app',
   'Bolsa de horas mensual para soporte, correcciones y pequeñas mejoras de la app iOS y Android.', null, 'Soporte y evolución de la app de alumnos', 'horas', 'activo', '2026-09-01', null, 0, 15, 50, 21);

-- ───────────── Facturas ─────────────
-- Ayudante solo para la semilla: crea una factura numerada con sus líneas y totales
create function pg_temp.factura(p_cliente uuid, p_proyecto uuid, p_fecha date, p_estado estado_factura, p_cobrada date, p_periodo date, p_lineas jsonb)
returns uuid language plpgsql as $$
declare
  fid uuid;
  b numeric;
  l jsonb;
  i int := 0;
begin
  select coalesce(sum(round((x->>'cantidad')::numeric * (x->>'precio')::numeric, 2)), 0) into b from jsonb_array_elements(p_lineas) x;
  insert into facturas (numero, serie, anio, cliente_id, proyecto_id, periodo, fecha, vencimiento, estado, cobrada_en, base, iva_pct, iva_importe, total)
  values (siguiente_numero_factura('F', extract(year from p_fecha)::int), 'F', extract(year from p_fecha)::int, p_cliente, p_proyecto, p_periodo,
          p_fecha, p_fecha + 30, p_estado, p_cobrada, b, 21, round(b * 0.21, 2), b + round(b * 0.21, 2))
  returning id into fid;
  for l in select * from jsonb_array_elements(p_lineas) loop
    insert into factura_lineas (factura_id, orden, concepto, cantidad, unidad, precio, importe)
    values (fid, i, l->>'concepto', (l->>'cantidad')::numeric, coalesce(l->>'unidad', 'ud'), (l->>'precio')::numeric,
            round((l->>'cantidad')::numeric * (l->>'precio')::numeric, 2));
    i := i + 1;
  end loop;
  return fid;
end $$;

do $$
declare
  cafe constant uuid := '11111111-1111-4111-8111-111111111111';
  clinica constant uuid := '22222222-2222-4222-8222-222222222222';
  levante constant uuid := '33333333-3333-4333-8333-333333333333';
  altamar constant uuid := '44444444-4444-4444-8444-444444444444';
  lingua constant uuid := '55555555-5555-4555-8555-555555555555';
  tienda constant uuid := 'a1111111-1111-4111-8111-111111111111';
  rutas constant uuid := 'a2222222-2222-4222-8222-222222222222';
  web constant uuid := 'a3333333-3333-4333-8333-333333333333';
  ia constant uuid := 'a4444444-4444-4444-8444-444444444444';
  app constant uuid := 'a5555555-5555-4555-8555-555555555555';
  f_tienda1 uuid; f_tienda2 uuid; f_web1 uuid; f_web2 uuid; f_web3 uuid; f_ia1 uuid; f_mant9 uuid; f_mant10 uuid;
begin
  f_tienda1 := pg_temp.factura(cafe, tienda, '2026-07-15', 'cobrada', '2026-07-29', null,
    '[{"concepto": "Tienda online Café Origen — Diseño UX/UI\nInvestigación, wireframes y diseño final de la tienda", "cantidad": 1, "precio": 2000}]');
  perform pg_temp.factura(levante, rutas, '2026-07-31', 'cobrada', '2026-08-10', '2026-07-01',
    '[{"concepto": "Desarrollo y evolución de la plataforma de rutas (julio 2026)", "cantidad": 58, "unidad": "h", "precio": 55}]');
  f_web1 := pg_temp.factura(clinica, web, '2026-08-05', 'cobrada', '2026-08-18', null,
    '[{"concepto": "Web corporativa Sonrisa Norte — Diseño", "cantidad": 1, "precio": 1200}]');
  perform pg_temp.factura(levante, rutas, '2026-08-31', 'cobrada', '2026-09-10', '2026-08-01',
    '[{"concepto": "Desarrollo y evolución de la plataforma de rutas (agosto 2026)", "cantidad": 42, "unidad": "h", "precio": 55}]');
  f_mant9 := pg_temp.factura(clinica, web, '2026-09-01', 'cobrada', '2026-09-12', null,
    '[{"concepto": "Mantenimiento web: Mantenimiento mensual (sonrisanorte.es)\nDel 01/09/2026 al 30/09/2026", "cantidad": 1, "precio": 120}]');
  f_web2 := pg_temp.factura(clinica, web, '2026-09-10', 'cobrada', '2026-09-24', null,
    '[{"concepto": "Web corporativa Sonrisa Norte — Desarrollo y citas online", "cantidad": 1, "precio": 1800}]');
  perform pg_temp.factura(levante, rutas, '2026-09-30', 'cobrada', '2026-10-10', '2026-09-01',
    '[{"concepto": "Desarrollo y evolución de la plataforma de rutas (septiembre 2026)\nApp de conductores: firma de entrega y fotos", "cantidad": 64, "unidad": "h", "precio": 55}]');
  perform pg_temp.factura(lingua, app, '2026-09-30', 'cobrada', '2026-10-15', '2026-09-01',
    '[{"concepto": "Soporte y evolución de la app de alumnos (septiembre 2026)", "cantidad": 15, "unidad": "h", "precio": 50}]');
  f_mant10 := pg_temp.factura(clinica, web, '2026-10-01', 'emitida', null, null,
    '[{"concepto": "Mantenimiento web: Mantenimiento mensual (sonrisanorte.es)\nDel 01/10/2026 al 31/10/2026", "cantidad": 1, "precio": 120}]');
  f_web3 := pg_temp.factura(clinica, web, '2026-10-01', 'cobrada', '2026-10-20', null,
    '[{"concepto": "Web corporativa Sonrisa Norte — SEO local y puesta en marcha", "cantidad": 1, "precio": 600}]');
  f_ia1 := pg_temp.factura(altamar, ia, '2026-10-02', 'emitida', null, null,
    '[{"concepto": "Asistente IA para captar compradores — Prototipo y base de conocimiento", "cantidad": 1, "precio": 1500}]');
  f_tienda2 := pg_temp.factura(cafe, tienda, '2026-10-15', 'emitida', null, null,
    '[{"concepto": "Tienda online Café Origen — Desarrollo de la tienda y suscripciones", "cantidad": 1, "precio": 4400}]');
  perform pg_temp.factura(levante, rutas, '2026-10-31', 'emitida', null, '2026-10-01',
    '[{"concepto": "Desarrollo y evolución de la plataforma de rutas (octubre 2026)\nIntegración con el ERP y panel de incidencias", "cantidad": 61, "unidad": "h", "precio": 55}]');
  perform pg_temp.factura(lingua, app, '2026-10-31', 'emitida', null, '2026-10-01',
    '[{"concepto": "Soporte y evolución de la app de alumnos (octubre 2026)", "cantidad": 18, "unidad": "h", "precio": 50}]');

  -- ───────────── Hitos ─────────────
  insert into hitos (proyecto_id, orden, nombre, descripcion, importe, fecha_prevista, completado_en, factura_id) values
    (tienda, 0, 'Diseño UX/UI', 'Investigación, wireframes y diseño final de la tienda', 2000, '2026-07-15', '2026-07-14', f_tienda1),
    (tienda, 1, 'Desarrollo de la tienda y suscripciones', null, 4400, '2026-10-15', '2026-10-14', f_tienda2),
    (tienda, 2, 'Pasarela de pago y envíos', 'Redsys, Bizum y seguimiento de envíos con la agencia', 1200, '2026-11-01', '2026-10-31', null),
    (tienda, 3, 'Puesta en marcha y formación', null, 800, '2026-11-30', null, null),
    (web, 0, 'Diseño', null, 1200, '2026-08-01', '2026-08-04', f_web1),
    (web, 1, 'Desarrollo y citas online', null, 1800, '2026-09-10', '2026-09-09', f_web2),
    (web, 2, 'SEO local y puesta en marcha', null, 600, '2026-10-01', '2026-09-30', f_web3),
    (ia, 0, 'Prototipo y base de conocimiento', null, 1500, '2026-10-01', '2026-09-30', f_ia1),
    (ia, 1, 'Integración con el CRM y WhatsApp', null, 2500, '2026-12-15', null, null),
    (ia, 2, 'Ajuste fino y lanzamiento', null, 1500, '2027-01-31', null, null);

  -- ───────────── Servicios recurrentes ─────────────
  insert into servicios (id, cliente_id, proyecto_id, tipo, nombre, detalle, proveedor, precio, coste, periodicidad, fecha_inicio, proxima_renovacion, renovacion_auto) values
    ('c1111111-1111-4111-8111-111111111111', cafe, tienda, 'hosting', 'Hosting y CDN de la tienda', 'cafeorigen.es', 'Hetzner', 39, 12, 'mensual', '2026-10-05', '2026-11-05', true),
    ('c2222222-2222-4222-8222-222222222222', cafe, tienda, 'dominio', 'Dominio', 'cafeorigen.es', 'OVHcloud', 25, 11, 'anual', '2026-03-14', '2027-03-14', true),
    ('c3333333-3333-4333-8333-333333333333', clinica, web, 'mantenimiento', 'Mantenimiento mensual', 'sonrisanorte.es', null, 120, 0, 'mensual', '2026-09-01', '2026-11-01', true),
    ('c4444444-4444-4444-8444-444444444444', clinica, web, 'hosting', 'Hosting web y correo', 'sonrisanorte.es · 5 buzones', 'Raiola Networks', 290, 95, 'anual', '2025-11-20', '2026-11-20', true),
    ('c5555555-5555-4555-8555-555555555555', clinica, web, 'dominio', 'Dominio', 'sonrisanorte.es', 'OVHcloud', 25, 11, 'anual', '2025-11-20', '2026-11-20', false),
    ('c6666666-6666-4666-8666-666666666666', altamar, ia, 'saas', 'Uso del modelo de IA y WhatsApp Business', 'Hasta 5.000 conversaciones al mes', 'OpenAI · Meta', 180, 60, 'mensual', '2026-10-10', '2026-11-10', true),
    ('c7777777-7777-4777-8777-777777777777', levante, rutas, 'hosting', 'Servidor cloud de la plataforma', '2 vCPU · 8 GB · copias diarias', 'Hetzner', 149, 54, 'mensual', '2026-07-15', '2026-11-15', true),
    ('c8888888-8888-4888-8888-888888888888', levante, rutas, 'soporte', 'Soporte técnico 24/7', 'Guardia y respuesta en menos de 2 h', null, 450, 0, 'trimestral', '2026-10-01', '2027-01-01', true),
    ('c9999999-9999-4999-8999-999999999999', lingua, app, 'correo', 'Correo profesional', '12 cuentas Google Workspace', 'Google', 144, 72, 'anual', '2026-02-01', '2027-02-01', true);

  insert into servicio_renovaciones (servicio_id, desde, hasta, importe, factura_id) values
    ('c3333333-3333-4333-8333-333333333333', '2026-09-01', '2026-09-30', 120, f_mant9),
    ('c3333333-3333-4333-8333-333333333333', '2026-10-01', '2026-10-31', 120, f_mant10);
end $$;

-- ───────────── Presupuestos ─────────────
insert into presupuestos (id, numero, anio, cliente_id, proyecto_id, titulo, introduccion, fecha, valido_hasta, estado, respondido_en, base, iva_pct, iva_importe, total) values
  ('b1111111-1111-4111-8111-111111111111', 'P2026-001', 2026, '11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111',
   'Tienda online con suscripciones', 'Proponemos una tienda online propia para vender café de especialidad por suscripción, con pago recurrente y envíos con seguimiento.',
   '2026-06-10', '2026-07-10', 'aceptado', '2026-06-20', 8400, 21, 1764, 10164),
  ('b2222222-2222-4222-8222-222222222222', 'P2026-002', 2026, '44444444-4444-4444-8444-444444444444', 'a4444444-4444-4444-8444-444444444444',
   'Asistente IA para captar compradores', 'Un asistente que atiende 24/7 en la web y en WhatsApp, responde sobre cada inmueble y pasa al CRM a los compradores interesados.',
   '2026-09-01', '2026-10-01', 'aceptado', '2026-09-12', 5500, 21, 1155, 6655),
  ('b3333333-3333-4333-8333-333333333333', 'P2026-003', 2026, '22222222-2222-4222-8222-222222222222', null,
   'App de reservas y recordatorios para pacientes', 'App para que los pacientes pidan cita, reciban recordatorios y vean su historial de tratamientos.',
   '2026-10-20', '2026-11-30', 'enviado', null, 9800, 21, 2058, 11858),
  ('b4444444-4444-4444-8444-444444444444', 'P2026-004', 2026, '55555555-5555-4555-8555-555555555555', null,
   'Rediseño de la web y campus online', null, '2026-11-02', '2026-12-02', 'borrador', null, 4200, 21, 882, 5082),
  ('b5555555-5555-4555-8555-555555555555', 'P2026-005', 2026, '33333333-3333-4333-8333-333333333333', null,
   'Integración del ERP con el CRM comercial', 'Sincronización en tiempo real de clientes, pedidos y facturas entre su ERP y HubSpot.',
   '2026-08-20', '2026-09-20', 'rechazado', '2026-09-15', 3600, 21, 756, 4356);

insert into presupuesto_lineas (presupuesto_id, orden, concepto, cantidad, unidad, precio, importe) values
  ('b1111111-1111-4111-8111-111111111111', 0, E'Diseño UX/UI\nInvestigación, wireframes y diseño final de la tienda', 1, 'ud', 2000, 2000),
  ('b1111111-1111-4111-8111-111111111111', 1, 'Desarrollo de la tienda y suscripciones', 1, 'ud', 4400, 4400),
  ('b1111111-1111-4111-8111-111111111111', 2, E'Pasarela de pago y envíos\nRedsys, Bizum y seguimiento de envíos con la agencia', 1, 'ud', 1200, 1200),
  ('b1111111-1111-4111-8111-111111111111', 3, 'Puesta en marcha y formación', 1, 'ud', 800, 800),
  ('b2222222-2222-4222-8222-222222222222', 0, 'Prototipo y base de conocimiento', 1, 'ud', 1500, 1500),
  ('b2222222-2222-4222-8222-222222222222', 1, 'Integración con el CRM y WhatsApp', 1, 'ud', 2500, 2500),
  ('b2222222-2222-4222-8222-222222222222', 2, 'Ajuste fino y lanzamiento', 1, 'ud', 1500, 1500),
  ('b3333333-3333-4333-8333-333333333333', 0, E'Diseño UX/UI\nFlujos de reserva, recordatorios y perfil del paciente', 1, 'ud', 2200, 2200),
  ('b3333333-3333-4333-8333-333333333333', 1, E'App iOS y Android\nReservas, notificaciones y historial', 1, 'ud', 5600, 5600),
  ('b3333333-3333-4333-8333-333333333333', 2, E'Integración con la agenda de la clínica', 1, 'ud', 1400, 1400),
  ('b3333333-3333-4333-8333-333333333333', 3, 'Publicación en App Store y Google Play', 1, 'ud', 600, 600),
  ('b4444444-4444-4444-8444-444444444444', 0, 'Diseño de la nueva web', 1, 'ud', 1400, 1400),
  ('b4444444-4444-4444-8444-444444444444', 1, E'Campus online\nAcceso de alumnos, materiales y vídeos', 40, 'h', 55, 2200),
  ('b4444444-4444-4444-8444-444444444444', 2, 'Migración de contenidos', 1, 'ud', 600, 600),
  ('b5555555-5555-4555-8555-555555555555', 0, 'Análisis y mapa de datos', 1, 'ud', 800, 800),
  ('b5555555-5555-4555-8555-555555555555', 1, 'Conector ERP ↔ HubSpot', 1, 'ud', 2800, 2800);

insert into contadores_presupuesto (anio, ultimo) values (2026, 5);

-- Horas apuntadas esta semana en la plataforma de rutas
insert into horas_semana (proyecto_id, inicio, horas, notas) values
  ('a2222222-2222-4222-8222-222222222222', '2026-11-01', 0, null),
  ('a2222222-2222-4222-8222-222222222222', '2026-11-02', 14, 'Panel de incidencias: filtros y exportación');

-- ───────────── Equipo ─────────────
insert into empleados (nombre, apellidos, dni, nss, puesto, telefono, email, fecha_alta, salario_bruto_anual, pagas, irpf_pct, coste_hora, proyecto_id) values
  ('Laura', 'Méndez Ruiz', '11111111H', '28/11111111/11', 'Jefe/a de proyecto', '600 100 100', 'laura@stella.com', '2021-03-01', 42000, 14, 17, 34, null),
  ('Daniel', 'Ortega Vidal', '22222222J', '28/22222222/22', 'Desarrollador/a full stack', '600 200 200', 'daniel@stella.com', '2022-01-10', 36000, 14, 15, 29, 'a2222222-2222-4222-8222-222222222222'),
  ('Marta', 'Soler Gil', '33333333P', '28/33333333/33', 'Diseñador/a UX/UI', '600 300 300', 'marta@stella.com', '2023-04-17', 32000, 14, 14, 26, 'a1111111-1111-4111-8111-111111111111'),
  ('Pablo', 'Ferrer Navarro', '44444444A', '28/44444444/44', 'Especialista en IA', '600 400 400', 'pablo@stella.com', '2024-09-02', 38000, 14, 16, 31, 'a4444444-4444-4444-8444-444444444444'),
  ('Irene', 'Castro Molina', '55555555K', '28/55555555/55', 'Administración', '600 500 500', 'irene@stella.com', '2022-06-01', 26000, 14, 11, 21, null);

-- ───────────── Catálogo de productos y servicios (el de Stella Group, octubre de 2026) ─────────────
insert into catalogo (tipo, categoria, nombre, descripcion, unidad, precio, coste) values
  ('servicio', 'Webs', 'Landing Page', 'Página única con portada, negocio, servicios, ubicación y contacto · adaptada a móvil, llamada, WhatsApp, redes y mapa · SEO, AEO y GEO inicial · publicación y 1 ronda de revisión', 'ud', 200, null),
  ('servicio', 'Webs', 'Web de 3 páginas', 'Hasta 3 páginas (p. ej. Inicio, Servicios y Contacto) · galería básica, formulario y mapa · SEO, AEO y GEO inicial en las tres páginas · publicación y 1 ronda de revisión', 'ud', 400, null),
  ('servicio', 'Webs', 'Web de 5 páginas', 'Hasta 5 páginas con galerías y secciones comerciales · formularios y llamadas a la acción · SEO, AEO y GEO inicial ampliado · publicación y 2 rondas de revisión', 'ud', 600, null),
  ('servicio', 'Webs', 'Web Premium personalizada', 'Diseño exclusivo, hasta 10 páginas o secciones, animaciones y galerías · formularios, WhatsApp, mapas y redes · SEO, AEO y GEO inicial avanzado y optimización de rendimiento · publicación y 2 rondas de revisión. No incluye reservas con backend, ecommerce ni integraciones a medida.', 'ud', 1000, null),
  ('servicio', 'Mantenimiento', 'Mantenimiento Básico', 'Hosting y SSL, supervisión de disponibilidad, copias semanales, actualizaciones de seguridad e incidencias técnicas', 'mes', 10, null),
  ('servicio', 'Mantenimiento', 'Mantenimiento Estándar', 'Todo lo del Básico con copias diarias, revisión mensual de formularios y enlaces y supervisión básica del rendimiento', 'mes', 20, null),
  ('servicio', 'Mantenimiento', 'Mantenimiento Avanzado', 'Todo lo del Estándar con supervisión avanzada del rendimiento y soporte técnico prioritario', 'mes', 30, null),
  ('producto', 'Dominios', 'Dominio estándar (.es / .com)', 'Registro o renovación anual a nombre del cliente · configuración inicial incluida con la web', 'año', 20, null),
  ('servicio', 'Soluciones QR', 'QR reseñas de Google', 'QR que lleva a la ficha de reseñas del negocio · puesta en marcha y mantenimiento del enlace', 'mes', 10, null),
  ('servicio', 'Soluciones QR', 'Carta digital QR', 'Carta digital accesible desde un QR, alojada y siempre disponible · gestión técnica de la plataforma', 'mes', 20, null),
  ('servicio', 'Soluciones QR', 'Fidelización QR', 'Tarjeta de puntos digital con sellos o recompensas y panel básico de gestión', 'mes', 30, null),
  ('servicio', 'Fotografía', 'Fotografía: 5 fotos editadas', 'Sesión gastronómica con 5 fotos editadas · entrega digital para web y redes', 'ud', 79, null),
  ('servicio', 'Fotografía', 'Fotografía: 12 fotos editadas', 'Sesión gastronómica con 12 fotos editadas · entrega digital para web y redes', 'ud', 129, null),
  ('servicio', 'Fotografía', 'Fotografía: 25 fotos editadas', 'Sesión gastronómica con 25 fotos editadas · entrega digital para web y redes', 'ud', 199, null);
