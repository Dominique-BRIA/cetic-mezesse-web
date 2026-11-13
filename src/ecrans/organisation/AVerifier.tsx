import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, BookX, Check, ChevronDown, Copy, GitMerge, Pencil, RotateCcw, UserRoundX } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/contexte';
import { Carte, Chargement, Erreur, Etat, Page, Vide } from '../../components/ui';
import { FusionModale, type TypeFusion } from '../../components/Fusion';

interface Point {
  cle: string;
  gravite: 'FORTE' | 'FAIBLE';
  titre: string;
  detail: string;
  action: { type: 'ouvrir' | 'fusionner-enseignants' | 'fusionner-eleves'; lien: string | null; a: string | null; b: string | null };
  ignore: boolean;
}

interface Categorie {
  code: string;
  titre: string;
  explication: string;
  points: Point[];
}

interface Rapport {
  categories: Categorie[];
  total: number;
  ignores: number;
}

type Ton = 'danger' | 'alerte' | 'info';

/** Rangement de chaque catégorie : section, couleur selon l'urgence, colonnes du tableau. Les textes viennent de l'API. */
const CATEGORIES: Record<string, { theme: string; ton: Ton; colonnes?: string[] }> = {
  'matieres-sans-enseignant': { theme: 'notes', ton: 'danger', colonnes: ['Classe', 'Matière', 'Détail'] },
  'matieres-enseignant-desactive': { theme: 'notes', ton: 'danger', colonnes: ['Classe', 'Matière', 'Détail'] },
  'classes-sans-pp': { theme: 'notes', ton: 'alerte', colonnes: ['Classe', 'Détail'] },
  'enseignants-doublons': { theme: 'doublons', ton: 'alerte' },
  'eleves-doublons': { theme: 'doublons', ton: 'alerte' },
  'matieres-doublons': { theme: 'doublons', ton: 'alerte', colonnes: ['Classe', 'Matières', 'Détail'] },
  'eleves-naissance': { theme: 'fiches', ton: 'info', colonnes: ['Classe', 'Élève', 'Détail'] },
  'eleves-sans-parent': { theme: 'fiches', ton: 'info', colonnes: ['Classe', 'Élève', 'Détail'] },
};

const THEMES = [
  { code: 'notes', titre: 'Saisie des notes et bulletins', icone: BookX },
  { code: 'doublons', titre: 'Doublons', icone: Copy },
  { code: 'fiches', titre: "Fiches d'élèves", icone: UserRoundX },
];

// Bandeau de titre plein, texte blanc (texte foncé en thème sombre, où ces couleurs deviennent claires).
const TONS: Record<Ton, { bandeau: string; texte: string; teinte: string }> = {
  danger: { bandeau: 'bg-danger text-white dark:text-[rgb(12_24_38)]', texte: 'text-danger', teinte: 'bg-danger/10 text-danger hover:bg-danger/20' },
  alerte: { bandeau: 'bg-alerte text-white dark:text-[rgb(12_24_38)]', texte: 'text-alerte', teinte: 'bg-alerte/10 text-alerte hover:bg-alerte/20' },
  info: { bandeau: 'bg-primaire text-white dark:text-[rgb(12_24_38)]', texte: 'text-primaire', teinte: 'bg-primaire/10 text-primaire hover:bg-primaire/20' },
};

const rangement = (c: Categorie) => CATEGORIES[c.code] ?? { theme: 'fiches', ton: 'info' as Ton };

/** « Français (4e année Électricité) » → nom et classe. */
function separer(titre: string): { nom: string; classe: string | null } {
  const m = /^(.*) \(([^()]+)\)$/.exec(titre);
  return m ? { nom: m[1], classe: m[2] } : { nom: titre, classe: null };
}

const LIGNES_VISIBLES = 5;

