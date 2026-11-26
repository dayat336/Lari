'use strict';

/* =====================================================
   ISI LAGU DI SINI
   - Taruh file lagu di folder "musik" (sejajar dengan index.html)
   - Lalu tulis nama file-nya di bawah. Boleh tambah/kurangi baris.
   ===================================================== */
const PLAYLIST = [
  { judul: 'Lagu 1', artis: 'Nama artis', src: 'musik/lagu1.mp3' },
  { judul: 'Lagu 2', artis: 'Nama artis', src: 'musik/lagu2.mp3' },
  { judul: 'Lagu 3', artis: 'Nama artis', src: 'musik/lagu3.mp3' }
];

/* ---------- pengaturan GPS ---------- */
const GPS_MAKS_AKURASI = 30;  // titik dengan akurasi lebih buruk dari ini (meter) diabaikan
const GPS_MIN_GERAK = 3;      // gerakan lebih kecil dari ini (meter) dianggap goyangan GPS
const KECEPATAN_MAKS = 12;    // m/s, di atas ini dianggap lompatan GPS (sekitar 43 km/jam)

/* ---------- mode olahraga ---------- */
const MODE = {
  lari:  { nama: 'Lari',            gps: true },
  jalan: { nama: 'Jalan',           gps: true },
  bebas: { nama: 'Olahraga bebas',  gps: false }
};

const $ = (id) => document.getElementById(id);
const RING_KELILING = 2 * Math.PI * 96;

const state = {
  mode: 'lari',
  status: 'idle',       // idle | running | paused
  jarak: 0,             // meter
  elapsedBefore: 0,     // ms yang sudah terkumpul sebelum jeda terakhir
  startedAt: 0,         // timestamp saat mulai/lanjut
  jamMulai: null,
  lastPos: null,
  rute: [],
  watchId: null,
  targetTercapai: false,
  wake: null
};

/* =====================================================
   Utilitas
   ===================================================== */
function elapsed() {
  return state.elapsedBefore + (state.status === 'running' ? Date.now() - state.startedAt : 0);
}

function fmtWaktu(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dua = (n) => String(n).padStart(2, '0');
  return h > 0 ? h + ':' + dua(m) + ':' + dua(s) : dua(m) + ':' + dua(s);
}

function fmtJarak(meter) {
  return meter >= 1000 ? (meter / 1000).toFixed(2) + ' km' : Math.round(meter) + ' m';
}

function haversine(a, b) {
  const R = 6371000;
  const rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function targetMeter() {
  const v = parseFloat($('jarakValue').value);
  if (!(v > 0)) return 0;
  return $('jarakUnit').value === 'km' ? v * 1000 : v;
}

function targetMs() {
  const v = parseFloat($('waktuValue').value);
  return v > 0 ? v * 60000 : 0;
}

function tampilBanner(teks, error) {
  const el = $('banner');
  el.textContent = teks;
  el.className = 'banner' + (error ? ' error' : '');
  el.hidden = false;
}

function sembunyiBanner() { $('banner').hidden = true; }

/* =====================================================
   Tampilan
   ===================================================== */
function render() {
  const ms = elapsed();
  const gps = MODE[state.mode].gps;
  let progres = 0;

  if (gps) {
    const km = state.jarak / 1000;
    const jam = ms / 3600000;
    const target = targetMeter();

    $('ringValue').textContent = km.toFixed(2);
    $('ringUnit').textContent = 'km';
    $('ringSub').textContent = target > 0 ? 'dari ' + fmtJarak(target) : 'tanpa target';

    $('label1').textContent = 'Waktu';
    $('label2').textContent = 'Pace /km';
    $('label3').textContent = 'Km/jam';
    $('stat1').textContent = fmtWaktu(ms);
    $('stat2').textContent = state.jarak >= 20 ? fmtWaktu(ms / km) : '--:--';
    $('stat3').textContent = jam > 0 && state.jarak >= 20 ? (km / jam).toFixed(1) : '0.0';

    progres = target > 0 ? state.jarak / target : 0;
  } else {
    const target = targetMs();

    $('ringValue').textContent = fmtWaktu(ms);
    $('ringUnit').textContent = 'durasi';
    $('ringSub').textContent = target > 0 ? 'dari ' + Math.round(target / 60000) + ' menit' : 'tanpa target';

    $('label1').textContent = 'Mulai';
    $('label2').textContent = 'Target';
    $('label3').textContent = 'Sisa';
    $('stat1').textContent = state.jamMulai
      ? state.jamMulai.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      : '--:--';
    $('stat2').textContent = target > 0 ? fmtWaktu(target) : '--';
    $('stat3').textContent = target > 0 ? fmtWaktu(Math.max(0, target - ms)) : '--';

    progres = target > 0 ? ms / target : 0;
  }

  $('ringValue').classList.toggle('long', $('ringValue').textContent.length > 5);

  progres = Math.max(0, Math.min(1, progres));
  const ring = $('ringProgress');
  ring.style.strokeDasharray = RING_KELILING;
  ring.style.strokeDashoffset = RING_KELILING * (1 - progres);

  cekTarget(progres);
}

function cekTarget(progres) {
  if (state.status !== 'running' || state.targetTercapai || progres < 1) return;
  state.targetTercapai = true;
  tampilBanner('Target tercapai! Kamu boleh lanjut atau tekan Selesai.');
  try { if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]); } catch (e) {}
}

