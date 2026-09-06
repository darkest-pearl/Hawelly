import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const browserCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
].filter(Boolean);

async function browserExecutable() {
  for (const candidate of browserCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported local browser.
    }
  }
  throw new Error("No supported local Chrome or Chromium executable was found");
}

const baseUrl = (process.env.WEB_QA_URL || "http://127.0.0.1:3200").replace(/\/$/, "");
const outputDirectory = process.env.WEB_QA_OUTPUT_DIR
  ? path.resolve(process.env.WEB_QA_OUTPUT_DIR)
  : null;
if (outputDirectory) await mkdir(outputDirectory, { recursive: true });

function observeFailures(page) {
  const failures = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText || "unknown failure";
    // Next.js may cancel speculative RSC prefetches when a real navigation wins.
    if (errorText === "net::ERR_ABORTED" && request.url().includes("_rsc=")) return;
    failures.push(`request: ${request.url()} ${errorText}`);
  });
  return failures;
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  if (overflow) throw new Error(`${label} has horizontal overflow`);
}

const browser = await chromium.launch({
  executablePath: await browserExecutable(),
  headless: true
});

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const desktopFailures = observeFailures(desktop);
  await desktop.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 20_000 });
  await desktop.getByRole("heading", { name: "Know the route before money moves." }).waitFor();
  await assertNoOverflow(desktop, "Homepage desktop");
  const placeholderLinks = await desktop.locator('a[href^="#"]').count();
  if (placeholderLinks) throw new Error("Homepage still contains placeholder fragment links");
  for (const [name, href] of [
    ["Transfers", "/sender"],
    ["Recipients", "/sender/recipients"],
    ["Support", "/support"],
    ["Sender sign in", "/sign-in?next=%2Fsender"],
    ["Create account", "/register?next=%2Fsender%2Fnew-transfer"]
  ]) {
    const actual = await desktop.getByRole("link", { name, exact: true }).first().getAttribute("href");
    if (actual !== href) throw new Error(`${name} points to ${actual}, expected ${href}`);
  }
  if (outputDirectory) {
    await desktop.screenshot({ path: path.join(outputDirectory, "hawelly-entry-desktop.png"), fullPage: true });
  }
  await desktop.getByRole("link", { name: "Request a transfer", exact: true }).click();
  await desktop.waitForURL(/\/sign-in\?next=%2Fsender%2Fnew-transfer$/);
  await desktop.getByRole("heading", { name: "Sign in" }).waitFor();
  if (outputDirectory) {
    await desktop.screenshot({ path: path.join(outputDirectory, "hawelly-sign-in-desktop.png"), fullPage: true });
  }
  if (desktopFailures.length) {
    throw new Error(`Homepage/sign-in failures: ${JSON.stringify(desktopFailures)}`);
  }

  const support = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const supportFailures = observeFailures(support);
  await support.goto(`${baseUrl}/support`, { waitUntil: "networkidle", timeout: 20_000 });
  await support.getByRole("heading", { name: "Report clearly. Protect your information." }).waitFor();
  await support.getByText("Hawelly staff should never need your password.", { exact: false }).waitFor();
  await assertNoOverflow(support, "Support desktop");
  if (supportFailures.length) throw new Error(`Support failures: ${JSON.stringify(supportFailures)}`);

  for (const [portal, expected] of [
    ["/sender/new-transfer", "/sign-in?next=%2Fsender%2Fnew-transfer"],
    ["/staff", "/sign-in?next=%2Fstaff&portal=staff"],
    ["/admin", "/sign-in?next=%2Fadmin&portal=admin"]
  ]) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    await page.goto(`${baseUrl}${portal}`, { waitUntil: "networkidle", timeout: 20_000 });
    await page.waitForURL(`${baseUrl}${expected}`);
    await page.close();
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mobileFailures = observeFailures(mobile);
  await mobile.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 20_000 });
  await assertNoOverflow(mobile, "Homepage mobile");
  await mobile.getByRole("link", { name: "Request a transfer", exact: true }).waitFor();
  if (outputDirectory) {
    await mobile.screenshot({ path: path.join(outputDirectory, "hawelly-entry-mobile.png"), fullPage: true });
  }
  await mobile.goto(`${baseUrl}/register?next=%2Fsender%2Fnew-transfer`, {
    waitUntil: "networkidle",
    timeout: 20_000
  });
  await mobile.getByRole("heading", { name: "Create account" }).waitFor();
  if (outputDirectory) {
    await mobile.screenshot({ path: path.join(outputDirectory, "hawelly-register-mobile.png"), fullPage: true });
  }
  await mobile.getByLabel("Full name").fill("Technical Beta Sender");
  await mobile.getByLabel("Email").fill("technical-beta@example.invalid");
  await mobile.getByLabel("Password", { exact: true }).fill("A-secure-password-123");
  await mobile.getByLabel("Confirm password").fill("Different-password-123");
  await mobile.getByRole("button", { name: "Create sender account" }).click();
  await mobile.getByRole("alert").getByText("Passwords do not match").waitFor();
  await assertNoOverflow(mobile, "Registration mobile");
  if (mobileFailures.length) throw new Error(`Mobile failures: ${JSON.stringify(mobileFailures)}`);

  console.log(`Hawelly web entry QA passed for ${baseUrl}`);
} finally {
  await browser.close();
}
