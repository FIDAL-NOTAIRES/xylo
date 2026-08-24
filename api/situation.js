/* ============================================================
   XYLO — /api/situation
   ------------------------------------------------------------
   Interface machine, destinée à MARTEAU. Rend la situation
   termites et mérule d'une liste de communes.

   Le statut est COMMUNAL : cent parcelles d'une même commune
   donnent une seule interrogation. L'appelant dédoublonne ses
   codes INSEE avant d'appeler, et redistribue la réponse sur
   ses biens.

   Entrée  : GET  /api/situation?insee=59378,72181
             POST /api/situation  { "insee": ["59378","72181"] }
             POST avec parcelles, pour les communes en zonage :
               { "biens": [ { "insee":"72181", "parcelles":["NL 113"] } ] }
   Sortie  : { meta:{...}, communes:{ "59378": { termite:{...},
                                                merule:{...} } } }

   Le moteur de résolution est celui de l'interface humaine
   (xylo-moteur.js) : la page et l'API ne peuvent pas diverger.
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const moteur = require("../xylo-moteur.js");

const PLAFOND = 5000;   /* communes par appel */

/* Le référentiel est lu une fois puis conservé en mémoire pour la
   durée de vie de l'instance : ~9 000 entrées, lecture instantanée. */
let REF = null;
let chargeLe = null;

function chargerReferentiel() {
  if (REF) return REF;
  /* surcharges : lues dans le moteur partagé, jamais recopiées ici */
  const base = moteur.nouveauReferentiel("0.3");

  const chemins = [
    path.join(process.cwd(), "xylo-referentiel.json"),
    path.join(process.cwd(), "public", "xylo-referentiel.json"),
    path.join(__dirname, "..", "xylo-referentiel.json")
  ];
  for (const c of chemins) {
    try {
      if (fs.existsSync(c)) {
        moteur.integrer(base, JSON.parse(fs.readFileSync(c, "utf8")));
        chargeLe = c;
        break;
      }
    } catch (e) { /* on tente le chemin suivant */ }
  }
  REF = base;
  return REF;
}

/* Parcelles éventuelles, regroupées par commune.
   Elles ne servent que sur les communes en zonage infra-communal :
   ailleurs le statut est communal et la parcelle n'y change rien. */
function listeParcelles(req) {
  const par = {};
  if (req.method !== "POST" || !req.body) return par;
  const biens = req.body.biens || req.body.parcelles || [];
  if (!Array.isArray(biens)) return par;
  biens.forEach(function (b) {
    if (!b) return;
    const code = String(b.insee || b.commune || "").trim().toUpperCase();
    if (!/^[0-9][0-9AB][0-9]{3}$/.test(code)) return;
    const lot = [].concat(b.parcelles || b.parcelle || []);
    if (!par[code]) par[code] = [];
    lot.forEach(function (p) {
      const v = String(p || "").trim();
      if (v && par[code].indexOf(v) < 0) par[code].push(v);
    });
  });
  return par;
}

function listeInsee(req) {
  let brut = [];
  if (req.method === "POST" && req.body) {
    brut = req.body.insee || req.body.communes || [];
    if (typeof brut === "string") brut = brut.split(",");
    /* les communes citées dans "biens" comptent aussi */
    const biens = req.body.biens || req.body.parcelles || [];
    if (Array.isArray(biens)) {
      brut = brut.concat(biens.map(function (b) {
        return b && (b.insee || b.commune);
      }).filter(Boolean));
    }
  } else if (req.query && req.query.insee) {
    brut = String(req.query.insee).split(",");
  }
  const vus = {};
  const propre = [];
  brut.forEach(function (v) {
    const code = String(v || "").trim().toUpperCase();
    if (!/^[0-9][0-9AB][0-9]{3}$/.test(code)) return;   /* 2A/2B corses inclus */
    if (vus[code]) return;
    vus[code] = 1;
    propre.push(code);
  });
  return propre;
}

