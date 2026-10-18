'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { Patienter } from './ui';

// L'application ne s'affiche que dans le navigateur : la session (jeton) et l'année choisie sont
// gardées dans le stockage du navigateur, et toutes les données viennent de l'API.
const Application = dynamic(() => import('./Application').then((m) => m.Application), {
  ssr: false,
  loading: () => <Patienter texte="Ouverture…" />,
});

export function Racine({ children }: { children: ReactNode }) {
  return <Application>{children}</Application>;
}
