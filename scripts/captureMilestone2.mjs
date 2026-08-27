import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const browserCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

async function findBrowserExecutable() {
  for (const candidate of browserCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next local browser.
    }
  }
  throw new Error("No supported local Chrome or Edge executable was found");
}

const baseUrl = process.env.WEB_QA_URL || "http://127.0.0.1:3000";
const outputDirectory = path.resolve("docs", "design");
await mkdir(outputDirectory, { recursive: true });

const forbiddenTerms = [
  "agent",
  "settlement",
  "float",
  "wallet",
  "commission",
  "reconciliation"
];

async function assertNoPageOverflow(page, label) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  if (overflow) {
    const offenders = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .map((element) => ({
          tag: element.tagName,
          className: element.className,
          right: Math.round(element.getBoundingClientRect().right),
          width: Math.round(element.getBoundingClientRect().width)
        }))
        .filter(({ right }) => right > window.innerWidth + 1)
        .slice(0, 8)
    );
    throw new Error(`${label} has page-level horizontal overflow: ${JSON.stringify(offenders)}`);
  }
}

async function assertNoForbiddenNavigation(page) {
  const navigation = (await page.locator("nav").allTextContents()).join(" ").toLowerCase();
  for (const term of forbiddenTerms) {
    if (navigation.includes(term)) {
      throw new Error(`Forbidden navigation term rendered: ${term}`);
    }
  }
}

async function assertElementsWithinViewport(page, selectors, label) {
  const clipped = await page.evaluate((items) => {
    const viewportWidth = window.innerWidth;
    return items.flatMap((selector) =>
      [...document.querySelectorAll(selector)]
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { selector, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), viewportWidth };
        })
        .filter(({ left, right }) => left < -1 || right > viewportWidth + 1)
    );
  }, selectors);
  if (clipped.length) {
    throw new Error(`${label} clips visible layout regions: ${JSON.stringify(clipped)}`);
  }
}

const browser = await chromium.launch({
  executablePath: await findBrowserExecutable(),
  headless: true
});

try {
  const sender = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await sender.goto(`${baseUrl}/sender`, { waitUntil: "networkidle" });
  await sender.getByRole("heading", { name: "Your transfers" }).waitFor();
  await assertNoPageOverflow(sender, "Sender desktop");
  await assertNoForbiddenNavigation(sender);
  await sender.screenshot({ path: path.join(outputDirectory, "milestone-2-sender-render.png") });
  const reviewTrigger = sender.getByRole("button", { name: "Review quote" });
  await reviewTrigger.click();
  await sender.getByRole("dialog", { name: "Quote HW-24018" }).waitFor();
  await sender.keyboard.press("Escape");
  await sender.getByRole("dialog", { name: "Quote HW-24018" }).waitFor({ state: "hidden" });

  const senderMobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await senderMobile.goto(`${baseUrl}/sender`, { waitUntil: "networkidle" });
  await assertNoPageOverflow(senderMobile, "Sender mobile");
  await senderMobile.getByRole("button", { name: "Toggle sender navigation" }).click();
  await senderMobile.getByRole("navigation", { name: "Sender navigation" }).waitFor();
  await senderMobile.getByRole("button", { name: "Toggle sender navigation" }).click();
  await senderMobile.screenshot({
    path: path.join(outputDirectory, "milestone-2-sender-render-mobile.png"),
    fullPage: true
  });

  const staff = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await staff.goto(`${baseUrl}/staff`, { waitUntil: "networkidle" });
  await staff.getByRole("heading", { name: "Transfer operations" }).waitFor();
  if (await staff.getByRole("navigation", { name: "Administration navigation" }).count()) {
    throw new Error("Staff shell exposed admin navigation");
  }
  await assertNoForbiddenNavigation(staff);
  await staff.getByRole("searchbox", { name: "Search reference or sender" }).fill("Greenfield");
  await staff.getByRole("button", { name: "View HW-24016", exact: true }).click();

  const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await admin.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
  await admin.getByRole("navigation", { name: "Administration navigation" }).waitFor();
  await assertNoForbiddenNavigation(admin);
  await admin.screenshot({ path: path.join(outputDirectory, "milestone-2-operations-render.png") });
  const holdTrigger = admin.getByRole("button", { name: "Place on hold" });
  await holdTrigger.click();
  const holdDialog = admin.getByRole("dialog", { name: "Place transfer on hold" });
  await holdDialog.waitFor();
  await admin.screenshot({ path: path.join(outputDirectory, "milestone-2-hold-modal-render.png") });
  await holdDialog.getByRole("button", { name: "Place on hold" }).click();
  await holdDialog.getByText("Add a concise operational reason", { exact: true }).waitFor();
  await holdDialog.getByRole("textbox", { name: "Reason" }).fill("Sender requested an operational review");
  await holdDialog.getByRole("button", { name: "Place on hold" }).click();
  await holdDialog.waitFor({ state: "hidden" });
  if (!(await holdTrigger.evaluate((element) => element === document.activeElement))) {
    throw new Error("Hold confirmation did not restore focus to its trigger");
  }

  const operationsMobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await operationsMobile.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
  await assertNoPageOverflow(operationsMobile, "Operations mobile");
  await operationsMobile.getByRole("button", { name: "Toggle operations navigation" }).click();
  await operationsMobile.getByRole("navigation", { name: "admin operations navigation" }).waitFor();
  await operationsMobile.getByRole("button", { name: "Toggle operations navigation" }).click();
  await operationsMobile.waitForFunction(
    () => document.querySelector(".operations-sidebar")?.getBoundingClientRect().right <= 0
  );
  await assertElementsWithinViewport(
    operationsMobile,
    [".operations-mobile-header", ".operations-topbar", ".operations-content", ".metric-strip", ".operations-table-wrap", ".transfer-detail"],
    "Operations mobile"
  );
  await operationsMobile.screenshot({
    path: path.join(outputDirectory, "milestone-2-operations-render-mobile.png")
  });

  console.log("Milestone 2 sender, operations, modal, role, keyboard, search, and responsive QA passed");
} finally {
  await browser.close();
}
