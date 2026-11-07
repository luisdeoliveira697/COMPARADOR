// Actualiza rates.json con la tasa oficial BCV (dólar y euro) y el dólar Binance P2P.
// Lo ejecuta GitHub Actions varias veces al día (ver .github/workflows/tasas.yml).
// Usa varias fuentes de respaldo; si una tasa no se consigue, conserva la anterior.
import fs from 'node:fs';
import https from 'node:https';

const RATES = 'rates.json', HIST = 'rates-history.json';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const todayCcs = () => new Date().toLocaleDateString('en-CA', {timeZone: 'America/Caracas'});
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const num = s => { if (typeof s === 'number') return s; s = String(s).trim(); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return isFinite(n) ? n : NaN; };
const median = a => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const round2 = n => Math.round(n * 100) / 100;
const log = (...a) => console.log('[tasas]', ...a);

// El sitio del BCV suele tener problemas con su certificado SSL, por eso esta petición no lo valida.
function getInsecure(url) {
  return new Promise((res, rej) => {
    const req = https.get(url, {rejectUnauthorized: false, headers: {'User-Agent': UA}, timeout: 30000}, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(getInsecure(new URL(r.headers.location, url).href));
      let d = ''; r.setEncoding('utf8'); r.on('data', c => d += c); r.on('end', () => r.statusCode === 200 ? res(d) : rej(new Error('HTTP ' + r.statusCode)));
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', rej);
  });
}
function getPlain(url) {
  return new Promise((res, rej) => {
    import('node:http').then(({default: http}) => {
      const req = http.get(url, {headers: {'User-Agent': UA}, timeout: 30000}, r => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { const next = new URL(r.headers.location, url).href; return res(next.startsWith('https') ? getInsecure(next) : getPlain(next)); }
        let d = ''; r.setEncoding('utf8'); r.on('data', c => d += c); r.on('end', () => r.statusCode === 200 ? res(d) : rej(new Error('HTTP ' + r.statusCode)));
      });
      req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', rej);
    }, rej);
  });
}
async function getJSON(url, opts = {}) {
  const r = await fetch(url, {...opts, headers: {'User-Agent': UA, 'accept': 'application/json', ...(opts.headers || {})}, signal: AbortSignal.timeout(30000)});
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// ---------- BCV ----------
export function parseBCV(html) {
  const pick = (id, code) => {
    let m = html.match(new RegExp(`id=["']${id}["'][\\s\\S]{0,1500}?<strong[^>]*>\\s*([\\d.,]+)\\s*</strong>`, 'i'));
    if (!m) m = html.match(new RegExp(`>\\s*${code}\\s*<[\\s\\S]{0,600}?<strong[^>]*>\\s*([\\d.,]+)\\s*</strong>`, 'i'));
    return m ? num(m[1]) : NaN;
  };
  const usd = pick('dolar', 'USD'), eur = pick('euro', 'EUR');
  const fm = html.match(/Fecha Valor:[\s\S]{0,300}?content="(\d{4}-\d{2}-\d{2})/i) || html.match(/date-display-single[^>]*content="(\d{4}-\d{2}-\d{2})/);
  const ft = html.match(/Fecha Valor:[\s\S]{0,300}?>\s*([^<]{6,60}?)\s*</i);
  return {usd, eur, valueDate: fm ? fm[1] : null, valueText: ft ? ft[1].replace(/\s+/g, ' ').trim() : ''};
}
async function bcvOfficial() {
  for (const url of ['https://www.bcv.org.ve/', 'https://bcv.org.ve/', 'http://www.bcv.org.ve/']) {
    try {
      const html = await (url.startsWith('http:') ? getPlain(url) : getInsecure(url));
      const r = parseBCV(html);
      if (r.usd > 0 && r.eur > 0) return {...r, source: 'bcv.org.ve', official: true};
      const title = (html.match(/<title[^>]*>([^<]*)/i) || [])[1] || '';
      log(`BCV (${url}): página recibida pero sin tasas (${html.length} caracteres, título: "${title.trim().slice(0, 80)}")`);
    } catch (e) { log(`BCV (${url}) falló:`, e.message); }
  }
  try {
    const [d, e] = await Promise.all([getJSON('https://ve.dolarapi.com/v1/dolares/oficial'), getJSON('https://ve.dolarapi.com/v1/euros/oficial')]);
    const usd = num(d.promedio ?? d.venta), eur = num(e.promedio ?? e.venta);
    if (usd > 0 && eur > 0) return {usd, eur, valueDate: null, valueText: '', source: 've.dolarapi.com', official: false};
  } catch (e) { log('dolarapi oficial falló:', e.message); }
  return null;
}

// ---------- Binance P2P ----------
async function binanceSide(tradeType) {
  const j = await getJSON('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
    method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({fiat: 'VES', asset: 'USDT', tradeType, page: 1, rows: 20, payTypes: [], publisherType: null, transAmount: ''})
  });
  const prices = (j.data || []).map(x => num(x.adv?.price)).filter(n => n > 0).slice(0, 15);
  if (prices.length < 3) throw new Error('pocos anuncios');
  return median(prices);
}
async function binance() {
  try {
    const [buy, sell] = await Promise.allSettled([binanceSide('BUY'), binanceSide('SELL')]);
    const v = [buy, sell].filter(x => x.status === 'fulfilled').map(x => x.value);
    if (v.length) return {value: round2(v.reduce((a, b) => a + b, 0) / v.length), source: 'Binance P2P (mediana de anuncios USDT/VES)'};
    log('Binance directo falló:', buy.reason?.message, sell.reason?.message);
  } catch (e) { log('Binance directo falló:', e.message); }
  try {
    const j = await getJSON('https://criptoya.com/api/binancep2p/USDT/VES/1');
    const v = [num(j.ask), num(j.bid)].filter(n => n > 0);
    if (v.length) return {value: round2(v.reduce((a, b) => a + b, 0) / v.length), source: 'CriptoYa (Binance P2P)'};
  } catch (e) { log('CriptoYa falló:', e.message); }
  try {
    const d = await getJSON('https://ve.dolarapi.com/v1/dolares/paralelo');
    const v = num(d.promedio ?? d.venta);
    if (v > 0) return {value: v, source: 've.dolarapi.com paralelo (respaldo, no es Binance exacto)'};
  } catch (e) { log('dolarapi paralelo falló:', e.message); }
  return null;
}

