/*
  Tests du moteur de cotation
  ----------------------------
  Lancement :  npm test   (depuis la racine du projet)

  On utilise le module de test INTÉGRÉ à Node.js (node:test), disponible
  sans rien installer. Pas de Jest, pas de Mocha, aucune dépendance.

  Deux fonctions suffisent à tout comprendre :
    - test("nom", fonction)      : décrit un cas à vérifier
    - assert.strictEqual(a, b)   : échoue si a n'est pas exactement égal à b

  Un test qui passe ne prouve rien de spectaculaire. Ce qu'il garantit,
  c'est qu'une modification future qui casserait le calcul sera signalée
  immédiatement, au lieu d'être découverte par un client.
*/

const test = require("node:test");
const assert = require("node:assert");

// On charge le moteur de calcul. Il fonctionne ici sans navigateur
// parce qu'il ne touche jamais au DOM.
const {
  trouverDistance,
  calculerJoursAvantDepart,
  calculerCotation,
  KG_PAR_METRE_CUBE,
  FRAIS_DE_DOSSIER
} = require("../calcul.js");

/*
  Petite fonction utilitaire : renvoie une date située dans N jours,
  au format "AAAA-MM-JJ" attendu par le formulaire.

  Pourquoi une date RELATIVE et pas une date fixe comme "2026-12-01" ?
  Parce qu'un test avec une date en dur finit toujours par échouer :
  le jour où cette date sera passée, la majoration urgence ne
  s'appliquera plus et le test cassera sans qu'aucun code n'ait changé.
  On appelle ça un test fragile — c'est un piège classique.
*/
function dansNJours(n) {
  const date = new Date();
  date.setDate(date.getDate() + n);
  // toISOString donne "2026-08-21T09:30:00.000Z" ; on garde le début.
  return date.toISOString().slice(0, 10);
}


/* ============================================================
   LA TABLE DES DISTANCES
   ============================================================ */

test("la distance est trouvée quel que soit le sens", () => {
  assert.strictEqual(trouverDistance("CDG", "HKG"), trouverDistance("HKG", "CDG"));
});

test("une liaison inconnue renvoie null", () => {
  assert.strictEqual(trouverDistance("CDG", "ZZZ"), null);
});


/* ============================================================
   LE CALCUL DES DÉLAIS
   ============================================================ */

test("une date à 10 jours renvoie bien 10 jours", () => {
  assert.strictEqual(calculerJoursAvantDepart(dansNJours(10)), 10);
});

test("la date du jour renvoie 0", () => {
  assert.strictEqual(calculerJoursAvantDepart(dansNJours(0)), 0);
});


/* ============================================================
   LE POIDS TAXABLE — la règle métier centrale
   ============================================================ */

test("le poids réel l'emporte sur une marchandise dense", () => {
  // 800 kg dans 1 m³ : le volume ne pèse que 167 kg facturables.
  const cotation = calculerCotation({
    depart: "CDG", arrivee: "MRS",
    poids: 800, volume: 1,
    type: "standard", date: dansNJours(30)
  });

  assert.strictEqual(cotation.poidsTaxable, 800);
});

test("le poids volumétrique l'emporte sur une marchandise légère", () => {
  // 250 kg dans 2 m³ : le volume vaut 334 kg facturables.
  const cotation = calculerCotation({
    depart: "CDG", arrivee: "HKG",
    poids: 250, volume: 2,
    type: "standard", date: dansNJours(30)
  });

  assert.strictEqual(cotation.poidsTaxable, 2 * KG_PAR_METRE_CUBE);
});


/* ============================================================
   LES MAJORATIONS
   ============================================================ */

test("une marchandise standard n'entraîne aucune majoration de type", () => {
  const cotation = calculerCotation({
    depart: "CDG", arrivee: "HKG",
    poids: 250, volume: 2,
    type: "standard", date: dansNJours(30)
  });

  assert.strictEqual(cotation.montantType, 0);
});

