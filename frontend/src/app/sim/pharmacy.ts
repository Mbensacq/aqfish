import { isFilterMature } from './bacteria-starter';
import { catappaActive } from './catappa';
import type { AlertId, DashboardAlert } from './dashboard-alerts';
import type { WaterState } from './water';

/**
 * Pharmacie du bac (issue #533, ADR 0125) : les produits déjà proposés par les lots de soins
 * (#239, #361, #529 à #532), leur état dans le bac et le conseil qui répond à l'alerte la
 * plus grave. Fonctions pures, sans hasard ni horloge ; rien ici n'écrit dans le monde.
 *
 * - **état** : « en cours » tant que le produit agit dans l'eau (réserve, protection, délai
 *   entre deux doses, feuilles qui infusent), « terminé » une fois qu'il a agi dans ce bac
 *   depuis le chargement de la page (`usedProducts`, mémoire tenue hors du monde par l'hôte :
 *   rien n'est sauvegardé), « disponible » sinon ;
 * - **conseil** : celui de l'alerte en tête de `dashboardAlerts` (la plus grave, ordre fixe à
 *   gravité égale) ; un produit déjà en cours n'est pas reconseillé, la pharmacie dit de
 *   poursuivre ; une alerte sans produit (température, faim…) renvoie à son action.
 *
 * Aucun produit n'est créé ici : la liste ne fait que regrouper les gestes existants.
 */

/** Produits de la pharmacie, dans l'ordre affiché. */
export const PHARMACY_PRODUCTS = [
  'conditionneur',
  'amorce',
  'medicament',
  'sel',
  'charbon',
  'regulateur-ph',
  'catappa',
] as const;

/** Produit de la pharmacie. */
export type PharmacyProduct = (typeof PHARMACY_PRODUCTS)[number];

/** État d'un produit dans le bac. */
export type PharmacyStatus = 'disponible' | 'en-cours' | 'termine';

/** Libellé affiché de chaque état. */
export const PHARMACY_STATUS_LABELS: Readonly<Record<PharmacyStatus, string>> = {
  disponible: 'Disponible',
  'en-cours': 'En cours',
  termine: 'Terminé',
};

/** Description d'un produit : nom, usage en quelques mots, emplacement du geste. */
export interface PharmacyProductInfo {
  readonly label: string;
  readonly use: string;
  /** Où le verser dans l'interface (« Réglages, Eau »). */
  readonly where: string;
}

const WATER = 'Réglages, Eau';
const CARE = 'Réglages, Soins (animal malade)';

/** Produits : nom, usage, emplacement. */
export const PHARMACY_INFO: Readonly<Record<PharmacyProduct, PharmacyProductInfo>> = {
  conditionneur: { label: 'Conditionneur', use: 'neutralise le chlore', where: WATER },
  amorce: { label: 'Amorce de bactéries', use: 'fait mûrir le filtre', where: WATER },
  medicament: { label: 'Médicament', use: 'points blancs, velours et champignons', where: CARE },
  sel: { label: 'Sel', use: 'points blancs (5 g/L, 24 °C)', where: CARE },
  charbon: { label: 'Charbon actif', use: 'retire les produits de l’eau', where: WATER },
  'regulateur-ph': { label: 'Régulateur de pH', use: 'corrige le pH pas à pas', where: WATER },
  catappa: { label: 'Feuilles de catappa', use: 'acidifient l’eau doucement', where: WATER },
};

/** Ce que la pharmacie lit de l'eau du bac. */
export type PharmacyWater = Pick<
  WaterState,
  | 'filter'
  | 'bacteriaStarter'
  | 'ammoniaBinder'
  | 'salt'
  | 'medication'
  | 'carbon'
  | 'phRegulatorWait'
  | 'catappa'
>;

/** Vrai si `product` agit en ce moment dans `water`. */
export function productActive(product: PharmacyProduct, water: PharmacyWater): boolean {
  switch (product) {
    case 'conditionneur':
      return water.ammoniaBinder !== undefined;
    case 'amorce':
      return water.bacteriaStarter !== undefined;
    case 'medicament':
      return water.medication !== undefined;
    case 'sel':
      return (water.salt ?? 0) > 0;
    case 'charbon':
      return water.carbon === true;
    case 'regulateur-ph':
      return water.phRegulatorWait !== undefined;
    case 'catappa':
      return catappaActive(water.catappa);
  }
}

/** Produits qui agissent dans `water`, dans l'ordre de `PHARMACY_PRODUCTS`. */
export function activeProducts(water: PharmacyWater): readonly PharmacyProduct[] {
  return PHARMACY_PRODUCTS.filter((product) => productActive(product, water));
}

/**
 * Produits utilisés dans le bac : ceux de `used` et ceux de `active`, dans l'ordre de
 * `PHARMACY_PRODUCTS`. Renvoie `used` lui-même si rien n'est ajouté (aucune allocation au relevé).
 */
export function usedProducts(
  used: readonly PharmacyProduct[],
  active: readonly PharmacyProduct[],
): readonly PharmacyProduct[] {
  if (active.every((product) => used.includes(product))) {
    return used;
  }
  return PHARMACY_PRODUCTS.filter((product) => used.includes(product) || active.includes(product));
}

/** État d'un produit : en cours s'il agit, terminé s'il a servi, disponible sinon. */
export function productStatus(
  product: PharmacyProduct,
  active: readonly PharmacyProduct[],
  used: readonly PharmacyProduct[],
): PharmacyStatus {
  if (active.includes(product)) {
    return 'en-cours';
  }
  return used.includes(product) ? 'termine' : 'disponible';
}

