import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, RefreshCw, MessageCircle, Check } from 'lucide-react';
import { APP_VERSION, fetchLatestVersion, forceUpdate } from '../utils/version';

// Campanita de notificaciones de la barra: centraliza el aviso de nueva versión
// y los mensajes de chat sin leer en un panel desplegable (no invasivo).
export default function NotificationBell({ unread = 0, hasChat = false }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const checking = useRef(false);
  const ref = useRef(null);

  const check = async () => {
    if (checking.current || APP_VERSION === 'dev') return;
    checking.current = true;
    try {
      const latest = await fetchLatestVersion();
      if (latest && latest !== APP_VERSION) setUpdateAvailable(true);
    } finally { checking.current = false; }
  };

  useEffect(() => {
    const t = setTimeout(check, 4000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    const iv = setInterval(check, 5 * 60 * 1000);
    return () => { clearTimeout(t); clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // Cerrar al tocar fuera del panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const chatCount = hasChat && unread > 0 ? unread : 0;
  const total = (updateAvailable ? 1 : 0) + chatCount;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} className="btn btn-icon" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', position: 'relative' }} title="Notificaciones" aria-label="Notificaciones">
        <Bell size={18} />
        {total > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 999, background: 'var(--danger)', color: '#fff', fontSize: '0.62rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '2px solid var(--brand-dark)' }}>
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 10px)', width: 300, maxWidth: '88vw', background: '#fff', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--surface-border)', zIndex: 200, overflow: 'hidden', color: 'var(--text-main)', animation: 'slideDown 0.18s ease' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--surface-border)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={16} color="var(--guinda)" /> Notificaciones
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {total === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Check size={30} style={{ margin: '0 auto 8px', color: 'var(--success)' }} />
                <p style={{ fontSize: '0.85rem' }}>Estás al día</p>
              </div>
            ) : (
              <>
                {updateAvailable && (
                  <div style={{ padding: '14px', borderBottom: '1px solid var(--surface-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem' }}>
                      <RefreshCw size={16} color="var(--guinda)" /> Nueva versión disponible
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '6px 0 10px' }}>Actualiza para ver los cambios más recientes.</p>
                    <button onClick={async () => { setBusy(true); await forceUpdate(); }} disabled={busy} className="btn btn-primary btn-sm w-full">
                      {busy ? 'Actualizando…' : 'Actualizar ahora'}
                    </button>
                  </div>
                )}
                {chatCount > 0 && (
                  <button onClick={() => { setOpen(false); navigate('/messages'); }} style={{ width: '100%', textAlign: 'left', border: 0, background: 'transparent', cursor: 'pointer', padding: '14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--info-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <MessageCircle size={17} color="var(--info)" />
                    </span>
                    <span style={{ fontSize: '0.86rem' }}><strong>{chatCount}</strong> mensaje{chatCount > 1 ? 's' : ''} sin leer</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
