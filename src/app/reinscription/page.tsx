'use client';

import Ecran from '@/ecrans/eleves/Reinscription';
import { Garde, SG } from '@/components/Garde';

export default function Page() {
  return (
    <Garde roles={[SG]}>
      <Ecran />
    </Garde>
  );
}
