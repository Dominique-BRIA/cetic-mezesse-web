import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FileText, ShieldCheck } from 'lucide-react';
import { api, urlProtegee } from '../../lib/api';
import { requetes } from '../../lib/requetes';
import { useApp } from '../../lib/contexte';
import { useParametresUrl } from '../../lib/navigation';
import { duree } from '../../lib/format';
import type { Classe } from '../../lib/types';
import { Carte, Chargement, Champ, Erreur, Page, Vide } from '../../components/ui';
import { aujourdhui } from './Appel';
import { dateCourte, FenetreDetail, FormJustification, type Ligne, type PageAbsences } from './Absences';

/** Au-delà, on demande d'affiner les filtres plutôt que de tout afficher d'un coup. */
const MAX_A_JUSTIFIER = 200;
const TAILLE = 50;

function parNiveau(classes: Classe[]) {
  const groupes = new Map<number, Classe[]>();
  for (const c of [...classes].sort((x, y) => x.niveau - y.niveau || x.nom.localeCompare(y.nom, 'fr'))) {
    groupes.set(c.niveau, [...(groupes.get(c.niveau) ?? []), c]);
  }
  return [...groupes.entries()];
}

/**
 * Justifications : les absences non justifiées, regroupées par élève, chacun avec son bouton « Justifier » ;
 * et les justifications enregistrées, avec leurs pièces, à corriger ou retirer.
 */
