import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, BookX, Check, ChevronDown, Copy, GitMerge, RotateCcw, UserRoundX } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/contexte';
import { Carte, Chargement, Erreur, Page, Vide } from '../../components/ui';
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

/** Présentation de chaque catégorie : titre court, couleur selon l'urgence, colonnes du tableau. */
const CATEGORIES: Record<string, { theme: string; titre: string; aide: string; ton: Ton; colonnes?: [string, string, string?] }> = {
  'matieres-sans-enseignant': {
    theme: 'notes',
    titre: 'Matières sans enseignant',
    aide: 'Personne ne peut y saisir les notes.',
    ton: 'danger',
    colonnes: ['Classe', 'Matière', 'Coefficient et groupe'],
  },
  'matieres-enseignant-desactive': {
    theme: 'notes',
    titre: 'Matières confiées à un compte désactivé',
    aide: "L'enseignant ne peut plus se connecter.",
    ton: 'danger',
    colonnes: ['Classe', 'Matière', 'Enseignant désactivé'],
  },
  'classes-sans-pp': {
    theme: 'notes',
    titre: 'Classes sans professeur principal',
    aide: "Il signe l'appréciation des bulletins.",
    ton: 'alerte',
    colonnes: ['Classe', 'Professeur principal'],
  },
  'enseignants-doublons': { theme: 'doublons', titre: 'Enseignants en double', aide: 'Même personne enregistrée deux fois ?', ton: 'alerte' },
  'eleves-doublons': { theme: 'doublons', titre: 'Élèves en double', aide: 'Même élève inscrit deux fois ?', ton: 'alerte' },
  'matieres-doublons': {
    theme: 'doublons',
    titre: 'Matières en double',
    aide: 'Deux matières presque identiques dans une classe.',
    ton: 'alerte',
    colonnes: ['Classe', 'Matières', 'Coefficients'],
  },
  'eleves-naissance': {
    theme: 'fiches',
    titre: 'Naissances au 1er janvier',
    aide: 'Souvent une date provisoire.',
    ton: 'info',
    colonnes: ['Classe', 'Élève', 'Naissance'],
  },
  'eleves-sans-parent': { theme: 'fiches', titre: 'Élèves sans parent à contacter', aide: 'Ni nom ni téléphone de parent.', ton: 'info', colonnes: ['Classe', 'Élève'] },
};

const THEMES = [
  { code: 'notes', titre: 'Saisie des notes et bulletins', icone: BookX },
  { code: 'doublons', titre: 'Doublons', icone: Copy },
  { code: 'fiches', titre: "Fiches d'élèves", icone: UserRoundX },
];

const TONS: Record<Ton, { titre: string; bord: string; pastille: string }> = {
  danger: { titre: 'text-danger', bord: 'border-l-danger', pastille: 'bg-danger/10 text-danger' },
  alerte: { titre: 'text-alerte', bord: 'border-l-alerte', pastille: 'bg-alerte/10 text-alerte' },
  info: { titre: 'text-primaire', bord: 'border-l-primaire', pastille: 'bg-primaire/10 text-primaire' },
};

const presentation = (c: Categorie) => CATEGORIES[c.code] ?? { theme: 'fiches', titre: c.titre, aide: c.explication, ton: 'info' as Ton };

/** « Français (4e année Électricité) » → nom et classe. */
function separer(titre: string): { nom: string; classe: string | null } {
  const m = /^(.*) \(([^()]+)\)$/.exec(titre);
  return m ? { nom: m[1], classe: m[2] } : { nom: titre, classe: null };
}

