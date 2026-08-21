/*
  AirCargo Quote — traductions
  -----------------------------
  Un seul dictionnaire, une seule page HTML.

  Le réflexe naturel serait de dupliquer index.html en index-en.html.
  Ce serait une erreur : deux fichiers à maintenir, et toute correction
  faite sur l'un s'oublierait sur l'autre. C'est exactement le défaut de
  duplication déjà corrigé pour les aéroports.

  Ici, chaque texte porte une CLÉ. Le dictionnaire donne sa traduction
  dans chaque langue. Ajouter l'espagnol demanderait un bloc "es" et
  rien d'autre.

  Ce fichier est chargé AVANT script.js.
*/

"use strict";

const TRADUCTIONS = {

  fr: {
    // Balise <html lang="..."> et formats de nombres et de dates
    codeLangue: "fr-FR",

    titrePage: "AirCargo Quote — Cotation de fret aérien",
    titreApp: "AirCargo Quote",
    sousTitre: "Outil de cotation de fret aérien",

    // Formulaire
    titreFormulaire: "Nouvelle cotation",
    labelDepart: "Aéroport de départ",
    labelArrivee: "Aéroport d'arrivée",
    labelPoids: "Poids brut (kg)",
    labelVolume: "Volume (m³)",
    labelType: "Type de marchandise",
    labelDate: "Date d'expédition souhaitée",
    boutonCalculer: "Calculer la cotation",

    // Résultat
    titreResultat: "Détail de la cotation",
    colonnePoste: "Poste",
    colonneBase: "Base de calcul",
    colonneMontant: "Montant",
    totalAFacturer: "Total à facturer",

    // Lignes du détail
    ligneTransport: "Transport",
    ligneMajorationType: "Majoration marchandise",
    ligneUrgence: "Majoration urgence",
    ligneFrais: "Frais de dossier",
    baseTransport: "{poids} kg × {tarif}/kg",
    baseAucune: "aucune",
    basePourcentage: "+{taux} % du transport",
    baseUrgenceActive: "départ à J+{jours} · +{taux} % du transport",
    baseUrgenceInactive: "départ à J+{jours} · non applicable",
    baseForfait: "forfait par expédition",

    // Résumé
    resumeTrajet: "{depart} → {arrivee} · {distance} km · départ dans {jours} jour(s)",
    resumePoids: "Poids réel {reel} kg · Poids volumétrique {volumetrique} kg → poids taxable retenu {taxable} kg ({retenu})",
    poidsReelLibelle: "poids réel",
    poidsVolumetriqueLibelle: "poids volumétrique",

    // Actions
    boutonExpliquer: "Expliquer ce prix",
    boutonExpliquerCharge: "Analyse en cours…",
    boutonImprimer: "Imprimer le devis",

    // Historique
    titreHistorique: "Historique",
    boutonVider: "Tout supprimer",
    historiqueVide: "Aucune cotation enregistrée pour le moment.",
    histoDetails: "{poids} kg taxables · {type}",
    supprimerCotation: "Supprimer cette cotation",
    confirmerVidage: "Supprimer toutes les cotations enregistrées ?",

    // Devis imprimé
    devisReference: "Référence :",
    devisDate: "Émis le :",
    devisValidite: "Valable jusqu'au :",
    devisMentions: "Devis non contractuel, établi à titre indicatif. Tarifs hors taxes, hors frais de douane et hors assurance. Sous réserve de disponibilité de capacité à la date demandée et d'acceptation de la marchandise par la compagnie. Document généré automatiquement — projet de démonstration.",

    // Erreurs
    erreurMemeAeroport: "Le départ et l'arrivée doivent être deux aéroports différents.",
    erreurLiaison: "Cette liaison n'est pas desservie.",
    erreurDatePassee: "La date d'expédition ne peut pas être dans le passé.",
    erreurExplication: "Explication indisponible.",
    erreurServeur: "Serveur injoignable. Vérifie qu'il est bien démarré (npm start)."
  },

  en: {
    // en-GB place le symbole devant le nombre : €1,553.77
    codeLangue: "en-GB",

    titrePage: "AirCargo Quote — Air freight quotation",
    titreApp: "AirCargo Quote",
    sousTitre: "Air freight quotation tool",

    titreFormulaire: "New quotation",
    labelDepart: "Departure airport",
    labelArrivee: "Arrival airport",
    labelPoids: "Gross weight (kg)",
    labelVolume: "Volume (m³)",
    labelType: "Commodity type",
    labelDate: "Requested shipping date",
    boutonCalculer: "Calculate quotation",

    titreResultat: "Quotation breakdown",
    colonnePoste: "Item",
    colonneBase: "Basis",
    colonneMontant: "Amount",
    totalAFacturer: "Total payable",

    ligneTransport: "Air freight",
    ligneMajorationType: "Commodity surcharge",
    ligneUrgence: "Urgency surcharge",
    ligneFrais: "Documentation fee",
    baseTransport: "{poids} kg × {tarif}/kg",
    baseAucune: "none",
    basePourcentage: "+{taux}% of air freight",
    baseUrgenceActive: "departure in {jours} day(s) · +{taux}% of air freight",
    baseUrgenceInactive: "departure in {jours} day(s) · not applicable",
    baseForfait: "flat fee per shipment",

    resumeTrajet: "{depart} → {arrivee} · {distance} km · departing in {jours} day(s)",
    resumePoids: "Actual weight {reel} kg · Volumetric weight {volumetrique} kg → chargeable weight {taxable} kg ({retenu})",
    poidsReelLibelle: "actual weight",
    poidsVolumetriqueLibelle: "volumetric weight",

    boutonExpliquer: "Explain this price",
    boutonExpliquerCharge: "Analysing…",
    boutonImprimer: "Print quotation",

    titreHistorique: "History",
    boutonVider: "Clear all",
    historiqueVide: "No quotation saved yet.",
    histoDetails: "{poids} kg chargeable · {type}",
    supprimerCotation: "Delete this quotation",
    confirmerVidage: "Delete all saved quotations?",

    devisReference: "Reference:",
    devisDate: "Issued on:",
    devisValidite: "Valid until:",
    devisMentions: "Non-binding quotation, provided for information only. Rates exclude taxes, customs charges and insurance. Subject to capacity availability on the requested date and to acceptance of the commodity by the carrier. Automatically generated document — demonstration project.",

    erreurMemeAeroport: "Departure and arrival airports must be different.",
    erreurLiaison: "This route is not operated.",
    erreurDatePassee: "The shipping date cannot be in the past.",
    erreurExplication: "Explanation unavailable.",
    erreurServeur: "Server unreachable. Check that it is running (npm start)."
  }
};