function updateTombol() {
  const main = $('btnMain');
  const label = { idle: 'Mulai', running: 'Jeda', paused: 'Lanjut' }[state.status];
  main.textContent = label;
  main.classList.toggle('running', state.status === 'running');
  $('btnFinish').disabled = state.status === 'idle';
  document.body.classList.toggle('berjalan', state.status === 'running');

  // mode tidak boleh diganti saat olahraga berjalan
  document.querySelectorAll('.mode-btn').forEach((b) => { b.disabled = state.status !== 'idle'; });
}

function pasangMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  const gps = MODE[mode].gps;
  $('targetJarak').hidden = !gps;
  $('targetWaktu').hidden = gps;
  render();
}

/* =====================================================
   GPS
   ===================================================== */
function tampilAkurasi(akurasi) {
  const el = $('gpsStatus');
  const a = Math.round(akurasi);
  if (akurasi <= 15)      { el.textContent = 'GPS bagus (±' + a + ' m)';  el.className = 'gps good'; }
  else if (akurasi <= 30) { el.textContent = 'GPS cukup (±' + a + ' m)';  el.className = 'gps mid'; }
  else                    { el.textContent = 'GPS lemah (±' + a + ' m)';  el.className = 'gps bad'; }
}

function terimaPosisi(pos) {
  const c = pos.coords;
  tampilAkurasi(c.accuracy);

  if (state.status !== 'running') return;
  if (c.accuracy > GPS_MAKS_AKURASI) return;

  const baru = { lat: c.latitude, lon: c.longitude, t: pos.timestamp };

  if (!state.lastPos) { state.lastPos = baru; state.rute.push([baru.lat, baru.lon]); return; }

  const d = haversine(state.lastPos, baru);
  const dt = (baru.t - state.lastPos.t) / 1000;

  if (d < GPS_MIN_GERAK) return;                         // goyangan kecil, titik lama dipertahankan
  if (dt > 0 && d / dt > KECEPATAN_MAKS) {               // lompatan tidak wajar, jarak tidak ditambah
    state.lastPos = baru;
    return;
  }

  state.jarak += d;
  state.lastPos = baru;
  state.rute.push([baru.lat, baru.lon]);
  render();
}

function errorPosisi(err) {
  const el = $('gpsStatus');
  if (err.code === 1) {
    el.textContent = 'Izin lokasi ditolak';
    el.className = 'gps bad';
    tampilBanner('Izin lokasi ditolak. Aktifkan izin lokasi untuk browser ini, lalu coba lagi.', true);
  } else {
    el.textContent = 'Mencari sinyal GPS...';
    el.className = 'gps mid';
  }
}

function mulaiGPS() {
  if (!('geolocation' in navigator)) {
    tampilBanner('Browser ini tidak mendukung GPS.', true);
    return false;
  }
  if (state.watchId === null) {
    $('gpsStatus').textContent = 'Mencari sinyal GPS...';
    $('gpsStatus').className = 'gps mid';
    state.watchId = navigator.geolocation.watchPosition(terimaPosisi, errorPosisi, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000
    });
  }
  return true;
}

function hentikanGPS() {
  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
  $('gpsStatus').textContent = 'GPS mati';
  $('gpsStatus').className = 'gps';
}

/* =====================================================
   Layar tetap menyala
   ===================================================== */
