import { useState } from 'react';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CalendarPlus, Clock, Loader2, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { envoyer, estAbandon, useCleEnvoi } from '../../lib/doublons';
import { requetes } from '../../lib/requetes';
import { useApp } from '../../lib/contexte';
import { useParametresUrl } from '../../lib/navigation';
import { date, duree } from '../../lib/format';
import type { Classe, Matiere } from '../../lib/types';
import { Carte, Chargement, Champ, Erreur, Modale, Page, Vide } from '../../components/ui';

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
}

const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

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

/** Emploi du temps d'une classe : la semaine type, jour par jour ; le SG le tient, le Proviseur le consulte. */
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
  const matieres = useQuery({
    queryKey: ['matieres', annee?.id, classeId],
    queryFn: () => api<Matiere[]>(`/matieres?classeId=${classeId}`),
    enabled: Boolean(classeId) && sg,
  });
  const [edition, setEdition] = useState<Creneau | { jour: number } | null>(null);
  const [nouvelleVersion, setNouvelleVersion] = useState(false);
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
  // Le samedi n'apparaît que s'il a des cours (ou pour en ajouter, côté SG).
  const jours = [1, 2, 3, 4, 5, 6].filter((j) => j < 6 || sg || parJour(j).length > 0);

  return (
    <Page
      titre="Emploi du temps"
      description="La semaine type de chaque classe. Une nouvelle version, à partir d'une date, remplace la précédente pour les jours suivants ; les jours passés gardent l'ancienne."
      actions={
        sg &&
        classeId && (
          <button type="button" className="bouton-secondaire" onClick={() => setNouvelleVersion(true)}>
            <CalendarPlus className="h-4 w-4" /> Nouvelle version
          </button>
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
            onClick={() => {
              if (confirm(`Supprimer la version « ${libelleVersion(v.version!)} » et ses ${v.creneaux.length} créneau(x) ?`)) supprimerVersion.mutate(v.version!.id);
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
              {jours.map((j) => {
                const liste = parJour(j);
                const total = liste.reduce((n, c) => n + c.duree, 0);
                return (
                  <section key={j} className="flex flex-col overflow-hidden rounded-lg border border-bord bg-surface">
                    <header className="flex items-baseline justify-between gap-2 bg-primaire px-3 py-2 text-white dark:text-[rgb(12_24_38)]">
                      <h2 className="font-bold">{JOURS[j]}</h2>
                      {total > 0 && <span className="text-xs opacity-90">{duree(total)}</span>}
                    </header>
                    <ul className="flex-1 divide-y divide-bord">
                      {liste.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            disabled={!sg}
                            onClick={() => setEdition(c)}
                            className={clsx('w-full px-3 py-2.5 text-left', sg && 'hover:bg-primaire-pale/40')}
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-sm font-bold tabular-nums">
                                {c.debut} – {c.fin}
                              </span>
                              <span className="text-xs text-encre-2">{duree(c.duree)}</span>
                            </div>
                            <div className="font-medium">{c.matiere.nom}</div>
                            <div className="text-xs text-encre-2">
                              {c.matiere.professeur ? `${c.matiere.professeur.prenom} ${c.matiere.professeur.nom}` : 'Aucun enseignant'}
                            </div>
                            {c.conflits.map((k, i) => (
                              <div key={i} className="mt-1 flex items-start gap-1 text-xs font-semibold text-danger">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                {k.memeClasse
                                  ? `Même heure que ${k.matiere} (${k.debut} – ${k.fin})`
                                  : `Enseignant attendu en ${k.classe} (${k.matiere}, ${k.debut} – ${k.fin})`}
                              </div>
                            ))}
                          </button>
                        </li>
                      ))}
                      {liste.length === 0 && <li className="px-3 py-4 text-center text-sm text-encre-3">Pas de cours</li>}
                    </ul>
                    {sg && (
                      <button
                        type="button"
                        className="flex items-center justify-center gap-1.5 border-t border-bord bg-primaire/10 py-2 text-sm font-semibold text-primaire hover:bg-primaire/20"
                        onClick={() => setEdition({ jour: j })}
                      >
                        <Plus className="h-4 w-4" /> Ajouter
                      </button>
                    )}
                  </section>
                );
              })}
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
          creneaux={v.creneaux}
          matieres={matieres.data ?? []}
          fermer={() => setEdition(null)}
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

function FormCreneau({
  classeId,
  versionId,
  creneau,
  jour,
  creneaux,
  matieres,
  fermer,
  enregistre,
}: {
  classeId: string;
  versionId: string | null;
  creneau: Creneau | null;
  jour: number;
  creneaux: Creneau[];
  matieres: Matiere[];
  fermer: () => void;
  enregistre: (v: Vue) => void;
}) {
  // Nouveau créneau : il commence par défaut à la fin du dernier cours du jour.
  const dernier = creneaux.filter((c) => c.jour === jour).sort((x, y) => minutes(y.fin) - minutes(x.fin))[0];
  const [f, setF] = useState({
    jour: creneau?.jour ?? jour,
    debut: creneau?.debut ?? dernier?.fin ?? '07:30',
    fin: creneau?.fin ?? '',
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
            {[1, 2, 3, 4, 5, 6].map((j) => (
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
