import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GitMerge, KeyRound, Loader2, Pencil, Plus, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { envoyer, estAbandon, useCleEnvoi } from '../../lib/doublons';
import { ChoixAutreEnseignant, FusionModale } from '../../components/Fusion';
import { requetes } from '../../lib/requetes';
import { useApp } from '../../lib/contexte';
import type { Enseignant } from '../../lib/types';
import { Carte, Chargement, Champ, Erreur, Etat, Modale, Page, Vide } from '../../components/ui';
import { type Carriere, carriereDe, ChampsCarriere, corpsCarriere } from '../../components/Carriere';
import { confirmer } from '../../lib/confirmation';
import { BoutonsExport, exporterTableau, filtres, type FormatExport } from '../../lib/export';

export default function Enseignants() {
  const { a, annee } = useApp();
  const client = useQueryClient();
  const q = useQuery(requetes.enseignants(annee?.id));
  const [edition, setEdition] = useState<Enseignant | 'nouveau' | null>(null);
  const [filtre, setFiltre] = useState('');
  const [fusion, setFusion] = useState<{ moi: Enseignant; autre?: string } | null>(null);
  const sg = a('SURVEILLANT_GENERAL');

  const reinitialiser = useMutation({
    mutationFn: (p: Enseignant) =>
      envoyer((entetes) => api<{ message: string }>(`/utilisateurs/${p.id}/reinitialiser`, { methode: 'POST', entetes })),
    onSuccess: (r) => toast.success(r.message),
    onError: (e) => !estAbandon(e) && toast.error(e.message),
  });

  const liste = (q.data ?? []).filter((p) =>
    `${p.nom} ${p.prenom} ${p.discipline ?? ''} ${p.telephone ?? ''}`.toLowerCase().includes(filtre.toLowerCase()),
  );

  const etat = (p: Enseignant) =>
    p.fusionneDansId ? 'Fusionné' : !p.actif ? 'Désactivé' : p.doitChangerMotDePasse ? 'Mot de passe provisoire' : 'Actif';
  // La liste affichée (recherche comprise) ; les matières de chacun dans une seule case.
  const exporter = (format: FormatExport) =>
    exporterTableau(format, {
      titre: 'Enseignants',
      sousTitre: [`Année scolaire ${annee?.libelle ?? ''}`, `${liste.length} enseignant(s)`, filtres(['Recherche', filtre && `« ${filtre} »`])]
        .filter(Boolean)
        .join(' · '),
      colonnes: [
        { titre: 'Enseignant', largeur: 1.8, gras: true },
        { titre: 'Grade · discipline', largeur: 1.6 },
        { titre: 'Téléphone', largeur: 1 },
        { titre: 'E-mail', largeur: 1.6 },
        { titre: 'Matières enseignées', largeur: 3.6 },
        { titre: 'Prof. principal', largeur: 1.4 },
        { titre: 'État', largeur: 1 },
      ],
      lignes: liste.map((p) => ({
        c: [
          `${p.nom} ${p.prenom}`,
          [p.grade, p.discipline].filter(Boolean).join(' · '),
          p.telephone ?? '',
          p.email ?? '',
          p.matieres.map((m) => `${m.nom} (${m.classe.nom})`).join(' ; '),
          p.classesPrincipales.map((c) => c.nom).join(', '),
          etat(p),
        ],
      })),
      paysage: true,
    });

  return (
    <Page
      titre="Enseignants"
      description="Comptes des professeurs, leurs matières et leurs classes pour l'année consultée."
      actions={
        <>
          <BoutonsExport exporter={exporter} desactive={!liste.length} />
          {sg && (
            <button type="button" className="bouton-primaire" onClick={() => setEdition('nouveau')}>
              <Plus className="h-4 w-4" /> Nouvel enseignant
            </button>
          )}
        </>
      }
    >
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-encre-3" />
        <input className="champ pl-9" placeholder="Nom, discipline ou téléphone" value={filtre} onChange={(e) => setFiltre(e.target.value)} />
      </div>
      <Carte sansMarge titre={q.data ? `${q.data.filter((p) => p.actif).length} enseignant(s) actif(s)` : undefined}>
        {q.isLoading ? (
          <div className="px-4">
            <Chargement />
          </div>
        ) : q.error ? (
          <div className="p-4">
            <Erreur erreur={q.error} />
          </div>
        ) : !liste.length ? (
          <Vide titre="Aucun enseignant" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Enseignant</th>
                  <th className="hidden md:table-cell">Contact</th>
                  <th>Matières enseignées</th>
                  <th className="hidden lg:table-cell">Prof. principal</th>
                  <th>État</th>
                  {sg && <th />}
                </tr>
              </thead>
              <tbody>
                {liste.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="font-medium">
                        {p.nom} {p.prenom}
                      </div>
                      {(p.discipline || p.grade) && (
                        <div className="text-xs text-encre-2">{[p.grade, p.discipline].filter(Boolean).join(' · ')}</div>
                      )}
                    </td>
                    <td className="hidden text-encre-2 md:table-cell">
                      <div className="tabular-nums">{p.telephone ?? ''}</div>
                      <div className="text-xs">{p.email ?? ''}</div>
                    </td>
                    <td className="text-sm">
                      {p.matieres.length ? (
                        p.matieres.map((m) => (
                          <div key={m.id}>
                            {m.nom} <span className="text-encre-3">· {m.classe.nom}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-encre-3">Aucune</span>
                      )}
                    </td>
                    <td className="hidden lg:table-cell">{p.classesPrincipales.map((c) => c.nom).join(', ') || '—'}</td>
                    <td>
                      {p.fusionneDansId ? (
                        <Etat ton="neutre">Fusionné</Etat>
                      ) : !p.actif ? (
                        <Etat ton="neutre">Désactivé</Etat>
                      ) : p.doitChangerMotDePasse ? (
                        <Etat ton="alerte">Mot de passe provisoire</Etat>
                      ) : (
                        <Etat ton="succes">Actif</Etat>
                      )}
                    </td>
                    {sg && p.fusionneDansId && <td />}
                    {sg && !p.fusionneDansId && (
                      <td className="whitespace-nowrap text-right">
                        <button type="button" className="bouton-discret" onClick={() => setFusion({ moi: p })} title="Fusionner avec un autre compte de la même personne">
                          <GitMerge className="h-4 w-4" />
                        </button>
                        <button type="button" className="bouton-discret" onClick={() => setEdition(p)} aria-label="Modifier">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="bouton-discret"
                          title="Réinitialiser le mot de passe"
                          onClick={async () => {
                            if (
                              await confirmer({
                                titre: 'Réinitialiser le mot de passe',
                                message: `Le mot de passe de ${p.prenom} ${p.nom} deviendra « password ».`,
                                action: 'Réinitialiser',
                              })
                            )
                              reinitialiser.mutate(p);
                          }}
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
      {edition && (
        <FormEnseignant
          enseignant={edition === 'nouveau' ? null : edition}
          fermer={() => setEdition(null)}
          rafraichir={() => client.invalidateQueries({ queryKey: ['enseignants'] })}
        />
      )}
      {fusion && !fusion.autre && (
        <ChoixAutreEnseignant moi={fusion.moi} comptes={q.data ?? []} choisir={(id) => setFusion({ ...fusion, autre: id })} fermer={() => setFusion(null)} />
      )}
      {fusion?.autre && <FusionModale type="enseignants" a={fusion.moi.id} b={fusion.autre} fermer={() => setFusion(null)} />}
    </Page>
  );
}

function FormEnseignant({ enseignant, fermer, rafraichir }: { enseignant: Enseignant | null; fermer: () => void; rafraichir: () => void }) {
  const [f, setF] = useState({
    nom: enseignant?.nom ?? '',
    prenom: enseignant?.prenom ?? '',
    telephone: enseignant?.telephone ?? '',
    email: enseignant?.email ?? '',
    discipline: enseignant?.discipline ?? '',
    actif: enseignant?.actif ?? true,
  });
  const [carriere, setCarriere] = useState<Carriere>(carriereDe(enseignant));
  const corps = { ...f, carriere: corpsCarriere(carriere) };
  const cle = useCleEnvoi();
  const envoi = useMutation({
    mutationFn: () =>
      envoyer(
        (entetes) =>
          enseignant
            ? api(`/utilisateurs/${enseignant.id}`, { methode: 'PUT', corps, entetes })
            : api('/utilisateurs', { methode: 'POST', corps, entetes }),
        cle.cle(),
      ),
    onSuccess: () => {
      cle.renouveler();
      toast.success(enseignant ? 'Enseignant modifié.' : 'Compte créé. Mot de passe provisoire : « password ».');
      rafraichir();
      fermer();
    },
  });
  return (
    <Modale
      titre={enseignant ? `Modifier ${enseignant.prenom} ${enseignant.nom}` : 'Nouvel enseignant'}
      ouverte
      fermer={fermer}
      pied={
        <>
          <button type="button" className="bouton-secondaire" onClick={fermer}>
            Annuler
          </button>
          <button type="button" className="bouton-primaire" disabled={envoi.isPending} onClick={() => envoi.mutate()}>
            {envoi.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {envoi.error ? (
          <div className="sm:col-span-2">
            <Erreur erreur={envoi.error} />
          </div>
        ) : null}
        <Champ libelle="Nom">
          <input className="champ" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} maxLength={60} />
        </Champ>
        <Champ libelle="Prénom">
          <input className="champ" value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })} maxLength={80} />
        </Champ>
        <Champ libelle="Téléphone" aide="Sert d'identifiant de connexion.">
          <input className="champ" inputMode="tel" value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })} />
        </Champ>
        <Champ libelle="E-mail" aide="Facultatif si le téléphone est renseigné.">
          <input className="champ" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Champ>
        <Champ libelle="Discipline" className="sm:col-span-2">
          <input className="champ" value={f.discipline} onChange={(e) => setF({ ...f, discipline: e.target.value })} maxLength={80} placeholder="Mathématiques, Électricité…" />
        </Champ>
        <div className="border-t border-bord pt-3 sm:col-span-2">
          <div className="mb-2 text-sm font-semibold">Carrière</div>
          <p className="mb-3 text-xs text-encre-3">Imprimée sur l'attestation de présence effective au poste délivrée par le Directeur.</p>
          <ChampsCarriere valeur={carriere} changer={setCarriere} />
        </div>
        {enseignant && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-4 w-4" checked={f.actif} onChange={(e) => setF({ ...f, actif: e.target.checked })} />
            Compte actif (décochez pour bloquer la connexion)
          </label>
        )}
        {!enseignant && (
          <p className="text-xs text-encre-3 sm:col-span-2">
            Le compte reçoit le mot de passe provisoire « password » ; l'enseignant devra le changer à sa première connexion.
          </p>
        )}
      </div>
    </Modale>
  );
}
