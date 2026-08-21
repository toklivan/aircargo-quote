/*
  AirCargo Quote — interface
  ---------------------------
  Ce fichier gère tout ce qui touche à la page : affichage, formulaire,
  historique, appel au serveur.

  Le calcul du prix, lui, vit dans calcul.js, chargé juste avant celui-ci.
  Les fonctions et constantes de calcul (calculerCotation, AEROPORTS,
  TYPES_MARCHANDISE...) sont donc déjà disponibles ici.

  Organisation du fichier :
    1. L'affichage de la cotation
    2. La construction du formulaire (listes générées depuis les données)
    3. L'historique              (localStorage)
    4. L'explication par l'IA    (appel à notre serveur proxy)
    5. Le devis imprimable
    6. Le branchement du formulaire
*/

"use strict";

/* ============================================================
   1. L'AFFICHAGE
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
  La cotation actuellement affichée à l'écran.
  On la garde en mémoire pour pouvoir l'envoyer au serveur quand
  l'utilisateur demande une explication.

  Pourquoi ne pas relire les valeurs dans le tableau HTML ? Parce qu'on
  y trouverait du texte formaté ("1 553,77 €") qu'il faudrait reconvertir
  en nombres. L'affichage découle des données, jamais l'inverse.
*/
let cotationAffichee = null;

/*
  Remplit toute la zone de résultat à partir d'une cotation.
  Cette fonction ne calcule rien : elle reçoit des chiffres déjà faits
  et se contente de les mettre en forme.
*/
function afficherCotation(cotation) {
  masquerErreur();

  cotationAffichee = cotation;
  reinitialiserExplication(); // l'explication précédente ne vaut plus
  remplirEnteteDevis(cotation);

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
   2. LA CONSTRUCTION DU FORMULAIRE
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
   3. L'HISTORIQUE
   ============================================================ */

/*
  localStorage : un petit espace de stockage fourni par le navigateur,
  propre à ce site, qui survit à la fermeture de l'onglet.

  Sa limite : il ne stocke QUE du texte. On convertit donc nos objets :
    - JSON.stringify(objet)  -> transforme un objet en texte
    - JSON.parse(texte)      -> refait le chemin inverse

  La clé sert d'étiquette pour retrouver nos données parmi celles
  d'éventuelles autres applications du même domaine.
*/
const CLE_STOCKAGE = "aircargo-quote:historique";

// Le tableau des cotations, gardé en mémoire pendant l'utilisation.
// Le localStorage en est la copie persistante.
let historique = [];

const listeHistorique  = document.querySelector("#liste-historique");
const historiqueVide   = document.querySelector("#historique-vide");
const boutonVider      = document.querySelector("#bouton-vider");

/*
  Lit l'historique depuis le localStorage.

  try / catch : on TENTE le code du bloc "try" ; si une erreur survient,
  au lieu de tout casser, le programme saute dans le bloc "catch".

  Pourquoi c'est nécessaire ici : le stockage peut échouer pour des raisons
  qui ne dépendent pas de nous (navigation privée, quota dépassé, données
  corrompues par une ancienne version). Sans protection, une erreur au
  chargement casserait TOUTE la page, formulaire compris.
  Avec, l'application continue de calculer même sans historique.
*/
function chargerHistorique() {
  try {
    const texte = localStorage.getItem(CLE_STOCKAGE);

    // getItem renvoie null si la clé n'existe pas encore (première visite).
    if (texte === null) {
      return [];
    }

    const donnees = JSON.parse(texte);

    // Array.isArray : on vérifie qu'on a bien récupéré un tableau.
    // Ne jamais faire confiance aveuglément à des données stockées :
    // elles ont pu être modifiées à la main dans les outils du navigateur.
    return Array.isArray(donnees) ? donnees : [];

  } catch (erreur) {
    // console.warn écrit dans la console du navigateur (touche F12).
    // C'est destiné au développeur, pas à l'utilisateur.
    console.warn("Historique illisible, on repart d'une liste vide.", erreur);
    return [];
  }
}

function sauvegarderHistorique() {
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(historique));
  } catch (erreur) {
    console.warn("Sauvegarde impossible.", erreur);
  }
}

