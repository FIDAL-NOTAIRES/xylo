/* ============================================================
   XYLO — moteur de résolution partagé
   ------------------------------------------------------------
   Source unique de vérité pour la détermination du statut d'une
   commune au regard d'un risque. Utilisé par :
   - index.html (interface humaine, via <script src>)
   - api/situation.js (interface machine, via require)

   NE PAS DUPLIQUER cette logique ailleurs : la page et l'API
   doivent répondre exactement la même chose, sans quoi un
   rapport MARTEAU pourrait contredire une feuille XYLO.
   ============================================================ */
(function (racine) {
  "use strict";

  var LIB = {
    total:    { txt: "Département classé en totalité", cl: "carmin" },
    partiel:  { txt: "Commune classée", cl: "carmin" },
    zonage:   { txt: "Commune classée — zonage infra-communal", cl: "carmin" },
    avenir:   { txt: "Classement à venir", cl: "orange" },
    aucun:    { txt: "Hors zone classée", cl: "canard" },
    verifier: { txt: "À vérifier", cl: "gris" }
  };

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  /* code département : 3 caractères en outre-mer, 2 ailleurs */
  function departement(insee) {
    insee = String(insee || "");
    return insee.substring(0, (insee.charAt(0) === "9" && insee.charAt(1) === "7") ? 3 : 2);
  }

  /* Normalisation d'une désignation parcellaire pour comparaison.
     "NL 113", "nl113", "000 NL 0113" -> "NL113" ; avec préfixe de
     section (communes fusionnées) : "302 AB 45" -> "302AB45". */
  function normParcelle(p) {
    var t = String(p || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    var m = t.match(/^(\d{3})?([A-Z]{1,2})0*(\d{1,4})$/);
    if (!m) return t;
    return (m[1] && m[1] !== "000" ? m[1] : "") + m[2] + m[3];
  }

  /* Verdict parcellaire dans une commune en zonage infra-communal.
     Rend "classee" | "hors" | "inconnue" selon la surcharge saisie
     après lecture de l'annexe de l'arrêté. Sans surcharge : inconnue —
     on n'affirme jamais qu'une parcelle est hors zone par défaut. */
  function resolveParcelle(REF, insee, risque, parcelle) {
    var c = REF.com[insee] && REF.com[insee][risque];
    var z = c && c.parcelles;
    var ref = normParcelle(parcelle);
    if (!z || !ref) {
      return { verdict: "inconnue",
        note: "Annexe parcellaire de l'arrêté non dépouillée pour cette commune. Vérification manuelle requise." };
    }
    var dans = (z.classees || []).map(normParcelle).indexOf(ref) >= 0;
    if (dans) {
      return { verdict: "classee",
        note: "Parcelle figurant à l'annexe de l'arrêté" + (z.depouille_le ? " (annexe dépouillée le " + z.depouille_le + ")" : "") + "." };
    }
    if (z.exhaustive) {
      return { verdict: "hors",
        note: "Parcelle absente de l'annexe de l'arrêté, dont la liste a été relevée intégralement" + (z.depouille_le ? " le " + z.depouille_le : "") + "." };
    }
    return { verdict: "inconnue",
      note: "Parcelle absente de la liste partielle relevée : l'annexe n'ayant pas été dépouillée intégralement, l'absence ne vaut pas exclusion." };
  }

  /* Résolution, ordre strict :
     entrée communale positive > arrêté départemental > entrée grise
     explicite > hors zone attesté par exhaustivité > à vérifier. */
  function resolve(REF, insee, risque, aujourdhui) {
    var jour = aujourdhui || todayISO();
    var dep = departement(insee);
    var c = REF.com[insee] && REF.com[insee][risque];
    var d = REF.dep[dep] && REF.dep[dep][risque];
    var e = null;
    if (c && c.statut && c.statut !== "verifier") e = c;
    else if (d && d.statut && d.statut !== "verifier") e = d;
    else if (c || d) e = c || d;

    if (!e) {
      if (REF.meta.exhaustif && REF.meta.exhaustif[risque]) {
        return { statut: "aucun", cl: "canard", txt: LIB.aucun.txt,
          note: "Commune hors des zones classées selon la couche nationale du Cerema.",
          data: { verifie: REF.meta.moisson, source: "cerema" } };
      }
      return { statut: "verifier", cl: "gris", txt: LIB.verifier.txt,
        note: "Aucune donnée contrôlée dans le référentiel. Consulter la cartographie Cerema puis l'arrêté préfectoral.",
        data: {} };
    }
    if (e.statut === "verifier") {
      return { statut: "verifier", cl: "gris", txt: LIB.verifier.txt,
        note: e.note || "Donnée présente mais non arbitrée dans la couche Cerema.", data: e };
    }
    var futur = e.effet && e.effet > jour;
    var key = futur ? "avenir" : e.statut;
    var L = LIB[key] || LIB.verifier;
    var note = e.note || "";
    if (key === "zonage" && !note) {
      note = "Classement infra-communal : seules certaines parcelles sont visées. Lire l'annexe parcellaire de l'arrêté avant de conclure.";
    }
    return { statut: key, cl: L.cl, txt: L.txt, note: note, data: e, futur: !!futur };
  }

  /* fusion d'un référentiel moissonné sous des surcharges manuelles :
     la surcharge garde ses champs, la moisson comble les manquants */
  function integrer(REF, moisson) {
    ["dep", "com"].forEach(function (niv) {
      if (!moisson[niv]) return;
      Object.keys(moisson[niv]).forEach(function (code) {
        if (!REF[niv][code]) REF[niv][code] = {};
        ["termite", "merule"].forEach(function (rq) {
          if (!moisson[niv][code][rq]) return;
          if (!REF[niv][code][rq]) {
            REF[niv][code][rq] = moisson[niv][code][rq];
          } else {
            var man = REF[niv][code][rq], moi = moisson[niv][code][rq];
            Object.keys(moi).forEach(function (k) {
              if (man[k] === undefined || man[k] === null || man[k] === "") man[k] = moi[k];
            });
          }
        });
      });
    });
    if (moisson.meta && moisson.meta.moissonne_le) REF.meta.moisson = moisson.meta.moissonne_le;
    if (moisson.meta && moisson.meta.exhaustif) REF.meta.exhaustif = moisson.meta.exhaustif;
    return REF;
  }

  var API = { LIB: LIB, resolve: resolve, integrer: integrer,
              resolveParcelle: resolveParcelle, normParcelle: normParcelle,
              departement: departement, todayISO: todayISO };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else racine.XyloMoteur = API;
})(typeof self !== "undefined" ? self : this);
