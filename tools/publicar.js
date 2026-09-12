#!/usr/bin/env node
/*
  Publica la app con un solo comando:

    node tools/publicar.js "qué has cambiado"

  1. Sube el número de versión (version.json).
  2. Pone ese número en las direcciones de css/js dentro de index.html y en el service worker,
     para que el navegador nunca mezcle ficheros de versiones distintas (GitHub Pages cachea 10 min).
  3. git add, commit y push. GitHub Pages despliega en medio minuto.
*/
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'version.json');
const message = process.argv.slice(2).join(' ').trim() || 'Actualización';

let build = 0;
try { build = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')).build || 0; } catch (e) { /* primera vez */ }
build += 1;
fs.writeFileSync(VERSION_FILE, JSON.stringify({ build }, null, 2) + '\n');

function rewrite(file, fn) {
  const p = path.join(ROOT, file);
  fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8')));
}

// index.html: css/styles.css?v=N, js/data.js?v=N, js/app.js?v=N
rewrite('index.html', (s) => s
  .replace(/href="css\/styles\.css(\?v=\d+)?"/, `href="css/styles.css?v=${build}"`)
  .replace(/src="js\/data\.js(\?v=\d+)?"/, `src="js/data.js?v=${build}"`)
  .replace(/src="js\/app\.js(\?v=\d+)?"/, `src="js/app.js?v=${build}"`));

// sw.js: nombre de la cache y lista de ficheros con la misma versión
rewrite('sw.js', (s) => s
  .replace(/const CACHE = '[^']+';/, `const CACHE = 'horario-b${build}';`)
  .replace(/'\.\/css\/styles\.js?[^']*'/g, `'./css/styles.css?v=${build}'`)
  .replace(/'\.\/css\/styles\.css[^']*'/g, `'./css/styles.css?v=${build}'`)
  .replace(/'\.\/js\/data\.js[^']*'/g, `'./js/data.js?v=${build}'`)
  .replace(/'\.\/js\/app\.js[^']*'/g, `'./js/app.js?v=${build}'`));

console.log(`Versión ${build}.`);

const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT, stdio: 'inherit' });
const staged = execSync('git status --porcelain', { cwd: ROOT }).toString();
if (/cuadrante\.json|clave\.txt|Captura de pantalla/i.test(staged)) {
  console.error('Hay ficheros privados sin ignorar. Revisa .gitignore antes de publicar.');
  process.exit(1);
}
git('add -A');
git(`-c core.safecrlf=false commit -q -m "${message.replace(/"/g, '\\"')} (v${build})"`);
git('push -q origin main');
console.log('Publicado. En medio minuto estará en https://presidewitt.github.io/Alsa-Horario/');
