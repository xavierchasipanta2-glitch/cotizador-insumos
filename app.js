(() => {
  'use strict';

  const APP_VERSION = '1.0.0';
  const KEY = 'cotizador-insumos-v1';

  /* =====================================================
     Estado y almacenamiento (todo queda en el teléfono)
     ===================================================== */
  let state = load();
  const ui = { view: 'sesiones', sessionId: null, editingStoreId: null, addToSession: false };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.stores) && Array.isArray(s.sessions)) {
          s.sessions.forEach((x) => {
            x.items = x.items || [];
            x.storeIds = x.storeIds || [];
            x.prices = x.prices || {};
          });
          return s;
        }
      }
    } catch (e) { /* datos dañados: se empieza vacío */ }
    return { stores: [], sessions: [], ultima: null };
  }

  let savedTimer;
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      const el = document.getElementById('saved');
      el.classList.add('show');
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => el.classList.remove('show'), 1200);
    } catch (e) {
      toast('⚠️ No se pudo guardar (almacenamiento lleno o bloqueado)');
    }
  }

  /* =====================================================
     Utilidades
     ===================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const money = (n) => '$' + (Math.round(n * 100) / 100).toFixed(2);
  const tel = (s) => String(s || '').replace(/[^\d+]/g, '');

  function hoy() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtFecha(f) {
    if (!f || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return 'sin fecha';
    const [y, m, d] = f.split('-');
    return d + '/' + m + '/' + y;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  const getSession = () => state.sessions.find((s) => s.id === ui.sessionId);
  const getStore = (id) => state.stores.find((s) => s.id === id);

  const qtyOf = (it) => {
    const q = parseFloat(it.cantidad);
    return isFinite(q) && q > 0 ? q : 1;
  };

  function priceOf(sess, itemId, storeId) {
    const p = sess.prices[itemId] && sess.prices[itemId][storeId];
    const v = p ? parseFloat(p.precio) : NaN;
    return isFinite(v) && v > 0 ? v : null;
  }

  /* =====================================================
     Cálculo: más barato por material, totales, mejor combinación
     ===================================================== */
  function calc(sess) {
    const stores = sess.storeIds.map(getStore).filter(Boolean);
    const rows = sess.items.map((it) => {
      const prices = stores.map((st) => priceOf(sess, it.id, st.id));
      const filled = prices.filter((p) => p !== null);
      return {
        item: it,
        prices,
        filled: filled.length,
        min: filled.length ? Math.min(...filled) : null,
        max: filled.length ? Math.max(...filled) : null
      };
    });

    const totals = stores.map((st, i) => {
      let total = 0;
      let n = 0;
      rows.forEach((r) => {
        const p = r.prices[i];
        if (p !== null) { total += p * qtyOf(r.item); n++; }
      });
      return { store: st, total, n, complete: sess.items.length > 0 && n === sess.items.length };
    });

    let mixed = 0;
    let mixedN = 0;
    const byStore = new Map();
    rows.forEach((r) => {
      if (r.min === null) return;
      const st = stores[r.prices.findIndex((p) => p === r.min)];
      mixed += r.min * qtyOf(r.item);
      mixedN++;
      if (!byStore.has(st.id)) byStore.set(st.id, []);
      byStore.get(st.id).push({ item: r.item, price: r.min });
    });

    const completes = totals.filter((t) => t.complete);
    const bestSingle = completes.length ? completes.reduce((a, b) => (b.total < a.total ? b : a)) : null;
    return { stores, rows, totals, mixed, mixedN, byStore, bestSingle };
  }

  /* =====================================================
     Vistas
     ===================================================== */
  const app = $('#app');

  function render() {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === ui.view));
    app.innerHTML = ui.view === 'sesiones' ? viewSesiones() : ui.view === 'sesion' ? viewSesion() : viewLocales();
    if (ui.view === 'sesion') refreshComputed();
  }

  function go(view) {
    ui.view = view;
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- Sesiones ---------- */
  function viewSesiones() {
    const list = [...state.sessions].sort((a, b) =>
      (b.fecha || '').localeCompare(a.fecha || '') || (b.creada || 0) - (a.creada || 0));

    const cards = list.map((s) => {
      const c = calc(s);
      return `
        <div class="card session-card">
          <div class="s-title">${esc(s.titulo || 'Sin título')}</div>
          <div class="s-meta">📅 ${fmtFecha(s.fecha)} · ${s.items.length} materiales · ${s.storeIds.length} locales</div>
          ${c.mixedN ? `<div class="s-meta">💰 Mejor combinación: <b>${money(c.mixed)}</b></div>` : ''}
          <div class="row gap wrap">
            <button class="btn primary" data-act="open-session" data-id="${s.id}">Abrir</button>
            <button class="btn" data-act="dup-session" data-id="${s.id}">Repetir lista</button>
            <button class="btn danger" data-act="del-session" data-id="${s.id}">Eliminar</button>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="card">
        <button class="btn primary big" data-act="new-session">➕ Nueva sesión de compra</button>
      </div>
      ${cards || '<p class="empty">Aún no tienes sesiones. Crea la primera ☝️</p>'}
      <div class="card gris-card">
        <h2>💾 Respaldo</h2>
        <p class="muted" style="margin-top:0">Tus datos viven solo en este teléfono. Descarga un respaldo de vez en cuando o para pasarlos a otro equipo.</p>
        <div class="row gap wrap">
          <button class="btn" data-act="export-backup">⬇️ Descargar respaldo</button>
          <button class="btn" data-act="import-backup">⬆️ Cargar respaldo</button>
          <input type="file" id="import-file" accept=".json,application/json" hidden>
        </div>
      </div>
      <p class="foot">Cotizador de insumos v${APP_VERSION}</p>`;
  }

  /* ---------- Cotizar (sesión abierta) ---------- */
  function viewSesion() {
    const s = getSession();
    if (!s) {
      return `<div class="card">
        <p class="empty">Abre o crea una sesión para empezar a cotizar.</p>
        <button class="btn primary big" data-act="go-sesiones">Ir a Sesiones</button>
      </div>`;
    }
    const disponibles = state.stores.filter((st) => !s.storeIds.includes(st.id));

    return `
      <div class="card azul-card">
        <label class="lbl" for="s-titulo">Título del listado</label>
        <input class="in azul" id="s-titulo" value="${esc(s.titulo)}" placeholder="Ej: Insumos de resina — noviembre">
        <label class="lbl" for="s-fecha">Fecha</label>
        <input class="in azul" type="date" id="s-fecha" value="${esc(s.fecha)}">
      </div>

      <div class="legend">
        <span class="chip azul">Material</span>
        <span class="chip amar">Precio a llenar</span>
        <span class="chip verde">Más barato</span>
        <span class="chip rojo">Más caro</span>
        <span class="chip mor">Totales</span>
        <span class="chip gris">Local</span>
      </div>

      <div class="card">
        <h2>Materiales a comprar</h2>
        <form id="add-item" class="row gap wrap" autocomplete="off">
          <input class="in azul grow" id="n-nombre" placeholder="Material (ej: Resina A2)" required>
          <input class="in azul w70" id="n-cant" type="number" inputmode="decimal" min="0" step="any" placeholder="Cant." value="1">
          <input class="in azul w90" id="n-unidad" placeholder="Unidad">
          <button class="btn primary" type="submit">➕ Agregar</button>
        </form>
      </div>

      <div class="card">
        <h2>Locales de esta sesión</h2>
        <div class="row gap wrap">
          <select class="in gris grow" id="add-store-select">
            <option value="">${disponibles.length ? 'Elegir local guardado…' : 'No hay más locales guardados'}</option>
            ${disponibles.map((st) => `<option value="${st.id}">${esc(st.nombre)}</option>`).join('')}
          </select>
          <button class="btn" data-act="add-store-to-session">Agregar</button>
          <button class="btn" data-act="new-store-in-session">🆕 Nuevo local</button>
        </div>
      </div>

      ${gridHTML(s)}
      <div id="summary-wrap"></div>
      <div id="buy-wrap"></div>
      <div id="stores-wrap">${s.storeIds.map(getStore).filter(Boolean).length ? `<h2 style="font-size:1.02rem;margin:4px 2px 8px">Datos de los locales</h2>` : ''}
        ${s.storeIds.map(getStore).filter(Boolean).map((st) => storeCard(st, false)).join('')}
      </div>`;
  }

  function gridHTML(s) {
    const stores = s.storeIds.map(getStore).filter(Boolean);
    if (!s.items.length || !stores.length) {
      const falta = !s.items.length && !stores.length ? 'materiales y locales'
        : !s.items.length ? 'materiales' : 'locales';
      return `<div class="card"><p class="empty">Agrega ${falta} para ver la tabla de precios.</p></div>`;
    }

    const head = stores.map((st) => `
      <th class="th-store">
        <div class="st-name">${esc(st.nombre)}</div>
        <button class="x" data-act="remove-store" data-id="${st.id}" title="Quitar de esta sesión">✕</button>
      </th>`).join('');

    const body = s.items.map((it) => `
      <tr data-item="${it.id}" class="${it.comprado ? 'done' : ''}">
        <td class="c-item">
          <div class="top">
            <input type="checkbox" data-act="toggle-bought" data-id="${it.id}" ${it.comprado ? 'checked' : ''} title="Marcar como comprado">
            <input class="nm" data-field="name" data-id="${it.id}" value="${esc(it.nombre)}">
            <button class="x" data-act="del-item" data-id="${it.id}" title="Eliminar material">🗑</button>
          </div>
        </td>
        <td class="c-qty">
          <input class="in azul qty" type="number" inputmode="decimal" min="0" step="any" data-field="qty" data-id="${it.id}" value="${esc(it.cantidad)}">
          <span class="un">${esc(it.unidad)}</span>
        </td>
        ${stores.map((st) => {
          const cell = (s.prices[it.id] && s.prices[it.id][st.id]) || {};
          return `<td class="c-price" data-store="${st.id}">
            <div class="pc">
              <span class="cur">$</span>
              <input class="in precio" type="number" inputmode="decimal" min="0" step="any" placeholder="0.00"
                data-field="price" data-item="${it.id}" data-store="${st.id}" value="${esc(cell.precio == null ? '' : cell.precio)}">
              <button class="note-btn ${cell.nota ? 'has' : ''}" data-act="note" data-item="${it.id}" data-store="${st.id}"
                title="${esc(cell.nota || 'Agregar nota')}">📝</button>
            </div>
          </td>`;
        }).join('')}
      </tr>`).join('');

    return `
      <div class="card grid-card">
        <h2>Precios por local</h2>
        <div class="tbl-scroll">
          <table class="grid">
            <thead><tr><th class="th-corner" colspan="2">Material · Cantidad</th>${head}</tr></thead>
            <tbody>${body}</tbody>
            <tfoot>
              <tr class="tot"><td class="lbl-cell" colspan="2">Total del local</td>${stores.map((st) => `<td class="c-total" data-total="${st.id}">—</td>`).join('')}</tr>
              <tr class="cnt"><td class="lbl-cell" colspan="2">Materiales cotizados</td>${stores.map((st) => `<td data-count="${st.id}">0/0</td>`).join('')}</tr>
            </tfoot>
          </table>
        </div>
      </div>`;
  }

  /* Actualiza colores, totales y resúmenes sin tocar lo que se está escribiendo */
  function refreshComputed() {
    const s = getSession();
    if (!s) return;
    const c = calc(s);

    c.rows.forEach((r) => {
      const tr = document.querySelector(`tr[data-item="${r.item.id}"]`);
      if (!tr) return;
      c.stores.forEach((st, i) => {
        const td = tr.querySelector(`td.c-price[data-store="${st.id}"]`);
        if (!td) return;
        const p = r.prices[i];
        td.classList.toggle('best', r.filled >= 2 && p !== null && p === r.min);
        td.classList.toggle('worst', r.filled >= 2 && p !== null && p === r.max && r.max !== r.min);
        td.classList.toggle('only', r.filled === 1 && p !== null);
      });
    });

    c.totals.forEach((t) => {
      const td = document.querySelector(`td[data-total="${t.store.id}"]`);
      const cnt = document.querySelector(`td[data-count="${t.store.id}"]`);
      if (td) {
        td.textContent = t.n ? money(t.total) : '—';
        td.classList.toggle('best', !!c.bestSingle && c.bestSingle.store.id === t.store.id && c.totals.filter((x) => x.complete).length > 1);
      }
      if (cnt) cnt.textContent = t.n + '/' + s.items.length;
    });

    const sw = $('#summary-wrap');
    const bw = $('#buy-wrap');
    if (sw) sw.innerHTML = summaryHTML(c, s);
    if (bw) bw.innerHTML = buyHTML(c);
  }

  function summaryHTML(c, s) {
    if (!c.stores.length || !s.items.length) return '';
    const sinPrecio = c.rows.filter((r) => r.min === null).length;
    if (!c.mixedN) {
      return `<div class="card mor-card"><h2>🏆 Resumen</h2><p class="muted" style="margin:0">Llena precios para ver dónde conviene comprar cada material.</p></div>`;
    }
    let html = `<div class="card mor-card"><h2>🏆 Resumen</h2>
      <div class="sum-line big"><span>Comprando cada material donde sale más barato</span><b>${money(c.mixed)}</b></div>`;

    if (c.bestSingle) {
      html += `<div class="sum-line"><span>Todo en un solo local (el más barato): <b>${esc(c.bestSingle.store.nombre)}</b></span><b>${money(c.bestSingle.total)}</b></div>`;
      const ahorro = c.bestSingle.total - c.mixed;
      html += ahorro > 0.004
        ? `<div class="sum-line ok"><span>💚 Ahorras repartiendo la compra</span><b>${money(ahorro)}</b></div>`
        : `<div class="sum-line ok"><span>💚 Comprar todo en ${esc(c.bestSingle.store.nombre)} ya es la mejor opción</span></div>`;
    } else {
      html += `<p class="muted" style="margin:8px 0 0">Ningún local tiene todos los materiales cotizados todavía.</p>`;
    }
    if (sinPrecio) html += `<p class="warn">⚠️ ${sinPrecio} material(es) aún sin ningún precio.</p>`;

    html += `<div class="row gap wrap" style="margin-top:12px">
        <button class="btn small" data-act="share-wa">📲 Compartir por WhatsApp</button>
        <button class="btn small" data-act="export-csv">📥 Descargar para Excel</button>
      </div></div>`;
    return html;
  }

  function buyHTML(c) {
    if (!c.byStore.size) return '';
    let html = `<div class="card"><h2>🛒 Qué comprar dónde</h2>`;
    c.stores.forEach((st) => {
      const list = c.byStore.get(st.id);
      if (!list) return;
      const sub = list.reduce((a, x) => a + x.price * qtyOf(x.item), 0);
      html += `
        <div class="buy-store">
          <div class="buy-head"><b>🏪 ${esc(st.nombre)}</b>
            ${st.telefono ? `<a href="tel:${esc(tel(st.telefono))}">📞 ${esc(st.telefono)}</a>` : ''}
          </div>
          <ul>
            ${list.map((x) => `
              <li class="${x.item.comprado ? 'done' : ''}">
                <label><input type="checkbox" data-act="toggle-bought" data-id="${x.item.id}" ${x.item.comprado ? 'checked' : ''}>
                  ${esc(x.item.nombre)} × ${esc(x.item.cantidad || 1)} ${esc(x.item.unidad)}</label>
                <span>${money(x.price)} → <b>${money(x.price * qtyOf(x.item))}</b></span>
              </li>`).join('')}
          </ul>
          <div class="buy-sub">Subtotal: <b>${money(sub)}</b></div>
        </div>`;
    });
    return html + '</div>';
  }

  /* ---------- Locales ---------- */
  function storeCard(st, conAcciones) {
    return `
      <div class="card gris-card store-card">
        <div class="st-title">🏪 ${esc(st.nombre)}</div>
        ${st.telefono ? `<div>📞 <a href="tel:${esc(tel(st.telefono))}">${esc(st.telefono)}</a></div>` : ''}
        ${st.direccion ? `<div>📍 <a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(st.direccion)}">${esc(st.direccion)}</a></div>` : ''}
        ${st.horario ? `<div>🕒 ${esc(st.horario)}</div>` : ''}
        ${st.notas ? `<div class="muted">📝 ${esc(st.notas)}</div>` : ''}
        <div class="row gap wrap">
          <button class="btn small" data-act="edit-store" data-id="${st.id}">✏️ Editar</button>
          ${conAcciones ? `<button class="btn small danger" data-act="del-store" data-id="${st.id}">Eliminar</button>` : ''}
        </div>
      </div>`;
  }

  function viewLocales() {
    return `
      <div class="card">
        <button class="btn primary big" data-act="new-store">➕ Nuevo local</button>
      </div>
      ${state.stores.length
        ? state.stores.map((st) => storeCard(st, true)).join('')
        : '<p class="empty">Aún no tienes locales guardados. Agrégalos una vez y se autollenan en cada sesión.</p>'}`;
  }

  /* =====================================================
     Diálogo de local
     ===================================================== */
  const dlg = $('#storeDialog');
  const FIELDS = ['nombre', 'telefono', 'direccion', 'horario', 'notas'];

  function openStoreDialog(id, addToSession) {
    ui.editingStoreId = id || null;
    ui.addToSession = !!addToSession;
    const st = id ? getStore(id) || {} : {};
    $('#sd-title').textContent = id ? 'Editar local' : 'Nuevo local';
    FIELDS.forEach((k) => { $('#sd-' + k).value = st[k] || ''; });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    setTimeout(() => $('#sd-nombre').focus(), 50);
  }
  function closeStoreDialog() {
    if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
  }

  $('#sd-cancel').addEventListener('click', closeStoreDialog);
  $('#storeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {};
    FIELDS.forEach((k) => { data[k] = $('#sd-' + k).value.trim(); });
    if (!data.nombre) return;

    if (ui.editingStoreId) {
      Object.assign(getStore(ui.editingStoreId), data);
    } else {
      const st = Object.assign({ id: uid() }, data);
      state.stores.push(st);
      const s = getSession();
      if (ui.addToSession && s) s.storeIds.push(st.id);
    }
    save();
    closeStoreDialog();
    render();
  });

  /* =====================================================
     Acciones de sesión
     ===================================================== */
  function newSession() {
    const s = {
      id: uid(),
      titulo: 'Lista de materiales',
      fecha: hoy(),
      items: [],
      storeIds: state.stores.map((x) => x.id), // los locales guardados se autollenan
      prices: {},
      creada: Date.now()
    };
    state.sessions.push(s);
    state.ultima = s.id;
    ui.sessionId = s.id;
    save();
    go('sesion');
    setTimeout(() => { const el = $('#s-titulo'); if (el) { el.focus(); el.select(); } }, 60);
  }

  function dupSession(id) {
    const o = state.sessions.find((x) => x.id === id);
    if (!o) return;
    const s = {
      id: uid(),
      titulo: (o.titulo || 'Lista') + ' (repetida)',
      fecha: hoy(),
      items: o.items.map((it) => ({ id: uid(), nombre: it.nombre, cantidad: it.cantidad, unidad: it.unidad, comprado: false })),
      storeIds: [...o.storeIds],
      prices: {},
      creada: Date.now()
    };
    state.sessions.push(s);
    state.ultima = s.id;
    ui.sessionId = s.id;
    save();
    toast('Lista repetida: mismos materiales y locales, precios en blanco');
    go('sesion');
  }

  /* =====================================================
     Compartir y exportar
     ===================================================== */
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function shareWhatsApp() {
    const s = getSession();
    if (!s) return;
    const c = calc(s);
    let t = `🦷 *${s.titulo}* — ${fmtFecha(s.fecha)}\nQué comprar y dónde (lo más barato por material):\n`;
    c.stores.forEach((st) => {
      const list = c.byStore.get(st.id);
      if (!list) return;
      t += `\n🏪 *${st.nombre}*${st.telefono ? ' · ' + st.telefono : ''}\n`;
      list.forEach((x) => {
        t += `• ${x.item.nombre} ×${x.item.cantidad || 1} ${x.item.unidad || ''} — ${money(x.price)} c/u = ${money(x.price * qtyOf(x.item))}\n`;
      });
      t += `Subtotal: ${money(list.reduce((a, x) => a + x.price * qtyOf(x.item), 0))}\n`;
    });
    t += `\n💰 *Total: ${money(c.mixed)}*`;
    const sin = c.rows.filter((r) => r.min === null).map((r) => r.item.nombre);
    if (sin.length) t += `\n⚠️ Sin precio: ${sin.join(', ')}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank');
  }

  function exportCSV() {
    const s = getSession();
    if (!s) return;
    const c = calc(s);
    const num = (n) => (n == null ? '' : n.toFixed(2).replace('.', ','));
    const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [];
    lines.push([s.titulo, fmtFecha(s.fecha)].map(cell).join(';'));
    lines.push(['Material', 'Cantidad', 'Unidad', ...c.stores.map((x) => x.nombre), 'Más barato en'].map(cell).join(';'));
    c.rows.forEach((r) => {
      const idx = r.min == null ? -1 : r.prices.findIndex((p) => p === r.min);
      lines.push([
        cell(r.item.nombre), cell(r.item.cantidad), cell(r.item.unidad),
        ...r.prices.map((p) => cell(num(p))),
        cell(idx >= 0 ? c.stores[idx].nombre : '')
      ].join(';'));
    });
    lines.push([cell('Total del local'), '', '', ...c.totals.map((t) => cell(t.n ? num(t.total) : '')), ''].join(';'));
    lines.push([cell('Mejor combinación'), '', '', cell(num(c.mixed))].join(';'));
    const nombre = (s.titulo || 'cotizacion').replace(/[^\w\- áéíóúñÁÉÍÓÚÑ]/g, '').trim().replace(/\s+/g, '-');
    download(`${nombre}-${s.fecha || hoy()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  function exportBackup() {
    download(`cotizador-respaldo-${hoy()}.json`, JSON.stringify(state, null, 1), 'application/json');
    toast('Respaldo descargado');
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (!d || !Array.isArray(d.stores) || !Array.isArray(d.sessions)) throw new Error('formato');
        if (!confirm('Esto reemplaza todos los datos actuales por los del respaldo. ¿Continuar?')) return;
        state = d;
        state.sessions.forEach((x) => { x.items = x.items || []; x.storeIds = x.storeIds || []; x.prices = x.prices || {}; });
        ui.sessionId = null;
        save();
        render();
        toast('Respaldo cargado');
      } catch (e) {
        toast('⚠️ Ese archivo no es un respaldo válido');
      }
    };
    reader.readAsText(file);
  }

  /* =====================================================
     Eventos (delegados)
     ===================================================== */
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (b) go(b.dataset.view);
  });

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.type === 'checkbox') return;
    const s = getSession();
    const id = el.dataset.id;

    switch (el.dataset.act) {
      case 'new-session': newSession(); break;
      case 'go-sesiones': go('sesiones'); break;
      case 'open-session':
        ui.sessionId = id; state.ultima = id; save(); go('sesion'); break;
      case 'dup-session': dupSession(id); break;
      case 'del-session': {
        const x = state.sessions.find((q) => q.id === id);
        if (x && confirm(`¿Eliminar la sesión "${x.titulo}" con todos sus precios?`)) {
          state.sessions = state.sessions.filter((q) => q.id !== id);
          if (ui.sessionId === id) ui.sessionId = null;
          save(); render();
        }
        break;
      }

      case 'new-store': openStoreDialog(null, false); break;
      case 'new-store-in-session': openStoreDialog(null, true); break;
      case 'edit-store': openStoreDialog(id, false); break;
      case 'del-store': {
        const st = getStore(id);
        if (st && confirm(`¿Eliminar el local "${st.nombre}"? También desaparecerá de las sesiones guardadas, con sus precios.`)) {
          state.stores = state.stores.filter((q) => q.id !== id);
          state.sessions.forEach((q) => {
            q.storeIds = q.storeIds.filter((sid) => sid !== id);
            Object.keys(q.prices).forEach((iid) => { delete q.prices[iid][id]; });
          });
          save(); render();
        }
        break;
      }

      case 'add-store-to-session': {
        const sel = $('#add-store-select');
        if (!s || !sel.value) { toast('Elige un local de la lista'); break; }
        s.storeIds.push(sel.value);
        save(); render();
        break;
      }
      case 'remove-store':
        if (!s) break;
        s.storeIds = s.storeIds.filter((sid) => sid !== id);
        save(); render();
        toast('Local quitado de esta sesión (sus precios se conservan si lo vuelves a agregar)');
        break;

      case 'del-item': {
        if (!s) break;
        const it = s.items.find((q) => q.id === id);
        if (it && confirm(`¿Eliminar "${it.nombre}" de la lista?`)) {
          s.items = s.items.filter((q) => q.id !== id);
          delete s.prices[id];
          save(); render();
        }
        break;
      }

      case 'note': {
        if (!s) break;
        const { item, store } = el.dataset;
        const cur = (s.prices[item] && s.prices[item][store]) || {};
        const nota = prompt('Nota para este precio (ej: promo hasta el viernes, incluye IVA):', cur.nota || '');
        if (nota === null) break;
        s.prices[item] = s.prices[item] || {};
        s.prices[item][store] = Object.assign({ precio: '' }, cur, { nota: nota.trim() });
        save();
        el.classList.toggle('has', !!nota.trim());
        el.title = nota.trim() || 'Agregar nota';
        break;
      }

      case 'share-wa': shareWhatsApp(); break;
      case 'export-csv': exportCSV(); break;
      case 'export-backup': exportBackup(); break;
      case 'import-backup': $('#import-file').click(); break;
    }
  });

  app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'import-file' && el.files[0]) { importBackup(el.files[0]); el.value = ''; return; }
    if (el.dataset.act === 'toggle-bought') {
      const s = getSession();
      const it = s && s.items.find((q) => q.id === el.dataset.id);
      if (!it) return;
      it.comprado = el.checked;
      save();
      const tr = document.querySelector(`tr[data-item="${it.id}"]`);
      if (tr) {
        tr.classList.toggle('done', it.comprado);
        const cb = tr.querySelector('input[data-act="toggle-bought"]');
        if (cb) cb.checked = it.comprado;
      }
      refreshComputed();
    }
  });

  app.addEventListener('input', (e) => {
    const el = e.target;
    const s = getSession();
    if (!s) return;

    if (el.id === 's-titulo') { s.titulo = el.value; save(); return; }
    if (el.id === 's-fecha') { s.fecha = el.value; save(); return; }

    const f = el.dataset.field;
    if (!f) return;

    if (f === 'price') {
      const { item, store } = el.dataset;
      s.prices[item] = s.prices[item] || {};
      const prev = s.prices[item][store] || {};
      s.prices[item][store] = { precio: el.value, nota: prev.nota || '' };
    } else if (f === 'qty') {
      const it = s.items.find((q) => q.id === el.dataset.id);
      if (it) it.cantidad = el.value;
    } else if (f === 'name') {
      const it = s.items.find((q) => q.id === el.dataset.id);
      if (it) it.nombre = el.value;
    }
    save();
    refreshComputed();
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'add-item') return;
    e.preventDefault();
    const s = getSession();
    if (!s) return;
    const nombre = $('#n-nombre').value.trim();
    if (!nombre) return;
    s.items.push({
      id: uid(),
      nombre,
      cantidad: $('#n-cant').value || '1',
      unidad: $('#n-unidad').value.trim(),
      comprado: false
    });
    save();
    render();
    const n = $('#n-nombre');
    if (n) n.focus();
  });

  /* =====================================================
     Arranque
     ===================================================== */
  if (state.ultima && state.sessions.some((x) => x.id === state.ultima)) ui.sessionId = state.ultima;
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => { /* sin soporte: la app sigue funcionando */ });
    });
  }
})();
