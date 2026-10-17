'use client';

import Ecran from '@/ecrans/prof/Saisie';
import { Garde, PR } from '@/components/Garde';

export default function Page() {
  return (
    <Garde roles={[PR]}>
      <Ecran />
    </Garde>
  );
}
