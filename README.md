# AirCargo Quote

![Tests](https://github.com/toklivan/aircargo-quote/actions/workflows/tests.yml/badge.svg)

Outil de cotation de fret aérien. Saisie d'une expédition, calcul du prix
selon les règles tarifaires du secteur, et affichage du détail poste par poste.

Projet réalisé en HTML, CSS et JavaScript natifs, sans framework ni dépendance.

## Lancer le projet

Ouvrir `index.html` dans un navigateur. Aucune installation requise.

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

Les distances entre aéroports sont stockées dans une table (`DISTANCES`),
en ne conservant qu'un sens par liaison.

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

## Choix techniques

**Séparation du calcul et de l'affichage.** `calculerCotation()` reçoit des
données et renvoie des données, sans jamais toucher au DOM. La logique de
pricing pourrait être déplacée telle quelle côté serveur, ou testée
isolément, sans réécriture.

**Une cotation renvoyée en détail, pas en total.** La fonction retourne
toutes les valeurs intermédiaires. Une cotation doit être auditable : un
commercial doit pouvoir justifier chaque euro devant un client.

**`textContent` plutôt que `innerHTML`.** `innerHTML` interprète la chaîne
comme du HTML et exposerait l'application à une injection de code (XSS)
dès lors que le contenu vient d'un utilisateur ou d'une API. Le contenu
dynamique est inséré en texte brut, et la structure construite avec
`createElement()`.

**Aucune police externe.** La pile de polices système évite une requête
réseau et le saut de texte au chargement.

## Limites connues et pistes d'amélioration

- **Double source de vérité.** La liste des aéroports et des types de
  marchandise est écrite à la fois dans le HTML et dans le JavaScript.
  Ajouter un type impose de modifier deux fichiers. Les `<option>`
  devraient être générées depuis les données JavaScript.
- **Distances en dur.** Une table de distances pré-calculées et arrondies.
  Stocker les coordonnées des aéroports et calculer la distance
  orthodromique (formule de Haversine) serait plus juste et plus extensible.
- **Calcul de dates simplifié.** La comparaison de dates ignore les fuseaux
  horaires. En production, ce calcul se ferait côté serveur.
- **Tarifs fictifs.** Les coefficients sont inventés, calibrés pour donner
  des ordres de grandeur crédibles. Une vraie grille tarifaire viendrait
  d'une source externe.

## Feuille de route

- [x] Formulaire de saisie et moteur de calcul
- [x] Affichage détaillé de la décomposition du prix
- [x] Mise en forme
- [ ] Historique des cotations (localStorage)
- [ ] Explication du prix en langage naturel via l'API Mistral
