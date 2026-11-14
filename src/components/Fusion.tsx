'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeftRight, Loader2, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useCleEnvoi } from '../lib/doublons';
import type { Enseignant, Inscription } from '../lib/types';
import { Chargement, Erreur, Modale } from './ui';

// Fusion de deux fiches en double : la fiche gardée reprend tout ce qui était rattaché à l'autre, et,
// pour chaque information qui diffère, la valeur choisie. Le Proviseur peut défaire la fusion en
// désapprouvant la décision.

export type TypeFusion = 'enseignants' | 'eleves';

interface Fiche {
  id: string;
  libelle: string;
  detail: string;
}

interface ChampFusion {
  cle: string;
  libelle: string;
  garde: string;
  autre: string;
  parDefaut: 'garde' | 'autre';
}

interface Apercu {
  garde: Fiche;
  autre: Fiche;
  differences: ChampFusion[];
  avertissements: string[];
  deplacements?: { libelle: string; nombre: number }[];
  annees?: { annee: string; classeGarde: string | null; classeAutre: string; notesAutre: number; conflits: number; sort: string }[];
  conflits?: number;
  possible?: boolean;
}

export function FusionModale({ type, a, b, fermer }: { type: TypeFusion; a: string; b: string; fermer: () => void }) {
  const [ids, setIds] = useState<[string, string]>([a, b]);
  return <Contenu key={ids.join(':')} type={type} ids={ids} inverser={() => setIds([ids[1], ids[0]])} fermer={fermer} />;
}

