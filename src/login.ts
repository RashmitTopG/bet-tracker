import { chromium, type Request } from "playwright";

export interface Bet {
  betId: string;
  date: string;
  eventType: string;
  event: string;
  amount: number;
}

export async function loginTest(): Promise<{ balance: number; profit: number; bets: Bet[]; date: string } | undefined> {

  const p = process.env.PROXIES;
  if (p == null) {
    throw new Error("PROXIES environment variable is not defined");
  }

  const proxies = JSON.parse(p);

  // pick random proxy
  const randomProxy = proxies[Math.floor(Math.random() * proxies.length)];

  console.log(randomProxy)

  if (randomProxy == null) {
    return;
  }

  const browser = await chromium.launch({
    headless: true,
    proxy: {
      server: `http://${randomProxy.proxy}:${randomProxy.port}`,
      username: randomProxy.username,
      password: randomProxy.password
    }
  });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });

  // -----------------------------
  // DEBUG API CALLS
  // -----------------------------
  page.on("request", (req: Request) => {
    const url = req.url();

    if (url.includes("pl") || url.includes("statement")) {
      console.log("\nAPI REQUEST:", url);
      console.log("BODY:", req.postData());
    }
  });

  // -----------------------------
  // OPEN WEBSITE
  // -----------------------------
  await page.goto(
    `${process.env.BET_WEBSITE}`,
    { waitUntil: "networkidle", timeout: 60000 }
  );

  // -----------------------------
  // LOGIN
  // -----------------------------
  await page.waitForSelector("text=LOGIN", { timeout: 30000 });
  await page.getByText("LOGIN").click();

  const modal = page.locator("modal-container");

  await modal.locator('input[formcontrolname="username"]').fill(`${process.env.USERNAME}`);
  await modal.locator('input[formcontrolname="password"]').fill(`${process.env.PASSWORD}`);

  await modal.locator('button[type="submit"]:not([disabled])').click();

  await page.waitForTimeout(5000);

  // -----------------------------
  // BALANCE
  // -----------------------------
  const balanceText = await page
    .locator("#account-menu-open-button span")
    .textContent();

  const balance = parseFloat(balanceText ?? "0");

  console.log("Balance:", balance);

  // -----------------------------
  // OPEN P/L PAGE
  // -----------------------------
  await page.click("#account-menu-open-button");
  await page.click('a[href="/account/pl_statement"]');

  await page.waitForSelector("table");

  // -----------------------------
  // YESTERDAY DATE
  // -----------------------------
  const yesterday = new Date(Date.now() - 86400000);
  const date = yesterday.toLocaleDateString("en-CA"); // en-CA gives YYYY-MM-DD

  console.log("Applying filter:", date);

  const start = page.locator('input[formcontrolname="start_date"]');
  const end = page.locator('input[formcontrolname="end_date"]');

  // Angular-safe value injection
  await start.evaluate((el: Element, value: string | undefined) => {
    const input = el as HTMLInputElement;
    input.value = value ?? "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, date);

  await end.evaluate((el: Element, value: string | undefined) => {
    const input = el as HTMLInputElement;
    input.value = value ?? "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, date);

  console.log("Start date:", date);
  console.log("End date:", date);

  // -----------------------------
  // APPLY FILTER
  // -----------------------------
  await page.click(".serach__button");

  await page.waitForTimeout(3000);
  try {
    await page.waitForSelector("tr.total-tr", { timeout: 30000 });
  } catch (error) {
    console.log("No bets found for Date:", date);
    await browser.close();
    return {
      balance,
      profit: 0,
      bets: [],
      date
    };
  }

  // -----------------------------
  // PROFIT
  // -----------------------------
  const totalPLText = await page
    .locator(".event___info b")
    .textContent();

  const profit = parseFloat(totalPLText ?? "0");

  console.log("Profit:", profit);

  // -----------------------------
  // SCRAPE BETS
  // -----------------------------
  const bets = await page.$$eval("table tbody tr", (rows: HTMLTableRowElement[]) =>
    rows
      .filter((row: HTMLTableRowElement) => !row.classList.contains("total-tr"))
      .map((row: HTMLTableRowElement) => {

        const cells = row.querySelectorAll("td");

        if (cells.length < 5) return null;

        const link =
          cells[3]?.querySelector("a")?.getAttribute("href") ?? "";

        const betId = link.split("/").pop() ?? "";

        return {
          betId,
          date: cells[1]?.textContent?.trim() ?? "",
          eventType: cells[2]?.textContent?.trim() ?? "",
          event: cells[3]?.textContent?.trim() ?? "",
          amount: parseFloat(cells[4]?.textContent?.trim() ?? "0")
        };

      })
      .filter((b): b is Bet => b !== null)
  );

  console.log("Bets returned:", bets);

  await browser.close();

  return {
    balance,
    profit,
    bets,
    date
  };
}