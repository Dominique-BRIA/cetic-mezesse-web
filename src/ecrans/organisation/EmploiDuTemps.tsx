import { useState } from 'react';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CalendarPlus, Clock, FileSpreadsheet, FileText, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, telecharger } from '../../lib/api';
import { envoyer, estAbandon, useCleEnvoi } from '../../lib/doublons';
import { requetes } from '../../lib/requetes';
import { useApp } from '../../lib/contexte';
import { useParametresUrl } from '../../lib/navigation';
import { date, duree } from '../../lib/format';
import type { Classe, Matiere } from '../../lib/types';
import { Carte, Chargement, Champ, Erreur, Modale, Page, Vide } from '../../components/ui';
import { confirmer } from '../../lib/confirmation';

interface Version {
  id: string;
  valableDu: string | null;
  valableAu: string | null;
  enVigueur: boolean;
}

interface Conflit {
  classe: string;
  matiere: string;
  debut: string;
  fin: string;
  memeClasse: boolean;
}

interface Creneau {
  id: string;
  jour: number;
  debut: string;
  fin: string;
  duree: number;
  matiere: { id: string; nom: string; professeur: { id: string; nom: string; prenom: string } | null };
  conflits: Conflit[];
}

interface Vue {
  classeId: string;
  versions: Version[];
  version: Version | null;
  creneaux: Creneau[];
  minutesParSemaine: number;
  /** Lignes horaires saisies, même sans cours. */
  plages: { id: string; debut: string; fin: string }[];
}

// Cours du lundi au vendredi.
const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

const libelleVersion = (v: Version) =>
  `${v.valableDu ? `À partir du ${date(v.valableDu)}` : 'Depuis la rentrée'}${v.valableAu ? ` jusqu'au ${date(v.valableAu)}` : ''}${v.enVigueur ? ' · en vigueur' : ''}`;

/** Les classes rangées par niveau, pour la liste de choix. */
function parNiveau(classes: Classe[]) {
  const groupes = new Map<number, Classe[]>();
  for (const c of [...classes].sort((x, y) => x.niveau - y.niveau || x.nom.localeCompare(y.nom, 'fr'))) {
    groupes.set(c.niveau, [...(groupes.get(c.niveau) ?? []), c]);
  }
  return [...groupes.entries()];
}

