import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Attestation, Bareme, Classe, CodePeriode, Enseignant, Etablissement, Groupe, Inscription, Matiere, TableauHonneur } from './types';

// Requêtes partagées entre les pages et le préchargement du menu : même clé et même adresse,
// pour que les données préchargées au survol d'un lien soient celles que la page affiche.

const lire = <T>(cle: readonly unknown[], chemin: string, annee = true) =>
  queryOptions({ queryKey: cle, queryFn: () => api<T>(chemin, { annee }) });

export const requetes = {
  avancement: <T = unknown>(anneeId?: string) => lire<T>(['avancement', anneeId], '/notes/avancement'),
  classes: (anneeId?: string) => lire<Classe[]>(['classes', anneeId], '/classes'),
  eleves: (anneeId: string | undefined, classeId: string, recherche = '') =>
    lire<Inscription[]>(['eleves', anneeId, classeId, recherche], `/eleves?classeId=${classeId}&q=${encodeURIComponent(recherche)}`),
  renvoyes: (anneeId?: string) => lire<Inscription[]>(['eleves', anneeId, 'renvoyes'], '/eleves?statut=RENVOYE'),
  enseignants: (anneeId?: string) => lire<Enseignant[]>(['enseignants', anneeId], '/utilisateurs?role=PROFESSEUR'),
  groupes: (anneeId?: string) => lire<Groupe[]>(['groupes', anneeId], '/groupes'),
  mesMatieres: (anneeId?: string) => lire<Matiere[]>(['matieres', 'miennes', anneeId], '/matieres'),
  statsEtablissement: <T = unknown>(anneeId: string | undefined, periode: CodePeriode) =>
    lire<T>(['stats-etab', anneeId, periode], `/statistiques/etablissement?periode=${periode}`),
  tableauHonneur: (anneeId: string | undefined, periode: CodePeriode, classeId: string) =>
    lire<TableauHonneur>(
      ['tableau-honneur', anneeId, periode, classeId],
      `/tableau-honneur?periode=${periode}${classeId ? `&classeId=${classeId}` : ''}`,
    ),
  attestations: () => lire<Attestation[]>(['attestations'], '/attestations', false),
  etablissement: () => lire<Etablissement | null>(['etablissement'], '/etablissement', false),
  baremes: () => lire<Bareme[]>(['baremes'], '/baremes', false),
};

/**
 * Données à charger dès que la souris passe sur un lien du menu (ou que le doigt le touche),
 * avec les filtres par défaut de chaque page. Une donnée encore fraîche n'est pas redemandée.
 */
const PRECHARGEMENTS: Record<string, (client: QueryClient, anneeId?: string) => Promise<unknown>> = {
  '/': (c, a) => c.prefetchQuery(requetes.avancement(a)),
  '/eleves': async (c, a) => {
    const classes = await c.ensureQueryData(requetes.classes(a));
    if (classes[0]) await c.prefetchQuery(requetes.eleves(a, classes[0].id));
  },
  '/renvoyes': (c, a) => c.prefetchQuery(requetes.renvoyes(a)),
  '/cartes': (c, a) => c.prefetchQuery(requetes.classes(a)),
  '/classes': (c, a) => c.prefetchQuery(requetes.classes(a)),
  '/groupes': (c, a) => c.prefetchQuery(requetes.groupes(a)),
  '/matieres': (c, a) => c.prefetchQuery(requetes.classes(a)),
  '/enseignants': (c, a) => c.prefetchQuery(requetes.enseignants(a)),
  '/notes': (c, a) => c.prefetchQuery(requetes.classes(a)),
  '/bulletins': (c, a) => c.prefetchQuery(requetes.classes(a)),
  '/statistiques': (c, a) => c.prefetchQuery(requetes.statsEtablissement(a, 'S1')),
  '/classement': (c, a) => c.prefetchQuery(requetes.statsEtablissement(a, 'S1')),
  '/tableau-honneur': (c, a) =>
    Promise.all([c.prefetchQuery(requetes.classes(a)), c.prefetchQuery(requetes.tableauHonneur(a, 'T1', ''))]),
  '/attestations': (c) => c.prefetchQuery(requetes.attestations()),
  '/parametres': (c) => Promise.all([c.prefetchQuery(requetes.etablissement()), c.prefetchQuery(requetes.baremes())]),
  '/saisie': (c, a) => c.prefetchQuery(requetes.mesMatieres(a)),
  '/statistiques-matieres': (c, a) => c.prefetchQuery(requetes.mesMatieres(a)),
};

export function precharger(client: QueryClient, vers: string, anneeId?: string) {
  // Un échec ici n'a pas d'effet visible : la page refera la requête et affichera l'erreur.
  PRECHARGEMENTS[vers]?.(client, anneeId).catch(() => {});
}
