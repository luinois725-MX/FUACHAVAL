(function () {
  'use strict';
  var root = document.getElementById('admin-app');
  var C = window.CATALOG;
  var KEY = 'admin_token_v1';
  var S = { token: null, tab: 'cuentas', accounts: [], products: [], codes: [], msg: null, edit: null, codeEdit: null, f: { style: '', type: '', state: '' } };
  try { S.token = sessionStorage.getItem(KEY); } catch (e) {}

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api(method, url, body) {
    var o = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (S.token) o.headers.Authorization = 'Bearer ' + S.token;
    if (body !== undefined) o.body = JSON.stringify(body);
    return fetch(url, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && S.token && url !== '/api/admin/login') { logout(); throw new Error('Sesión expirada'); }
        if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
        return j;
      });
    });
  }
  function flash(text, err) { S.msg = { text: text, err: !!err }; }
  function logout() { S.token = null; try { sessionStorage.removeItem(KEY); } catch (e) {} render(); }
  function styleName(id) { var s = C.style(id); return s ? s.name : id; }
  function typeName(id) { var t = C.type(id); return t ? t.name : id; }
  function fmtDate(d) { return d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '-'; }
  function opts(list, sel, blank) {
    return (blank ? '<option value="">' + blank + '</option>' : '') + list.map(function (o) { return '<option value="' + esc(o.id) + '"' + (o.id === sel ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('');
  }

  function load() {
    return Promise.all([api('GET', '/api/admin/accounts'), api('GET', '/api/admin/products'), api('GET', '/api/admin/codes')]).then(function (r) {
      S.accounts = r[0]; S.products = r[1]; S.codes = r[2];
    }).catch(function (e) { flash(e.message, true); });
  }

  function render() {
    if (!S.token) return renderLogin();
    var tabs = [['cuentas', 'Cuentas'], ['productos', 'Productos'], ['codigos', 'Códigos']];
    root.innerHTML = '<header class="top"><h1>Panel de administración</h1><nav class="tabs">' +
      tabs.map(function (t) { return '<button class="tab' + (S.tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
      '</nav><button class="ghost sm" id="out">Salir</button></header><main>' +
      (S.msg ? '<div class="msg ' + (S.msg.err ? 'err' : 'good') + '">' + esc(S.msg.text) + '</div>' : '') +
      (S.tab === 'cuentas' ? viewAccounts() : S.tab === 'productos' ? viewProducts() : viewCodes()) + '</main>';
    S.msg = null;
    bind();
  }

  function renderLogin(err) {
    root.innerHTML = '<form class="card login" id="lf"><h2>Acceso admin</h2>' + (err ? '<div class="msg err">' + esc(err) + '</div>' : '') +
      '<label>Usuario</label><input name="user" autocomplete="username" required><label>Contraseña</label><input name="password" type="password" autocomplete="current-password" required>' +
      '<p><button style="width:100%">Entrar</button></p></form>';
    document.getElementById('lf').onsubmit = function (e) {
      e.preventDefault();
      var f = e.target;
      api('POST', '/api/admin/login', { user: f.user.value, password: f.password.value }).then(function (j) {
        S.token = j.token; try { sessionStorage.setItem(KEY, j.token); } catch (x) {}
        return load();
      }).then(render).catch(function (x) { renderLogin(x.message); });
    };
  }

  // ---- Cuentas
  function viewAccounts() {
    return '<h2>Cuentas (' + S.accounts.length + ')</h2><div class="tablewrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Tallas</th><th>Alta</th><th>Último acceso</th><th>Accesos</th></tr></thead><tbody>' +
      (S.accounts.map(function (a) {
        var sz = Object.keys(a.sizes || {}).map(function (k) { return esc(typeName(k)) + ': <b>' + esc(a.sizes[k]) + '</b>'; }).join('<br>') || '<span class="muted">-</span>';
        return '<tr><td>' + esc(a.name) + '</td><td>' + esc(a.email) + '</td><td>' + esc(a.phone || '-') + '</td><td>' + sz + '</td><td>' + fmtDate(a.createdAt) + '</td><td>' + fmtDate(a.lastLogin) + '</td><td>' + (a.loginCount || 0) + '</td></tr>';
      }).join('') || '<tr><td colspan="7" class="muted">Sin cuentas todavía</td></tr>') + '</tbody></table></div>';
  }

  // ---- Productos
  function viewProducts() {
    var f = S.f;
    var list = S.products.filter(function (p) {
      return (!f.style || p.styleId === f.style) && (!f.type || p.typeId === f.type) && (!f.state || (f.state === 'on') === !!p.active);
    });
    var e = S.edit;
    var form = '';
    if (e) {
      form = '<form class="card" id="pf"><h3>' + (e.id ? 'Editar: ' + esc(e.id) : 'Nuevo producto') + '</h3><div class="row">' +
        '<div><label>Nombre del corte</label><input name="name" value="' + esc(e.name) + '" required></div>' +
        '<div><label>Estilo</label><select name="styleId">' + opts(C.styles, e.styleId) + '</select></div>' +
        '<div><label>Tipo de prenda</label><select name="typeId">' + opts(C.types, e.typeId) + '</select></div>' +
        '<div><label>Precio</label><input name="price" type="number" min="0" step="1" value="' + esc(e.price) + '" required></div></div>' +
        '<label>Colores</label><div id="cols">' + e.colors.map(colRow).join('') + '</div><button type="button" class="ghost sm" id="addcol">+ Agregar color</button>' +
        '<label>Imagen (máx. 5MB)</label><input type="file" id="img" accept="image/*">' +
        '<div id="prev">' + (e.image ? '<img class="prev" src="' + esc(e.image) + '"><button type="button" class="ghost sm" id="rmimg">Quitar imagen</button>' : '') + '</div>' +
        '<p class="row"><button class="auto">Guardar</button><button type="button" class="ghost auto" id="cancel">Cancelar</button></p></form>';
    }
    return '<div class="row" style="margin-bottom:12px"><h2 style="margin:0">Productos (' + list.length + ')</h2><div class="auto"><button id="newp">+ Nuevo producto</button></div></div>' + form +
      '<div class="filters"><select data-f="style">' + opts(C.styles, f.style, 'Todos los estilos') + '</select><select data-f="type">' + opts(C.types, f.type, 'Todos los tipos') +
      '</select><select data-f="state"><option value="">Todos</option><option value="on"' + (f.state === 'on' ? ' selected' : '') + '>Alta</option><option value="off"' + (f.state === 'off' ? ' selected' : '') + '>Baja</option></select></div>' +
      '<div class="tablewrap"><table><thead><tr><th></th><th>Corte</th><th>Estilo</th><th>Tipo</th><th>Precio</th><th>Colores</th><th>Estado</th><th></th></tr></thead><tbody>' +
      (list.map(function (p) {
        return '<tr class="' + (p.active ? '' : 'off') + '"><td>' + (p.image ? '<img class="thumb" src="' + esc(p.image) + '">' : '') + '</td><td>' + esc(p.name) + '<div class="muted" style="font-size:11px">' + esc(p.id) + '</div></td><td>' + esc(styleName(p.styleId)) + '</td><td>' + esc(typeName(p.typeId)) + '</td><td>$' + esc(p.price) + '</td><td>' +
          p.colors.map(function (c) { return '<span class="sw" style="background:' + esc(c.hex) + '" title="' + esc(c.name) + '"></span>'; }).join('') + '</td><td><span class="pill ' + (p.active ? 'on' : 'off') + '">' + (p.active ? 'Alta' : 'Baja') + '</span></td><td style="white-space:nowrap">' +
          '<button class="ghost sm" data-edit="' + esc(p.id) + '">Editar</button> ' +
          (p.active ? '<button class="bad sm" data-baja="' + esc(p.id) + '">Baja</button>' : '<button class="ok sm" data-alta="' + esc(p.id) + '">Alta</button>') + '</td></tr>';
      }).join('') || '<tr><td colspan="8" class="muted">Sin resultados</td></tr>') + '</tbody></table></div>';
  }
  function colRow(c) {
    return '<div class="colrow"><input type="text" class="cn" placeholder="Nombre del color" value="' + esc(c.name) + '"><input type="color" class="ch" value="' + esc(/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#888888') + '"><button type="button" class="ghost sm rmcol">Quitar</button></div>';
  }
  function readColors() {
    return Array.prototype.map.call(document.querySelectorAll('#cols .colrow'), function (r) { return { name: r.querySelector('.cn').value.trim(), hex: r.querySelector('.ch').value }; }).filter(function (c) { return c.name; });
  }

  // ---- Códigos
  function pieceRow(it) {
    it = it || {};
    var styles = C.styles, types = C.types;
    var cuts = it.styleId && it.typeId ? S.products.filter(function (p) { return p.styleId === it.styleId && p.typeId === it.typeId; }) : [];
    var cut = cuts.filter(function (c) { return c.id === it.cutId; })[0];
    return '<div class="piece"><select class="ps">' + opts(styles, it.styleId, 'Estilo') + '</select><select class="pt">' + opts(types, it.typeId, 'Tipo') + '</select>' +
      '<select class="pc">' + opts(cuts, it.cutId, 'Corte') + '</select><select class="pk">' + opts(cut ? cut.colors : [], it.colorId, 'Color') + '</select><button type="button" class="ghost sm rmp">Quitar</button></div>';
  }
  function viewCodes() {
    var e = S.codeEdit, form = '';
    if (e) {
      form = '<form class="card" id="cf"><h3>' + (e.isNew ? 'Nuevo código' : 'Editar ' + esc(e.code)) + '</h3><div class="row">' +
        '<div><label>Código</label><input name="code" value="' + esc(e.code) + '"' + (e.isNew ? '' : ' disabled') + ' style="text-transform:uppercase" required></div>' +
        '<div><label>Tipo</label><select name="kind"><option value="outfit"' + (e.kind === 'outfit' ? ' selected' : '') + '>Atuendo</option><option value="discount"' + (e.kind === 'discount' ? ' selected' : '') + '>Descuento %</option></select></div>' +
        '<div id="pctw"><label>Porcentaje (1-90)</label><input name="percent" type="number" min="1" max="90" value="' + esc(e.percent || 10) + '"></div></div>' +
        '<label>Descripción</label><input name="description" value="' + esc(e.description) + '">' +
        '<div id="piecesw"><label>Piezas del atuendo</label><div id="pieces">' + (e.items.length ? e.items : [{}]).map(pieceRow).join('') + '</div><button type="button" class="ghost sm" id="addp">+ Agregar pieza</button></div>' +
        '<p class="row"><button class="auto">Guardar</button><button type="button" class="ghost auto" id="ccancel">Cancelar</button></p></form>';
    }
    return '<div class="row" style="margin-bottom:12px"><h2 style="margin:0">Códigos (' + S.codes.length + ')</h2><div class="auto"><button id="newc">+ Nuevo código</button></div></div>' + form +
      '<div class="tablewrap"><table><thead><tr><th>Código</th><th>Tipo</th><th>Detalle</th><th>Estado</th><th></th></tr></thead><tbody>' +
      (S.codes.map(function (c) {
        var det = c.kind === 'discount' ? c.percent + '% de descuento' : c.items.length + ' piezas: ' + c.items.map(function (i) { return esc(i.cutId); }).join(', ');
        return '<tr class="' + (c.active ? '' : 'off') + '"><td><b>' + esc(c.code) + '</b></td><td>' + (c.kind === 'discount' ? 'Descuento' : 'Atuendo') + '</td><td>' + esc(c.description) + '<div class="muted" style="font-size:11px">' + det + '</div></td><td><span class="pill ' + (c.active ? 'on' : 'off') + '">' + (c.active ? 'Alta' : 'Baja') + '</span></td><td style="white-space:nowrap"><button class="ghost sm" data-cedit="' + esc(c.code) + '">Editar</button> ' +
          (c.active ? '<button class="bad sm" data-cbaja="' + esc(c.code) + '">Baja</button>' : '<button class="ok sm" data-calta="' + esc(c.code) + '">Alta</button>') + '</td></tr>';
      }).join('') || '<tr><td colspan="5" class="muted">Sin códigos</td></tr>') + '</tbody></table></div>';
  }

  function act(p) { return p.then(load).then(function () { render(); }).catch(function (e) { flash(e.message, true); render(); }); }

  function bind() {
    function on(sel, fn) { Array.prototype.forEach.call(root.querySelectorAll(sel), fn); }
    document.getElementById('out').onclick = logout;
    on('[data-tab]', function (b) { b.onclick = function () { S.tab = b.dataset.tab; S.edit = null; S.codeEdit = null; render(); }; });
    if (S.tab === 'productos') {
      on('[data-f]', function (s) { s.onchange = function () { S.f[s.dataset.f] = s.value; render(); }; });
      document.getElementById('newp').onclick = function () { S.edit = { id: null, name: '', styleId: C.styles[0].id, typeId: C.types[0].id, price: 299, colors: [{ name: 'Negro', hex: '#111111' }], image: null, active: true }; render(); };
      on('[data-edit]', function (b) { b.onclick = function () { S.edit = JSON.parse(JSON.stringify(S.products.filter(function (p) { return p.id === b.dataset.edit; })[0])); render(); window.scrollTo(0, 0); }; });
      on('[data-baja]', function (b) { b.onclick = function () { if (confirm('¿Dar de baja este producto?')) act(api('DELETE', '/api/admin/products/' + encodeURIComponent(b.dataset.baja)).then(function () { flash('Producto dado de baja'); })); }; });
      on('[data-alta]', function (b) { b.onclick = function () { act(api('PUT', '/api/admin/products/' + encodeURIComponent(b.dataset.alta), { active: true }).then(function () { flash('Producto dado de alta'); })); }; });
      var pf = document.getElementById('pf');
      if (pf) {
        document.getElementById('cancel').onclick = function () { S.edit = null; render(); };
        document.getElementById('addcol').onclick = function () { document.getElementById('cols').insertAdjacentHTML('beforeend', colRow({ name: '', hex: '#888888' })); bindRm(); };
        function bindRm() { on('.rmcol', function (b) { b.onclick = function () { b.parentNode.remove(); }; }); }
        bindRm();
        var rm = document.getElementById('rmimg');
        if (rm) rm.onclick = function () { S.edit.image = null; document.getElementById('prev').innerHTML = ''; };
        document.getElementById('img').onchange = function (ev) {
          var f = ev.target.files[0]; if (!f) return;
          if (f.size > 5 * 1024 * 1024) { alert('La imagen excede 5MB'); ev.target.value = ''; return; }
          var fr = new FileReader();
          fr.onload = function () { S.edit.image = fr.result; document.getElementById('prev').innerHTML = '<img class="prev" src="' + fr.result + '">'; };
          fr.readAsDataURL(f);
        };
        pf.onsubmit = function (ev) {
          ev.preventDefault();
          var e = S.edit, body = { name: pf.name.value, styleId: pf.styleId.value, typeId: pf.typeId.value, price: +pf.price.value, colors: readColors(), image: e.image || null };
          if (!body.colors.length) { alert('Agrega al menos un color'); return; }
          act((e.id ? api('PUT', '/api/admin/products/' + encodeURIComponent(e.id), body) : api('POST', '/api/admin/products', body)).then(function () { S.edit = null; flash('Producto guardado'); }));
        };
      }
    }
    if (S.tab === 'codigos') {
      document.getElementById('newc').onclick = function () { S.codeEdit = { isNew: true, code: '', kind: 'outfit', description: '', percent: 10, items: [] }; render(); };
      on('[data-cedit]', function (b) { b.onclick = function () { var c = JSON.parse(JSON.stringify(S.codes.filter(function (x) { return x.code === b.dataset.cedit; })[0])); S.codeEdit = c; render(); window.scrollTo(0, 0); }; });
      on('[data-cbaja]', function (b) { b.onclick = function () { act(api('DELETE', '/api/admin/codes/' + encodeURIComponent(b.dataset.cbaja)).then(function () { flash('Código dado de baja'); })); }; });
      on('[data-calta]', function (b) { b.onclick = function () { act(api('PUT', '/api/admin/codes/' + encodeURIComponent(b.dataset.calta), { active: true }).then(function () { flash('Código dado de alta'); })); }; });
      var cf = document.getElementById('cf');
      if (cf) {
        var sync = function () { var d = cf.kind.value === 'discount'; document.getElementById('pctw').style.display = d ? '' : 'none'; document.getElementById('piecesw').style.display = d ? 'none' : ''; };
        cf.kind.onchange = sync; sync();
        document.getElementById('ccancel').onclick = function () { S.codeEdit = null; render(); };
        var wire = function () {
          on('.piece', function (row) {
            var s = row.querySelector('.ps'), t = row.querySelector('.pt'), c = row.querySelector('.pc'), k = row.querySelector('.pk');
            function fillCuts() {
              var cuts = S.products.filter(function (p) { return p.styleId === s.value && p.typeId === t.value; });
              c.innerHTML = opts(cuts, '', 'Corte'); fillColors();
            }
            function fillColors() {
              var p = S.products.filter(function (x) { return x.id === c.value; })[0];
              k.innerHTML = opts(p ? p.colors : [], '', 'Color');
            }
            s.onchange = t.onchange = fillCuts; c.onchange = fillColors;
            row.querySelector('.rmp').onclick = function () { row.remove(); };
          });
        };
        wire();
        document.getElementById('addp').onclick = function () { document.getElementById('pieces').insertAdjacentHTML('beforeend', pieceRow({})); wire(); };
        cf.onsubmit = function (ev) {
          ev.preventDefault();
          var e = S.codeEdit, kind = cf.kind.value;
          var all = Array.prototype.map.call(cf.querySelectorAll('.piece'), function (r) {
            return { styleId: r.querySelector('.ps').value, typeId: r.querySelector('.pt').value, cutId: r.querySelector('.pc').value, colorId: r.querySelector('.pk').value };
          });
          var items = all.filter(function (i) { return i.styleId && i.typeId && i.cutId && i.colorId; });
          if (kind === 'outfit') {
            if (all.some(function (i) { return (i.styleId || i.typeId || i.cutId || i.colorId) && !(i.styleId && i.typeId && i.cutId && i.colorId); })) { alert('Hay piezas incompletas: elige estilo, tipo, corte y color en cada una (o quítalas).'); return; }
            if (!items.length) { alert('El atuendo necesita al menos una pieza completa.'); return; }
          }
          if (kind === 'discount' && !(+cf.percent.value >= 1 && +cf.percent.value <= 90)) { alert('El porcentaje debe estar entre 1 y 90.'); return; }
          if (e.isNew && !/^[A-Za-z0-9_-]{2,40}$/.test(cf.code.value.trim())) { alert('El código solo admite letras, números, guion y guion bajo (mínimo 2).'); return; }
          var body = { kind: kind, description: cf.description.value, percent: +cf.percent.value, items: kind === 'outfit' ? items : [] };
          if (e.isNew) body.code = cf.code.value;
          act((e.isNew ? api('POST', '/api/admin/codes', body) : api('PUT', '/api/admin/codes/' + encodeURIComponent(e.code), body)).then(function () { S.codeEdit = null; flash('Código guardado'); }));
        };
      }
    }
  }

  if (S.token) load().then(render); else render();
})();
