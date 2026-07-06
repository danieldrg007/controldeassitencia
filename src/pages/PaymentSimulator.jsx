import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { CreditCard, ShieldCheck, CheckCircle2, ArrowLeft, Lock } from 'lucide-react';
import { fmtMoney } from '../utils/payments';

const STEPS = { FORM: 'form', PROCESSING: 'processing', SUCCESS: 'success', ERROR: 'error' };

// Formatea el número de tarjeta en grupos de 4
const fmtCard = (v) => v.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim().slice(0, 19);
const fmtExp = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  if (d.length >= 3) return d.slice(0, 2) + '/' + d.slice(2);
  return d;
};

export default function PaymentSimulator() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const enrollmentId = params.get('eid');
  const workshopName = decodeURIComponent(params.get('name') || 'Taller');
  const studentName = decodeURIComponent(params.get('student') || '');
  const amount = Number(params.get('amount')) || 0;

  const [step, setStep] = useState(STEPS.FORM);
  const [card, setCard] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [holder, setHolder] = useState('');
  const [method, setMethod] = useState('card'); // card | oxxo | transfer
  const [error, setError] = useState('');

  // Validación mínima del formulario
  const cardValid = card.replace(/\s/g, '').length === 16;
  const expiryValid = /^\d{2}\/\d{2}$/.test(expiry);
  const cvvValid = cvv.length >= 3;
  const holderValid = holder.trim().length >= 3;
  const formValid = method !== 'card' || (cardValid && expiryValid && cvvValid && holderValid);

  const handlePay = async (e) => {
    e.preventDefault();
    if (!formValid) return;
    setStep(STEPS.PROCESSING);

    // Simular tiempo de procesamiento realista (2-3 seg)
    await new Promise(r => setTimeout(r, 2500));

    try {
      if (!enrollmentId) throw new Error('Falta referencia de inscripción.');
      const ref = doc(db, 'workshopEnrollments', enrollmentId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Inscripción no encontrada.');

      await updateDoc(ref, {
        paymentStatus: 'paid',
        paymentMethod: method === 'card' ? 'mercadopago (simulado - tarjeta)' : method === 'oxxo' ? 'mercadopago (simulado - OXXO)' : 'mercadopago (simulado - transferencia)',
        paidAt: new Date().toISOString(),
        paidRegisteredBy: 'Simulador Mercado Pago',
      });

      setStep(STEPS.SUCCESS);
    } catch (err) {
      setError(err.message);
      setStep(STEPS.ERROR);
    }
  };

  // Auto-redirect después de éxito
  useEffect(() => {
    if (step === STEPS.SUCCESS) {
      const t = setTimeout(() => navigate('/workshops'), 4000);
      return () => clearTimeout(t);
    }
  }, [step, navigate]);

  const mpBlue = '#009ee3';
  const mpDark = '#00689f';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #eff6ff 0%, #e0f0ff 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Header tipo Mercado Pago */}
      <div style={{
        width: '100%', background: mpBlue, padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CreditCard size={20} color="#fff" />
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '1rem', letterSpacing: -0.3 }}>Mercado Pago</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.72rem' }}>Checkout seguro · Simulador</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.9)', fontSize: '0.78rem' }}>
          <Lock size={13} /> Conexión segura
        </div>
      </div>

      {/* Contenido principal */}
      <div style={{
        width: '100%', maxWidth: 480, padding: '24px 16px', flex: 1,
      }}>
        {/* Resumen de compra */}
        <div style={{
          background: '#fff', borderRadius: 12, padding: '18px 20px', marginBottom: 16,
          boxShadow: '0 1px 6px rgba(0,0,0,0.08)', border: '1px solid #e8eef3',
        }}>
          <div style={{ fontSize: '0.78rem', color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Resumen de compra</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#333' }}>{workshopName}</div>
              {studentName && <div style={{ fontSize: '0.82rem', color: '#888', marginTop: 2 }}>Alumno: {studentName}</div>}
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: mpDark, whiteSpace: 'nowrap' }}>{fmtMoney(amount)}</div>
          </div>
        </div>

        {/* ──── FORMULARIO ──── */}
        {step === STEPS.FORM && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '22px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.08)', border: '1px solid #e8eef3' }}>
            {/* Tabs método de pago */}
            <div style={{ fontSize: '0.78rem', color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>¿Cómo quieres pagar?</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[
                { id: 'card', label: '💳 Tarjeta' },
                { id: 'oxxo', label: '🏪 OXXO' },
                { id: 'transfer', label: '🏦 Transferencia' },
              ].map(m => (
                <button key={m.id} type="button" onClick={() => setMethod(m.id)}
                  style={{
                    flex: 1, padding: '10px 6px', border: method === m.id ? `2px solid ${mpBlue}` : '2px solid #e0e6ec',
                    borderRadius: 8, background: method === m.id ? '#f0f8ff' : '#fafbfc', cursor: 'pointer',
                    fontWeight: 600, fontSize: '0.82rem', color: method === m.id ? mpDark : '#777',
                    transition: 'all 0.2s ease',
                  }}
                >{m.label}</button>
              ))}
            </div>

            <form onSubmit={handlePay}>
              {method === 'card' && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Número de tarjeta</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text" placeholder="1234 5678 9012 3456" value={card}
                        onChange={e => setCard(fmtCard(e.target.value))}
                        style={{ ...inputStyle, paddingRight: 90 }} required
                      />
                      <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4 }}>
                        <img src="https://img.icons8.com/color/28/visa.png" alt="visa" style={{ height: 20 }} />
                        <img src="https://img.icons8.com/color/28/mastercard-logo.png" alt="mc" style={{ height: 20 }} />
                        <img src="https://img.icons8.com/color/28/amex.png" alt="amex" style={{ height: 20 }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div>
                      <label style={labelStyle}>Vencimiento</label>
                      <input type="text" placeholder="MM/AA" value={expiry} onChange={e => setExpiry(fmtExp(e.target.value))} style={inputStyle} required />
                    </div>
                    <div>
                      <label style={labelStyle}>CVV</label>
                      <input type="password" placeholder="•••" maxLength={4} value={cvv} onChange={e => setCvv(e.target.value.replace(/\D/g, ''))} style={inputStyle} required />
                    </div>
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={labelStyle}>Titular de la tarjeta</label>
                    <input type="text" placeholder="Como aparece en la tarjeta" value={holder} onChange={e => setHolder(e.target.value)} style={inputStyle} required />
                  </div>
                </>
              )}

              {method === 'oxxo' && (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: '#555', marginBottom: 16 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🏪</div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 6 }}>Pago en OXXO</p>
                  <p style={{ fontSize: '0.82rem', color: '#888' }}>Se generará una referencia de pago para presentar en cualquier tienda OXXO. <strong>(Simulación)</strong></p>
                </div>
              )}

              {method === 'transfer' && (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: '#555', marginBottom: 16 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🏦</div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 6 }}>Transferencia bancaria (SPEI)</p>
                  <p style={{ fontSize: '0.82rem', color: '#888' }}>Se generará una CLABE interbancaria para realizar tu transferencia. <strong>(Simulación)</strong></p>
                </div>
              )}

              <button type="submit" disabled={!formValid} style={{
                width: '100%', padding: '14px 20px', border: 'none', borderRadius: 8,
                background: formValid ? mpBlue : '#ccc', color: '#fff', fontWeight: 700, fontSize: '1rem',
                cursor: formValid ? 'pointer' : 'not-allowed', transition: 'background 0.2s',
                boxShadow: formValid ? '0 4px 14px rgba(0,158,227,0.35)' : 'none',
              }}>
                Pagar {fmtMoney(amount)}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, color: '#aaa', fontSize: '0.75rem' }}>
                <ShieldCheck size={14} /> Tus datos están protegidos con encriptación SSL
              </div>
            </form>
          </div>
        )}

        {/* ──── PROCESANDO ──── */}
        {step === STEPS.PROCESSING && (
          <div style={{
            background: '#fff', borderRadius: 12, padding: '48px 24px', textAlign: 'center',
            boxShadow: '0 1px 6px rgba(0,0,0,0.08)', border: '1px solid #e8eef3',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', border: `4px solid #e0e6ec`, borderTopColor: mpBlue,
              animation: 'spin 0.8s linear infinite', margin: '0 auto 24px',
            }} />
            <p style={{ fontWeight: 700, fontSize: '1.05rem', color: '#333', marginBottom: 6 }}>Procesando tu pago...</p>
            <p style={{ color: '#888', fontSize: '0.85rem' }}>Estamos verificando tu información. No cierres esta ventana.</p>
          </div>
        )}

        {/* ──── ÉXITO ──── */}
        {step === STEPS.SUCCESS && (
          <div style={{
            background: '#fff', borderRadius: 12, padding: '40px 24px', textAlign: 'center',
            boxShadow: '0 1px 6px rgba(0,0,0,0.08)', border: '1px solid #d4edda',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', background: '#d4edda',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
              animation: 'slideUp 0.5s ease',
            }}>
              <CheckCircle2 size={38} color="#28a745" />
            </div>
            <p style={{ fontWeight: 800, fontSize: '1.2rem', color: '#28a745', marginBottom: 6 }}>¡Pago aprobado!</p>
            <p style={{ color: '#555', fontSize: '0.9rem', marginBottom: 4 }}>{workshopName}</p>
            {studentName && <p style={{ color: '#888', fontSize: '0.82rem', marginBottom: 4 }}>Alumno: {studentName}</p>}
            <p style={{ fontWeight: 700, fontSize: '1.1rem', color: '#333', marginBottom: 20 }}>Monto: {fmtMoney(amount)}</p>
            <div style={{ background: '#f0f9f0', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: '0.82rem', color: '#2d6a2d' }}>
              Operación #{enrollmentId?.slice(-8).toUpperCase()} · {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
            <button onClick={() => navigate('/workshops')} style={{
              width: '100%', padding: '12px 20px', border: 'none', borderRadius: 8,
              background: '#28a745', color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
            }}>
              <ArrowLeft size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Volver a Talleres
            </button>
            <p style={{ color: '#bbb', fontSize: '0.72rem', marginTop: 12 }}>Serás redirigido automáticamente en unos segundos...</p>
          </div>
        )}

        {/* ──── ERROR ──── */}
        {step === STEPS.ERROR && (
          <div style={{
            background: '#fff', borderRadius: 12, padding: '40px 24px', textAlign: 'center',
            boxShadow: '0 1px 6px rgba(0,0,0,0.08)', border: '1px solid #f5c6cb',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', background: '#f8d7da',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
              fontSize: 36,
            }}>❌</div>
            <p style={{ fontWeight: 800, fontSize: '1.1rem', color: '#c0392b', marginBottom: 8 }}>Pago rechazado</p>
            <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: 20 }}>{error || 'Hubo un problema al procesar tu pago. Intenta de nuevo.'}</p>
            <button onClick={() => setStep(STEPS.FORM)} style={{
              padding: '12px 32px', border: 'none', borderRadius: 8,
              background: mpBlue, color: '#fff', fontWeight: 700, cursor: 'pointer', marginRight: 8,
            }}>Reintentar</button>
            <button onClick={() => navigate('/workshops')} style={{
              padding: '12px 32px', border: '2px solid #ddd', borderRadius: 8,
              background: '#fff', color: '#666', fontWeight: 600, cursor: 'pointer',
            }}>Cancelar</button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '16px 24px', textAlign: 'center', fontSize: '0.72rem', color: '#aaa' }}>
        <p>🔒 Ambiente de simulación · Colegio Oliverio Cromwell</p>
        <p style={{ marginTop: 4 }}>Cuando se active Mercado Pago real, este simulador se reemplazará automáticamente.</p>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#555', marginBottom: 5,
};
const inputStyle = {
  width: '100%', padding: '11px 14px', border: '1.5px solid #dde2e8', borderRadius: 8,
  fontSize: '0.95rem', outline: 'none', transition: 'border-color 0.2s',
  boxSizing: 'border-box', fontFamily: "'Inter', monospace",
};
