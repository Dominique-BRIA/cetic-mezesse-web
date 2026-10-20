// État global : utilisateur connecté, année scolaire consultée, thème.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErreurApi, quandSessionExpire, session } from './api';
import type { Annee, Role, Utilisateur } from './types';

// Attentes entre les essais d'ouverture de la session : le serveur peut mettre une demi-minute à se réveiller.
const ATTENTES = [0, 3_000, 8_000, 15_000];

interface Contexte {
  utilisateur: Utilisateur | null;
  chargement: boolean;
  // Session gardée, mais serveur injoignable après plusieurs essais.
  injoignable: boolean;
  reessayer: () => void;
  connecter: (jeton: string, u: Utilisateur, persistant?: boolean) => void;
  deconnecter: () => void;
  rafraichirProfil: () => Promise<void>;
  majProfil: (u: Utilisateur) => void;
  a: (...roles: Role[]) => boolean;
  annees: Annee[];
  annee: Annee | null;
  choisirAnnee: (id: string) => void;
  theme: 'light' | 'dark';
  basculerTheme: () => void;
}

const Ctx = createContext<Contexte | null>(null);

export function FournisseurApp({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [chargement, setChargement] = useState(Boolean(session.jeton()));
  const [anneeId, setAnneeId] = useState<string | null>(session.annee());
  const [theme, setTheme] = useState<'light' | 'dark'>(
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );

  const [injoignable, setInjoignable] = useState(false);
  const [essai, setEssai] = useState(0);

  const deconnecter = useCallback(() => {
    session.definirJeton(null);
    setUtilisateur(null);
    setInjoignable(false);
    client.clear();
  }, [client]);

  useEffect(() => {
    quandSessionExpire(() => {
      setUtilisateur(null);
      client.clear();
    });
  }, [client]);

  // Reprise de la session gardée. Seul un refus du serveur (401) déconnecte : un serveur qui ne
  // répond pas (réveil d'Azure, réseau coupé) est réessayé, et la session reste gardée.
  useEffect(() => {
    if (!session.jeton()) return;
    let annule = false;
    async function ouvrir() {
      setInjoignable(false);
      setChargement(true);
      for (const attente of ATTENTES) {
        if (attente) await new Promise((r) => setTimeout(r, attente));
        if (annule || !session.jeton()) return;
        try {
          const u = await api<Utilisateur>('/auth/moi', { annee: false });
          if (!annule) setUtilisateur(u);
          return;
        } catch (e) {
          // Session refusée : api() a effacé le jeton, l'écran de connexion s'affiche.
          if (e instanceof ErreurApi && e.statut === 401) return;
        }
      }
      if (!annule) setInjoignable(true);
    }
    ouvrir().finally(() => {
      if (!annule) setChargement(false);
    });
    return () => {
      annule = true;
    };
  }, [essai]);

  const anneesQ = useQuery({
    queryKey: ['annees'],
    queryFn: () => api<Annee[]>('/annees', { annee: false }),
    enabled: Boolean(utilisateur),
  });
  const annees = useMemo(() => anneesQ.data ?? [], [anneesQ.data]);
  const annee = annees.find((a) => a.id === anneeId) ?? annees.find((a) => a.active) ?? annees[0] ?? null;

  // L'année mémorisée a pu disparaître : on retombe sur l'année active.
  useEffect(() => {
    if (annee && annee.id !== session.annee()) session.definirAnnee(annee.id);
  }, [annee]);

  const valeur: Contexte = {
    utilisateur,
    chargement,
    injoignable,
    reessayer: () => setEssai((n) => n + 1),
    connecter: (jeton, u, persistant = true) => {
      session.definirJeton(jeton, persistant);
      client.clear();
      setUtilisateur(u);
    },
    deconnecter,
    rafraichirProfil: async () => setUtilisateur(await api<Utilisateur>('/auth/moi', { annee: false })),
    majProfil: setUtilisateur,
    a: (...roles) => Boolean(utilisateur && roles.includes(utilisateur.role)),
    annees,
    annee,
    choisirAnnee: (id) => {
      session.definirAnnee(id);
      setAnneeId(id);
      client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'annees' });
    },
    theme,
    basculerTheme: () => {
      const t = theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = t;
      try {
        localStorage.setItem('cetic-theme', t);
      } catch {
        // préférence non mémorisée
      }
      setTheme(t);
    },
  };
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp hors du fournisseur');
  return c;
}