async function nyalakanLayar() {
  try {
    if ('wakeLock' in navigator) state.wake = await navigator.wakeLock.request('screen');
  } catch (e) { /* tidak apa-apa kalau gagal */ }
}

function lepasLayar() {
  try { if (state.wake) state.wake.release(); } catch (e) {}
  state.wake = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.status === 'running') nyalakanLayar();
});

/* =====================================================
   Kontrol olahraga
   ===================================================== */
function mulai() {
  if (MODE[state.mode].gps && !mulaiGPS()) return;

  if (state.status === 'idle') {
    state.jarak = 0;
    state.elapsedBefore = 0;
    state.jamMulai = new Date();
    state.rute = [];
    state.targetTercapai = false;
    sembunyiBanner();
  }
  state.lastPos = null;
  state.startedAt = Date.now();
  state.status = 'running';

  nyalakanLayar();
  if ($('autoMusic').checked) putarMusik();
  updateTombol();
  render();
}

function jeda() {
  state.elapsedBefore += Date.now() - state.startedAt;
  state.status = 'paused';
  state.lastPos = null;
  updateTombol();
  render();
}

function selesai() {
  if (state.status === 'running') state.elapsedBefore += Date.now() - state.startedAt;
  const ms = state.elapsedBefore;
  const gps = MODE[state.mode].gps;

  if (ms >= 5000) {
    const hasil = { tgl: Date.now(), mode: state.mode, jarak: state.jarak, ms: ms, rute: sederhanakan(state.rute) };
    simpanRiwayat(hasil);
    tampilKartu(hasil, false);
    tampilBanner('Selesai! ' + (gps ? fmtJarak(state.jarak) + ' dalam ' : 'Olahraga selama ') + fmtWaktu(ms) + '. Gambar hasil ada di bagian bawah.');
  } else {
    sembunyiBanner();
  }

  state.status = 'idle';
  state.jarak = 0;
  state.elapsedBefore = 0;
  state.lastPos = null;
  state.jamMulai = null;
  state.rute = [];

  hentikanGPS();
  lepasLayar();
  jedaMusik();
  updateTombol();
  render();
}

$('btnMain').addEventListener('click', () => {
  if (state.status === 'running') jeda();
  else mulai();
});
$('btnFinish').addEventListener('click', selesai);

document.querySelectorAll('.mode-btn').forEach((b) => {
  b.addEventListener('click', () => { if (state.status === 'idle') pasangMode(b.dataset.mode); });
});

['jarakValue', 'jarakUnit', 'waktuValue'].forEach((id) => {
  $(id).addEventListener('input', () => { state.targetTercapai = false; render(); });
});

/* =====================================================
   Musik
   ===================================================== */
const audio = new Audio();
audio.preload = 'none';
let indeksLagu = 0;

function tampilLagu() {
  const t = PLAYLIST[indeksLagu];
  $('musicTitle').textContent = t ? t.judul : 'Belum ada lagu';
  $('musicArtist').textContent = t ? t.artis : '';
}

function pesanMusik(teks) {
  const el = $('musicMsg');
  el.textContent = teks || '';
  el.hidden = !teks;
}

function muatLagu(i) {
  if (!PLAYLIST.length) return;
  indeksLagu = (i + PLAYLIST.length) % PLAYLIST.length;
  audio.src = PLAYLIST[indeksLagu].src;
  tampilLagu();
  pesanMusik('');
}

function putarMusik() {
  if (!PLAYLIST.length) { pesanMusik('Isi dulu PLAYLIST di script.js.'); return; }
  if (!audio.getAttribute('src')) muatLagu(indeksLagu);
  audio.play().then(() => {
    $('btnPlay').innerHTML = '&#10074;&#10074;';
    $('musicCard').classList.add('playing');
  }).catch(() => {
    pesanMusik('Lagu tidak bisa diputar. Cek nama file di PLAYLIST dan pastikan file ada di folder musik.');
  });
}

function jedaMusik() {
  audio.pause();
  $('btnPlay').innerHTML = '&#9654;';
  $('musicCard').classList.remove('playing');
}

$('btnPlay').addEventListener('click', () => { audio.paused ? putarMusik() : jedaMusik(); });
$('btnNext').addEventListener('click', () => { muatLagu(indeksLagu + 1); putarMusik(); });
$('btnPrev').addEventListener('click', () => { muatLagu(indeksLagu - 1); putarMusik(); });
$('volume').addEventListener('input', (e) => { audio.volume = parseFloat(e.target.value); });
audio.volume = parseFloat($('volume').value);

