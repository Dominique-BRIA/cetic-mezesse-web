import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BellRing, FileSpreadsheet, FileText, Gavel, Loader2 } from 'lucide-react';
import { api, telecharger } from '../../lib/api';
import { requetes } from '../../lib/requetes';
import { useApp } from '../../lib/contexte';
import { useParametresUrl } from '../../lib/navigation';
import { duree, libellePeriode } from '../../lib/format';
import { confirmer } from '../../lib/confirmation';
import type { Classe, CodePeriode, LigneBulletin, SanctionAbsence } from '../../lib/types';
import { Carte, Chargement, Champ, ChoixPeriode, Erreur, Etat, Modale, Page, Vide } from '../../components/ui';
import { aujourdhui } from './Appel';

export type TypeExclusion = 'TEMPORAIRE' | 'DEFINITIVE' | 'SURSIS';

export interface Decision {
  id: string;
  type: TypeExclusion;
  jours: number | null;
  date: string;
  motif: string | null;
}

export interface BilanEleve {
  inscriptionId: string;
  eleveId: string;
  nom: string;
  prenoms: string;
  matricule: string;
  seances: number;
  minutes: number;
  justifiees: number;
  nonJustifiees: number;
  cumulNonJustifiees: number;
  sanction: LigneBulletin;
  /** Libellé affiché ; vide : aucune sanction. */
  libelleSanction: string | null;
  joursExclusion: number;
  palierExclusion: boolean;
  /** Le Directeur a été prévenu (champ nommé d'après le rôle technique). */
  proviseurPrevenu: boolean;
  /** Dernière décision de l'année, s'il y en a une. */
  decision: Decision | null;
  /** Numéro d'ordre dans la classe (1, 2… dans l'ordre alphabétique). */
  numero: number;
  classeId: string;
  classe: string;
}

interface Bilan {
  classeId: string;
  periode: CodePeriode;
  sanctions: SanctionAbsence[];
  eleves: BilanEleve[];
}

function parNiveau(classes: Classe[]) {
  const groupes = new Map<number, Classe[]>();
  for (const c of [...classes].sort((x, y) => x.niveau - y.niveau || x.nom.localeCompare(y.nom, 'fr'))) {
    groupes.set(c.niveau, [...(groupes.get(c.niveau) ?? []), c]);
  }
  return [...groupes.entries()];
}

const h = (m: number) => (m ? duree(m) : '—');
const jjmm = (iso: string) => iso.split('-').reverse().join('/');
const jours = (n: number) => `${n} jour${n > 1 ? 's' : ''}`;

/** La décision en une phrase (« exclusion temporaire de 3 jours à partir du 16/11/2026 »). */
function resume(d: Decision) {
  if (d.type === 'TEMPORAIRE') return `exclusion temporaire de ${jours(d.jours ?? 0)} à partir du ${jjmm(d.date)}`;
  if (d.type === 'DEFINITIVE') return `exclusion définitive de l'établissement à partir du ${jjmm(d.date)}`;
  return `sursis accordé le ${jjmm(d.date)}`;
}

export function Sanction({ e }: { e: BilanEleve }) {
  if (!e.libelleSanction) return <span className="text-encre-3">—</span>;
  if (e.sanction === 'EXCLUSION')
    return <Etat ton="danger">{e.libelleSanction === 'Exclusion temporaire' ? `${e.libelleSanction} · ${jours(e.joursExclusion)}` : e.libelleSanction}</Etat>;
  return <Etat ton={e.sanction === 'BLAME' ? 'danger' : 'alerte'}>{e.libelleSanction}</Etat>;
}

