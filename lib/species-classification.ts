import { SPECIES_CATALOG } from "@/lib/species-catalog.generated";

export type SpeciesClassification = {
  orderName: string;
  familyName: string;
  scientificName: string;
};

const EMPTY_CLASSIFICATION: SpeciesClassification = {
  orderName: "",
  familyName: "",
  scientificName: ""
};

function normalizeSpeciesName(value: string) {
  // Unicode正規化(NFC)で、濁点が分解されたNFD形の種名もカタログと一致させる。
  return value.normalize("NFC").trim().replace(/\s+/g, "");
}

const NORMALIZED_CATALOG = new Map<string, SpeciesClassification>(
  Object.entries(SPECIES_CATALOG).map(([species, classification]) => [normalizeSpeciesName(species), classification])
);

export function lookupSpeciesClassification(speciesName: string): SpeciesClassification {
  if (!speciesName.trim()) {
    return EMPTY_CLASSIFICATION;
  }

  return NORMALIZED_CATALOG.get(normalizeSpeciesName(speciesName)) ?? EMPTY_CLASSIFICATION;
}
