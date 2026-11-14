'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Modale } from '../components/ui';

// Questions « Êtes-vous sûr ? » dans une fenêtre de l'application, au lieu de la boîte du navigateur
// (« localhost:5173 dit… »), qui ressemble à un message d'erreur et ne se met pas en forme.

export interface Question {
  /** Ce qu'on s'apprête à faire, en quelques mots (« Enseignant absent »). */
  titre: string;
  /** La conséquence, en une ou deux phrases. */
  message: ReactNode;
  /** Remarque secondaire, en plus petit (« L'appel sera d'abord enregistré… »). */
  note?: ReactNode;
  /** Libellé du bouton qui confirme (« Marquer absent ») ; « Confirmer » par défaut. */
  action?: string;
  /** Action destructrice (suppression, effacement) : bouton rouge. */
  danger?: boolean;
}

let demander: ((q: Question) => Promise<boolean>) | null = null;

/** Pose la question et attend la réponse : true si l'utilisateur confirme. */
export function confirmer(q: Question): Promise<boolean> {
  if (demander) return demander(q);
  // Fenêtre pas encore montée (ne devrait pas arriver) : la boîte du navigateur, faute de mieux.
  return Promise.resolve(window.confirm(`${q.titre}\n\n${typeof q.message === 'string' ? q.message : ''}`));
}

/** À placer une fois dans l'application. */
export function Confirmation() {
  const [etat, setEtat] = useState<{ q: Question; repondre: (oui: boolean) => void } | null>(null);
  useEffect(() => {
    demander = (q) =>
      new Promise<boolean>((resoudre) =>
        setEtat({
          q,
          repondre: (oui) => {
            setEtat(null);
            resoudre(oui);
          },
        }),
      );
    return () => {
      demander = null;
    };
  }, []);
  if (!etat) return null;
  const { q, repondre } = etat;
  return (
    <Modale
      titre={q.titre}
      ouverte
      fermer={() => repondre(false)}
      pied={
        <>
          <button type="button" className="bouton-secondaire" onClick={() => repondre(false)}>
            Annuler
          </button>
          <button type="button" className={q.danger ? 'bouton-danger' : 'bouton-primaire'} onClick={() => repondre(true)} autoFocus>
            {q.action ?? 'Confirmer'}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <div className="text-sm leading-relaxed">{q.message}</div>
        {q.note && <p className="text-sm text-encre-2">{q.note}</p>}
      </div>
    </Modale>
  );
}
