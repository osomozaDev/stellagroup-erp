import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO = 'es_publico';

/** Ruta sin sesión de usuario: la propia ruta se encarga de comprobar quién llama */
export const Publico = () => SetMetadata(ES_PUBLICO, true);
