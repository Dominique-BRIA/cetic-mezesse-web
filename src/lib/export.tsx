import { toast } from 'sonner';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { telecharger } from './api';

/** Colonne d'un tableau exporté : largeur relative (1 par défaut), alignement, texte en gras. */
export interface ColonneExport {
  titre: string;
  largeur?: number;
  align?: 'droite' | 'centre';
  gras?: boolean;
}

type Valeur = string | number | null | undefined;

/** Une ligne de cellules (« gras » pour un total), ou un intertitre (une classe, un niveau…). */
export type LigneExport = { c: Valeur[]; gras?: boolean } | { groupe: string };

export interface TableauExport {
  titre: string;
  /** Filtres appliqués, période, effectif… : sous le titre. */
  sousTitre?: string;
  colonnes: ColonneExport[];
  lignes: LigneExport[];
  /** Paysage : d'office au-delà de huit colonnes. */
  paysage?: boolean;
  /** Qualité du signataire, sous le tableau du PDF (« Le Surveillant Général »). */
  signature?: string;
  /** Nom du fichier, sans extension (par défaut : le titre). */
  fichier?: string;
}

export type FormatExport = 'pdf' | 'xlsx';

/**
 * Le tableau tel que la page le montre (filtres et tri compris) : PDF officiel ouvert dans un onglet, ou
 * classeur Excel téléchargé.
 */
export function exporterTableau(format: FormatExport, t: TableauExport) {
  const lignes = t.lignes.map((l) => ('groupe' in l ? l : { ...l, c: l.c.map((v) => (v === null || v === undefined ? '' : String(v))) }));
  return telecharger('/documents/tableau', { methode: 'POST', corps: { ...t, lignes, format }, ouvrir: format === 'pdf' }).catch((e) =>
    toast.error(e.message),
  );
}

/** Les deux boutons Excel et PDF des pages. */
export function BoutonsExport({ exporter, desactive }: { exporter: (format: FormatExport) => void; desactive?: boolean }) {
  return (
    <>
      <button type="button" className="bouton-secondaire" onClick={() => exporter('xlsx')} disabled={desactive}>
        <FileSpreadsheet className="h-4 w-4" /> Excel
      </button>
      <button type="button" className="bouton-secondaire" onClick={() => exporter('pdf')} disabled={desactive}>
        <FileText className="h-4 w-4" /> PDF
      </button>
    </>
  );
}

/** « Classe : 2e année Électricité · Recherche : « abe » » : les filtres non vides, pour le sous-titre. */
export function filtres(...f: [string, string | null | undefined | false][]): string {
  return f
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} : ${v}`)
    .join(' · ');
}
