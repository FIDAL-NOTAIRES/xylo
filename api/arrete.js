/* ============================================================
   XYLO — /api/arrete
   ------------------------------------------------------------
   Relais d'un PDF d'arrêté préfectoral : les sources (Cerema,
   préfectures) ne servent pas d'en-têtes CORS, le navigateur ne
   peut donc pas les lire directement. La fusion du dossier se
   fait côté client ; ce relais ne transporte qu'UN document par
   appel, ce qui reste sous la limite de réponse Vercel (~4,5 Mo).

   Entrée : GET /api/arrete?u=<url encodée>
   Sortie : application/pdf, ou JSON { erreur } avec code adapté.

   Sécurité : liste blanche de domaines — ce relais ne doit pas
   devenir un proxy ouvert.
   ============================================================ */
"use strict";

const DELAI_MS = 20000;
const LIMITE_RELAIS = 4.2 * 1024 * 1024;   /* marge sous le plafond Vercel */

function domaineAutorise(h) {
  h = String(h || "").toLowerCase();
  return h === "cerema.box.com" ||
         h.endsWith(".cerema.fr") ||
         h === "cerema.fr" ||
         h.endsWith(".gouv.fr") ||
         h.endsWith(".legifrance.gouv.fr");
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

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), DELAI_MS);
  try {
    const r = await fetch(url.toString(), {
      redirect: "follow",
      signal: ctl.signal,
      headers: { "User-Agent": "XYLO/1.0 (FIDAL Notaires; jean-francois.dumetz@fidal.notaires.fr)" }
    });
    if (!r.ok) return res.status(502).json({ erreur: "source HTTP " + r.status });
    const octets = Buffer.from(await r.arrayBuffer());
    if (octets.length > LIMITE_RELAIS) {
      return res.status(413).json({ erreur: "document trop volumineux pour le relais (" +
        (octets.length / 1048576).toFixed(1) + " Mo)" });
    }
    const tete = octets.slice(0, 1024).toString("latin1");
    if (tete.indexOf("%PDF") < 0) {
      return res.status(502).json({ erreur: "le lien ne renvoie pas un PDF" });
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(octets);
  } catch (e) {
    return res.status(504).json({ erreur: e.name === "AbortError" ? "délai dépassé" : e.message });
  } finally {
    clearTimeout(t);
  }
};
