import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertCircle,
  CalendarDays,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Loader2,
  Paperclip,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api, telecharger, urlProtegee } from '../../lib/api';
import { requetes } from '../../lib/requetes';
import { useApp } from '../../lib/contexte';
import { useParametresUrl } from '../../lib/navigation';
import { duree } from '../../lib/format';
import type { Classe, Matiere } from '../../lib/types';
import { Carte, Chargement, Champ, Erreur, Modale, Page, Vide } from '../../components/ui';
import { aujourdhui } from './Appel';
import { confirmer } from '../../lib/confirmation';

export interface Piece {
  id: string;
  nom: string;
  type: string;
  taille: number;
}

export interface JustificationVue {
  id: string;
  motifId: string;
  motif: string;
  description: string | null;
  dateReception: string;
  par: string | null;
  creeLe: string;
  modifieLe: string | null;
  pieces: Piece[];
}

export interface Ligne {
  id: string;
  inscriptionId: string;
  eleveId: string;
  nom: string;
  prenoms: string;
  matricule: string;
  classeId: string;
  classe: string;
  date: string;
  seanceId: string;
  matiere: string;
  debut: string;
  fin: string;
  duree: number;
  enseignantAbsent: boolean;
  justification: JustificationVue | null;
  /** Numéro d'ordre de l'élève dans sa classe. */
  numero: number;
}

export interface PageAbsences {
  lignes: Ligne[];
  page: number;
  taille: number;
  total: number;
  totaux: { absences: number; minutes: number; minutesJustifiees: number; minutesNonJustifiees: number };
}

interface Motif {
  id: string;
  libelle: string;
  ordre: number;
  actif: boolean;
}

interface Historique {
  id: string;
  action: string;
  libelle: string;
  par: string | null;
  creeLe: string;
}

const TAILLE = 50;
// Vue par élève : tout d'un coup (maximum de l'API), pour ne pas couper un élève entre deux pages.
const TAILLE_PAR_ELEVE = 200;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_OCTETS = 3 * 1024 * 1024;
const MAX_PIECES = 5;

export const dateCourte = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
};
const quand = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

function parNiveau(classes: Classe[]) {
  const groupes = new Map<number, Classe[]>();
  for (const c of [...classes].sort((x, y) => x.niveau - y.niveau || x.nom.localeCompare(y.nom, 'fr'))) {
    groupes.set(c.niveau, [...(groupes.get(c.niveau) ?? []), c]);
  }
  return [...groupes.entries()];
}

/** Pièces choisies : PDF, JPEG ou PNG, 3 Mo au plus chacune, cinq au plus. */
function verifierPieces(fichiers: File[], deja: number): string | null {
  if (fichiers.length + deja > MAX_PIECES) return `Au plus ${MAX_PIECES} pièces justificatives.`;
  const mauvais = fichiers.find((f) => !TYPES.includes(f.type));
  if (mauvais) return `${mauvais.name} : PDF, JPEG ou PNG uniquement.`;
  const lourd = fichiers.find((f) => f.size > MAX_OCTETS);
  if (lourd) return `${lourd.name} dépasse 3 Mo.`;
  return null;
}

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Raccourcis de période : aujourd'hui, la semaine (depuis lundi), le mois, toute l'année (aucune borne). */
function periodes(): { code: string; libelle: string; du: string; au: string }[] {
  const auj = new Date();
  const lundi = new Date(auj);
  lundi.setDate(auj.getDate() - ((auj.getDay() + 6) % 7));
  const premier = new Date(auj.getFullYear(), auj.getMonth(), 1);
  return [
    { code: 'jour', libelle: "Aujourd'hui", du: iso(auj), au: iso(auj) },
    { code: 'semaine', libelle: 'Cette semaine', du: iso(lundi), au: iso(auj) },
    { code: 'mois', libelle: 'Ce mois', du: iso(premier), au: iso(auj) },
    { code: 'annee', libelle: "Toute l'année", du: '', au: '' },
  ];
}

/** État d'une absence : pastille avec fond, icône et mot (la couleur seule ne suffit pas). */
export function PastilleEtat({ justification }: { justification: JustificationVue | null }) {
  return justification ? (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 rounded-full bg-succes/10 px-2 py-0.5 text-xs font-semibold text-succes">
        <CheckCircle2 className="h-3.5 w-3.5" /> Justifiée · {justification.motif}
      </span>
      {justification.pieces.length > 0 && (
        <span className="inline-flex items-center gap-0.5 text-xs text-encre-2" title={pluriel(justification.pieces.length, 'pièce justificative', 'pièces justificatives')}>
          <Paperclip className="h-3.5 w-3.5" aria-hidden /> {justification.pieces.length}
        </span>
      )}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
      <AlertCircle className="h-3.5 w-3.5" /> Non justifiée
    </span>
  );
}

type Tri = 'date' | 'eleve' | 'duree' | 'etat';

/**
 * Absences et justifications (une seule page) : filtres sur une rangée, totaux cliquables, export, et deux
 * affichages : par jour (colonnes triables) ou par élève (un bloc par élève, « Tout cocher » et « Justifier »).
 * Le SG justifie une ou plusieurs absences d'un même élève.
 */
