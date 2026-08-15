/*
  AirCargo Quote — moteur de cotation
  ------------------------------------
  Organisation du fichier, dans cet ordre :
    1. Les données               (aéroports, tarifs, distances, coefficients)
    2. Les fonctions de calcul   -> ne touchent JAMAIS à la page
    3. Les fonctions d'affichage -> ne calculent JAMAIS rien
    4. La construction du formulaire (listes générées depuis les données)
    5. Le branchement du formulaire

  Cette séparation calcul / affichage est volontaire : la logique de pricing
  pourrait être déplacée telle quelle sur un serveur sans rien réécrire.
*/

// "use strict" : active le mode strict de JavaScript. Il transforme certaines
// erreurs silencieuses en vraies erreurs affichées dans la console. À garder toujours.
"use strict";


/* ============================================================
   1. LES DONNÉES
   ============================================================ */

/*
  Les aéroports desservis.
  Cette table est désormais la SEULE source de vérité : les listes
  déroulantes du formulaire sont générées à partir d'elle au chargement
  de la page. Ajouter un aéroport = ajouter une ligne ici, et c'est tout.

  Avant ce refactoring, la liste existait en double (dans le HTML et ici) :
  il fallait penser à modifier les deux, sous peine d'incohérence silencieuse.
*/
const AEROPORTS = {
  CDG: "Paris Charles de Gaulle",
  MRS: "Marseille Provence",
  LGG: "Liège",
  JFK: "New York",
  DXB: "Dubaï",
  HKG: "Hong Kong",
  SIN: "Singapour"
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

  Une seule table qui porte À LA FOIS le libellé affiché et la majoration.
  Avant, ces deux informations vivaient dans deux objets séparés : ajouter
  un type imposait de modifier deux endroits, avec le risque d'en oublier un.

  On accède aux valeurs avec un point :
    TYPES_MARCHANDISE.fragile.majoration  vaut 0.15
    TYPES_MARCHANDISE.fragile.libelle     vaut "Fragile"

  La majoration s'exprime en pourcentage du prix de base (0.15 = +15 %).
  Une marchandise dangereuse demande un traitement DGR et du personnel
  certifié : c'est la majoration la plus forte.
*/
const TYPES_MARCHANDISE = {
  standard:   { libelle: "Standard",         majoration: 0    },
  fragile:    { libelle: "Fragile",          majoration: 0.15 },
  perissable: { libelle: "Périssable",       majoration: 0.20 },
  dangereuse: { libelle: "Dangereuse (DGR)", majoration: 0.40 }
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
   3. L'AFFICHAGE
   ============================================================ */

// On retrouve une fois pour toutes les éléments de la page qu'on va manipuler.
// Le # signifie "id", exactement comme en CSS.
const sectionResultat = document.querySelector("#section-resultat");
const resumeTrajet    = document.querySelector("#resume-trajet");
const resumePoids     = document.querySelector("#resume-poids");
const corpsDetail     = document.querySelector("#corps-detail");
const celluleTotal    = document.querySelector("#cellule-total");
const messageErreur   = document.querySelector("#message-erreur");

/*
  Formate un nombre en euros : 1553.77 devient "1 553,77 €".

  Intl.NumberFormat est un outil intégré au navigateur qui connaît les
  conventions de chaque pays : virgule décimale, espace comme séparateur
  de milliers, symbole € après le nombre.
  ⚠️ C'est un peu "avancé", mais c'est LA façon professionnelle de faire.
  L'alternative bricolée (montant.toFixed(2) + " €") donne "1553.77 €",
  avec un point décimal — ce qui n'est pas correct en français.
*/
const formatEuros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR"
});

function formaterEuros(montant) {
  return formatEuros.format(montant);
}