module.exports = async function (req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ erreur: "GET ou POST attendu" });
  }

  const codes = listeInsee(req);
  if (!codes.length) {
    return res.status(400).json({
      erreur: "aucun code INSEE valide",
      usage: "GET /api/situation?insee=59378,72181 ou POST { insee:[...] }"
    });
  }
  if (codes.length > PLAFOND) {
    return res.status(413).json({ erreur: "plafond de " + PLAFOND + " communes par appel dépassé (" + codes.length + ")" });
  }

  const ref = chargerReferentiel();
  const jour = moteur.todayISO();

  function bloc(insee, risque) {
    const r = moteur.resolve(ref, insee, risque, jour);
    const d = r.data || {};
    return {
      statut: r.statut,            /* total|partiel|zonage|avenir|aucun|verifier */
      couleur: r.cl,               /* carmin|orange|canard|gris */
      libelle: r.txt,
      classe: (r.cl === "carmin"), /* vrai si un arrêté s'applique aujourd'hui */
      annexe_parcellaire: (r.statut === "zonage"),
      reference: d.arrete || null,
      date_arrete: d.date_arrete || null,
      date_effet: d.effet || null,
      url_arrete: d.url || null,
      source: d.source || null,
      verifie_le: d.verifie || null,
      observation: r.note || null
    };
  }

  /* Le format d'un code INSEE ne prouve pas l'existence de la commune.
     Sans liste nationale embarquée, on contrôle au moins le département :
     un code hors des départements français ne peut pas être déclaré
     "hors zone classée" — il ressort en "verifier". */
  const DEPS = new Set();
  for (let i = 1; i <= 95; i++) DEPS.add(String(i).padStart(2, "0"));
  ["2A", "2B", "971", "972", "973", "974", "976"].forEach(function (d) { DEPS.add(d); });
  DEPS.delete("20");

  function blocInconnu() {
    return {
      statut: "verifier", couleur: "gris", libelle: "À vérifier",
      classe: false, annexe_parcellaire: false,
      reference: null, date_arrete: null, date_effet: null,
      url_arrete: null, source: null, verifie_le: null,
      observation: "Code INSEE hors des départements français : commune non identifiée, aucune situation ne peut être affirmée."
    };
  }

  const parcellesDemandees = listeParcelles(req);
  const communes = {};
  const suspectes = [];
  let vigilances = 0;
  codes.forEach(function (insee) {
    const dep = moteur.departement(insee);
    const connu = DEPS.has(dep);
    if (!connu) suspectes.push(insee);
    const entree = {
      departement: dep,
      termite: connu ? bloc(insee, "termite") : blocInconnu(insee),
      merule: connu ? bloc(insee, "merule") : blocInconnu(insee)
    };
    /* verdict parcellaire, uniquement là où le zonage l'exige */
    const lot = parcellesDemandees[insee] || [];
    ["termite", "merule"].forEach(function (rq) {
      if (!entree[rq].annexe_parcellaire) return;
      vigilances++;
      if (!lot.length) return;
      entree[rq].parcelles = lot.map(function (p) {
        const v = moteur.resolveParcelle(ref, insee, rq, p);
        return { parcelle: p, verdict: v.verdict, observation: v.note };
      });
    });
    communes[insee] = entree;
  });

  return res.status(200).json({
    meta: {
      outil: "XYLO",
      version: ref.meta.version,
      moisson_cerema: ref.meta.moisson || null,
      referentiel_charge: !!chargeLe,
      etabli_le: jour,
      nombre_communes: codes.length,
      communes_non_identifiees: suspectes.length ? suspectes : undefined,
      vigilances_parcellaires: vigilances,
      avertissement: "Situation indicative établie d'après la cartographie nationale du Cerema. L'arrêté préfectoral, seul opposable, doit être consulté. Le diagnostic termites est valable six mois à la signature de l'acte authentique."
    },
    communes: communes
  });
};