audio.addEventListener('ended', () => { muatLagu(indeksLagu + 1); putarMusik(); });
audio.addEventListener('error', () => {
  const t = PLAYLIST[indeksLagu];
  if (t) pesanMusik('File "' + t.src + '" tidak ditemukan. Ganti isi PLAYLIST di script.js.');
  $('btnPlay').innerHTML = '&#9654;';
  $('musicCard').classList.remove('playing');
});

/* =====================================================
   Riwayat
   ===================================================== */
const KUNCI_RIWAYAT = 'lariTracker.riwayat';

function bacaRiwayat() {
  try { return JSON.parse(localStorage.getItem(KUNCI_RIWAYAT)) || []; }
  catch (e) { return []; }
}

function simpanRiwayat(item) {
  const daftar = bacaRiwayat();
  daftar.unshift(item);
  try { localStorage.setItem(KUNCI_RIWAYAT, JSON.stringify(daftar.slice(0, 10))); } catch (e) {}
  renderRiwayat();
}

function renderRiwayat() {
  const ul = $('historyList');
  const daftar = bacaRiwayat();
  ul.innerHTML = '';

  if (!daftar.length) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="muted">Belum ada olahraga tersimpan.</span>';
    ul.appendChild(li);
    return;
  }

  daftar.forEach((r) => {
    const li = document.createElement('li');
    const kiri = document.createElement('span');
    const kanan = document.createElement('span');
    const tgl = new Date(r.tgl).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    const nama = MODE[r.mode] ? MODE[r.mode].nama : r.mode;
    kiri.textContent = tgl + ' · ' + nama;
    kanan.textContent = (MODE[r.mode] && MODE[r.mode].gps ? fmtJarak(r.jarak) + ' · ' : '') + fmtWaktu(r.ms);
    li.appendChild(kiri);
    li.appendChild(kanan);
    li.className = 'klik';
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.addEventListener('click', () => tampilKartu(r, true));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') tampilKartu(r, true); });
    ul.appendChild(li);
  });
}

$('btnClearHistory').addEventListener('click', () => {
  try { localStorage.removeItem(KUNCI_RIWAYAT); } catch (e) {}
  renderRiwayat();
});

/* =====================================================
   Gambar hasil (untuk disimpan, dibagikan, atau diedit)
   ===================================================== */
const UKURAN = {
  story: { w: 1080, h: 1920 },
  kotak: { w: 1080, h: 1080 }
};
const FONT_KARTU = '"Fredoka", "Arial Rounded MT Bold", Arial, sans-serif';
const TINTA = '#2b2d42';
let dataKartu = null;   // sesi yang sedang ditampilkan di gambar
let fotoKartu = null;   // foto latar dari galeri

/* kurangi jumlah titik rute supaya hemat penyimpanan */
function sederhanakan(rute, maks) {
  maks = maks || 150;
  rute = rute || [];
  const bulat = (p) => [+p[0].toFixed(5), +p[1].toFixed(5)];
  if (rute.length <= maks) return rute.map(bulat);
  const langkah = (rute.length - 1) / (maks - 1);
  const hasil = [];
  for (let i = 0; i < maks; i++) hasil.push(bulat(rute[Math.round(i * langkah)]));
  return hasil;
}

function tampilKartu(item, gulir) {
  dataKartu = item;
  const gps = MODE[item.mode] ? MODE[item.mode].gps : true;
  const adaRute = gps && item.rute && item.rute.length >= 2;
  $('shareEmpty').hidden = true;
  $('shareBody').hidden = false;
  $('optRuteWrap').hidden = !adaRute;
  $('hasilBox').hidden = true;
  gambarKartu();
  if (gulir) $('shareCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function gambarRute(ctx, rute, box, tebal) {
  const lat0 = rute.reduce((a, p) => a + p[0], 0) / rute.length;
  const k = Math.cos(lat0 * Math.PI / 180);
  const pts = rute.map((p) => [p[1] * k, -p[0]]);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach((p) => {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  });
  const sw = maxX - minX, sh = maxY - minY;
  if (sw < 1e-7 && sh < 1e-7) return;   // hampir tidak bergerak

  const s = Math.min(box.w / (sw || 1e-9), box.h / (sh || 1e-9));
  const ox = box.x + (box.w - sw * s) / 2;
  const oy = box.y + (box.h - sh * s) / 2;
  const peta = (p) => [ox + (p[0] - minX) * s, oy + (p[1] - minY) * s];

  const jalur = () => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const q = peta(p);
      if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
    });
  };

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // garis tepi gelap, lalu garis warna di atasnya (gaya kartun)
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = tebal * 2.1;
  jalur(); ctx.stroke();
  ctx.strokeStyle = '#ff6b9d';
  ctx.lineWidth = tebal;
  jalur(); ctx.stroke();

  // titik awal (putih) dan akhir (kuning)
  const a = peta(pts[0]);
  const b = peta(pts[pts.length - 1]);
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = tebal * 0.55;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(a[0], a[1], tebal * 1.2, 0, Math.PI * 2); ctx.stroke(); ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath(); ctx.arc(b[0], b[1], tebal * 1.5, 0, Math.PI * 2); ctx.stroke(); ctx.fill();
  ctx.restore();
}

