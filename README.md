# AirCargo Quote

![Tests](https://github.com/toklivan/aircargo-quote/actions/workflows/tests.yml/badge.svg)

Outil de cotation de fret aérien : saisie d'une expédition, calcul du prix
selon les règles tarifaires du secteur, décomposition auditable poste par
poste, historique, devis imprimable et explication du prix en langage
naturel. Interface disponible en français et en anglais.

HTML, CSS et JavaScript natifs côté navigateur. Une seule dépendance côté
serveur : Express.

## Sommaire

- [Lancer le projet](#lancer-le-projet)
- [Fonctionnalités](#fonctionnalités)
- [Les règles de calcul](#les-règles-de-calcul)
- [Architecture](#architecture)
- [Tests et intégration continue](#tests-et-intégration-continue)
- [Choix techniques](#choix-techniques)
- [Limites connues](#limites-connues-et-pistes-daméliorations)

## Lancer le projet

### Prérequis

- Node.js 20.6 ou supérieur (l'option `--env-file` est utilisée pour charger
  la configuration)
- Une clé API Mistral, obtenue sur `console.mistral.ai`

### Installation

```bash
cd server
npm install
cp .env.example .env
```

Ouvrir `server/.env` et y coller la clé API :

```
MISTRAL_API_KEY=votre_cle
```

Le fichier `.env` est exclu du dépôt par `.gitignore` : il ne doit jamais
être commité. Le fichier `.env.example`, lui, est versionné et documente les
variables attendues sans contenir de secret.

### Démarrage

```bash
cd server
npm start
```

Puis ouvrir `http://localhost:3000`.

Le serveur sert également les fichiers du front. Ouvrir `index.html`
directement dans le navigateur fonctionne pour la cotation, l'historique et
le devis, mais l'explication par IA nécessite le serveur.

### Tests

```bash
npm test          # depuis la racine du projet
```

## Fonctionnalités

- **Cotation** — saisie d'une expédition (trajet, poids, volume, type de
  marchandise, date) et calcul du prix.
- **Décomposition auditable** — chaque ligne affiche la base de calcul
  appliquée, pas seulement le montant.
- **Historique** — les cotations sont conservées d'une session à l'autre,
  consultables, supprimables individuellement ou en bloc.
- **Devis imprimable** — génération d'un document avec référence, date
  d'émission, durée de validité et mentions, exportable en PDF via
  l'impression du navigateur.
- **Explication en langage naturel** — la cotation est reformulée par un
  modèle de langage à destination d'un client non spécialiste.
- **Bilingue français / anglais** — interface, formats de nombres et de
  dates, devis imprimé et explication IA.

## Les règles de calcul

### Poids taxable

Le fret aérien ne se facture pas au poids réel mais au **poids taxable** :
le plus élevé entre le poids réel et le poids volumétrique. Un avion vend
du volume autant que de la masse — un carton de plumes occupe la place d'une
palette dense.

La conversion applique le ratio IATA standard : **1 m³ = 167 kg**.

```
poids taxable = max(poids réel, volume × 167)
```

### Tarif au kilo

Le tarif combine une part fixe et une part proportionnelle à la distance :

```
tarif = 0,80 € + (distance en km × 0,00040)
```

Une progression continue plutôt que par paliers : un palier créerait des
sauts de prix injustifiables sur quelques kilomètres d'écart.

### Majorations

Appliquées en pourcentage du prix de transport, car le surcoût de traitement
est proportionnel au volume de l'expédition.

| Type de marchandise | Majoration |
|---|---|
| Standard | — |
| Fragile | +15 % |
| Périssable | +20 % |
| Dangereuse (DGR) | +40 % |

Une expédition à moins de 5 jours entraîne une majoration urgence de +25 %.

Les frais de dossier (45 €) sont un montant fixe : ouvrir un dossier coûte
le même prix quel que soit le tonnage.

## Architecture

```
aircargo-quote/
├── index.html              structure de la page
├── style.css               mise en forme, dont la feuille d'impression
├── calcul.js               moteur de cotation — aucun accès au DOM
├── traductions.js          dictionnaire FR/EN et fonction t()
├── script.js               interface : affichage, historique, appels réseau
├── package.json            script de test
├── tests/
│   └── calcul.test.js      15 tests unitaires du moteur
├── .github/workflows/
│   └── tests.yml           exécution des tests à chaque push et PR
└── server/
    ├── server.js           proxy vers l'API Mistral
    ├── package.json        dépendance Express
    └── .env.example        modèle de configuration
```

```
Navigateur                    Serveur Node                 Mistral
──────────                    ────────────                 ───────
calcul.js                     server.js
traductions.js  ── POST ──►   /api/expliquer  ── clé ──►    API
script.js          JSON
  │
  └── calcul du prix (100 % client, aucun secret en jeu)
```

### Pourquoi un serveur

Le calcul de prix tourne entièrement dans le navigateur : il ne manipule
aucune donnée sensible. L'explication par IA, elle, nécessite une clé API.

Une clé API ne peut pas vivre côté client. Tout ce qui est envoyé au
navigateur est lisible par l'utilisateur — code source, onglet Réseau des
outils de développement, en-têtes de requête compris. Il n'existe aucun
moyen de dissimuler un secret dans du code client : c'est structurel, pas
une question de technique. Sur un dépôt public, une clé exposée est de plus
collectée en quelques minutes par des robots qui scannent les commits.

D'où l'inversion : le navigateur appelle le serveur, et le serveur appelle
Mistral. La clé est lue depuis une variable d'environnement et ne quitte
jamais la machine serveur.

Le serveur porte aussi ce qu'un client ne peut pas garantir :

- **la validation des entrées** — tout contrôle côté navigateur est
  contournable ; seul le serveur fait autorité. La langue reçue est ainsi
  ramenée à l'une des deux valeurs attendues plutôt que reprise telle
  quelle : une chaîne libre venue du client n'a rien à faire dans un prompt.
- **le cloisonnement des erreurs** — les réponses d'erreur de Mistral sont
  journalisées côté serveur mais jamais relayées au navigateur, pour ne pas
  exposer d'informations internes
- **un point unique** où brancher plus tard une limitation de débit

Le serveur sert également les fichiers statiques. Front et API partagent
ainsi la même origine, ce qui évite toute configuration CORS.

### Le prompt

Le modèle reçoit des montants **déjà calculés** et n'a pour tâche que de les
mettre en mots. La consigne système lui interdit explicitement de recalculer
quoi que ce soit : un modèle de langage est peu fiable en arithmétique, et un
outil de pricing qui afficherait deux totaux différents perdrait toute
crédibilité. La logique tarifaire reste dans le JavaScript, testable et
auditable.

Une consigne distincte est rédigée pour chaque langue, directement dans la
langue cible. Traduire la consigne française donnerait un anglais maladroit,
et une instruction de langue ajoutée en fin de prompt français est peu
fiable — le modèle glisse vers le français.

## Tests et intégration continue

Quinze tests unitaires couvrent le moteur de cotation, exécutés avec le
module de test intégré à Node (`node:test`) : aucune dépendance de test à
installer.

Ils vérifient notamment la bascule entre poids réel et poids volumétrique,
la valeur exacte du seuil d'urgence — là où se logent les erreurs de
comparaison — et la cohérence entre la somme des lignes affichées et le
total facturé.

Les dates de test sont toujours relatives à la date d'exécution. Une date en
dur produirait un test fragile, qui finirait par échouer un jour sans qu'un
seul changement de code en soit la cause.

Un workflow GitHub Actions exécute la suite à chaque push et à chaque pull
request sur `main`.

## Choix techniques

**Séparation du calcul et de l'affichage.** `calcul.js` ne contient pas un
seul accès au DOM. Il fonctionne donc à l'identique dans le navigateur et
sous Node — ce qui rend les tests possibles sans environnement simulé. La
séparation n'est pas une intention affichée : elle est vérifiée à chaque
exécution des tests.

`calculerCotation()` est de plus une fonction pure : l'identifiant et
l'horodatage sont ajoutés après l'appel, pour qu'une même expédition
produise toujours le même résultat.

Le bénéfice s'est concrétisé à deux reprises : consulter une cotation
stockée réutilise `afficherCotation()` sans une ligne d'adaptation, et le
changement de langue redessine l'affichage sans recalculer quoi que ce soit.

**Une cotation renvoyée en détail, pas en total.** Toutes les valeurs
intermédiaires sont conservées. Une cotation doit être auditable : un
commercial doit pouvoir justifier chaque euro devant un client. Le tableau
affiche la base de calcul de chaque ligne, pas seulement le montant.

**Source unique de vérité.** Aéroports et types de marchandise sont définis
une seule fois ; les listes déroulantes sont générées à partir de ces tables.
Le même principe gouverne les traductions : un dictionnaire et une seule page
HTML, plutôt qu'une page dupliquée par langue qui divergerait à la première
correction.

**Internationalisation, pas seulement traduction.** Les formats suivent la
langue — `1 553,77 €` devient `€1,553.77` — ainsi que les dates et la langue
de l'explication IA. Les textes à variables utilisent des trous nommés
(`{poids} kg × {tarif}/kg`) plutôt qu'une concaténation, l'ordre des mots
changeant d'une langue à l'autre.

**`textContent` plutôt que `innerHTML`.** `innerHTML` interprète la chaîne
comme du HTML et exposerait l'application à une injection de code (XSS).
Le point devient critique pour la réponse du modèle, contenu externe non
contrôlé. La structure est construite avec `createElement()`, le contenu
inséré en texte brut.

**Délégation d'événements.** Un seul écouteur de clic sur la liste de
l'historique, au lieu d'un par bouton. Fonctionne pour les lignes créées
après coup et reste léger quel que soit le nombre de cotations.

**Gestion des états de chargement.** Le bouton d'explication est désactivé
pendant l'appel et réactivé dans un bloc `finally`, donc y compris en cas
d'erreur. Sans cela, un échec réseau laisserait le bouton inutilisable.

**Impression native.** Le devis est produit par une feuille de style
`@media print` et `window.print()`. Aucune bibliothèque de génération de PDF,
et le rendu final est celui que l'utilisateur voit dans l'aperçu.

**Aucune police externe.** La pile de polices système évite une requête
réseau et le saut de texte au chargement.

## Limites connues et pistes d'améliorations

- **Pas de limitation de débit sur l'API.** Le point d'entrée
  `/api/expliquer` peut être appelé sans restriction. Une mise en ligne
  imposerait une limitation par adresse IP.
- **Historique local au navigateur.** `localStorage` est propre à une
  machine et à un navigateur. Un usage réel demanderait une base de données
  et une authentification.
- **Pas de booking ni de tracking.** Le périmètre s'arrête à la cotation.
  Transformer un devis en réservation, avec numéro de LTA et suivi de statut,
  serait la suite logique — et imposerait la persistance serveur.
- **Distances en dur.** Une table de valeurs pré-calculées et arrondies.
  Stocker les coordonnées des aéroports et calculer la distance
  orthodromique (formule de Haversine) serait plus juste et plus extensible.
- **Calcul de dates simplifié.** La comparaison de dates ignore les fuseaux
  horaires. En production, ce calcul se ferait côté serveur.
- **PDF généré par le navigateur.** Le rendu peut varier légèrement d'un
  navigateur à l'autre et le document n'est pas archivé. Une génération
  serveur serait préférable pour un usage contractuel.
- **Modules par balises `<script>`.** Les fichiers communiquent par des
  variables globales, avec un export conditionnel pour Node. Les modules ES
  (`import` / `export`) seraient le choix moderne.
- **Confirmation native.** Le vidage de l'historique utilise `confirm()`,
  qui bloque la page et ne peut pas être stylé.
- **Tarifs fictifs.** Les coefficients sont inventés, calibrés pour donner
  des ordres de grandeur crédibles. Une vraie grille tarifaire viendrait
  d'une source externe.

## Feuille de route

- [x] Formulaire de saisie et moteur de calcul
- [x] Affichage détaillé de la décomposition du prix
- [x] Mise en forme
- [x] Historique des cotations (localStorage)
- [x] Explication du prix en langage naturel via l'API Mistral
- [x] Tests unitaires et intégration continue
- [x] Devis imprimable
- [x] Interface bilingue français / anglais
- [ ] Limitation de débit sur le point d'entrée d'explication
- [ ] Booking : transformation d'un devis en réservation
