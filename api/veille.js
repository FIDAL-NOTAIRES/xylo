/* ============================================================
   XYLO — /api/veille   (cron quotidien)
   ------------------------------------------------------------
   Remoissonne les quatre couches Cerema, compare au référentiel
   en place, écrit le référentiel actualisé et complète le journal.

   Écriture par l'API GitHub : une fonction Vercel ne peut pas
   écrire dans son propre système de fichiers. Le référentiel reste
   ainsi versionné au dépôt — historique gratuit d'une donnée qui
   fonde des actes.

   Variables d'environnement requises :
     GITHUB_TOKEN   jeton à portée « contents: write » sur le dépôt
     GITHUB_REPO    par défaut FIDAL-NOTAIRES/xylo
     CRON_SECRET    facultatif ; si posé, exigé en en-tête ou en query

   Appel manuel : /api/veille?dry=1  (analyse sans rien écrire)
   ============================================================ */
"use strict";

const moteur = require("../xylo-moteur.js");

const BASE = "https://cartagene.cerema.fr/server/rest/services/Hosted/";
const COUCHES = [
  { service: "departement_termite", risque: "termite", portee: "departement" },
  { service: "departement_merule",  risque: "merule",  portee: "departement" },
  { service: "commune_termite",     risque: "termite", portee: "commune" },
  { service: "commune_merule",      risque: "merule",  portee: "commune" }
];

const DEPOT = process.env.GITHUB_REPO || "FIDAL-NOTAIRES/xylo";
const F_REF = "xylo-referentiel.json";
const F_JOURNAL = "VEILLE.md";
const GH = "https://api.github.com/repos/" + DEPOT + "/contents/";

/* ---------- utilitaires ---------- */