/** Le détail renvoyé par l'API, réduit à l'essentiel pour une cellule de tableau. */
function precision(code: string, detail: string): string {
  const d = detail.trim().replace(/\.$/, '');
  switch (code) {
    case 'matieres-enseignant-desactive':
      return d.replace(/^Confiée à /, '').replace(/, compte désactivé$/, '');
    case 'matieres-sans-enseignant':
      return d.replace(/^Coefficient (\S+), groupe /, 'Coef. $1 · ');
    case 'classes-sans-pp':
      return d.replace(/, compte désactivé$/, ' (désactivé)').replace(/^Aucun professeur principal$/, 'Aucun');
    case 'eleves-naissance':
      return d.replace(/^Né\(e\) le /, '').replace(/ à /, ' · ');
    case 'matieres-doublons':
      return d.split('. ')[0];
    default:
      return d;
  }
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
    <div className="flex items-center justify-end gap-1">
      {((p.action.type === 'fusionner-enseignants' && sg) || p.action.type === 'fusionner-eleves') && p.action.a && p.action.b && (
        <button
          type="button"
          className="bouton-secondaire px-2.5 py-1.5"
          onClick={() => setFusion({ type: p.action.type === 'fusionner-enseignants' ? 'enseignants' : 'eleves', a: p.action.a!, b: p.action.b! })}
        >
          <GitMerge className="h-4 w-4" /> Fusionner
        </button>
      )}
      <button
        type="button"
        className="bouton-discret py-1.5"
        disabled={marquer.isPending}
        onClick={() => marquer.mutate(p)}
        title={p.ignore ? 'Signaler de nouveau' : "C'est normal : ne plus le signaler"}
      >
        {p.ignore ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        <span className="hidden sm:inline">{p.ignore ? 'Signaler' : 'Normal'}</span>
      </button>
    </div>
  );

  const nomLie = (p: Point, nom: string) =>
    p.action.type === 'ouvrir' && p.action.lien ? (
      <Link href={p.action.lien} className="lien">
        {nom}
      </Link>
    ) : (
      <span className="font-medium">{nom}</span>
    );

  // Même ordre que les sections : les urgences d'abord.
  const rang = (c: Categorie) => THEMES.findIndex((t) => t.code === presentation(c).theme) * 100 + Object.keys(CATEGORIES).indexOf(c.code);
  const categories = [...(r?.categories ?? [])].sort((x, y) => rang(x) - rang(y));
  const visibles = categories.filter((c) => !filtre || c.code === filtre);

  return (
    <Page
      titre="À vérifier"
      description="Rien n'est bloqué. Corrigez depuis la page concernée, ou cliquez sur « Normal » pour ne plus voir un point."
      actions={
        r && r.ignores > 0 ? (
          <label className="flex items-center gap-2 text-sm text-encre-2">
            <input type="checkbox" className="h-4 w-4" checked={avecIgnores} onChange={(e) => setAvecIgnores(e.target.checked)} />
            Voir les {r.ignores} jugés normaux
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
              Tout · {r.categories.reduce((n, c) => n + actifs(c), 0)}
            </button>
            {categories.map((c) => {
              const pr = presentation(c);
              const choisi = filtre === c.code;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setFiltre(choisi ? null : c.code)}
                  className={clsx(
                    'rounded-full border px-3 py-1 text-sm font-semibold',
                    choisi ? clsx('border-current', TONS[pr.ton].pastille) : clsx('border-bord bg-surface', TONS[pr.ton].titre),
                  )}
                >
                  {pr.titre} · {actifs(c)}
                </button>
              );
            })}
          </div>

          {THEMES.map((t) => {
            const cats = visibles.filter((c) => presentation(c).theme === t.code);
            if (!cats.length) return null;
            return (
              <section key={t.code} className="space-y-3">
                <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-encre-2">
                  <t.icone className="h-4 w-4" /> {t.titre}
                </h2>
                {cats.map((c) => (
                  <BlocCategorie key={c.code} categorie={c} actions={actions} nomLie={nomLie} />
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

function BlocCategorie({
  categorie: c,
  actions,
  nomLie,
}: {
  categorie: Categorie;
  actions: (p: Point) => ReactNode;
  nomLie: (p: Point, nom: string) => ReactNode;
}) {
  const [tout, setTout] = useState(false);
  const pr = presentation(c);
  const ton = TONS[pr.ton];
  const nombre = c.points.filter((p) => !p.ignore).length;
  const doublonsDeComptes = c.code === 'enseignants-doublons' || c.code === 'eleves-doublons';
  // Rangés par classe : la classe n'est écrite qu'une fois pour ses lignes.
  const points = [...c.points].sort((x, y) => (separer(x.titre).classe ?? '').localeCompare(separer(y.titre).classe ?? '', 'fr'));
  const montres = tout ? points : points.slice(0, LIGNES_VISIBLES);

  return (
    <section className={clsx('overflow-hidden rounded-lg border border-l-4 border-bord bg-surface', ton.bord)}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5">
        <h3 className={clsx('flex items-center gap-2 text-[0.95rem] font-bold', ton.titre)}>
          {pr.ton === 'danger' && <AlertTriangle className="h-4 w-4 self-center" />}
          {pr.titre}
          <span className={clsx('rounded-full px-2 py-0.5 text-xs', ton.pastille)}>{nombre}</span>
        </h3>
        <p className="text-sm text-encre-2">{pr.aide}</p>
      </header>

      <div className="overflow-x-auto border-t border-bord">
        {doublonsDeComptes ? (
          <ul className="divide-y divide-bord">
            {montres.map((p) => {
              const noms = p.titre.split(' et ');
              const fiches = p.detail.split(' — ');
              return (
                <li key={p.cle} className={clsx('flex flex-wrap items-center gap-3 px-4 py-2.5', p.ignore && 'opacity-50')}>
                  <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                    {(noms.length === 2 && fiches.length === 2 ? [0, 1] : []).map((i) => (
                      <div key={i} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{noms[i]}</span>
                        <span className="text-xs text-encre-2">{fiches[i].replace(/, /g, ' · ')}</span>
                        {i === 0 && <span className="text-xs font-semibold text-succes">à garder</span>}
                      </div>
                    ))}
                    {!(noms.length === 2 && fiches.length === 2) && (
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
                {(pr.colonnes ?? ['Classe', 'Élément', 'Précision']).filter(Boolean).map((t) => (
                  <th key={t}>{t}</th>
                ))}
                <th className="w-px" />
              </tr>
            </thead>
            <tbody>
              {montres.map((p, i) => {
                const { nom, classe } = separer(p.titre);
                const sansClasse = c.code === 'classes-sans-pp';
                const memeClasse = i > 0 && separer(montres[i - 1].titre).classe === classe;
                const prec = precision(c.code, p.detail);
                return (
                  <tr key={p.cle} className={clsx(p.ignore && 'opacity-50')}>
                    <td className="whitespace-nowrap font-semibold text-encre">{sansClasse ? nomLie(p, nom) : memeClasse ? '' : classe}</td>
                    {!sansClasse && <td>{nomLie(p, nom)}</td>}
                    {(pr.colonnes?.length ?? 3) > 2 || sansClasse ? <td className="text-encre-2">{prec}</td> : null}
                    <td>{actions(p)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {points.length > LIGNES_VISIBLES && (
          <button
            type="button"
            className={clsx('flex w-full items-center justify-center gap-2 border-t border-bord py-2 text-sm font-semibold transition-opacity hover:opacity-80', ton.pastille)}
            onClick={() => setTout(!tout)}
          >
            <ChevronDown className={clsx('h-4 w-4 transition-transform', tout && 'rotate-180')} />
            {tout ? 'Voir moins' : `Voir plus · ${points.length - LIGNES_VISIBLES} autre${points.length - LIGNES_VISIBLES > 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </section>
  );
}
