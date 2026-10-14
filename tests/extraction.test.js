/*
  Tests de la vérification d'extraction
  --------------------------------------
  Ces tests ne parlent jamais au modèle. Ils fournissent directement
  des réponses, correctes ou fausses, et vérifient ce qui en ressort.
  On teste notre code, pas le modèle : le modèle peut se tromper,
  notre vérification ne doit rien laisser passer.
*/

const test = require("node:test");
const assert = require("node:assert");

const { normaliserExtraction } = require("../server/extraction.js");

// Une date du jour fixe : la fonction reçoit la date en paramètre,
// on peut donc la choisir librement sans rendre les tests fragiles.
const AUJOURDHUI = "2026-10-14";

// Une réponse de modèle correcte, qu'on altère champ par champ.
const REPONSE_CORRECTE = {
  depart: "CDG",
  arrivee: "HKG",
  poids: 800,
  volume: 4.5,
  type: "standard",
  date: "2026-10-21",
  alertes: []
};


test("une réponse correcte est conservée telle quelle", () => {
  const resultat = normaliserExtraction(REPONSE_CORRECTE, AUJOURDHUI);

  assert.deepStrictEqual(resultat.champs, {
    depart: "CDG", arrivee: "HKG", poids: 800, volume: 4.5,
    type: "standard", date: "2026-10-21"
  });
  assert.deepStrictEqual(resultat.manquants, []);
  assert.deepStrictEqual(resultat.alertes, []);
});

test("un aéroport absent de notre table est refusé", () => {
  const resultat = normaliserExtraction({ ...REPONSE_CORRECTE, arrivee: "LAX" }, AUJOURDHUI);

  assert.strictEqual(resultat.champs.arrivee, null);
  assert.deepStrictEqual(resultat.manquants, ["arrivee"]);
});

test("un code d'aéroport en minuscules est accepté", () => {
  const resultat = normaliserExtraction({ ...REPONSE_CORRECTE, depart: " cdg " }, AUJOURDHUI);

  assert.strictEqual(resultat.champs.depart, "CDG");
});

test("un poids négatif, nul ou écrit en texte est refusé", () => {
  for (const poids of [-5, 0, "800 kg", NaN, 5000000]) {
    const resultat = normaliserExtraction({ ...REPONSE_CORRECTE, poids }, AUJOURDHUI);
    assert.strictEqual(resultat.champs.poids, null, `poids accepté à tort : ${poids}`);
  }
});

test("un volume absent reste vide et il est signalé", () => {
  // Le modèle ne doit pas estimer un volume que le client n'a pas donné.
  const resultat = normaliserExtraction({ ...REPONSE_CORRECTE, volume: null }, AUJOURDHUI);

  assert.strictEqual(resultat.champs.volume, null);
  assert.ok(resultat.manquants.includes("volume"));
});

test("un type de marchandise inconnu est refusé", () => {
  const resultat = normaliserExtraction({ ...REPONSE_CORRECTE, type: "explosif" }, AUJOURDHUI);

  assert.strictEqual(resultat.champs.type, null);
});

test("une date passée est refusée", () => {
  const resultat = normaliserExtraction({ ...REPONSE_CORRECTE, date: "2026-10-13" }, AUJOURDHUI);

  assert.strictEqual(resultat.champs.date, null);
});

test("la date du jour est acceptée", () => {
  const resultat = normaliserExtraction({ ...REPONSE_CORRECTE, date: AUJOURDHUI }, AUJOURDHUI);

  assert.strictEqual(resultat.champs.date, AUJOURDHUI);
});

test("une date qui n'existe pas est refusée", () => {
  // JavaScript transformerait silencieusement le 31 février en 3 mars.
  const resultat = normaliserExtraction({ ...REPONSE_CORRECTE, date: "2027-02-31" }, AUJOURDHUI);

  assert.strictEqual(resultat.champs.date, null);
});

test("une alerte force le type dangereux, même si le modèle a proposé standard", () => {
  const resultat = normaliserExtraction(
    { ...REPONSE_CORRECTE, type: "standard", alertes: ["Batteries lithium"] },
    AUJOURDHUI
  );

  assert.strictEqual(resultat.champs.type, "dangereuse");
  assert.deepStrictEqual(resultat.alertes, ["Batteries lithium"]);
});

test("les alertes sont nettoyées : texte seul, raccourci, en nombre limité", () => {
  const resultat = normaliserExtraction(
    { ...REPONSE_CORRECTE, alertes: ["  Aérosols  ", 42, "", "x".repeat(200), "a", "b", "c", "d"] },
    AUJOURDHUI
  );

  assert.strictEqual(resultat.alertes[0], "Aérosols");
  assert.ok(resultat.alertes.every((alerte) => typeof alerte === "string" && alerte.length <= 80));
  assert.ok(resultat.alertes.length <= 5);
});

test("une réponse qui n'est pas un objet donne six champs à compléter", () => {
  for (const brut of [null, "texte", 42, [1, 2]]) {
    const resultat = normaliserExtraction(brut, AUJOURDHUI);
    assert.strictEqual(resultat.manquants.length, 6);
    assert.deepStrictEqual(resultat.alertes, []);
  }
});

test("un champ inattendu ajouté par le modèle n'est jamais transmis", () => {
  // Une demande client pourrait tenter de glisser une consigne, par
  // exemple pour imposer un prix. Seuls les six champs connus ressortent.
  const resultat = normaliserExtraction({ ...REPONSE_CORRECTE, prix: 0, total: 1 }, AUJOURDHUI);

  assert.deepStrictEqual(
    Object.keys(resultat.champs),
    ["depart", "arrivee", "poids", "volume", "type", "date"]
  );
});