/*
  Fabrique une ligne du tableau (<tr>) contenant trois cellules (<td>).

  document.createElement("tr") crée un élément qui n'existe QUE dans la
  mémoire du navigateur : il n'apparaît nulle part tant qu'on ne l'a pas
  accroché à la page. C'est le principe de la construction dynamique du DOM
  (DOM = la représentation de la page que le navigateur garde en mémoire).
*/
function creerLigneDetail(poste, baseDeCalcul, montant) {
  const ligne = document.createElement("tr");

  // Un petit tableau des trois textes, qu'on parcourt pour créer les cellules.
  // Ça évite d'écrire trois fois le même bloc de code.
  const textes = [poste, baseDeCalcul, formaterEuros(montant)];

  // forEach exécute la fonction une fois par élément du tableau.
  textes.forEach(function (texte) {
    const cellule = document.createElement("td");
    cellule.textContent = texte; // textContent : du texte, jamais du HTML
    ligne.appendChild(cellule);  // appendChild : accroche la cellule à la ligne
  });

  return ligne;
}

/*
  Remplit toute la zone de résultat à partir d'une cotation.
  Cette fonction ne calcule rien : elle reçoit des chiffres déjà faits
  et se contente de les mettre en forme.
*/
function afficherCotation(cotation) {
  masquerErreur();

  // --- Le résumé au-dessus du tableau ---
  resumeTrajet.textContent =
    `${cotation.depart} → ${cotation.arrivee} · ${cotation.distance} km · départ dans ${cotation.joursAvantDepart} jour(s)`;

  // On indique explicitement lequel des deux poids a été retenu :
  // c'est la règle métier la moins évidente, elle mérite d'être visible.
  const poidsRetenu = cotation.poidsTaxable === cotation.poidsReel ? "poids réel" : "poids volumétrique";
  resumePoids.textContent =
    `Poids réel ${cotation.poidsReel.toFixed(1)} kg · Poids volumétrique ${cotation.poidsVolumetrique.toFixed(1)} kg ` +
    `→ poids taxable retenu ${cotation.poidsTaxable.toFixed(1)} kg (${poidsRetenu})`;

  // --- Les lignes du tableau ---
  // On les prépare dans un tableau JS avant de les insérer.
  const lignes = [
    creerLigneDetail(
      "Transport",
      `${cotation.poidsTaxable.toFixed(1)} kg × ${cotation.tarifParKg.toFixed(2)} €/kg`,
      cotation.prixDeBase
    ),
    creerLigneDetail(
      `Majoration marchandise — ${TYPES_MARCHANDISE[cotation.type].libelle}`,
      cotation.tauxType === 0 ? "aucune" : `+${cotation.tauxType * 100} % du transport`,
      cotation.montantType
    ),
    creerLigneDetail(
      "Majoration urgence",
      cotation.estUrgent
        ? `départ à J+${cotation.joursAvantDepart} · +${MAJORATION_URGENCE * 100} % du transport`
        : `départ à J+${cotation.joursAvantDepart} · non applicable`,
      cotation.montantUrgence
    ),
    creerLigneDetail(
      "Frais de dossier",
      "forfait par expédition",
      cotation.fraisDeDossier
    )
  ];

  // replaceChildren(...) vide le <tbody> et y met les nouvelles lignes,
  // en une seule opération. Sans lui, chaque nouvelle cotation viendrait
  // s'ajouter sous la précédente au lieu de la remplacer.
  // Le "..." (spread) étale le tableau : replaceChildren(ligne1, ligne2, ...).
  corpsDetail.replaceChildren(...lignes);

  celluleTotal.textContent = formaterEuros(cotation.total);

  // hidden = false : on rend la section visible.
  sectionResultat.hidden = false;
}

function afficherErreur(message) {
  messageErreur.textContent = message;
  messageErreur.hidden = false;
  sectionResultat.hidden = true; // on masque un résultat devenu faux
}

function masquerErreur() {
  messageErreur.hidden = true;
}


/* ============================================================
   4. LA CONSTRUCTION DU FORMULAIRE
   ============================================================ */