function versISO(s) {
  if (!s) return null;
  if (typeof s === "number") {               /* Esri sert parfois un horodatage */
    const d = new Date(s);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  return null;
}

async function jsonDe(url) {
  const r = await fetch(url, { headers: { "User-Agent": "XYLO-veille/1.0" } });
  if (!r.ok) throw new Error("HTTP " + r.status + " sur " + url);
  return r.json();
}

/* ---------- moisson d'une couche ---------- */

async function moissonner(svc) {
  const meta = await jsonDe(BASE + svc.service + "/FeatureServer/0?f=json");
  if (!meta || !meta.fields) throw new Error(svc.service + " : métadonnées illisibles");
  const noms = meta.fields.map(f => f.name.toLowerCase());
  const pas = meta.maxRecordCount || 2000;
  const champ = (cands) => {
    for (const c of cands) {
      const j = noms.indexOf(c);
      if (j >= 0) return meta.fields[j].name;
    }
    return null;
  };
  const F = {
    flag: champ([svc.risque, "termite", "merule", "classement", "statut"]),
    insee: svc.portee === "departement"
      ? champ(["code_dep", "dep", "insee_dep", "code_insee", "code_depar"])
      : champ(["code_insee", "insee", "insee_com"]),
    nom: champ(["nom_offici", "nom", "nom_com", "nom_dep", "libelle"]),
    lien: champ(["lien_ap", "url_ap", "lien", "url"]),
    date: champ(["date_ap", "date_arrete", "date"])
  };
  if (!F.flag || !F.insee) {
    throw new Error(svc.service + " : champs introuvables (flag=" + F.flag + ", insee=" + F.insee + ")");
  }

  const lignes = [];
  let offset = 0;
  for (;;) {
    const u = BASE + svc.service + "/FeatureServer/0/query"
      + "?where=1%3D1&outFields=*&returnGeometry=false&f=json"
      + "&resultOffset=" + offset + "&resultRecordCount=" + pas;
    const page = await jsonDe(u);
    if (page.error) throw new Error(svc.service + " : " + JSON.stringify(page.error));
    const lot = page.features || [];
    lot.forEach(x => lignes.push(x.attributes));
    if (!page.exceededTransferLimit && lot.length < pas) break;
    offset += lot.length;
    if (offset > 200000) throw new Error(svc.service + " : pagination suspecte");
  }
  return { champs: F, lignes };
}

/* ---------- construction du référentiel ---------- */

function batir(moissons, jour) {
  const ref = {
    meta: { source: "cerema/cartagene", moissonne_le: jour, exhaustif: {} },
    dep: {}, com: {}
  };
  const douteux = [];

  moissons.forEach(({ svc, r }) => {
    r.lignes.forEach(a => {
      let code = String(a[r.champs.insee] || "").trim();
      if (!code) return;
      if (svc.portee === "departement" && code.length === 1) code = "0" + code;
      if (svc.portee === "commune" && code.length === 4) code = "0" + code;

      const B = String(a[r.champs.flag] == null ? "" : a[r.champs.flag]).trim().toUpperCase();
      let statut;
      if (B === "O") statut = (svc.portee === "departement") ? "total" : "partiel";
      else if (B === "P") {
        if (svc.portee === "departement") return;   /* détail porté par la couche communale */
        statut = "zonage";
      } else if (B === "N") return;                 /* négatif explicite */
      else { statut = "verifier"; douteux.push({ couche: svc.service, code, valeur: B }); }

      const cible = (svc.portee === "departement") ? ref.dep : ref.com;
      if (!cible[code]) cible[code] = {};
      const dISO = versISO(r.champs.date ? a[r.champs.date] : null);
      cible[code][svc.risque] = {
        statut,
        arrete: dISO ? ("AP du " + dISO.split("-").reverse().join("/"))
                     : (statut === "verifier" ? "" : "AP (date non renseignée)"),
        date_arrete: dISO,
        effet: dISO,
        url: r.champs.lien ? (a[r.champs.lien] || null) : null,
        nom: r.champs.nom ? (a[r.champs.nom] || null) : null,
        source: "cerema",
        verifie: jour
      };
    });
    if (svc.portee === "commune" && r.lignes.length > 30000) {
      ref.meta.exhaustif[svc.risque] = true;
    }
  });
  return { ref, douteux };
}

/* ---------- comparaison ---------- */

function comparer(ancien, nouveau) {
  const ecarts = [];
  const cle = (niv, code, rq) => niv + ":" + code + ":" + rq;
  const lire = (ref, niv, code, rq) => (ref[niv] && ref[niv][code] && ref[niv][code][rq]) || null;

  const vus = new Set();
  ["dep", "com"].forEach(niv => {
    Object.keys(nouveau[niv] || {}).forEach(code => {
      ["termite", "merule"].forEach(rq => {
        const n = lire(nouveau, niv, code, rq);
        if (!n) return;
        vus.add(cle(niv, code, rq));
        const a = lire(ancien, niv, code, rq);
        if (!a) {
          ecarts.push({ type: "apparition", niv, code, rq, nom: n.nom,
            vers: n.statut, arrete: n.arrete, url: n.url });
          return;
        }
        /* trois critères : un drapeau inchangé peut cacher un arrêté
           nouveau qui a remplacé l'ancien sur le même périmètre */
        if (a.statut !== n.statut) {
          ecarts.push({ type: "statut", niv, code, rq, nom: n.nom,
            de: a.statut, vers: n.statut, arrete: n.arrete, url: n.url });
        }
        if ((a.date_arrete || null) !== (n.date_arrete || null)) {
          ecarts.push({ type: "arrete", niv, code, rq, nom: n.nom,
            de: a.date_arrete, vers: n.date_arrete, url: n.url });
        }
        if ((a.url || null) !== (n.url || null)) {
          ecarts.push({ type: "lien", niv, code, rq, nom: n.nom,
            de: a.url, vers: n.url });
        }
      });
    });
  });
  /* disparitions : présent hier, absent aujourd'hui = déclassement */
  ["dep", "com"].forEach(niv => {
    Object.keys(ancien[niv] || {}).forEach(code => {
      ["termite", "merule"].forEach(rq => {
        const a = lire(ancien, niv, code, rq);
        if (!a) return;
        if (a.source !== "cerema") return;     /* on ignore les surcharges manuelles */
        if (!vus.has(cle(niv, code, rq))) {
          ecarts.push({ type: "disparition", niv, code, rq, nom: a.nom,
            de: a.statut, arrete: a.arrete });
        }
      });
    });
  });
  return ecarts;
}

/* ---------- GitHub ---------- */

async function ghLire(chemin, jeton) {
  const r = await fetch(GH + chemin, {
    headers: { Authorization: "Bearer " + jeton, Accept: "application/vnd.github+json",
      "User-Agent": "XYLO-veille/1.0" }
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("lecture " + chemin + " : HTTP " + r.status);
  const j = await r.json();
  return { sha: j.sha, contenu: Buffer.from(j.content, "base64").toString("utf8") };
}

async function ghEcrire(chemin, contenu, message, sha, jeton) {
  const corps = {
    message,
    content: Buffer.from(contenu, "utf8").toString("base64"),
    committer: { name: "XYLO veille", email: "veille@xylo.local" }
  };
  if (sha) corps.sha = sha;
  const r = await fetch(GH + chemin, {
    method: "PUT",
    headers: { Authorization: "Bearer " + jeton, Accept: "application/vnd.github+json",
      "Content-Type": "application/json", "User-Agent": "XYLO-veille/1.0" },
    body: JSON.stringify(corps)
  });
  if (!r.ok) throw new Error("écriture " + chemin + " : HTTP " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
}

/* ---------- journal ---------- */

function entreeJournal(jour, ecarts, douteux, ms, volumes) {
  const L = [];
  L.push("## " + jour.split("-").reverse().join("/") +
    (ecarts.length ? " — " + ecarts.length + " écart(s)" : " — aucun écart"));
  L.push("");
  L.push("Moisson en " + (ms / 1000).toFixed(1) + " s · " +
    volumes.dep + " départements, " + volumes.com + " communes classées · " +
    douteux.length + " valeur(s) non arbitrée(s).");
  if (!ecarts.length) {
    L.push("");
    L.push("Rien à signaler.");
    return L.join("\n") + "\n";
  }
  L.push("");
  const parType = {};
  ecarts.forEach(e => { (parType[e.type] = parType[e.type] || []).push(e); });
  const titres = {
    apparition: "Nouveaux classements",
    statut: "Changements de statut",
    arrete: "Arrêtés actualisés (nouvelle date)",
    lien: "Liens modifiés",
    disparition: "Déclassements"
  };
  Object.keys(titres).forEach(t => {
    const lot = parType[t];
    if (!lot || !lot.length) return;
    L.push("### " + titres[t] + " (" + lot.length + ")");
    L.push("");
    lot.slice(0, 60).forEach(e => {
      const qui = (e.nom ? e.nom + " " : "") + "`" + e.code + "`" +
        (e.niv === "dep" ? " (département)" : "");
      const rq = e.rq === "merule" ? "mérule" : "termites";
      let ligne = "- **" + qui + "** — " + rq + " : ";
      if (t === "apparition") ligne += "désormais `" + e.vers + "`" + (e.arrete ? ", " + e.arrete : "");
      else if (t === "statut") ligne += "`" + e.de + "` → `" + e.vers + "`" + (e.arrete ? ", " + e.arrete : "");
      else if (t === "arrete") ligne += "date d'arrêté " + (e.de || "aucune") + " → " + (e.vers || "aucune");
      else if (t === "lien") ligne += "lien de l'arrêté modifié";
      else if (t === "disparition") ligne += "n'est plus classée (était `" + e.de + "`)";
      if ((t === "apparition" || t === "statut" || t === "arrete") && e.url) {
        ligne += " · [arrêté](" + e.url + ")";
      }
      L.push(ligne);
    });
    if (lot.length > 60) L.push("- … et " + (lot.length - 60) + " autre(s).");
    L.push("");
  });
  L.push("> Les arrêtés nouveaux ou actualisés sont à archiver au dépôt " +
    "(`ap-{code}-{risque}-{AAAAMMJJ}.pdf`) : les liens Cerema ne sont pas " +
    "récupérables automatiquement, voir l'addendum au mémo.");
  L.push("");
  return L.join("\n") + "\n";
}

/* ---------- point d'entrée ---------- */

module.exports = async function (req, res) {
  const jeton = process.env.GITHUB_TOKEN;
  const secret = process.env.CRON_SECRET;
  const dry = !!(req.query && (req.query.dry === "1" || req.query.dry === "true"));

  if (secret) {
    const fourni = (req.headers && (req.headers.authorization || "").replace(/^Bearer\s+/i, ""))
      || (req.query && req.query.cle);
    if (fourni !== secret) return res.status(401).json({ erreur: "non autorisé" });
  }
  if (!jeton && !dry) {
    return res.status(500).json({ erreur: "GITHUB_TOKEN absent : ajoutez la variable d'environnement, ou appelez avec ?dry=1" });
  }

  const t0 = Date.now();
  const jour = moteur.todayISO();
  try {
    const moissons = [];
    for (const svc of COUCHES) {
      moissons.push({ svc, r: await moissonner(svc) });
    }
    const { ref, douteux } = batir(moissons, jour);
    const volumes = { dep: Object.keys(ref.dep).length, com: Object.keys(ref.com).length };

    /* garde-fou : une moisson anormalement pauvre ne doit jamais
       écraser un référentiel sain (panne partielle du service amont) */
    if (volumes.com < 1000) {
      return res.status(502).json({
        erreur: "moisson anormalement pauvre (" + volumes.com + " communes) : écriture refusée",
        volumes
      });
    }

    let ancien = { dep: {}, com: {}, meta: {} };
    let shaRef = null;
    if (jeton) {
      const lu = await ghLire(F_REF, jeton);
      if (lu) { shaRef = lu.sha; try { ancien = JSON.parse(lu.contenu); } catch (e) { /* référentiel illisible : tout sera vu comme apparition */ } }
    }

    const ecarts = comparer(ancien, ref);
    const ms = Date.now() - t0;
    const entree = entreeJournal(jour, ecarts, douteux, ms, volumes);

    if (dry) {
      return res.status(200).json({
        mode: "analyse seule", duree_ms: ms, volumes,
        ecarts: ecarts.length, non_arbitrees: douteux.length,
        apercu_journal: entree, premiers_ecarts: ecarts.slice(0, 20)
      });
    }

    /* référentiel : écrit seulement s'il a changé */
    let refEcrit = false;
    const nouveauTexte = JSON.stringify(ref);
    if (JSON.stringify(ancien) !== nouveauTexte) {
      await ghEcrire(F_REF, nouveauTexte,
        "Veille " + jour + " : " + (ecarts.length ? ecarts.length + " écart(s)" : "actualisation"),
        shaRef, jeton);
      refEcrit = true;
    }

    /* journal : le plus récent en tête, sous le titre */
    const luJ = await ghLire(F_JOURNAL, jeton);
    const enTete = "# XYLO — journal de veille\n\n" +
      "Écrit automatiquement par `/api/veille`. Le plus récent en tête.\n\n";
    const corpsAncien = luJ ? luJ.contenu.replace(/^# XYLO[\s\S]*?en tête\.\s*\n+/, "") : "";
    await ghEcrire(F_JOURNAL, enTete + entree + "\n" + corpsAncien,
      "Journal de veille " + jour, luJ ? luJ.sha : null, jeton);

    return res.status(200).json({
      jour, duree_ms: ms, volumes,
      ecarts: ecarts.length, non_arbitrees: douteux.length,
      referentiel_ecrit: refEcrit,
      journal: "https://github.com/" + DEPOT + "/blob/main/" + F_JOURNAL
    });
  } catch (e) {
    return res.status(500).json({ erreur: e.message, duree_ms: Date.now() - t0 });
  }
};