/*
  Fabrique une ligne <li> de l'historique.

  Chaque ligne contient deux boutons :
    - un bouton "consulter" qui occupe toute la largeur
    - un bouton "supprimer"

  data-id : un attribut personnalisé (tout attribut commençant par "data-"
  est autorisé en HTML). On y range l'identifiant de la cotation pour
  savoir, au clic, de laquelle il s'agit. On le relit avec dataset.id.
*/
function creerLigneHistorique(cotation) {
  const ligne = document.createElement("li");

  const boutonConsulter = document.createElement("button");
  boutonConsulter.type = "button";
  boutonConsulter.className = "ligne-historique";
  boutonConsulter.dataset.id = cotation.id;

  // Le trajet, en gras
  const trajet = document.createElement("span");
  trajet.className = "histo-trajet";
  trajet.textContent = `${cotation.depart} → ${cotation.arrivee}`;

  // Le contexte, en petit et en gris
  const details = document.createElement("span");
  details.className = "histo-details";
  details.textContent =
    `${cotation.poidsTaxable.toFixed(0)} kg taxables · ${TYPES_MARCHANDISE[cotation.type].libelle}`;

  const montant = document.createElement("span");
  montant.className = "histo-montant";
  montant.textContent = formaterEuros(cotation.total);

  boutonConsulter.append(trajet, details, montant);

  const boutonSupprimer = document.createElement("button");
  boutonSupprimer.type = "button";
  boutonSupprimer.className = "bouton-supprimer";
  boutonSupprimer.dataset.supprimerId = cotation.id;
  boutonSupprimer.textContent = "×";
  // aria-label : le texte lu par un lecteur d'écran. Un "×" seul
  // ne veut rien dire à l'oreille.
  boutonSupprimer.setAttribute("aria-label", "Supprimer cette cotation");

  ligne.append(boutonConsulter, boutonSupprimer);
  return ligne;
}

/*
  Redessine entièrement la liste à partir du tableau `historique`.
  On ne modifie jamais une ligne existante : on repart des données et on
  reconstruit. C'est plus simple à suivre et il n'y a pas de risque de
  décalage entre ce qui est affiché et ce qui est stocké.
*/
function afficherHistorique() {
  const estVide = historique.length === 0;

  historiqueVide.hidden = !estVide;  // le ! inverse : vrai devient faux
  boutonVider.hidden = estVide;

  const lignes = historique.map(creerLigneHistorique);
  listeHistorique.replaceChildren(...lignes);
}

/*
  Ajoute une cotation en tête de liste.
  unshift() insère au DÉBUT du tableau (push() ajouterait à la fin) :
  la cotation la plus récente doit apparaître en premier.
*/
function ajouterAHistorique(cotation) {
  historique.unshift(cotation);
  sauvegarderHistorique();
  afficherHistorique();
}

/*
  DÉLÉGATION D'ÉVÉNEMENTS.

  Plutôt que de poser un écouteur de clic sur chaque bouton de chaque ligne,
  on en pose UN SEUL sur la liste entière, et on regarde d'où vient le clic.

  Deux avantages concrets :
    - ça fonctionne pour les lignes créées plus tard, qui n'existaient pas
      au moment où l'écouteur a été posé
    - un seul écouteur au lieu de deux par cotation

  evenement.target = l'élément exactement cliqué.
  closest("...") remonte les parents jusqu'à trouver un élément correspondant.
  Nécessaire ici parce qu'un clic peut atterrir sur le <span> du montant,
  et pas sur le <button> lui-même.
*/
listeHistorique.addEventListener("click", function (evenement) {

  // Cas 1 : clic sur la croix de suppression
  const cibleSuppression = evenement.target.closest(".bouton-supprimer");
  if (cibleSuppression) {
    const id = cibleSuppression.dataset.supprimerId;

    // filter() renvoie un NOUVEAU tableau ne gardant que les éléments
    // pour lesquels la condition est vraie : ici, tous sauf celui-là.
    // Les id du dataset sont du texte, d'où String() pour comparer
    // deux valeurs de même type.
    historique = historique.filter((cotation) => String(cotation.id) !== id);

    sauvegarderHistorique();
    afficherHistorique();
    return; // on s'arrête là, ce n'était pas une consultation
  }

  // Cas 2 : clic sur la ligne pour consulter
  const cibleConsultation = evenement.target.closest(".ligne-historique");
  if (cibleConsultation) {
    const id = cibleConsultation.dataset.id;

    // find() renvoie le PREMIER élément qui correspond, ou undefined.
    const cotation = historique.find((c) => String(c.id) === id);

    if (cotation) {
      // On réutilise telle quelle la fonction d'affichage de l'étape 2.
      // C'est le bénéfice direct d'avoir séparé calcul et affichage :
      // afficherCotation() ne se soucie pas de savoir si la cotation
      // vient d'être calculée ou sort du stockage.
      afficherCotation(cotation);
    }
  }
});

