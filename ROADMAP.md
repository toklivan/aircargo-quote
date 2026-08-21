# Feuille de route — vers la v2.0.0

Version actuelle : **1.3.0**

Ce document décrit la trajectoire de l'outil et la méthode retenue pour
l'emprunter sans jamais livrer une version cassée.

---

## La thèse

> **La v1 chiffre une expédition. La v2 gère un dossier qui se dispute une
> ressource rare.**

En v1, le prix ne dépend que de l'expédition : un barème appliqué à un poids
et une distance. Dans la réalité du fret aérien, le prix dépend surtout de
**ce qu'il reste dans l'avion**.

Un appareil a deux limites simultanées : une charge marchande (de l'ordre de
65 tonnes sur un A330F) et un volume de soute. Les deux se remplissent à des
rythmes différents selon le fret chargé, et **c'est la contrainte qui sature
en premier qui doit piloter le prix**. Si un vol est plein en volume alors
qu'il reste douze tonnes de charge disponible, une expédition dense devient
très rentable et une expédition légère n'a plus sa place à aucun prix.

La v2 fait passer l'outil d'un barème à un modèle de *yield management*, et
d'un calcul isolé à un dossier qui traverse les quatre étapes du métier :
**pricing → cotation → booking → tracking**.

---

## La méthode

Quatre principes gouvernent chaque incrément. Aucune version intermédiaire
ne doit être inutilisable.

### 1. Chaque version mineure est livrable

Une version mineure qui ne peut pas être mise entre les mains d'un
utilisateur n'est pas une version, c'est un chantier. Chaque étape ci-dessous
apporte une valeur autonome et laisse l'outil dans un état cohérent.

### 2. Feature flags plutôt que sections « en construction »

Le code d'une fonctionnalité en cours est versionné, testé, mais désactivé
par un interrupteur unique :

```javascript
const FONCTIONNALITES = {
  margeInterne: true,
  capaciteVols: false,   // v1.5 — code présent, pas encore activé
  assistantSaisie: false // v1.9
};
```

Deux bénéfices. L'interface ne montre jamais rien d'inachevé — un bloc vide
signale l'abandon, pas l'ambition. Et le travail en cours est intégré à
`main` en continu, ce qui évite les branches longues qui divergent et
deviennent impossibles à fusionner.

### 3. Expand / contract pour toute évolution de données

On n'écrase jamais une structure existante. On **ajoute** le nouveau champ,
on fait cohabiter les deux, on migre, puis seulement on **retire** l'ancien.

Appliqué au stockage : la v1.8 introduit la persistance serveur sans
supprimer le `localStorage`. Les deux coexistent derrière une même interface,
le serveur devient la source de vérité, et le stockage local n'est retiré
qu'en v2.0 — quand plus rien n'en dépend. C'est le *strangler fig* : le
nouveau système enserre l'ancien avant de le remplacer.

### 4. Les tests sont le filet, pas la formalité

Chaque incrément ajoute ses tests **avant** d'activer son flag. La suite
existante ne doit jamais passer au rouge : c'est elle qui garantit qu'un
changement de modèle tarifaire n'a pas silencieusement modifié une cotation
déjà émise.

### Discipline de version

`MAJEUR.MINEUR.CORRECTIF`. Le majeur ne change que si le contrat de l'outil
change — ici, quand l'authentification devient obligatoire et que les données
locales disparaissent. Chaque livraison est marquée :

```bash
git tag -a v1.4.0 -m "Marge interne et cloisonnement des donnees"
git push --tags
```

---

## Les étapes

### v1.4.0 — Marge et cloisonnement interne

**Ce que ça apporte.** Un modèle de coût de revient (capacité, manutention,
traitement documentaire) et, en regard du prix, la marge en euros et en
pourcentage. Un simulateur de remise : l'agent saisit la remise demandée par
le client, la marge se recalcule en direct, une alerte se déclenche sous le
plancher défini.

