const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = +process.env.PORT || 5173;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const DB_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

// ---------- DB ----------
function loadCatalogModule() {
  const ctx = { console };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8'), ctx, { filename: 'data.js' });
  return ctx.CATALOG;
}
function seedProducts(C) {
  const out = [];
  C.styles.forEach(s => C.types.forEach(t => (C.getCuts(s.id, t.id) || []).forEach(c => out.push({
    id: c.id, styleId: s.id, typeId: t.id, name: c.name, price: c.price, image: null,
    colors: (c.colors || []).map(x => ({ id: x.id, name: x.name, hex: x.hex })), active: true
  }))));
  return out;
}
function seedDb() {
  const C = loadCatalogModule();
  const products = seedProducts(C);
  const items = [];
  for (const t of ['playeras', 'pantalones', 'zapatos']) {
    const p = products.find(x => x.styleId === 'streetwear' && x.typeId === t) || products.find(x => x.typeId === t);
    if (p) items.push({ styleId: p.styleId, typeId: p.typeId, cutId: p.id, colorId: p.colors[0] && p.colors[0].id });
  }
  return {
    products, gallery: C.gallery || [], accounts: [], tokens: {},
    codes: [
      { code: 'LOOK-DEMO', kind: 'outfit', description: 'Atuendo demo de 3 piezas', percent: 0, items, active: true },
      { code: 'DESC10', kind: 'discount', description: '10% de descuento', percent: 10, items: [], active: true }
    ]
  };
}
// En Vercel no hay disco persistente: si hay credenciales de Redis (Upstash) la base vive ahí.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const REMOTE = !!(REDIS_URL && REDIS_TOKEN);
const REDIS_KEY = 'tienda:db';
async function redis(cmd) {
  const r = await fetch(REDIS_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error('Redis: ' + (j.error || r.status));
  return j.result;
}
let db, dirty = false;
function normalizeDb() {
  db.accounts = db.accounts || []; db.tokens = db.tokens || {}; db.codes = db.codes || []; db.products = db.products || [];
  db.gallery = db.gallery || [];
}
function loadDb() {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { db = null; }
  if (!db) { db = seedDb(); save(); }
  normalizeDb();
}
async function loadDbRemote() {
  const raw = await redis(['GET', REDIS_KEY]);
  db = raw ? JSON.parse(raw) : null;
  if (!db) { db = seedDb(); dirty = true; }
  normalizeDb();
}
async function flush() {
  if (REMOTE && dirty) { dirty = false; await redis(['SET', REDIS_KEY, JSON.stringify(db)]); }
}
function save() {
  if (REMOTE) { dirty = true; return; }
  fs.mkdirSync(DB_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

// ---------- helpers ----------
const uid = () => crypto.randomBytes(8).toString('hex');
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPw(pw, stored) {
  const [salt, h] = String(stored || '').split(':');
  if (!salt || !h) return false;
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const pub = a => { const { passwordHash, ...r } = a; return r; };
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
const fail = (res, code, error) => send(res, code, { ok: false, error });
function readBody(req, limit = 8 * 1024 * 1024) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    try { return Promise.resolve(JSON.parse(String(req.body) || '{}')); } catch { return Promise.reject({ status: 400, msg: 'JSON inválido' }); }
  }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject({ status: 413, msg: 'Cuerpo demasiado grande' }); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject({ status: 400, msg: 'JSON inválido' }); }
    });
    req.on('error', () => reject({ status: 400, msg: 'Error de lectura' }));
  });
}
function bearer(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  return m ? m[1].trim() : null;
}
function authUser(req) {
  const t = db.tokens[bearer(req)];
  if (!t || t.kind !== 'user') return null;
  return db.accounts.find(a => a.id === t.id) || null;
}
function isAdmin(req) { const t = db.tokens[bearer(req)]; return !!(t && t.kind === 'admin'); }
function newToken(kind, id) {
  const token = crypto.randomBytes(24).toString('hex');
  db.tokens[token] = { kind, id, created: Date.now() };
  return token;
}
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const str = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);

