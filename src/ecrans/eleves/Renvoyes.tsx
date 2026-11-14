import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { requetes } from '../../lib/requetes';
import { useApp } from '../../lib/contexte';
import { date } from '../../lib/format';
import type { Inscription } from '../../lib/types';
import { Carte, Chargement, Erreur, Page, Vide } from '../../components/ui';
import { Reintegration } from './FicheEleve';
import { BoutonsExport, exporterTableau, type FormatExport } from '../../lib/export';

export default function Renvoyes() {
  const { a, annee } = useApp();
  const q = useQuery(requetes.renvoyes(annee?.id));
  const [choix, setChoix] = useState<Inscription | null>(null);
  const exporter = (format: FormatExport) =>
    exporterTableau(format, {
      titre: 'Élèves renvoyés',
      sousTitre: `Année scolaire ${annee?.libelle ?? ''} · ${q.data?.length ?? 0} élève(s)`,
      colonnes: [
        { titre: 'Élève', largeur: 2.2, gras: true },
        { titre: 'Matricule', largeur: 1 },
        { titre: 'Classe', largeur: 1.5 },
        { titre: 'Renvoyé le', largeur: 0.9 },
        { titre: 'Motif', largeur: 2.6 },
        { titre: 'Décidé par', largeur: 1.4 },
      ],
      lignes: (q.data ?? []).map((i) => {
        const r = i.renvois[0];
        return { c: [`${i.eleve.nom} ${i.eleve.prenoms}`, i.eleve.matricule, i.classe.nom, date(r?.date), r?.motif, r ? `${r.par.prenom} ${r.par.nom}` : ''] };
      }),
      signature: 'Le Directeur',
    });

  return (
    <Page
      titre="Élèves renvoyés"
      description={`Élèves retirés de la liste principale en ${annee?.libelle ?? ''}. Seul le Directeur peut les réintégrer.`}
      actions={<BoutonsExport exporter={exporter} desactive={!q.data?.length} />}
    >
      <Carte sansMarge>
        {q.isLoading ? (
          <div className="px-4">
            <Chargement />
          </div>
        ) : q.error ? (
          <div className="p-4">
            <Erreur erreur={q.error} />
          </div>
        ) : !q.data?.length ? (
          <Vide titre="Aucun élève renvoyé cette année" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Élève</th>
                  <th>Classe</th>
                  <th>Renvoyé le</th>
                  <th>Motif</th>
                  <th className="hidden md:table-cell">Décidé par</th>
                  {a('PROVISEUR') && <th />}
                </tr>
              </thead>
              <tbody>
                {q.data.map((i) => {
                  const r = i.renvois[0];
                  return (
                    <tr key={i.id}>
                      <td>
                        <Link className="lien" href={`/eleves/${i.eleve.id}`}>
                          {i.eleve.nom} {i.eleve.prenoms}
                        </Link>
                        <div className="text-xs tabular-nums text-encre-3">{i.eleve.matricule}</div>
                      </td>
                      <td>{i.classe.nom}</td>
                      <td className="tabular-nums">{date(r?.date)}</td>
                      <td className="max-w-xs text-encre-2">{r?.motif}</td>
                      <td className="hidden text-encre-2 md:table-cell">{r ? `${r.par.prenom} ${r.par.nom}` : '—'}</td>
                      {a('PROVISEUR') && (
                        <td className="text-right">
                          <button type="button" className="bouton-secondaire py-1.5" onClick={() => setChoix(i)}>
                            Réintégrer
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
      {choix && <Reintegration inscriptionId={choix.id} nom={`${choix.eleve.nom} ${choix.eleve.prenoms}`} fermer={() => setChoix(null)} />}
    </Page>
  );
}
