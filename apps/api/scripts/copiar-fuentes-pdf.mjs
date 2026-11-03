// El generador de PDF (pdfkit) carga sus fuentes estándar con require('#standard-fonts/…')
// desde una función que esbuild no puede seguir, así que no entran en el paquete de Vercel.
// Se copian junto a él y el campo «imports» de package.json les dice a Node dónde están.
import { cpSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const desdePdf = createRequire(join(raiz, '../../packages/pdf/package.json'));
const desdeRenderer = createRequire(desdePdf.resolve('@react-pdf/renderer'));
let pdfkit = dirname(desdeRenderer.resolve('pdfkit'));
while (!existsSync(join(pdfkit, 'package.json'))) pdfkit = dirname(pdfkit);
cpSync(join(pdfkit, 'js/standard-fonts'), join(raiz, 'dist-vercel/standard-fonts'), { recursive: true });
console.log('Fuentes estándar del PDF copiadas a dist-vercel/standard-fonts');