**Pourquoi en premier.** C'est le geste qui lève l'ambiguïté sur la nature de
l'outil. Une application qui affiche sa propre marge ne peut pas être
destinée au client. La frontière interne / externe devient explicite et se
matérialise en trois endroits :

| Support | Traitement de la marge |
|---|---|
| Écran | affichée |
| Devis imprimé | masquée (`@media print`) |
| Appel au modèle de langage | **non transmise** |

Le troisième point relève de la **minimisation des données** : une fonction
`versionClient(cotation)` retire les champs internes avant tout envoi
extérieur. Non par défiance envers le prestataire, mais parce qu'une donnée
dont la tâche n'a pas besoin n'a aucune raison de sortir du système. Un test
vérifie qu'aucun champ interne ne fuit.

**Rétrocompatibilité.** Aucun champ existant n'est modifié. Les cotations
déjà enregistrées s'affichent sans marge.

---

### v1.5.0 — Le référentiel des vols

**Ce que ça apporte.** Une table de vols : numéro, appareil, capacité en
charge marchande et en volume, taux de remplissage courant. L'écran affiche
la capacité résiduelle sur la liaison et la date demandées.

**Ce que ça n'apporte pas encore.** Le prix ne change pas. C'est délibéré :
c'est la phase *expand*. La donnée existe, elle est visible, mais aucun
comportement n'en dépend. On valide le modèle avant de s'appuyer dessus.

**Rétrocompatibilité.** Totale — ajout pur.

---

### v1.6.0 — Le prix suit le remplissage

**Ce que ça apporte.** Le cœur métier de la v2. `calculerCotation()` accepte
un second argument optionnel, le vol :

```javascript
function calculerCotation(expedition, vol) {
  // Sans vol fourni, le coefficient vaut 1 :
  // le comportement de la v1 est strictement préservé.
  const coefficient = vol ? coefficientRemplissage(vol, expedition) : 1;
  ...
}
```

Le coefficient dépend du taux de remplissage, du délai avant départ, et
surtout de **la contrainte qui sature en premier** : une expédition dense sur
un vol saturé en volume est valorisée différemment d'une expédition
volumineuse sur un vol saturé en masse.

**Pourquoi un paramètre optionnel.** La fonction reste pure et les quinze
tests existants continuent de passer sans modification — ils appellent la
fonction sans vol et obtiennent exactement les mêmes montants. Les nouveaux
tests couvrent le second chemin. Aucune régression possible sur les cotations
déjà émises.

---

### v1.7.0 — Le cycle de vie du dossier

**Ce que ça apporte.** Une cotation cesse d'être un objet mort. Elle acquiert
un statut et un historique horodaté :

```
cotation → acceptée → réservée (LTA émise) → en vol → livrée
                   ↘ expirée      ↘ annulée
```

Les transitions sont contrôlées : on ne réserve pas une cotation expirée, on
n'annule pas une expédition livrée. Le numéro de LTA est généré à la
réservation et devient la référence de suivi.

**Traitement technique.** Une machine à états, écrite comme une fonction pure
(`transitionAutorisee(statutActuel, action)`), donc entièrement testable sans
interface ni stockage. Les quatre mots de l'annonce — pricing, cotation,
booking, tracking — deviennent un parcours continu dans l'outil.

**Rétrocompatibilité.** Les cotations existantes prennent le statut
« cotation » par défaut.

---

### v1.8.0 — La persistance serveur

**Ce que ça apporte.** Une base SQLite et une API REST. Trois tables : vols,
cotations, événements de statut. Le `localStorage` cesse d'être la source de
vérité.

**Pourquoi maintenant et pas plus tôt.** Parce que le métier l'exige enfin.
Un dossier qui traverse plusieurs statuts et une capacité partagée entre
plusieurs agents ne peuvent pas vivre dans le navigateur d'une seule
personne. La base n'arrive pas comme un exercice technique, elle arrive comme
une conséquence.

