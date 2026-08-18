# AirCargo Quote

Outil de cotation de fret aérien. Saisie d'une expédition, calcul du prix
selon les règles tarifaires du secteur, affichage du détail poste par poste,
historique des cotations, et explication du prix en langage naturel.

HTML, CSS et JavaScript natifs côté navigateur. Une seule dépendance côté
serveur : Express.

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

### Démarrage

```bash
cd server
npm start
```

Puis ouvrir `http://localhost:3000`.

Le serveur sert également les fichiers du front. Ouvrir `index.html`
directement dans le navigateur fonctionne pour la partie cotation, mais
l'explication par IA nécessite le serveur.

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
Navigateur                    Serveur Node                 Mistral
──────────                    ────────────                 ───────
index.html                    server.js
style.css      ── POST ──►    /api/expliquer  ── clé ──►    API
script.js         JSON
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
Mistral. La clé est lue depuis une variable d'environnement, dans un fichier
`.env` exclu du dépôt, et ne quitte jamais la machine serveur.

Le serveur porte aussi ce qu'un client ne peut pas garantir :

- **la validation des entrées** — tout contrôle côté navigateur est
  contournable ; seul le serveur fait autorité
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

## Choix techniques

**Séparation du calcul et de l'affichage.** `calculerCotation()` reçoit des
données et renvoie des données, sans jamais toucher au DOM. La fonction est
pure : l'identifiant et l'horodatage sont ajoutés après l'appel, pour qu'une
même expédition produise toujours le même résultat et reste testable.

Le bénéfice s'est concrétisé à l'étape de l'historique : consulter une
cotation stockée réutilise `afficherCotation()` sans une ligne d'adaptation,
la fonction ignorant si les données viennent d'un calcul ou du stockage.

**Une cotation renvoyée en détail, pas en total.** Toutes les valeurs
intermédiaires sont conservées. Une cotation doit être auditable : un
commercial doit pouvoir justifier chaque euro devant un client. Le tableau
affiche d'ailleurs la formule appliquée à chaque ligne, pas seulement le
montant.

**Source unique de vérité.** Les aéroports et les types de marchandise sont
définis une seule fois en JavaScript ; les listes déroulantes du formulaire
sont générées à partir de ces tables. Ajouter un type de marchandise se
réduit à une ligne de données.

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

**Aucune police externe.** La pile de polices système évite une requête
réseau et le saut de texte au chargement.

## Limites connues et pistes d'amélioration

- **Aucun test automatisé.** `calculerCotation()` a été écrite pure
  précisément pour être testable ; les tests restent à écrire.
- **Pas de limitation de débit sur l'API.** Le point d'entrée
  `/api/expliquer` peut être appelé sans restriction. Une mise en ligne
  imposerait une limitation par adresse IP.
- **Historique local au navigateur.** `localStorage` est propre à une
  machine et à un navigateur. Un usage réel demanderait une base de données
  et une authentification.
- **Distances en dur.** Une table de valeurs pré-calculées et arrondies.
  Stocker les coordonnées des aéroports et calculer la distance
  orthodromique (formule de Haversine) serait plus juste et plus extensible.
- **Calcul de dates simplifié.** La comparaison de dates ignore les fuseaux
  horaires. En production, ce calcul se ferait côté serveur.
- **Confirmation native.** Le vidage de l'historique utilise `confirm()`,
  qui bloque la page et ne peut pas être stylé. Une fenêtre modale maison
  serait préférable.
- **Tarifs fictifs.** Les coefficients sont inventés, calibrés pour donner
  des ordres de grandeur crédibles. Une vraie grille tarifaire viendrait
  d'une source externe.

## Feuille de route

- [x] Formulaire de saisie et moteur de calcul
- [x] Affichage détaillé de la décomposition du prix
- [x] Mise en forme
- [x] Historique des cotations (localStorage)
- [x] Explication du prix en langage naturel via l'API Mistral
- [ ] Tests unitaires sur le moteur de calcul
- [ ] Limitation de débit sur le point d'entrée d'explication
