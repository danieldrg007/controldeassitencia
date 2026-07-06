import { FileText, Image as ImageIcon, FileSpreadsheet, File as FileIcon, Trash2, Download, Pencil } from 'lucide-react';
import { getPrioridad, getCategoria } from '../config/avisos';
import { fileKind, humanSize } from '../utils/announcements';

const ATTACH_ICON = { pdf: FileText, image: ImageIcon, excel: FileSpreadsheet, word: FileText, file: FileIcon };

const fmtDate = (iso) => iso
  ? new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '';

const scopeText = (a) => a.scopeLabel || (a.scope?.type === 'all' ? 'Todo el colegio' : a.scope?.value || '');

// Tarjeta visual de un aviso. Se usa en Announcements (admin), ParentDashboard y
// TeacherDashboard. `onDelete` muestra el botón de borrar; `onImageClick` abre la
// portada/imagen en grande (lightbox); `unread` resalta avisos no leídos.
export default function AnnouncementCard({ a, onDelete, onEdit, onImageClick, unread = false }) {
  const pr = getPrioridad(a.priority);
  const cat = getCategoria(a.category);
  const PrIcon = pr.icon;
  const CatIcon = cat.icon;
  const isUrgent = a.priority === 'urgente';
  const atts = a.attachments || [];

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: 'hidden',
        borderLeft: `5px solid ${isUrgent ? pr.color : cat.color}`,
        ...(isUrgent ? { boxShadow: '0 0 0 1px #FECACA', background: '#FFFBFB' } : {}),
        ...(unread ? { outline: '2px solid var(--accent, #C2A14E)', outlineOffset: 0 } : {}),
      }}
    >
      {a.coverUrl && (
        <div
          className={`aviso-cover ${onImageClick ? 'zoom' : ''}`}
          onClick={() => onImageClick?.(a.coverUrl)}
        >
          <div className="aviso-cover-bg" style={{ backgroundImage: `url("${a.coverUrl}")` }} />
          <img src={a.coverUrl} alt="" className="aviso-cover-img" loading="lazy" />
        </div>
      )}
      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: cat.color, background: `${cat.color}1A` }}>
            <CatIcon size={13} /> {cat.label}
          </span>
          {a.priority && a.priority !== 'normal' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: '#fff', background: pr.color }}>
              <PrIcon size={13} /> {pr.label}
            </span>
          )}
          {unread && (
            <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '3px 8px', borderRadius: 999, color: '#fff', background: 'var(--accent, #C2A14E)' }}>NUEVO</span>
          )}
          <span className="badge badge-info" style={{ marginLeft: 'auto' }}>{scopeText(a)}</span>
        </div>

        <h3 style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: 6, color: 'var(--text-main, var(--guinda))', fontFamily: 'var(--font-display, inherit)', letterSpacing: '-0.02em', lineHeight: 1.25 }}>{a.title}</h3>
        <p style={{ fontSize: '0.92rem', color: 'var(--gris-700)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{a.body}</p>

        {atts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {atts.map((f, i) => {
              const Icon = ATTACH_ICON[fileKind(f.type, f.name)] || FileIcon;
              return (
                <a
                  key={i}
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--gris-200)', borderRadius: 10, textDecoration: 'none', color: 'var(--gris-700)', background: 'var(--surface-hover, #F6EFDD)', maxWidth: '100%' }}
                >
                  <Icon size={18} style={{ flexShrink: 0, color: 'var(--guinda)' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem', fontWeight: 600, maxWidth: 180 }}>{f.name}</span>
                  {f.size ? <span style={{ fontSize: '0.72rem', color: 'var(--gris-500)' }}>{humanSize(f.size)}</span> : null}
                  <Download size={14} style={{ flexShrink: 0, color: 'var(--gris-500)' }} />
                </a>
              );
            })}
          </div>
        )}

        <div className="flex justify-between items-center" style={{ marginTop: 12, gap: 8 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--gris-500)' }}>
            {a.authorName} · {fmtDate(a.createdAt)}{a.updatedAt ? ' · editado' : ''}
          </span>
          {(onDelete || onEdit) && (
            <span style={{ display: 'inline-flex', gap: 6 }}>
              {onEdit && <button onClick={() => onEdit(a)} className="btn btn-sm btn-secondary" title="Editar aviso"><Pencil size={14} /></button>}
              {onDelete && <button onClick={() => onDelete(a)} className="btn btn-sm btn-danger" title="Eliminar aviso"><Trash2 size={14} /></button>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
