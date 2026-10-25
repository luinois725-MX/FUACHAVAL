(function () {
  'use strict';
  var C = window.CATALOG, S = window.Store;
  var app = document.getElementById('app');
  var btnLogin = document.getElementById('btn-login');
  var btnCart = document.getElementById('btn-cart');

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function money(n) { n = Number(n || 0); return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
  function img(label, c1, c2, kind, alt) {
    return '<img loading="lazy" alt="' + esc(alt || label) + '" src="' + esc(window.imgSVG(label, c1, c2, kind)) + '">';
  }
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  var toastT;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  function sizesFor(typeId) { return (C.sizes && C.sizes[typeId]) || ['Única']; }
  function sizeSelect(typeId, value, attrs, required) {
    return '<select ' + (attrs || '') + (required && !value ? ' class="need"' : '') + '><option value="">Talla…</option>' +
      sizesFor(typeId).map(function (s) {
        return '<option value="' + esc(s) + '"' + (s === value ? ' selected' : '') + '>' + esc(s) + '</option>';
      }).join('') + '</select>';
  }
  function colorOf(cut, colorId) {
    var cs = (cut && cut.colors) || [];
    for (var i = 0; i < cs.length; i++) if (cs[i].id === colorId) return cs[i];
    return { id: colorId, name: colorId, hex: '#888' };
  }
  function cutImg(cut, style, c1, kind, alt) {
    var src = null;
    try { if (C.cutImage) src = C.cutImage(cut, style); } catch (e) {}
    if (!src && cut && cut.image) src = cut.image;
    if (src) return '<img loading="lazy" alt="' + esc(alt || cut.name) + '" src="' + esc(src) + '">';
    return img(alt || cut.name, c1, '#111118', kind);
  }
  function hasCutImage(cut) { return !!(cut && cut.image); }
  function cutColors(sid, tid, cid) {
    var l = C.allColors ? C.allColors(sid, tid, cid) : null;
    if (l && l.length) return l;
    var c = C.getCut(sid, tid, cid); return (c && c.colors) || [];
  }
  function crumbs(parts) {
    return '<div class="crumbs">' + parts.map(function (p, i) {
      var s = p.href ? '<a href="' + p.href + '">' + esc(p.t) + '</a>' : '<span>' + esc(p.t) + '</span>';
      return (i ? '<span class="sep">/</span>' : '') + s;
    }).join('') + '</div>';
  }

  /* ---------- fixed chrome ---------- */
  function updateChrome() {
    var n = S.state.cart.length;
    var c = document.getElementById('cart-count');
    c.textContent = n; c.classList.toggle('zero', n === 0);
    var p = S.state.profile;
    document.getElementById('login-label').textContent = p && p.loggedIn ? (p.name || p.email || 'Mi perfil') : 'Iniciar sesión';
  }
  btnLogin.addEventListener('click', function () {
    if (S.state.profile.loggedIn) go('#/perfil'); else openLogin();
  });
  btnCart.addEventListener('click', function () { go('#/carrito'); });

  /* ---------- pages ---------- */
  var cutSel = null;          // selección en pantalla de colores
  var started = false;
  var cartKeys = [];          // cortes visibles en el carrito durante la visita (aunque queden sin colores)
  var codeDraft = '';
  var codeMsg = { t: '', ok: false };
  var pendingCheckout = false;
  var lastHash = null;

  function pageHome() {
    var st = C.styles;
    var cur = S.state.lastStyle && C.style(S.state.lastStyle) ? C.style(S.state.lastStyle) : st[0];
    return '<section class="home" id="home" style="--c1:' + cur.colors[0] + ';--c2:' + cur.colors[1] + ';--c3:' + cur.colors[2] + '">' +
      '<div class="home-main"><nav class="style-list" aria-label="Estilos">' +
      st.map(function (s, i) {
        return '<a class="style-item' + (s.id === cur.id ? ' active' : '') + '" href="#/estilo/' + s.id + '" data-style="' + s.id + '">' +
          '<span class="num">0' + (i + 1) + '</span><span class="nm">' + esc(s.name) + '</span><span class="tg">' + esc(s.tagline) + '</span></a>';
      }).join('') + '</nav>' +
      '<a class="preview" id="preview" href="#/estilo/' + cur.id + '">' +
      img(cur.name, cur.colors[0], cur.colors[1], 'model') +
      '<div class="cap"><b>' + esc(cur.name) + '</b><span>' + esc(cur.tagline) + '</span></div></a></div>' +
      '<div class="strip-title">Modelos</div><div class="strip">' +
      C.gallery.map(function (g) {
        var s = C.style(g.styleId);
        return '<a href="#/estilo/' + g.styleId + '" title="' + esc(s.name) + '">' + img(g.label, s.colors[0], s.colors[1], 'model') + '<small>' + esc(g.label) + '</small></a>';
      }).join('') + '</div></section>';
  }
  function setPreview(styleId) {
    var s = C.style(styleId), home = document.getElementById('home');
    if (!s || !home) return;
    home.style.setProperty('--c1', s.colors[0]); home.style.setProperty('--c2', s.colors[1]); home.style.setProperty('--c3', s.colors[2]);
    document.documentElement.style.setProperty('--c1', s.colors[0]); document.documentElement.style.setProperty('--c2', s.colors[1]);
    var pv = document.getElementById('preview');
    pv.href = '#/estilo/' + s.id;
    pv.querySelector('img').src = window.imgSVG(s.name, s.colors[0], s.colors[1], 'model');
    pv.querySelector('b').textContent = s.name;
    pv.querySelector('span').textContent = s.tagline;
    Array.prototype.forEach.call(document.querySelectorAll('.style-item'), function (a) {
      a.classList.toggle('active', a.getAttribute('data-style') === s.id);
    });
  }

  function pageStyle(sid) {
    var s = C.style(sid); if (!s) return notFound();
    var counts = S.countsByType();
    return crumbs([{ t: 'Inicio', href: '#/' }, { t: s.name }]) +
      '<div class="page-head"><h1>' + esc(s.name) + '</h1><p>' + esc(s.tagline) + ' — elige un tipo de prenda.</p>' +
      '<a class="btn ghost sm" id="btn-change-style" href="#/" style="margin-top:12px">Cambio de estilo</a></div>' +
      '<div class="grid">' + C.types.map(function (t) {
        var n = counts[t.id] || 0;
        return '<a class="card" href="#/estilo/' + s.id + '/' + t.id + '">' +
          (n ? '<span class="badge">' + n + (n === 1 ? ' pieza' : ' piezas') + '</span>' : '') +
          img(t.name, s.colors[0], s.colors[1], t.id) +
          '<div class="body"><b>' + esc(t.name) + '</b><span class="muted">' + (n ? n + ' en el carrito' : 'Sin piezas aún') + '</span></div></a>';
      }).join('') + '</div>' +
      '<div class="hint">' + (S.state.cart.length
        ? (S.hasAllTypes() ? 'Ya tienes piezas de los 6 tipos. <a href="#/carrito"><u>Ir al carrito</u></a>.' : 'Sigue agregando piezas de los demás tipos. <a href="#/carrito"><u>Ver carrito</u></a>.')
        : 'Agrega las piezas que más te gusten de cada tipo.') + '</div>';
  }

  function pageCuts(sid, tid) {
    var s = C.style(sid), t = C.type(tid); if (!s || !t) return notFound();
    var cuts = C.getCuts(sid, tid), n = S.countsByType()[tid] || 0;
    return crumbs([{ t: 'Inicio', href: '#/' }, { t: s.name, href: '#/estilo/' + sid }, { t: t.name }]) +
      '<div class="page-head"><h1>' + esc(t.name) + '</h1><p>' + esc(s.name) + ' · elige un corte' + (n ? ' · ' + n + ' en el carrito' : '') + '</p></div>' +
      '<div class="grid">' + cuts.map(function (c) {
        return '<a class="card" href="#/estilo/' + sid + '/' + tid + '/' + c.id + '">' +
          cutImg(c, s, (cutColors(sid, tid, c.id)[0] || c.colors[0]).hex, tid) +
          '<div class="body"><b>' + esc(c.name) + '</b><span class="muted">' + money(c.price) + ' · ' + cutColors(sid, tid, c.id).length + ' colores</span></div></a>';
      }).join('') + '</div>';
  }

  function pageCut(sid, tid, cid) {
    var s = C.style(sid), t = C.type(tid), c = s && t && C.getCut(sid, tid, cid);
    if (!c) return notFound();
    if (!cutSel || cutSel.key !== cid) cutSel = { key: cid, colors: [cutColors(sid, tid, cid)[0].id], forOther: false, size: '' };
    var ccols = cutColors(sid, tid, cid);
    var first = colorOf({ colors: ccols }, cutSel.colors[0] || ccols[0].id);
    return crumbs([{ t: 'Inicio', href: '#/' }, { t: s.name, href: '#/estilo/' + sid }, { t: t.name, href: '#/estilo/' + sid + '/' + tid }, { t: c.name }]) +
      '<div class="detail"><div class="pic" id="cut-pic">' + img(c.name, first.hex, '#111118', tid) + '</div><div>' +
      '<h1>' + esc(c.name) + '</h1><div class="muted">' + esc(s.name) + ' · ' + esc(t.name) + '</div><div class="price">' + money(c.price) + '</div>' +
      '<div class="sec-title">Colores (puedes elegir varios)</div><div class="colors">' +
      ccols.map(function (col) {
        return '<label class="color-opt"><input type="checkbox" data-act="pick" value="' + esc(col.id) + '"' + (cutSel.colors.indexOf(col.id) >= 0 ? ' checked' : '') + '>' +
          '<span class="chip"><span class="sw" style="background:' + esc(col.hex) + '"></span>' + esc(col.name) + '</span></label>';
      }).join('') + '</div>' +
      '<div class="sec-title">Para quién</div>' +
      '<label class="switch"><input type="checkbox" data-act="other"' + (cutSel.forOther ? ' checked' : '') + '><span>Comprar para alguien más</span></label>' +
      '<div class="field" id="other-size"' + (cutSel.forOther ? '' : ' hidden') + '><label>Talla de esa persona (obligatoria)</label>' +
      sizeSelect(tid, cutSel.size, 'data-act="osize"', true) + '</div>' +
      '<div class="err" id="cut-err" role="alert"></div>' +
      '<div class="actions"><button class="btn primary" data-act="add" type="button">Agregar al carrito</button>' +
      '<button class="btn" data-act="buy" type="button">Comprar ahora</button></div></div></div>';
  }

  function addFromCut(sid, tid, cid, buy) {
    var err = document.getElementById('cut-err');
    if (!cutSel.colors.length) { err.textContent = 'Elige al menos un color.'; return; }
    if (cutSel.forOther && !cutSel.size) { err.textContent = 'Indica la talla de la otra persona.'; return; }
    var ids = cutSel.colors.slice();
    S.addItems(sid, tid, cid, ids, { forOther: cutSel.forOther, size: cutSel.forOther ? cutSel.size : null });
    S.state.cart.forEach(function (it) {
      if (it.styleId === sid && it.typeId === tid && it.cutId === cid && ids.indexOf(it.colorId) >= 0 && cutSel.forOther) {
        if (!it.forOther) S.setForOther(it.id, true);
        if (it.size !== cutSel.size) S.setItemSize(it.id, cutSel.size);
      }
    });
    cutSel = null;
    if (buy) { pendingCheckout = true; go('#/carrito'); return; }
    toast('Agregado al carrito');
    go(S.hasAllTypes() ? '#/carrito' : '#/estilo/' + sid);
  }

  function pageCart() {
    var groups = S.groupedCart();
    groups.forEach(function (g) {
      var k = g.styleId + '|' + g.typeId + '|' + g.cutId;
      if (cartKeys.indexOf(k) < 0) cartKeys.push(k);
    });
    var back = S.state.lastStyle || (S.state.cart.length ? S.state.cart[S.state.cart.length - 1].styleId : null);
    var backBtn = back && C.style(back)
      ? '<a class="btn ghost sm" id="btn-back-types" href="#/estilo/' + esc(back) + '">&larr; Volver a tipos de prenda</a>'
      : '<a class="btn ghost sm" id="btn-back-types" href="#/">&larr; Volver a tipos de prenda</a>';
    var prof = S.state.profile || {};
    var html = '<div class="page-head">' + backBtn + '<h1 style="margin-top:12px">Carrito</h1><p>' + (cartKeys.length ? 'Toca un color para agregarlo o quitarlo.' : 'Tu carrito está vacío. Puedes aplicar un código de atuendo abajo.') + '</p></div><div class="cart-layout"><div>';
    if (!cartKeys.length) html += '<div class="empty"><p>Tu carrito está vacío.</p><a class="btn primary" href="#/">Explorar estilos</a></div>';
    cartKeys.forEach(function (k) {
      var kp = k.split('|'), sid = kp[0], tid = kp[1], cid = kp[2];
      var cut = C.getCut(sid, tid, cid), t = C.type(tid), s = C.style(sid);
      if (!cut || !t || !s) return;
      var items = S.state.cart.filter(function (it) { return it.styleId === sid && it.typeId === tid && it.cutId === cid; });
      var cols = cutColors(sid, tid, cid), sel = {};
      items.forEach(function (it) { sel[it.colorId] = it; });
      var firstCol = colorOf({ colors: cols }, items.length ? items[0].colorId : (cols[0] && cols[0].id));
      html += '<div class="group"><a href="#/estilo/' + sid + '/' + tid + '/' + cid + '">' + cutImg(cut, s, firstCol.hex, tid) + '</a><div>' +
        '<h3>' + esc(cut.name) + '</h3><div class="sub">' + esc(t.name) + ' · ' + esc(s.name) + ' · ' + money(cut.price) + ' c/u</div>' +
        '<div class="swatches" role="group" aria-label="Colores de ' + esc(cut.name) + '">' +
        cols.map(function (col) {
          var on = !!sel[col.id];
          return '<button type="button" class="swb' + (on ? ' on' : '') + '" data-act="tcolor" data-k="' + esc(k) + '" data-c="' + esc(col.id) + '" aria-pressed="' + on + '" title="' + esc(col.name) + '">' +
            '<span class="sw" style="background:' + esc(col.hex) + '"></span>' + esc(col.name) + (on ? '<span class="tick" aria-hidden="true">✓</span>' : '') + '</button>';
        }).join('') + '</div>';
      cols.forEach(function (col) {
        var it = sel[col.id]; if (!it) return;
        html += '<div class="crow"><span class="ck"><span class="sw" style="background:' + esc(col.hex) + '"></span>' + esc(col.name) + '</span>';
        html += '<label class="mini"><input type="checkbox" data-act="cother" data-id="' + esc(it.id) + '"' + (it.forOther ? ' checked' : '') + '>Para alguien más</label>';
        if (it.forOther) {
          html += sizeSelect(tid, it.size || '', 'data-act="csize" data-id="' + esc(it.id) + '" aria-label="Talla de la otra persona"', true);
        } else {
          var eff = S.effectiveSize ? S.effectiveSize(it) : ((prof.sizes || {})[tid] || null);
          if (eff) html += '<span class="size-tag">Talla ' + esc(eff) + '</span>';
          else html += '<span class="size-miss">Falta tu talla</span>' + sizeSelect(tid, '', 'data-act="mysize" data-t="' + esc(tid) + '" aria-label="Tu talla en ' + esc(t.name) + '"', true);
        }
        html += '</div>';
      });
      html += '</div></div>';
    });
    var recs = cartKeys.length ? S.recommendations(4) : [];
    if (recs && recs.length) {
      html += '<h2 style="margin-top:30px">Prendas recomendadas</h2><div class="muted">Piezas que te pueden gustar.</div><div class="rec-grid">' +
        recs.map(function (r, i) {
          var cut = C.getCut(r.styleId, r.typeId, r.cutId), col = colorOf({ colors: cutColors(r.styleId, r.typeId, r.cutId) }, r.colorId);
          return '<div class="rec">' + cutImg(cut || { name: r.name }, C.style(r.styleId), col.hex, r.typeId, r.name) + '<div class="body"><b>' + esc(r.name) + '</b>' +
            '<span class="muted">' + esc(col.name) + '</span><span class="rec-price">' + money(r.price) + '</span>' +
            '<button class="btn sm primary" data-act="rec" data-i="' + i + '" type="button" style="margin-top:auto">Agregar</button></div></div>';
        }).join('') + '</div>';
    }
    var tot = S.totals ? S.totals() : { subtotal: cartTotal(), discount: 0, total: cartTotal() };
    var d = S.state.discount;
    html += '</div><aside class="summary"><h2>Resumen</h2>' +
      '<div class="sec-title" style="margin-top:14px">Código de atuendo o descuento</div>' +
      '<form id="code-form" class="code-form"><input class="inp" name="code" id="code-input" autocomplete="off" autocapitalize="characters" placeholder="Ej. LOOK-DEMO" value="' + esc(codeDraft) + '">' +
      '<button class="btn sm primary" type="submit">Aplicar</button></form>' +
      '<div class="code-msg' + (codeMsg.ok ? ' ok' : '') + '" role="status">' + esc(codeMsg.t) + '</div>' +
      (d && d.code ? '<div class="disc-tag"><span>' + esc(d.code) + ' · -' + esc(d.percent) + '%</span><button type="button" class="btn ghost sm" data-act="rmdisc">Quitar</button></div>' : '') +
      '<div class="looks-tag" style="margin:14px 0 4px;display:flex;justify-content:space-between;align-items:baseline"><span>Looks posibles</span><b style="font-size:22px">' + (S.state.cart.length ? S.combinations() : 0) + '</b></div>' +
      '<table class="tot"><tr><td>Subtotal</td><td>' + money(tot.subtotal) + '</td></tr>' +
      (tot.discount ? '<tr class="disc"><td>Descuento</td><td>-' + money(tot.discount) + '</td></tr>' : '') +
      '<tr class="grand"><td>Total</td><td>' + money(tot.total) + '</td></tr></table>' +
      '<button class="btn primary" style="width:100%;margin-top:14px" data-act="checkout" type="button"' + (S.state.cart.length ? '' : ' disabled') + '>Finalizar compra</button></aside></div>';
    return html;
  }
  function cartTotal() {
    if (S.totals) { var t = S.totals(); if (t && t.total != null) return t.total; }
    return S.state.cart.reduce(function (a, it) {
      var c = C.getCut(it.styleId, it.typeId, it.cutId); return a + (c ? c.price : 0);
    }, 0);
  }

  function pageProfile() {
    var p = S.state.profile;
    if (!p.loggedIn) {
      return crumbs([{ t: 'Inicio', href: '#/' }, { t: 'Perfil' }]) + '<div class="page-head"><h1>Perfil</h1><p>Inicia sesión o crea una cuenta para guardar tus datos y tallas.</p></div>' +
        '<div class="actions"><button class="btn primary" type="button" data-act="openlogin">Iniciar sesión</button></div>';
    }
    var html = crumbs([{ t: 'Inicio', href: '#/' }, { t: 'Perfil' }]) + '<div class="page-head"><h1>Perfil</h1><p>Sesión iniciada. Tus tallas se guardan en tu cuenta.</p></div>' +
      '<div style="max-width:460px"><dl class="pdata"><dt>Nombre</dt><dd>' + esc(p.name) + '</dd><dt>Correo</dt><dd>' + esc(p.email) + '</dd>' +
      (p.phone ? '<dt>Teléfono</dt><dd>' + esc(p.phone) + '</dd>' : '') + '</dl>' +
      '<div class="actions"><button class="btn ghost danger" type="button" data-act="logout">Cerrar sesión</button></div>' +
      '<div class="sec-title" style="margin-top:34px">Mis tallas (opcional)</div>';
    C.types.forEach(function (t) {
      html += '<div class="field"><label>' + esc(t.name) + '</label>' + sizeSelect(t.id, (p.sizes || {})[t.id] || '', 'data-act="psize" data-t="' + t.id + '"') + '</div>';
    });
    return html + '</div>';
  }

  function notFound() {
    return '<div class="empty"><p>No encontramos esa página.</p><a class="btn primary" href="#/">Volver al inicio</a></div>';
  }

  /* ---------- router ---------- */
  function route() {
    var p = (location.hash || '#/').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    var changed = lastHash !== location.hash;
    if (changed) { lastHash = location.hash; if (p[0] !== 'carrito') { cartKeys = []; codeMsg = { t: '', ok: false }; codeDraft = ''; } if (p[0] !== 'estilo' || p.length < 4) cutSel = null; }
    var html;
    if (!p.length) html = pageHome();
    else if (p[0] === 'estilo' && p.length === 2) html = pageStyle(p[1]);
    else if (p[0] === 'estilo' && p.length === 3) html = pageCuts(p[1], p[2]);
    else if (p[0] === 'estilo' && p.length === 4) html = pageCut(p[1], p[2], p[3]);
    else if (p[0] === 'carrito') html = pageCart();
    else if (p[0] === 'perfil') html = pageProfile();
    else html = notFound();
    app.innerHTML = html;
    if (p[0] === 'estilo' && p[1] && C.style(p[1])) {
      document.documentElement.style.setProperty('--c1', C.style(p[1]).colors[0]);
      document.documentElement.style.setProperty('--c2', C.style(p[1]).colors[1]);
    }
    if (changed) window.scrollTo(0, 0);
    if (p[0] === 'carrito' && pendingCheckout) { pendingCheckout = false; openCheckout(); }
  }

  /* ---------- eventos ---------- */
  app.addEventListener('mouseover', function (e) {
    var a = e.target.closest && e.target.closest('.style-item');
    if (a) setPreview(a.getAttribute('data-style'));
  });
  app.addEventListener('focusin', function (e) {
    var a = e.target.closest && e.target.closest('.style-item');
    if (a) setPreview(a.getAttribute('data-style'));
  });
  function hashParts() { return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean); }

  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act'), p = hashParts();
    if (act === 'add' || act === 'buy') addFromCut(p[1], p[2], p[3], act === 'buy');
    else if (act === 'rec') {
      var r = S.recommendations(4)[+b.getAttribute('data-i')];
      if (r) { S.addItems(r.styleId, r.typeId, r.cutId, [r.colorId]); toast('Agregado: ' + r.name); }
    } else if (act === 'tcolor') {
      var kp = b.getAttribute('data-k').split('|');
      S.toggleColor(kp[0], kp[1], kp[2], b.getAttribute('data-c'));
      if (!S.subscribe) route();
    } else if (act === 'rmdisc') { S.removeDiscount(); codeMsg = { t: 'Descuento quitado.', ok: true }; route(); }
    else if (act === 'openlogin') openLogin();
    else if (act === 'checkout') openCheckout();
    else if (act === 'logout') { S.logout(); go('#/'); toast('Sesión cerrada'); }
  });

  app.addEventListener('change', function (e) {
    var el = e.target, act = el.getAttribute('data-act'); if (!act) return;
    var p = hashParts();
    if (act === 'pick' && cutSel) {
      var v = el.value, i = cutSel.colors.indexOf(v);
      if (el.checked && i < 0) cutSel.colors.push(v); else if (!el.checked && i >= 0) cutSel.colors.splice(i, 1);
      var cut = C.getCut(p[1], p[2], p[3]), cl = cutColors(p[1], p[2], p[3]);
      var col = colorOf({ colors: cl }, cutSel.colors[cutSel.colors.length - 1] || cl[0].id);
      if (!hasCutImage(cut)) document.querySelector('#cut-pic img').src = window.imgSVG(cut.name, col.hex, '#111118', p[2]);
      document.getElementById('cut-err').textContent = '';
    } else if (act === 'other' && cutSel) {
      cutSel.forOther = el.checked;
      document.getElementById('other-size').hidden = !el.checked;
    } else if (act === 'osize' && cutSel) {
      cutSel.size = el.value; el.classList.toggle('need', !el.value);
      document.getElementById('cut-err').textContent = '';
    } else if (act === 'cother') S.setForOther(el.getAttribute('data-id'), el.checked);
    else if (act === 'mysize') { if (el.value) S.setProfileSize(el.getAttribute('data-t'), el.value); }
    else if (act === 'csize') S.setItemSize(el.getAttribute('data-id'), el.value);
    else if (act === 'psize') S.setProfileSize(el.getAttribute('data-t'), el.value);
  });

  app.addEventListener('input', function (e) { if (e.target.id === 'code-input') codeDraft = e.target.value; });
  app.addEventListener('submit', function (e) {
    if (e.target.id !== 'code-form') return;
    e.preventDefault();
    var code = String(new FormData(e.target).get('code') || '').trim();
    if (!code) { codeMsg = { t: 'Escribe un código.', ok: false }; route(); return; }
    var btn = e.target.querySelector('button'); if (btn) btn.disabled = true;
    Promise.resolve(S.applyCode(code)).then(function (r) {
      if (r && r.ok) {
        codeMsg = { t: r.kind === 'outfit' ? 'Atuendo agregado al carrito.' : 'Descuento aplicado.', ok: true };
        codeDraft = '';
      } else codeMsg = { t: (r && r.error) || 'Código no válido.', ok: false };
      route();
    }, function () { codeMsg = { t: 'No se pudo validar el código.', ok: false }; route(); });
  });

  /* ---------- modales ---------- */
  function openModal(html, onMount) {
    closeModal();
    var bg = document.createElement('div');
    bg.className = 'modal-bg'; bg.id = 'modal-bg';
    bg.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) closeModal(); });
    document.body.appendChild(bg);
    var f = bg.querySelector('input,select,button'); if (f) f.focus();
    if (onMount) onMount(bg);
    return bg;
  }
  function closeModal() { var m = document.getElementById('modal-bg'); if (m) m.remove(); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  function openLogin(tab) {
    tab = tab === 'register' ? 'register' : 'login';
    var reg = tab === 'register';
    openModal('<div class="tabs" role="tablist"><button type="button" role="tab" class="tab' + (reg ? '' : ' on') + '" data-tab="login" aria-selected="' + !reg + '">Iniciar sesión</button>' +
      '<button type="button" role="tab" class="tab' + (reg ? ' on' : '') + '" data-tab="register" aria-selected="' + reg + '">Crear cuenta</button></div>' +
      '<p class="muted">' + (reg ? 'Las tallas no son necesarias, puedes guardarlas después.' : 'Entra con tu correo y contraseña.') + '</p>' +
      '<form id="login-form" novalidate>' +
      (reg ? '<div class="field"><label>Nombre</label><input class="inp" name="name" autocomplete="name" required></div>' : '') +
      '<div class="field"><label>Correo</label><input class="inp" name="email" type="email" autocomplete="email" required></div>' +
      (reg ? '<div class="field"><label>Teléfono (opcional)</label><input class="inp" name="phone" type="tel" autocomplete="tel"></div>' : '') +
      '<div class="field"><label>Contraseña</label><input class="inp" name="password" type="password" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" required></div>' +
      '<div class="err" id="login-err" role="alert"></div>' +
      '<div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">' + (reg ? 'Crear cuenta' : 'Entrar') + '</button></div></form>',
      function (m) {
        m.querySelector('[data-close]').onclick = closeModal;
        Array.prototype.forEach.call(m.querySelectorAll('[data-tab]'), function (tb) {
          tb.onclick = function () { openLogin(tb.getAttribute('data-tab')); };
        });
        m.querySelector('form').onsubmit = function (e) {
          e.preventDefault();
          var f = new FormData(e.target), err = m.querySelector('#login-err'), btn = e.target.querySelector('[type=submit]');
          var email = String(f.get('email') || '').trim(), pass = String(f.get('password') || '');
          var name = String(f.get('name') || '').trim();
          if (reg && !name) { err.textContent = 'Escribe tu nombre.'; return; }
          if (!email || email.indexOf('@') < 1) { err.textContent = 'Escribe un correo válido.'; return; }
          if (!pass) { err.textContent = 'Escribe tu contraseña.'; return; }
          if (reg && pass.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
          err.textContent = ''; btn.disabled = true;
          var req = reg ? S.register({ name: name, email: email, password: pass, phone: String(f.get('phone') || '').trim() })
                        : S.login({ email: email, password: pass });
          Promise.resolve(req).then(function (r) {
            if (r && r.ok) { closeModal(); toast(reg ? 'Cuenta creada' : 'Sesión iniciada'); updateChrome(); if (hashParts()[0] === 'perfil') route(); }
            else { btn.disabled = false; err.textContent = (r && r.error) || 'No se pudo completar. Intenta de nuevo.'; }
          }, function () { btn.disabled = false; err.textContent = 'Error de conexión. Intenta de nuevo.'; });
        };
      });
  }

  function openCheckout() {
    if (!S.state.cart.length) { toast('Tu carrito está vacío'); return; }
    var miss = S.missingSizesForCheckout(), logged = S.state.profile.loggedIn;
    var html = '<h2>Finalizar compra</h2><p class="muted">' + S.state.cart.length + ' piezas · ' + money(cartTotal()) + '</p>';
    if (miss.types.length || miss.otherItems.length) html += '<p>Necesitamos tus tallas para continuar.</p>';
    miss.types.forEach(function (tid) {
      html += '<div class="field"><label>Tu talla en ' + esc(C.type(tid).name) + '</label>' + sizeSelect(tid, '', 'data-mt="' + tid + '"', true) + '</div>';
    });
    miss.otherItems.forEach(function (id) {
      var it = S.state.cart.filter(function (x) { return x.id === id; })[0]; if (!it) return;
      var cut = C.getCut(it.styleId, it.typeId, it.cutId), col = colorOf(cut, it.colorId);
      html += '<div class="field"><label>Talla de la otra persona: ' + esc(cut.name) + ' (' + esc(col.name) + ')</label>' + sizeSelect(it.typeId, '', 'data-mi="' + esc(id) + '"', true) + '</div>';
    });
    if (miss.types.length) {
      html += logged
        ? '<label class="switch" style="margin-top:16px"><input type="checkbox" id="save-sizes" checked><span>Guardar estas tallas en mi perfil</span></label>'
        : '<p class="muted" style="margin-top:14px">Compras como invitado. Inicia sesión si quieres guardar tus tallas.</p>';
    }
    html += '<div class="err" id="co-err" role="alert"></div><div class="row"><button class="btn ghost" data-close type="button">Cancelar</button><button class="btn primary" id="co-ok" type="button">Confirmar compra</button></div>';
    openModal(html, function (m) {
      m.querySelector('[data-close]').onclick = closeModal;
      m.querySelector('#co-ok').onclick = function () {
        var err = m.querySelector('#co-err'), ok = true, tsz = {}, isz = {};
        Array.prototype.forEach.call(m.querySelectorAll('[data-mt]'), function (s) { tsz[s.getAttribute('data-mt')] = s.value; if (!s.value) { ok = false; s.classList.add('need'); } });
        Array.prototype.forEach.call(m.querySelectorAll('[data-mi]'), function (s) { isz[s.getAttribute('data-mi')] = s.value; if (!s.value) { ok = false; s.classList.add('need'); } });
        if (!ok) { err.textContent = 'Elige todas las tallas para continuar.'; return; }
        var chk = m.querySelector('#save-sizes'), keep = logged && (!chk || chk.checked);
        var prev = {};
        Object.keys(tsz).forEach(function (t) { prev[t] = (S.state.profile.sizes || {})[t] || null; S.setProfileSize(t, tsz[t]); });
        Object.keys(isz).forEach(function (id) { S.setItemSize(id, isz[id]); });
        var okBtn = m.querySelector('#co-ok'); okBtn.disabled = true;
        Promise.resolve(S.checkout()).then(function (res) {
          okBtn.disabled = false;
          if (!res || !res.ok) {
            Object.keys(prev).forEach(function (t) { S.setProfileSize(t, prev[t]); });
            err.textContent = (res && (res.error || res.message)) || 'No se pudo completar la compra. Revisa las tallas.';
            return;
          }
          if (!keep) Object.keys(prev).forEach(function (t) { S.setProfileSize(t, prev[t]); });
          showThanks(res);
        }, function () { okBtn.disabled = false; err.textContent = 'Error al procesar la compra.'; });
      };
    });
  }
  function showThanks(res) {
        var o = res.order || {};
        openModal('<h2>¡Gracias por tu compra!</h2><p class="muted">' + (o.id ? 'Pedido ' + esc(o.id) + '. ' : '') +
          (o.total != null ? 'Total ' + money(o.total) + '. ' : '') + 'Te enviaremos los detalles' + (S.state.profile.email ? ' a ' + esc(S.state.profile.email) : '') + '.</p>' +
          '<div class="row"><button class="btn primary" data-close type="button">Seguir comprando</button></div>',
          function (m2) { m2.querySelector('[data-close]').onclick = function () { closeModal(); go('#/'); }; });
  }

  /* ---------- init ---------- */
  S.subscribe(function () {
    updateChrome();
    if (!started) return;
    var h = hashParts()[0];
    if ((h === 'carrito' || h === 'perfil') && !document.getElementById('modal-bg')) route();
  });
  window.addEventListener('hashchange', function () { if (started) route(); });
  updateChrome();
  function start() { if (started) return; started = true; updateChrome(); route(); }
  var loading = null;
  try { loading = C.load ? C.load() : null; } catch (e) { loading = null; }
  if (loading && loading.then) loading.then(start, start); else start();
})();
