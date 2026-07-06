/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#9B243E', // Vino base
          dark:    '#872434', // Vino fuerte
          light:   '#B5384F', // Vino claro (hovers)
        },
        accent: {
          DEFAULT: '#C2A14E', // Dorado antiguo
          hover:   '#A9863C',
        },
        surface: {
          DEFAULT: '#FFFAEC', // Beige institucional (fondo)
          card:    '#FFFFFF', // Blanco
          border:  '#ECE3D0', // Borde beige cálido
          hover:   '#F6EFDD', // Beige hover
        },
        text: {
          main:  '#872434', // Vino fuerte (textos primarios)
          light: '#9B243E', // Vino base
          muted: '#8C6A70', // Vino apagado (textos secundarios)
        },
        // Estados (semánticos, se mantienen)
        success: { DEFAULT: '#16A34A', bg: '#DCFCE7' },
        danger:  { DEFAULT: '#DC2626', bg: '#FEE2E2' },
        warning: { DEFAULT: '#F59E0B', bg: '#FEF3C7' },
        info:    { DEFAULT: '#2563EB', bg: '#DBEAFE' },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['Sora', 'Inter', '-apple-system', 'sans-serif'],
      },
      borderRadius: { sm: '12px', md: '16px', lg: '22px', xl: '28px' },
      boxShadow: {
        sm: '0 1px 2px rgba(135,36,52,0.05)',
        md: '0 2px 4px rgba(135,36,52,0.05), 0 6px 16px -4px rgba(135,36,52,0.10)',
        lg: '0 4px 8px rgba(135,36,52,0.06), 0 14px 32px -8px rgba(135,36,52,0.14)',
        xl: '0 8px 16px rgba(135,36,52,0.08), 0 28px 56px -12px rgba(135,36,52,0.18)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { '0%': { opacity: '0', transform: 'translateY(-8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease',
        'slide-up': 'slideUp 0.4s ease',
        'slide-down': 'slideDown 0.2s ease',
      },
    },
  },
  plugins: [],
};
