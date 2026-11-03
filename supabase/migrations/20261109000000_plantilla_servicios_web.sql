-- Contrato de servicios web de Stella Group (versión revisada del contrato en papel de noviembre de 2026).
-- Los servicios, precios y periodicidades no van en el texto: salen del presupuesto (Anexo I), para no
-- contradecir el catálogo. Lo que cambia en cada contrato queda marcado como «[falta …]».
insert into plantillas_contrato (nombre, descripcion, cuerpo)
select 'Contrato de servicios web (diseño, desarrollo y mantenimiento)',
       'El contrato de Stella Group para webs, mantenimiento, dominio, QR y fotografía. Usa el presupuesto como Anexo I.',
$$# Contrato de prestación de servicios de diseño, desarrollo y mantenimiento web

En {fecha.ciudad}, a {fecha.larga}.

## Reunidos

De una parte, **{empresa.nombre}**, con NIF {empresa.cif}, domicilio en {empresa.direccion_completa}, teléfono {empresa.telefono} y correo {empresa.email}, y en su nombre la persona que firma este contrato (en adelante, «el Prestador»).

De otra parte, **{cliente.nombre}**, con NIF/CIF {cliente.cif}, domicilio en {cliente.direccion_completa}, teléfono {cliente.telefono} y correo {cliente.email}, y en su nombre la persona que firma este contrato (en adelante, «el Cliente»).

El Cliente declara que contrata estos servicios para su actividad empresarial o profesional, y no como consumidor.

Ambas partes se reconocen capacidad legal suficiente para obligarse y

## Exponen

I. Que el Prestador se dedica al diseño, desarrollo, posicionamiento y mantenimiento de páginas web y servicios digitales para negocios.

II. Que el Cliente desea contratar dichos servicios conforme al presupuesto nº {presupuesto.numero} de {presupuesto.fecha}, aceptado por el Cliente, que se incorpora como Anexo I y forma parte inseparable de este contrato.

Por todo ello, acuerdan formalizar el presente contrato con arreglo a las siguientes

## Cláusulas

## 1. Objeto

El Prestador diseñará, desarrollará y publicará el sitio web del Cliente y prestará los servicios descritos en el Anexo I, con el alcance (número de páginas, funciones y rondas de revisión), precio y periodicidad que allí se indican. Si hubiera diferencias entre este contrato y el Anexo I en cuanto a alcance o precio, prevalecerá el Anexo I.

Salvo que el Anexo I diga otra cosa, la web incluye diseño adaptado a móvil, tableta y ordenador; elementos de contacto (WhatsApp, llamada, formulario, mapa y redes sociales); configuración inicial de SEO, AEO y GEO; optimización de la velocidad de carga, y la puesta en marcha y publicación del sitio.

## 2. Servicios no incluidos

Salvo que figuren expresamente en el Anexo I, no están incluidos: la redacción de textos, la fotografía, el diseño de logotipo, páginas o secciones adicionales, tienda online o pasarela de pago, reservas con desarrollo a medida, integraciones con sistemas externos, traducciones, campañas de publicidad, la redacción de los textos legales de la web (aviso legal, privacidad y cookies) ni funcionalidades no descritas. Cualquiera de ellos podrá presupuestarse aparte.

## 3. Precio y forma de pago

El precio de cada servicio es el indicado en el Anexo I, al que se añadirá el IVA vigente. Los trabajos de pago único se abonarán así, salvo que el Anexo I diga otra cosa:

- **50 %** a la firma de este contrato, como condición para iniciar los trabajos.
- **50 %** a la entrega de la web terminada y antes de su publicación.

Los servicios periódicos se facturarán por adelantado al inicio de cada periodo, según su periodicidad en el Anexo I. Las facturas se pagarán en un plazo de {empresa.dias_pago} días mediante transferencia a la cuenta {empresa.iban}.

El retraso en el pago devengará el interés de demora y la indemnización por costes de cobro de 40 € por factura previstos en la Ley 3/2004 de lucha contra la morosidad. Además, el Prestador podrá suspender los trabajos o los servicios contratados, previo aviso al Cliente, hasta que se regularice.

Los precios de los servicios periódicos podrán actualizarse una vez al año, avisando al Cliente con al menos treinta (30) días de antelación; si no está de acuerdo, podrá darse de baja antes de que se apliquen.

## 4. Plazo de entrega

El plazo estimado de entrega es de [falta plazo de entrega en días] días hábiles, contados desde la recepción del primer pago y de todos los contenidos necesarios (textos, imágenes, logotipo y datos del negocio). Los retrasos en la entrega de contenidos o en las respuestas del Cliente ampliarán el plazo en el mismo tiempo.

