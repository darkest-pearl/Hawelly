import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const defaultChromePaths = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
];

async function findBrowserExecutable() {
  const candidates = process.env.CHROME_PATH
    ? [process.env.CHROME_PATH]
    : defaultChromePaths;

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported local browser path.
    }
  }

  throw new Error("No supported Chrome or Chromium executable was found");
}

const url = process.env.WEB_QA_URL || "http://127.0.0.1:3000/";
const outputDirectory = path.resolve("docs", "design");
const desktopOutput = path.join(outputDirectory, "milestone-0-web-render.png");
const mobileOutput = path.join(outputDirectory, "milestone-0-web-render-mobile.png");

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  executablePath: await findBrowserExecutable(),
  headless: true
});

try {
  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1
  });
  await desktop.goto(url, { waitUntil: "networkidle" });
  await desktop.getByRole("heading", { name: "Move money with clarity." }).waitFor();
  await desktop.getByRole("link", { name: "Request a transfer" }).click();
  if (!desktop.url().endsWith("#recent-transfers")) {
    throw new Error("Primary action did not navigate to the recent transfers section");
  }
  await desktop.screenshot({ path: desktopOutput, fullPage: false });

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1
  });
  await mobile.goto(url, { waitUntil: "networkidle" });
  const hasHorizontalOverflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  if (hasHorizontalOverflow) {
    throw new Error("Mobile layout has horizontal overflow");
  }
  await mobile.screenshot({ path: mobileOutput, fullPage: true });

  console.log(`Desktop render saved to ${desktopOutput}`);
  console.log(`Mobile render saved to ${mobileOutput}`);
} finally {
  await browser.close();
}
