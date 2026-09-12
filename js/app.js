/* Horario — calendario del cuadrante rotativo ALSA */
(function () {
  'use strict';

  const STORAGE_KEY = 'horario-alsa.v1';
  const LOCKOUT_KEY = 'horario-alsa.intentos';
  const FREE_ATTEMPTS = 3;     // intentos sin espera
  const BLOCK_AT = 12;         // a partir de aquí, 24 h
  const BLOCK_MS = 24 * 3600 * 1000;
  const N_TURNOS = 8;
  const DOW_MED = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const DOW_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const THEMES = { system: 'Automático', light: 'Claro', dark: 'Oscuro' };
  const MONTHS_AHEAD = 15;  // meses que se pintan al arrancar
  const MONTHS_CHUNK = 6;   // meses que se añaden al llegar a un extremo

  let SEALED = window.HORARIO_DEFAULTS;   // cuadrante cifrado (tools/cifrar.js)
  let defaults = null;                     // { cuadrante } una vez descifrado
  // Si el navegador ha mezclado un index.html antiguo con este app.js (caches de GitHub Pages),
  // faltan elementos: se recarga una sola vez saltándose la cache.
  if (!document.getElementById('lock-form')) {
    const once = 'horario-recarga';
    if (!sessionStorage.getItem(once)) {
      sessionStorage.setItem(once, '1');
      location.replace(location.pathname + '?r=' + Date.now());
    }
    return;
  }

  const el = {
    topDate: document.getElementById('top-date'),
    topShift: document.getElementById('top-shift'),
    topSub: document.getElementById('top-sub'),
    btnToday: document.getElementById('btn-today'),
    btnSettings: document.getElementById('btn-settings'),
    months: document.getElementById('months'),
    sentinelTop: document.getElementById('sentinel-top'),
    sentinelBottom: document.getElementById('sentinel-bottom'),
    scrim: document.getElementById('scrim'),
    lock: document.getElementById('lock'),
    lockForm: document.getElementById('lock-form'),
    lockCode: document.getElementById('lock-code'),
    lockBtn: document.getElementById('lock-btn'),
    lockError: document.getElementById('lock-error'),
    lockMeta: document.getElementById('lock-meta'),
    lockShow: document.getElementById('lock-show'),
    sheet: document.getElementById('sheet'),
    settings: document.getElementById('settings'),
    top: document.getElementById('top'),
    themeMeta: document.querySelector('meta[name="theme-color"]'),
  };
  const mqDark = window.matchMedia('(prefers-color-scheme: dark)');

  let state = null;
  let today = startOfDay(new Date());
  let first = null; // primer mes pintado {y, m}
  let last = null;  // último mes pintado {y, m}
  let sheetTimer = null;
  let todayObserver = null;
  let anchorToToday = true; // la primera precarga de meses anteriores deja el mes actual bajo la cabecera

  /* Estado ------------------------------------------------------------ */
  function readSaved() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { return null; }
  }
  function loadState() {
    const saved = readSaved();
    const s = {
      cuadrante: defaults.cuadrante.map((r) => r.slice()),
      anchorMonday: iso(mondayOf(new Date())),
      anchorTurno: 1,
      configured: false,
      theme: 'system',
      edited: false,
      dataVersion: SEALED.version,
      key: null,
    };
    if (saved && typeof saved === 'object') Object.assign(s, saved);
    // Cuadrante nuevo publicado: se adopta salvo que el usuario haya editado el suyo.
    if (s.dataVersion !== SEALED.version && !s.edited) s.cuadrante = defaults.cuadrante.map((r) => r.slice());
    s.dataVersion = SEALED.version;
    const valid = Array.isArray(s.cuadrante) && s.cuadrante.length === N_TURNOS && s.cuadrante.every((r) => Array.isArray(r) && r.length === 7);
    if (!valid) s.cuadrante = defaults.cuadrante.map((r) => r.slice());
    // En la hoja impresa "Carta" es Cartagena: se actualizan cuadrantes guardados con el nombre corto.
    s.cuadrante = s.cuadrante.map((r) => r.map((c) => String(c).replace(/^Carta(?=\s|$)/i, 'Cartagena')));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.anchorMonday))) s.anchorMonday = iso(mondayOf(new Date()));
    s.anchorTurno = Math.min(N_TURNOS, Math.max(1, Number(s.anchorTurno) || 1));
    if (!THEMES[s.theme]) s.theme = 'system';
    return s;
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* sin almacenamiento */ }
  }

  /* Fechas ------------------------------------------------------------ */
  function pad(n) { return String(n).padStart(2, '0'); }
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function dow(d) { return (d.getDay() + 6) % 7; } // 0 = lunes
  function mondayOf(d) { return addDays(startOfDay(d), -dow(d)); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromIso(s) { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 864e5); }
  function weeksBetween(a, b) { return Math.round((b - a) / (7 * 864e5)); }
  function ymAdd(ym, n) { const d = new Date(ym.y, ym.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; }

  /* Cuadrante --------------------------------------------------------- */
  function turnoFor(d) {
    const w = weeksBetween(mondayOf(fromIso(state.anchorMonday)), mondayOf(d));
    return ((((state.anchorTurno - 1 + w) % N_TURNOS) + N_TURNOS) % N_TURNOS) + 1;
  }
  function parseCell(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s || /desc|libre/i.test(s)) return { type: 'descanso', lugar: '', hora: '', servicio: '', raw: s };
    const m = s.match(/^(.+?)\s+(\d{1,2}[:.]\d{2})\s*(?:-\s*(.+))?$/);
    if (m) return { type: 'trabajo', lugar: m[1].trim(), hora: m[2].replace('.', ':'), servicio: (m[3] || '').trim(), raw: s };
    return { type: 'trabajo', lugar: s, hora: '', servicio: '', raw: s };
  }
  function toneOf(shift) {
    if (shift.type === 'descanso') return 'descanso';
    const k = shift.lugar.toLowerCase();
    if (k.startsWith('sev')) return 'sevilla';
    if (k.startsWith('cart')) return 'carta';
    return 'otro';
  }
  function shiftFor(d) {
    const turno = turnoFor(d);
    const shift = parseCell(state.cuadrante[turno - 1][dow(d)]);
    shift.turno = turno;
    shift.tone = toneOf(shift);
    return shift;
  }
  function nextOfType(from, type) {
    for (let i = 1; i <= 90; i++) {
      const d = addDays(from, i);
      if (shiftFor(d).type === type) return d;
    }
    return null;
  }

  /* Textos ------------------------------------------------------------ */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function fmtLong(d) { return DOW_LONG[dow(d)] + ', ' + d.getDate() + ' de ' + MONTHS[d.getMonth()]; }
  function relDay(d) {
    const n = daysBetween(today, d);
    if (n === 0) return 'hoy';
    if (n === 1) return 'mañana';
    if (n === 2) return 'pasado mañana';
    if (n < 7) return 'el ' + DOW_LONG[dow(d)];
    return 'el ' + d.getDate() + ' de ' + MONTHS[d.getMonth()];
  }
  function shiftText(s) {
    if (s.type === 'descanso') return 'Descanso';
    return (s.lugar + ' ' + s.hora).trim();
  }
  function shiftTitle(s) {
    if (s.type === 'descanso') return '<span class="mark">Descanso</span>';
    return esc(s.lugar) + (s.hora ? ' <span class="hour">' + esc(s.hora) + '</span>' : '');
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* Cabecera ---------------------------------------------------------- */
  function renderTop() {
    const s = shiftFor(today);
    el.topDate.textContent = cap(fmtLong(today));
    el.topShift.className = 'top-shift tone-' + s.tone;
    el.topShift.innerHTML = shiftTitle(s);

    let sub;
    if (!state.configured) {
      sub = 'Se asume el turno 1 esta semana. <button type="button" class="link" data-action="settings">Elegir mi turno</button>';
    } else if (s.type === 'descanso') {
      const next = nextOfType(today, 'trabajo');
      sub = next ? 'Vuelves ' + relDay(next) + ', ' + esc(shiftText(shiftFor(next))) : 'Sin servicios próximos';
    } else {
      const next = nextOfType(today, 'descanso');
      sub = (s.servicio ? 'Servicio ' + esc(s.servicio) + '. ' : '') + (next ? 'Descanso ' + relDay(next) : '');
    }
    el.topSub.innerHTML = sub;

    // La vista previa (preview.html) muestra el servicio de hoy en el botón de accesos rápidos.
    if (window.parent !== window) {
      try { window.parent.postMessage({ type: 'horario:today', text: shiftText(s), rest: s.type === 'descanso' }, '*'); } catch (e) { /* sin padre */ }
    }
  }

  /* Meses ------------------------------------------------------------- */
  function buildMonth(ym) {
    const firstDay = new Date(ym.y, ym.m, 1);
    const lastDay = new Date(ym.y, ym.m + 1, 0);
    let work = 0;
    let rest = 0;
    let cells = '';
    for (let i = 0; i < dow(firstDay); i++) cells += '<div class="cell blank"></div>';
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(ym.y, ym.m, d);
      const s = shiftFor(date);
      const isRest = s.type === 'descanso';
      if (isRest) rest++; else work++;
      const cls = ['cell', 'tone-' + s.tone];
      if (isRest) cls.push('is-rest');
      if (sameDay(date, today)) cls.push('is-today');
      if (date < today) cls.push('is-past');
      cells += '<button type="button" class="' + cls.join(' ') + '" data-date="' + iso(date) + '" aria-label="' + esc(fmtLong(date)) + ': ' + esc(shiftText(s)) + (s.servicio ? ', servicio ' + esc(s.servicio) : '') + '">'
        + '<span class="num">' + d + '</span>'
        + (isRest ? '' : '<span class="hour">' + esc(s.hora || s.lugar.slice(0, 3)) + '</span>')
        + '</button>';
    }
    const sec = document.createElement('section');
    sec.className = 'month';
    sec.dataset.ym = ym.y + '-' + pad(ym.m + 1);
    sec.innerHTML = '<header class="month-head">'
      + '<h2 class="month-name">' + cap(MONTHS[ym.m]) + ' <span>' + ym.y + '</span></h2>'
      + '<p class="month-stats">' + plural(work, 'servicio', 'servicios') + ', ' + plural(rest, 'descanso', 'descansos') + '</p>'
      + '</header>'
      + '<div class="grid">' + cells + '</div>';
    return sec;
  }
  function appendMonths(n) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      last = last ? ymAdd(last, 1) : { y: today.getFullYear(), m: today.getMonth() };
      if (!first) first = last;
      frag.appendChild(buildMonth(last));
    }
    el.months.appendChild(frag);
  }
  function prependMonths(n) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      first = ymAdd(first, -1);
      frag.insertBefore(buildMonth(first), frag.firstChild);
    }
    const before = document.documentElement.scrollHeight;
    el.months.insertBefore(frag, el.months.firstChild);
    if (anchorToToday) { anchorToToday = false; scrollToToday(false); }
    else window.scrollBy(0, document.documentElement.scrollHeight - before);
  }
  function renderAll() {
    el.months.innerHTML = '';
    first = null;
    last = null;
    appendMonths(MONTHS_AHEAD);
    anchorToToday = true;
    window.scrollTo(0, 0); // el mes actual queda arriba; los anteriores se cargan al subir
    renderTop();
    watchToday();
  }

  // El botón «Hoy» aparece cuando el día de hoy sale de la pantalla.
  function watchToday() {
    if (todayObserver) todayObserver.disconnect();
    const cell = el.months.querySelector('.cell.is-today');
    if (!cell) { el.btnToday.hidden = false; return; }
    todayObserver = new IntersectionObserver((entries) => {
      el.btnToday.hidden = entries[0].isIntersecting;
    }, { rootMargin: '-' + el.top.offsetHeight + 'px 0px 0px 0px' });
    todayObserver.observe(cell);
  }
  function scrollToToday(smooth) {
    const target = el.months.querySelector('.month[data-ym="' + today.getFullYear() + '-' + pad(today.getMonth() + 1) + '"]');
    if (!target) return;
    const y = target.getBoundingClientRect().top + window.scrollY - el.top.offsetHeight;
    window.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
  }

  const edges = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      if (e.target === el.sentinelBottom) appendMonths(MONTHS_CHUNK);
      else prependMonths(MONTHS_CHUNK);
    });
  }, { rootMargin: '800px 0px 800px 0px' });

  /* Hoja de detalle --------------------------------------------------- */
  function openDay(d) {
    const s = shiftFor(d);
    const monday = mondayOf(d);
    let rows = '';
    for (let i = 0; i < 7; i++) {
      const x = addDays(monday, i);
      const sx = shiftFor(x);
      rows += '<div class="wk-row' + (sameDay(x, d) ? ' is-sel' : '') + '">'
        + '<span class="wk-day">' + DOW_MED[i] + ' ' + x.getDate() + '</span>'
        + '<span class="wk-main tone-' + sx.tone + (sx.type === 'descanso' ? ' is-rest' : '') + '">' + (sx.type === 'descanso' ? '<span class="mark">Descanso</span>' : esc(sx.lugar) + ' <span class="hour">' + esc(sx.hora) + '</span>') + '</span>'
        + '<span class="wk-serv">' + (sx.servicio ? esc(sx.servicio) : '') + '</span>'
        + '</div>';
    }
    const meta = [];
    if (s.servicio) meta.push('Servicio ' + esc(s.servicio));
    meta.push('turno ' + s.turno);
    el.sheet.innerHTML = '<div class="handle" aria-hidden="true"></div>'
      + '<p class="sh-date">' + cap(fmtLong(d)) + ' de ' + d.getFullYear() + '</p>'
      + '<h2 class="sh-title tone-' + s.tone + '">' + shiftTitle(s) + '</h2>'
      + '<p class="sh-sub">' + cap(meta.join(', ')) + '</p>'
      + '<div class="wk">' + rows + '</div>';
    clearTimeout(sheetTimer);
    el.sheet.hidden = false;
    el.scrim.hidden = false;
    el.sheet.scrollTop = 0;
    void el.sheet.offsetHeight;
    el.sheet.classList.add('is-open');
    el.scrim.classList.add('is-open');
  }
  function closeSheet() {
    if (el.sheet.hidden) return;
    el.sheet.classList.remove('is-open');
    el.scrim.classList.remove('is-open');
    sheetTimer = setTimeout(() => { el.sheet.hidden = true; el.scrim.hidden = true; }, 300);
  }
  let dragY = null;
  el.sheet.addEventListener('pointerdown', (e) => { if (el.sheet.scrollTop === 0) dragY = e.clientY; });
  el.sheet.addEventListener('pointermove', (e) => {
    if (dragY == null) return;
    const dy = Math.max(0, e.clientY - dragY);
    el.sheet.style.transition = 'none';
    el.sheet.style.transform = 'translateY(' + dy + 'px)';
  });
  function endDrag(e) {
    if (dragY == null) return;
    const dy = e.clientY - dragY;
    dragY = null;
    el.sheet.style.transition = '';
    el.sheet.style.transform = '';
    if (dy > 80) closeSheet();
  }
  el.sheet.addEventListener('pointerup', endDrag);
  el.sheet.addEventListener('pointercancel', endDrag);
  el.scrim.addEventListener('click', closeSheet);

  /* Ajustes ----------------------------------------------------------- */
  function renderSettings() {
    const monday = mondayOf(today);
    const current = turnoFor(today);
    let turnos = '';
    for (let t = 1; t <= N_TURNOS; t++) {
      turnos += '<button type="button" class="turno' + (t === current ? ' is-active' : '') + '" data-action="set-turno" data-turno="' + t + '" aria-pressed="' + (t === current) + '" aria-label="Turno ' + t + '">' + t + '</button>';
    }
    let editor = '';
    state.cuadrante.forEach((row, t) => {
      const rest = row.filter((c) => parseCell(c).type === 'descanso').length;
      let rows = '';
      row.forEach((cell, d) => {
        rows += '<label class="ed-row"><span class="ed-day">' + cap(DOW_MED[d]) + '</span>'
          + '<input class="ed-cell tone-' + toneOf(parseCell(cell)) + '" data-cell="' + t + ':' + d + '" value="' + esc(cell) + '" aria-label="Turno ' + (t + 1) + ', ' + DOW_LONG[d] + '" autocomplete="off" autocapitalize="off" spellcheck="false"></label>';
      });
      editor += '<details class="ed-turno"' + (t + 1 === current ? ' open' : '') + '>'
        + '<summary><span class="ed-turno-name">Turno ' + (t + 1) + '</span><span class="ed-turno-info">' + plural(7 - rest, 'servicio', 'servicios') + ', ' + plural(rest, 'descanso', 'descansos') + '</span></summary>'
        + '<div class="ed-rows">' + rows + '</div>'
        + '</details>';
    });
    const seg = Object.keys(THEMES).map((t) =>
      '<button type="button" class="' + (state.theme === t ? 'is-active' : '') + '" data-action="set-theme" data-theme="' + t + '" aria-pressed="' + (state.theme === t) + '">' + THEMES[t] + '</button>').join('');

    el.settings.innerHTML = '<header class="set-top"><h2>Ajustes</h2><button type="button" class="btn-text" data-action="close-settings">Listo</button></header>'
      + '<div class="set-body">'
      + '<section class="set-group">'
      + '<h3 class="set-title">Turno de esta semana</h3>'
      + '<p class="set-text">Del ' + monday.getDate() + ' al ' + addDays(monday, 6).getDate() + ' de ' + MONTHS[addDays(monday, 6).getMonth()] + '. Las demás semanas se calculan rotando los ocho turnos.</p>'
      + '<div class="turnos" role="group" aria-label="Turno de esta semana">' + turnos + '</div>'
      + '</section>'
      + '<section class="set-group">'
      + '<h3 class="set-title">Cuadrante</h3>'
      + '<p class="set-text">Toca un día para cambiarlo: «Descanso» para un día libre, o «Lugar hora - servicio». Se guarda solo.</p>'
      + '<div class="editor">' + editor + '</div>'
      + '<button type="button" class="btn-quiet" data-action="reset-cuadrante">Restablecer el cuadrante original</button>'
      + '</section>'
      + '<section class="set-group">'
      + '<h3 class="set-title">Aspecto</h3>'
      + '<div class="seg" role="group" aria-label="Aspecto">' + seg + '</div>'
      + '</section>'
      + '<section class="set-group">'
      + '<h3 class="set-title">Acceso</h3>'
      + '<p class="set-text">Este dispositivo tiene acceso al horario. Para dar acceso a otro, abre la app en él y escribe la clave. Para dejar fuera a un dispositivo, cambia la clave con <code>node tools/cifrar.js --nueva</code> y escríbela solo donde quieras.</p>'
      + '<button type="button" class="btn-quiet" data-action="forget-device">Quitar el acceso en este dispositivo</button>'
      + '</section>'
      + '<section class="set-group">'
      + '<h3 class="set-title">En el móvil</h3>'
      + '<div class="install">'
      + '<div><h3>Android</h3><ol><li>Abre esta dirección en Chrome.</li><li>Menú <b>⋮</b>, <b>Instalar aplicación</b>.</li></ol></div>'
      + '<div><h3>iPhone</h3><ol><li>Abre esta dirección en Safari.</li><li><b>Compartir</b>, <b>Añadir a pantalla de inicio</b>.</li><li>Para el Centro de control: un atajo que abra Horario, añadido como control <b>Atajo</b>.</li></ol></div>'
      + '</div>'
      + '</section>'
      + '</div>';
  }
  function openSettings() {
    renderSettings();
    el.settings.hidden = false;
    void el.settings.offsetHeight;
    el.settings.classList.add('is-open');
  }
  function closeSettings() {
    if (el.settings.hidden) return;
    el.settings.classList.remove('is-open');
    setTimeout(() => { el.settings.hidden = true; }, 300);
  }

  /* Tema -------------------------------------------------------------- */
  function applyTheme() {
    const pref = state ? state.theme : ((readSaved() || {}).theme || 'system');
    const t = pref === 'system' ? (mqDark.matches ? 'dark' : 'light') : pref;
    document.documentElement.dataset.theme = t;
    if (el.themeMeta) el.themeMeta.content = t === 'dark' ? '#000000' : '#ffffff';
    if (window.parent !== window) {
      try { window.parent.postMessage({ type: 'horario:theme', theme: t }, '*'); } catch (e) { /* sin padre */ }
    }
  }
  mqDark.addEventListener('change', applyTheme);

  /* Eventos ----------------------------------------------------------- */
  el.btnToday.addEventListener('click', () => scrollToToday(true));
  el.btnSettings.addEventListener('click', openSettings);

  document.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell[data-date]');
    if (cell) { openDay(fromIso(cell.dataset.date)); return; }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === 'settings') openSettings();
    else if (a === 'close-settings') closeSettings();
    else if (a === 'set-turno') {
      state.anchorMonday = iso(mondayOf(today));
      state.anchorTurno = Number(btn.dataset.turno);
      state.configured = true;
      saveState();
      renderAll();
      renderSettings();
    } else if (a === 'set-theme') {
      state.theme = btn.dataset.theme;
      saveState();
      applyTheme();
      renderSettings();
    } else if (a === 'reset-cuadrante') {
      if (window.confirm('¿Volver al cuadrante original? Se perderán las celdas que hayas cambiado.')) {
        state.cuadrante = defaults.cuadrante.map((r) => r.slice());
        state.edited = false;
        saveState();
        renderAll();
        renderSettings();
      }
    } else if (a === 'forget-device') {
      if (window.confirm('¿Quitar el acceso en este dispositivo? Para volver a ver el horario habrá que escribir la clave.')) {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* nada */ }
        location.reload();
      }
    }
  });

  el.settings.addEventListener('input', (e) => {
    const input = e.target.closest('.ed-cell');
    if (input) input.className = 'ed-cell tone-' + toneOf(parseCell(input.value));
  });
  el.settings.addEventListener('change', (e) => {
    const input = e.target.closest('.ed-cell');
    if (!input) return;
    const p = input.dataset.cell.split(':').map(Number);
    state.cuadrante[p[0]][p[1]] = input.value.trim() || 'DESCANSO';
    input.value = state.cuadrante[p[0]][p[1]];
    state.edited = true;
    saveState();
    renderAll();
    const rest = state.cuadrante[p[0]].filter((c) => parseCell(c).type === 'descanso').length;
    const info = input.closest('.ed-turno').querySelector('.ed-turno-info');
    if (info) info.textContent = plural(7 - rest, 'servicio', 'servicios') + ', ' + plural(rest, 'descanso', 'descansos');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.sheet.hidden) closeSheet();
    else closeSettings();
  });

  // Al pasar la medianoche, o al volver a la app otro día, cambia «hoy».
  function refreshToday() {
    const now = startOfDay(new Date());
    if (!state || sameDay(now, today)) return;
    today = now;
    renderAll();
  }
  setInterval(refreshToday, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshToday(); });

  /* Acceso: el cuadrante viaja cifrado y se abre con la clave -------- */
  function b64(str) { return Uint8Array.from(atob(str), (c) => c.charCodeAt(0)); }
  function toB64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
  // Igual que tools/cifrar.js: minúsculas y sin espacios ni guiones de ningún tipo.
  function normalizeCode(code) { return String(code).normalize('NFKC').toLowerCase().replace(/[\s\u002d\u2010-\u2015\u2212_]/g, ''); }

  // Intentos fallidos en este dispositivo: esperas crecientes y bloqueo de 24 h.
  function readLockout() {
    try { return JSON.parse(localStorage.getItem(LOCKOUT_KEY) || 'null') || { fails: 0, until: 0 }; } catch (e) { return { fails: 0, until: 0 }; }
  }
  function writeLockout(lo) {
    try { localStorage.setItem(LOCKOUT_KEY, JSON.stringify(lo)); } catch (e) { /* sin almacenamiento */ }
  }
  function waitFor(fails) {
    if (fails <= FREE_ATTEMPTS) return 0;
    if (fails >= BLOCK_AT) return BLOCK_MS;
    return Math.min(3600 * 1000, 30 * 1000 * Math.pow(2, fails - FREE_ATTEMPTS - 1)); // 30 s, 1, 2, 4… min, tope 1 h
  }
  function fmtWait(ms) {
    const s = Math.ceil(ms / 1000);
    if (s < 60) return s + ' s';
    const m = Math.ceil(s / 60);
    if (m < 60) return m + ' min';
    const h = Math.round(m / 60);
    return h + ' h';
  }
  let lockTimer = null;
  function refreshLockout() {
    clearTimeout(lockTimer);
    const lo = readLockout();
    const left = lo.until - Date.now();
    if (left > 0) {
      el.lockCode.disabled = true;
      el.lockBtn.disabled = true;
      el.lockError.textContent = lo.fails >= BLOCK_AT
        ? 'Dispositivo bloqueado ' + fmtWait(left) + ' por demasiados intentos.'
        : 'Demasiados intentos. Espera ' + fmtWait(left) + '.';
      el.lockError.hidden = false;
      lockTimer = setTimeout(refreshLockout, left > 60000 ? 30000 : 1000);
      return true;
    }
    el.lockCode.disabled = false;
    el.lockBtn.disabled = false;
    return false;
  }
  async function deriveKey(code) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalizeCode(code)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: SEALED.kdf.hash, salt: b64(SEALED.kdf.salt), iterations: SEALED.kdf.iterations },
      base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']
    );
  }
  // Descarga js/data.js saltándose cualquier cache: si se acaba de publicar una clave o un
  // cuadrante nuevo, el navegador puede tener todavía la versión anterior.
  async function fetchSealed() {
    const res = await fetch('js/data.js?fresh=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch');
    const txt = await res.text();
    const get = (re) => { const m = txt.match(re); return m ? m[1] : null; };
    const salt = get(/salt:\s*"([^"]+)"/);
    const iv = get(/iv:\s*"([^"]+)"/);
    const data = get(/data:\s*"([^"]+)"/);
    if (!salt || !iv || !data) throw new Error('formato');
    return {
      version: Number(get(/version:\s*(\d+)/) || 0),
      kdf: { name: 'PBKDF2', hash: get(/hash:\s*"([^"]+)"/) || 'SHA-256', iterations: Number(get(/iterations:\s*(\d+)/) || 0), salt },
      cipher: { name: 'AES-GCM', iv },
      data,
    };
  }
  async function refreshSealed() {
    try {
      const fresh = await fetchSealed();
      if (fresh.version === SEALED.version && fresh.kdf.salt === SEALED.kdf.salt && fresh.data === SEALED.data) return false;
      SEALED = fresh;
      return true;
    } catch (e) { return false; }
  }
  async function unseal(key) {
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(SEALED.cipher.iv) }, key, b64(SEALED.data));
    const payload = JSON.parse(new TextDecoder().decode(buf));
    if (!Array.isArray(payload.cuadrante) || payload.cuadrante.length !== N_TURNOS) throw new Error('cuadrante');
    return payload;
  }
  function lockMeta() {
    const v = document.querySelector('script[src*="app.js"]');
    const build = v && /v=(\d+)/.test(v.getAttribute('src')) ? RegExp.$1 : '?';
    el.lockMeta.textContent = 'Versión ' + build + ', cuadrante ' + (SEALED && SEALED.version ? SEALED.version : '?')
      + (SEALED && SEALED.kdf ? ', ' + SEALED.kdf.iterations / 1000 + 'k' : ', sin cifrar')
      + (window.isSecureContext ? '' : ', sin https');
  }
  function showLock(message) {
    document.body.classList.add('is-locked');
    el.lock.hidden = false;
    lockMeta();
    if (message) { el.lockError.textContent = message; el.lockError.hidden = false; }
    if (!refreshLockout()) setTimeout(() => el.lockCode.focus(), 50);
  }
  function hideLock() {
    el.lock.hidden = true;
    document.body.classList.remove('is-locked');
  }
  el.lockShow.addEventListener('click', () => {
    const show = el.lockCode.type === 'password';
    el.lockCode.type = show ? 'text' : 'password';
    el.lockShow.textContent = show ? 'Ocultar' : 'Mostrar';
    el.lockCode.focus();
  });
  el.lockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (refreshLockout()) return;
    el.lockError.hidden = true;
    el.lockBtn.disabled = true;
    el.lockBtn.textContent = 'Comprobando…';
    try {
      let key = await deriveKey(el.lockCode.value);
      let payload;
      try {
        payload = await unseal(key);
      } catch (first) {
        // Puede que el navegador tenga un cuadrante antiguo en cache: se prueba con el actual.
        if (!(await refreshSealed())) throw first;
        key = await deriveKey(el.lockCode.value);
        payload = await unseal(key);
      }
      const raw = await crypto.subtle.exportKey('raw', key);
      const saved = readSaved() || {};
      saved.key = toB64(raw);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch (err) { /* sin almacenamiento */ }
      try { localStorage.removeItem(LOCKOUT_KEY); } catch (err) { /* nada */ }
      el.lockCode.value = '';
      el.lockBtn.disabled = false;
      el.lockBtn.textContent = 'Entrar';
      start(payload);
    } catch (err) {
      el.lockBtn.disabled = false;
      el.lockBtn.textContent = 'Entrar';
      // OperationError = el cifrado no abre con esa clave. Cualquier otro error es del navegador, no de la clave.
      const wrongKey = !err || err.name === 'OperationError' || err.message === 'cuadrante';
      if (!wrongKey) {
        el.lockError.textContent = 'El navegador no ha podido comprobar la clave: ' + (err.name || 'Error') + ' - ' + (err.message || err);
        el.lockError.hidden = false;
        return;
      }
      const lo = readLockout();
      lo.fails += 1;
      lo.until = Date.now() + waitFor(lo.fails);
      writeLockout(lo);
      if (!refreshLockout()) {
        const left = Math.max(0, FREE_ATTEMPTS - lo.fails);
        el.lockError.textContent = 'Clave incorrecta.' + (left > 0 ? ' Te quedan ' + left + (left === 1 ? ' intento' : ' intentos') + ' antes de tener que esperar.' : '');
        el.lockError.hidden = false;
        el.lockCode.select();
      }
    }
  });

  function start(payload) {
    defaults = payload;
    state = loadState();
    saveState(); // consolida migraciones y la versión del cuadrante
    // Que el navegador no borre la llave guardada por falta de espacio.
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    hideLock();
    applyTheme();
    renderAll();
    edges.observe(el.sentinelTop);
    edges.observe(el.sentinelBottom);
  }

  async function boot() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    applyTheme();
    // data.js antiguo en cache (sin cifrar o de otra versión): se descarga el actual.
    if (!SEALED || !SEALED.data || !SEALED.kdf) {
      await refreshSealed();
      if (!SEALED || !SEALED.data) {
        showLock('No se ha podido cargar el horario. Comprueba la conexión y vuelve a abrir la app.');
        el.lockBtn.disabled = true;
        return;
      }
    }
    if (!window.crypto || !crypto.subtle) {
      showLock('Este navegador no puede abrir el horario aquí. Ábrelo desde la dirección https de la app.');
      el.lockBtn.disabled = true;
      return;
    }
    const saved = readSaved();
    if (saved && saved.key) {
      const key = await crypto.subtle.importKey('raw', b64(saved.key), { name: 'AES-GCM' }, true, ['decrypt']);
      try {
        start(await unseal(key));
        return;
      } catch (e) {
        // Antes de dar la llave por caducada, se comprueba con el cuadrante recién descargado.
        if (await refreshSealed()) {
          try { start(await unseal(key)); return; } catch (e2) { /* la clave ha cambiado de verdad */ }
        }
        showLock('La clave de acceso ha cambiado. Escribe la nueva.');
        return;
      }
    }
    showLock();
  }
  boot();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin cache offline */ });
  }
})();