function latarKartun(ctx, W, H) {
  // langit
  const langit = ctx.createLinearGradient(0, 0, 0, H);
  langit.addColorStop(0, '#74c9ff');
  langit.addColorStop(0.65, '#cdeeff');
  langit.addColorStop(1, '#fff1b8');
  ctx.fillStyle = langit;
  ctx.fillRect(0, 0, W, H);

  // pola titik
  ctx.fillStyle = 'rgba(43, 45, 66, 0.07)';
  for (let y = 30; y < H; y += 60) {
    for (let x = ((y / 60) % 2) * 30 + 30; x < W; x += 60) {
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    }
  }

  // bukit hijau di bawah
  ctx.lineWidth = 9;
  ctx.strokeStyle = TINTA;
  ctx.fillStyle = '#7be495';
  ctx.beginPath(); ctx.ellipse(W * 0.22, H + 40, W * 0.62, H * 0.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5ee08a';
  ctx.beginPath(); ctx.ellipse(W * 0.85, H + 90, W * 0.6, H * 0.17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

async function gambarKartu() {
  if (!dataKartu) return;
  try { await document.fonts.load('700 100px "Fredoka"'); } catch (e) {}

  const ukuran = UKURAN[$('optUkuran').value] || UKURAN.story;
  const W = ukuran.w, H = ukuran.h;
  const story = H > W;
  const cv = $('cardCanvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const d = dataKartu;
  const gps = MODE[d.mode] ? MODE[d.mode].gps : true;
  const transparan = $('optTransparan').checked && !fotoKartu;

  /* --- latar --- */
  if (fotoKartu) {
    const r = Math.max(W / fotoKartu.width, H / fotoKartu.height);
    const w = fotoKartu.width * r, h = fotoKartu.height * r;
    ctx.drawImage(fotoKartu, (W - w) / 2, (H - h) / 2, w, h);
    const atas = ctx.createLinearGradient(0, 0, 0, H * 0.25);
    atas.addColorStop(0, 'rgba(0,0,0,0.35)');
    atas.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = atas; ctx.fillRect(0, 0, W, H);
    const bawah = ctx.createLinearGradient(0, H * 0.45, 0, H);
    bawah.addColorStop(0, 'rgba(0,0,0,0)');
    bawah.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = bawah; ctx.fillRect(0, 0, W, H);
  } else if (!transparan) {
    latarKartun(ctx, W, H);
  }

  /* --- tata letak --- */
  const L = story
    ? { headY: 130, route: { x: 150, y: 400, w: 780, h: 760 }, nilaiY: 1470, nilaiUkuran: 330, unitY: 1555, statY: 1775, tebal: 15 }
    : { headY: 110, route: { x: 150, y: 210, w: 780, h: 400 }, nilaiY: 830,  nilaiUkuran: 240, unitY: 910,  statY: 1015, tebal: 12 };

  const spasi = (px) => { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; };

  // teks kartun: garis tepi gelap tebal, lalu isi berwarna
  const teks = (str, x, y, ukr, warna, rata, jarak, maksLebar) => {
    spasi(jarak || 0);
    let u = ukr;
    ctx.font = '700 ' + u + 'px ' + FONT_KARTU;
    while (maksLebar && ctx.measureText(str).width > maksLebar && u > 20) {
      u -= 6;
      ctx.font = '700 ' + u + 'px ' + FONT_KARTU;
    }
    ctx.textAlign = rata;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(6, u * 0.16);
    ctx.strokeStyle = TINTA;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = warna;
    ctx.fillText(str, x, y);
    spasi(0);
  };

  ctx.save();
  ctx.textBaseline = 'alphabetic';

  /* --- kepala --- */
  const tgl = new Date(d.tgl);
  teks('LARI TRACKER', 80, L.headY, 46, '#ffd23f', 'left', 6);
  teks((MODE[d.mode] ? MODE[d.mode].nama : d.mode).toUpperCase(), W - 80, L.headY, 46, '#ffffff', 'right', 4);
  teks(tgl.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
       80, L.headY + 62, 40, '#ffffff', 'left', 0);

  /* --- rute --- */
  if (gps && $('optRute').checked && d.rute && d.rute.length >= 2) {
    gambarRute(ctx, d.rute, L.route, L.tebal);
  }

  /* --- angka utama --- */
  const km = d.jarak / 1000;
  const nilai = gps ? km.toFixed(2) : fmtWaktu(d.ms);
  teks(nilai, W / 2, L.nilaiY, L.nilaiUkuran, '#ffffff', 'center', 0, W - 160);
  teks(gps ? 'KILOMETER' : 'DURASI', W / 2, L.unitY, 56, '#ffd23f', 'center', 10);

  /* --- tiga angka di bawah --- */
  let kolom;
  if (gps) {
    kolom = [
      ['WAKTU', fmtWaktu(d.ms)],
      ['PACE /KM', d.jarak >= 20 ? fmtWaktu(d.ms / km) : '--:--'],
      ['KM/JAM', d.jarak >= 20 ? (km / (d.ms / 3600000)).toFixed(1) : '0.0']
    ];
  } else {
    const jam = (t) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    kolom = [
      ['MULAI', jam(d.tgl - d.ms)],
      ['SELESAI', jam(d.tgl)],
      ['MENIT', String(Math.round(d.ms / 60000))]
    ];
  }
  kolom.forEach((c, i) => {
    const x = W * (2 * i + 1) / 6;
    teks(c[0], x, L.statY - 80, 34, '#ffd23f', 'center', 3);
    teks(c[1], x, L.statY + 20, 96, '#ffffff', 'center', 0, W / 3 - 30);
  });
  ctx.restore();
}

function namaFile() {
  const t = dataKartu ? new Date(dataKartu.tgl) : new Date();
  return 'lari-' + t.toISOString().slice(0, 10) + '.png';
}

function simpanGambar() {
  const cv = $('cardCanvas');
  cv.toBlob((blob) => {
    if (!blob) { tampilBanner('Gambar gagal dibuat.', true); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = namaFile();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    // cadangan kalau browser tidak mau mengunduh: gambar bisa ditekan lama
    $('hasilImg').src = cv.toDataURL('image/png');
    $('hasilBox').hidden = false;
  }, 'image/png');
}

function bagikanGambar() {
  $('cardCanvas').toBlob(async (blob) => {
    if (!blob) return;
    try {
      const file = new File([blob], namaFile(), { type: 'image/png' });
      await navigator.share({ files: [file], title: 'Hasil olahraga' });
    } catch (e) { /* dibatalkan */ }
  }, 'image/png');
}

$('fotoInput').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    fotoKartu = img;
    $('btnHapusFoto').hidden = false;
    $('optTransparan').disabled = true;
    gambarKartu();
  };
  img.onerror = () => tampilBanner('Foto tidak bisa dibuka. Coba foto lain.', true);
  img.src = URL.createObjectURL(f);
  e.target.value = '';
});

$('btnHapusFoto').addEventListener('click', () => {
  fotoKartu = null;
  $('btnHapusFoto').hidden = true;
  $('optTransparan').disabled = false;
  gambarKartu();
});

['optUkuran', 'optRute', 'optTransparan'].forEach((id) => {
  $(id).addEventListener('change', () => { $('hasilBox').hidden = true; gambarKartu(); });
});

$('btnSimpan').addEventListener('click', simpanGambar);
$('btnBagikan').addEventListener('click', bagikanGambar);

try {
  const uji = new File([], 'a.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [uji] })) $('btnBagikan').hidden = false;
} catch (e) { /* tidak didukung */ }

/* =====================================================
   Mulai aplikasi
   ===================================================== */
tampilLagu();
renderRiwayat();
{ const awal = bacaRiwayat(); if (awal.length) tampilKartu(awal[0], false); }
pasangMode('lari');
updateTombol();
setInterval(render, 1000);