Si transcurren noventa (90) días sin que el Cliente aporte los contenidos o responda, el Prestador le requerirá por escrito para que lo haga en quince (15) días. Si no lo hace, el Prestador podrá dar por finalizado el proyecto, conservando el primer pago en compensación por el trabajo realizado.

## 5. Obligaciones del Cliente

- Facilitar contenidos veraces y de los que posea los derechos de uso, eximiendo al Prestador de cualquier reclamación de terceros por ellos.
- Revisar las propuestas y comunicar sus cambios en un plazo máximo de siete (7) días naturales.
- Custodiar las claves de acceso que reciba.
- Realizar los pagos en los plazos acordados.

## 6. Revisiones, entrega y aceptación

El precio incluye las rondas de revisión indicadas en el Anexo I sobre el diseño propuesto. Los cambios adicionales, o los que supongan modificar lo ya aprobado, se presupuestarán aparte a razón de [falta precio por hora de los cambios] € por hora más IVA.

Una vez comunicada la entrega, el Cliente dispondrá de siete (7) días naturales para notificar incidencias o errores de funcionamiento, que el Prestador corregirá sin coste. Transcurrido dicho plazo sin comunicación, o una vez publicada la web a petición del Cliente, el trabajo se entenderá aceptado.

## 7. Mantenimiento y alojamiento

Si el Cliente contrata un plan de mantenimiento, su precio y periodicidad (mensual o anual) son los del Anexo I, y empieza a contar desde la publicación de la web. Se renovará automáticamente por periodos iguales salvo que cualquiera de las partes comunique su baja con al menos treinta (30) días de antelación al siguiente periodo.

El mantenimiento no incluye modificaciones de textos, fotografías o contenidos, nuevas páginas, rediseños ni nuevas funcionalidades, que se presupuestarán aparte. El alojamiento (hosting) está incluido solo mientras el mantenimiento esté activo.

Si el Cliente no contrata mantenimiento o lo da de baja, será responsable de su propio alojamiento. A petición suya, y estando al corriente de pago, el Prestador le entregará en un plazo de quince (15) días una copia completa de los archivos y la base de datos de la web en un formato estándar, junto con los datos necesarios para trasladar el dominio.

## 8. Dominio

El dominio se registrará a nombre del Cliente, que será su titular. Su coste es el indicado en el Anexo I y se renovará anualmente mientras el Cliente no indique lo contrario. El Prestador no responde de la pérdida del dominio si no puede renovarlo por falta de pago o porque el Cliente así lo indique.

## 9. Servicios QR

Los servicios QR contratados en el Anexo I se abonan mensualmente por adelantado, sin permanencia. El Cliente podrá darlos de baja con quince (15) días de antelación al siguiente periodo; la baja no da derecho a la devolución del periodo ya pagado. Tras la baja, los códigos QR, también los ya impresos, y sus contenidos dejarán de estar operativos.

## 10. Propiedad intelectual

Una vez abonado el precio total, el Prestador cede al Cliente, con carácter **no exclusivo**, para todo el mundo y por todo el tiempo de protección, los derechos de reproducción, distribución, comunicación pública y transformación del diseño y los contenidos creados específicamente para su web, para su uso en la actividad del Cliente. Hasta entonces, el Cliente solo dispone de una licencia de uso.

El Prestador conserva la titularidad de sus herramientas, código genérico, plantillas y conocimientos previos, sobre los que el Cliente recibe una licencia de uso indefinida para su web. Los componentes de terceros (plantillas, plugins, tipografías e imágenes de bancos) se rigen por sus propias licencias. El Prestador podrá mostrar el proyecto en su portafolio salvo que el Cliente se oponga por escrito.

## 11. Posicionamiento en buscadores e inteligencia artificial

El Prestador aplicará las buenas prácticas de optimización para buscadores y asistentes de inteligencia artificial. No obstante, los resultados dependen de terceros (Google, ChatGPT y otros) y de la competencia, por lo que no se garantiza una posición concreta ni la aparición en un asistente determinado.

## 12. Confidencialidad

Las partes se comprometen a no divulgar la información confidencial de la otra parte a la que tengan acceso con motivo de este contrato, obligación que se mantendrá durante tres (3) años tras su finalización. Las claves de acceso facilitadas se usarán únicamente para prestar los servicios contratados.

## 13. Protección de datos

Los datos personales de las personas firmantes y de contacto se tratarán por cada parte con la única finalidad de gestionar este contrato, con base en su ejecución y conforme al Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica 3/2018 (LOPDGDD). Se conservarán mientras dure la relación y los plazos legales de prescripción, y podrán ejercerse los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo al correo de cada parte indicado en este contrato.