**Traitement technique.** Une interface de stockage unique
(`sauvegarder`, `charger`, `supprimer`) avec deux implémentations : locale et
serveur. Le reste du code ne sait pas laquelle est active. Les données
locales existantes sont migrées au premier démarrage. C'est le cœur du
*strangler fig* — et l'étape qui rend la v2.0 possible sans réécriture.

---

### v1.9.0 — L'assistant de saisie

**Ce que ça apporte.** Le retournement de l'usage de l'IA. En v1, le modèle
intervient **à la fin**, une fois le travail fait, pour rédiger un texte que
l'agent aurait pu écrire lui-même. En v1.9, il intervient **au début**, là où
le temps se perd réellement.

Une demande arrive en texte libre, par mail :

> « Bonjour, 3 palettes pour Hong Kong semaine prochaine, environ 800 kg,
> dont une avec des batteries lithium. »

L'agent colle ce texte. Le modèle propose une expédition structurée — trajet,
poids, volume estimé — et **lève un signalement DGR sur les batteries**.
L'agent valide ou corrige avant tout calcul.

**Le principe qui compte.** Le modèle ne décide rien et ne déclenche rien : il
prépare une saisie, un humain valide. Le gain de temps est mesurable, à la
différence d'un texte explicatif. C'est ce qu'on appelle une solution
agentique correctement bornée.

---

### v2.0.0 — Multi-utilisateur

**Pourquoi c'est un changement majeur.** Les versions précédentes ajoutaient.
Celle-ci retire : le mode local disparaît, l'authentification devient
obligatoire, l'outil ne fonctionne plus sans serveur. Le contrat change, donc
le numéro majeur change.

**Ce que ça apporte.**

- **Comptes et rôles** — un agent cote et réserve, un responsable pricing
  ajuste les grilles et accorde les remises exceptionnelles. La question
  « qui a émis cette LTA ? » trouve une réponse.
- **Verrouillage de la capacité** — deux agents ne peuvent pas vendre les
  mêmes douze tonnes. Une réservation décrémente la capacité du vol dans une
  transaction ; en cas de concurrence, le second reçoit une erreur explicite
  plutôt qu'une surréservation silencieuse. C'est le problème classique de la
  concurrence d'accès, et il est ici parfaitement concret.
- **Conteneurisation** — un `Dockerfile` et un `docker-compose.yml` pour que
  l'application et sa base démarrent d'une seule commande, à l'identique sur
  n'importe quelle machine.
- **Retrait du `localStorage`** — plus rien n'en dépend depuis la v1.8. C'est
  la phase *contract* : on supprime l'ancien chemin une fois qu'il est
  devenu inutile, pas avant.

---

## Ce qui reste hors périmètre

Volontairement, et il est utile de savoir dire pourquoi :

- **Les tarifs réels.** Les coefficients resteront fictifs : une vraie grille
  relève d'une source de données propriétaire.
- **L'intégration aux systèmes de réservation IATA.** Hors de portée d'un
  projet personnel, et sans valeur démonstrative supplémentaire.
- **Le portail client.** L'outil est interne. Un espace client serait une
  application distincte, avec des enjeux d'authentification et d'exposition
  entièrement différents.

---

## Récapitulatif

| Version | Apport | Compétence démontrée |
|---|---|---|
| 1.4.0 | Marge, remise, cloisonnement | Modélisation, minimisation des données |
| 1.5.0 | Référentiel des vols | Modélisation de données |
| 1.6.0 | Prix selon remplissage | Algorithmique, yield management |
| 1.7.0 | Cycle de vie du dossier | Machine à états, tests |
| 1.8.0 | Base de données et API | SQL, REST, migration progressive |
| 1.9.0 | Assistant de saisie | Solutions agentiques bornées |
| 2.0.0 | Multi-utilisateur, Docker | Authentification, concurrence, conteneurs |
