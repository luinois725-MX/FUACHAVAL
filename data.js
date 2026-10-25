(function () {
  'use strict';
  var styles = [
    { id: 'streetwear', name: 'Streetwear', tagline: 'Calle, volumen y actitud', colors: ['#ff3d71', '#1a1a2e', '#f5c518'] },
    { id: 'minimal', name: 'Minimal', tagline: 'Menos es más', colors: ['#e8e4dc', '#2b2b2b', '#a8a29a'] },
    { id: 'vintage', name: 'Vintage', tagline: 'Retro con alma', colors: ['#c8873a', '#5b3a29', '#e9d8b4'] },
    { id: 'deportivo', name: 'Deportivo', tagline: 'Movimiento sin límites', colors: ['#00c2ff', '#0b1f3a', '#b6ff3b'] },
    { id: 'elegante', name: 'Elegante', tagline: 'Clase en cada detalle', colors: ['#7b1e3a', '#111111', '#d4af37'] }
  ];
  var types = [
    { id: 'playeras', name: 'Playeras' },
    { id: 'pantalones', name: 'Pantalones' },
    { id: 'zapatos', name: 'Zapatos' },
    { id: 'sudaderas', name: 'Sudaderas' },
    { id: 'chamarras', name: 'Chamarras' },
    { id: 'accesorios', name: 'Accesorios' }
  ];
  var cutDefs = {
    playeras: [['oversize', 'Oversize', 349], ['regular', 'Corte regular', 299], ['crop', 'Crop', 279], ['polo', 'Polo', 399]],
    pantalones: [['recto', 'Corte recto', 599], ['skinny', 'Skinny', 569], ['baggy', 'Baggy', 649], ['cargo', 'Cargo', 699]],
    zapatos: [['sneaker', 'Sneaker bajo', 1199], ['alto', 'Bota alta', 1499], ['slip', 'Slip-on', 899]],
    sudaderas: [['capucha', 'Con capucha', 699], ['cuello', 'Cuello redondo', 649], ['zip', 'Con cierre', 749], ['boxy', 'Boxy', 729]],
    chamarras: [['bomber', 'Bomber', 1299], ['denim', 'Mezclilla', 1199], ['cortavientos', 'Cortavientos', 999], ['blazer', 'Blazer', 1599]],
    accesorios: [['gorra', 'Gorra', 249], ['mochila', 'Mochila', 549], ['cinturon', 'Cinturón', 299], ['lentes', 'Lentes', 349]]
  };
  var styleMult = { streetwear: 1.0, minimal: 1.1, vintage: 0.95, deportivo: 1.05, elegante: 1.35 };
  var colorNames = {
    streetwear: [['negro', 'Negro', '#111111'], ['rosa', 'Rosa neón', '#ff3d71'], ['amarillo', 'Amarillo', '#f5c518'], ['gris', 'Gris humo', '#6b6b7b'], ['azul', 'Azul medianoche', '#1a1a2e']],
    minimal: [['hueso', 'Hueso', '#e8e4dc'], ['negro', 'Negro', '#2b2b2b'], ['arena', 'Arena', '#c9bfae'], ['gris', 'Gris piedra', '#a8a29a'], ['blanco', 'Blanco', '#f7f7f5']],
    vintage: [['mostaza', 'Mostaza', '#c8873a'], ['cafe', 'Café', '#5b3a29'], ['crema', 'Crema', '#e9d8b4'], ['verde', 'Verde olivo', '#6b7440'], ['ladrillo', 'Ladrillo', '#a2452d']],
    deportivo: [['cian', 'Cian', '#00c2ff'], ['marino', 'Azul marino', '#0b1f3a'], ['lima', 'Lima', '#b6ff3b'], ['blanco', 'Blanco', '#f4f6f8'], ['negro', 'Negro', '#101418']],
    elegante: [['vino', 'Vino', '#7b1e3a'], ['negro', 'Negro', '#111111'], ['dorado', 'Dorado', '#d4af37'], ['marfil', 'Marfil', '#f1ead8'], ['grafito', 'Grafito', '#3a3a40']]
  };
  var sizes = {
    playeras: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    pantalones: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    sudaderas: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    chamarras: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    zapatos: ['24', '25', '26', '27', '28', '29', '30'],
    accesorios: ['Única']
  };

  function find(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  var cache = {};
  function genCuts(styleId, typeId) {
    var defs = cutDefs[typeId], pal = colorNames[styleId];
    if (!defs || !pal) return [];
    var key = styleId + '|' + typeId;
    if (cache[key]) return cache[key];
    var out = defs.map(function (d, i) {
      var n = 3 + ((i + styles.map(function (s) { return s.id; }).indexOf(styleId)) % 3); // 3-5
      var cols = [];
      for (var k = 0; k < n; k++) {
        var c = pal[(k + i) % pal.length];
        cols.push({ id: c[0], name: c[1], hex: c[2] });
      }
      return {
        id: styleId + '-' + typeId + '-' + d[0],
        styleId: styleId, typeId: typeId,
        name: d[1],
        price: Math.round(d[2] * styleMult[styleId] / 10) * 10 - 1,
        colors: cols
      };
    });
    cache[key] = out;
    return out;
  }
  var remote = null; // { map: {style|type: [cuts]} } cuando el servidor responde
  function getCuts(styleId, typeId) {
    if (remote) return remote[styleId + '|' + typeId] || [];
    return genCuts(styleId, typeId);
  }
  function getCut(styleId, typeId, cutId) {
    var cuts = getCuts(styleId, typeId);
    for (var i = 0; i < cuts.length; i++) {
      if (cuts[i].id === cutId || cuts[i].id === styleId + '-' + typeId + '-' + cutId) return cuts[i];
    }
    return null;
  }

  var gallery = [];
  var labels = {
    streetwear: ['Look urbano', 'Noche en la calle'], minimal: ['Tonos neutros', 'Línea limpia'],
    vintage: ['Ecos de los 80', 'Tarde retro'], deportivo: ['Listo para correr', 'Modo gimnasio'],
    elegante: ['Gala nocturna', 'Sastrería fina']
  };
  styles.forEach(function (s) {
    labels[s.id].forEach(function (l, i) { gallery.push({ id: s.id + '-m' + (i + 1), styleId: s.id, label: l }); });
  });

  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var shapes = {
    playeras: '<path d="M-60-70L-30-80Q0-60 30-80L60-70L90-30L60-10L50-30V80H-50V-30L-60-10L-90-30Z"/>',
    pantalones: '<path d="M-45-80H45L55 90H15L0-10L-15 90H-55Z"/>',
    zapatos: '<path d="M-90 30Q-90 0-60 0H-20Q10 30 50 30Q90 30 90 60V70H-90Z"/>',
    sudaderas: '<path d="M-60-70Q0-100 60-70L95-20L65 10L55-10V80H-55V-10L-65 10L-95-20Z"/><path d="M-20-75Q0-45 20-75" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="5"/>',
    chamarras: '<path d="M-65-70L-20-80L0-50L20-80L65-70L100-20L70 10L58-10V80H-58V-10L-70 10L-100-20Z"/><path d="M0-50V80" stroke="rgba(0,0,0,.3)" stroke-width="4"/>',
    accesorios: '<path d="M-70 10Q-70-50 0-50Q70-50 70 10Z"/><path d="M60 10H110Q100 25 60 25Z"/>',
    model: '<circle cx="0" cy="-85" r="26"/><path d="M-45-50Q0-65 45-50L55 40H25L20 100H-20L-25 40H-55Z"/>'
  };
  function imgSVG(label, c1, c2, kind) {
    c1 = c1 || '#333'; c2 = c2 || '#111';
    var shape = shapes[kind] || shapes.model;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + esc(c1) + '"/><stop offset="1" stop-color="' + esc(c2) + '"/></linearGradient>' +
      '<radialGradient id="r" cx=".3" cy=".2" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="400" height="500" fill="url(#g)"/><rect width="400" height="500" fill="url(#r)"/>' +
      '<circle cx="330" cy="90" r="60" fill="#fff" opacity=".08"/><circle cx="60" cy="430" r="90" fill="#000" opacity=".12"/>' +
      '<g transform="translate(200 240) scale(1.4)" fill="rgba(255,255,255,.88)" stroke="rgba(0,0,0,.15)" stroke-width="2">' + shape + '</g>' +
      '<text x="200" y="465" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="22" letter-spacing="3" fill="#fff" opacity=".9">' + esc(String(label || '').toUpperCase()) + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function cutImage(cut, style) {
    if (cut && cut.image) return cut.image;
    var st = typeof style === 'string' ? find(styles, style) : style;
    if (!st && cut) st = find(styles, cut.styleId);
    st = st || styles[0];
    return imgSVG(cut ? cut.name : '', st.colors[0], st.colors[1], cut && cut.typeId);
  }
  function allColors(styleId, typeId, cutId) {
    var c = getCut(styleId, typeId, cutId);
    return c ? c.colors.slice() : [];
  }
  function load() {
    if (typeof fetch !== 'function') return Promise.resolve(false);
    return Promise.resolve().then(function () { return fetch('/api/catalog'); }).then(function (r) {
      if (!r || !r.ok) throw new Error('catalog');
      return r.json();
    }).then(function (d) {
      var prods = d && Array.isArray(d.products) ? d.products : null;
      if (!prods) throw new Error('catalog');
      var map = {};
      prods.forEach(function (p) {
        if (p.active === false || !find(styles, p.styleId) || !find(types, p.typeId)) return;
        var k = p.styleId + '|' + p.typeId;
        (map[k] = map[k] || []).push({
          id: p.id, styleId: p.styleId, typeId: p.typeId, name: p.name, price: Number(p.price) || 0,
          image: p.image || null, colors: Array.isArray(p.colors) ? p.colors.slice() : []
        });
      });
      remote = map;
      if (Array.isArray(d.gallery) && d.gallery.length) {
        gallery.length = 0;
        d.gallery.forEach(function (g) { gallery.push(g); });
      }
      return true;
    }).catch(function () { remote = null; return false; });
  }

  window.imgSVG = imgSVG;
  window.CATALOG = {
    styles: styles, types: types, sizes: sizes, gallery: gallery,
    getCuts: getCuts, getCut: getCut, load: load, allColors: allColors, cutImage: cutImage,
    type: function (id) { return find(types, id); },
    style: function (id) { return find(styles, id); }
  };
})();
