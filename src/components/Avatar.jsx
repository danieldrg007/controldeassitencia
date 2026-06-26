// Avatar circular reutilizable: muestra la foto si existe, o la inicial del nombre.
export default function Avatar({ src, name, size = 56, onClick }) {
  const style = { width: size, height: size, borderRadius: '50%', cursor: onClick ? 'pointer' : 'default', flexShrink: 0 };
  if (src) return <img src={src} alt={name || ''} onClick={onClick} style={{ ...style, objectFit: 'cover', border: '2px solid var(--gris-200)' }} />;
  return (
    <div onClick={onClick} style={{ ...style, background: 'var(--guinda)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.4 }}>
      {(name || '?').trim().charAt(0).toUpperCase()}
    </div>
  );
}
