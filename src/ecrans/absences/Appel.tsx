import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarCheck, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, FileSpreadsheet, FileText, Loader2, MinusCircle, MoreVertical, Plus, Save, Trash2, UserX, X } from 'lucide-react';
import { api, ErreurApi, telecharger } from '../../lib/api';
import { requetes } from '../../lib/requetes';
import { useApp } from '../../lib/contexte';
import { useParametresUrl } from '../../lib/navigation';
import { duree } from '../../lib/format';
import type { Classe, Matiere } from '../../lib/types';
import { Carte, Chargement, Champ, Erreur, Modale, Page, Vide } from '../../components/ui';
import { confirmer } from '../../lib/confirmation';

interface Personne {
  id: string;
  nom: string;
  prenom: string;
}

interface Seance {
  id: string | null;
  creneauId: string | null;
  matiereId: string | null;
  matiere: string;
  enseignant: Personne | null;
  remplacant: Personne | null;
  debut: string;
  fin: string;
  duree: number;
  statut: 'PREVUE' | 'ANNULEE';
  ajoutee: boolean;
  enseignantAbsent: boolean;
  motif: string | null;
}

interface EleveAppel {
  inscriptionId: string;
  eleveId: string;
  nom: string;
  prenoms: string;
  matricule: string;
  renvoye: boolean;
  /** Numéro d'ordre dans la classe (1, 2… dans l'ordre alphabétique). */
  numero: number;
}

interface Vue {
  classeId: string;
  classe: string;
  date: string;
  jour: number;
  fiche: { id: string; sequenceId: string; creeLe: string; creePar: string | null; modifieLe: string | null } | null;
  sequences: { id: string; numero: number; trimestre: number; ouverte: boolean }[];
  sequenceProposee: string | null;
  seances: Seance[];
  eleves: EleveAppel[];
  absences: { seanceId: string; inscriptionId: string }[];
  emploiDuTemps: boolean;
  /** Absences de la feuille déjà justifiées. */
  justifiees: { seanceId: string; inscriptionId: string }[];
}

interface Historique {
  id: string;
  action: string;
  libelle: string;
  par: string | null;
  creeLe: string;
}

const JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Date du jour au format AAAA-MM-JJ (heure du poste). */
export function aujourdhui() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Samedi ou dimanche : pas de cours. */
const weekEnd = (iso: string) => [0, 6].includes(new Date(`${iso}T12:00:00`).getDay());

/** Jour de cours le plus proche en partant de `iso` dans le sens `pas` (-1 ou +1), week-ends sautés. */
function jourDeCours(iso: string, pas: number) {
  const d = new Date(`${iso}T12:00:00`);
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + pas);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Flèches au bord du tableau quand des séances sont cachées à droite (ou à gauche) : elles signalent qu'il faut
 * faire défiler, et un clic le fait.
 */
