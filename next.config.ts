import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Adresse de l'API. NEXT_PUBLIC_API_URL est le nom Next.js ; VITE_API_URL (ancien site) reste lu,
  // pour que la variable déjà définie sur Vercel continue de servir.
  env: {
    CETIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? process.env.VITE_API_URL ?? 'http://localhost:4000/api',
  },
};

export default config;
