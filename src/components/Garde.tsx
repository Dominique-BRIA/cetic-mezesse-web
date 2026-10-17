'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../lib/contexte';
import type { Role } from '../lib/types';

export const P: Role = 'PROVISEUR';
export const SG: Role = 'SURVEILLANT_GENERAL';
export const PR: Role = 'PROFESSEUR';

/** Page réservée à certains rôles : les autres sont renvoyés au tableau de bord. */
export function Garde({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { a } = useApp();
  const routeur = useRouter();
  const autorise = a(...roles);
  useEffect(() => {
    if (!autorise) routeur.replace('/');
  }, [autorise, routeur]);
  return autorise ? <>{children}</> : null;
}
