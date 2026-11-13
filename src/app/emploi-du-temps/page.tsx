'use client';

import Ecran from '@/ecrans/organisation/EmploiDuTemps';
import { Garde, P, SG } from '@/components/Garde';

export default function Page() {
  return (
    <Garde roles={[P, SG]}>
      <Ecran />
    </Garde>
  );
}