Cuando, para prestar los servicios, el Prestador trate datos personales de los que el Cliente es responsable, lo hará como encargado del tratamiento en los términos del Anexo II.

## 14. Responsabilidad y fuerza mayor

El Prestador no será responsable de interrupciones o daños causados por terceros proveedores (alojamiento, dominio, plataformas externas), ataques informáticos ajenos a su control, ni por el uso indebido de la web o de las claves por parte del Cliente. Tampoco responderá del lucro cesante ni de daños indirectos. En todo caso, su responsabilidad se limitará al importe abonado por el Cliente en los doce (12) meses anteriores al hecho causante, salvo dolo o negligencia grave.

Ninguna de las partes responderá de los incumplimientos debidos a causas de fuerza mayor o ajenas a su control razonable, como caídas generales de proveedores de internet o alojamiento, ciberataques masivos o desastres naturales, mientras duren.

## 15. Duración y resolución

Este contrato entra en vigor en la fecha de su firma y se mantendrá hasta la entrega de la web y, en cuanto a los servicios periódicos, mientras sigan contratados. Cualquiera de las partes podrá resolverlo por incumplimiento de la otra si este no se subsana en quince (15) días desde su notificación por escrito.

Si el Cliente cancela el proyecto antes de la entrega, deberá abonar el trabajo realizado hasta ese momento, con un mínimo equivalente al primer pago. Al terminar el contrato por cualquier causa, el Cliente abonará lo pendiente y el Prestador le entregará los materiales pagados.

## 16. Comunicaciones

Las comunicaciones entre las partes podrán realizarse por correo electrónico o WhatsApp a los datos indicados en este contrato, que tendrán plena validez a efectos de aprobaciones, entregas y avisos.

## 17. Legislación y jurisdicción

Este contrato se rige por la legislación española. Para cualquier controversia, las partes se someten a los Juzgados y Tribunales de {empresa.ciudad}, salvo que la normativa aplicable establezca un fuero imperativo distinto.

Y en prueba de conformidad, ambas partes firman el presente contrato electrónicamente o, en su caso, por duplicado, en el lugar y fecha indicados en el encabezamiento.

## Anexo I · Servicios contratados y precios

Según el presupuesto nº {presupuesto.numero} de {presupuesto.fecha}. Precios sin IVA.

{presupuesto.partidas}

## Anexo II · Encargo del tratamiento de datos (art. 28 RGPD)

- **Objeto y duración:** el Prestador trata datos personales por cuenta del Cliente solo para prestar los servicios de este contrato (alojamiento y mantenimiento de la web, gestión de formularios y servicios QR) y mientras estén contratados.
- **Datos y personas afectadas:** datos de contacto e identificativos de los clientes, usuarios de la web y participantes en la fidelización del Cliente, y los que el Cliente incorpore a la web.
- **Instrucciones:** el Prestador tratará los datos solo siguiendo las instrucciones documentadas del Cliente y no los usará para fines propios.
- **Confidencialidad:** las personas autorizadas por el Prestador para tratar los datos se comprometen a mantener su confidencialidad.
- **Seguridad:** el Prestador aplicará medidas técnicas y organizativas adecuadas al riesgo (cifrado SSL, copias de seguridad, control de accesos y actualizaciones de seguridad).
- **Subencargados:** el Cliente autoriza al Prestador a recurrir a sus proveedores de alojamiento, correo y plataformas QR, sujetos a las mismas obligaciones. El Prestador informará al Cliente de cualquier cambio de proveedor, que podrá oponerse.
- **Asistencia y brechas:** el Prestador ayudará al Cliente a atender los derechos de las personas afectadas y le notificará sin dilación indebida, y en todo caso en un máximo de 48 horas, cualquier brecha de seguridad de la que tenga conocimiento.
- **Auditoría:** el Prestador pondrá a disposición del Cliente la información necesaria para demostrar el cumplimiento de estas obligaciones.
- **Fin del encargo:** al terminar los servicios, el Prestador devolverá los datos al Cliente o los suprimirá, según indique, salvo obligación legal de conservarlos.
- **Responsabilidad del Cliente:** el Cliente es el responsable del tratamiento, y le corresponde informar a las personas afectadas y obtener su consentimiento cuando sea necesario, incluidos los textos legales y el aviso de cookies de su web.
$$
where not exists (select 1 from plantillas_contrato where nombre = 'Contrato de servicios web (diseño, desarrollo y mantenimiento)');