// ---------- principal ----------
const sane = (nv, ov) => nv > 0 && (!(ov > 0) || Math.abs(nv / ov - 1) < 0.35);
async function main() {
  const prev = readJSON(RATES, {});
  const today = todayCcs();
  const out = {...prev};
  const sources = [];

  // Si quedó guardada una tasa BCV "del próximo día hábil" y ya llegó su fecha, se activa.
  if (prev.bcvNext && prev.bcvNext.valueDate <= today) {
    Object.assign(out, {bcvUsd: prev.bcvNext.usd, bcvEur: prev.bcvNext.eur, bcvFechaValor: prev.bcvNext.valueText || prev.bcvNext.valueDate});
    delete out.bcvNext;
  }
  const b = await bcvOfficial();
  const dow = new Date(today + 'T12:00:00Z').getUTCDay(); // 0 domingo, 6 sábado
  const weekend = dow === 0 || dow === 6;
  let bcvOk = false;
  if (b && sane(b.usd, out.bcvUsd) && sane(b.eur, out.bcvEur)) {
    if (b.official) {
      // El BCV publica en la tarde la tasa del día hábil siguiente. Si su fecha valor es futura y hoy es día hábil,
      // se guarda para activarla ese día. En fin de semana, la tasa publicada el viernes ya rige.
      if (b.valueDate && b.valueDate > today && !weekend && out.bcvUsd > 0 && out.bcvSource === 'bcv.org.ve') {
        out.bcvNext = {usd: b.usd, eur: b.eur, valueDate: b.valueDate, valueText: b.valueText};
        log(`BCV publicó la tasa del ${b.valueDate}: se usará ese día`);
      } else {
        out.bcvUsd = b.usd; out.bcvEur = b.eur; out.bcvFechaValor = b.valueText || b.valueDate || today; out.bcvSource = 'bcv.org.ve'; delete out.bcvNext;
      }
      bcvOk = true; sources.push('BCV: bcv.org.ve');
    } else if (!(out.bcvUsd > 0) || out.date < today || out.bcvSource !== 'bcv.org.ve') {
      // Respaldo: solo si no hay una tasa oficial ya verificada para hoy.
      out.bcvUsd = b.usd; out.bcvEur = b.eur; out.bcvFechaValor = 'según ' + b.source; out.bcvSource = b.source;
      bcvOk = true; sources.push('BCV: ' + b.source + ' (respaldo)');
    } else sources.push('BCV: se conserva la tasa oficial ya verificada (la página del BCV no respondió)');
  } else sources.push('BCV: sin cambios (no se pudo verificar)');

  const bn = await binance();
  if (bn && sane(bn.value, out.binance)) {
    bn.value = round2(bn.value); out.binance = bn.value; out.binanceAt = new Date().toISOString(); sources.push('Binance: ' + bn.source); }
  else sources.push('Binance: sin cambios (no se pudo verificar)');

  const updated = bcvOk || (bn && !sources[1].includes('sin cambios'));
  out.lastCheck = new Date().toISOString();
  if (updated) { out.date = today; out.updatedAt = out.lastCheck; }
  out.by = 'auto'; out.sources = sources.join(' · ');
  if (!updated) log('ADVERTENCIA: no se pudo verificar ninguna tasa; se conservan las anteriores.');
  fs.writeFileSync(RATES, JSON.stringify(out, null, 2) + '\n');

  const hist = readJSON(HIST, {days: {}});
  hist.days[today] = {bcvUsd: out.bcvUsd, bcvEur: out.bcvEur, binance: out.binance};
  const keys = Object.keys(hist.days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete hist.days[k];
  fs.writeFileSync(HIST, JSON.stringify(hist) + '\n');
  log(`BCV $ ${out.bcvUsd} · BCV € ${out.bcvEur} · Binance ${out.binance} · ${out.sources}`);
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main().catch(e => { console.error(e); process.exit(1); });
