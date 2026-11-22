#!/usr/bin/env node
// MCP de avisos de Stella ERP: manda avisos por el bot de Telegram a los usuarios conectados.
// Llama a la API de Stella (/api/avisos/externo) con la clave STELLA_AVISOS_KEY.
// Sin dependencias: habla MCP (JSON-RPC por stdin/stdout, una línea por mensaje).
//
// Alta en Claude Code:
//   claude mcp add stella-avisos -s user -e STELLA_AVISOS_KEY=<clave> -- node /ruta/a/mcp/stella-avisos.mjs
// Opcional: STELLA_API_URL (por defecto https://stellagroup-erp.vercel.app/api)

import { createInterface } from 'node:readline';

const API = (process.env.STELLA_API_URL ?? 'https://stellagroup-erp.vercel.app/api').replace(/\/$/, '');
const CLAVE = process.env.STELLA_AVISOS_KEY ?? '';

const HERRAMIENTAS = [
  {
    name: 'destinatarios_telegram',
    description: 'Lista los usuarios de Stella ERP que tienen el Telegram conectado y pueden recibir avisos del bot.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'enviar_aviso_telegram',
    description:
      'Manda un aviso por el bot de Telegram de Stella ERP. Llega como «📣 Aviso de <firma>» seguido del texto. ' +
      'Confirma siempre el texto y los destinatarios con el usuario antes de enviarlo.',
    inputSchema: {
      type: 'object',
      properties: {
        para: { type: 'array', items: { type: 'string' }, description: 'Nombres (p. ej. «Javi») o usuario_id de destinatarios_telegram; ["todos"] para todos' },
        texto: { type: 'string', description: 'Texto del aviso (texto plano, hasta 3500 caracteres)' },
        firma: { type: 'string', description: 'Quién lo firma, p. ej. «Omar». Opcional' },
      },
      required: ['para', 'texto'],
      additionalProperties: false,
    },
  },
];

async function api(ruta, cuerpo) {
  if (!CLAVE) throw new Error('Falta STELLA_AVISOS_KEY en la configuración del MCP');
  const r = await fetch(`${API}${ruta}`, {
    method: cuerpo ? 'POST' : 'GET',
    headers: { 'x-api-key': CLAVE, ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.message ? [].concat(datos.message).join('; ') : `Stella respondió ${r.status}`);
  return datos;
}

async function llamar(nombre, args = {}) {
  if (nombre === 'destinatarios_telegram') {
    const lista = await api('/avisos/externo/destinatarios');
    return lista.length ? lista.map((d) => `• ${d.nombre ?? 'Sin nombre'} (${d.usuario_id})`).join('\n') : 'Nadie tiene el Telegram conectado.';
  }
  if (nombre === 'enviar_aviso_telegram') {
    const r = await api('/avisos/externo', { para: args.para ?? [], texto: args.texto, firma: args.firma });
    return [
      r.enviados.length ? `✅ Enviado a: ${r.enviados.join(', ')}` : '⚠️ No se ha enviado a nadie',
      r.sin_telegram?.length ? `Sin Telegram conectado o no encontrados: ${r.sin_telegram.join(', ')}` : '',
      r.fallidos?.length ? `Fallidos: ${r.fallidos.map((f) => `${f.nombre}: ${f.error}`).join('; ')}` : '',
    ].filter(Boolean).join('\n');
  }
  throw new Error(`Herramienta desconocida: ${nombre}`);
}

const responder = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
const fallo = (id, code, message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');

createInterface({ input: process.stdin }).on('line', async (linea) => {
  let m;
  try {
    m = JSON.parse(linea);
  } catch {
    return;
  }
  if (m.id === undefined) return; // notificaciones
  switch (m.method) {
    case 'initialize':
      return responder(m.id, {
        protocolVersion: m.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'stella-avisos', version: '1.0.0' },
        instructions: 'Avisos por el bot de Telegram de Stella ERP. Antes de enviar, enseña el texto y los destinatarios al usuario y espera su confirmación.',
      });
    case 'ping':
      return responder(m.id, {});
    case 'tools/list':
      return responder(m.id, { tools: HERRAMIENTAS });
    case 'tools/call':
      try {
        const texto = await llamar(m.params?.name, m.params?.arguments);
        return responder(m.id, { content: [{ type: 'text', text: texto }] });
      } catch (e) {
        return responder(m.id, { content: [{ type: 'text', text: `⚠️ ${e.message}` }], isError: true });
      }
    default:
      return fallo(m.id, -32601, `Método no soportado: ${m.method}`);
  }
});
