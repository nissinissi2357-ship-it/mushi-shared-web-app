import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/nissi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const browserExecutablePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const appUrl = process.argv[2] || "https://mushi-shared-web-app.vercel.app";
const outDir = process.argv[3] || path.resolve(process.cwd(), "..", "manual", "images");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function screenshot(page, fileName, options = {}) {
  const target = path.join(outDir, fileName);
  await page.screenshot({
    path: target,
    fullPage: true,
    ...options
  });
  return target;
}

async function clickTab(page, name) {
  await page.getByRole("button", { name }).click();
  await page.waitForTimeout(600);
}

async function tryLogin(page) {
  const memberSelect = page.getByLabel("ログインする隊員");
  const passcodeInput = page.getByLabel("合言葉");
  const options = await memberSelect.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => ({ label: node.textContent || "", value: node.getAttribute("value") || "" }))
  );

  const attempts = [
    { labelPattern: /Admin/, passcode: "0000" },
    { labelPattern: /隊長/, passcode: "9999" },
    { labelPattern: /隊長/, passcode: "1234" }
  ];

  for (const attempt of attempts) {
    const option = options.find((item) => attempt.labelPattern.test(item.label));
    if (!option?.value) {
      continue;
    }

    await memberSelect.selectOption(option.value);
    await passcodeInput.fill(attempt.passcode);
    await page.getByRole("button", { name: /^ログイン$/ }).click();
    await page.waitForTimeout(1500);

    if (await page.getByRole("heading", { name: "ホーム" }).isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
}

async function run() {
  await ensureDir(outDir);

  const browser = await chromium.launch({ headless: true, executablePath: browserExecutablePath });
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  await screenshot(page, "01-top.png");

  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForTimeout(700);
  await screenshot(page, "02-login-popup.png");

  const loggedIn = await tryLogin(page);

  if (loggedIn) {
    await screenshot(page, "03-home.png");

    await clickTab(page, "観察登録");
    await screenshot(page, "04-record.png");

    await clickTab(page, "観察ログ");
    await screenshot(page, "05-logs.png");

    await clickTab(page, "追加ポイント");
    await screenshot(page, "06-points.png");
  }

  await browser.close();

  const manifest = {
    appUrl,
    loggedIn,
    images: await fs.readdir(outDir)
  };

  await fs.writeFile(
    path.resolve(path.dirname(outDir), "capture-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