export default function Justifications() {
  const { a, annee } = useApp();
  const sg = a('SURVEILLANT_GENERAL');
  const client = useQueryClient();
  const [params, setParams] = useParametresUrl();
  const onglet = params.get('onglet') === 'enregistrees' ? 'enregistrees' : 'a-justifier';
  const f = { classeId: params.get('classe') ?? '', du: params.get('du') ?? '', au: params.get('au') ?? '', q: params.get('q') ?? '', page: Number(params.get('page') ?? 0) };
  const aller = (c: Record<string, string>) => {
    const n: Record<string, string> = { onglet, classe: f.classeId, du: f.du, au: f.au, q: f.q, page: '0', ...c };
    setParams(Object.fromEntries(Object.entries(n).filter(([k, v]) => v && !(k === 'page' && v === '0') && !(k === 'onglet' && v === 'a-justifier'))));
  };
  const [recherche, setRecherche] = useState(f.q);
  useEffect(() => setRecherche(f.q), [f.q]);
  useEffect(() => {
    if (recherche === f.q) return;
    const t = setTimeout(() => aller({ q: recherche }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche]);

  const classes = useQuery(requetes.classes(annee?.id));
  const base = Object.entries({ classeId: f.classeId, du: f.du, au: f.au, q: f.q }).filter(([, v]) => v);
  const cheminA = `/absences?${new URLSearchParams([...base, ['etat', 'NON_JUSTIFIEE'], ['taille', String(MAX_A_JUSTIFIER)]]).toString()}`;
  const cheminJ = `/absences?${new URLSearchParams([...base, ['etat', 'JUSTIFIEE'], ['page', String(f.page)], ['taille', String(TAILLE)]]).toString()}`;
  const aJustifier = useQuery({ queryKey: ['absences', annee?.id, cheminA], queryFn: () => api<PageAbsences>(cheminA), enabled: onglet === 'a-justifier' });
  const enregistrees = useQuery({ queryKey: ['absences', annee?.id, cheminJ], queryFn: () => api<PageAbsences>(cheminJ), enabled: onglet === 'enregistrees' });
  const [justifier, setJustifier] = useState<Ligne[] | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const rafraichir = () => client.invalidateQueries({ queryKey: ['absences'] });

  const nonJustifiees = aJustifier.data;
  const total = onglet === 'a-justifier' ? nonJustifiees?.total : enregistrees.data?.total;

  return (
    <Page
      titre="Justifications"
      description="Le SG enregistre ici les justificatifs reçus. Une justification ne supprime jamais l'absence : elle la classe parmi les heures justifiées. Un justificatif refusé n'est pas enregistré, l'absence reste non justifiée."
    >
      <div role="tablist" className="flex gap-1 border-b border-bord">
        {(
          [
            ['a-justifier', 'À justifier'],
            ['enregistrees', 'Justifications enregistrées'],
          ] as const
        ).map(([code, libelle]) => (
          <button
            key={code}
            type="button"
            role="tab"
            aria-selected={onglet === code}
            onClick={() => aller({ onglet: code })}
            className={clsx(
              '-mb-px border-b-2 px-4 py-2 text-sm font-semibold',
              onglet === code ? 'border-primaire text-primaire' : 'border-transparent text-encre-2 hover:text-encre',
            )}
          >
            {libelle}
            {onglet === code && total !== undefined ? ` · ${total}` : ''}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Champ libelle="Classe">
          <select className="champ" value={f.classeId} onChange={(e) => aller({ classe: e.target.value })}>
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
        </Champ>
        <Champ libelle="Du">
          <input type="date" className="champ" value={f.du} max={f.au || aujourdhui()} onChange={(e) => aller({ du: e.target.value })} />
        </Champ>
        <Champ libelle="Au">
          <input type="date" className="champ" value={f.au} min={f.du || undefined} max={aujourdhui()} onChange={(e) => aller({ au: e.target.value })} />
        </Champ>
        <Champ libelle="Élève">
          <input className="champ" placeholder="Nom, prénom ou matricule" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </Champ>
      </div>

      {onglet === 'a-justifier' ? (
        aJustifier.isLoading ? (
          <Chargement />
        ) : aJustifier.error ? (
          <Erreur erreur={aJustifier.error} />
        ) : nonJustifiees ? (
          <AJustifier p={nonJustifiees} sg={sg} justifier={setJustifier} detail={setDetail} />
        ) : null
      ) : enregistrees.isLoading ? (
        <Chargement />
      ) : enregistrees.error ? (
        <Erreur erreur={enregistrees.error} />
      ) : enregistrees.data ? (
        <Enregistrees p={enregistrees.data} detail={setDetail} page={(n) => aller({ onglet, page: String(n) })} />
      ) : null}

      {justifier && (
        <FormJustification
          absences={justifier}
          fermer={() => setJustifier(null)}
          fait={() => {
            setJustifier(null);
            rafraichir();
          }}
        />
      )}
      {detail && <FenetreDetail id={detail} fermer={() => setDetail(null)} change={rafraichir} />}
    </Page>
  );
}

/** Absences non justifiées, regroupées par élève : on coche celles que couvre le justificatif, puis « Justifier ». */
function AJustifier({ p, sg, justifier, detail }: { p: PageAbsences; sg: boolean; justifier: (l: Ligne[]) => void; detail: (id: string) => void }) {
  const eleves = useMemo(() => {
    const m = new Map<string, Ligne[]>();
    for (const l of p.lignes) m.set(l.inscriptionId, [...(m.get(l.inscriptionId) ?? []), l]);
    return [...m.values()].sort((x, y) => x[0].nom.localeCompare(y[0].nom, 'fr') || x[0].prenoms.localeCompare(y[0].prenoms, 'fr'));
  }, [p]);
  // Rien n'est coché au départ : le SG coche les absences que couvre le justificatif reçu.
  const [cochees, setCochees] = useState<Set<string>>(new Set());
  useEffect(() => setCochees(new Set()), [p]);
  const basculer = (ids: string[], cocher: boolean) =>
    setCochees((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (cocher) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  if (eleves.length === 0) {
    return (
      <Carte>
        <Vide titre="Rien à justifier">Aucune absence non justifiée ne correspond à ces filtres.</Vide>
      </Carte>
    );
  }
  return (
    <div className="space-y-3">
      {p.total > p.lignes.length && (
        <p className="rounded border border-alerte/40 bg-alerte/10 px-3 py-2 text-sm">
          {p.total} absences non justifiées : seules les {p.lignes.length} plus récentes sont affichées. Choisissez une classe, une période ou un élève.
        </p>
      )}
      {eleves.map((liste) => {
        const e = liste[0];
        const choisies = liste.filter((l) => cochees.has(l.id));
        const toutes = choisies.length === liste.length;
        const minutes = liste.reduce((n, l) => n + l.duree, 0);
        return (
          <section key={e.inscriptionId} className="overflow-hidden rounded-lg border border-bord bg-surface">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-bord bg-surface-2 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <span className="font-semibold">{e.nom}</span> <span className="text-encre-2">{e.prenoms}</span>
                <span className="ml-2 text-sm text-encre-2">· {e.classe}</span>
              </div>
              <span className="text-sm font-semibold text-danger">
                {liste.length} absence{liste.length > 1 ? 's' : ''} · {duree(minutes)}
              </span>
              {sg && liste.length > 1 && (
                <button type="button" className="bouton-discret py-1 text-sm" onClick={() => basculer(liste.map((l) => l.id), !toutes)}>
                  {toutes ? 'Tout décocher' : 'Tout cocher'}
                </button>
              )}
              {sg && (
                <button
                  type="button"
                  className="bouton-primaire py-1.5"
                  disabled={choisies.length === 0}
                  title={choisies.length === 0 ? 'Cochez les absences que couvre le justificatif' : undefined}
                  onClick={() => justifier(choisies)}
                >
                  <ShieldCheck className="h-4 w-4" /> Justifier{choisies.length > 0 ? ` (${choisies.length})` : ''}
                </button>
              )}
            </header>
            <ul className="divide-y divide-bord">
              {liste.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  {sg && (
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={cochees.has(l.id)}
                      onChange={(ev) => basculer([l.id], ev.target.checked)}
                      aria-label={`Inclure ${l.matiere} du ${l.date}`}
                    />
                  )}
                  <span className="w-36 whitespace-nowrap">{dateCourte(l.date)}</span>
                  <span className="flex-1">{l.matiere}</span>
                  <span className="whitespace-nowrap tabular-nums text-encre-2">
                    {l.debut} – {l.fin}
                  </span>
                  <span className="w-16 whitespace-nowrap text-right tabular-nums">{duree(l.duree)}</span>
                  <button type="button" className="bouton-discret py-1" onClick={() => detail(l.id)}>
                    Détail
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Justifications enregistrées : motif, réception, pièces ; « Détail » pour corriger ou retirer. */
function Enregistrees({ p, detail, page }: { p: PageAbsences; detail: (id: string) => void; page: (n: number) => void }) {
  if (p.lignes.length === 0) {
    return (
      <Carte>
        <Vide titre="Aucune justification">Aucune justification enregistrée ne correspond à ces filtres.</Vide>
      </Carte>
    );
  }
  return (
    <div className="max-h-[calc(100dvh-12rem)] min-h-[16rem] overflow-auto rounded-lg border border-bord bg-surface">
      <table className="tableau">
        <thead>
          <tr>
            <th>Élève</th>
            <th>Absence</th>
            <th>Motif</th>
            <th>Reçu le</th>
            <th>Pièces</th>
            <th>Enregistrée par</th>
            <th className="w-px" />
          </tr>
        </thead>
        <tbody>
          {p.lignes.map((l) => {
            const j = l.justification!;
            return (
              <tr key={l.id}>
                <td>
                  <div className="font-medium">
                    {l.nom} <span className="font-normal text-encre-2">{l.prenoms}</span>
                  </div>
                  <div className="text-xs text-encre-2">{l.classe}</div>
                </td>
                <td>
                  <div className="whitespace-nowrap">{dateCourte(l.date)}</div>
                  <div className="text-xs text-encre-2">
                    {l.matiere} · {l.debut} – {l.fin} · {duree(l.duree)}
                  </div>
                </td>
                <td>
                  <div className="font-medium text-succes">{j.motif}</div>
                  {j.description && <div className="max-w-xs truncate text-xs text-encre-2">{j.description}</div>}
                </td>
                <td className="whitespace-nowrap">{dateCourte(j.dateReception)}</td>
                <td>
                  {j.pieces.length === 0 ? (
                    <span className="text-encre-3">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {j.pieces.map((x) => (
                        <li key={x.id}>
                          <a className="lien inline-flex items-center gap-1 text-xs" href={urlProtegee(`/justifications/pieces/${x.id}`)} target="_blank" rel="noreferrer">
                            <FileText className="h-3.5 w-3.5" /> {x.nom}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="text-sm">
                  {j.par ?? '—'}
                  {j.modifieLe && <div className="text-xs text-encre-2">corrigée</div>}
                </td>
                <td>
                  <button type="button" className="bouton-discret" onClick={() => detail(l.id)}>
                    Détail
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-bord px-3 py-2 text-sm text-encre-2">
        <span>
          {p.page * p.taille + 1}–{p.page * p.taille + p.lignes.length} sur {p.total}
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
    </div>
  );
}