export default function Absences() {
  const { a, annee } = useApp();
  const client = useQueryClient();
  const [params, setParams] = useParametresUrl();
  const sg = a('SURVEILLANT_GENERAL');
  const f = {
    classe: params.get('classe') ?? '',
    eleve: params.get('eleve') ?? '',
    du: params.get('du') ?? '',
    au: params.get('au') ?? '',
    matiere: params.get('matiere') ?? '',
    etat: params.get('etat') ?? '',
    q: params.get('q') ?? '',
    tri: (params.get('tri') ?? 'date') as Tri,
    sens: params.get('sens') ?? (params.get('tri') && params.get('tri') !== 'date' ? 'asc' : 'desc'),
    page: Number(params.get('page') ?? 0),
    // Affichage : vide = par jour, « eleve » = par élève.
    vue: params.get('vue') === 'eleve' ? 'eleve' : '',
  };
  const filtrer = (changes: Partial<Record<keyof typeof f, string>>) => {
    const tout: Record<string, string> = { ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v)])), page: '0', ...changes };
    if (tout.tri === 'date' && tout.sens === 'desc') delete tout.sens;
    if (tout.tri === 'date') delete tout.tri;
    setParams(Object.fromEntries(Object.entries(tout).filter(([k, v]) => v && !(k === 'page' && v === '0'))));
  };
  const reinitialiser = () => setParams(f.vue ? { vue: f.vue } : {});
  const [recherche, setRecherche] = useState(f.q);
  useEffect(() => setRecherche(f.q), [f.q]);
  useEffect(() => {
    if (recherche === f.q) return;
    const t = setTimeout(() => filtrer({ q: recherche }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche]);

  const classes = useQuery(requetes.classes(annee?.id));
  // Toutes les matières de l'année : le filtre ne dépend pas de la classe (même nom, plusieurs classes).
  const matieres = useQuery({ queryKey: ['matieres', annee?.id, 'toutes'], queryFn: () => api<Matiere[]>('/matieres') });
  const nomsMatieres = useMemo(() => [...new Set((matieres.data ?? []).map((m) => m.nom))].sort((x, y) => x.localeCompare(y, 'fr')), [matieres.data]);
  const requete = new URLSearchParams(
    Object.entries({
      classeId: f.classe,
      eleveId: f.eleve,
      du: f.du,
      au: f.au,
      matiere: f.matiere,
      etat: f.etat,
      q: f.q,
      tri: f.vue ? 'eleve' : f.tri,
      sens: f.vue ? 'asc' : f.sens,
    }).filter(([, v]) => v !== ''),
  ).toString();
  const chemin = `/absences?${requete}&page=${f.page}&taille=${f.vue ? TAILLE_PAR_ELEVE : TAILLE}`;
  const q = useQuery({ queryKey: ['absences', annee?.id, chemin], queryFn: () => api<PageAbsences>(chemin) });
  const p = q.data;
  const filtreActif = Boolean(f.classe || f.eleve || f.du || f.au || f.matiere || f.etat || f.q);
  const periode = periodes().find((x) => x.du === f.du && x.au === f.au)?.code;
  const nomEleve = f.eleve ? p?.lignes.find((l) => l.eleveId === f.eleve) : undefined;

  const [selection, setSelection] = useState<Map<string, Ligne>>(new Map());
  useEffect(() => setSelection(new Map()), [chemin]);
  const eleveChoisi = selection.size ? [...selection.values()][0] : null;
  const basculer = (l: Ligne) =>
    setSelection((s) => {
      const n = new Map(s);
      if (n.has(l.id)) n.delete(l.id);
      else n.set(l.id, l);
      return n;
    });
  // « Tout sélectionner » : les absences non justifiées affichées, quand elles sont toutes du même élève.
  const aJustifier = (p?.lignes ?? []).filter((l) => !l.justification);
  const unSeulEleve = aJustifier.length > 0 && aJustifier.every((l) => l.inscriptionId === aJustifier[0].inscriptionId);
  const toutChoisi = aJustifier.length > 0 && aJustifier.every((l) => selection.has(l.id));
  const [justifier, setJustifier] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [voirMotifs, setVoirMotifs] = useState(false);
  const rafraichir = () => client.invalidateQueries({ queryKey: ['absences'] });
  const minutesSelection = [...selection.values()].reduce((n, l) => n + l.duree, 0);
  const exporter = (format: 'xlsx' | 'pdf') =>
    telecharger(`/absences/export?${requete}&format=${format}`, { ouvrir: format === 'pdf' }).catch((e) => toast.error(e.message));

  // Regroupement par jour quand on trie par date ; sinon une seule liste.
  const groupes = useMemo(() => {
    const lignes = p?.lignes ?? [];
    if (f.tri !== 'date') return [{ cle: 'tout', titre: null as string | null, lignes }];
    const m = new Map<string, Ligne[]>();
    for (const l of lignes) m.set(l.date, [...(m.get(l.date) ?? []), l]);
    return [...m.entries()].map(([d, ls]) => ({ cle: d, titre: d, lignes: ls }));
  }, [p, f.tri]);

  // Hauteur de l'en-tête du tableau : le jour de chaque groupe se colle juste dessous.
  const entete = useRef<HTMLTableSectionElement>(null);
  const [hauteurEntete, setHauteurEntete] = useState(37);
  useLayoutEffect(() => {
    const t = entete.current;
    if (!t) return;
    const mesurer = () => setHauteurEntete(t.offsetHeight);
    mesurer();
    const o = new ResizeObserver(mesurer);
    o.observe(t);
    return () => o.disconnect();
  });

  const triable = (code: Tri, libelle: string, droite = false) => {
    const actif = f.tri === code;
    const Icone = !actif ? ArrowUpDown : f.sens === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className={clsx(droite && 'text-right')} aria-sort={actif ? (f.sens === 'asc' ? 'ascending' : 'descending') : undefined}>
        <button
          type="button"
          className={clsx('inline-flex items-center gap-1 uppercase hover:text-encre', actif && 'text-encre')}
          onClick={() => filtrer({ tri: code, sens: actif ? (f.sens === 'asc' ? 'desc' : 'asc') : code === 'date' ? 'desc' : 'asc' })}
        >
          {libelle} <Icone className="h-3.5 w-3.5" />
        </button>
      </th>
    );
  };

  return (
    <Page
      titre="Absences"
      description="Toutes les absences relevées. Une justification ne supprime jamais l'absence."
      actions={
        <>
          <button type="button" className="bouton-secondaire" onClick={() => exporter('xlsx')} disabled={!p?.total}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
          <button type="button" className="bouton-secondaire" onClick={() => exporter('pdf')} disabled={!p?.total}>
            <FileText className="h-4 w-4" /> PDF
          </button>
          {sg && (
            <button type="button" className="bouton-secondaire" onClick={() => setVoirMotifs(true)}>
              <Settings2 className="h-4 w-4" /> Gérer les motifs
            </button>
          )}
        </>
      }
    >
      {/* Filtres, de haut en bas comme sur le mobile : classe et matière, état, raccourcis de période, dates, recherche. */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <select className="champ w-auto min-w-[12rem]" value={f.classe} onChange={(e) => filtrer({ classe: e.target.value })} aria-label="Classe">
            <option value="">Toutes les classes</option>
            {parNiveau(classes.data ?? []).map(([niveau, liste]) => (
              <optgroup key={niveau} label={`${niveau === 1 ? '1re' : `${niveau}e`} année`}>
                {liste.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select className="champ w-auto min-w-[12rem]" value={f.matiere} onChange={(e) => filtrer({ matiere: e.target.value })} aria-label="Matière">
            <option value="">Toutes les matières</option>
            {nomsMatieres.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          {f.eleve && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-sm">
              Élève : {nomEleve ? `${nomEleve.nom} ${nomEleve.prenoms}` : 'choisi'}
              <button type="button" aria-label="Retirer ce filtre" className="text-encre-2 hover:text-encre" onClick={() => filtrer({ eleve: '' })}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['', 'Toutes'],
              ['NON_JUSTIFIEE', 'Non justifiées'],
              ['JUSTIFIEE', 'Justifiées'],
            ] as const
          ).map(([code, libelle]) => (
            <button
              key={code}
              type="button"
              aria-pressed={f.etat === code}
              onClick={() => filtrer({ etat: code })}
              className={clsx(
                'rounded-full border px-3 py-1 text-sm font-semibold',
                f.etat === code ? 'border-encre bg-encre text-surface' : 'border-bord-champ bg-surface text-encre-2 hover:text-encre',
              )}
            >
              {libelle}
            </button>
          ))}
          {filtreActif && (
            <button type="button" className="ml-auto text-sm text-primaire hover:underline" onClick={reinitialiser}>
              Réinitialiser les filtres
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {periodes().map((x) => (
            <button
              key={x.code}
              type="button"
              aria-pressed={periode === x.code}
              onClick={() => filtrer({ du: x.du, au: x.au })}
              className={clsx(
                'rounded-full border px-3 py-1 text-sm',
                periode === x.code ? 'border-primaire bg-primaire-pale font-semibold text-primaire' : 'border-bord bg-surface text-encre-2 hover:text-encre',
              )}
            >
              {x.libelle}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-encre-2">Du</span>
          <input type="date" className="champ w-auto" value={f.du} max={f.au || aujourdhui()} onChange={(e) => filtrer({ du: e.target.value })} aria-label="Du" />
          <span className="text-sm text-encre-2">au</span>
          <input type="date" className="champ w-auto" value={f.au} min={f.du || undefined} max={aujourdhui()} onChange={(e) => filtrer({ au: e.target.value })} aria-label="Au" />
        </div>
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-encre-3" />
          <input className="champ pl-8" placeholder="Nom, prénom ou matricule" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Recherche" />
        </div>
      </div>

      {q.isLoading ? (
        <Chargement />
      ) : q.error ? (
        <Erreur erreur={q.error} />
      ) : !p ? null : (
        <>
          {/* Totaux : un clic applique le filtre correspondant. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Total titre="Total des absences" minutes={p.totaux.minutes} detail={pluriel(p.totaux.absences, 'séance manquée', 'séances manquées')} actif={f.etat === ''} onClick={() => filtrer({ etat: '' })} />
            <Total titre="Heures justifiées" minutes={p.totaux.minutesJustifiees} ton="succes" actif={f.etat === 'JUSTIFIEE'} onClick={() => filtrer({ etat: 'JUSTIFIEE' })} />
            <Total
              titre="Heures non justifiées"
              minutes={p.totaux.minutesNonJustifiees}
              ton="danger"
              actif={f.etat === 'NON_JUSTIFIEE'}
              onClick={() => filtrer({ etat: 'NON_JUSTIFIEE' })}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span id="affichage" className="text-sm font-semibold text-encre-2">
                Affichage
              </span>
              <div role="group" aria-labelledby="affichage" className="flex gap-1 rounded-lg bg-surface-2 p-1">
                {(
                  [
                    ['', 'Par jour', CalendarDays],
                    ['eleve', 'Par élève', Users],
                  ] as const
                ).map(([code, libelle, Icone]) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={f.vue === code}
                    onClick={() => filtrer({ vue: code })}
                    className={clsx(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold',
                      f.vue === code ? 'bg-surface text-primaire shadow-sm' : 'text-encre-2 hover:text-encre',
                    )}
                  >
                    <Icone className="h-4 w-4" aria-hidden /> {libelle}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-sm text-encre-2">
              {f.vue && sg ? "Cochez les absences d'un élève, puis « Justifier »." : "Cliquez sur une absence pour voir le détail et l'historique."}
            </span>
          </div>

          {/* Barre d'actions : apparaît dès qu'une absence est cochée. */}
          {sg && selection.size > 0 && eleveChoisi && (
            <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-primaire/40 bg-primaire-pale px-3 py-2 shadow-feuille">
              <span className="text-sm">
                <span className="font-semibold">{pluriel(selection.size, 'absence sélectionnée', 'absences sélectionnées')}</span> · {eleveChoisi.nom} {eleveChoisi.prenoms} ·{' '}
                {duree(minutesSelection)}
              </span>
              <span className="text-xs text-encre-2">Une justification couvre les absences d'un seul élève.</span>
              <div className="ml-auto flex gap-2">
                <button type="button" className="bouton-discret" onClick={() => setSelection(new Map())}>
                  Annuler
                </button>
                <button type="button" className="bouton-primaire" onClick={() => setJustifier(true)}>
                  <ShieldCheck className="h-4 w-4" /> Justifier
                </button>
              </div>
            </div>
          )}

          {p.lignes.length === 0 ? (
            <Carte>
              <Vide titre={filtreActif ? 'Aucune absence avec ces filtres' : 'Aucune absence relevée'}>
                {filtreActif ? (
                  <button type="button" className="lien" onClick={reinitialiser}>
                    Réinitialiser les filtres
                  </button>
                ) : (
                  "Les absences apparaissent ici dès qu'un appel est enregistré."
                )}
              </Vide>
            </Carte>
          ) : f.vue ? (
            <ParEleve
              p={p}
              sg={sg}
              selection={selection}
              choisir={setSelection}
              basculer={basculer}
              justifier={() => setJustifier(true)}
              detail={setDetail}
              page={(n) => filtrer({ page: String(n) })}
            />
          ) : (
            <div className="max-h-[calc(100dvh-12rem)] min-h-[16rem] overflow-auto rounded-lg border border-bord bg-surface">
              <table className="tableau">
                <thead ref={entete}>
                  <tr>
                    {sg && (
                      <th className="w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={toutChoisi}
                          disabled={!unSeulEleve}
                          title={unSeulEleve ? 'Tout sélectionner' : "Pour tout sélectionner, n'affichez qu'un élève (recherche ou filtre)"}
                          onChange={() => setSelection(toutChoisi ? new Map() : new Map(aJustifier.map((l) => [l.id, l])))}
                          aria-label="Tout sélectionner"
                        />
                      </th>
                    )}
                    {triable('eleve', 'Élève')}
                    {triable('date', 'Date')}
                    <th>Matière</th>
                    <th>Horaire</th>
                    {triable('duree', 'Durée', true)}
                    {triable('etat', 'État')}
                    <th className="w-8" />
                  </tr>
                </thead>
                {groupes.map((g) => (
                  <tbody key={g.cle}>
                    {g.titre && (
                      <tr>
                        <td colSpan={sg ? 8 : 7} className="sticky bg-primaire-pale py-2 text-sm font-bold text-encre" style={{ top: hauteurEntete, zIndex: 1 }}>
                          <span className="capitalize">{dateLongueIso(g.titre)}</span>
                          <span className="font-normal text-encre-2"> · {pluriel(g.lignes.length, 'absence')}</span>
                        </td>
                      </tr>
                    )}
                    {g.lignes.map((l) => {
                      const autreEleve = Boolean(eleveChoisi) && eleveChoisi!.inscriptionId !== l.inscriptionId;
                      return (
                        <tr key={l.id} onClick={() => setDetail(l.id)} className={clsx('cursor-pointer', selection.has(l.id) && 'bg-primaire-pale/60')}>
                          {sg && (
                            <td onClick={(e) => e.stopPropagation()}>
                              {!l.justification && (
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={selection.has(l.id)}
                                  disabled={autreEleve}
                                  title={autreEleve ? "Une justification couvre les absences d'un seul élève" : 'Choisir pour justifier'}
                                  onChange={() => basculer(l)}
                                  aria-label={`Choisir l'absence de ${l.nom} ${l.prenoms} en ${l.matiere}`}
                                />
                              )}
                            </td>
                          )}
                          <td>
                            <div className="font-medium">
                              {l.nom} <span className="font-normal text-encre-2">{l.prenoms}</span>
                            </div>
                            <div className="text-xs text-encre-2">
                              {l.classe} · <span className="whitespace-nowrap">n° {l.numero}</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap">{dateCourte(l.date)}</td>
                          <td>
                            {l.matiere}
                            {l.enseignantAbsent && <div className="text-xs font-semibold text-alerte">Enseignant absent</div>}
                          </td>
                          <td className="whitespace-nowrap tabular-nums">
                            {l.debut} – {l.fin}
                          </td>
                          <td className="whitespace-nowrap text-right tabular-nums">{duree(l.duree)}</td>
                          <td>
                            <PastilleEtat justification={l.justification} />
                          </td>
                          <td className="text-encre-3" aria-hidden>
                            <ChevronRight className="h-4 w-4" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-bord px-3 py-2 text-sm text-encre-2">
                <span>
                  {p.page * p.taille + 1}–{p.page * p.taille + p.lignes.length} sur {p.total}
                </span>
                <div className="flex gap-1">
                  <button type="button" className="bouton-discret" disabled={p.page === 0} onClick={() => filtrer({ page: String(p.page - 1) })}>
                    <ChevronLeft className="h-4 w-4" /> Précédentes
                  </button>
                  <button type="button" className="bouton-discret" disabled={(p.page + 1) * p.taille >= p.total} onClick={() => filtrer({ page: String(p.page + 1) })}>
                    Suivantes <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {justifier && eleveChoisi && (
        <FormJustification
          absences={[...selection.values()]}
          fermer={() => setJustifier(false)}
          fait={() => {
            setJustifier(false);
            setSelection(new Map());
            rafraichir();
          }}
        />
      )}
      {detail && <FenetreDetail id={detail} fermer={() => setDetail(null)} change={rafraichir} />}
      {voirMotifs && <FenetreMotifs fermer={() => setVoirMotifs(false)} />}
    </Page>
  );
}

/** Vue par élève : un bloc par élève avec ses absences ; on coche, puis « Justifier ». */
function ParEleve({
  p,
  sg,
  selection,
  choisir,
  basculer,
  justifier,
  detail,
  page,
}: {
  p: PageAbsences;
  sg: boolean;
  selection: Map<string, Ligne>;
  choisir: (s: Map<string, Ligne>) => void;
  basculer: (l: Ligne) => void;
  justifier: () => void;
  detail: (id: string) => void;
  page: (n: number) => void;
}) {
  const eleveChoisi = selection.size ? [...selection.values()][0] : null;
  const blocs = useMemo(() => {
    const m = new Map<string, Ligne[]>();
    for (const l of p.lignes) m.set(l.inscriptionId, [...(m.get(l.inscriptionId) ?? []), l]);
    return [...m.values()];
  }, [p]);
  return (
    <div className="space-y-3">
      {blocs.map((ls) => {
        const e = ls[0];
        const nj = ls.filter((l) => !l.justification);
        const minutesNj = nj.reduce((n, l) => n + l.duree, 0);
        const autreEleve = Boolean(eleveChoisi) && eleveChoisi!.inscriptionId !== e.inscriptionId;
        const choisies = nj.filter((l) => selection.has(l.id)).length;
        const toutCoche = nj.length > 0 && choisies === nj.length;
        return (
          <section key={e.inscriptionId} aria-label={`${e.nom} ${e.prenoms}`} className="overflow-hidden rounded-lg border border-bord bg-surface">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-bord bg-surface-2 px-4 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-bold">
                  {e.nom} <span className="font-normal text-encre-2">{e.prenoms}</span>
                </span>
                <span className="text-sm text-encre-2">
                  {e.classe} · <span className="whitespace-nowrap">n° {e.numero}</span>
                </span>
              </div>
              <span className={clsx('text-sm font-semibold', nj.length ? 'text-danger' : 'text-succes')}>
                {nj.length ? `${duree(minutesNj)} non justifiées · ${pluriel(nj.length, 'absence')}` : 'Tout est justifié'}
              </span>
            </header>
            <ul>
              {ls.map((l) => (
                <li
                  key={l.id}
                  onClick={() => detail(l.id)}
                  className={clsx(
                    'flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 border-b border-bord/60 px-4 py-2.5 last:border-b-0 hover:bg-surface-2',
                    selection.has(l.id) && 'bg-primaire-pale/60',
                  )}
                >
                  {sg && (
                    <span className="flex w-5 justify-center" onClick={(ev) => ev.stopPropagation()}>
                      {!l.justification && (
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selection.has(l.id)}
                          disabled={autreEleve}
                          title={autreEleve ? "Une justification couvre les absences d'un seul élève" : 'Choisir pour justifier'}
                          onChange={() => basculer(l)}
                          aria-label={`Choisir l'absence de ${l.nom} ${l.prenoms} en ${l.matiere}`}
                        />
                      )}
                    </span>
                  )}
                  <span className="w-36 whitespace-nowrap text-sm">{dateCourte(l.date)}</span>
                  <span className="min-w-[10rem] flex-1 text-sm">
                    {l.matiere}
                    {l.enseignantAbsent && <span className="block text-xs font-semibold text-alerte">Enseignant absent</span>}
                  </span>
                  <span className="w-28 whitespace-nowrap text-sm tabular-nums">
                    {l.debut} – {l.fin}
                  </span>
                  <span className="w-16 whitespace-nowrap text-right text-sm tabular-nums">{duree(l.duree)}</span>
                  <span className="w-64">
                    <PastilleEtat justification={l.justification} />
                  </span>
                  <ChevronRight className="h-4 w-4 text-encre-3" aria-hidden />
                </li>
              ))}
            </ul>
            {sg && nj.length > 0 && (
              <footer className="flex items-center justify-between gap-2 border-t border-bord px-4 py-2">
                <button
                  type="button"
                  className="bouton-discret"
                  disabled={autreEleve}
                  title={autreEleve ? "Une justification couvre les absences d'un seul élève" : undefined}
                  onClick={() => choisir(toutCoche ? new Map() : new Map(nj.map((l) => [l.id, l])))}
                >
                  {toutCoche ? 'Tout décocher' : 'Tout cocher'}
                </button>
                <button type="button" className="bouton-primaire" disabled={!choisies} onClick={justifier}>
                  <ShieldCheck className="h-4 w-4" /> {choisies ? `Justifier ${pluriel(choisies, 'absence')}` : 'Justifier'}
                </button>
              </footer>
            )}
          </section>
        );
      })}
      {p.total > p.lignes.length && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-encre-2">
          <span>
            Absences {p.page * p.taille + 1} à {p.page * p.taille + p.lignes.length} sur {p.total} : affinez les filtres (classe, période) pour tout voir d'un coup.
          </span>
          <div className="flex gap-1">
            <button type="button" className="bouton-discret" disabled={p.page === 0} onClick={() => page(p.page - 1)}>
              <ChevronLeft className="h-4 w-4" /> Précédentes
            </button>
            <button type="button" className="bouton-discret" disabled={(p.page + 1) * p.taille >= p.total} onClick={() => page(p.page + 1)}>
              Suivantes <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const dateLongueIso = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

function Total({
  titre,
  minutes,
  detail,
  ton,
  actif,
  onClick,
}: {
  titre: string;
  minutes: number;
  detail?: string;
  ton?: 'succes' | 'danger';
  actif: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={clsx(
        'rounded-lg border bg-surface px-4 py-3 text-left transition-colors hover:border-primaire',
        actif ? 'border-primaire ring-2 ring-primaire/20' : 'border-bord',
      )}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-encre-2">{titre}</div>
      <div className={clsx('mt-1 text-2xl font-bold tabular-nums', ton === 'succes' && 'text-succes', ton === 'danger' && 'text-danger')}>{minutes ? duree(minutes) : '0 h'}</div>
      {detail && <div className="text-xs text-encre-2">{detail}</div>}
    </button>
  );
}

function useMotifs() {
  return useQuery({ queryKey: ['motifs-justification'], queryFn: () => api<Motif[]>('/motifs-justification') });
}

/** Formulaire commun : justifier des absences, ou corriger une justification existante. */
export function FormJustification({
  absences,
  existante,
  fermer,
  fait,
}: {
  absences: Ligne[];
  existante?: JustificationVue;
  fermer: () => void;
  fait: () => void;
}) {
  const motifs = useMotifs();
  const [motifId, setMotifId] = useState(existante?.motifId ?? '');
  const [description, setDescription] = useState(existante?.description ?? '');
  const [dateReception, setDateReception] = useState(existante?.dateReception ?? aujourdhui());
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [retirees, setRetirees] = useState<Set<string>>(new Set());
  const gardees = (existante?.pieces ?? []).filter((x) => !retirees.has(x.id)).length;
  const erreurPieces = verifierPieces(fichiers, gardees);
  const e = absences[0];
  const envoyer = useMutation({
    mutationFn: () => {
      const corps = new FormData();
      corps.append(
        'donnees',
        JSON.stringify(
          existante
            ? { motifId, description: description || null, dateReception, piecesRetirees: [...retirees] }
            : { absenceIds: absences.map((x) => x.id), motifId, description: description || null, dateReception },
        ),
      );
      fichiers.forEach((f, i) => corps.append(`piece_${i}`, f, f.name));
      return existante ? api(`/justifications/${existante.id}`, { methode: 'POST', corps }) : api<{ message: string }>('/absences/justifier', { methode: 'POST', corps });
    },
    onSuccess: (r) => {
      toast.success(existante ? 'Justification corrigée.' : ((r as { message?: string }).message ?? 'Absences justifiées.'));
      fait();
    },
    onError: (x) => toast.error(x.message),
  });
  return (
    <Modale
      titre={existante ? 'Corriger la justification' : `Justifier ${absences.length} absence${absences.length > 1 ? 's' : ''}`}
      ouverte
      fermer={fermer}
      large
      pied={
        <>
          <button type="button" className="bouton-secondaire" onClick={fermer}>
            Annuler
          </button>
          <button type="submit" form="form-justification" className="bouton-primaire" disabled={envoyer.isPending || Boolean(erreurPieces)}>
            {envoyer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </button>
        </>
      }
    >
      <form
        id="form-justification"
        className="space-y-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          envoyer.mutate();
        }}
      >
        <div className="rounded border border-bord bg-surface-2 px-3 py-2 text-sm">
          <div className="font-semibold">
            {e.nom} {e.prenoms} <span className="font-normal text-encre-2">· {e.classe}</span>
          </div>
          <ul className="mt-1 space-y-0.5 text-encre-2">
            {absences.map((x) => (
              <li key={x.id}>
                {dateCourte(x.date)} · {x.matiere} · {x.debut} – {x.fin} ({duree(x.duree)})
              </li>
            ))}
          </ul>
          {absences.length > 1 && <div className="mt-1 text-xs text-encre-3">Chaque absence reçoit sa propre justification, avec le même motif et les mêmes pièces.</div>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ libelle="Motif">
            <select className="champ" required value={motifId} onChange={(ev) => setMotifId(ev.target.value)}>
              <option value="">Choisir…</option>
              {motifs.data
                ?.filter((m) => m.actif || m.id === existante?.motifId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.libelle}
                  </option>
                ))}
            </select>
          </Champ>
          <Champ libelle="Justificatif reçu le">
            <input type="date" className="champ" required max={aujourdhui()} value={dateReception} onChange={(ev) => setDateReception(ev.target.value)} />
          </Champ>
        </div>
        <Champ libelle="Description (facultative)">
          <textarea className="champ min-h-20" maxLength={1000} value={description} onChange={(ev) => setDescription(ev.target.value)} />
        </Champ>
        <div>
          <span className="etiquette">Pièces justificatives (facultatives)</span>
          {existante && existante.pieces.length > 0 && (
            <ul className="mb-2 space-y-1">
              {existante.pieces.map((x) => (
                <li key={x.id} className={clsx('flex items-center gap-2 text-sm', retirees.has(x.id) && 'text-encre-3 line-through')}>
                  <Paperclip className="h-4 w-4" /> {x.nom}
                  <button
                    type="button"
                    className="bouton-discret ml-auto py-1 text-xs"
                    onClick={() =>
                      setRetirees((s) => {
                        const n = new Set(s);
                        if (n.has(x.id)) n.delete(x.id);
                        else n.add(x.id);
                        return n;
                      })
                    }
                  >
                    {retirees.has(x.id) ? 'Garder' : 'Retirer'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="block w-full text-sm"
            onChange={(ev) => setFichiers([...(ev.target.files ?? [])])}
          />
          <span className="mt-1 block text-xs text-encre-3">PDF, JPEG ou PNG ; 3 Mo au plus chacune ; {MAX_PIECES} au plus.</span>
          {erreurPieces && <span className="mt-1 block text-xs font-semibold text-danger">{erreurPieces}</span>}
        </div>
      </form>
    </Modale>
  );
}

export function FenetreDetail({ id, fermer, change }: { id: string; fermer: () => void; change: () => void }) {
  const { a } = useApp();
  const sg = a('SURVEILLANT_GENERAL');
  const client = useQueryClient();
  const q = useQuery({ queryKey: ['absence', id], queryFn: () => api<{ absence: Ligne; historique: Historique[] }>(`/absences/${id}`) });
  const [corriger, setCorriger] = useState(false);
  const retirer = useMutation({
    mutationFn: (jid: string) => api(`/justifications/${jid}`, { methode: 'DELETE' }),
    onSuccess: () => {
      toast.success("Justification retirée : l'absence est de nouveau non justifiée.");
      client.invalidateQueries({ queryKey: ['absence', id] });
      change();
    },
    onError: (x) => toast.error(x.message),
  });
  const l = q.data?.absence;
  const j = l?.justification;
  const lignes = useMemo(
    () =>
      l
        ? [
            ['Élève', `${l.nom} ${l.prenoms} (${l.matricule})`],
            ['Classe', l.classe],
            ['Date', dateCourte(l.date)],
            ['Séance', `${l.matiere}, ${l.debut} – ${l.fin} (${duree(l.duree)})`],
          ]
        : [],
    [l],
  );
  return (
    <>
      <Modale titre="Absence" ouverte fermer={fermer} large>
        {q.isLoading ? (
          <Chargement lignes={4} />
        ) : q.error ? (
          <Erreur erreur={q.error} />
        ) : l ? (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[8rem_1fr]">
              {lignes.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-encre-2">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
              {l.enseignantAbsent && (
                <div className="contents">
                  <dt className="text-encre-2">Remarque</dt>
                  <dd className="font-medium text-alerte">Enseignant absent ce jour-là (séance non assurée)</dd>
                </div>
              )}
            </dl>
            <div className={clsx('rounded border px-3 py-2.5', j ? 'border-succes/40 bg-succes/10' : 'border-danger/40 bg-danger/10')}>
              {j ? (
                <div className="space-y-1">
                  <div className="font-semibold text-succes">Justifiée · {j.motif}</div>
                  {j.description && <div>{j.description}</div>}
                  <div className="text-encre-2">
                    Justificatif reçu le {dateCourte(j.dateReception)}
                    {j.par ? `, enregistré par ${j.par}` : ''} le {quand(j.creeLe)}
                    {j.modifieLe ? `, corrigé le ${quand(j.modifieLe)}` : ''}.
                  </div>
                  {j.pieces.length > 0 && (
                    <ul className="flex flex-wrap gap-2 pt-1">
                      {j.pieces.map((x) => (
                        <li key={x.id}>
                          <a className="lien inline-flex items-center gap-1" href={urlProtegee(`/justifications/pieces/${x.id}`)} target="_blank" rel="noreferrer">
                            <FileText className="h-4 w-4" /> {x.nom}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {sg && (
                    <div className="flex gap-2 pt-2">
                      <button type="button" className="bouton-secondaire" onClick={() => setCorriger(true)}>
                        Corriger
                      </button>
                      <button
                        type="button"
                        className="bouton-discret text-danger"
                        disabled={retirer.isPending}
                        onClick={async () => {
                          if (await confirmer({ titre: 'Retirer la justification', message: "L'absence redeviendra non justifiée.", action: 'Retirer', danger: true })) retirer.mutate(j.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Retirer
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="font-semibold text-danger">Non justifiée</div>
              )}
            </div>
            <div>
              <div className="etiquette">Historique</div>
              {q.data!.historique.length === 0 ? (
                <p className="text-encre-3">Aucune opération sur cette absence depuis l'appel.</p>
              ) : (
                <ul className="divide-y divide-bord">
                  {q.data!.historique.map((h) => (
                    <li key={h.id} className="py-2">
                      <div className="text-xs text-encre-2">
                        {quand(h.creeLe)}
                        {h.par ? ` · ${h.par}` : ''}
                      </div>
                      <div>{h.libelle}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Modale>
      {corriger && l && j && (
        <FormJustification
          absences={[l]}
          existante={j}
          fermer={() => setCorriger(false)}
          fait={() => {
            setCorriger(false);
            client.invalidateQueries({ queryKey: ['absence', id] });
            change();
          }}
        />
      )}
    </>
  );
}

function FenetreMotifs({ fermer }: { fermer: () => void }) {
  const client = useQueryClient();
  const motifs = useMotifs();
  const [nouveau, setNouveau] = useState('');
  const maj = (l: Motif[]) => client.setQueryData(['motifs-justification'], l);
  const ajouter = useMutation({
    mutationFn: () => api<Motif[]>('/motifs-justification', { methode: 'POST', corps: { libelle: nouveau } }),
    onSuccess: (l) => {
      maj(l);
      setNouveau('');
    },
    onError: (x) => toast.error(x.message),
  });
  const modifier = useMutation({
    mutationFn: (m: Motif) => api<Motif[]>(`/motifs-justification/${m.id}`, { methode: 'PUT', corps: { libelle: m.libelle, actif: m.actif } }),
    onSuccess: maj,
    onError: (x) => toast.error(x.message),
  });
  return (
    <Modale titre="Motifs de justification" ouverte fermer={fermer}>
      <p className="mb-3 text-sm text-encre-2">Un motif déjà utilisé n'est jamais supprimé : retiré de la liste, il n'est plus proposé.</p>
      <ul className="mb-4 divide-y divide-bord rounded border border-bord">
        {motifs.data?.map((m) => (
          <li key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className={clsx('flex-1', !m.actif && 'text-encre-3 line-through')}>{m.libelle}</span>
            <button
              type="button"
              className="bouton-discret py-1 text-xs"
              onClick={() => {
                const libelle = prompt('Nouveau libellé', m.libelle);
                if (libelle && libelle.trim() && libelle !== m.libelle) modifier.mutate({ ...m, libelle: libelle.trim() });
              }}
            >
              Renommer
            </button>
            <button type="button" className="bouton-discret py-1 text-xs" onClick={() => modifier.mutate({ ...m, actif: !m.actif })}>
              {m.actif ? 'Retirer de la liste' : 'Proposer de nouveau'}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (nouveau.trim()) ajouter.mutate();
        }}
      >
        <input className="champ" placeholder="Nouveau motif" maxLength={80} value={nouveau} onChange={(ev) => setNouveau(ev.target.value)} />
        <button type="submit" className="bouton-primaire" disabled={ajouter.isPending || !nouveau.trim()}>
          Ajouter
        </button>
      </form>
    </Modale>
  );
}
