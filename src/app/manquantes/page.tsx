'use client';

import Ecran from '@/ecrans/prof/Manquantes';
import { Garde, PR } from '@/components/Garde';

export default function Page() {
  return (
    <Garde roles={[PR]}>
      <Ecran />
    </Garde>
  );
}
