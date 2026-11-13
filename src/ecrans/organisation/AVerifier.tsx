import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, GitMerge, RotateCcw } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/contexte';
import { Carte, Chargement, Erreur, Etat, Page, Vide } from '../../components/ui';
import { FusionModale, type TypeFusion } from '../../components/Fusion';

interface Point {
  cle: string;
  gravite: 'FORTE' | 'FAIBLE';
  titre: string;
  detail: string;
  action: { type: 'ouvrir' | 'fusionner-enseignants' | 'fusionner-eleves'; lien: string | null; a: string | null; b: string | null };
  ignore: boolean;
}

interface Rapport {
  categories: { code: string; titre: string; explication: string; points: Point[] }[];
  total: number;
  ignores: number;
}

/** Ce qui mérite un coup d'œil de la direction : doublons probables, matières sans enseignant, fiches incomplètes. */
export default function AVerifier() {
  const { a, annee } = useApp();
  const client = useQueryClient();
  const [avecIgnores, setAvecIgnores] = useState(false);
  const [fusion, setFusion] = useState<{ type: TypeFusion; a: string; b: string } | null>(null);
  const q = useQuery({ queryKey: ['verifications', annee?.id, avecIgnores], queryFn: () => api<Rapport>(`/verifications?ignores=${avecIgnores}`) });
  const marquer = useMutation({
    mutationFn: (p: Point) =>
      p.ignore
        ? api(`/verifications/ignorees?cle=${encodeURIComponent(p.cle)}`, { methode: 'DELETE' })
        : api('/verifications/ignorees', { methode: 'POST', corps: { cle: p.cle, libelle: p.titre } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['verifications'] }),
    onError: (e) => toast.error(e.message),
  });
  const sg = a('SURVEILLANT_GENERAL');
  const r = q.data;

  return (
    <Page
      titre="À vérifier"
      description="Ce qui mérite un coup d'œil, sans rien bloquer. Corrigez depuis la page concernée, ou marquez « C'est normal » pour ne plus le voir."
      actions={
        r && r.ignores > 0 ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={avecIgnores} onChange={(e) => setAvecIgnores(e.target.checked)} />
            Afficher les {r.ignores} point(s) jugés normaux
          </label>
        ) : null
      }
    >
      {q.isLoading ? (
        <Chargement />
      ) : q.error ? (
        <Erreur erreur={q.error} />
      ) : !r?.categories.length ? (
        <Carte>
          <Vide titre="Rien à vérifier">Aucun doublon probable, aucune matière sans enseignant, aucune fiche incomplète.</Vide>
        </Carte>
      ) : (
        r.categories.map((c) => (
          <Carte key={c.code} sansMarge titre={`${c.titre} (${c.points.filter((p) => !p.ignore).length})`}>
            <p className="border-b border-bord px-4 py-2.5 text-sm text-encre-2">{c.explication}</p>
            <ul className="divide-y divide-bord">
              {c.points.map((p) => (
                <li key={p.cle} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${p.ignore ? 'opacity-60' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.titre}</span>
                      {p.ignore ? (
                        <Etat ton="neutre">Jugé normal</Etat>
                      ) : p.gravite === 'FORTE' ? (
                        <Etat ton="alerte">À traiter</Etat>
                      ) : (
                        <Etat ton="neutre">À confirmer</Etat>
                      )}
                    </div>
                    <div className="text-xs text-encre-2">{p.detail}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.action.type === 'ouvrir' && p.action.lien && (
                      <Link href={p.action.lien} className="bouton-secondaire">
                        Ouvrir
                      </Link>
                    )}
                    {((p.action.type === 'fusionner-enseignants' && sg) || p.action.type === 'fusionner-eleves') && p.action.a && p.action.b && (
                      <button
                        type="button"
                        className="bouton-secondaire"
                        onClick={() => setFusion({ type: p.action.type === 'fusionner-enseignants' ? 'enseignants' : 'eleves', a: p.action.a!, b: p.action.b! })}
                      >
                        <GitMerge className="h-4 w-4" /> Fusionner
                      </button>
                    )}
                    <button type="button" className="bouton-discret" disabled={marquer.isPending} onClick={() => marquer.mutate(p)}>
                      {p.ignore ? (
                        <>
                          <RotateCcw className="h-4 w-4" /> Signaler de nouveau
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" /> C'est normal
                        </>
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Carte>
        ))
      )}
      {fusion && <FusionModale type={fusion.type} a={fusion.a} b={fusion.b} fermer={() => setFusion(null)} />}
    </Page>
  );
}
