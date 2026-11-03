// Función de Vercel: toda petición a /api/* llega aquí y la atiende la API de Nest.
// NestJS 12 solo se publica como módulos ES y el cargador de Vercel no admite
// require() de ellos, así que el build empaqueta la API en un único archivo ES
// (apps/api/dist-vercel/servidor.mjs, script build:vercel).
import api from '../apps/api/dist-vercel/servidor.mjs';

export default api.default ?? api;