function Contenu({ type, ids, inverser, fermer }: { type: TypeFusion; ids: [string, string]; inverser: () => void; fermer: () => void }) {
  const client = useQueryClient();
  const cle = useCleEnvoi();
  const q = useQuery({ queryKey: ['fusion', type, ...ids], queryFn: () => api<Apercu>(`/fusions/${type}?garde=${ids[0]}&autre=${ids[1]}`) });
  const [choix, setChoix] = useState<Record<string, 'garde' | 'autre'>>({});
  const [notes, setNotes] = useState<'garde' | 'autre'>('garde');
  const envoi = useMutation({
    mutationFn: () =>
      api<{ message: string }>(`/fusions/${type}`, {
        methode: 'POST',
        corps: { garde: ids[0], autre: ids[1], choix, ...(type === 'eleves' ? { notes } : {}) },
        entetes: { 'X-Envoi': cle.cle() },
      }),
    onSuccess: (r) => {
      toast.success(r.message);
      for (const k of ['enseignants', 'eleves', 'eleve', 'verifications', 'matieres', 'classes']) client.invalidateQueries({ queryKey: [k] });
      fermer();
    },
  });
  const ap = q.data;
  const possible = ap ? ap.possible !== false : false;
  const valeur = (c: ChampFusion) => choix[c.cle] ?? c.parDefaut;

  return (
    <Modale
      titre={type === 'enseignants' ? 'Fusionner deux comptes' : 'Fusionner deux fiches d’élève'}
      ouverte
      large
      fermer={fermer}
      pied={
        <>
          <button type="button" className="bouton-secondaire" onClick={fermer}>
            Annuler
          </button>
          <button type="button" className="bouton-primaire" disabled={!possible || envoi.isPending} onClick={() => envoi.mutate()}>
            {envoi.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Fusionner
          </button>
        </>
      }
    >
      {q.isLoading ? (
        <Chargement lignes={4} />
      ) : q.error ? (
        <Erreur erreur={q.error} />
      ) : ap ? (
        <div className="space-y-4">
          {envoi.error ? <Erreur erreur={envoi.error} /> : null}
          <div className="grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr]">
            <Cote titre="Fiche gardée" fiche={ap.garde} ton="primaire" />
            <button type="button" className="bouton-discret self-center" onClick={inverser} title="Garder plutôt l'autre fiche">
              <ArrowLeftRight className="h-4 w-4" />
              <span className="sm:hidden">Inverser</span>
            </button>
            <Cote titre="Fiche absorbée" fiche={ap.autre} ton="neutre" />
          </div>

          {ap.differences.length > 0 ? (
            <div>
              <h3 className="mb-1.5 text-sm font-semibold">Informations à garder</h3>
              <div className="overflow-x-auto">
                <table className="tableau">
                  <thead>
                    <tr>
                      <th>Information</th>
                      <th>Fiche gardée</th>
                      <th>Fiche absorbée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ap.differences.map((c) => (
                      <tr key={c.cle}>
                        <td className="text-encre-2">{c.libelle}</td>
                        {(['garde', 'autre'] as const).map((cote) => (
                          <td key={cote}>
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`choix-${c.cle}`}
                                checked={valeur(c) === cote}
                                onChange={() => setChoix({ ...choix, [c.cle]: cote })}
                              />
                              <span className={valeur(c) === cote ? 'font-medium' : 'text-encre-2'}>{c[cote]}</span>
                            </label>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-encre-2">Les deux fiches portent les mêmes informations.</p>
          )}

          {ap.deplacements && (
            <div>
              <h3 className="mb-1.5 text-sm font-semibold">Repris par la fiche gardée</h3>
              {ap.deplacements.length ? (
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {ap.deplacements.map((d) => (
                    <li key={d.libelle}>
                      {d.nombre} {d.libelle}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-encre-2">Rien n'est rattaché à la fiche absorbée.</p>
              )}
            </div>
          )}

          {ap.annees && ap.annees.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-sm font-semibold">Inscriptions de la fiche absorbée</h3>
              <ul className="space-y-0.5 text-sm">
                {ap.annees.map((x) => (
                  <li key={x.annee}>
                    <span className="tabular-nums">{x.annee}</span> · {x.classeAutre}, {x.notesAutre} note(s) :{' '}
                    {x.sort === 'déplacée'
                      ? 'reprise telle quelle'
                      : x.sort === 'réunie'
                        ? `réunie avec l'inscription de la fiche gardée${x.conflits ? `, ${x.conflits} note(s) en double` : ''}`
                        : <span className="font-medium text-danger">classes différentes, fusion impossible</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(ap.conflits ?? 0) > 0 && (
            <div>
              <h3 className="mb-1.5 text-sm font-semibold">Notes en double (même matière, même séquence)</h3>
              <div className="flex flex-wrap gap-4 text-sm">
                {(['garde', 'autre'] as const).map((cote) => (
                  <label key={cote} className="flex items-center gap-2">
                    <input type="radio" name="notes" checked={notes === cote} onChange={() => setNotes(cote)} />
                    Garder celles de la fiche {cote === 'garde' ? 'gardée' : 'absorbée'}
                  </label>
                ))}
              </div>
            </div>
          )}

          <ul className="space-y-1.5">
            {ap.avertissements.map((m) => (
              <li key={m} className="flex items-start gap-2 rounded border border-alerte/30 bg-alerte/5 px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alerte" />
                {m}
              </li>
            ))}
            <li className="px-1 text-xs text-encre-3">
              La fiche absorbée n'est pas effacée. Si la fusion était une erreur, le Directeur peut la défaire en désapprouvant la décision.
            </li>
          </ul>
        </div>
      ) : null}
    </Modale>
  );
}

function Cote({ titre, fiche, ton }: { titre: string; fiche: Fiche; ton: 'primaire' | 'neutre' }) {
  return (
    <div className={`rounded border px-3 py-2.5 ${ton === 'primaire' ? 'border-primaire/40 bg-primaire/5' : 'border-bord bg-surface-2'}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-encre-2">{titre}</div>
      <div className="font-medium">{fiche.libelle}</div>
      {fiche.detail && <div className="text-xs text-encre-2">{fiche.detail}</div>}
    </div>
  );
}

/** Choix du second compte d'enseignant, depuis la liste des comptes. */
export function ChoixAutreEnseignant({ moi, comptes, choisir, fermer }: { moi: Enseignant; comptes: Enseignant[]; choisir: (id: string) => void; fermer: () => void }) {
  const [id, setId] = useState('');
  const autres = comptes.filter((c) => c.id !== moi.id && !c.fusionneDansId);
  return (
    <Modale
      titre={`Fusionner ${moi.prenom} ${moi.nom} avec…`}
      ouverte
      fermer={fermer}
      pied={
        <>
          <button type="button" className="bouton-secondaire" onClick={fermer}>
            Annuler
          </button>
          <button type="button" className="bouton-primaire" disabled={!id} onClick={() => choisir(id)}>
            Continuer
          </button>
        </>
      }
    >
      <label className="block text-sm">
        <span className="mb-1 block text-encre-2">L'autre compte de la même personne</span>
        <select className="champ" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Choisir…</option>
          {autres.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom} {c.prenom}
              {c.discipline ? ` · ${c.discipline}` : ''}
              {c.actif ? '' : ' (désactivé)'}
            </option>
          ))}
        </select>
      </label>
    </Modale>
  );
}

/** Choix de la seconde fiche d'élève, par une recherche sur le nom. */
export function ChoixAutreEleve({ moi, libelle, choisir, fermer }: { moi: string; libelle: string; choisir: (id: string) => void; fermer: () => void }) {
  const [recherche, setRecherche] = useState(libelle.split(' ')[0] ?? '');
  const q = useQuery({
    queryKey: ['eleves', 'fusion', recherche],
    queryFn: () => api<Inscription[]>(`/eleves?statut=TOUS&q=${encodeURIComponent(recherche)}`),
    enabled: recherche.trim().length >= 2,
  });
  const resultats = (q.data ?? []).filter((i) => i.eleveId !== moi);
  return (
    <Modale titre={`Fusionner ${libelle} avec…`} ouverte fermer={fermer}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-encre-3" />
        <input className="champ pl-9" autoFocus placeholder="Nom de l'autre fiche" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      </div>
      <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto">
        {q.isFetching && !q.data ? (
          <Chargement lignes={3} />
        ) : resultats.length ? (
          resultats.map((i) => (
            <li key={i.id}>
              <button type="button" className="w-full rounded px-3 py-2 text-left hover:bg-surface-2" onClick={() => choisir(i.eleveId)}>
                <div className="font-medium">
                  {i.eleve.nom} {i.eleve.prenoms}
                </div>
                <div className="text-xs text-encre-2">
                  {i.eleve.matricule} · {i.classe.nom}
                </div>
              </button>
            </li>
          ))
        ) : (
          <li className="px-3 py-2 text-sm text-encre-3">{recherche.trim().length < 2 ? 'Tapez au moins deux lettres.' : 'Aucune autre fiche trouvée.'}</li>
        )}
      </ul>
    </Modale>
  );
}