/** Ce qui mérite un coup d'œil de la direction : doublons probables, matières sans enseignant, fiches incomplètes. */
export default function AVerifier() {
  const { a, annee } = useApp();
  const client = useQueryClient();
  const [avecIgnores, setAvecIgnores] = useState(false);
  const [filtre, setFiltre] = useState<string | null>(null);
  const [fusion, setFusion] = useState<{ type: TypeFusion; a: string; b: string } | null>(null);
  const q = useQuery({ queryKey: ['verifications', annee?.id, avecIgnores], queryFn: () => api<Rapport>(`/verifications?ignores=${avecIgnores}`) });
  const marquer = useMutation({
    mutationFn: (p: Point) =>
      p.ignore
        ? api(`/verifications/ignorees?cle=${encodeURIComponent(p.cle)}`, { methode: 'DELETE' })
        : api('/verifications/ignorees', { methode: 'POST', corps: { cle: p.cle, libelle: p.titre } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['verifications'] }),
    onError: (e) => toast.error(e.message),
  });
  const sg = a('SURVEILLANT_GENERAL');
  const r = q.data;
  const actifs = (c: Categorie) => c.points.filter((p) => !p.ignore).length;

  const actions = (p: Point): ReactNode => (
    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
      {p.action.type === 'ouvrir' && p.action.lien && (
        <Link href={p.action.lien} className="bouton-secondaire" title="Ouvrir la page où corriger">
          <Pencil className="h-4 w-4" /> Corriger
        </Link>
      )}
      {((p.action.type === 'fusionner-enseignants' && sg) || p.action.type === 'fusionner-eleves') && p.action.a && p.action.b && (
        <button
          type="button"
          className="bouton-secondaire"
          onClick={() => setFusion({ type: p.action.type === 'fusionner-enseignants' ? 'enseignants' : 'eleves', a: p.action.a!, b: p.action.b! })}
        >
          <GitMerge className="h-4 w-4" /> Fusionner
        </button>
      )}
      <button type="button" className="bouton-discret" disabled={marquer.isPending} onClick={() => marquer.mutate(p)}>
        {p.ignore ? (
          <>
            <RotateCcw className="h-4 w-4" /> Signaler de nouveau
          </>
        ) : (
          <>
            <Check className="h-4 w-4" /> C'est normal
          </>
        )}
      </button>
    </div>
  );

  // Même ordre que les sections : les urgences d'abord.
  const rang = (c: Categorie) => THEMES.findIndex((t) => t.code === rangement(c).theme) * 100 + Object.keys(CATEGORIES).indexOf(c.code);
  const categories = [...(r?.categories ?? [])].sort((x, y) => rang(x) - rang(y));
  const visibles = categories.filter((c) => !filtre || c.code === filtre);

  return (
    <Page
      titre="À vérifier"
      description="Ce qui mérite un coup d'œil, sans rien bloquer. Corrigez depuis la page concernée, ou marquez « C'est normal » pour ne plus le voir."
      actions={
        r && r.ignores > 0 ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={avecIgnores} onChange={(e) => setAvecIgnores(e.target.checked)} />
            Afficher les {r.ignores} point(s) jugés normaux
          </label>
        ) : null
      }
    >
      {q.isLoading ? (
        <Chargement />
      ) : q.error ? (
        <Erreur erreur={q.error} />
      ) : !r?.categories.length ? (
        <Carte>
          <Vide titre="Rien à vérifier">Aucun doublon probable, aucune matière sans enseignant, aucune fiche incomplète.</Vide>
        </Carte>
      ) : (
        <>
          {/* Résumé : un bouton par catégorie, qui sert aussi de filtre. */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFiltre(null)}
              className={clsx('rounded-full border px-3 py-1 text-sm font-semibold', !filtre ? 'border-encre bg-encre text-surface' : 'border-bord bg-surface text-encre-2')}
            >
              Tout · {categories.reduce((n, c) => n + actifs(c), 0)}
            </button>
            {categories.map((c) => {
              const ton = TONS[rangement(c).ton];
              const choisi = filtre === c.code;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setFiltre(choisi ? null : c.code)}
                  className={clsx('rounded-full px-3 py-1 text-sm font-semibold', choisi ? ton.bandeau : ton.teinte)}
                >
                  {c.titre} · {actifs(c)}
                </button>
              );
            })}
          </div>

          {THEMES.map((t) => {
            const cats = visibles.filter((c) => rangement(c).theme === t.code);
            if (!cats.length) return null;
            return (
              <section key={t.code} className="space-y-3">
                <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-encre-2">
                  <t.icone className="h-4 w-4" /> {t.titre}
                </h2>
                {cats.map((c) => (
                  <BlocCategorie key={c.code} categorie={c} actions={actions} />
                ))}
              </section>
            );
          })}
        </>
      )}
      {fusion && <FusionModale type={fusion.type} a={fusion.a} b={fusion.b} fermer={() => setFusion(null)} />}
    </Page>
  );
}

