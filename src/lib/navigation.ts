'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Paramètres de l'adresse (?classe=…) et leur mise à jour, sans ajouter d'entrée à l'historique :
 * le filtre choisi survit au rechargement de la page et peut être partagé par lien.
 */
export function useParametresUrl(): [URLSearchParams, (valeurs: Record<string, string> | URLSearchParams) => void] {
  const params = useSearchParams();
  const routeur = useRouter();
  const chemin = usePathname();
  const definir = (valeurs: Record<string, string> | URLSearchParams) => {
    const q = new URLSearchParams(valeurs).toString();
    routeur.replace(q ? `${chemin}?${q}` : chemin, { scroll: false });
  };
  return [new URLSearchParams(params.toString()), definir];
}
