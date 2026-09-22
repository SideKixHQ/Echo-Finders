import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1180, height: 1080 }, deviceScaleFactor: 2 });
await p.goto("http://localhost:4258/?speed=40&start=0.09", { waitUntil: "commit", timeout: 15000 });
await p.waitForTimeout(8000);
await (await p.$(".phone")).screenshot({ path: "/tmp/t-dark.png" });
await p.evaluate(() => [...document.querySelectorAll(".controls button")].find(b=>b.textContent.includes("Light"))?.click());
await p.waitForTimeout(800);
await (await p.$(".phone")).screenshot({ path: "/tmp/t-light.png" });
console.log(await p.evaluate(() => {
  const v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const g = (s) => getComputedStyle(document.querySelector(s)).backgroundColor;
  return `--rgb-panel=${v("--rgb-panel")}  ribbon=${g(".ribbon")}  nav=${g(".nav")}  pin=${getComputedStyle(document.querySelector(".pin-body")).fill}`;
}));
process.exit(0);
