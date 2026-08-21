/*
  AirCargo Quote — moteur de cotation
  ------------------------------------
  Ce fichier contient TOUTE la logique de calcul, et rien d'autre.
  Il ne touche jamais à la page : pas un seul document.querySelector.

  Conséquence directe : il fonctionne aussi bien dans le navigateur que
  dans Node.js, ce qui permet de le tester automatiquement.
  C'est la raison d'être de la séparation calcul / affichage, et la preuve
  qu'elle n'était pas qu'un principe théorique.

  Chargé AVANT script.js dans index.html, pour que les fonctions existent
  quand l'interface en a besoin.
*/

"use strict";


/* ============================================================
   1. LES DONNÉES
   ============================================================ */

/*
  Les aéroports desservis.
  Cette table est la SEULE source de vérité : les listes déroulantes du
  formulaire sont générées à partir d'elle au chargement de la page.
  Ajouter un aéroport = ajouter une ligne ici, et c'est tout.

  Les noms ne sont pas traduits : dans l'aviation, les noms d'aéroports
  s'emploient sous leur forme internationale, et c'est le code IATA qui
  fait foi dans les documents de transport.
*/
const AEROPORTS = {
  CDG: "Paris Charles de Gaulle",
  MRS: "Marseille Provence",
  LGG: "Liege",
  JFK: "New York JFK",
  DXB: "Dubai",
  HKG: "Hong Kong",
  SIN: "Singapore"
};

/*
  Table des distances entre aéroports, en kilomètres.

  C'est un OBJET JavaScript : une liste de paires "clé": valeur.
  On accède à une valeur avec DISTANCES["CDG-JFK"], qui vaut 5837.

  On ne stocke qu'un sens (CDG-JFK) et pas les deux (JFK-CDG) :
  la fonction trouverDistance() s'occupe de chercher dans les deux ordres.
  Ça divise la table par deux et évite les incohérences.

  ⚠️ Ce sont des distances orthodromiques approximatives, arrondies.
  Amélioration V2 possible : stocker les coordonnées GPS des aéroports
  et calculer la distance avec la formule de Haversine.
*/
const DISTANCES = {
  "CDG-MRS": 645,   "CDG-LGG": 335,   "CDG-JFK": 5837,  "CDG-DXB": 5240,
  "CDG-HKG": 9630,  "CDG-SIN": 10730,
  "MRS-LGG": 750,   "MRS-JFK": 6440,  "MRS-DXB": 4780,  "MRS-HKG": 9330,
  "MRS-SIN": 10250,
  "LGG-JFK": 5920,  "LGG-DXB": 4980,  "LGG-HKG": 9210,  "LGG-SIN": 10390,
  "JFK-DXB": 11000, "JFK-HKG": 12960, "JFK-SIN": 15340,
  "DXB-HKG": 5940,  "DXB-SIN": 5840,
  "HKG-SIN": 2580
};

// Règle IATA : 1 m³ de fret aérien équivaut à 167 kg facturables.
// C'est le cœur du métier : un avion vend du volume autant que de la masse.
const KG_PAR_METRE_CUBE = 167;

// Tarif au kilo = une part fixe + une part proportionnelle à la distance.
// Exemple : CDG-HKG (9630 km) => 0.80 + (9630 × 0.00040) = 4.65 €/kg
const TARIF_BASE_PAR_KG = 0.80;
const TARIF_PAR_KM = 0.00040;

// Frais fixes par expédition (ouverture de dossier, documentation, sûreté).
// Fixes et non proportionnels : traiter un dossier coûte pareil quel que soit le poids.
const FRAIS_DE_DOSSIER = 45;

/*
  Les types de marchandise.

  Chaque type porte sa majoration ET son libellé dans les deux langues.
  Le libellé est un objet { fr, en } : on y accède avec
  TYPES_MARCHANDISE.fragile.libelle[langue].

  La majoration s'exprime en pourcentage du prix de base (0.15 = +15 %).
  Une marchandise dangereuse demande un traitement DGR et du personnel
  certifié : c'est la majoration la plus forte.
*/
const TYPES_MARCHANDISE = {
  standard: {
    libelle: { fr: "Standard", en: "General cargo" },
    majoration: 0
  },
  fragile: {
    libelle: { fr: "Fragile", en: "Fragile" },
    majoration: 0.15
  },
  perissable: {
    libelle: { fr: "Périssable", en: "Perishable" },
    majoration: 0.20
  },
  dangereuse: {
    libelle: { fr: "Dangereuse (DGR)", en: "Dangerous goods (DGR)" },
    majoration: 0.40
  }
};

// Une expédition à moins de 5 jours mobilise de la capacité en urgence.
const DELAI_URGENCE_JOURS = 5;
const MAJORATION_URGENCE = 0.25;


/* ============================================================
   2. LES FONCTIONS DE CALCUL
   ============================================================ */

