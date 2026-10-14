/*
  AirCargo Quote — vérification d'une extraction
  -----------------------------------------------
  Le modèle de langage lit une demande client en texte libre et propose
  une expédition structurée. Ce fichier vérifie cette proposition avant
  qu'elle n'atteigne le navigateur.

  Règle de base : la réponse du modèle est traitée comme une donnée
  non fiable, au même titre qu'une saisie utilisateur. Le mode JSON de
  l'API garantit une syntaxe valide, pas un contenu valide.

  Toute valeur hors des listes et des bornes attendues devient null.
  Un champ vide est signalé à l'agent ; une valeur fausse passerait
  inaperçue. On préfère donc toujours le vide à l'approximation.

  La fonction est pure : aucun appel réseau, aucune date lue en interne.
  Elle se teste sans clé API et sans serveur.
*/

"use strict";

// Les mêmes tables que celles du navigateur et des tests :
// la liste des aéroports et des types n'est écrite qu'à un seul endroit.
const { AEROPORTS, TYPES_MARCHANDISE } = require("../calcul.js");

// Bornes au-delà desquelles une valeur est considérée comme aberrante.
// Elles ne modélisent pas un avion réel : elles écartent les erreurs
// de lecture grossières (tonnes prises pour des kilos, virgule oubliée).
const POIDS_MAX_KG = 100000;
const VOLUME_MAX_M3 = 1000;

// Une alerte est un court libellé, pas un paragraphe.
const ALERTES_MAX = 5;
const LONGUEUR_ALERTE_MAX = 80;

// L'ordre dans lequel les champs sont présentés à l'agent.
const CHAMPS = ["depart", "arrivee", "poids", "volume", "type", "date"];

/*
  Un code d'aéroport n'est accepté que s'il figure dans notre table.
  toUpperCase() tolère "cdg" ; trim() retire les espaces autour.
*/
function aeroportValide(valeur) {
  if (typeof valeur !== "string") {
    return null;
  }
  const code = valeur.trim().toUpperCase();
  // hasOwnProperty évite qu'une clé héritée comme "toString"
  // soit prise pour un aéroport.
  return Object.prototype.hasOwnProperty.call(AEROPORTS, code) ? code : null;
}

/*
  Un nombre strictement positif et sous une borne maximale.
  Number.isFinite écarte NaN et Infinity. On n'accepte que de vrais
  nombres : le texte "800 kg" n'est pas converti, il est refusé.
*/
function nombreValide(valeur, maximum) {
  if (typeof valeur !== "number" || !Number.isFinite(valeur)) {
    return null;
  }
  return valeur > 0 && valeur <= maximum ? valeur : null;
}

function typeValide(valeur) {
  if (typeof valeur !== "string") {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(TYPES_MARCHANDISE, valeur) ? valeur : null;
}

/*
  Une date au format AAAA-MM-JJ, existante, et pas dans le passé.

  Comparer deux dates au format AAAA-MM-JJ comme du texte fonctionne :
  l'ordre alphabétique et l'ordre chronologique sont les mêmes.

  Le contrôle d'existence écarte un "2026-02-31" : JavaScript le
  convertirait silencieusement en 3 mars. On reformate la date
  obtenue et on vérifie qu'on retrouve exactement le texte de départ.
*/
function dateValide(valeur, aujourdhui) {
  if (typeof valeur !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
    return null;
  }
  const date = new Date(valeur + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== valeur) {
    return null;
  }
  return valeur >= aujourdhui ? valeur : null;
}

/*
  Les alertes : une liste de courts textes signalant une marchandise
  potentiellement dangereuse (batteries lithium, aérosols, produits
  chimiques...). On ne garde que du texte non vide, raccourci, en
  nombre limité.
*/
function alertesValides(valeur) {
  if (!Array.isArray(valeur)) {
    return [];
  }
  return valeur
    .filter((alerte) => typeof alerte === "string" && alerte.trim() !== "")
    .map((alerte) => alerte.trim().slice(0, LONGUEUR_ALERTE_MAX))
    .slice(0, ALERTES_MAX);
}

/*
  Vérifie la proposition brute du modèle.

  Paramètres :
    - brut       : l'objet renvoyé par le modèle, quel qu'il soit
    - aujourdhui : la date du jour au format AAAA-MM-JJ, fournie par
                   l'appelant pour que la fonction reste pure

  Renvoie :
    - champs    : les six valeurs du formulaire, ou null si absentes
    - manquants : la liste des champs restés vides, à compléter par l'agent
    - alertes   : les marchandises dangereuses repérées
*/
function normaliserExtraction(brut, aujourdhui) {
  // Si le modèle n'a pas renvoyé un objet, on repart d'un objet vide :
  // tous les champs seront signalés comme manquants.
  const source = brut !== null && typeof brut === "object" && !Array.isArray(brut) ? brut : {};

  const champs = {
    depart:  aeroportValide(source.depart),
    arrivee: aeroportValide(source.arrivee),
    poids:   nombreValide(source.poids, POIDS_MAX_KG),
    volume:  nombreValide(source.volume, VOLUME_MAX_M3),
    type:    typeValide(source.type),
    date:    dateValide(source.date, aujourdhui)
  };

  const alertes = alertesValides(source.alertes);

  /*
    Règle de prudence : dès qu'une alerte est levée, la marchandise est
    classée dangereuse, quoi qu'ait proposé le modèle pour le type.
    Si l'alerte est infondée, l'agent rétrograde le type en un clic.
    L'erreur inverse, une marchandise dangereuse cotée en standard,
    serait bien plus coûteuse.
  */
  if (alertes.length > 0) {
    champs.type = "dangereuse";
  }

  const manquants = CHAMPS.filter((nom) => champs[nom] === null);

  return { champs, manquants, alertes };
}

module.exports = { normaliserExtraction, CHAMPS, POIDS_MAX_KG, VOLUME_MAX_M3 };
