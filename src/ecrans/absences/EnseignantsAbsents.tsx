import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { api, telecharger } from '../../lib/api';
import { useApp } from '../../lib/contexte';
import { useParametresUrl } from '../../lib/navigation';
import { requetes } from '../../lib/requetes';
import { duree } from '../../lib/format';
import { Carte, Chargement, Champ, Erreur, Page, Vide } from '../../components/ui';
import { aujourdhui } from './Appel';

interface Total {
  id: string | null;
  nom: string;
  prenom: string;
  seances: number;
  minutes: number;
}

interface SeanceNonAssuree {
  seanceId: string;
  date: string;
  classeId: string;
  classe: string;
  matiere: string;
  debut: string;
  fin: string;
  duree: number;
  motif: string | null;
  enseignantId: string | null;
  enseignant: string | null;
}

const dateCourte = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Séances non assurées (enseignant absent, marqué sur la feuille d'appel) : totaux par enseignant et détail. */
export default function EnseignantsAbsents() {
  const { annee } = useApp();
  const [params, setParams] = useParametresUrl();
  const du = params.get('du') ?? '';
  const au = params.get('au') ?? '';
  const ens = params.get('enseignant') ?? '';
  const aller = (c: Record<string, string>) => {
    const n = { du, au, enseignant: ens, ...c };
    setParams(Object.fromEntries(Object.entries(n).filter(([, v]) => v)));
  };
  const chemin = `/absences/enseignants?${new URLSearchParams(Object.entries({ du, au, enseignantId: ens }).filter(([, v]) => v)).toString()}`;
  const q = useQuery({ queryKey: ['absences-enseignants', annee?.id, chemin], queryFn: () => api<{ totaux: Total[]; seances: SeanceNonAssuree[] }>(chemin) });
  const d = q.data;
  // Mêmes filtres que la page : PDF ouvert dans un onglet (à imprimer), classeur Excel téléchargé.
  const exporter = (format: 'xlsx' | 'pdf') =>
    telecharger(chemin.replace('/absences/enseignants?', '/absences/enseignants/export?') + `${chemin.endsWith('?') ? '' : '&'}format=${format}`, {
      ouvrir: format === 'pdf',
    }).catch((e) => toast.error(e.message));
  // Avec un enseignant choisi, seulement son total.
  const totaux = (d?.totaux ?? []).filter((t) => !ens || t.id === ens);
  const total = totaux.reduce((n, t) => n + t.minutes, 0);
  // Tous les enseignants, pour le filtre (pas seulement ceux qui ont des séances non assurées).
  const enseignants = useQuery(requetes.enseignants(annee?.id));
  const tries = [...(enseignants.data ?? [])].sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
  const choisi = (enseignants.data ?? []).find((t) => t.id === ens);

  return (
    <Page
      titre="Enseignants absents"
      description="Les séances non assurées parce que l'enseignant prévu était absent, marquées par le SG sur la feuille d'appel. Une séance confiée à un remplaçant ou annulée n'y figure pas."
      actions={
        <>
          <button type="button" className="bouton-secondaire" onClick={() => exporter('xlsx')} disabled={!d?.seances.length}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
          <button type="button" className="bouton-secondaire" onClick={() => exporter('pdf')} disabled={!d?.seances.length}>
            <FileText className="h-4 w-4" /> PDF
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <Champ libelle="Du">
          <input type="date" className="champ" value={du} max={au || aujourdhui()} onChange={(e) => aller({ du: e.target.value })} />
        </Champ>
        <Champ libelle="Au">
          <input type="date" className="champ" value={au} min={du || undefined} max={aujourdhui()} onChange={(e) => aller({ au: e.target.value })} />
        </Champ>
        <Champ libelle="Enseignant" className="w-full max-w-xs">
          <select className="champ" value={ens} onChange={(e) => aller({ enseignant: e.target.value })}>
            <option value="">Tous les enseignants</option>
            {tries.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom} {t.prenom}
              </option>
            ))}
          </select>
        </Champ>
      </div>

      {q.isLoading ? (
        <Chargement />
      ) : q.error ? (
        <Erreur erreur={q.error} />
      ) : !d ? null : totaux.length === 0 ? (
        <Carte>
          <Vide titre="Aucune séance non assurée">
            {choisi
              ? `${choisi.prenom} ${choisi.nom} n'a été marqué absent sur aucune feuille d'appel de cette période.`
              : "Aucun enseignant n'a été marqué absent sur les feuilles d'appel de cette période."}
          </Vide>
        </Carte>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <Carte titre={`Par enseignant · ${duree(total)} au total`} sansMarge>
            <ul className="divide-y divide-bord">
              {totaux.map((t) => (
                <li key={t.id ?? 'aucun'} className="flex items-baseline gap-2 px-4 py-2.5 text-sm">
                  <span className="flex-1">
                    <span className="font-medium">{t.nom}</span> <span className="text-encre-2">{t.prenom}</span>
                  </span>
                  <span className="text-xs text-encre-2">
                    {t.seances} séance{t.seances > 1 ? 's' : ''}
                  </span>
                  <span className="w-16 whitespace-nowrap text-right font-semibold tabular-nums text-danger">{duree(t.minutes)}</span>
                </li>
              ))}
            </ul>
          </Carte>
          <Carte titre={choisi ? `Séances non assurées de ${choisi.prenom} ${choisi.nom}` : 'Toutes les séances non assurées'} sansMarge>
            <div className="overflow-x-auto">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Classe</th>
                    <th>Matière</th>
                    <th>Horaire</th>
                    <th className="text-right">Durée</th>
                    {!choisi && <th>Enseignant</th>}
                    <th>Motif</th>
                  </tr>
                </thead>
                <tbody>
                  {d.seances.map((s) => (
                    <tr key={s.seanceId}>
                      <td className="whitespace-nowrap">
                        <Link className="hover:underline" href={`/appel?classe=${s.classeId}&date=${s.date}`}>
                          {dateCourte(s.date)}
                        </Link>
                      </td>
                      <td>{s.classe}</td>
                      <td>{s.matiere}</td>
                      <td className="whitespace-nowrap tabular-nums">
                        {s.debut} – {s.fin}
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">{duree(s.duree)}</td>
                      {!choisi && <td>{s.enseignant ?? '—'}</td>}
                      <td className="text-encre-2">{s.motif ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Carte>
        </div>
      )}
    </Page>
  );
}
