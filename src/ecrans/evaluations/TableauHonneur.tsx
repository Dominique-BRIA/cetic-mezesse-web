import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award, FileText } from 'lucide-react';
import { telecharger } from '../../lib/api';
import { requetes } from '../../lib/requetes';
import { useApp } from '../../lib/contexte';
import { libellePeriode, note, rang } from '../../lib/format';
import type { CodePeriode } from '../../lib/types';
import { Carte, Chargement, Champ, ChoixPeriode, Erreur, Page, Vide } from '../../components/ui';

// Tableau d'honneur : élèves dont la moyenne de la période atteint le seuil réglé dans les Paramètres.
export default function TableauHonneur() {
  const { annee } = useApp();
  const [periode, setPeriode] = useState<CodePeriode>('T1');
  const [classeId, setClasseId] = useState('');
  const classes = useQuery(requetes.classes(annee?.id));
  const filtre = `periode=${periode}${classeId ? `&classeId=${classeId}` : ''}`;
  const q = useQuery(requetes.tableauHonneur(annee?.id, periode, classeId));
  const imprimer = (format: 'liste' | 'certificats') =>
    telecharger(`/tableau-honneur/pdf?${filtre}&format=${format}`, { ouvrir: true }).catch((e: Error) => toast.error(e.message));
  const vide = !q.data?.total;

  return (
    <Page
      titre="Tableau d'honneur"
      description={
        q.data ? (
          <>
            Élèves ayant au moins <b>{note(q.data.seuil)}</b> de moyenne. La moyenne minimale se règle dans les Paramètres.
          </>
        ) : undefined
      }
      actions={
        <>
          <button type="button" className="bouton-secondaire" disabled={vide} onClick={() => imprimer('liste')}>
            <FileText className="h-4 w-4" /> Liste PDF
          </button>
          <button type="button" className="bouton-primaire" disabled={vide} onClick={() => imprimer('certificats')}>
            <Award className="h-4 w-4" /> Certificats
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <Champ libelle="Période">
          <ChoixPeriode valeur={periode} changer={setPeriode} />
        </Champ>
        <Champ libelle="Classe">
          <select className="champ w-auto min-w-[14rem]" value={classeId} onChange={(e) => setClasseId(e.target.value)}>
            <option value="">Toutes les classes</option>
            {(classes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </Champ>
        {q.data && (
          <p className="mb-2 text-sm text-encre-2">
            {q.data.total} élève(s) au tableau d'honneur · {libellePeriode(periode)} · {q.data.annee}
          </p>
        )}
      </div>

      {q.isLoading ? (
        <Chargement />
      ) : q.error ? (
        <Erreur erreur={q.error} />
      ) : vide ? (
        <Carte>
          <Vide titre="Aucun élève au tableau d'honneur">Aucune moyenne n'atteint {note(q.data?.seuil)} pour cette période.</Vide>
        </Carte>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {q.data!.classes
            .filter((c) => c.eleves.length)
            .map((c) => (
              <Carte key={c.id} sansMarge titre={`${c.nom} · ${c.eleves.length} sur ${c.effectif}`}>
                <div className="overflow-x-auto">
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th className="w-16">Rang</th>
                        <th>Élève</th>
                        <th className="w-12">Sexe</th>
                        <th className="w-20 text-right">Moyenne</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.eleves.map((e) => (
                        <tr key={e.inscriptionId}>
                          <td className="tabular-nums">{rang(e.rang)}</td>
                          <td>
                            <Link href={`/eleves/${e.eleveId}`} className="lien font-medium">
                              {e.nom} {e.prenoms}
                            </Link>
                            <div className="text-xs text-encre-2 tabular-nums">{e.matricule}</div>
                          </td>
                          <td>{e.sexe}</td>
                          <td className="text-right font-semibold tabular-nums">{note(e.moyenne)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Carte>
            ))}
        </div>
      )}
    </Page>
  );
}
