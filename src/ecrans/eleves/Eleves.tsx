import { useState } from 'react';
import Link from 'next/link';
import { useParametresUrl } from '../../lib/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Camera, Download, FileSpreadsheet, FileText, Loader2, Plus, Search, Upload } from 'lucide-react';
import { api, telecharger } from '../../lib/api';
import { envoyer, useCleEnvoi } from '../../lib/doublons';
import { requetes } from '../../lib/requetes';
import { useApp } from '../../lib/contexte';
import { date } from '../../lib/format';
import type { Classe } from '../../lib/types';
import { Carte, Chargement, Champ, Erreur, Modale, Page, Vide } from '../../components/ui';
import { AjoutEleves } from './AjoutEleves';
import { CelluleSanction, FenetreDecision, type BilanEleve } from '../absences/Bilan';
import { PhotosEleves } from './PhotosEleves';

export default function Eleves() {
  const { a, annee } = useApp();
  const [params, setParams] = useParametresUrl();
  const classeId = params.get('classe') ?? '';
  const [recherche, setRecherche] = useState('');
  // Filtre par sanction (absences non justifiées de l'année).
  const [sanction, setSanction] = useState('');
  const [creation, setCreation] = useState(false);
  const [import_, setImport] = useState(false);
  const [photos, setPhotos] = useState(false);

  const classes = useQuery(requetes.classes(annee?.id));
  const eleves = useQuery(requetes.eleves(annee?.id, classeId, recherche));
  // Sanction de l'année de chaque élève (absences non justifiées) : on voit d'un coup d'œil qui est concerné,
  // et le Directeur décide des exclusions d'ici.
  const client = useQueryClient();
  const sanctions = useQuery({
    queryKey: ['absences-sanctions', annee?.id, classeId],
    queryFn: () => api<BilanEleve[]>(`/absences/sanctions${classeId ? `?classeId=${classeId}` : ''}`),
  });
  const parInscription = new Map((sanctions.data ?? []).map((s) => [s.inscriptionId, s]));
  const retenu = (id: string) => {
    if (!sanction) return true;
    const x = parInscription.get(id);
    if (!x) return false;
    if (sanction === 'AVEC') return Boolean(x.libelleSanction);
    if (sanction === 'A_DECIDER') return x.palierExclusion && !x.decision;
    return x.sanction === sanction;
  };
  const liste = (eleves.data ?? []).filter((i) => retenu(i.id));
  const [aDecider, setADecider] = useState<BilanEleve | null>(null);
  const rafraichirSanctions = () => {
    client.invalidateQueries({ queryKey: ['absences-sanctions'] });
    client.invalidateQueries({ queryKey: ['absences-bilan'] });
    client.invalidateQueries({ queryKey: ['eleves'] });
  };
  const annulerDecision = useMutation({
    mutationFn: (id: string) => api<{ message: string }>(`/absences/exclusions/${id}`, { methode: 'DELETE' }),
    onSuccess: (r) => {
      toast.success(r.message);
      rafraichirSanctions();
    },
    onError: (e) => toast.error(e.message),
  });

  const exporter = (format: 'pdf' | 'xlsx') =>
    telecharger(`/documents/liste?classeId=${classeId}&format=${format}`, { ouvrir: format === 'pdf' }).catch((e) => toast.error(e.message));

  return (
    <Page
      titre="Élèves"
      description={`Élèves inscrits en ${annee?.libelle ?? ''}. Les élèves renvoyés n'apparaissent pas ici.`}
      actions={
        <>
          <button type="button" className="bouton-secondaire" onClick={() => setPhotos(true)} disabled={!classes.data?.length}>
            <Camera className="h-4 w-4" /> Photos
          </button>
          {a('SURVEILLANT_GENERAL') && (
            <button type="button" className="bouton-secondaire" onClick={() => setImport(true)}>
              <Upload className="h-4 w-4" /> Importer
            </button>
          )}
          <button type="button" className="bouton-primaire" onClick={() => setCreation(true)} disabled={!classes.data?.length}>
            <Plus className="h-4 w-4" /> Ajouter des élèves
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <Champ libelle="Classe" className="w-56">
          <select
            className="champ"
            value={classeId}
            onChange={(e) => setParams(e.target.value ? { classe: e.target.value } : {})}
          >
            <option value="">Toutes les classes</option>
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} ({c._count.inscriptions})
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Sanction" className="w-56">
          <select className="champ" value={sanction} onChange={(e) => setSanction(e.target.value)}>
            <option value="">Toutes</option>
            <option value="AVEC">Avec une sanction</option>
            <option value="AVERTISSEMENT">Avertissement conduite</option>
            <option value="BLAME">Blâme conduite</option>
            <option value="EXCLUSION">Exclusion</option>
            <option value="A_DECIDER">Exclusion à décider</option>
          </select>
        </Champ>
        <Champ libelle="Rechercher" className="min-w-[14rem] flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-encre-3" />
            <input className="champ pl-9" placeholder="Nom, prénom ou matricule" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          </div>
        </Champ>
        {classeId && (
          <div className="flex gap-2">
            <button type="button" className="bouton-secondaire" onClick={() => exporter('pdf')}>
              <FileText className="h-4 w-4" /> Liste PDF
            </button>
            <button type="button" className="bouton-secondaire" onClick={() => exporter('xlsx')}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </button>
          </div>
        )}
      </div>

      <Carte sansMarge titre={eleves.data ? `${liste.length} élève${liste.length > 1 ? 's' : ''}${sanction ? ` sur ${eleves.data.length}` : ''}` : 'Élèves'}>
        {eleves.isLoading ? (
          <div className="px-4">
            <Chargement />
          </div>
        ) : eleves.error ? (
          <div className="p-4">
            <Erreur erreur={eleves.error} />
          </div>
        ) : !liste.length ? (
          <Vide titre={sanction ? 'Aucun élève avec cette sanction' : recherche ? 'Aucun élève ne correspond à la recherche' : 'Aucun élève inscrit'}>
            {!recherche && !sanction && 'Ajoutez les élèves un par un ou importez un fichier Excel.'}
          </Vide>
        ) : (
          <div className="overflow-x-auto">
            <table className="tableau">
              <thead>
                <tr>
                  <th className="w-12 text-right" title="Numéro d'ordre dans la classe">N°</th>
                  <th>Matricule</th>
                  <th>Nom et prénoms</th>
                  <th>Sexe</th>
                  <th className="hidden md:table-cell">Né(e) le</th>
                  <th>Classe</th>
                  <th className="hidden lg:table-cell">Mat. national</th>
                  <th className="hidden sm:table-cell">Redoublant</th>
                  <th>Sanction</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((i) => (
                  <tr key={i.id}>
                    <td className="text-right font-semibold tabular-nums">{i.numero ?? ''}</td>
                    <td className="tabular-nums text-encre-2">{i.eleve.matricule}</td>
                    <td>
                      <Link href={`/eleves/${i.eleve.id}`} className="lien">
                        {i.eleve.nom} {i.eleve.prenoms}
                      </Link>
                    </td>
                    <td>{i.eleve.sexe}</td>
                    <td className="hidden tabular-nums md:table-cell">{date(i.eleve.dateNaissance)}</td>
                    <td>{i.classe.nom}</td>
                    <td className="hidden tabular-nums text-encre-2 lg:table-cell">{i.eleve.matriculeNational ?? '—'}</td>
                    <td className="hidden sm:table-cell">{i.redoublant ? 'Oui' : 'Non'}</td>
                    <td className="min-w-[12rem]">
                      {parInscription.get(i.id) ? (
                        <CelluleSanction e={parInscription.get(i.id)!} decider={setADecider} annuler={(id) => annulerDecision.mutate(id)} enCours={annulerDecision.isPending} />
                      ) : (
                        <span className="text-encre-3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      {creation && classes.data && (
        <AjoutEleves fermer={() => setCreation(false)} classes={classes.data} classeParDefaut={classeId} />
      )}
      {import_ && classes.data && <ImportEleves fermer={() => setImport(false)} classes={classes.data} classeParDefaut={classeId} />}
      {aDecider && (
        <FenetreDecision
          eleve={aDecider}
          fermer={() => setADecider(null)}
          fait={() => {
            setADecider(null);
            rafraichirSanctions();
          }}
        />
      )}
      {photos && classes.data && <PhotosEleves fermer={() => setPhotos(false)} classes={classes.data} classeParDefaut={classeId} />}
    </Page>
  );
}

function ImportEleves({ fermer, classes, classeParDefaut }: { fermer: () => void; classes: Classe[]; classeParDefaut: string }) {
  const client = useQueryClient();
  const [classeId, setClasseId] = useState(classeParDefaut || classes[0]?.id || '');
  const [fichier, setFichier] = useState<File | null>(null);
  const cle = useCleEnvoi();
  const envoi = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('classeId', classeId);
      fd.append('fichier', fichier!);
      return envoyer((entetes) => api<{ message: string }>('/eleves/import', { methode: 'POST', corps: fd, entetes }), cle.cle());
    },
    onSuccess: (r) => {
      toast.success(r.message);
      client.invalidateQueries({ queryKey: ['eleves'] });
      client.invalidateQueries({ queryKey: ['classes'] });
      fermer();
    },
  });
  return (
    <Modale
      titre="Importer des élèves"
      ouverte
      fermer={fermer}
      pied={
        <>
          <button type="button" className="bouton-secondaire" onClick={fermer}>
            Annuler
          </button>
          <button type="button" className="bouton-primaire" disabled={!fichier || !classeId || envoi.isPending} onClick={() => envoi.mutate()}>
            {envoi.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Importer
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-encre-2">
          Un fichier Excel (.xlsx) ou CSV, une ligne par élève, dans l'ordre des colonnes du modèle. Si une seule ligne est invalide,
          rien n'est importé et les erreurs sont listées.
        </p>
        <button
          type="button"
          className="bouton-secondaire"
          onClick={() => telecharger('/eleves/modele-import').catch((e) => toast.error(e.message))}
        >
          <Download className="h-4 w-4" /> Télécharger le modèle
        </button>
        {envoi.error ? <Erreur erreur={envoi.error} /> : null}
        <Champ libelle="Classe d'inscription">
          <select className="champ" value={classeId} onChange={(e) => setClasseId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Fichier">
          <input
            className="champ file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-sm file:font-semibold"
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
          />
        </Champ>
      </div>
    </Modale>
  );
}
