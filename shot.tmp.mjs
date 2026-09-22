import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1180, height: 1120 }, deviceScaleFactor: 2 });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto("http://localhost:4264/?speed=40", { waitUntil: "commit", timeout: 15000 });
await p.waitForTimeout(7000);
// Start something so the player appears.
await p.evaluate(() => document.querySelector(".ecard .act-pri")?.click());
await p.waitForTimeout(2500);
await (await p.$(".phone")).screenshot({ path: "/tmp/p-player.png" });
console.log("wave bars:", await p.evaluate(() => document.querySelectorAll(".wave-bar").length),
  " played:", await p.evaluate(() => document.querySelectorAll(".wave-on").length));
console.log("simpaud:", await p.evaluate(() => document.querySelector(".simpaud strong")?.textContent),
  "| narrator:", await p.evaluate(() => document.querySelector(".narrator")?.textContent?.trim()));
// Transcript tab.
await p.evaluate(() => [...document.querySelectorAll(".seg")].find(b=>b.textContent.includes("Transcript"))?.click());
await p.waitForTimeout(900);
await (await p.$(".phone")).screenshot({ path: "/tmp/p-transcript.png" });
console.log("lines:", await p.evaluate(() => document.querySelectorAll(".tline").length),
  " current:", await p.evaluate(() => document.querySelector(".tline-on")?.textContent?.slice(0,44)));
console.log(errs.length ? "ERRORS: " + errs.slice(0,2).join(" | ") : "no errors");
process.exit(0);
