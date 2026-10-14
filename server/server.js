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
  Envoie une conversation à Mistral et renvoie le texte de la réponse.
  Les deux routes qui utilisent le modèle (explication et extraction)
  passent par cette fonction : la clé, l'adresse et la gestion des
  erreurs ne sont écrites qu'une fois.

  options :
    - temperature : degré de liberté du modèle
    - maxTokens   : longueur maximale de la réponse
    - formatJson  : si vrai, on demande à Mistral une réponse en JSON valide

  En cas de problème (réseau coupé, erreur de l'API, réponse vide),
  la fonction lance une erreur avec "throw". C'est la route appelante
  qui l'attrape dans son try / catch et décide quoi répondre.
*/
async function appelerMistral(messages, options) {
  const corps = {
    model: MODELE,
    messages: messages,
    temperature: options.temperature,
    max_tokens: options.maxTokens
  };

  if (options.formatJson) {
    // Mode JSON de l'API : la réponse est garantie être du JSON valide.
    // Son CONTENU, lui, n'est garanti par rien : il faudra le vérifier.
    corps.response_format = { type: "json_object" };
  }

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
    body: JSON.stringify(corps)
  });

  if (!reponseMistral.ok) {
    const detail = await reponseMistral.text();
    throw new Error(`Mistral a répondu ${reponseMistral.status} : ${detail}`);
  }

  const donnees = await reponseMistral.json();

  /*
    L'API renvoie une liste de réponses possibles ("choices").
    On prend la première.
    L'écriture ?. est l'"optional chaining" : si un maillon de la chaîne
    est absent, on obtient undefined au lieu d'une erreur qui casse tout.
  */
  const contenu = donnees.choices?.[0]?.message?.content;

  if (!contenu) {
    throw new Error("Réponse de Mistral sans contenu.");
  }

  return contenu;
}

/*
  Route de santé : permet à la page de savoir si le serveur tourne.
  Sans serveur (page ouverte depuis GitHub Pages ou en double-clic),
  l'appel échoue et la page désactive le bouton d'explication.
*/
app.get("/api/sante", (requete, reponse) => {
  reponse.json({ ok: true });
});

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
  // Le front envoie désormais { cotation, langue }.
  const cotation = requete.body?.cotation;
  const langue = requete.body?.langue === "en" ? "en" : "fr"; // "fr" par défaut

  // --- Validation ---
  // On ne fait jamais confiance aux données reçues, même venant de notre
  // propre front : n'importe qui peut envoyer une requête à cette adresse.
  // La langue est ramenée à l'une des deux valeurs attendues plutôt que
  // reprise telle quelle : une valeur libre venue du client n'a rien à
  // faire dans un prompt.
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

    Une consigne par langue, écrite directement dans la langue cible.
    Traduire la consigne française mot à mot donnerait un anglais maladroit ;
    et demander "réponds en anglais" à la fin d'une consigne française
    fonctionne mal, le modèle glissant facilement vers le français.
  */
  const CONSIGNES = {
    fr:
      "Tu es un assistant commercial spécialisé en fret aérien. " +
      "On te fournit le détail chiffré d'une cotation déjà calculée. " +
      "Explique en français simple, à un client non spécialiste, pourquoi ce prix est ce qu'il est. " +
      "Ne recalcule aucun montant : reprends uniquement les chiffres fournis. " +
      "Trois à cinq phrases, pas de liste à puces, pas de formule de politesse.",

    en:
      "You are a sales assistant specialised in air freight. " +
      "You are given the itemised breakdown of a quotation that has already been calculated. " +
      "Explain in plain English, to a non-specialist customer, why the price is what it is. " +
      "Do not recalculate any amount: use only the figures provided. " +
      "Three to five sentences, no bullet points, no greetings or sign-off."
  };

  const consigne = CONSIGNES[langue];

  try {
    const explication = await appelerMistral(
      [
        { role: "system", content: consigne },
        { role: "user", content: resume }
      ],
      // temperature : le degré de liberté du modèle. Bas = réponses
      // stables et factuelles. Pour un outil de cotation, on veut
      // de la constance, pas de la créativité.
      { temperature: 0.3, maxTokens: 300 }
    );

    reponse.json({ explication: explication.trim() });

  } catch (erreur) {
    // Le détail est journalisé côté serveur, le navigateur ne reçoit
    // qu'un message générique : une réponse d'API peut contenir des
    // informations internes qu'on ne relaie jamais au client.
    console.error("Explication impossible :", erreur.message);
    reponse.status(502).json({
      erreur: "Le service d'explication est momentanément indisponible."
    });
  }
});

app.listen(PORT, () => {
  console.log(`AirCargo Quote démarré sur http://localhost:${PORT}`);
});