function EtatPoint({ p }: { p: Point }) {
  if (p.ignore) return <Etat ton="neutre">Jugé normal</Etat>;
  return p.gravite === 'FORTE' ? <Etat ton="alerte">À traiter</Etat> : <Etat ton="neutre">À confirmer</Etat>;
}

function BlocCategorie({ categorie: c, actions }: { categorie: Categorie; actions: (p: Point) => ReactNode }) {
  const [tout, setTout] = useState(false);
  const { ton: t, colonnes } = rangement(c);
  const ton = TONS[t];
  const nombre = c.points.filter((p) => !p.ignore).length;
  // Rangés par classe : la classe n'est écrite qu'une fois pour ses lignes.
  const points = [...c.points].sort((x, y) => (separer(x.titre).classe ?? '').localeCompare(separer(y.titre).classe ?? '', 'fr'));
  const montres = tout ? points : points.slice(0, LIGNES_VISIBLES);
  const reste = points.length - LIGNES_VISIBLES;

  return (
    <section className="overflow-hidden rounded-lg border border-bord bg-surface">
      <header className={clsx('px-4 py-2.5', ton.bandeau)}>
        <h3 className="flex items-center gap-2 text-[0.95rem] font-bold">
          {t === 'danger' && <AlertTriangle className="h-4 w-4" />}
          {c.titre}
          <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs dark:bg-black/15">{nombre}</span>
        </h3>
        <p className="mt-0.5 text-sm opacity-90">{c.explication}</p>
      </header>

      <div className="overflow-x-auto">
        {!colonnes ? (
          // Doublons de comptes : les deux fiches l'une sous l'autre, pour les comparer.
          <ul className="divide-y divide-bord">
            {montres.map((p) => {
              const noms = p.titre.split(' et ');
              const fiches = p.detail.split(' — ');
              const deux = noms.length === 2 && fiches.length === 2;
              return (
                <li key={p.cle} className={clsx('flex flex-wrap items-center gap-3 px-4 py-3', p.ignore && 'opacity-60')}>
                  <div className="min-w-0 flex-1 space-y-1">
                    <EtatPoint p={p} />
                    {deux ? (
                      [0, 1].map((i) => (
                        <div key={i} className="text-sm">
                          <span className="font-medium">{noms[i]}</span>
                          {i === 0 && <span className="ml-2 text-xs font-semibold text-succes">compte proposé à garder</span>}
                          <div className="text-xs text-encre-2">{fiches[i]}</div>
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="font-medium">{p.titre}</div>
                        <div className="text-xs text-encre-2">{p.detail}</div>
                      </>
                    )}
                  </div>
                  {actions(p)}
                </li>
              );
            })}
          </ul>
        ) : (
          <table className="tableau">
            <thead>
              <tr>
                {colonnes.map((titre) => (
                  <th key={titre}>{titre}</th>
                ))}
                <th className="w-px" />
              </tr>
            </thead>
            <tbody>
              {montres.map((p, i) => {
                const { nom, classe } = separer(p.titre);
                const sansClasse = colonnes.length === 2;
                const memeClasse = i > 0 && separer(montres[i - 1].titre).classe === classe;
                return (
                  <tr key={p.cle} className={clsx(p.ignore && 'opacity-60')}>
                    <td className="whitespace-nowrap align-top font-semibold text-encre">
                      {sansClasse ? (
                        <div className="space-y-0.5">
                          <div>{nom}</div>
                          <EtatPoint p={p} />
                        </div>
                      ) : memeClasse ? (
                        ''
                      ) : (
                        classe
                      )}
                    </td>
                    {!sansClasse && (
                      <td className="align-top">
                        <div className="font-medium">{nom}</div>
                        <EtatPoint p={p} />
                      </td>
                    )}
                    <td className="align-top text-encre-2">{p.detail}</td>
                    <td>{actions(p)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {reste > 0 && (
          <button
            type="button"
            className={clsx('flex w-full items-center justify-center gap-2 border-t border-bord py-2.5 text-sm font-semibold transition-colors', ton.teinte)}
            onClick={() => setTout(!tout)}
          >
            <ChevronDown className={clsx('h-4 w-4 transition-transform', tout && 'rotate-180')} />
            {tout ? 'Voir moins' : `Voir plus · ${reste} autre${reste > 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </section>
  );
}
