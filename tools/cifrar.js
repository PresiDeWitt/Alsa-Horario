#!/usr/bin/env node
/*
  Cifra el cuadrante para publicarlo.

  Lee cuadrante.json (solo en este PC, fuera del repositorio) y escribe js/data.js con el
  cuadrante cifrado (PBKDF2-SHA256 + AES-256-GCM). La app lo descifra con la clave de acceso
  que se escribe una vez en cada dispositivo.

  Uso:
    node tools/cifrar.js                     pide la clave por teclado
    node tools/cifrar.js --clave "mi clave"  usa esa clave
    node tools/cifrar.js --nueva             genera una clave nueva (la muestra) y cifra con ella

  Si la clave es la misma que la del cifrado anterior, se reutiliza su sal: los dispositivos ya
  autorizados siguen abriendo sin volver a pedirla. Con una clave nueva, la sal cambia y todos
  los dispositivos quedan fuera hasta que la escriban.
*/
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'cuadrante.json');
const OUT = path.join(ROOT, 'js', 'data.js');
const ITERATIONS = 600000;

// Alfabeto sin caracteres que se confundan (sin 0/O, 1/I/L): 20 caracteres ≈ 98 bits de entropía.
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const MIN_LENGTH = 16;

// Minúsculas y sin espacios ni guiones: «XXGF-BN8S», «xxgf bn8s» y «xxgfbn8s» son la misma clave.
function normalize(code) {
  return String(code).normalize('NFKC').toLowerCase().replace(/[\s\u002d\u2010-\u2015\u2212_]/g, '');
}

function generate() {
  const chars = [];
  for (let i = 0; i < 20; i++) chars.push(ALPHABET[crypto.randomInt(ALPHABET.length)]);
  return chars.join('').replace(/(.{4})(?=.)/g, '$1-');
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

function current() {
  try {
    const src = fs.readFileSync(OUT, 'utf8');
    const get = (re) => { const m = src.match(re); return m ? m[1] : null; };
    return {
      version: Number(get(/version:\s*(\d+)/) || 0),
      salt: get(/salt:\s*"([^"]+)"/),
      iv: get(/iv:\s*"([^"]+)"/),
      data: get(/data:\s*"([^"]+)"/),
    };
  } catch (e) { return { version: 0, salt: null, iv: null, data: null }; }
}

// ¿Abre la clave el cifrado actual? Entonces es la misma y se conserva la sal.
function opensCurrent(code, prev) {
  if (!prev.salt || !prev.iv || !prev.data) return false;
  try {
    const key = crypto.pbkdf2Sync(code, Buffer.from(prev.salt, 'base64'), ITERATIONS, 32, 'sha256');
    const buf = Buffer.from(prev.data, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(prev.iv, 'base64'));
    d.setAuthTag(buf.subarray(buf.length - 16));
    d.update(buf.subarray(0, buf.length - 16));
    d.final();
    return true;
  } catch (e) { return false; }
}

async function main() {
  const args = process.argv.slice(2);
  let code = null;
  const i = args.indexOf('--clave');
  if (i >= 0) code = args[i + 1];
  if (args.includes('--nueva')) code = generate();
  if (!code) code = await ask('Clave de acceso: ');
  code = normalize(code);
  if (code.length < MIN_LENGTH) {
    console.error(`La clave debe tener al menos ${MIN_LENGTH} caracteres (sin contar guiones). Usa --nueva para generar una fuerte.`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  if (!Array.isArray(payload.cuadrante) || payload.cuadrante.length !== 8) {
    console.error('cuadrante.json debe tener "cuadrante" con 8 turnos.');
    process.exit(1);
  }

  const prev = current();
  const sameCode = !args.includes('--nueva') && opensCurrent(code, prev);
  const salt = sameCode ? Buffer.from(prev.salt, 'base64') : crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(code, salt, ITERATIONS, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const data = Buffer.concat([body, cipher.getAuthTag()]); // formato de WebCrypto: cifrado + etiqueta
  const version = prev.version + 1;

  const out = `/*
  Cuadrante cifrado. Se genera con  node tools/cifrar.js  a partir de cuadrante.json.
  La app lo descifra con la clave de acceso; sin ella no se puede leer.
*/
window.HORARIO_DEFAULTS = {
  version: ${version},
  kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ${ITERATIONS}, salt: "${salt.toString('base64')}" },
  cipher: { name: "AES-GCM", iv: "${iv.toString('base64')}" },
  data: "${data.toString('base64')}",
};
`;
  fs.writeFileSync(OUT, out);
  console.log(`js/data.js cifrado (versión ${version}).`);
  console.log(sameCode
    ? 'Misma clave: los dispositivos ya autorizados siguen abriendo sin pedirla.'
    : 'Clave nueva: todos los dispositivos pedirán la clave al abrir la app.');
  if (args.includes('--nueva')) console.log(`\nClave de acceso nueva:  ${code.toUpperCase()}\n\nGuárdala: hay que escribirla en cada dispositivo (da igual mayúsculas o minúsculas).`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
