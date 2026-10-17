'use client';

import Ecran from '@/ecrans/admin/Decisions';
import { Garde, P } from '@/components/Garde';

export default function Page() {
  return (
    <Garde roles={[P]}>
      <Ecran />
    </Garde>
  );
}
