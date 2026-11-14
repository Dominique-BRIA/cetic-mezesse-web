import { redirect } from 'next/navigation';

// Les justifications se font maintenant sur la page Absences, affichage « Par élève » : les anciens liens y mènent.
export default function Page() {
  redirect('/absences?vue=eleve&etat=NON_JUSTIFIEE');
}