boutonVider.addEventListener("click", function () {
  // confirm() ouvre une boîte de dialogue native et renvoie true ou false.
  // ⚠️ RACCOURCI PÉDAGOGIQUE : confirm() bloque toute la page et ne peut
  // pas être stylé. Une vraie application utiliserait une fenêtre modale
  // maison. Ici, une confirmation avant une action irréversible vaut mieux
  // qu'un design parfait — c'est le bon arbitrage pour une V1.
  if (!confirm("Supprimer toutes les cotations enregistrées ?")) {
    return;
  }

  historique = [];
  sauvegarderHistorique();
  afficherHistorique();
});

// Au chargement de la page, on restaure ce qui avait été enregistré.
historique = chargerHistorique();
afficherHistorique();


/* ============================================================
   4. L'EXPLICATION PAR L'IA
   ============================================================ */

const boutonExpliquer = document.querySelector("#bouton-expliquer");
const zoneExplication = document.querySelector("#zone-explication");

/*
  Remet le bloc à zéro. Appelé à chaque nouvel affichage de cotation :
  laisser l'explication de la cotation précédente sous les chiffres de
  la nouvelle serait une erreur grave dans un outil de pricing.
*/
function reinitialiserExplication() {
  zoneExplication.hidden = true;
  zoneExplication.textContent = "";
  zoneExplication.classList.remove("explication-erreur");
  boutonExpliquer.disabled = false;
  boutonExpliquer.textContent = "Expliquer ce prix";
}

function afficherErreurExplication(message) {
  zoneExplication.textContent = message;
  // classList.add ajoute une classe CSS à l'élément, ce qui permet
  // de le styler différemment (ici, en rouge).
  zoneExplication.classList.add("explication-erreur");
  zoneExplication.hidden = false;
}

/*
  Demande l'explication au serveur.

  async : la fonction contient des "await", donc des pauses en attendant
  une réponse réseau. Le reste de la page continue de fonctionner pendant
  l'attente — rien n'est gelé.
*/
async function demanderExplication() {
  if (!cotationAffichee) {
    return;
  }

  /*
    ÉTAT "CHARGEMENT".
    On désactive le bouton et on le dit à l'utilisateur.

    Deux raisons, pas une :
    - sans retour visuel, l'utilisateur clique plusieurs fois en croyant
      que rien ne se passe
    - chaque clic déclenche un appel facturé au modèle
  */
  boutonExpliquer.disabled = true;
  boutonExpliquer.textContent = "Analyse en cours…";
  zoneExplication.hidden = true;
  zoneExplication.classList.remove("explication-erreur");

  try {
    /*
      fetch envoie la requête à NOTRE serveur, pas à Mistral.
      L'adresse est relative ("/api/expliquer") : elle vise automatiquement
      le serveur qui a servi la page. Aucune adresse en dur à changer
      le jour d'une mise en ligne.
    */
    const reponse = await fetch("/api/expliquer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cotationAffichee)
    });

    // .ok est vrai si le code HTTP est un succès (200 à 299).
    if (!reponse.ok) {
      const donnees = await reponse.json().catch(() => ({}));
      afficherErreurExplication(donnees.erreur || "Explication indisponible.");
      return;
    }

    const donnees = await reponse.json();

    /*
      textContent et non innerHTML.
      Ce texte vient d'un modèle de langage : c'est du contenu qu'on ne
      contrôle pas. L'interpréter comme du HTML ouvrirait une faille XSS.
      C'est exactement le cas de figure évoqué plus tôt dans le projet.
    */
    zoneExplication.textContent = donnees.explication;
    zoneExplication.hidden = false;

  } catch (erreur) {
    // Ce catch attrape les pannes réseau : serveur arrêté, connexion coupée.
    console.error("Appel au serveur impossible :", erreur);
    afficherErreurExplication(
      "Serveur injoignable. Vérifie qu'il est bien démarré (npm start)."
    );

  } finally {
    /*
      finally s'exécute TOUJOURS, que le try ait réussi ou échoué.
      C'est l'endroit correct pour réactiver le bouton : s'il était
      réactivé seulement en cas de succès, la moindre erreur le laisserait
      grisé définitivement.
    */
    boutonExpliquer.disabled = false;
    boutonExpliquer.textContent = "Expliquer ce prix";
  }
}

