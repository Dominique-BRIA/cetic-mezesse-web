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
  const { utilisateur, chargement, injoignable } = useApp();
  if (chargement) return <Patienter texte="Ouverture de la session…" />;
  if (injoignable) return <ServeurInjoignable />;
  if (!utilisateur) return <Connexion />;
  if (utilisateur.doitChangerMotDePasse) return <MotDePasse obligatoire />;
  return <Cadre>{children}</Cadre>;
}

// Serveur injoignable à l'ouverture : la session reste gardée, on n'affiche pas l'écran de connexion.
function ServeurInjoignable() {
  const { reessayer, deconnecter } = useApp();
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="max-w-sm text-center" role="alert">
        <p className="text-sm font-semibold text-encre">Le serveur ne répond pas</p>
        <p className="mt-1 text-sm text-encre-2">
          Votre session est gardée : inutile de vous reconnecter. Vérifiez la connexion Internet, puis réessayez.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" className="bouton-primaire" onClick={reessayer}>
            Réessayer
          </button>
          <button type="button" className="bouton-discret" onClick={deconnecter}>
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
