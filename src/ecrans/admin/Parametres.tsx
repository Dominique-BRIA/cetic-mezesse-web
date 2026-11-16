import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { requetes } from '../../lib/requetes';
import type { CritereDepartage, Etablissement, LigneBulletin, SanctionAbsence } from '../../lib/types';
import { Carte, Chargement, Champ, Erreur, Page } from '../../components/ui';
import { useApp } from '../../lib/contexte';

export default function Parametres() {
  // Le SG règle tout ; le Directeur consulte, et règle le tableau d'honneur.
  const { a } = useApp();
  const sg = a('SURVEILLANT_GENERAL');
  return (
    <Page titre="Paramètres" description="Ce qui s'imprime en tête des documents, les barèmes appliqués aux notes, le tableau d'honneur et les sanctions pour absences.">
      <FormEtablissement modifiable={sg} />
      <SeuilTableauHonneur />
      <ReglesResultats />
      <Sanctions modifiable={sg} />
      <div className="grid gap-4 lg:grid-cols-2">
        <EditeurBareme type="GRADE" titre="Grades par matière" aide="Imprimés dans la colonne « Grade » du bulletin." modifiable={sg} />
        <EditeurBareme type="COTE" titre="Cotes de la moyenne générale" aide="La cote obtenue est cochée dans le bloc « Travail de l'élève »." modifiable={sg} />
      </div>
    </Page>
  );
}