boutonExpliquer.addEventListener("click", demanderExplication);


/* ============================================================
   5. LE DEVIS IMPRIMABLE
   ============================================================ */

const boutonImprimer   = document.querySelector("#bouton-imprimer");
const devisReference   = document.querySelector("#devis-reference");
const devisDate        = document.querySelector("#devis-date");
const devisValidite    = document.querySelector("#devis-validite");

// Durée pendant laquelle le devis reste valable.
// En fret aérien, les tarifs bougent constamment (carburant, capacité,
// saisonnalité) : un devis sans date limite engagerait indéfiniment.
const VALIDITE_DEVIS_JOURS = 7;

/*
  Fabrique une référence de devis à partir de l'identifiant de la cotation.
  Format : AC-2026-0821-4471
    AC   = préfixe de l'application
    2026 = année, 0821 = mois et jour d'émission
    4471 = les 4 derniers chiffres de l'identifiant

  padStart(2, "0") complète avec des zéros à gauche : le mois 8 devient "08".
  Sans ça, les références n'auraient pas toutes la même longueur.
  getMonth() renvoie 0 pour janvier — d'où le + 1.
*/
function genererReference(identifiant) {
  const date = new Date(identifiant);

  const annee = date.getFullYear();
  const mois  = String(date.getMonth() + 1).padStart(2, "0");
  const jour  = String(date.getDate()).padStart(2, "0");

  // slice(-4) prend les 4 derniers caractères.
  const suffixe = String(identifiant).slice(-4);

  return `AC-${annee}-${mois}${jour}-${suffixe}`;
}

/*
  Formate une date au format français : 21/08/2026.
  toLocaleDateString applique les conventions du pays demandé —
  même principe qu'Intl.NumberFormat pour les montants.
*/
function formaterDate(date) {
  return date.toLocaleDateString("fr-FR");
}

/*
  Remplit l'en-tête du devis. Appelé à chaque affichage de cotation,
  y compris pour une cotation ressortie de l'historique : la référence
  doit rester CELLE D'ORIGINE et non être régénérée, sinon le même devis
  changerait de numéro à chaque consultation.
*/
function remplirEnteteDevis(cotation) {
  // Les cotations enregistrées avant l'ajout de cette fonctionnalité
  // n'ont pas de date d'émission : on retombe sur leur identifiant.
  const emission = cotation.enregistreeLe
    ? new Date(cotation.enregistreeLe)
    : new Date(cotation.id);

  const expiration = new Date(emission);
  expiration.setDate(expiration.getDate() + VALIDITE_DEVIS_JOURS);

  devisReference.textContent = genererReference(cotation.id);
  devisDate.textContent      = formaterDate(emission);
  devisValidite.textContent  = formaterDate(expiration);
}

/*
  window.print() ouvre la boîte de dialogue d'impression du navigateur.
  L'utilisateur peut alors imprimer sur papier ou choisir
  "Enregistrer au format PDF".

  C'est la solution la plus simple et la plus fiable : aucune bibliothèque
  de génération de PDF à installer, et le rendu est celui que l'utilisateur
  voit dans l'aperçu avant de valider.

  ⚠️ Une application professionnelle générerait souvent le PDF côté serveur,
  pour garantir un rendu identique quel que soit le navigateur et pouvoir
  archiver le document. Ici, l'impression navigateur est le bon arbitrage :
  zéro dépendance pour un résultat correct.
*/
boutonImprimer.addEventListener("click", function () {
  window.print();
});


/* ============================================================
   6. LE BRANCHEMENT DU FORMULAIRE
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

  /*
    On ajoute deux informations qui ne relèvent pas du calcul :
    un identifiant unique et la date d'enregistrement.

    Elles sont ajoutées ICI, et non dans calculerCotation(), pour garder
    cette fonction "pure" : mêmes données en entrée, même résultat en sortie,
    toujours. Date.now() changeant à chaque appel, l'y mettre rendrait la
    fonction impossible à tester de façon fiable.

    Date.now() renvoie le nombre de millisecondes écoulées depuis 1970 :
    deux clics ne peuvent pas tomber sur la même valeur.
  */
  cotation.id = Date.now();
  cotation.enregistreeLe = new Date().toISOString();

  afficherCotation(cotation);
  ajouterAHistorique(cotation);
});