function FlechesDefilement({ cadre }: { cadre: RefObject<HTMLDivElement | null> }) {
  const [cote, setCote] = useState({ gauche: false, droite: false });
  useEffect(() => {
    const e = cadre.current;
    if (!e) return;
    const maj = () => setCote({ gauche: e.scrollLeft > 4, droite: e.scrollLeft + e.clientWidth < e.scrollWidth - 4 });
    maj();
    e.addEventListener('scroll', maj, { passive: true });
    const o = new ResizeObserver(maj);
    o.observe(e);
    if (e.firstElementChild) o.observe(e.firstElementChild);
    return () => {
      e.removeEventListener('scroll', maj);
      o.disconnect();
    };
  });
  const aller = (sens: number) => {
    const e = cadre.current;
    if (e) e.scrollBy({ left: sens * Math.max(220, e.clientWidth * 0.6), behavior: 'smooth' });
  };
  // À hauteur de l'en-tête des séances : visible dès que le tableau apparaît.
  const bouton = 'absolute top-12 z-[6] flex h-7 w-7 items-center justify-center rounded-full bg-primaire text-white shadow-feuille hover:bg-primaire/90 dark:text-[rgb(12_24_38)]';
  return (
    <>
      {cote.gauche && (
        <button type="button" className={clsx(bouton, 'left-[14.75rem]')} onClick={() => aller(-1)} aria-label="Voir les séances à gauche" title="Séances à gauche">
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {cote.droite && (
        <button type="button" className={clsx(bouton, 'right-[5.75rem]')} onClick={() => aller(1)} aria-label="Voir les autres séances, à droite" title="Autres séances à droite">
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </>
  );
}

const dateLongue = (iso: string, jour: number) => {
  const [a, m, j] = iso.split('-');
  return `${JOURS[jour]} ${j}/${m}/${a}`;
};

const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nomPersonne = (p: Personne | null) => (p ? `${p.prenom} ${p.nom}` : 'Aucun enseignant');
const cle = (seanceId: string, inscriptionId: string) => `${seanceId}|${inscriptionId}`;

function parNiveau(classes: Classe[]) {
  const groupes = new Map<number, Classe[]>();
  for (const c of [...classes].sort((x, y) => x.niveau - y.niveau || x.nom.localeCompare(y.nom, 'fr'))) {
    groupes.set(c.niveau, [...(groupes.get(c.niveau) ?? []), c]);
  }
  return [...groupes.entries()];
}

// Saisie en cours, gardée dans ce navigateur jusqu'à l'enregistrement (onglet fermé, page rechargée, coupure).
const cleCache = (classeId: string, date: string) => `cetic-appel:${classeId}:${date}`;
interface Cache {
  cases: string[];
  sequenceId?: string;
}
function lireCache(classeId: string, date: string): Cache | null {
  try {
    const t = localStorage.getItem(cleCache(classeId, date));
    return t ? (JSON.parse(t) as Cache) : null;
  } catch {
    return null;
  }
}
function ecrireCache(classeId: string, date: string, c: Cache) {
  try {
    localStorage.setItem(cleCache(classeId, date), JSON.stringify(c));
  } catch {
    // Stockage indisponible (navigation privée) : la saisie reste en mémoire jusqu'à l'enregistrement.
  }
}
function effacerCache(classeId: string, date: string) {
  try {
    localStorage.removeItem(cleCache(classeId, date));
  } catch {
    // rien à faire
  }
}

/** Colonne d'une séance : son identifiant une fois l'appel enregistré, son créneau avant. */
const colonne = (s: Seance) => s.id ?? `c:${s.creneauId}`;

/**
 * Feuille d'appel : une classe, un jour. Les séances viennent de l'emploi du temps ; tout le monde est présent
 * par défaut, le SG ne coche que les absents. Chaque case est gardée sur l'appareil ; « Enregistrer l'appel »
 * l'envoie une fois pour toutes, ensuite chaque modification est une correction historisée.
 */
export default function Appel() {
  const { a, annee } = useApp();
  const client = useQueryClient();
  const [params, setParams] = useParametresUrl();
  const classes = useQuery(requetes.classes(annee?.id));
  const classeId = params.get('classe') ?? parNiveau(classes.data ?? [])[0]?.[1][0]?.id ?? '';
  // Le week-end, la feuille s'ouvre sur le dernier vendredi.
  const dernierJour = jourDeCours(aujourdhui(), -1);
  const date = params.get('date') ?? dernierJour;
  const sg = a('SURVEILLANT_GENERAL');
  const q = useQuery({
    queryKey: ['appel', classeId, date],
    queryFn: () => api<Vue>(`/appel?classeId=${classeId}&date=${date}`),
    enabled: Boolean(classeId) && Boolean(date),
  });
  const v = q.data;
  const exporterFeuille = (format: 'xlsx' | 'pdf') =>
    telecharger(`/appel/export?classeId=${classeId}&date=${date}&format=${format}`, { ouvrir: format === 'pdf' }).catch((e) => toast.error(e.message));
  const enregistrees = useMemo(() => new Set((v?.absences ?? []).map((x) => cle(x.seanceId, x.inscriptionId))), [v]);
  const [cases, setCases] = useState<Set<string>>(new Set());
  const [sequenceChoisie, setSequenceChoisie] = useState('');
  const [reprise, setReprise] = useState(false);
  // Échec d'envoi (réseau coupé…) : la saisie reste sur l'appareil, on le dit sans fermer la page.
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const echec = (e: Error) => {
    if (e instanceof ErreurApi && e.statut === 0) setErreurEnvoi("Pas de réseau : rien n'est perdu, la saisie reste sur cet appareil. Réessayez.");
    else {
      setErreurEnvoi(null);
      toast.error(e.message);
    }
  };
  const [pret, setPret] = useState(false);

  // À chaque chargement : la saisie gardée sur l'appareil l'emporte sur ce qui est enregistré.
  useEffect(() => {
    if (!v) return;
    setPret(false);
    const colonnes = new Map(v.seances.filter((s) => s.statut !== 'ANNULEE').map((s) => [colonne(s), s]));
    const parCreneau = new Map(v.seances.filter((s) => s.creneauId).map((s) => [`c:${s.creneauId}`, s]));
    const renvoyes = new Set(v.eleves.filter((e) => e.renvoye).map((e) => e.inscriptionId));
    const cache = sg ? lireCache(v.classeId, v.date) : null;
    let depart = new Set(enregistrees);
    if (cache) {
      depart = new Set();
      for (const k of cache.cases) {
        const [col, ins] = k.split('|');
        // Saisie commencée avant l'enregistrement : le créneau désigne maintenant une séance enregistrée.
        const s = colonnes.get(col) ?? (v.fiche ? parCreneau.get(col) : undefined);
        if (s && s.statut !== 'ANNULEE' && !renvoyes.has(ins)) depart.add(cle(colonne(s), ins));
      }
    }
    const differe = depart.size !== enregistrees.size || [...depart].some((c) => !enregistrees.has(c));
    const sequence = cache?.sequenceId ?? v.fiche?.sequenceId ?? v.sequenceProposee ?? '';
    setReprise(Boolean(cache) && (differe || !v.fiche || sequence !== v.fiche.sequenceId) && (cache!.cases.length > 0 || Boolean(v.fiche)));
    setCases(depart);
    setSequenceChoisie(sequence);
    setPret(true);
  }, [v, enregistrees, sg]);

  // Séquence changée sur une feuille enregistrée : c'est une correction, comme une case cochée.
  const sequenceModifiee = Boolean(v?.fiche) && sequenceChoisie !== '' && sequenceChoisie !== v!.fiche!.sequenceId;
  const modifie = !v?.fiche || sequenceModifiee || cases.size !== enregistrees.size || [...cases].some((c) => !enregistrees.has(c));

  // Chaque case cochée est aussitôt gardée sur l'appareil.
  useEffect(() => {
    if (!v || !pret || !sg) return;
    const aGarder = v.fiche ? modifie : cases.size > 0 || (sequenceChoisie !== '' && sequenceChoisie !== v.sequenceProposee);
    if (aGarder) ecrireCache(v.classeId, v.date, { cases: [...cases], sequenceId: sequenceChoisie || undefined });
    else effacerCache(v.classeId, v.date);
  }, [cases, sequenceChoisie, v, pret, sg, modifie]);

  const [seanceEditee, setSeanceEditee] = useState<Seance | 'nouvelle' | null>(null);
  const [voirHistorique, setVoirHistorique] = useState(false);
  const mettreAJour = (vue: Vue) => {
    client.setQueryData(['appel', classeId, date], vue);
    client.invalidateQueries({ queryKey: ['appel-etat'] });
  };
  const aller = (classe: string, jour: string) => setParams({ classe, date: jour });

  const casesPourEnvoi = () => [...cases].map((c) => ({ colonne: c.split('|')[0], inscriptionId: c.split('|')[1] }));
  const enregistrerAppel = useMutation({
    mutationFn: () =>
      api<Vue>('/appel', {
        methode: 'POST',
        corps: {
          classeId,
          date,
          sequenceId: sequenceChoisie || v?.sequenceProposee,
          absences: casesPourEnvoi().map((c) => ({ creneauId: c.colonne.slice(2), inscriptionId: c.inscriptionId })),
        },
      }),
    onSuccess: (vue) => {
      setErreurEnvoi(null);
      effacerCache(classeId, date);
      toast.success(`Appel enregistré : ${new Set(vue.absences.map((x) => x.inscriptionId)).size} élève(s) absent(s).`);
      mettreAJour(vue);
    },
    onError: echec,
  });
  const corriger = useMutation({
    mutationFn: () =>
      api<Vue>(`/appel/${v!.fiche!.id}/absences`, {
        methode: 'PUT',
        corps: {
          absences: casesPourEnvoi().map((c) => ({ seanceId: c.colonne, inscriptionId: c.inscriptionId })),
          sequenceId: sequenceModifiee ? sequenceChoisie : null,
        },
      }),
    onSuccess: (vue) => {
      setErreurEnvoi(null);
      effacerCache(classeId, date);
      toast.success('Correction enregistrée.');
      mettreAJour(vue);
    },
    onError: echec,
  });

  // Une séance se modifie sur l'appel enregistré : s'il ne l'est pas encore, on l'enregistre d'abord.
  const editerSeance = async (s: Seance | 'nouvelle') => {
    if (v?.fiche) {
      setSeanceEditee(s);
      return;
    }
    if (
      !(await confirmer({
        titre: "Enregistrer l'appel d'abord",
        message: "Pour modifier une séance, l'appel doit d'abord être enregistré, avec les absences déjà cochées.",
        action: "Enregistrer l'appel",
      }))
    )
      return;
    try {
      const vue = await enregistrerAppel.mutateAsync();
      setSeanceEditee(s === 'nouvelle' ? 'nouvelle' : (vue.seances.find((x) => x.creneauId === s.creneauId) ?? null));
    } catch {
      // message déjà affiché
    }
  };

  // Clic sur l'en-tête d'une séance : l'enseignant prévu est marqué absent, ou de nouveau présent.
  const basculerEnseignant = async (s: Seance) => {
    if (s.statut === 'ANNULEE') {
      toast.info('Séance annulée : passez par « Modifier la séance… » pour la rétablir.');
      return;
    }
    if (s.remplacant) {
      toast.info(`Remplacé par ${nomPersonne(s.remplacant)} : la séance a été assurée. Pour changer, passez par « Modifier la séance… ».`);
      return;
    }
    const qui = nomPersonne(s.enseignant) || "L'enseignant";
    const absent = !s.enseignantAbsent;
    const oui = await confirmer({
      titre: absent ? 'Enseignant absent' : 'Enseignant de nouveau présent',
      message: (
        <>
          <p>
            <strong>{qui}</strong> · {s.matiere}, {s.debut} – {s.fin}
          </p>
          <p className="mt-1 text-encre-2">
            {absent ? 'La séance comptera comme non assurée. Les élèves absents restent comptés absents.' : 'La séance redevient assurée.'}
          </p>
        </>
      ),
      note: v?.fiche ? undefined : "L'appel sera d'abord enregistré, avec les absences déjà cochées.",
      action: absent ? 'Marquer absent' : 'Remettre présent',
    });
    if (!oui) return;
    let seance: Seance | undefined = s;
    if (!v?.fiche) {
      try {
        const vue = await enregistrerAppel.mutateAsync();
        seance = vue.seances.find((x) => x.creneauId === s.creneauId);
      } catch {
        return; // message déjà affiché
      }
    }
    if (!seance?.id) return;
    try {
      const vue = await api<Vue>(`/appel/seances/${seance.id}`, {
        methode: 'PUT',
        corps: { debut: seance.debut, fin: seance.fin, remplacantId: null, enseignantAbsent: absent, annulee: false, motif: seance.motif ?? null },
      });
      mettreAJour(vue);
      toast.success(absent ? `${qui} marqué absent.` : `${qui} de nouveau présent.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const actives = (v?.seances ?? []).filter((s) => s.statut !== 'ANNULEE');
  const cadreTableau = useRef<HTMLDivElement>(null);
  const basculer = (k: string) =>
    setCases((c) => {
      const n = new Set(c);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  // Toute la journée : absent à toutes les séances, ou de nouveau présent partout.
  const basculerJournee = (e: EleveAppel) =>
    setCases((c) => {
      const n = new Set(c);
      const toutes = actives.every((s) => n.has(cle(colonne(s), e.inscriptionId)));
      for (const s of actives) {
        if (toutes) n.delete(cle(colonne(s), e.inscriptionId));
        else n.add(cle(colonne(s), e.inscriptionId));
      }
      return n;
    });
  const minutesAbsent = (e: EleveAppel) => actives.filter((s) => cases.has(cle(colonne(s), e.inscriptionId))).reduce((n, s) => n + s.duree, 0);
  const editable = sg && Boolean(v) && v!.jour !== 7;
  const totalAbsents = (v?.eleves ?? []).filter((e) => minutesAbsent(e) > 0).length;
  const auteur = v?.fiche;

  const [recherche, setRecherche] = useState('');
  const [seulementAbsents, setSeulementAbsents] = useState(false);
  const justifiees = useMemo(() => new Set((v?.justifiees ?? []).map((x) => cle(x.seanceId, x.inscriptionId))), [v]);
  // Nombre de changements par rapport à ce qui est enregistré (ou d'absences, si l'appel ne l'est pas encore).
  const nbModifications = v?.fiche
    ? [...cases].filter((c) => !enregistrees.has(c)).length + [...enregistrees].filter((c) => !cases.has(c)).length + (sequenceModifiee ? 1 : 0)
    : cases.size;
  const elevesVus = (v?.eleves ?? []).filter(
    (e) =>
      (!recherche || String(e.numero) === recherche.trim() || sansAccents(`${e.nom} ${e.prenoms} ${e.matricule}`).includes(sansAccents(recherche))) &&
      (!seulementAbsents || minutesAbsent(e) > 0),
  );
  // Une absence justifiée qu'on décoche perd sa justification à l'enregistrement : on demande d'abord.
  const basculerCase = async (k: string) => {
    if (
      justifiees.has(k) &&
      cases.has(k) &&
      !(await confirmer({
        titre: 'Absence justifiée',
        message: "La retirer supprimera aussi sa justification à l'enregistrement.",
        action: "Retirer l'absence",
        danger: true,
      }))
    )
      return;
    basculer(k);
  };
  const toutLaSeance = async (s: Seance, absents: boolean) => {
    const cibles = (v?.eleves ?? []).filter((e) => !e.renvoye).map((e) => cle(colonne(s), e.inscriptionId));
    if (
      !absents &&
      cibles.some((k) => justifiees.has(k) && cases.has(k)) &&
      !(await confirmer({
        titre: 'Absences justifiées',
        message: "Des absences justifiées seront retirées, avec leur justification, à l'enregistrement.",
        action: 'Tous présents',
        danger: true,
      }))
    )
      return;
    setCases((c) => {
      const n = new Set(c);
      for (const k of cibles) {
        if (absents) n.add(k);
        else n.delete(k);
      }
      return n;
    });
  };
  // Flèches : de case en case ; Espace ou Entrée : présent ↔ absent.
  const naviguer = (ev: React.KeyboardEvent<HTMLTableElement>) => {
    const pas: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const d = pas[ev.key];
    const cible = ev.target as HTMLElement;
    if (!d || cible.dataset.ligne === undefined) return;
    ev.preventDefault();
    let l = Number(cible.dataset.ligne);
    let c = Number(cible.dataset.col);
    for (let k = 0; k < 40; k++) {
      l += d[0];
      c += d[1];
      const suivante = ev.currentTarget.querySelector<HTMLButtonElement>(`button[data-ligne="${l}"][data-col="${c}"]`);
      if (!suivante) return;
      if (!suivante.disabled) {
        suivante.focus();
        return;
      }
    }
  };
  // Jour de cours précédent ou suivant : le week-end est sauté (vendredi ↔ lundi).
  const voisin = (pas: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + pas);
    return jourDeCours(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, pas);
  };
  const decaler = (pas: number) => {
    const iso = voisin(pas);
    if (iso <= aujourdhui()) aller(classeId, iso);
  };
  const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const jourDe = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');
  const envoi = enregistrerAppel.isPending || corriger.isPending;

  return (
    <Page
      titre="Feuille d'appel"
      description="Tout le monde est présent par défaut : cochez seulement les absents. La saisie reste sur cet appareil jusqu'à l'enregistrement."
      actions={
        classeId && (
          <>
            {/* La feuille enregistrée de ce jour (vide si l'appel n'est pas encore fait : à remplir à la main). */}
            <button type="button" className="bouton-secondaire" onClick={() => exporterFeuille('xlsx')} disabled={!v?.eleves.length}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </button>
            <button type="button" className="bouton-secondaire" onClick={() => exporterFeuille('pdf')} disabled={!v?.eleves.length}>
              <FileText className="h-4 w-4" /> PDF
            </button>
          </>
        )
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <Champ libelle="Classe" className="w-full max-w-xs">
          <select className="champ" value={classeId} onChange={(e) => aller(e.target.value, date)}>
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
        </Champ>
        {/* Pas de <label> ici : il se lierait au bouton « Hier » (un clic sur « Date » reculerait d'un jour). */}
        <div role="group" aria-labelledby="date-appel">
          <span id="date-appel" className="etiquette">
            Date
          </span>
          <div className="flex items-center gap-1">
            <button type="button" className="bouton-secondaire px-2.5" onClick={() => decaler(-1)} title="Jour de cours précédent">
              <ChevronLeft className="h-4 w-4" /> Hier
            </button>
            <input type="date" aria-label="Date de l'appel" className="champ w-auto" value={date} max={aujourdhui()} onChange={(e) => e.target.value && aller(classeId, e.target.value)} />
            <button type="button" className="bouton-secondaire px-2.5" onClick={() => decaler(1)} disabled={voisin(1) > aujourdhui()} title="Jour de cours suivant">
              Demain <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <button type="button" className="bouton-secondaire" onClick={() => aller(classeId, dernierJour)} disabled={date === dernierJour}>
          <CalendarCheck className="h-4 w-4" /> Aujourd'hui
        </button>
        {v && <span className="pb-2 text-sm font-semibold capitalize text-encre-2">{dateLongue(v.date, v.jour)}</span>}
      </div>

      {!weekEnd(date) && <EtatDuJour date={date} classeId={classeId} choisir={(c) => aller(c, date)} />}

      {q.isLoading ? (
        <Chargement />
      ) : q.error ? (
        <Erreur erreur={q.error} />
      ) : !v ? null : v.jour >= 6 ? (
        <Carte>
          <Vide titre="Week-end">Les cours ont lieu du lundi au vendredi : pas d'appel le samedi ni le dimanche.</Vide>
        </Carte>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {sg ? (
              <label className="flex items-center gap-2 text-sm text-encre-2">
                Rattachée à la
                <select
                  value={sequenceChoisie}
                  onChange={(e) => setSequenceChoisie(e.target.value)}
                  className={clsx('champ w-auto py-1.5', sequenceModifiee && 'border-alerte ring-2 ring-alerte/30')}
                  title="Séquence dont les bulletins compteront ces absences"
                >
                  {v.sequences.map((s) => (
                    <option key={s.id} value={s.id}>
                      séquence {s.numero}
                      {s.ouverte ? ' (ouverte)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              v.fiche && <span className="text-sm text-encre-2">Séquence {v.sequences.find((s) => s.id === v.fiche!.sequenceId)?.numero}</span>
            )}
            {auteur ? (
              <span className="text-sm text-encre-2">
                <CheckCircle2 className="mr-1 inline h-4 w-4 text-succes" />
                Enregistré{auteur.creePar ? ` par ${auteur.creePar}` : ''} le {jourDe(auteur.creeLe)} à {heure(auteur.creeLe)}
                {auteur.modifieLe ? `, corrigé à ${heure(auteur.modifieLe)}` : ''} ·{' '}
                <button type="button" className="lien" onClick={() => setVoirHistorique(true)}>
                  Voir l'historique
                </button>
              </span>
            ) : (
              <span className="text-sm text-encre-2">{sg ? "Pas encore enregistré." : "L'appel de ce jour n'a pas encore été enregistré."}</span>
            )}
            {sg && (
              <button type="button" className="bouton-discret ml-auto" onClick={() => editerSeance('nouvelle')}>
                <Plus className="h-4 w-4" /> Ajouter une séance
              </button>
            )}
          </div>

          {v.seances.length === 0 ? (
            <Carte>
              <Vide titre="Aucune séance ce jour-là">
                {v.emploiDuTemps
                  ? "L'emploi du temps ne prévoit pas de cours ce jour-là. Ajoutez les séances qui ont eu lieu pour cocher les absents."
                  : "Cette classe n'a pas encore d'emploi du temps : saisissez-le (Organisation › Emploi du temps), ou ajoutez les séances de ce jour à la main."}
              </Vide>
            </Carte>
          ) : (
            <>
              {/* Barre d'enregistrement au-dessus du tableau : elle ne cache jamais de ligne. */}
              {editable && (
                <div
                  className={clsx(
                    'flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2',
                    erreurEnvoi ? 'border-danger/50 bg-danger/10' : modifie ? 'border-alerte/50 bg-alerte/10' : 'border-bord bg-surface',
                  )}
                >
                  <span role="status" className={clsx('mr-auto text-sm', erreurEnvoi ? 'font-semibold text-danger' : modifie ? 'font-semibold text-alerte' : 'text-encre-2')}>
                    {envoi
                      ? 'Enregistrement…'
                      : erreurEnvoi
                        ? erreurEnvoi
                        : !v.fiche
                          ? `Pas encore enregistré · ${totalAbsents} élève${totalAbsents > 1 ? 's' : ''} absent${totalAbsents > 1 ? 's' : ''} · saisie gardée sur cet appareil`
                          : modifie
                            ? `${nbModifications} modification${nbModifications > 1 ? 's' : ''} non enregistrée${nbModifications > 1 ? 's' : ''} · gardée${nbModifications > 1 ? 's' : ''} sur cet appareil`
                            : `Tout est enregistré · ${totalAbsents} élève${totalAbsents > 1 ? 's' : ''} absent${totalAbsents > 1 ? 's' : ''}`}
                  </span>
                  {reprise && !erreurEnvoi && <span className="text-xs text-encre-2">Saisie reprise depuis cet appareil.</span>}
                  {!v.fiche ? (
                    <button
                      type="button"
                      className="bouton-primaire"
                      disabled={envoi}
                      onClick={async () => {
                        if (
                          await confirmer({
                            titre: "Enregistrer l'appel",
                            message: totalAbsents
                              ? `${totalAbsents} élève${totalAbsents > 1 ? 's' : ''} absent${totalAbsents > 1 ? 's' : ''}, les autres présents.`
                              : 'Aucun absent : tous les élèves sont présents.',
                            action: 'Enregistrer',
                          })
                        )
                          enregistrerAppel.mutate();
                      }}
                    >
                      {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Enregistrer l'appel
                    </button>
                  ) : (
                    <button type="button" className="bouton-primaire" disabled={!modifie || envoi} onClick={() => corriger.mutate()}>
                      {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Enregistrer{modifie ? ` · ${nbModifications} modification${nbModifications > 1 ? 's' : ''}` : ''}
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <input
                  className="champ max-w-xs"
                  placeholder="Rechercher un élève"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  aria-label="Rechercher un élève"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={seulementAbsents} onChange={(e) => setSeulementAbsents(e.target.checked)} />
                  Seulement les absents
                </label>
                {/* Légende : chaque état a un symbole et un mot, pas seulement une couleur. */}
                <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-encre-2">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-bord-champ text-encre-3">·</span> Présent
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-danger text-white dark:text-[rgb(12_24_38)]">
                      <X className="h-3.5 w-3.5" />
                    </span>
                    Absent
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-primaire bg-primaire-pale text-primaire">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    Absence justifiée
                  </span>
                  {editable && <span>Clic sur un nom : toute la journée · flèches et Espace au clavier</span>}
                </div>
              </div>

              {/* Le tableau défile dans son cadre : l'en-tête reste en haut, les noms à gauche, le total à droite. */}
              <div className="relative">
              <FlechesDefilement cadre={cadreTableau} />
              <div ref={cadreTableau} className="max-h-[calc(100dvh-14rem)] min-h-[18rem] overflow-auto rounded-lg border border-bord bg-surface">
                <table className="w-full border-separate border-spacing-0 text-sm" onKeyDown={naviguer}>
                  <thead>
                    <tr>
                      <th className="sticky left-0 top-0 z-[3] min-w-[14rem] border-b border-r border-bord bg-surface-2 px-3 py-2 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-encre-2">
                        Élève
                      </th>
                      {v.seances.map((s) => {
                        const absents = v.eleves.filter((e) => cases.has(cle(colonne(s), e.inscriptionId))).length;
                        const annulee = s.statut === 'ANNULEE';
                        return (
                          <th
                            key={colonne(s)}
                            className={clsx(
                              'sticky top-0 z-[2] min-w-[8.5rem] border-b border-r border-bord px-2 py-2 text-left align-top font-normal',
                              annulee ? 'bg-surface-2 text-encre-3' : 'bg-primaire-pale text-encre',
                            )}
                          >
                            <div className="flex items-start gap-1">
                              {/* Le SG marque l'enseignant absent (ou présent) d'un clic sur la matière ou l'enseignant. */}
                              {(() => {
                                const contenu = (
                                  <>
                                    <span className={clsx('block font-bold leading-tight', annulee && 'line-through')}>{s.matiere}</span>
                                    <span className="block whitespace-nowrap text-xs tabular-nums text-encre-2">
                                      {s.debut} – {s.fin} · {duree(s.duree)}
                                    </span>
                                    <span className="block truncate text-xs text-encre-2">{s.remplacant ? `Remplacé par ${nomPersonne(s.remplacant)}` : nomPersonne(s.enseignant)}</span>
                                  </>
                                );
                                return sg ? (
                                  <button
                                    type="button"
                                    onClick={() => basculerEnseignant(s)}
                                    title={s.enseignantAbsent ? 'Enseignant absent : cliquer pour le remettre présent' : "Cliquer pour marquer l'enseignant absent"}
                                    className="-m-1 min-w-0 flex-1 rounded p-1 text-left hover:bg-primaire/10"
                                  >
                                    {contenu}
                                  </button>
                                ) : (
                                  <div className="min-w-0 flex-1">{contenu}</div>
                                );
                              })()}
                              {sg && <MenuSeance annulee={annulee} toutAbsent={() => toutLaSeance(s, true)} toutPresent={() => toutLaSeance(s, false)} modifier={() => editerSeance(s)} />}
                            </div>
                            {annulee ? (
                              <div className="mt-1 text-xs font-semibold">Annulée{s.motif ? ` : ${s.motif}` : ''}</div>
                            ) : (
                              <div className={clsx('mt-1 text-xs font-semibold', absents > 0 ? 'text-danger' : 'text-encre-2')}>
                                {absents} absent{absents > 1 ? 's' : ''}
                              </div>
                            )}
                            {s.enseignantAbsent && (
                              <div className="mt-0.5 inline-block rounded bg-alerte px-1.5 text-xs font-semibold text-white dark:text-[rgb(12_24_38)]">Enseignant absent</div>
                            )}
                            {s.ajoutee && <div className="mt-0.5 text-xs font-semibold text-encre-2">Ajoutée{s.motif ? ` : ${s.motif}` : ''}</div>}
                          </th>
                        );
                      })}
                      <th className="sticky right-0 top-0 z-[3] border-b border-l border-bord bg-surface-2 px-3 py-2 text-right align-bottom text-xs font-semibold uppercase tracking-wide text-encre-2">
                        Total abs.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {elevesVus.length === 0 && (
                      <tr>
                        <td colSpan={v.seances.length + 2} className="px-3 py-6 text-center text-encre-2">
                          {seulementAbsents ? 'Aucun élève absent pour le moment.' : 'Aucun élève ne correspond à la recherche.'}
                        </td>
                      </tr>
                    )}
                    {elevesVus.map((e, i) => {
                      const minutes = minutesAbsent(e);
                      const fond = i % 2 === 1 ? 'bg-surface-2' : 'bg-surface';
                      return (
                        <tr key={e.inscriptionId} className="group">
                          <td className={clsx('sticky left-0 z-[1] border-b border-r border-bord px-3 py-1.5 group-hover:bg-primaire-pale', fond)}>
                            <button
                              type="button"
                              disabled={!editable || e.renvoye || actives.length === 0}
                              onClick={() => basculerJournee(e)}
                              className="w-full cursor-pointer text-left disabled:cursor-default"
                              title={editable && !e.renvoye ? 'Absent toute la journée (ou de nouveau présent partout)' : undefined}
                            >
                              <span className="mr-2 inline-block w-6 text-right font-semibold tabular-nums text-encre-2">{e.numero}</span>
                              <span className="font-medium">{e.nom}</span> <span className="text-encre-2">{e.prenoms}</span>
                              {e.renvoye && <span className="ml-2 text-xs font-semibold text-encre-2">Renvoyé(e)</span>}
                            </button>
                          </td>
                          {v.seances.map((s, j) => {
                            const k = cle(colonne(s), e.inscriptionId);
                            const absent = cases.has(k);
                            const justifiee = absent && justifiees.has(k);
                            const bloque = !editable || e.renvoye || s.statut === 'ANNULEE';
                            return (
                              <td key={colonne(s)} className={clsx('border-b border-r border-bord p-1 group-hover:bg-primaire-pale', s.statut === 'ANNULEE' ? 'bg-surface-2' : fond)}>
                                {s.statut !== 'ANNULEE' && !e.renvoye && (
                                  <button
                                    type="button"
                                    disabled={bloque}
                                    data-ligne={i}
                                    data-col={j}
                                    onClick={() => basculerCase(k)}
                                    aria-pressed={absent}
                                    aria-label={`${e.nom} ${e.prenoms}, ${s.matiere} ${s.debut} : ${justifiee ? 'absence justifiée' : absent ? 'absent' : 'présent'}`}
                                    className={clsx(
                                      'flex h-8 w-full items-center justify-center gap-1 rounded text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primaire',
                                      justifiee
                                        ? 'border border-primaire bg-primaire-pale text-primaire'
                                        : absent
                                          ? 'bg-danger text-white dark:text-[rgb(12_24_38)]'
                                          : 'border border-bord-champ/60 text-encre-3',
                                      !bloque && 'cursor-pointer',
                                      !bloque && !absent && 'hover:border-danger hover:bg-danger/10 hover:text-danger',
                                    )}
                                  >
                                    {justifiee ? (
                                      <>
                                        <Check className="h-3.5 w-3.5" /> Justifiée
                                      </>
                                    ) : absent ? (
                                      <>
                                        <X className="h-3.5 w-3.5" /> Absent
                                      </>
                                    ) : (
                                      '·'
                                    )}
                                  </button>
                                )}
                              </td>
                            );
                          })}
                          <td
                            className={clsx(
                              'sticky right-0 z-[1] whitespace-nowrap border-b border-l border-bord px-3 text-right tabular-nums group-hover:bg-primaire-pale',
                              fond,
                              minutes > 0 ? 'font-semibold text-danger' : 'text-encre-3',
                            )}
                          >
                            {minutes > 0 ? duree(minutes) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
            </>
          )}
        </>
      )}

      {seanceEditee && v?.fiche && (
        <FormSeance
          ficheId={v.fiche.id}
          classeId={classeId}
          seance={seanceEditee === 'nouvelle' ? null : seanceEditee}
          absents={seanceEditee === 'nouvelle' ? 0 : v.eleves.filter((e) => seanceEditee.id && enregistrees.has(cle(seanceEditee.id, e.inscriptionId))).length}
          fermer={() => setSeanceEditee(null)}
          enregistre={mettreAJour}
        />
      )}
      {voirHistorique && v?.fiche && <FenetreHistorique ficheId={v.fiche.id} fermer={() => setVoirHistorique(false)} />}
    </Page>
  );
}

function FormSeance({
  ficheId,
  classeId,
  seance,
  absents,
  fermer,
  enregistre,
}: {
  ficheId: string;
  classeId: string;
  seance: Seance | null;
  absents: number;
  fermer: () => void;
  enregistre: (v: Vue) => void;
}) {
  const { annee } = useApp();
  const enseignants = useQuery(requetes.enseignants(annee?.id));
  const matieres = useQuery({
    queryKey: ['matieres', annee?.id, classeId],
    queryFn: () => api<Matiere[]>(`/matieres?classeId=${classeId}`),
    enabled: !seance,
  });
  const [f, setF] = useState({
    matiereId: '',
    debut: seance?.debut ?? '',
    fin: seance?.fin ?? '',
    remplacantId: seance?.remplacant?.id ?? '',
    enseignantAbsent: seance?.enseignantAbsent ?? false,
    annulee: seance?.statut === 'ANNULEE',
    motif: seance?.motif ?? '',
  });
  const enregistrer = useMutation({
    mutationFn: () =>
      seance
        ? api<Vue>(`/appel/seances/${seance.id}`, {
            methode: 'PUT',
            corps: { debut: f.debut, fin: f.fin, remplacantId: f.remplacantId || null, enseignantAbsent: f.enseignantAbsent, annulee: f.annulee, motif: f.motif || null },
          })
        : api<Vue>(`/appel/${ficheId}/seances`, { methode: 'POST', corps: { matiereId: f.matiereId, debut: f.debut, fin: f.fin, motif: f.motif || null } }),
    onSuccess: (v) => {
      toast.success(seance ? 'Séance modifiée.' : 'Séance ajoutée.');
      enregistre(v);
      fermer();
    },
    onError: (e) => toast.error(e.message),
  });
  const retirer = useMutation({
    mutationFn: () => api<Vue>(`/appel/seances/${seance!.id}`, { methode: 'DELETE' }),
    onSuccess: (v) => {
      toast.success('Séance retirée.');
      enregistre(v);
      fermer();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Modale
      titre={seance ? `${seance.matiere}, ce jour-là` : 'Ajouter une séance pour ce jour'}
      ouverte
      fermer={fermer}
      pied={
        <>
          {seance?.ajoutee && (
            <button type="button" className="bouton-discret mr-auto text-danger" disabled={retirer.isPending} onClick={() => retirer.mutate()}>
              <Trash2 className="h-4 w-4" /> Retirer
            </button>
          )}
          <button type="button" className="bouton-secondaire" onClick={fermer}>
            Annuler
          </button>
          <button type="submit" form="form-seance" className="bouton-primaire" disabled={enregistrer.isPending}>
            {enregistrer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </button>
        </>
      }
    >
      <form
        id="form-seance"
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            f.annulee &&
            !seance?.statut.includes('ANNULEE') &&
            absents > 0 &&
            !(await confirmer({
              titre: 'Annuler la séance',
              message: `Ses ${absents} absence${absents > 1 ? 's' : ''} seront effacée${absents > 1 ? 's' : ''} : personne n'est compté absent à une séance qui n'a pas eu lieu.`,
              action: 'Annuler la séance',
              danger: true,
            }))
          )
            return;
          enregistrer.mutate();
        }}
      >
        {!seance && (
          <Champ libelle="Matière" className="sm:col-span-2" aide="Pour un cours déplacé sur ce jour ou un rattrapage.">
            <select className="champ" required value={f.matiereId} onChange={(e) => setF({ ...f, matiereId: e.target.value })}>
              <option value="">Choisir…</option>
              {matieres.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nom}
                </option>
              ))}
            </select>
          </Champ>
        )}
        <Champ libelle="Début">
          <input type="time" className="champ" required step={300} value={f.debut} onChange={(e) => setF({ ...f, debut: e.target.value })} />
        </Champ>
        <Champ libelle="Fin">
          <input type="time" className="champ" required step={300} value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} />
        </Champ>
        {seance && (
          <>
            <Champ libelle="Remplaçant" className="sm:col-span-2" aide={`Enseignant prévu : ${nomPersonne(seance.enseignant)}`}>
              <select className="champ" value={f.remplacantId} onChange={(e) => setF({ ...f, remplacantId: e.target.value, enseignantAbsent: false })}>
                <option value="">Pas de remplaçant</option>
                {enseignants.data
                  ?.filter((p) => p.id !== seance.enseignant?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.prenom} {p.nom}
                    </option>
                  ))}
              </select>
            </Champ>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={f.enseignantAbsent}
                disabled={Boolean(f.remplacantId) || f.annulee}
                onChange={(e) => setF({ ...f, enseignantAbsent: e.target.checked })}
              />
              <span>
                <span className="font-medium">Enseignant absent</span> : séance non assurée. Les élèves absents restent comptés absents.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.annulee} onChange={(e) => setF({ ...f, annulee: e.target.checked, enseignantAbsent: false })} />
              <span>
                <span className="font-medium">Séance annulée</span> : elle n'a pas eu lieu, personne n'y est compté absent.
              </span>
            </label>
          </>
        )}
        <Champ libelle="Motif (facultatif)" className="sm:col-span-2">
          <input className="champ" maxLength={300} value={f.motif} onChange={(e) => setF({ ...f, motif: e.target.value })} placeholder="Sortie pédagogique, cours déplacé…" />
        </Champ>
      </form>
    </Modale>
  );
}

function FenetreHistorique({ ficheId, fermer }: { ficheId: string; fermer: () => void }) {
  const q = useQuery({ queryKey: ['appel-historique', ficheId], queryFn: () => api<Historique[]>(`/appel/${ficheId}/historique`) });
  return (
    <Modale titre="Historique de la feuille" ouverte fermer={fermer} large>
      {q.isLoading ? (
        <Chargement lignes={4} />
      ) : q.error ? (
        <Erreur erreur={q.error} />
      ) : (
        <ul className="divide-y divide-bord">
          {q.data?.map((h) => (
            <li key={h.id} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-encre-2">
                <span>{new Date(h.creeLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                {h.par && <span>· {h.par}</span>}
                {h.action === 'absences.corriger' && (
                  <span className="inline-flex items-center gap-1 font-semibold text-alerte">
                    <UserX className="h-3.5 w-3.5" /> Correction
                  </span>
                )}
              </div>
              <div>{h.libelle}</div>
            </li>
          ))}
        </ul>
      )}
    </Modale>
  );
}

/** Menu d'une colonne : tous absents, tous présents, modifier la séance pour ce jour. */
function MenuSeance({ annulee, toutAbsent, toutPresent, modifier }: { annulee: boolean; toutAbsent: () => void; toutPresent: () => void; modifier: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const choisir = (f: () => void) => () => {
    setOuvert(false);
    f();
  };
  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOuvert(false)}>
      <button type="button" className="rounded p-1 text-encre-2 hover:bg-surface hover:text-encre" aria-label="Actions de la séance" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        <MoreVertical className="h-4 w-4" />
      </button>
      {ouvert && (
        <div role="menu" className="absolute right-0 top-7 z-20 w-48 overflow-hidden rounded-md border border-bord bg-surface py-1 text-sm shadow-feuille">
          {!annulee && (
            <>
              <button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-surface-2" onClick={choisir(toutAbsent)}>
                Tous absents
              </button>
              <button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-surface-2" onClick={choisir(toutPresent)}>
                Tous présents
              </button>
            </>
          )}
          <button type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-surface-2" onClick={choisir(modifier)}>
            Modifier la séance…
          </button>
        </div>
      )}
    </div>
  );
}

interface EtatClasse {
  classeId: string;
  classe: string;
  niveau: number;
  emploiDuTemps: boolean;
  seancesPrevues: number;
  fait: boolean;
  elevesAbsents: number;
}

/**
 * Où en est l'appel du jour : chaque classe, faite (avec ses absents), à faire, ou sans cours. Le statut est
 * dit par une icône et un mot, pas seulement par la couleur (WCAG 1.4.1).
 */
function EtatDuJour({ date, classeId, choisir }: { date: string; classeId: string; choisir: (classeId: string) => void }) {
  const { annee } = useApp();
  const q = useQuery({ queryKey: ['appel-etat', annee?.id, date], queryFn: () => api<EtatClasse[]>(`/appel/etat?date=${date}`) });
  const liste = q.data ?? [];
  if (liste.length === 0) return null;
  // D'abord les classes qui ont un emploi du temps ; les autres sont repliées (moins de bruit).
  const avec = liste.filter((c) => c.emploiDuTemps || c.fait);
  const sans = liste.filter((c) => !c.emploiDuTemps && !c.fait);
  const aFaire = liste.filter((c) => !c.fait && c.seancesPrevues > 0).length;
  const faites = liste.filter((c) => c.fait).length;
  const puce = (c: EtatClasse) => {
    const sansCours = !c.fait && c.seancesPrevues === 0;
    return (
      <button
        key={c.classeId}
        type="button"
        onClick={() => choisir(c.classeId)}
        aria-current={c.classeId === classeId ? 'true' : undefined}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm',
          c.classeId === classeId ? 'border-primaire ring-2 ring-primaire/30' : 'border-bord-champ',
          c.fait ? 'bg-succes/10 text-succes' : sansCours ? 'bg-surface-2 text-encre-3' : 'bg-surface text-encre',
        )}
      >
        {c.fait ? <CheckCircle2 className="h-4 w-4" /> : sansCours ? <MinusCircle className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
        <span className="font-medium">{c.classe}</span>
        <span className="text-xs">
          {c.fait ? `fait · ${c.elevesAbsents} absent${c.elevesAbsents > 1 ? 's' : ''}` : sansCours ? (c.emploiDuTemps ? 'pas de cours' : "pas d'emploi du temps") : 'à faire'}
        </span>
      </button>
    );
  };
  return (
    <div className="space-y-2">
      <p className="text-sm text-encre-2">
        <span className="font-semibold text-encre">
          {faites} classe{faites > 1 ? 's' : ''} faite{faites > 1 ? 's' : ''}
        </span>
        {aFaire > 0 ? ` · ${aFaire} à faire` : " · rien d'autre à faire"} ce jour-là.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {avec.map(puce)}
        {sans.length > 0 && (
          <details className="group" open={sans.some((c) => c.classeId === classeId) && avec.length === 0 ? true : undefined}>
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full px-3 py-1 text-sm text-encre-2 hover:bg-surface-2">
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              {sans.length} classe{sans.length > 1 ? 's' : ''} sans emploi du temps
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">{sans.map(puce)}</div>
          </details>
        )}
      </div>
    </div>
  );
}
