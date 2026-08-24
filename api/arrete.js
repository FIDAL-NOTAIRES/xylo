/* ============================================================
   XYLO — /api/arrete  (v2)
   ------------------------------------------------------------
   Relais d'un PDF d'arrêté préfectoral, la fusion du dossier se
   faisant côté client. Gère deux familles de sources :
   - liens directs vers un PDF (préfectures, .gouv.fr) ;
   - pages de partage Box du Cerema (cerema.box.com/s/...), qui
     sont du HTML : le relais en extrait l'identifiant du fichier
     puis appelle le point de téléchargement direct de Box.
   Se présente comme un navigateur : les pare-feux .gouv.fr
   coupent la connexion des agents inconnus.
   Sécurité : liste blanche de domaines.
   ============================================================ */
"use strict";

const DELAI_MS = 20000;
const LIMITE_RELAIS = 4.2 * 1024 * 1024;

const ENTETES_NAV = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/pdf,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9"
};

function domaineAutorise(h) {
  h = String(h || "").toLowerCase();
  return h === "cerema.box.com" ||
         h.endsWith(".cerema.fr") || h === "cerema.fr" ||
         h.endsWith(".gouv.fr");
}

async function chercher(url, entetes) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), DELAI_MS);
  try {
    const r = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: entetes });
    const octets = Buffer.from(await r.arrayBuffer());
    let biscuits = [];
    if (typeof r.headers.getSetCookie === "function") {
      biscuits = r.headers.getSetCookie();
    } else if (r.headers.get("set-cookie")) {
      biscuits = [r.headers.get("set-cookie")];
    }
    biscuits = biscuits.map(function (c) { return String(c).split(";")[0]; }).filter(Boolean);
    return { statut: r.status, octets, type: r.headers.get("content-type") || "", biscuits };
  } finally {
    clearTimeout(t);
  }
}

async function chercherAvecReprise(url, entetesSup) {
  const entetes = Object.assign({}, ENTETES_NAV, entetesSup || {});
  try {
    return await chercher(url, entetes);
  } catch (e) {
    /* échec réseau : une seule reprise après une seconde */
    await new Promise(function (ok) { setTimeout(ok, 1000); });
    return await chercher(url, entetes);
  }
}

function estPdf(octets) {
  return octets.slice(0, 1024).toString("latin1").indexOf("%PDF") >= 0;
}

/* page de partage Box -> URL de téléchargement direct */
function resoudreBox(html, urlPage) {
  const nom = (urlPage.pathname.match(/\/s\/([A-Za-z0-9]+)/) || [])[1];
  if (!nom) return null;
  const motifs = [
    /"itemID"\s*:\s*"?(\d{6,})"?/,
    /typedID"\s*:\s*"f_(\d{6,})"/,
    /data-item-id="(\d{6,})"/,
    /"id"\s*:\s*"?f_(\d{6,})"?/
  ];
  for (let i = 0; i < motifs.length; i++) {
    const m = html.match(motifs[i]);
    if (m) {
      return urlPage.origin + "/index.php?rm=box_download_shared_file&shared_name=" +
             nom + "&file_id=f_" + m[1];
    }
  }
  return null;
}

module.exports = async function (req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ erreur: "GET attendu" });

  const u = req.query && req.query.u;
  if (!u) return res.status(400).json({ erreur: "paramètre u manquant" });

  let url;
  try { url = new URL(u); } catch (e) {
    return res.status(400).json({ erreur: "URL invalide" });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return res.status(400).json({ erreur: "protocole refusé" });
  }
  if (!domaineAutorise(url.hostname)) {
    return res.status(403).json({ erreur: "domaine hors liste blanche : " + url.hostname });
  }

  try {
    let r = await chercherAvecReprise(url.toString());
    if (r.statut < 200 || r.statut >= 300) {
      return res.status(502).json({ erreur: "source HTTP " + r.statut });
    }

    /* page de partage Box : second saut vers le fichier lui-même */
    if (!estPdf(r.octets) && url.hostname.endsWith(".box.com")) {
      const direct = resoudreBox(r.octets.toString("utf8"), url);
      if (!direct) {
        return res.status(502).json({ erreur: "page Box illisible (identifiant du fichier introuvable)" });
      }
      const sup = { "Referer": url.toString() };
      if (r.biscuits && r.biscuits.length) sup["Cookie"] = r.biscuits.join("; ");
      r = await chercherAvecReprise(direct, sup);
      if (r.statut < 200 || r.statut >= 300) {
        return res.status(502).json({ erreur: "téléchargement Box HTTP " + r.statut });
      }
    }

    if (!estPdf(r.octets)) {
      return res.status(502).json({ erreur: "le lien ne renvoie pas un PDF (" + (r.type || "type inconnu") + ")" });
    }
    if (r.octets.length > LIMITE_RELAIS) {
      return res.status(413).json({ erreur: "document trop volumineux pour le relais (" +
        (r.octets.length / 1048576).toFixed(1) + " Mo)" });
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(r.octets);
  } catch (e) {
    const code = (e && e.cause && e.cause.code) ? e.cause.code : (e.name === "AbortError" ? "délai dépassé" : e.message);
    return res.status(504).json({ erreur: "échec réseau : " + code });
  }
};
