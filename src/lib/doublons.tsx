'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Abandon, ErreurApi } from './api';
import { date } from './format';
import { Etat, Modale } from '../components/ui';

// Doublons probables et opérations répétées : l'API prévient (409 « DOUBLON » ou « REPETITION ») au lieu
// de refuser. L'utilisateur voit les fiches semblables et choisit d'enregistrer quand même ou de renoncer.

export interface Candidat {
  id: string | null;
  type: 'enseignant' | 'eleve' | 'matiere' | 'classe' | 'ligne';
  libelle: string;
  detail: string | null;
  force: 'FORTE' | 'FAIBLE';
  lien: string | null;
  creeLe: string | null;
  ligne: number | null;
}

interface Avertissement {
  code: 'DOUBLON' | 'REPETITION';
  titre: string;
  message: string;
  candidats: Candidat[];
}

const nouvelleCle = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Identifiant d'un formulaire : le même tant qu'il n'a pas abouti. Un second envoi (double clic, réseau
 * lent qui fait recommencer) est reconnu par l'API et n'enregistre rien de plus.
 */
export function useCleEnvoi() {
  const ref = useRef(nouvelleCle());
  return { cle: () => ref.current, renouveler: () => void (ref.current = nouvelleCle()) };
}

let demander: ((a: Avertissement) => Promise<boolean>) | null = null;

function avertissement(e: unknown): Avertissement | null {
  if (!(e instanceof ErreurApi) || e.statut !== 409) return null;
  const d = e.details as Partial<Avertissement> | undefined;
  if (d?.code !== 'DOUBLON' && d?.code !== 'REPETITION') return null;
  return { code: d.code, titre: d.titre ?? 'Vérification', message: e.message, candidats: d.candidats ?? [] };
}

/**
 * Envoie en demandant à l'API de signaler les doublons ; si elle en signale, demande confirmation et
 * renvoie avec « confirme ». Renoncer lève Abandon, que les écrans n'affichent pas.
 */
export async function envoyer<T>(appel: (entetes: Record<string, string>) => Promise<T>, cle: string = nouvelleCle()): Promise<T> {
  try {
    return await appel({ 'X-Doublons': 'verifier', 'X-Envoi': cle });
  } catch (e) {
    const a = avertissement(e);
    if (!a) throw e;
    if (!demander || !(await demander(a))) throw new Abandon();
    return appel({ 'X-Doublons': 'confirme', 'X-Envoi': cle });
  }
}

export const estAbandon = (e: unknown): boolean => e instanceof Abandon;

const OBJETS: Record<Candidat['type'], string> = {
  enseignant: "S'il s'agit de la même personne, ouvrez son compte plutôt que d'en créer un second.",
  eleve: "S'il s'agit du même élève, ouvrez sa fiche plutôt que d'en créer une seconde.",
  matiere: "S'il s'agit de la même matière, modifiez celle qui existe.",
  classe: "Une classe de plus au même niveau et dans la même spécialité renommera les classes en A, B…",
  ligne: 'Deux lignes de cet envoi se ressemblent.',
};

function depuis(iso: string | null) {
  if (!iso) return null;
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "créé à l'instant";
  if (minutes < 60) return `créé il y a ${minutes} min`;
  return `créé le ${date(iso)}`;
}

/** À placer une fois dans l'application : la fenêtre qui pose la question. */
export function ConfirmationDoublons() {
  const [etat, setEtat] = useState<{ a: Avertissement; repondre: (oui: boolean) => void } | null>(null);
  useEffect(() => {
    demander = (a) =>
      new Promise<boolean>((resoudre) =>
        setEtat({
          a,
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
  const { a, repondre } = etat;
  const conseils = [...new Set(a.candidats.map((c) => OBJETS[c.type]))];
  return (
    <Modale
      titre={a.titre}
      ouverte
      fermer={() => repondre(false)}
      pied={
        <>
          <button type="button" className="bouton-secondaire" onClick={() => repondre(false)}>
            Annuler
          </button>
          <button type="button" className="bouton-primaire" onClick={() => repondre(true)}>
            {a.code === 'REPETITION' ? 'Recommencer' : 'Enregistrer quand même'}
          </button>
        </>
      }
    >
      {a.code === 'REPETITION' ? (
        <p className="text-sm">{a.message}</p>
      ) : (
        <div className="space-y-3">
          {conseils.map((c) => (
            <p key={c} className="text-sm text-encre-2">
              {c}
            </p>
          ))}
          <ul className="space-y-2">
            {a.candidats.map((c, i) => (
              <li key={`${c.id ?? c.libelle}-${c.ligne ?? ''}-${i}`} className="rounded border border-bord px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {c.ligne != null && <span className="text-xs font-semibold text-encre-2">Ligne {c.ligne}</span>}
                  <span className="font-medium">{c.libelle}</span>
                  {c.force === 'FORTE' ? <Etat ton="alerte">Très probablement la même</Etat> : <Etat ton="neutre">Nom proche</Etat>}
                </div>
                {(c.detail || c.creeLe) && (
                  <div className="mt-0.5 text-xs text-encre-2">{[c.detail, depuis(c.creeLe)].filter(Boolean).join(' · ')}</div>
                )}
                {c.lien && (
                  <a href={c.lien} target="_blank" rel="noreferrer" className="lien mt-1 inline-flex items-center gap-1 text-xs">
                    Ouvrir dans un nouvel onglet <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modale>
  );
}