function SeuilTableauHonneur() {
  const client = useQueryClient();
  const q = useQuery(requetes.etablissement());
  const [seuil, setSeuil] = useState('');
  useEffect(() => {
    if (q.data) setSeuil(q.data.seuilTableauHonneur.toFixed(2).replace('.', ','));
  }, [q.data]);
  const envoi = useMutation({
    mutationFn: () => api('/etablissement/tableau-honneur', { methode: 'PUT', corps: { seuil: Number(seuil.replace(',', '.')) }, annee: false }),
    onSuccess: () => {
      toast.success("Moyenne minimale du tableau d'honneur enregistrée.");
      client.invalidateQueries({ queryKey: ['etablissement'] });
      client.invalidateQueries({ queryKey: ['tableau-honneur'] });
    },
  });
  return (
    <Carte titre="Tableau d'honneur">
      {envoi.error ? (
        <div className="mb-3">
          <Erreur erreur={envoi.error} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <Champ libelle="Moyenne minimale" aide="Un élève figure au tableau d'honneur dès que sa moyenne de la période atteint cette valeur.">
          <input className="champ w-28 text-right tabular-nums" inputMode="decimal" value={seuil} onChange={(e) => setSeuil(e.target.value)} />
        </Champ>
        <button type="button" className="bouton-primaire mb-5" disabled={envoi.isPending || !seuil} onClick={() => envoi.mutate()}>
          {envoi.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer
        </button>
      </div>
    </Carte>
  );
}

const nombre = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
const texte = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const cle = (c: CritereDepartage) => (c.type === 'GROUPE' ? `GROUPE:${(c.groupe ?? '').toLowerCase()}` : c.type);

/**
 * Règles des résultats : délibération (moyenne annuelle), refus du tableau d'honneur pour absences, part des matières
 * composées (non classé, matières ignorées) et ordre de départage de la première place.
 */
function ReglesResultats() {
  const client = useQueryClient();
  const { annee } = useApp();
  const q = useQuery(requetes.etablissement());
  const groupes = useQuery(requetes.groupes(annee?.id));
  const [f, setF] = useState({ deliberation: '', heures: '', nonClasse: '', ignorees: '' });
  // Tous les critères possibles, dans l'ordre choisi ; « actif » : pris en compte.
  const [criteres, setCriteres] = useState<(CritereDepartage & { actif: boolean })[]>([]);
  useEffect(() => {
    if (!q.data || !groupes.data) return;
    const r = q.data.reglesResultats;
    setF({ deliberation: r.moyenneDeliberation === null ? '' : r.moyenneDeliberation.toFixed(2).replace('.', ','), heures: texte(r.heuresRefusTableauHonneur), nonClasse: texte(r.seuilNonClasse), ignorees: texte(r.seuilMatieresIgnorees) });
    const noms = [...new Set(groupes.data.map((g) => g.nom))];
    const possibles: CritereDepartage[] = [...noms.map((n) => ({ type: 'GROUPE' as const, groupe: n })), { type: 'DISCIPLINE' }, { type: 'ALPHABETIQUE' }];
    // Sans réglage : les groupes « professionnels », puis la discipline, puis l'ordre alphabétique.
    const choisis: CritereDepartage[] = r.criteres.length
      ? r.criteres
      : [...possibles.filter((c) => c.type === 'GROUPE' && /professionnel/i.test(c.groupe ?? '')), { type: 'DISCIPLINE' }, { type: 'ALPHABETIQUE' }];
    const actifs = choisis.map((c) => ({ ...c, actif: true }));
    const reste = possibles.filter((p) => !choisis.some((c) => cle(c) === cle(p))).map((c) => ({ ...c, actif: false }));
    setCriteres([...actifs, ...reste]);
  }, [q.data, groupes.data]);
  const deplacer = (i: number, d: -1 | 1) =>
    setCriteres((l) => {
      const n = [...l];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  const envoi = useMutation({
    mutationFn: () =>
      api('/etablissement/resultats', {
        methode: 'PUT',
        annee: false,
        corps: {
          moyenneDeliberation: nombre(f.deliberation),
          heuresRefusTableauHonneur: nombre(f.heures),
          seuilNonClasse: nombre(f.nonClasse),
          seuilMatieresIgnorees: nombre(f.ignorees),
          criteres: criteres.filter((c) => c.actif).map(({ type, groupe }) => ({ type, groupe: type === 'GROUPE' ? groupe : null })),
        },
      }),
    onSuccess: () => {
      toast.success('Règles des résultats enregistrées.');
      for (const k of ['etablissement', 'tableau-honneur', 'releve', 'stats-etablissement', 'stats-classe']) client.invalidateQueries({ queryKey: [k] });
    },
  });
  const libelle = (c: CritereDepartage) =>
    c.type === 'GROUPE' ? `Moyenne du groupe « ${c.groupe} »` : c.type === 'DISCIPLINE' ? "Discipline : le moins d'heures d'absence non justifiées" : 'Ordre alphabétique des noms';
  return (
    <Carte titre="Résultats, classement et délibération">
      {envoi.error ? (
        <div className="mb-3">
          <Erreur erreur={envoi.error} />
        </div>
      ) : null}
      <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
        <Champ libelle="Moyenne de délibération" aide="Sur la moyenne annuelle : à partir de cette moyenne, l'élève passe en classe supérieure après délibération (par exemple 9,00). Vide : pas de délibération. Sur les séquences et les trimestres, moins de 10 reste un échec.">
          <input className="champ w-28 text-right tabular-nums" inputMode="decimal" placeholder="—" value={f.deliberation} onChange={(e) => setF({ ...f, deliberation: e.target.value })} />
        </Champ>
        <Champ libelle="Refus du tableau d'honneur (heures)" aide="À partir de ce nombre d'heures d'absence non justifiées sur la période, l'élève n'est pas inscrit au tableau d'honneur. Vide : pas de limite.">
          <input className="champ w-28 text-right tabular-nums" inputMode="numeric" placeholder="—" value={f.heures} onChange={(e) => setF({ ...f, heures: e.target.value })} />
        </Champ>
        <Champ libelle="Non classé en dessous de (% des matières)" aide="Un élève qui a composé moins que cette part des matières évaluées n'est pas classé (1/3 : 33,33).">
          <input className="champ w-28 text-right tabular-nums" inputMode="decimal" value={f.nonClasse} onChange={(e) => setF({ ...f, nonClasse: e.target.value })} />
        </Champ>
        <Champ libelle="Matières ignorées à partir de (% des matières)" aide="En dessous, les matières non composées valent 0 (leur coefficient compte) ; à partir de cette part (2/3 : 66,67), elles sont ignorées.">
          <input className="champ w-28 text-right tabular-nums" inputMode="decimal" value={f.ignorees} onChange={(e) => setF({ ...f, ignorees: e.target.value })} />
        </Champ>
      </div>
      <div className="mt-4">
        <div className="text-sm font-semibold">Départage de la première place</div>
        <p className="mb-2 text-xs text-encre-2">
          Il n'y a qu'un seul premier : en cas d'égalité, ces critères sont appliqués dans l'ordre (cochez ceux qui comptent, rangez-les par importance). En dernier recours, un tirage au sort.
          Les autres rangs gardent leurs ex æquo.
        </p>
        {groupes.isLoading ? (
          <Chargement />
        ) : (
          <ol className="divide-y divide-bord rounded border border-bord">
            {criteres.map((c, i) => (
              <li key={cle(c)} className="flex items-center gap-3 px-3 py-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={c.actif} onChange={(e) => setCriteres((l) => l.map((x, k) => (k === i ? { ...x, actif: e.target.checked } : x)))} />
                <span className={c.actif ? 'flex-1' : 'flex-1 text-encre-3'}>
                  {c.actif && <span className="mr-2 font-semibold tabular-nums">{criteres.slice(0, i + 1).filter((x) => x.actif).length}.</span>}
                  {libelle(c)}
                </span>
                <button type="button" className="bouton-discret" aria-label="Monter" disabled={i === 0} onClick={() => deplacer(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button type="button" className="bouton-discret" aria-label="Descendre" disabled={i === criteres.length - 1} onClick={() => deplacer(i, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
      <button type="button" className="bouton-primaire mt-4" disabled={envoi.isPending || !f.nonClasse || !f.ignorees} onClick={() => envoi.mutate()}>
        {envoi.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Enregistrer
      </button>
    </Carte>
  );
}

// Les trois sanctions pour absences non justifiées, dans l'ordre ; le SG règle seulement les heures.
const PALIERS: [Exclude<LigneBulletin, 'AUCUNE'>, string][] = [
  ['AVERTISSEMENT', 'Avertissement conduite'],
  ['BLAME', 'Blâme conduite'],
  ['EXCLUSION', 'Exclusion'],
];

/** Sanctions pour absences non justifiées : trois paliers fixes, le SG indique à partir de combien d'heures. */
function Sanctions({ modifiable }: { modifiable: boolean }) {
  const client = useQueryClient();
  const q = useQuery({ queryKey: ['sanctions-absences'], queryFn: () => api<SanctionAbsence[]>('/sanctions-absences', { annee: false }) });
  const [heures, setHeures] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data)
      setHeures(Object.fromEntries(q.data.map((s) => [s.ligne, String(Math.round((s.minutes / 60) * 100) / 100).replace('.', ',')])));
  }, [q.data]);
  const envoi = useMutation({
    mutationFn: () =>
      api('/sanctions-absences', {
        methode: 'PUT',
        annee: false,
        corps: PALIERS.map(([ligne]) => ({ ligne, heures: heures[ligne]?.trim() ? Number(heures[ligne].replace(',', '.')) : null })),
      }),
    onSuccess: () => {
      toast.success('Sanctions enregistrées.');
      client.invalidateQueries({ queryKey: ['sanctions-absences'] });
      client.invalidateQueries({ queryKey: ['absences-bilan'] });
    },
  });

  return (
    <Carte
      titre="Sanctions pour absences non justifiées"
      actions={
        modifiable && (
          <button type="button" className="bouton-primaire" disabled={envoi.isPending} onClick={() => envoi.mutate()}>
            {envoi.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </button>
        )
      }
    >
      <p className="mb-3 max-w-3xl text-sm text-encre-2">
        Heures non justifiées cumulées depuis la rentrée. Le bulletin porte la sanction la plus élevée atteinte. À l'exclusion, le Directeur est prévenu et
        décide : exclusion définitive, exclusion temporaire ou sursis. Laissez une case vide pour ne pas utiliser la sanction.
      </p>
      {envoi.error ? (
        <div className="mb-3">
          <Erreur erreur={envoi.error} />
        </div>
      ) : null}
      <fieldset disabled={!modifiable}>
        <table className="tableau max-w-xl">
          <thead>
            <tr>
              <th>Sanction</th>
              <th className="w-40 text-right">À partir de</th>
            </tr>
          </thead>
          <tbody>
            {PALIERS.map(([ligne, libelle]) => (
              <tr key={ligne}>
                <td className="font-semibold">{libelle}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <input
                      className="champ py-1.5 text-right tabular-nums"
                      inputMode="decimal"
                      value={heures[ligne] ?? ''}
                      onChange={(e) => setHeures({ ...heures, [ligne]: e.target.value })}
                      aria-label={`${libelle} à partir de (heures)`}
                    />
                    <span className="text-sm text-encre-2">h</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>
    </Carte>
  );
}

const CHAMPS: [keyof Etablissement, string, string?][] = [
  ['nomFr', 'Nom (français)'],
  ['nomEn', 'Nom (anglais)'],
  ['sigle', 'Sigle'],
  ['sigleEn', 'Sigle anglais', 'GTC'],
  ['code', 'Code / immatriculation'],
  ['regionFr', 'Région (français)', 'Sud'],
  ['regionEn', 'Région (anglais)', 'South'],
  ['departementFr', 'Département (français)'],
  ['departementEn', 'Département (anglais)'],
  ['arrondissement', 'Arrondissement'],
  ['localite', 'Localité'],
  ['boitePostale', 'Boîte postale'],
  ['telephone', 'Téléphone'],
  ['prefixeMatricule', 'Préfixe des matricules', 'Exemple : CTM donne CTM26-0001'],
];

function FormEtablissement({ modifiable }: { modifiable: boolean }) {
  const client = useQueryClient();
  const q = useQuery(requetes.etablissement());
  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data) setF(Object.fromEntries(Object.entries(q.data).map(([k, v]) => [k, v === null ? '' : String(v)])));
  }, [q.data]);
  const envoi = useMutation({
    mutationFn: () => api('/etablissement', { methode: 'PUT', corps: f, annee: false }),
    onSuccess: () => {
      toast.success('Informations enregistrées.');
      client.invalidateQueries({ queryKey: ['etablissement'] });
    },
  });
  if (q.isLoading) return <Chargement />;
  return (
    <Carte
      titre="Établissement"
      actions={
        modifiable && (
          <button type="button" className="bouton-primaire" disabled={envoi.isPending} onClick={() => envoi.mutate()}>
            {envoi.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </button>
        )
      }
    >
      {envoi.error ? (
        <div className="mb-3">
          <Erreur erreur={envoi.error} />
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CHAMPS.map(([cle, libelle, aide]) => (
          <Champ key={cle} libelle={libelle} aide={cle === 'prefixeMatricule' ? aide : undefined} className={cle === 'nomFr' || cle === 'nomEn' ? 'sm:col-span-2' : ''}>
            <input className="champ" value={f[cle] ?? ''} disabled={!modifiable} onChange={(e) => setF({ ...f, [cle]: e.target.value })} />
          </Champ>
        ))}
      </div>
    </Carte>
  );
}

function EditeurBareme({ type, titre, aide, modifiable }: { type: 'GRADE' | 'COTE'; titre: string; aide: string; modifiable: boolean }) {
  const client = useQueryClient();
  const q = useQuery(requetes.baremes());
  const [lignes, setLignes] = useState<{ libelle: string; libelleLong: string; min: string }[]>([]);
  useEffect(() => {
    if (q.data)
      setLignes(
        q.data
          .filter((b) => b.type === type)
          .sort((a, b) => b.min - a.min)
          .map((b) => ({ libelle: b.libelle, libelleLong: b.libelleLong ?? '', min: String(b.min).replace('.', ',') })),
      );
  }, [q.data, type]);
  const envoi = useMutation({
    mutationFn: () =>
      api(`/baremes/${type}`, {
        methode: 'PUT',
        annee: false,
        corps: lignes.map((l) => ({ libelle: l.libelle, libelleLong: l.libelleLong, min: Number(l.min.replace(',', '.')) })),
      }),
    onSuccess: () => {
      toast.success('Barème enregistré. Il s\'applique aux prochains bulletins.');
      client.invalidateQueries({ queryKey: ['baremes'] });
    },
  });
  const maj = (i: number, cle: 'libelle' | 'libelleLong' | 'min', v: string) => setLignes(lignes.map((l, k) => (k === i ? { ...l, [cle]: v } : l)));

  return (
    <Carte
      titre={titre}
      actions={
        modifiable && (
          <button type="button" className="bouton-primaire" disabled={envoi.isPending} onClick={() => envoi.mutate()}>
            {envoi.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </button>
        )
      }
    >
      <p className="mb-3 text-sm text-encre-2">{aide} Chaque mention s'applique à partir de sa note minimale (incluse).</p>
      {envoi.error ? (
        <div className="mb-3">
          <Erreur erreur={envoi.error} />
        </div>
      ) : null}
      <fieldset disabled={!modifiable}>
      <table className="tableau">
        <thead>
          <tr>
            <th className="w-24">Mention</th>
            {type === 'COTE' && <th>Signification</th>}
            <th className="w-28 text-right">À partir de</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i}>
              <td>
                <input className="champ py-1.5 font-semibold" value={l.libelle} onChange={(e) => maj(i, 'libelle', e.target.value)} maxLength={10} />
              </td>
              {type === 'COTE' && (
                <td>
                  <input className="champ py-1.5" value={l.libelleLong} onChange={(e) => maj(i, 'libelleLong', e.target.value)} maxLength={80} />
                </td>
              )}
              <td>
                <input className="champ py-1.5 text-right tabular-nums" inputMode="decimal" value={l.min} onChange={(e) => maj(i, 'min', e.target.value)} />
              </td>
              <td>
                <button type="button" className="bouton-discret hover:text-danger" aria-label="Retirer" onClick={() => setLignes(lignes.filter((_, k) => k !== i))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {modifiable && (
        <button type="button" className="bouton-discret mt-2" onClick={() => setLignes([...lignes, { libelle: '', libelleLong: '', min: '' }])}>
          <Plus className="h-4 w-4" /> Ajouter une mention
        </button>
      )}
      </fieldset>
    </Carte>
  );
}
