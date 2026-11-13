'use client';

import Ecran from '@/ecrans/organisation/AVerifier';
import { Garde, P, SG } from '@/components/Garde';

export default function Page() {
  return (
    <Garde roles={[P, SG]}>
      <Ecran />
    </Garde>
  );
}
