// Arquitectura de pagos del módulo de talleres.
//
// HOY: el pago se registra manualmente (efectivo/transferencia en caja) y
// administración lo marca como pagado en /workshops.
//
// FUTURO (Mercado Pago — recomendado en México: tarjetas, SPEI, OXXO):
//   1. Crear cuenta en mercadopago.com.mx y obtener credenciales (public key +
//      access token) → guardarlas como secrets de Cloud Functions.
//   2. Cloud Function HTTPS `createWorkshopPreference`: recibe enrollmentId,
//      crea una "preference" con el SDK de Mercado Pago y devuelve init_point.
//   3. El cliente llama a esa función (ver startOnlinePayment) y redirige al
//      checkout de Mercado Pago.
//   4. Cloud Function `mercadoPagoWebhook` (notification_url): al confirmarse
//      el pago actualiza el enrollment → paymentStatus 'paid', paidAt, method.
//   5. Poner VITE_PAYMENTS_ENABLED=true para mostrar el botón "Pagar en línea".

export const PAYMENTS_ENABLED = import.meta.env.VITE_PAYMENTS_ENABLED === 'true';

export const PAYMENT_METHODS = {
  efectivo: 'Efectivo (en caja)',
  transferencia: 'Transferencia bancaria',
  mercadopago: 'Pago en línea (Mercado Pago)',
};

export const PAYMENT_STATUS = {
  pending: { label: 'Pago pendiente', badge: 'badge-warning' },
  paid:    { label: 'Pagado',         badge: 'badge-success' },
};

export const fmtMoney = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

// Punto de entrada del pago en línea. Invoca la Cloud Function para
// obtener el init_point de Mercado Pago y redirige al usuario.
export async function startOnlinePayment(enrollment) {
  if (!PAYMENTS_ENABLED) {
    throw new Error('El pago en línea estará disponible próximamente. Por ahora paga en caja o por transferencia.');
  }

  try {
    const createPreference = httpsCallable(functions, 'createWorkshopPreference');
    const { data } = await createPreference({ enrollmentId: enrollment.id });
    
    if (data && data.init_point) {
      window.location.href = data.init_point;
    } else {
      throw new Error('No se recibió la url de cobro desde el servidor.');
    }
  } catch (err) {
    console.error('Error in startOnlinePayment:', err);
    throw new Error(err.message || 'Error al iniciar el pago en línea.', { cause: err });
  }
}
