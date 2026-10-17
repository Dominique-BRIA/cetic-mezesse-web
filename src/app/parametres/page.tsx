'use client';

import Ecran from '@/ecrans/admin/Parametres';
import { Garde, SG } from '@/components/Garde';

export default function Page() {
  return (
    <Garde roles={[SG]}>
      <Ecran />
    </Garde>
  );
}
