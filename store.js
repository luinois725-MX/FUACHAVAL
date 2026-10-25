(function () {
  var KEY = 'tienda_v1';
  var C = function () { return window.CATALOG; };
  var listeners = [];

  function fresh() {
    return { cart: [], profile: { loggedIn: false, name: '', email: '', phone: '', token: null, sizes: {} }, lastStyle: null, codes: [], discount: null };
  }
  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw), f = fresh();
        return {
          cart: Array.isArray(s.cart) ? s.cart : f.cart,
          profile: Object.assign(f.profile, s.profile || {}, { sizes: Object.assign({}, (s.profile && s.profile.sizes) || {}) }),
          lastStyle: s.lastStyle || null,
          codes: Array.isArray(s.codes) ? s.codes : [],
          discount: s.discount && s.discount.percent ? s.discount : null
        };
      }
    } catch (e) {}
    return fresh();
  }
  var state = load();

  function save() { try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function emit() {
    save();
    listeners.slice().forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } });
  }
  function typeIds() { return C().types.map(function (t) { return t.id; }); }
  function countsOf(cart) {
    var c = {};
    typeIds().forEach(function (t) { c[t] = 0; });
    cart.forEach(function (i) { c[i.typeId] = (c[i.typeId] || 0) + 1; });
    return c;
  }
  function comboOf(counts) {
    return typeIds().reduce(function (p, t) { return p * Math.max(1, counts[t] || 0); }, 1);
  }
  function api(method, path, body) {
    if (typeof fetch !== 'function') return Promise.resolve({ ok: false, status: 0, data: { error: 'Sin conexión' } });
    var h = { 'Content-Type': 'application/json' };
    if (state.profile.token) h.Authorization = 'Bearer ' + state.profile.token;
    return Promise.resolve().then(function () {
      return fetch(path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d || {} }; });
    }).catch(function () { return { ok: false, status: 0, data: { error: 'No se pudo conectar con el servidor' } }; });
  }
  function applyAccount(a, token) {
    var p = state.profile;
    p.loggedIn = true;
    if (token) p.token = token;
    p.name = a.name || ''; p.email = a.email || ''; p.phone = a.phone || '';
    var local = p.sizes || {}, server = a.sizes || {}, extra = false;
    Object.keys(local).forEach(function (k) { if (!server[k]) extra = true; });
    p.sizes = Object.assign({}, local, server);
    if (extra) api('PUT', '/api/me', { sizes: p.sizes });
  }
  function authCall(path, body) {
    return api('POST', path, body).then(function (r) {
      if (!r.ok || r.data.ok === false) return { ok: false, error: r.data.error || 'No se pudo completar' };
      applyAccount(r.data.account || {}, r.data.token);
      emit();
      return { ok: true, account: r.data.account };
    });
  }
  function subtotalOf() {
    return state.cart.reduce(function (t, i) {
      var cut = C().getCut(i.styleId, i.typeId, i.cutId);
      return t + (cut ? cut.price : 0);
    }, 0);
  }
  function totalsOf() {
    var sub = subtotalOf(), pc = state.discount ? state.discount.percent : 0;
    var disc = Math.round(sub * pc) / 100;
    return { subtotal: sub, discount: disc, total: Math.round((sub - disc) * 100) / 100 };
  }
  function find(id) { return state.cart.filter(function (i) { return i.id === id; })[0]; }

  var Store = {
    state: state,
    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },
    addItems: function (styleId, typeId, cutId, colorIds, opts) {
      opts = opts || {};
      var added = [];
      (colorIds || []).forEach(function (colorId) {
        var dup = state.cart.some(function (i) {
          return i.styleId === styleId && i.typeId === typeId && i.cutId === cutId && i.colorId === colorId;
        });
        if (dup) return;
        var item = {
          id: cutId + '__' + colorId, styleId: styleId, typeId: typeId, cutId: cutId, colorId: colorId,
          forOther: !!opts.forOther, size: opts.size != null ? opts.size : null
        };
        state.cart.push(item);
        added.push(item);
      });
      state.lastStyle = styleId;
      emit();
      return added;
    },
    removeItem: function (id) {
      state.cart = state.cart.filter(function (i) { return i.id !== id; });
      Store.state.cart = state.cart;
      emit();
    },
    setItemSize: function (id, size) {
      var i = find(id); if (i) { i.size = size || null; emit(); }
    },
    setForOther: function (id, v) {
      var i = find(id); if (i) { i.forOther = !!v; if (!v) i.size = null; emit(); }
    },
    clearCart: function () { state.cart = []; emit(); },
    countsByType: function () { return countsOf(state.cart); },
    combinations: function () { return comboOf(countsOf(state.cart)); },
    hasAllTypes: function () {
      var c = countsOf(state.cart);
      return typeIds().every(function (t) { return c[t] >= 1; });
    },
    groupedCart: function () {
      var groups = [], idx = {};
      state.cart.forEach(function (i) {
        var k = i.styleId + '|' + i.typeId + '|' + i.cutId;
        if (!(k in idx)) {
          idx[k] = groups.length;
          groups.push({ styleId: i.styleId, typeId: i.typeId, cutId: i.cutId, items: [], colorIds: [] });
        }
        var g = groups[idx[k]];
        g.items.push(i); g.colorIds.push(i.colorId);
      });
      return groups;
    },
    recommendations: function (limit) {
      if (limit == null) limit = 4;
      var counts = countsOf(state.cart), ids = typeIds(), best = ids[0];
      ids.forEach(function (t) { if (counts[t] < counts[best]) best = t; });
      var styleId = state.lastStyle || (state.cart.length ? state.cart[state.cart.length - 1].styleId : null);
      if (!styleId) styleId = C().styles[0].id;
      var base = comboOf(counts);
      var next = Object.assign({}, counts); next[best] = counts[best] + 1;
      var after = comboOf(next), diff = after - base;
      var cuts = C().getCuts(styleId, best) || [];
      var inCart = {};
      state.cart.forEach(function (i) { inCart[i.cutId + '|' + i.colorId] = 1; });
      var rows = [];
      var maxC = cuts.reduce(function (m, c) { return Math.max(m, c.colors.length); }, 0);
      for (var ci = 0; ci < maxC; ci++) {          // round-robin: varied cuts first
        cuts.forEach(function (cut) {
          var col = cut.colors[ci];
          if (!col || inCart[cut.id + '|' + col.id]) return;
          rows.push({ styleId: styleId, typeId: best, cutId: cut.id, colorId: col.id,
            name: cut.name + ' ' + col.name, price: cut.price, newCombos: after, diff: diff });
        });
      }
      return rows.slice(0, limit);
    },
    register: function (u) {
      u = u || {};
      return authCall('/api/register', { name: u.name, email: u.email, password: u.password, phone: u.phone });
    },
    refresh: function () {
      if (!state.profile.token) return Promise.resolve({ ok: false });
      return api('GET', '/api/me').then(function (r) {
        if (r.ok) { applyAccount(r.data.account || r.data); emit(); return { ok: true }; }
        if (r.status === 401 || r.status === 404) { state.profile.token = null; state.profile.loggedIn = false; emit(); }
        return { ok: false, error: r.data.error };
      });
    },
    toggleColor: function (styleId, typeId, cutId, colorId) {
      var ex = state.cart.filter(function (i) {
        return i.styleId === styleId && i.typeId === typeId && i.cutId === cutId && i.colorId === colorId;
      })[0];
      if (ex) { Store.removeItem(ex.id); return { added: false }; }
      Store.addItems(styleId, typeId, cutId, [colorId]);
      return { added: true };
    },
    effectiveSize: function (item) {
      if (!item) return null;
      if (item.forOther) return item.size || null;
      return state.profile.sizes[item.typeId] || null;
    },
    applyCode: function (code) {
      code = String(code || '').trim().toUpperCase();
      if (!code) return Promise.resolve({ ok: false, error: 'Escribe un código' });
      return api('GET', '/api/codes/' + encodeURIComponent(code)).then(function (r) {
        var c = r.data && (r.data.code && typeof r.data.code === 'object' ? r.data.code : r.data);
        if (!r.ok || !c || c.active === false) return { ok: false, error: r.status === 0 ? r.data.error : 'Código no válido' };
        if (c.kind === 'discount') {
          state.discount = { code: String(c.code || code).toUpperCase(), percent: Number(c.percent) || 0 };
          emit();
          return { ok: true, kind: 'discount', percent: state.discount.percent };
        }
        var added = 0;
        (c.items || []).forEach(function (it) {
          var cut = C().getCut(it.styleId, it.typeId, it.cutId);
          if (!cut || !cut.colors.some(function (k) { return k.id === it.colorId; })) return;
          if (Store.addItems(it.styleId, it.typeId, cut.id, [it.colorId]).length) added++;
        });
        var k = String(c.code || code).toUpperCase();
        if (state.codes.indexOf(k) < 0) state.codes.push(k);
        emit();
        return { ok: true, kind: 'outfit', added: added };
      });
    },
    removeDiscount: function () { state.discount = null; emit(); },
    totals: totalsOf,
    login: function (u) {
      u = u || {};
      if (u.password !== undefined) return authCall('/api/login', { email: u.email, password: u.password });
      state.profile.loggedIn = true;
      state.profile.name = u.name || '';
      state.profile.email = u.email || '';
      emit();
    },
    logout: function () {
      var p = state.profile;
      // la sesión se cierra de verdad: los datos y tallas viven en la cuenta del servidor
      p.loggedIn = false; p.token = null; p.name = ''; p.email = ''; p.phone = ''; p.sizes = {};
      emit();
    },
    setProfileSize: function (typeId, size) {
      if (size) state.profile.sizes[typeId] = size; else delete state.profile.sizes[typeId];
      emit();
      if (state.profile.token) api('PUT', '/api/me', { sizes: state.profile.sizes });
    },
    missingSizesForCheckout: function () {
      var types = [], other = [];
      state.cart.forEach(function (i) {
        if (i.forOther) { if (!i.size) other.push(i.id); }
        else if (!state.profile.sizes[i.typeId] && types.indexOf(i.typeId) < 0) types.push(i.typeId);
      });
      return { types: types, otherItems: other };
    },
    checkout: function () {
      var m = Store.missingSizesForCheckout();
      if (m.types.length || m.otherItems.length) return { ok: false, error: 'Faltan tallas', missing: m };
      var tt = totalsOf();
      var items = state.cart.map(function (i) {
        var cut = C().getCut(i.styleId, i.typeId, i.cutId), p = cut ? cut.price : 0;
        return Object.assign({}, i, { size: i.forOther ? i.size : state.profile.sizes[i.typeId], price: p });
      });
      var order = { id: 'P' + Date.now().toString(36).toUpperCase(), date: new Date().toISOString(),
        items: items, subtotal: tt.subtotal, discount: tt.discount, discountCode: state.discount ? state.discount.code : null,
        total: tt.total, combinations: comboOf(countsOf(state.cart)) };
      state.cart = []; state.discount = null; state.codes = [];
      if (state.profile.token) api('PUT', '/api/me', { sizes: state.profile.sizes });
      emit();
      return { ok: true, order: order };
    }
  };
  window.Store = Store;
  if (state.profile.token) Store.refresh();
})();
