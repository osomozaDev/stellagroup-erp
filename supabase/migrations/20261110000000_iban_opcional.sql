-- El IBAN de la empresa no es obligatorio en los contratos: sin él, el texto dice
-- «mediante transferencia a la cuenta que figure en cada factura». Los contratos que
-- ya lo tenían marcado como pendiente y no están firmados se corrigen igual.
update contratos
set cuerpo = replace(cuerpo, '[falta empresa · iban]', 'que figure en cada factura'),
    updated_at = now()
where cuerpo like '%[falta empresa · iban]%'
  and estado in ('borrador', 'enviado', 'rechazado');
