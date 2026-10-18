'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Fine barre en haut de l'écran, lancée dès le clic sur un lien interne et retirée quand la nouvelle
 * page est affichée : l'utilisateur voit tout de suite que son clic est pris en compte.
 */
export function BarreNavigation() {
  const chemin = usePathname();
  const [cible, setCible] = useState<string | null>(null);

  useEffect(() => {
    const surClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      setCible(url.pathname);
    };
    document.addEventListener('click', surClic, true);
    return () => document.removeEventListener('click', surClic, true);
  }, []);

  // Page affichée : la barre disparaît.
  useEffect(() => setCible(null), [chemin]);

  // Sécurité : jamais de barre bloquée si la navigation est abandonnée.
  useEffect(() => {
    if (!cible) return;
    const minuteur = setTimeout(() => setCible(null), 20_000);
    return () => clearTimeout(minuteur);
  }, [cible]);

  if (!cible) return null;
  return (
    <div className="barre-navigation" role="progressbar" aria-label="Ouverture de la page">
      <div key={cible} />
    </div>
  );
}
