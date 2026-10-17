import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/public-sans/700.css';
import '../styles.css';
import { Racine } from '../components/Racine';

export const metadata: Metadata = {
  title: 'CETIC de Mezesse · Gestion scolaire',
  icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = { themeColor: '#cfe5f5' };

// Thème clair par défaut ; le sombre seulement si l'utilisateur l'a choisi. Appliqué avant l'affichage
// pour éviter un éclair de la mauvaise couleur.
const THEME = "try{if(localStorage.getItem('cetic-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}";

export default function MiseEnPage({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body>
        <Racine>{children}</Racine>
      </body>
    </html>
  );
}
