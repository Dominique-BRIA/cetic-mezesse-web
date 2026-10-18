import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Loader2, Plus, Printer } from 'lucide-react';
import { api, telecharger } from '../../lib/api';
import { date } from '../../lib/format';
import type { Attestation, Enseignant } from '../../lib/types';
import { Carte, Chargement, Champ, Erreur, Modale, Page, Vide } from '../../components/ui';
import { type Carriere, carriereDe, ChampsCarriere, corpsCarriere, manquants } from '../../components/Carriere';

const imprimer = (a: Attestation) => telecharger(`/attestations/${a.id}/pdf`, { ouvrir: true }).catch((e: Error) => toast.error(e.message));

// Attestations de présence effective au poste : le Proviseur les délivre et en garde le registre.
export default function Attestations() {
  const [nouvelle, setNouvelle] = useState(false);
  const q = useQuery({ queryKey: ['attestations'], queryFn: () => api<Attestation[]>('/attestations', { annee: false }) });

  return (
    <Page
      titre="Attestations de présence"
      description="Attestations de présence effective au poste délivrées aux personnels. Chacune reçoit un numéro dans l'année scolaire et reste au registre."
      actions={
        <button type="button" className="bouton-primaire" onClick={() => setNouvelle(true)}>
          <Plus className="h-4 w-4" /> Nouvelle attestation
        </button>
      }
    >
      <Carte sansMarge titre={q.data ? `Registre · ${q.data.length} attestation(s)` : 'Registre'}>
        {q.isLoading ? (
          <div className="px-4">
            <Chargement />
          </div>
        ) : q.error ? (
          <div className="p-4">
            <Erreur erreur={q.error} />
          </div>
        ) : !q.data?.length ? (
          <Vide titre="Aucune attestation délivrée">Cliquez sur « Nouvelle attestation » pour en délivrer une.</Vide>
        ) : (
          <div className="overflow-x-auto">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Bénéficiaire</th>
                  <th className="hidden md:table-cell">Grade · fonction</th>
                  <th>Délivrée le</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {q.data.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap font-medium tabular-nums">{a.reference}</td>
                    <td>
                      <div className="font-medium">{a.beneficiaire}</div>
                      <div className="text-xs text-encre-2 tabular-nums">Matricule {a.matricule}</div>
                    </td>
                    <td className="hidden text-sm text-encre-2 md:table-cell">
                      {a.grade} · {a.fonction}
                    </td>
                    <td className="whitespace-nowrap tabular-nums">{date(a.delivreeLe)}</td>
                    <td className="text-right">
                      <button type="button" className="bouton-discret" onClick={() => imprimer(a)} title="Imprimer l'attestation">
                        <Printer className="h-4 w-4" /> <span className="hidden sm:inline">Imprimer</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
      {nouvelle && <NouvelleAttestation fermer={() => setNouvelle(false)} />}
    </Page>
  );
}

function NouvelleAttestation({ fermer }: { fermer: () => void }) {
  const client = useQueryClient();
  const personnels = useQuery({ queryKey: ['personnels'], queryFn: () => api<Enseignant[]>('/utilisateurs') });
  const liste = useMemo(() => (personnels.data ?? []).filter((u) => u.role !== 'PROVISEUR' && u.actif), [personnels.data]);
  const [id, setId] = useState('');
  const [carriere, setCarriere] = useState<Carriere>(carriereDe(null));
  const choisir = (v: string) => {
    setId(v);
    setCarriere(carriereDe(liste.find((u) => u.id === v)));
  };
  const reste = manquants(carriere);

  // La carrière complétée est enregistrée sur le compte, puis l'attestation est délivrée.
  const delivrer = useMutation({
    mutationFn: async () => {
      await api(`/utilisateurs/${id}/carriere`, { methode: 'PUT', corps: corpsCarriere(carriere), annee: false });
      return api<Attestation>('/attestations', { methode: 'POST', corps: { utilisateurId: id }, annee: false });
    },
    onSuccess: (a) => {
      client.invalidateQueries({ queryKey: ['attestations'] });
      client.invalidateQueries({ queryKey: ['personnels'] });
      client.invalidateQueries({ queryKey: ['enseignants'] });
      toast.success(`Attestation ${a.reference} délivrée à ${a.beneficiaire}.`, {
        action: { label: 'Imprimer', onClick: () => imprimer(a) },
        duration: 15_000,
      });
      fermer();
    },
  });

  return (
    <Modale
      titre="Nouvelle attestation de présence effective au poste"
      ouverte
      fermer={fermer}
      pied={
        <>
          <button type="button" className="bouton-secondaire" onClick={fermer}>
            Annuler
          </button>
          <button type="button" className="bouton-primaire" disabled={!id || reste.length > 0 || delivrer.isPending} onClick={() => delivrer.mutate()}>
            {delivrer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Délivrer l'attestation
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {delivrer.error ? <Erreur erreur={delivrer.error} /> : null}
        <Champ libelle="Personnel">
          <select className="champ" value={id} onChange={(e) => choisir(e.target.value)}>
            <option value="">{personnels.isLoading ? 'Chargement…' : 'Choisissez un personnel'}</option>
            {liste.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nom} {u.prenom}
                {u.role === 'SURVEILLANT_GENERAL' ? ' (Surveillant Général)' : u.discipline ? ` (${u.discipline})` : ''}
              </option>
            ))}
          </select>
        </Champ>
        {id && (
          <>
            <ChampsCarriere valeur={carriere} changer={setCarriere} />
            {reste.length > 0 ? (
              <p className="text-sm text-alerte">À compléter avant de délivrer : {reste.join(', ')}.</p>
            ) : (
              <p className="text-sm text-encre-2">
                Ces informations sont enregistrées sur le compte, puis imprimées sur l'attestation, qui reçoit le numéro suivant du registre.
              </p>
            )}
          </>
        )}
      </div>
    </Modale>
  );
}