/*
  Remplit une liste déroulante à partir d'un objet de données.

  Paramètres :
    - liste : l'élément <select> à remplir
    - donnees : un objet dont chaque clé devient la valeur d'une <option>
    - libelleDe : une fonction qui, pour une clé, renvoie le texte à afficher
    - valeurParDefaut : la clé présélectionnée à l'ouverture

  ⚠️ Passer une FONCTION en paramètre (libelleDe) est un cran au-dessus
  du reste du fichier. C'est justifié ici : les deux tables n'ont pas la
  même forme (AEROPORTS contient du texte, TYPES_MARCHANDISE contient des
  objets), et ça évite d'écrire deux fonctions presque identiques.
*/
function remplirListe(liste, donnees, libelleDe, valeurParDefaut) {
  // Object.keys(objet) renvoie un tableau des clés :
  // pour AEROPORTS, ça donne ["CDG", "MRS", "LGG", ...]
  const options = Object.keys(donnees).map(function (cle) {
    const option = document.createElement("option");
    option.value = cle;                  // la valeur lue par le JavaScript
    option.textContent = libelleDe(cle); // le texte vu par l'utilisateur
    return option;
  });

  // map() parcourt un tableau et en renvoie un NOUVEAU, transformé.
  // Ici : un tableau de clés devient un tableau d'éléments <option>.
  liste.replaceChildren(...options);
  liste.value = valeurParDefaut;
}

// On remplit les trois listes au chargement de la page.
remplirListe(
  document.querySelector("#depart"),
  AEROPORTS,
  (code) => `${code} — ${AEROPORTS[code]}`,
  "CDG"
);

remplirListe(
  document.querySelector("#arrivee"),
  AEROPORTS,
  (code) => `${code} — ${AEROPORTS[code]}`,
  "HKG"
);

remplirListe(
  document.querySelector("#type"),
  TYPES_MARCHANDISE,
  (cle) => TYPES_MARCHANDISE[cle].libelle,
  "standard"
);

/*
  La syntaxe (code) => ... s'appelle une "fonction fléchée".
  C'est une écriture courte de function (code) { return ...; }
  Très répandue en JavaScript moderne, elle sert surtout quand on passe
  une petite fonction en paramètre, comme ici.
*/


/* ============================================================
   5. LE BRANCHEMENT DU FORMULAIRE
   ============================================================ */

const formulaire = document.querySelector("#formulaire-cotation");

/*
  addEventListener("submit", ...) : "quand le formulaire est envoyé,
  exécute cette fonction". Le paramètre "evenement" contient les infos
  sur ce qui vient de se passer.
*/
formulaire.addEventListener("submit", function (evenement) {
  // Par défaut, envoyer un formulaire recharge la page et perd tout.
  // preventDefault() annule ce comportement : on gère tout en JavaScript.
  evenement.preventDefault();

  // On lit la valeur de chaque champ.
  // .value renvoie TOUJOURS une chaîne de caractères, même pour un
  // <input type="number">. Number(...) la convertit en vrai nombre,
  // sinon "250" + 10 donnerait "25010" au lieu de 260.
  const expedition = {
    depart:  document.querySelector("#depart").value,
    arrivee: document.querySelector("#arrivee").value,
    poids:   Number(document.querySelector("#poids").value),
    volume:  Number(document.querySelector("#volume").value),
    type:    document.querySelector("#type").value,
    date:    document.querySelector("#date").value
  };

  // Contrôles de cohérence que le navigateur ne peut pas faire tout seul.
  if (expedition.depart === expedition.arrivee) {
    afficherErreur("Le départ et l'arrivée doivent être deux aéroports différents.");
    return; // return interrompt la fonction ici : on ne calcule pas.
  }

  if (trouverDistance(expedition.depart, expedition.arrivee) === null) {
    afficherErreur("Cette liaison n'est pas desservie.");
    return;
  }

  if (calculerJoursAvantDepart(expedition.date) < 0) {
    afficherErreur("La date d'expédition ne peut pas être dans le passé.");
    return;
  }

  const cotation = calculerCotation(expedition);
  afficherCotation(cotation);
});
