/*
  AirCargo Quote — serveur proxy
  -------------------------------
  Ce serveur a UNE seule raison d'exister : garder la clé API Mistral
  hors du navigateur.

  Rappel du problème : tout ce qui est envoyé au navigateur est lisible
  par l'utilisateur (code source, onglet Réseau). Une clé API placée dans
  script.js serait volée en quelques minutes. Le navigateur appelle donc
  ce serveur, et c'est LUI qui appelle Mistral avec la clé.

  Il fait aussi deux choses qu'un client ne peut pas faire de façon fiable :
  valider les données reçues, et limiter les abus. Tout contrôle effectué
  côté navigateur peut être contourné ; seul le serveur fait autorité.

  Lancement :  npm start   (depuis le dossier server/)
*/

// require(...) charge un module. C'est l'équivalent Node.js d'un import.
const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

/*
  process.env : les variables d'environnement du processus.
  La clé est lue depuis le fichier .env, qui n'est JAMAIS commité
  (il est listé dans .gitignore).

  On vérifie sa présence au démarrage plutôt que de découvrir le problème
  à la première requête : un serveur qui refuse de démarrer avec un message
  clair vaut mieux qu'un serveur qui échoue silencieusement.
*/
const CLE_MISTRAL = process.env.MISTRAL_API_KEY;

if (!CLE_MISTRAL) {
  console.error("ERREUR : MISTRAL_API_KEY absente. Vérifie le fichier server/.env");
  process.exit(1); // arrête le programme avec un code d'erreur
}

const URL_MISTRAL = "https://api.mistral.ai/v1/chat/completions";
const MODELE = "mistral-small-latest";

/*
  express.json() : un "middleware", c'est-à-dire une fonction qui traite
  chaque requête au passage. Celui-ci lit le corps JSON des requêtes
  et le range dans requete.body. Sans lui, requete.body serait vide.

  { limit: "10kb" } : refuse les corps de requête trop gros. Une cotation
  fait quelques centaines d'octets ; tout ce qui dépasse est suspect.
*/
app.use(express.json({ limit: "10kb" }));

/*
  express.static : sert les fichiers du site (index.html, style.css, script.js).

  Intérêt : le front et l'API sont alors sur la même adresse
  (http://localhost:3000), donc le navigateur n'applique aucune restriction
  CORS. Si on ouvrait index.html en double-clic pendant que le serveur
  tourne à part, ce seraient deux origines différentes et le navigateur
  bloquerait la requête.

  __dirname est le dossier de CE fichier (server/), ".." remonte à la racine.
*/
app.use(express.static(path.join(__dirname, "..")));

/*
  Le point d'entrée de l'API.

  POST et non GET : on envoie des données dans le corps de la requête,
  et l'appel a un coût (il déclenche une facturation). GET est réservé
  aux lectures sans effet de bord.

  async / await : appeler Mistral prend du temps. "await" met en pause
  cette fonction en attendant la réponse, sans bloquer le serveur pour
  les autres requêtes. Une fonction qui contient "await" doit être "async".
*/
app.post("/api/expliquer", async (requete, reponse) => {
  const cotation = requete.body;

  // --- Validation ---
  // On ne fait jamais confiance aux données reçues, même venant de notre
  // propre front : n'importe qui peut envoyer une requête à cette adresse.
  if (!cotation || typeof cotation.total !== "number") {
    return reponse.status(400).json({ erreur: "Cotation invalide." });
  }

  // On construit un résumé textuel à partir des chiffres DÉJÀ calculés.
  // Le modèle n'a rien à recalculer : il met en mots, c'est tout.
  const resume = [
    `Trajet : ${cotation.depart} vers ${cotation.arrivee}, ${cotation.distance} km`,
    `Poids réel : ${cotation.poidsReel} kg`,
    `Poids volumétrique : ${Math.round(cotation.poidsVolumetrique)} kg`,
    `Poids taxable retenu : ${Math.round(cotation.poidsTaxable)} kg`,
    `Transport : ${cotation.prixDeBase.toFixed(2)} EUR`,
    `Majoration marchandise : ${cotation.montantType.toFixed(2)} EUR`,
    `Majoration urgence : ${cotation.montantUrgence.toFixed(2)} EUR`,
    `Frais de dossier : ${cotation.fraisDeDossier.toFixed(2)} EUR`,
    `TOTAL : ${cotation.total.toFixed(2)} EUR`
  ].join("\n");

  /*
    Le prompt système : il définit le rôle et les contraintes du modèle.
    Le message "user" apporte uniquement les faits.
    Séparer les deux évite qu'une donnée inattendue soit prise pour une consigne.
  */
  const consigne =
    "Tu es un assistant commercial spécialisé en fret aérien. " +
    "On te fournit le détail chiffré d'une cotation déjà calculée. " +
    "Explique en français simple, à un client non spécialiste, pourquoi ce prix est ce qu'il est. " +
    "Ne recalcule aucun montant : reprends uniquement les chiffres fournis. " +
    "Trois à cinq phrases, pas de liste à puces, pas de formule de politesse.";

  try {
    /*
      fetch envoie une requête HTTP. Il est disponible nativement dans
      Node.js récent, comme dans le navigateur : même fonction, deux contextes.

      L'en-tête Authorization transporte la clé. C'est cette ligne qui
      justifie l'existence du serveur : elle ne doit jamais partir
      vers le navigateur.
    */
    const reponseMistral = await fetch(URL_MISTRAL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CLE_MISTRAL}`
      },
      body: JSON.stringify({
        model: MODELE,
        messages: [
          { role: "system", content: consigne },
          { role: "user", content: resume }
        ],
        // temperature : le degré de liberté du modèle. Bas = réponses
        // stables et factuelles. Pour un outil de cotation, on veut
        // de la constance, pas de la créativité.
        temperature: 0.3,
        max_tokens: 300
      })
    });

    if (!reponseMistral.ok) {
      // On journalise le détail côté serveur pour pouvoir déboguer...
      const detail = await reponseMistral.text();
      console.error("Erreur Mistral :", reponseMistral.status, detail);

      // ...mais on renvoie un message générique au navigateur.
      // Une réponse d'API peut contenir des informations internes :
      // on ne relaie jamais une erreur brute vers le client.
      return reponse.status(502).json({
        erreur: "Le service d'explication est momentanément indisponible."
      });
    }

    const donnees = await reponseMistral.json();

    /*
      L'API renvoie une liste de réponses possibles ("choices").
      On prend la première.
      L'écriture ?. est l'"optional chaining" : si un maillon de la chaîne
      est absent, on obtient undefined au lieu d'une erreur qui casse tout.
    */
    const explication = donnees.choices?.[0]?.message?.content;

    if (!explication) {
      return reponse.status(502).json({ erreur: "Réponse inattendue du modèle." });
    }

    reponse.json({ explication: explication.trim() });

  } catch (erreur) {
    // Panne réseau, DNS, timeout... tout ce qui empêche même d'atteindre Mistral.
    console.error("Appel Mistral impossible :", erreur);
    reponse.status(502).json({ erreur: "Le service d'explication est injoignable." });
  }
});

app.listen(PORT, () => {
  console.log(`AirCargo Quote démarré sur http://localhost:${PORT}`);
});
