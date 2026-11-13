import Link from 'next/link';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import { api } from '../../lib/api';
import { requetes } from '../../lib/requetes';
import { useApp } from '../../lib/contexte';
import { useParametresUrl } from '../../lib/navigation';
import { duree, libellePeriode } from '../../lib/format';
import type { Classe, CodePeriode, LigneBulletin, SanctionAbsence } from '../../lib/types';
import { Carte, Chargement, Champ, ChoixPeriode, Erreur, Etat, Page, Vide } from '../../components/ui';

interface BilanEleve {
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
  /** Nom choisi par le SG ; vide : aucune sanction. */
  libelleSanction: string | null;
  joursExclusion: number;
  palierExclusion: boolean;
  proviseurPrevenu: boolean;
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

function Sanction({ e }: { e: BilanEleve }) {
  if (!e.libelleSanction) return <span className="text-encre-3">—</span>;
  if (e.sanction === 'EXCLUSION')
    return (
      <Etat ton="danger">
        {e.libelleSanction} · {e.joursExclusion} jour{e.joursExclusion > 1 ? 's' : ''}
      </Etat>
    );
  return <Etat ton={e.sanction === 'BLAME' ? 'danger' : 'alerte'}>{e.libelleSanction}</Etat>;
}

/**
 * Bilan des absences d'une classe pour une période : heures totales, justifiées et non justifiées, cumul
 * depuis la rentrée et sanction retenue pour le bulletin (la plus élevée atteinte).
 */
export default function BilanAbsences() {
  const { annee } = useApp();
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

  return (
    <Page
      titre="Bilan des absences"
      description="Les heures de chaque élève pour la période, et la sanction que portera le bulletin. Les sanctions se décident sur les heures non justifiées cumulées depuis la rentrée."
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
              Sanctions (non justifiées depuis la rentrée) : {b.sanctions.map((s) => `${s.libelle} dès ${duree(s.minutes)}`).join(' · ')}.
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
                <th className="left-0 z-[2] min-w-[14rem] border-r border-bord">Élève</th>
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
                    <Sanction e={e} />
                    {e.palierExclusion && e.sanction !== 'EXCLUSION' && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-danger">
                        <BellRing className="h-3.5 w-3.5" /> Palier d'exclusion atteint{e.proviseurPrevenu ? ' · Proviseur prévenu' : ''}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-encre-2">Classe · {libellePeriode(periode)}</td>
                <td />
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{h(totaux.minutes)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-succes">{h(totaux.j)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-danger">{h(totaux.nj)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Page>
  );
}
