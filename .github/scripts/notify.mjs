// Sends the "new stories" notification. Called by .github/workflows/notify.yml
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import webpush from "web-push";

const raw = (process.env.UNSPUN_PUSH || "").trim();
if (!raw) { console.log("No UNSPUN_PUSH secret yet, so no notification. Turn notifications on in the app and save the setup code."); process.exit(0); }
let cfg;
try { cfg = JSON.parse(raw); } catch { console.error("UNSPUN_PUSH isn't a valid setup code. Copy it again from the app."); process.exit(1); }

const [owner, repo] = (process.env.GITHUB_REPOSITORY || "alexpatbarran/unspun").split("/");
const site = `https://${owner.toLowerCase()}.github.io/${repo}/`;
const now = JSON.parse(readFileSync("news.json", "utf8"));
const ids = arr => new Set((arr || []).map(a => a && a.id).filter(Boolean));

let title = "Unspun", body;
if (process.env.EVENT === "workflow_dispatch") {
  body = "Test: notifications are working.";
} else {
  let before = { articles: [], leftOut: [] };
  const sha = process.env.BEFORE || "";
  if (sha && !/^0+$/.test(sha)) { try { before = JSON.parse(execSync(`git show ${sha}:news.json`, { encoding: "utf8" })); } catch {} }
  const seen = new Set([...ids(before.articles), ...ids(before.leftOut)]);
  const oldMain = ids(before.articles);
  const newMain = (now.articles || []).filter(a => a && a.id && !oldMain.has(a.id)).length;
  const newLo = (now.leftOut || []).filter(a => a && a.id && !seen.has(a.id)).length;
  console.log(`New: ${newMain} important, ${newLo} left out`);
  if (!newMain && !newLo) { console.log("Nothing new, no notification."); process.exit(0); }
  const s = n => n === 1 ? "story" : "stories";
  body = newMain ? `${newMain} new ${s(newMain)}` : "No new important stories";
  if (newLo) body += ` · ${newLo} left out`;

  // wait until GitHub Pages is serving this update, so the stories are there when you open the app
  const want = now.updatedAt;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(site + "news.json?t=" + Date.now(), { cache: "no-store" });
      if (r.ok && (await r.json()).updatedAt === want) { console.log("Live site is updated."); break; }
    } catch {}
    if (i === 39) console.log("Live site still not updated after 10 minutes; sending anyway.");
    else await new Promise(r => setTimeout(r, 15000));
  }
}

try {
  const res = await webpush.sendNotification(cfg.sub, JSON.stringify({ title, body }), {
    TTL: 6 * 3600, urgency: "normal",
    vapidDetails: { subject: site, publicKey: cfg.pub, privateKey: cfg.priv }
  });
  console.log("Sent:", body, "(status " + res.statusCode + ")");
} catch (e) {
  console.error("Push failed:", e.statusCode || "", e.body || e.message);
  if (e.statusCode === 404 || e.statusCode === 410) console.error("This phone's subscription has expired. In Unspun, tap 'Turn on notifications' again and save the new setup code.");
  process.exit(1);
}