test("une marchandise dangereuse majore le transport de 40 %", () => {
  const cotation = calculerCotation({
    depart: "CDG", arrivee: "HKG",
    poids: 250, volume: 2,
    type: "dangereuse", date: dansNJours(30)
  });

  // Comparer des nombres à virgule avec strictEqual est risqué :
  // en informatique, 0.1 + 0.2 ne vaut pas exactement 0.3.
  // On vérifie donc que l'écart est négligeable plutôt qu'une égalité stricte.
  const attendu = cotation.prixDeBase * 0.40;
  assert.ok(Math.abs(cotation.montantType - attendu) < 0.01);
});

test("un départ à 30 jours ne déclenche pas la majoration urgence", () => {
  const cotation = calculerCotation({
    depart: "CDG", arrivee: "HKG",
    poids: 250, volume: 2,
    type: "standard", date: dansNJours(30)
  });

  assert.strictEqual(cotation.estUrgent, false);
  assert.strictEqual(cotation.montantUrgence, 0);
});

test("un départ à 2 jours déclenche la majoration urgence", () => {
  const cotation = calculerCotation({
    depart: "CDG", arrivee: "HKG",
    poids: 250, volume: 2,
    type: "standard", date: dansNJours(2)
  });

  assert.strictEqual(cotation.estUrgent, true);
  assert.ok(cotation.montantUrgence > 0);
});

test("le seuil d'urgence est bien à 5 jours : 5 jours n'est pas urgent", () => {
  // Tester la valeur exacte du seuil, et non seulement de part et d'autre :
  // c'est là que se cachent les erreurs de comparaison (< au lieu de <=).
  const cotation = calculerCotation({
    depart: "CDG", arrivee: "HKG",
    poids: 250, volume: 2,
    type: "standard", date: dansNJours(5)
  });

  assert.strictEqual(cotation.estUrgent, false);
});


/* ============================================================
   LE TOTAL
   ============================================================ */

test("le total est bien la somme de toutes les lignes du détail", () => {
  // LE test le plus important : il garantit que le tableau affiché
  // à l'écran est cohérent. Une cotation dont les lignes ne somment
  // pas au total est indéfendable devant un client.
  const cotation = calculerCotation({
    depart: "CDG", arrivee: "HKG",
    poids: 250, volume: 2,
    type: "dangereuse", date: dansNJours(2)
  });

  const somme =
    cotation.prixDeBase +
    cotation.montantType +
    cotation.montantUrgence +
    cotation.fraisDeDossier;

  assert.ok(Math.abs(cotation.total - somme) < 0.01);
});

test("les frais de dossier sont fixes, quel que soit le poids", () => {
  const petite = calculerCotation({
    depart: "CDG", arrivee: "MRS",
    poids: 10, volume: 0.1,
    type: "standard", date: dansNJours(30)
  });

  const grosse = calculerCotation({
    depart: "CDG", arrivee: "MRS",
    poids: 5000, volume: 20,
    type: "standard", date: dansNJours(30)
  });

  assert.strictEqual(petite.fraisDeDossier, FRAIS_DE_DOSSIER);
  assert.strictEqual(grosse.fraisDeDossier, FRAIS_DE_DOSSIER);
});

test("une expédition plus lourde coûte plus cher", () => {
  const base = { depart: "CDG", arrivee: "HKG", volume: 1, type: "standard", date: dansNJours(30) };

  const legere = calculerCotation({ ...base, poids: 300 });
  const lourde = calculerCotation({ ...base, poids: 600 });

  assert.ok(lourde.total > legere.total);
});

test("calculerCotation est pure : deux appels identiques donnent le même total", () => {
  // C'est ce qui rend la fonction testable. Si l'identifiant ou
  // l'horodatage étaient générés à l'intérieur, ce test échouerait.
  const expedition = {
    depart: "CDG", arrivee: "SIN",
    poids: 400, volume: 3,
    type: "perissable", date: dansNJours(7)
  };

  assert.strictEqual(
    calculerCotation(expedition).total,
    calculerCotation(expedition).total
  );
});