/*
  La langue en cours. On la retient dans le localStorage pour que le
  choix survive à un rechargement — un utilisateur anglophone ne doit
  pas reparamétrer la langue à chaque visite.
*/
const CLE_LANGUE = "aircargo-quote:langue";

let langue = "fr";

try {
  const enregistree = localStorage.getItem(CLE_LANGUE);
  if (enregistree === "fr" || enregistree === "en") {
    langue = enregistree;
  }
} catch (erreur) {
  // localStorage indisponible : on reste en français, sans casser la page.
}

/*
  t() pour "translate" — la fonction qu'on appellera partout.

  Le second paramètre permet de remplir les trous d'un texte à variables.
  Exemple : t("baseTransport", { poids: 334, tarif: "4,65 €" })
  transforme "{poids} kg × {tarif}/kg" en "334 kg × 4,65 €/kg".

  Pourquoi des trous nommés plutôt que de coller des morceaux bout à bout ?
  Parce que l'ordre des mots change d'une langue à l'autre. Une phrase
  assemblée par concaténation devient intraduisible.

  replace(/{cle}/g, valeur) : le /g remplace TOUTES les occurrences,
  pas seulement la première.
*/
function t(cle, variables) {
  let texte = TRADUCTIONS[langue][cle];

  if (texte === undefined) {
    // Filet de sécurité : mieux vaut afficher la clé qu'un vide silencieux.
    console.warn("Traduction manquante :", cle);
    return cle;
  }

  if (variables) {
    Object.keys(variables).forEach(function (nom) {
      texte = texte.replace(new RegExp("{" + nom + "}", "g"), variables[nom]);
    });
  }

  return texte;
}