function cleanColors(cols) {
  if (!Array.isArray(cols)) return [];
  const seen = new Set(); const out = [];
  cols.forEach((c, i) => {
    const name = str(c && c.name, 40); if (!name) return;
    let hex = str(c && c.hex, 9); if (!/^#[0-9a-fA-F]{3,8}$/.test(hex)) hex = '#888888';
    let id = str(c && c.id, 40) || (name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'c' + i);
    while (seen.has(id)) id += '-' + i;
    seen.add(id); out.push({ id, name, hex });
  });
  return out;
}
function validImage(img) {
  if (img == null || img === '') return null;
  img = String(img);
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);/i.test(img)) {
    if (img.length > 5 * 1024 * 1024 * 1.37) throw { status: 413, msg: 'Imagen mayor a 5MB' };
    return img;
  }
  if (/^(https?:\/\/|\/)/.test(img)) return img.slice(0, 2000);
  throw { status: 400, msg: 'Imagen inválida' };
}
function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(i => ({ styleId: str(i.styleId, 60), typeId: str(i.typeId, 60), cutId: str(i.cutId, 100), colorId: str(i.colorId, 60) }))
    .filter(i => i.styleId && i.typeId && i.cutId && i.colorId);
}
function buildCode(b, existing) {
  const code = str(b.code != null ? b.code : existing && existing.code, 40).toUpperCase();
  if (!/^[A-Z0-9_-]{2,40}$/.test(code)) throw { status: 400, msg: 'Código inválido (A-Z, 0-9, - _)' };
  const kind = b.kind || (existing && existing.kind);
  if (kind !== 'outfit' && kind !== 'discount') throw { status: 400, msg: 'kind debe ser outfit o discount' };
  const o = { code, kind, description: str(b.description != null ? b.description : existing && existing.description, 300), percent: 0, items: [], active: b.active != null ? !!b.active : existing ? existing.active : true };
  if (kind === 'discount') {
    const p = Math.round(+(b.percent != null ? b.percent : existing && existing.percent));
    if (!(p >= 1 && p <= 90)) throw { status: 400, msg: 'El porcentaje debe estar entre 1 y 90' };
    o.percent = p;
  } else {
    o.items = cleanItems(b.items != null ? b.items : existing && existing.items);
    if (!o.items.length) throw { status: 400, msg: 'El atuendo necesita al menos una pieza' };
  }
  return o;
}
function buildProduct(b, existing) {
  const g = k => (b[k] !== undefined ? b[k] : existing && existing[k]);
  const name = str(g('name'), 80), styleId = str(g('styleId'), 60), typeId = str(g('typeId'), 60);
  const price = +g('price');
  if (!name) throw { status: 400, msg: 'Falta el nombre' };
  if (!styleId || !typeId) throw { status: 400, msg: 'Faltan estilo y tipo' };
  if (!(price >= 0) || !isFinite(price)) throw { status: 400, msg: 'Precio inválido' };
  const colors = cleanColors(g('colors'));
  if (!colors.length) throw { status: 400, msg: 'Agrega al menos un color' };
  return {
    id: existing ? existing.id : null, styleId, typeId, name, price, colors,
    image: b.image !== undefined ? validImage(b.image) : (existing ? existing.image : null),
    active: b.active !== undefined ? !!b.active : existing ? existing.active : true
  };
}