/*
  Cherche la distance entre deux aéroports, dans les deux sens.
  Retourne le nombre de km, ou null si la liaison n'existe pas dans la table.
*/
function trouverDistance(depart, arrivee) {
  // Les backticks ` ` permettent d'insérer des variables dans une chaîne
  // avec ${...}. C'est plus lisible que depart + "-" + arrivee.
  const allerRetour = DISTANCES[`${depart}-${arrivee}`];
  const retourAller = DISTANCES[`${arrivee}-${depart}`];

  if (allerRetour !== undefined) {
    return allerRetour;
  }
  if (retourAller !== undefined) {
    return retourAller;
  }
  return null; // liaison inconnue
}

/*
  Calcule le nombre de jours entre aujourd'hui et la date souhaitée.

  ⚠️ RACCOURCI PÉDAGOGIQUE : la manipulation des dates en JavaScript est un
  sujet piégeux (fuseaux horaires, heure d'été). Ici on remet l'heure à minuit
  des deux côtés pour comparer des journées entières, ce qui suffit largement.
  Dans une vraie application, ce calcul se ferait côté serveur, ou avec une
  bibliothèque dédiée comme date-fns.
*/
function calculerJoursAvantDepart(dateSouhaitee) {
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0); // heures, minutes, secondes, millisecondes

  const depart = new Date(dateSouhaitee);
  depart.setHours(0, 0, 0, 0);

  const MILLISECONDES_PAR_JOUR = 1000 * 60 * 60 * 24;

  // Soustraire deux dates en JS donne un écart en millisecondes.
  // Math.round évite les 4.999999 dus aux arrondis.
  return Math.round((depart - aujourdhui) / MILLISECONDES_PAR_JOUR);
}

/*
  LE CŒUR DU PROJET.

  Reçoit un objet "expedition" et retourne un objet contenant TOUT le détail
  du calcul, pas seulement le total. C'est volontaire : une cotation doit être
  auditable ligne par ligne, un commercial doit pouvoir justifier chaque euro.

  Cette fonction ne touche pas à la page HTML : elle prend des données,
  elle rend des données.
*/
function calculerCotation(expedition) {
  const distance = trouverDistance(expedition.depart, expedition.arrivee);

  // Poids volumétrique : le volume converti en kilos facturables.
  const poidsVolumetrique = expedition.volume * KG_PAR_METRE_CUBE;

  // Poids taxable : on retient le PLUS GRAND des deux.
  // Math.max(a, b) renvoie le plus grand des deux nombres.
  const poidsTaxable = Math.max(expedition.poids, poidsVolumetrique);

  const tarifParKg = TARIF_BASE_PAR_KG + (distance * TARIF_PAR_KM);
  const prixDeBase = poidsTaxable * tarifParKg;

  // Majoration liée au type de marchandise
  const tauxType = TYPES_MARCHANDISE[expedition.type].majoration;
  const montantType = prixDeBase * tauxType;

  // Majoration liée à l'urgence
  const joursAvantDepart = calculerJoursAvantDepart(expedition.date);
  const estUrgent = joursAvantDepart < DELAI_URGENCE_JOURS;
  // L'opérateur ternaire "condition ? valeurSiVrai : valeurSiFaux"
  // est un raccourci pour un if/else qui renvoie une valeur.
  const montantUrgence = estUrgent ? prixDeBase * MAJORATION_URGENCE : 0;

  const total = prixDeBase + montantType + montantUrgence + FRAIS_DE_DOSSIER;

  // On renvoie un objet : toutes les valeurs intermédiaires sont conservées
  // pour pouvoir les afficher dans le détail.
  return {
    depart: expedition.depart,
    arrivee: expedition.arrivee,
    distance: distance,
    poidsReel: expedition.poids,
    poidsVolumetrique: poidsVolumetrique,
    poidsTaxable: poidsTaxable,
    tarifParKg: tarifParKg,
    prixDeBase: prixDeBase,
    type: expedition.type,
    tauxType: tauxType,
    montantType: montantType,
    joursAvantDepart: joursAvantDepart,
    estUrgent: estUrgent,
    montantUrgence: montantUrgence,
    fraisDeDossier: FRAIS_DE_DOSSIER,
    total: total
  };
}



/* ============================================================
   L'EXPORT POUR LES TESTS
   ============================================================ */

/*
  Ce fichier est chargé dans deux contextes différents :
    - dans le navigateur, par une balise <script>
    - dans Node.js, par les tests, avec require()

  Node.js définit un objet "module" ; le navigateur non.
  On teste donc sa présence avant d'exporter, sinon le navigateur
  planterait sur une variable inconnue.

  ⚠️ C'est un raccourci pédagogique assumé. Un projet moderne utiliserait
  les modules ES (import / export), standard depuis 2015 et supportés
  partout. Le choix de rester sur des balises <script> classiques évite
  d'avoir à expliquer en plus le type="module" et ses contraintes.
*/
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    AEROPORTS,
    DISTANCES,
    TYPES_MARCHANDISE,
    KG_PAR_METRE_CUBE,
    FRAIS_DE_DOSSIER,
    DELAI_URGENCE_JOURS,
    MAJORATION_URGENCE,
    trouverDistance,
    calculerJoursAvantDepart,
    calculerCotation
  };
}
