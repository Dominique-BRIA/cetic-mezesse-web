'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing, Loader2, X } from 'lucide-react';
import { abonner, activer, aProposer, plusTard, pushPossible, surNotificationRecue } from '../lib/push';

/**
 * Une fois connecté : rafraîchit le jeton de ce navigateur si les notifications sont déjà acceptées,
 * sinon propose de les activer (un clic est nécessaire : le navigateur refuse de demander tout seul).
 */
export function ProposerNotifications() {
  const client = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!pushPossible()) return;
    if (Notification.permission === 'granted') void abonner();
    else setVisible(aProposer());
    return surNotificationRecue(() => client.invalidateQueries({ queryKey: ['notifications'] }));
  }, [client]);

  if (!visible) return null;
  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="fixed bottom-4 left-4 right-4 z-40 rounded-lg border border-bord bg-surface p-4 shadow-feuille sm:left-auto sm:w-96 lg:bottom-6 lg:right-6"
    >
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primaire" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Recevoir les notifications sur cet appareil ?</p>
          <p className="mt-0.5 text-sm text-encre-2">Ouverture de la saisie des notes, décisions et rappels : vous êtes prévenu même site fermé.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="bouton-primaire"
              disabled={envoi}
              onClick={async () => {
                setEnvoi(true);
                await activer();
                setEnvoi(false);
                setVisible(false);
              }}
            >
              {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
              Activer
            </button>
            <button
              type="button"
              className="bouton-secondaire"
              onClick={() => {
                plusTard();
                setVisible(false);
              }}
            >
              Plus tard
            </button>
          </div>
        </div>
        <button
          type="button"
          className="bouton-discret -mr-2 -mt-1"
          aria-label="Fermer"
          onClick={() => {
            plusTard();
            setVisible(false);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
