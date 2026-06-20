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
      },
      borderRadius: { sm: '8px', md: '12px', lg: '16px', xl: '24px' },
      boxShadow: {
        sm: '0 1px 2px rgba(135,36,52,0.06)',
        md: '0 4px 6px -1px rgba(135,36,52,0.10), 0 2px 4px -2px rgba(135,36,52,0.08)',
        lg: '0 10px 15px -3px rgba(135,36,52,0.12), 0 4px 6px -4px rgba(135,36,52,0.10)',
        xl: '0 20px 25px -5px rgba(135,36,52,0.14), 0 8px 10px -6px rgba(135,36,52,0.10)',
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
