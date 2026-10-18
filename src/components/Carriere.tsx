'use client';

import type { Utilisateur } from '../lib/types';
import { Champ } from './ui';

/** Carrière d'un personnel, telle qu'imprimée sur l'attestation de présence effective au poste. */
export interface Carriere {
  sexe: '' | 'M' | 'F';
  matricule: string;
  grade: string;
  fonction: string;
  datePriseService: string;
  dateEntreeFonctionPublique: string;
  acteNomination: string;
}

export function carriereDe(u: Partial<Utilisateur> | null | undefined): Carriere {
  return {
    sexe: u?.sexe ?? '',
    matricule: u?.matricule ?? '',
    grade: u?.grade ?? '',
    fonction: u?.fonction ?? (u?.discipline ? `Professeur de ${u.discipline.toLowerCase()}` : ''),
    datePriseService: u?.datePriseService?.slice(0, 10) ?? '',
    dateEntreeFonctionPublique: u?.dateEntreeFonctionPublique?.slice(0, 10) ?? '',
    acteNomination: u?.acteNomination ?? '',
  };
}

/** Corps envoyé à l'API : champs vides ramenés à null. */
export function corpsCarriere(c: Carriere) {
  const v = (s: string) => (s.trim() ? s.trim() : null);
  return {
    sexe: c.sexe || null,
    matricule: v(c.matricule),
    grade: v(c.grade),
    fonction: v(c.fonction),
    datePriseService: v(c.datePriseService),
    dateEntreeFonctionPublique: v(c.dateEntreeFonctionPublique),
    acteNomination: v(c.acteNomination),
  };
}

/** Ce qui manque pour délivrer une attestation. */
export function manquants(c: Carriere): string[] {
  return [
    !c.matricule.trim() && 'matricule',
    !c.grade.trim() && 'grade',
    !c.fonction.trim() && 'fonction',
    !c.datePriseService && 'date de prise de service',
  ].filter(Boolean) as string[];
}

const GRADES = ['PLEG', 'PCEG', 'PLET', 'PCET', 'PEPS', 'IEG', 'IET', 'CE', 'Vacataire'];

export function ChampsCarriere({ valeur, changer }: { valeur: Carriere; changer: (c: Carriere) => void }) {
  const maj = (cle: keyof Carriere, v: string) => changer({ ...valeur, [cle]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Champ libelle="Civilité">
        <select className="champ" value={valeur.sexe} onChange={(e) => maj('sexe', e.target.value)}>
          <option value="">—</option>
          <option value="M">M.</option>
          <option value="F">Mme</option>
        </select>
      </Champ>
      <Champ libelle="Matricule (fonction publique)">
        <input className="champ uppercase" value={valeur.matricule} onChange={(e) => maj('matricule', e.target.value)} maxLength={30} placeholder="1034573P" />
      </Champ>
      <Champ libelle="Grade / corps">
        <input className="champ" list="grades" value={valeur.grade} onChange={(e) => maj('grade', e.target.value)} maxLength={40} placeholder="PCEG, PLET…" />
        <datalist id="grades">
          {GRADES.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </Champ>
      <Champ libelle="Fonction / spécialité">
        <input className="champ" value={valeur.fonction} onChange={(e) => maj('fonction', e.target.value)} maxLength={120} placeholder="Professeur de mathématiques" />
      </Champ>
      <Champ libelle="Prise de service au CETIC">
        <input className="champ" type="date" value={valeur.datePriseService} onChange={(e) => maj('datePriseService', e.target.value)} />
      </Champ>
      <Champ libelle="Entrée dans la fonction publique">
        <input className="champ" type="date" value={valeur.dateEntreeFonctionPublique} onChange={(e) => maj('dateEntreeFonctionPublique', e.target.value)} />
      </Champ>
      <Champ libelle="Acte de nomination / affectation" className="sm:col-span-2" aide="Facultatif. Imprimé sur l'attestation s'il est renseigné.">
        <input
          className="champ"
          value={valeur.acteNomination}
          onChange={(e) => maj('acteNomination', e.target.value)}
          maxLength={200}
          placeholder="Décision n° 0123/MINESEC/SG/DRH du 12/08/2020"
        />
      </Champ>
    </div>
  );
}