/** Emploi du temps d'une classe : la semaine type en tableau (horaires en lignes, jours en colonnes) ; le SG le tient, le Directeur le consulte. */
export default function EmploiDuTemps() {
  const { a, annee } = useApp();
  const client = useQueryClient();
  const [params, setParams] = useParametresUrl();
  const classes = useQuery(requetes.classes(annee?.id));
  const classeId = params.get('classe') ?? parNiveau(classes.data ?? [])[0]?.[1][0]?.id ?? '';
  const versionId = params.get('version');
  const sg = a('SURVEILLANT_GENERAL');
  const aller = (classe: string, version?: string | null) => setParams(version ? { classe, version } : { classe });
  const cle = ['emploi-du-temps', classeId, versionId];
  const q = useQuery({
    queryKey: cle,
    queryFn: () => api<Vue>(`/emplois-du-temps?classeId=${classeId}${versionId ? `&versionId=${versionId}` : ''}`),
    enabled: Boolean(classeId),
  });
  const exporter = (format: 'xlsx' | 'pdf') => {
    const version = q.data?.version?.id;
    telecharger(`/emplois-du-temps/export?classeId=${classeId}${version ? `&versionId=${version}` : ''}&format=${format}`, {
      ouvrir: format === 'pdf',
    }).catch((e) => toast.error(e.message));
  };
  const matieres = useQuery({
    queryKey: ['matieres', annee?.id, classeId],
    queryFn: () => api<Matiere[]>(`/matieres?classeId=${classeId}`),
    enabled: Boolean(classeId) && sg,
  });
  // Créneau à modifier, ou nouveau créneau (jour, et horaire de la ligne quand on part d'une case vide).
  const [edition, setEdition] = useState<Creneau | { jour: number; horaire?: readonly [string, string] } | null>(null);
  const [nouvelleLigne, setNouvelleLigne] = useState(false);
  const [nouvelleVersion, setNouvelleVersion] = useState(false);
  // Horaire d'une ligne à modifier (s'applique à tous les cours de la ligne).
  const [horaire, setHoraire] = useState<readonly [string, string] | null>(null);
  const v = q.data;

  const mettreAJour = (vue: Vue) => {
    client.setQueryData(['emploi-du-temps', classeId, vue.version?.id ?? null], vue);
    client.setQueryData(cle, vue);
    client.invalidateQueries({ queryKey: ['emploi-du-temps'] });
  };

  const supprimerVersion = useMutation({
    mutationFn: (id: string) => api<Vue>(`/emplois-du-temps/versions/${id}`, { methode: 'DELETE' }),
    onSuccess: (vue) => {
      toast.success('Version supprimée.');
      aller(classeId);
      mettreAJour(vue);
    },
    onError: (e) => toast.error(e.message),
  });

  const parJour = (jour: number) => (v?.creneaux ?? []).filter((c) => c.jour === jour);
  const jours = [1, 2, 3, 4, 5];
  // Les lignes du tableau : les heures saisies (même vides) et celles des cours, dans l'ordre de la journée.
  const horaires = [
    ...new Map([...(v?.plages ?? []), ...(v?.creneaux ?? [])].map((c) => [`${c.debut}-${c.fin}`, [c.debut, c.fin] as const])).values(),
  ].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const plageDe = (debut: string, fin: string) => v?.plages.find((p) => p.debut === debut && p.fin === fin);
  const retirerLigne = useMutation({
    mutationFn: (id: string) => api<Vue>(`/emplois-du-temps/plages/${id}`, { methode: 'DELETE' }),
    onSuccess: (vue) => {
      toast.success('Ligne retirée.');
      mettreAJour(vue);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Page
      titre="Emploi du temps"
      description="La semaine type de chaque classe. Une nouvelle version, à partir d'une date, remplace la précédente pour les jours suivants ; les jours passés gardent l'ancienne."
      actions={
        classeId && (
          <>
            {/* L'emploi du temps affiché (classe et version) : PDF à imprimer ou à afficher, classeur Excel. */}
            <button type="button" className="bouton-secondaire" onClick={() => exporter('xlsx')} disabled={!q.data}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </button>
            <button type="button" className="bouton-secondaire" onClick={() => exporter('pdf')} disabled={!q.data}>
              <FileText className="h-4 w-4" /> PDF
            </button>
            {sg && (
              <button type="button" className="bouton-secondaire" onClick={() => setNouvelleVersion(true)}>
                <CalendarPlus className="h-4 w-4" /> Nouvelle version
              </button>
            )}
          </>
        )
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <Champ libelle="Classe" className="w-full max-w-xs">
          <select className="champ" value={classeId} onChange={(e) => aller(e.target.value)}>
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
        {v && v.versions.length > 1 && (
          <Champ libelle="Version" className="w-full max-w-sm">
            <select className="champ" value={v.version?.id ?? ''} onChange={(e) => aller(classeId, e.target.value)}>
              {v.versions.map((x) => (
                <option key={x.id} value={x.id}>
                  {libelleVersion(x)}
                </option>
              ))}
            </select>
          </Champ>
        )}
        {sg && v?.version && v.versions.length > 1 && (
          <button
            type="button"
            className="bouton-discret text-danger"
            disabled={supprimerVersion.isPending}
            onClick={async () => {
              const n = v.creneaux.length;
              if (
                await confirmer({
                  titre: 'Supprimer cette version',
                  message: `La version « ${libelleVersion(v.version!)} » et ses ${n} créneau${n > 1 ? 'x' : ''} seront supprimés.`,
                  action: 'Supprimer',
                  danger: true,
                })
              )
                supprimerVersion.mutate(v.version!.id);
            }}
          >
            <Trash2 className="h-4 w-4" /> Supprimer cette version
          </button>
        )}
      </div>

      {!classes.data?.length && !classes.isLoading ? (
        <Carte>
          <Vide titre="Aucune classe">Créez d'abord les classes et leurs matières.</Vide>
        </Carte>
      ) : q.isLoading ? (
        <Chargement />
      ) : q.error ? (
        <Erreur erreur={q.error} />
      ) : v ? (
        <>
          {v.version && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-encre-2">
              <span className="font-semibold text-encre">{libelleVersion(v.version)}</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4" /> {duree(v.minutesParSemaine)} de cours par semaine
              </span>
            </div>
          )}
          {!v.version && !sg ? (
            <Carte>
              <Vide titre="Pas encore d'emploi du temps">Le Surveillant Général ne l'a pas encore saisi pour cette classe.</Vide>
            </Carte>
          ) : (
            // Tableau de la semaine : une ligne par horaire, une colonne par jour.
            <div className="overflow-x-auto rounded-lg border border-bord bg-surface">
              <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-[1] w-28 border-b border-r border-bord bg-surface-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-encre-2">
                      Horaire
                    </th>
                    {jours.map((j) => {
                      const total = parJour(j).reduce((n, c) => n + c.duree, 0);
                      return (
                        <th key={j} className="border-b border-r border-bord bg-primaire px-3 py-2 text-left text-white last:border-r-0 dark:text-[rgb(12_24_38)]">
                          <span className="font-bold">{JOURS[j]}</span>
                          {total > 0 && <span className="ml-2 text-xs font-normal opacity-90">{duree(total)}</span>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {horaires.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-encre-3">
                        {sg ? "Commencez par les heures (« Ajouter une heure »), puis remplissez chaque case avec une matière." : 'Aucun cours saisi.'}
                      </td>
                    </tr>
                  )}
                  {horaires.map(([debut, fin], k) => (
                    <tr key={`${debut}-${fin}`} className={clsx(k % 2 === 1 && 'bg-surface-2/50')}>
                      <th className="sticky left-0 z-[1] whitespace-nowrap border-b border-r border-bord bg-surface-2 px-1 py-1 text-left align-top font-bold tabular-nums">
                        {sg ? (
                          <button
                            type="button"
                            onClick={() => setHoraire([debut, fin])}
                            title="Modifier cet horaire : il s'applique à tous les cours de la ligne"
                            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-primaire-pale"
                          >
                            {debut} – {fin}
                            <Pencil className="h-3.5 w-3.5 text-encre-3" aria-hidden />
                          </button>
                        ) : null}
                        {sg && plageDe(debut, fin) && !(v.creneaux ?? []).some((c) => c.debut === debut && c.fin === fin) && (
                          <button
                            type="button"
                            className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-danger hover:underline"
                            disabled={retirerLigne.isPending}
                            onClick={() => retirerLigne.mutate(plageDe(debut, fin)!.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Retirer la ligne
                          </button>
                        )}
                        {!sg && (
                          <span className="block px-2 py-1">
                            {debut} – {fin}
                          </span>
                        )}
                      </th>
                      {jours.map((j) => {
                        const ici = parJour(j).filter((c) => c.debut === debut && c.fin === fin);
                        return (
                          <td key={j} className="border-b border-r border-bord p-1 align-top last:border-r-0">
                            {sg && ici.length === 0 && (
                              <button
                                type="button"
                                onClick={() => setEdition({ jour: j, horaire: [debut, fin] })}
                                title={`Ajouter une matière le ${JOURS[j].toLowerCase()} de ${debut} à ${fin}`}
                                aria-label={`Ajouter une matière le ${JOURS[j].toLowerCase()} de ${debut} à ${fin}`}
                                className="flex h-full min-h-[2.75rem] w-full items-center justify-center rounded border border-dashed border-bord text-encre-3 hover:border-primaire hover:bg-primaire-pale hover:text-primaire"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            )}
                            {ici.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                disabled={!sg}
                                onClick={() => setEdition(c)}
                                title={c.conflits.map((x) => (x.memeClasse ? `Même heure que ${x.matiere}` : `Enseignant aussi attendu en ${x.classe} (${x.matiere})`)).join(' · ') || undefined}
                                className={clsx('block w-full rounded px-2 py-1.5 text-left', sg && 'hover:bg-primaire-pale', c.conflits.length > 0 && 'ring-1 ring-danger/50')}
                              >
                                <span className="block font-semibold leading-tight">{c.matiere.nom}</span>
                                <span className="block text-xs text-encre-2">
                                  {c.matiere.professeur ? `${c.matiere.professeur.prenom} ${c.matiere.professeur.nom}` : 'Aucun enseignant'}
                                </span>
                                {c.conflits.length > 0 && (
                                  <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-danger">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    {c.conflits[0].memeClasse ? 'Deux cours à la même heure' : `Enseignant aussi en ${c.conflits[0].classe}`}
                                    {c.conflits.length > 1 ? ` (+${c.conflits.length - 1})` : ''}
                                  </span>
                                )}
                              </button>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {sg && (
                    <tr>
                      <td className="sticky left-0 z-[1] bg-surface p-1">
                        <button
                          type="button"
                          className="flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded bg-primaire px-2 py-1.5 text-sm font-semibold text-white hover:bg-primaire/90 dark:text-[rgb(12_24_38)]"
                          onClick={() => setNouvelleLigne(true)}
                        >
                          <Plus className="h-4 w-4" /> Ajouter une heure
                        </button>
                      </td>
                      {jours.map((j) => (
                        <td key={j} className="p-1">
                          <button
                            type="button"
                            className="flex w-full items-center justify-center gap-1.5 rounded bg-primaire/10 py-1.5 text-sm font-semibold text-primaire hover:bg-primaire/20"
                            onClick={() => setEdition({ jour: j })}
                          >
                            <Plus className="h-4 w-4" /> Ajouter
                          </button>
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {edition && v && (
        <FormCreneau
          classeId={classeId}
          versionId={v.version?.id ?? null}
          creneau={'id' in edition ? edition : null}
          jour={edition.jour}
          horaire={'id' in edition ? undefined : edition.horaire}
          creneaux={v.creneaux}
          matieres={matieres.data ?? []}
          fermer={() => setEdition(null)}
          enregistre={mettreAJour}
        />
      )}
      {nouvelleLigne && v && (
        <FormLigne
          classeId={classeId}
          versionId={v.version?.id ?? null}
          derniere={horaires[horaires.length - 1]?.[1]}
          fermer={() => setNouvelleLigne(false)}
          enregistre={mettreAJour}
        />
      )}
      {horaire && v && (
        <FormHoraire
          classeId={classeId}
          versionId={v.version?.id ?? null}
          horaire={horaire}
          nombre={v.creneaux.filter((c) => c.debut === horaire[0] && c.fin === horaire[1]).length}
          fermer={() => setHoraire(null)}
          enregistre={mettreAJour}
        />
      )}
      {nouvelleVersion && v && (
        <FormVersion
          classeId={classeId}
          aDejaUneVersion={v.versions.length > 0}
          fermer={() => setNouvelleVersion(false)}
          enregistre={(vue) => {
            aller(classeId, vue.version?.id);
            mettreAJour(vue);
          }}
        />
      )}
    </Page>
  );
}

const minutes = (h: string) => {
  const [x, y] = h.split(':').map(Number);
  return x * 60 + y;
};

/** Nouvelle ligne horaire, vide : on remplit ensuite chaque case avec une matière. */
function FormLigne({
  classeId,
  versionId,
  derniere,
  fermer,
  enregistre,
}: {
  classeId: string;
  versionId: string | null;
  derniere?: string;
  fermer: () => void;
  enregistre: (v: Vue) => void;
}) {
  // Par défaut, la ligne commence à la fin de la dernière et dure 55 minutes.
  const debutParDefaut = derniere ?? '07:30';
  const finParDefaut = (() => {
    const m = minutes(debutParDefaut) + 55;
    return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  })();
  const [f, setF] = useState({ debut: debutParDefaut, fin: finParDefaut });
  const ecart = f.debut && f.fin ? minutes(f.fin) - minutes(f.debut) : 0;
  const enregistrer = useMutation({
    mutationFn: () => api<Vue>('/emplois-du-temps/plages', { methode: 'POST', corps: { classeId, versionId, ...f } }),
    onSuccess: (v) => {
      toast.success(`Ligne ${f.debut} – ${f.fin} ajoutée : remplissez maintenant ses cases.`);
      enregistre(v);
      fermer();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Modale
      titre="Ajouter une heure"
      ouverte
      fermer={fermer}
      pied={
        <>
          <button type="button" className="bouton-secondaire" onClick={fermer}>
            Annuler
          </button>
          <button type="button" className="bouton-primaire" disabled={enregistrer.isPending || ecart <= 0} onClick={() => enregistrer.mutate()}>
            {enregistrer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Ajouter la ligne
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-encre-2">La ligne apparaît vide dans le tableau ; cliquez ensuite sur chaque case pour y mettre une matière.</p>
        <div className="grid grid-cols-2 gap-3">
          <Champ libelle="Début">
            <input type="time" className="champ" value={f.debut} onChange={(e) => setF({ ...f, debut: e.target.value })} />
          </Champ>
          <Champ libelle="Fin">
            <input type="time" className="champ" value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} />
          </Champ>
        </div>
        <p className="text-sm text-encre-2">{ecart > 0 ? `Durée : ${duree(ecart)}` : "L'heure de fin doit être après l'heure de début."}</p>
      </div>
    </Modale>
  );
}

/** Nouvel horaire pour toute une ligne : chaque cours de cet horaire, du lundi au vendredi, le prend. */
function FormHoraire({
  classeId,
  versionId,
  horaire,
  nombre,
  fermer,
  enregistre,
}: {
  classeId: string;
  versionId: string | null;
  horaire: readonly [string, string];
  nombre: number;
  fermer: () => void;
  enregistre: (v: Vue) => void;
}) {
  const [f, setF] = useState({ debut: horaire[0], fin: horaire[1] });
  const envoi = useCleEnvoi();
  const ecart = f.debut && f.fin ? minutes(f.fin) - minutes(f.debut) : 0;
  const enregistrer = useMutation({
    mutationFn: () =>
      envoyer(
        (entetes) =>
          api<Vue>('/emplois-du-temps/horaires', {
            methode: 'PUT',
            corps: { classeId, versionId, ancienDebut: horaire[0], ancienFin: horaire[1], ...f },
            entetes,
          }),
        envoi.cle(),
      ),
    onSuccess: (v) => {
      toast.success(`Horaire modifié pour ${nombre} cours.`);
      enregistre(v);
      fermer();
    },
    onError: (e) => {
      if (!estAbandon(e)) toast.error(e.message);
    },
  });
  return (
    <Modale
      titre="Modifier l'horaire"
      ouverte
      fermer={fermer}
      pied={
        <>
          <button type="button" className="bouton-secondaire" onClick={fermer}>
            Annuler
          </button>
          <button type="button" className="bouton-primaire" disabled={enregistrer.isPending || ecart <= 0} onClick={() => enregistrer.mutate()}>
            {enregistrer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Appliquer à la ligne
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">
          L'horaire <strong className="tabular-nums">{horaire[0]} – {horaire[1]}</strong> change pour les <strong>{nombre} cours</strong> de cette ligne, du lundi au vendredi.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Champ libelle="Début">
            <input type="time" className="champ" value={f.debut} onChange={(e) => setF({ ...f, debut: e.target.value })} />
          </Champ>
          <Champ libelle="Fin">
            <input type="time" className="champ" value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} />
          </Champ>
        </div>
        <p className="text-sm text-encre-2">{ecart > 0 ? `Durée : ${duree(ecart)}` : "L'heure de fin doit être après l'heure de début."}</p>
      </div>
    </Modale>
  );
}

function FormCreneau({
  classeId,
  versionId,
  creneau,
  jour,
  horaire,
  creneaux,
  matieres,
  fermer,
  enregistre,
}: {
  classeId: string;
  versionId: string | null;
  creneau: Creneau | null;
  jour: number;
  /** Nouveau créneau depuis une case vide : l'horaire de sa ligne. */
  horaire?: readonly [string, string];
  creneaux: Creneau[];
  matieres: Matiere[];
  fermer: () => void;
  enregistre: (v: Vue) => void;
}) {
  // Nouveau créneau : il commence par défaut à la fin du dernier cours du jour.
  const dernier = creneaux.filter((c) => c.jour === jour).sort((x, y) => minutes(y.fin) - minutes(x.fin))[0];
  const [f, setF] = useState({
    jour: creneau?.jour ?? jour,
    debut: creneau?.debut ?? horaire?.[0] ?? dernier?.fin ?? '07:30',
    fin: creneau?.fin ?? horaire?.[1] ?? '',
    matiereId: creneau?.matiere.id ?? '',
  });
  const envoi = useCleEnvoi();
  const ecart = f.debut && f.fin ? minutes(f.fin) - minutes(f.debut) : 0;

  const enregistrer = useMutation({
    mutationFn: () =>
      envoyer(
        (entetes) =>
          api<Vue>(creneau ? `/emplois-du-temps/creneaux/${creneau.id}` : '/emplois-du-temps/creneaux', {
            methode: creneau ? 'PUT' : 'POST',
            corps: { classeId, versionId, ...f },
            entetes,
          }),
        envoi.cle(),
      ),
    onSuccess: (v) => {
      toast.success(creneau ? 'Créneau modifié.' : 'Créneau ajouté.');
      enregistre(v);
      fermer();
    },
    onError: (e) => {
      if (!estAbandon(e)) toast.error(e.message);
    },
  });
  const supprimer = useMutation({
    mutationFn: () => api<Vue>(`/emplois-du-temps/creneaux/${creneau!.id}`, { methode: 'DELETE' }),
    onSuccess: (v) => {
      toast.success('Créneau retiré.');
      enregistre(v);
      fermer();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Modale
      titre={creneau ? 'Modifier le créneau' : `Nouveau créneau, ${JOURS[jour].toLowerCase()}`}
      ouverte
      fermer={fermer}
      pied={
        <>
          {creneau && (
            <button type="button" className="bouton-discret mr-auto text-danger" disabled={supprimer.isPending} onClick={() => supprimer.mutate()}>
              <Trash2 className="h-4 w-4" /> Retirer
            </button>
          )}
          <button type="button" className="bouton-secondaire" onClick={fermer}>
            Annuler
          </button>
          <button type="submit" form="form-creneau" className="bouton-primaire" disabled={enregistrer.isPending}>
            {enregistrer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </button>
        </>
      }
    >
      <form
        id="form-creneau"
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          enregistrer.mutate();
        }}
      >
        <Champ libelle="Matière" className="sm:col-span-2">
          <select className="champ" required value={f.matiereId} onChange={(e) => setF({ ...f, matiereId: e.target.value })}>
            <option value="">Choisir…</option>
            {matieres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom}
                {m.professeur ? ` · ${m.professeur.prenom} ${m.professeur.nom}` : ''}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Jour" className="sm:col-span-2">
          <select className="champ" value={f.jour} onChange={(e) => setF({ ...f, jour: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((j) => (
              <option key={j} value={j}>
                {JOURS[j]}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Début">
          <input type="time" className="champ" required step={300} value={f.debut} onChange={(e) => setF({ ...f, debut: e.target.value })} />
        </Champ>
        <Champ libelle="Fin" aide={ecart > 0 ? `Durée : ${duree(ecart)}` : ecart < 0 ? 'La fin doit être après le début.' : undefined}>
          <input type="time" className="champ" required step={300} value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} />
        </Champ>
      </form>
    </Modale>
  );
}

function FormVersion({
  classeId,
  aDejaUneVersion,
  fermer,
  enregistre,
}: {
  classeId: string;
  aDejaUneVersion: boolean;
  fermer: () => void;
  enregistre: (v: Vue) => void;
}) {
  const [valableDu, setValableDu] = useState('');
  const [copier, setCopier] = useState(true);
  const creer = useMutation({
    mutationFn: () => api<Vue>('/emplois-du-temps/versions', { methode: 'POST', corps: { classeId, valableDu: valableDu || null, copier } }),
    onSuccess: (v) => {
      toast.success('Nouvelle version créée.');
      enregistre(v);
      fermer();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Modale
      titre="Nouvelle version de l'emploi du temps"
      ouverte
      fermer={fermer}
      pied={
        <>
          <button type="button" className="bouton-secondaire" onClick={fermer}>
            Annuler
          </button>
          <button type="submit" form="form-version" className="bouton-primaire" disabled={creer.isPending}>
            {creer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Créer
          </button>
        </>
      }
    >
      <form
        id="form-version"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          creer.mutate();
        }}
      >
        <p className="text-sm text-encre-2">
          À partir de cette date, la nouvelle version remplace l'actuelle. Les jours d'avant gardent l'ancienne, pour que les absences déjà relevées restent justes.
        </p>
        <Champ libelle="À partir du" aide={aDejaUneVersion ? undefined : 'Laissez vide pour un emploi du temps valable depuis la rentrée.'}>
          <input type="date" className="champ" required={aDejaUneVersion} value={valableDu} onChange={(e) => setValableDu(e.target.value)} />
        </Champ>
        {aDejaUneVersion && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={copier} onChange={(e) => setCopier(e.target.checked)} />
            Reprendre les créneaux actuels, puis les modifier
          </label>
        )}
      </form>
    </Modale>
  );
}