/** Premier jour de classe à partir d'aujourd'hui (le week-end, le lundi suivant). */
function prochainJourDeClasse() {
  const d = new Date(`${aujourdhui()}T12:00:00`);
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CHOIX: { type: TypeExclusion; titre: string; consequence: string; bulletin: string }[] = [
  {
    type: 'TEMPORAIRE',
    titre: 'Exclusion temporaire',
    consequence: "L'élève est renvoyé chez lui pendant le nombre de jours ouvrés indiqué, puis reprend les cours de lui-même.",
    bulletin: 'Exclusion : nombre de jours',
  },
  {
    type: 'DEFINITIVE',
    titre: 'Exclusion définitive',
    consequence: "L'élève est radié de l'établissement pour toujours : il figure parmi les élèves renvoyés et ne peut plus être réinscrit.",
    bulletin: 'Exclusion : définitive',
  },
  {
    type: 'SURSIS',
    titre: 'Sursis (maintien sous condition)',
    consequence: "L'élève reste en classe ; l'exclusion est suspendue, avec un avertissement solennel aux parents.",
    bulletin: 'Blâme, avec la mention du sursis',
  },
];

/** Décision du Directeur pour un élève qui a atteint les heures d'exclusion. */
export function FenetreDecision({ eleve, fermer, fait }: { eleve: BilanEleve; fermer: () => void; fait: () => void }) {
  const [type, setType] = useState<TypeExclusion>('TEMPORAIRE');
  const [nbJours, setNbJours] = useState(3);
  const [date, setDate] = useState(prochainJourDeClasse());
  const [motif, setMotif] = useState('');
  const envoi = useMutation({
    mutationFn: () =>
      api<{ message: string }>('/absences/exclusions', {
        methode: 'POST',
        corps: { inscriptionId: eleve.inscriptionId, type, jours: type === 'TEMPORAIRE' ? nbJours : null, date, motif: motif.trim() || null },
      }),
    onSuccess: (r) => {
      toast.success(r.message);
      fait();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Modale
      titre="Décision d'exclusion"
      ouverte
      fermer={fermer}
      pied={
        <>
          <button type="button" className="bouton-secondaire" onClick={fermer}>
            Annuler
          </button>
          <button type="button" className={type === 'SURSIS' ? 'bouton-primaire' : 'bouton-danger'} disabled={envoi.isPending || !date || (type === 'TEMPORAIRE' && nbJours < 1)} onClick={() => envoi.mutate()}>
            {envoi.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer la décision
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm">
          <strong>
            {eleve.nom} {eleve.prenoms}
          </strong>{' '}
          a <strong className="text-danger">{duree(eleve.cumulNonJustifiees)}</strong> d'absences non justifiées depuis la rentrée.
        </p>
        <fieldset className="space-y-2">
          <legend className="etiquette">Décision</legend>
          {CHOIX.map((c) => (
            <label
              key={c.type}
              className={clsx('flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5', type === c.type ? 'border-primaire bg-primaire-pale' : 'border-bord hover:bg-surface-2')}
            >
              <input type="radio" name="decision" className="mt-1 h-4 w-4" checked={type === c.type} onChange={() => setType(c.type)} />
              <span className="text-sm">
                <span className="block font-semibold">{c.titre}</span>
                <span className="block text-encre-2">{c.consequence}</span>
                <span className="block text-xs text-encre-2">Sur le bulletin : {c.bulletin}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          {type === 'TEMPORAIRE' && (
            <Champ libelle="Nombre de jours ouvrés">
              <input
                type="number"
                min={1}
                className="champ text-right tabular-nums"
                value={nbJours || ''}
                onChange={(e) => setNbJours(Math.max(0, Math.floor(Number(e.target.value))))}
              />
            </Champ>
          )}
          <Champ libelle={type === 'SURSIS' ? 'Date de la décision' : "Début de l'exclusion"}>
            <input type="date" className="champ" value={date} onChange={(e) => setDate(e.target.value)} />
          </Champ>
        </div>
        <Champ libelle="Motif ou observation (facultatif)">
          <textarea className="champ" rows={2} maxLength={500} value={motif} onChange={(e) => setMotif(e.target.value)} />
        </Champ>
      </div>
    </Modale>
  );
}

/**
 * Sanction d'un élève, la décision du Directeur (annulable par lui), ou l'alerte « heures d'exclusion
 * atteintes » avec le bouton « Décider » : bilan des absences et liste des élèves.
 */
export function CelluleSanction({
  e,
  decider,
  annuler,
  enCours,
}: {
  e: BilanEleve;
  decider: (e: BilanEleve) => void;
  annuler: (decisionId: string) => void;
  enCours?: boolean;
}) {
  const { a } = useApp();
  const directeur = a('PROVISEUR');
  return (
    <>
      <Sanction e={e} />
      {e.decision ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-encre-2">
          <span>
            <Gavel className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Décision de la direction : {resume(e.decision)}
          </span>
          {directeur && (
            <button
              type="button"
              className="bouton-secondaire px-2 py-0.5 text-xs text-danger"
              disabled={enCours}
              onClick={async () => {
                if (
                  await confirmer({
                    titre: 'Annuler la décision',
                    message: `${e.nom} ${e.prenoms} : ${resume(e.decision!)}.`,
                    note: "À n'utiliser qu'en cas d'erreur : l'élève n'est plus exclu.",
                    action: 'Annuler la décision',
                    danger: true,
                  })
                )
                  annuler(e.decision!.id);
              }}
            >
              Annuler la décision
            </button>
          )}
        </div>
      ) : (
        e.palierExclusion && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-danger">
            <span className="flex items-center gap-1">
              <BellRing className="h-3.5 w-3.5" aria-hidden /> Heures d'exclusion atteintes{e.proviseurPrevenu ? ' · Directeur prévenu' : ''}
            </span>
            {directeur && (
              <button type="button" className="bouton-danger px-2 py-0.5 text-xs" onClick={() => decider(e)}>
                <Gavel className="h-3.5 w-3.5" /> Décider
              </button>
            )}
          </div>
        )
      )}
    </>
  );
}

/**
 * Bilan des absences d'une classe pour une période : heures totales, justifiées et non justifiées, cumul
 * depuis la rentrée et sanction retenue pour le bulletin. Quand un élève atteint les heures d'exclusion, le
 * Directeur est prévenu et décide ici : exclusion temporaire, définitive, ou sursis.
 */
export default function BilanAbsences() {
  const { annee } = useApp();
  const client = useQueryClient();
  const [params, setParams] = useParametresUrl();
  const classes = useQuery(requetes.classes(annee?.id));
  const classeId = params.get('classe') ?? parNiveau(classes.data ?? [])[0]?.[1][0]?.id ?? '';
  const periode = (params.get('periode') ?? 'A') as CodePeriode;
  const q = useQuery({
    queryKey: ['absences-bilan', classeId, periode],
    queryFn: () => api<Bilan>(`/absences/bilan?classeId=${classeId}&periode=${periode}`),
    enabled: Boolean(classeId),
  });
  const b = q.data;
  const totaux = (b?.eleves ?? []).reduce((t, e) => ({ minutes: t.minutes + e.minutes, j: t.j + e.justifiees, nj: t.nj + e.nonJustifiees }), { minutes: 0, j: 0, nj: 0 });
  const [aDecider, setADecider] = useState<BilanEleve | null>(null);
  const rafraichir = () => {
    client.invalidateQueries({ queryKey: ['absences-bilan'] });
    client.invalidateQueries({ queryKey: ['absences'] });
  };
  const annuler = useMutation({
    mutationFn: (id: string) => api<{ message: string }>(`/absences/exclusions/${id}`, { methode: 'DELETE' }),
    onSuccess: (r) => {
      toast.success(r.message);
      rafraichir();
    },
    onError: (e) => toast.error(e.message),
  });

  // Le bilan affiché (classe et période) : PDF ouvert dans un onglet pour l'imprimer, ou classeur Excel.
  const exporter = (format: 'xlsx' | 'pdf') =>
    telecharger(`/absences/bilan/export?classeId=${classeId}&periode=${periode}&format=${format}`, { ouvrir: format === 'pdf' }).catch((e) =>
      toast.error(e.message),
    );

  return (
    <Page
      titre="Bilan des absences"
      description="Les heures de chaque élève pour la période, et la sanction que portera le bulletin. Les sanctions se décident sur les heures non justifiées cumulées depuis la rentrée."
      actions={
        <>
          <button type="button" className="bouton-secondaire" onClick={() => exporter('xlsx')} disabled={!b?.eleves.length}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
          <button type="button" className="bouton-secondaire" onClick={() => exporter('pdf')} disabled={!b?.eleves.length}>
            <FileText className="h-4 w-4" /> PDF
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <Champ libelle="Classe" className="w-full max-w-xs">
          <select className="champ" value={classeId} onChange={(e) => setParams({ classe: e.target.value, periode })}>
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
        <Champ libelle="Période">
          <ChoixPeriode valeur={periode} changer={(p) => setParams({ classe: classeId, periode: p })} />
        </Champ>
      </div>

      {b && (
        <p className="text-sm text-encre-2">
          {b.sanctions.length === 0 ? (
            <>
              Aucune sanction n'est réglée : le SG les règle dans{' '}
              <Link href="/parametres" className="lien">
                Paramètres
              </Link>
              .
            </>
          ) : (
            <>
              Sanctions (heures non justifiées depuis la rentrée) : {b.sanctions.map((s) => `${s.libelle} dès ${duree(s.minutes)}`).join(' · ')}.
            </>
          )}
        </p>
      )}

      {q.isLoading ? (
        <Chargement />
      ) : q.error ? (
        <Erreur erreur={q.error} />
      ) : !b ? null : b.eleves.length === 0 ? (
        <Carte>
          <Vide titre="Aucun élève">Cette classe n'a pas d'élève inscrit.</Vide>
        </Carte>
      ) : (
        <div className="max-h-[calc(100dvh-12rem)] min-h-[16rem] overflow-auto rounded-lg border border-bord bg-surface">
          <table className="tableau">
            <thead>
              <tr>
                {/* Collé en haut et à gauche, et devant les noms qui défilent dessous (z-index au-dessus de leurs 1). */}
                <th className="left-0 min-w-[14rem] border-r border-bord" style={{ zIndex: 3 }}>
                  N° · Élève
                </th>
                <th className="text-right">Séances</th>
                <th className="text-right">Total</th>
                <th className="text-right">Justifiées</th>
                <th className="text-right">Non justifiées</th>
                <th className="text-right">Non justifiées depuis la rentrée</th>
                <th>Sanction au bulletin</th>
              </tr>
            </thead>
            <tbody>
              {b.eleves.map((e) => (
                <tr key={e.inscriptionId}>
                  <td className="sticky left-0 z-[1] border-r border-bord bg-surface">
                    <span className="mr-2 inline-block w-6 text-right tabular-nums text-encre-2">{e.numero}</span>
                    <Link href={`/absences?classe=${b.classeId}&eleve=${e.eleveId}`} className="font-medium hover:underline">
                      {e.nom} <span className="font-normal text-encre-2">{e.prenoms}</span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{e.seances || '—'}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{h(e.minutes)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums text-succes">{h(e.justifiees)}</td>
                  <td className={clsx('whitespace-nowrap text-right tabular-nums', e.nonJustifiees > 0 && 'font-semibold text-danger')}>{h(e.nonJustifiees)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{h(e.cumulNonJustifiees)}</td>
                  <td>
                    <CelluleSanction e={e} decider={setADecider} annuler={(id) => annuler.mutate(id)} enCours={annuler.isPending} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-encre-2">Classe · {libellePeriode(periode)}</td>
                <td />
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{h(totaux.minutes)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-succes">{h(totaux.j)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-danger">{h(totaux.nj)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {aDecider && (
        <FenetreDecision
          eleve={aDecider}
          fermer={() => setADecider(null)}
          fait={() => {
            setADecider(null);
            rafraichir();
          }}
        />
      )}
    </Page>
  );
}