// ---------- API ----------
async function api(req, res, p) {
  const m = req.method;
  let r;
  if (m === 'GET' && p === '/api/catalog') {
    return send(res, 200, { products: db.products.filter(x => x.active), gallery: db.gallery });
  }
  if (m === 'POST' && (p === '/api/register' || p === '/api/login')) {
    const b = await readBody(req);
    const email = str(b.email, 120).toLowerCase(), password = String(b.password || '');
    if (p === '/api/register') {
      const name = str(b.name, 80);
      if (!name) return fail(res, 400, 'Falta el nombre');
      if (!emailOk(email)) return fail(res, 400, 'Correo inválido');
      if (password.length < 6) return fail(res, 400, 'La contraseña debe tener al menos 6 caracteres');
      if (db.accounts.some(a => a.email === email)) return fail(res, 409, 'Ese correo ya está registrado');
      const now = new Date().toISOString();
      const acc = { id: uid(), name, email, phone: str(b.phone, 30), passwordHash: hashPw(password), sizes: {}, createdAt: now, lastLogin: now, loginCount: 1 };
      db.accounts.push(acc);
      const token = newToken('user', acc.id); save();
      return send(res, 200, { ok: true, account: pub(acc), token });
    }
    const acc = db.accounts.find(a => a.email === email);
    if (!acc || !checkPw(password, acc.passwordHash)) return fail(res, 401, 'Correo o contraseña incorrectos');
    acc.lastLogin = new Date().toISOString(); acc.loginCount = (acc.loginCount || 0) + 1;
    const token = newToken('user', acc.id); save();
    return send(res, 200, { ok: true, account: pub(acc), token });
  }
  if (p === '/api/me') {
    const acc = authUser(req);
    if (!acc) return fail(res, 401, 'Sesión no válida');
    if (m === 'GET') return send(res, 200, pub(acc));
    if (m === 'PUT') {
      const b = await readBody(req);
      if (b.name !== undefined) { const n = str(b.name, 80); if (!n) return fail(res, 400, 'Nombre vacío'); acc.name = n; }
      if (b.phone !== undefined) acc.phone = str(b.phone, 30);
      if (b.sizes && typeof b.sizes === 'object') {
        for (const [k, v] of Object.entries(b.sizes)) {
          if (v === null || v === '') delete acc.sizes[k]; else acc.sizes[str(k, 40)] = str(v, 10);
        }
      }
      save(); return send(res, 200, pub(acc));
    }
  }
  if (m === 'GET' && (r = /^\/api\/codes\/([^/]+)$/.exec(p))) {
    const code = decodeURIComponent(r[1]).toUpperCase();
    const c = db.codes.find(x => x.code === code && x.active);
    return c ? send(res, 200, c) : fail(res, 404, 'Código no válido');
  }
  // admin
  if (m === 'POST' && p === '/api/admin/login') {
    const b = await readBody(req);
    if (b.user === ADMIN_USER && b.password === ADMIN_PASS) {
      const token = newToken('admin', 'admin'); save();
      return send(res, 200, { ok: true, token });
    }
    return fail(res, 401, 'Credenciales incorrectas');
  }
  if (p.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return fail(res, 401, 'No autorizado');
    if (m === 'GET' && p === '/api/admin/accounts') return send(res, 200, db.accounts.map(pub));
    if (p === '/api/admin/products' && m === 'GET') return send(res, 200, db.products);
    if (p === '/api/admin/products' && m === 'POST') {
      const b = await readBody(req);
      const o = buildProduct(b, null);
      let id = str(b.id, 100) || `${o.styleId}-${o.typeId}-${o.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid()}`;
      if (db.products.some(x => x.id === id)) {
        if (b.id) return fail(res, 409, 'Ya existe un producto con ese id');
        id += '-' + uid().slice(0, 4);
      }
      o.id = id; db.products.push(o); save();
      return send(res, 201, o);
    }
    if ((r = /^\/api\/admin\/products\/([^/]+)$/.exec(p))) {
      const prod = db.products.find(x => x.id === decodeURIComponent(r[1]));
      if (!prod) return fail(res, 404, 'Producto no encontrado');
      if (m === 'PUT') {
        const b = await readBody(req);
        const o = buildProduct(b, prod); Object.assign(prod, o, { id: prod.id }); save();
        return send(res, 200, prod);
      }
      if (m === 'DELETE') { prod.active = false; save(); return send(res, 200, prod); }
    }
    if (p === '/api/admin/codes' && m === 'GET') return send(res, 200, db.codes);
    if (p === '/api/admin/codes' && m === 'POST') {
      const o = buildCode(await readBody(req), null);
      if (db.codes.some(c => c.code === o.code)) return fail(res, 409, 'Ese código ya existe');
      db.codes.push(o); save(); return send(res, 201, o);
    }
    if ((r = /^\/api\/admin\/codes\/([^/]+)$/.exec(p))) {
      const cur = db.codes.find(c => c.code === decodeURIComponent(r[1]).toUpperCase());
      if (!cur) return fail(res, 404, 'Código no encontrado');
      if (m === 'PUT') {
        const b = await readBody(req);
        const o = buildCode(Object.assign({}, b, { code: cur.code }), cur);
        Object.assign(cur, o); save(); return send(res, 200, cur);
      }
      if (m === 'DELETE') { cur.active = false; save(); return send(res, 200, cur); }
    }
  }
  return fail(res, 404, 'Ruta no encontrada');
}

// ---------- static ----------
function serveStatic(req, res, p) {
  if (p === '/admin' || p === '/admin/') p = '/admin.html';
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  const rel = path.relative(ROOT, file).split(path.sep);
  if (rel[0] === 'data' || rel[0] === 'server.js' || rel[0].startsWith('.') || rel[0].startsWith('CONTRATO')) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

// Punto de entrada para Vercel (api/index.js): carga la base, responde y guarda antes de terminar.
async function handleServerless(req, res) {
  const cap = { code: 200, headers: {}, body: '' };
  const fake = { writeHead(c, h) { cap.code = c; cap.headers = h || {}; }, end(b) { cap.body = b; } };
  try {
    if (!REMOTE) return fail(res, 500, 'Falta conectar la base de datos Redis (KV_REST_API_URL / KV_REST_API_TOKEN)');
    const u = new URL(req.url, 'http://x');
    const p = decodeURIComponent(u.searchParams.get('p') || u.pathname);
    await loadDbRemote();
    await api(req, fake, p);
    await flush();
  } catch (e) {
    if (e && e.status) fail(fake, e.status, e.msg); else { console.error(e); fail(fake, 500, 'Error interno'); }
  }
  res.writeHead(cap.code, cap.headers); res.end(cap.body);
}
module.exports = { handleServerless };
if (require.main !== module) return;

loadDb();
http.createServer(async (req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (p.startsWith('/api/')) {
    try { await api(req, res, p); } catch (e) {
      if (e && e.status) return fail(res, e.status, e.msg);
      console.error(e); fail(res, 500, 'Error interno');
    }
    return;
  }
  serveStatic(req, res, p);
}).listen(PORT, () => {
  console.log('Servidor en http://localhost:' + PORT);
  console.log('Panel admin: http://localhost:' + PORT + '/admin  (usuario: ' + ADMIN_USER + ' / contraseña: ' + ADMIN_PASS + ')');
});
