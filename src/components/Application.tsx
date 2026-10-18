'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { FournisseurApp, useApp } from '../lib/contexte';
import { Connexion } from '../ecrans/Connexion';
import { MotDePasse } from '../ecrans/MotDePasse';
import { Cadre } from './Cadre';
import { Patienter } from './ui';

export function Application({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        // Une page déjà vue se rouvre aussitôt avec ses données, gardées 30 minutes, puis se met à jour en
        // arrière-plan si elles ont plus de 30 secondes. Données reprises au retour sur l'onglet ; le bouton
        // « Actualiser » de chaque page force le rechargement.
        defaultOptions: { queries: { staleTime: 30_000, gcTime: 30 * 60_000, retry: 1, refetchOnWindowFocus: true } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <FournisseurApp>
        <Portail>{children}</Portail>
        <Toaster position="bottom-right" toastOptions={{ className: 'font-sans text-sm' }} richColors closeButton />
      </FournisseurApp>
    </QueryClientProvider>
  );
}

// Sans session : l'écran de connexion, quelle que soit l'adresse ; mot de passe à changer d'abord si demandé.
function Portail({ children }: { children: ReactNode }) {
  const { utilisateur, chargement } = useApp();
  if (chargement) return <Patienter texte="Ouverture de la session…" />;
  if (!utilisateur) return <Connexion />;
  if (utilisateur.doitChangerMotDePasse) return <MotDePasse obligatoire />;
  return <Cadre>{children}</Cadre>;
}