/** Ce que la pharmacie sait du bac : produits qui agissent, produits déjà utilisés, filtre. */
export interface PharmacyState {
  readonly active: readonly PharmacyProduct[];
  readonly used: readonly PharmacyProduct[];
  /** Filtre à son efficacité maximale : l'amorce n'apporterait rien. */
  readonly filterMature: boolean;
}

/** Bac neuf sans produit (valeur initiale de l'interface). */
export const EMPTY_PHARMACY: PharmacyState = { active: [], used: [], filterMature: false };

/** État de la pharmacie pour `water`, d'après les produits déjà utilisés `used`. */
export function pharmacyState(
  water: PharmacyWater,
  used: readonly PharmacyProduct[],
): PharmacyState {
  const active = activeProducts(water);
  return { active, used: usedProducts(used, active), filterMature: isFilterMature(water) };
}

/** Vrai si `a` et `b` affichent la même pharmacie. */
export function samePharmacy(a: PharmacyState, b: PharmacyState): boolean {
  const sameList = (x: readonly PharmacyProduct[], y: readonly PharmacyProduct[]) =>
    x.length === y.length && x.every((product, n) => product === y[n]);
  return (
    a.filterMature === b.filterMature && sameList(a.active, b.active) && sameList(a.used, b.used)
  );
}

/** Conseil de la pharmacie pour une alerte. */
export interface PharmacyAdvice {
  /** Alerte à laquelle il répond. */
  readonly alert: AlertId;
  /** Message de l'alerte (« Nitrites trop hauts »). */
  readonly message: string;
  /** Produit conseillé ; `null` : aucun produit ne répond à cette alerte. */
  readonly product: PharmacyProduct | null;
  /** Vrai si ce produit agit déjà : poursuivre, ne pas en reverser. */
  readonly inProgress: boolean;
  /** Conseil en clair. */
  readonly text: string;
}

const CHANGE_WATER = 'changer l’eau (Réglages, Eau)';

/** Conseil pour l'ammoniaque et les nitrites : l'amorce si le filtre est jeune, l'eau sinon. */
function filterAdvice(state: PharmacyState): Pick<PharmacyAdvice, 'product' | 'text'> {
  if (state.active.includes('amorce')) {
    return {
      product: 'amorce',
      text: `Amorce déjà versée : le filtre mûrit, ${CHANGE_WATER} en attendant.`,
    };
  }
  if (state.filterMature) {
    return {
      product: null,
      text: `Filtre déjà mûr, l’amorce n’apporterait rien : ${CHANGE_WATER} et nourrir moins.`,
    };
  }
  return {
    product: 'amorce',
    text: `Amorce de bactéries : le filtre mûrit plus vite ; ${CHANGE_WATER} en attendant.`,
  };
}

/** Conseil pour une maladie que le médicament (et, pour les points blancs, le sel) soigne. */
function diseaseAdvice(
  state: PharmacyState,
  saltWorks: boolean,
): Pick<PharmacyAdvice, 'product' | 'text'> {
  if (state.active.includes('medicament')) {
    return {
      product: 'medicament',
      text: 'Médicament déjà dans l’eau : redoser tous les deux jours jusqu’à la guérison.',
    };
  }
  if (saltWorks && state.active.includes('sel')) {
    return {
      product: 'sel',
      text: 'Sel déjà dans l’eau : le monter à 5 g/L, eau à 24 °C au moins, jusqu’à la guérison.',
    };
  }
  return saltWorks
    ? {
        product: 'medicament',
        text: 'Médicament, une dose tous les deux jours (ou sel à 5 g/L dans une eau à 24 °C).',
      }
    : {
        product: 'medicament',
        text: 'Médicament, une dose tous les deux jours : le sel et la chaleur n’y font rien.',
      };
}

/** Conseil propre à `alert`, ou `null` si aucun produit n'y répond. */
function productAdvice(
  alert: DashboardAlert,
  state: PharmacyState,
): Pick<PharmacyAdvice, 'product' | 'text'> | null {
  switch (alert.id) {
    case 'chlorine':
      return {
        product: 'conditionneur',
        text: 'Conditionneur : il neutralise le chlore aussitôt.',
      };
    case 'ammonia':
    case 'nitrite':
      return filterAdvice(state);
    case 'ich':
      return diseaseAdvice(state, true);
    case 'velvet':
    case 'fungus':
      return diseaseAdvice(state, false);
    case 'treatment':
      return diseaseAdvice(state, true);
    case 'carbon':
      return {
        product: 'charbon',
        text: 'Retirer le charbon actif : il retire le médicament de l’eau.',
      };
    default:
      return null;
  }
}

/**
 * Conseil de la pharmacie : celui de la première alerte de `alerts` (déjà triées par gravité,
 * `dashboardAlerts`) ; `null` sans alerte. Un produit conseillé qui agit déjà est signalé
 * (`inProgress`) ; une alerte sans produit renvoie à son action conseillée.
 */
export function pharmacyAdvice(
  alerts: readonly DashboardAlert[],
  state: PharmacyState,
): PharmacyAdvice | null {
  const first = alerts[0];
  if (first === undefined) {
    return null;
  }
  const advice = productAdvice(first, state) ?? {
    product: null,
    text: `Aucun produit pour cette alerte : ${first.action.charAt(0).toLowerCase()}${first.action.slice(1)}.`,
  };
  return {
    alert: first.id,
    message: first.message,
    product: advice.product,
    // Le charbon se retire : « en cours » ne veut pas dire « poursuivre » pour lui.
    inProgress:
      advice.product !== null &&
      advice.product !== 'charbon' &&
      state.active.includes(advice.product),
    text: advice.text,
  };
}
