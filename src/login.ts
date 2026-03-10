import { chromium, type Request } from "playwright";
import { sendMessage } from "./message.js";
import axios from "axios";

export interface Bet {
  betId: string;
  date: string;
  eventType: string;
  event: string;
  amount: number;
}

export async function loginTest(): Promise<{ balance: number; profit: number; bets: Bet[]; date: string } | undefined> {

  // const p = process.env.PROXIES;
  // if (p == null) {
  //   throw new Error("PROXIES environment variable is not defined");
  // }

  // const proxies = JSON.parse(p);

  // // Shuffle proxies to pick a random order
  // const shuffledProxies = proxies.sort(() => 0.5 - Math.random());

  // let workingProxy = null;

  // console.log("Testing proxies to find a working one...");

  // for (const pxy of shuffledProxies) {
  //   try {
  //     console.log(`Testing proxy ${pxy.proxy}:${pxy.port}...`);
  //     const proxyResult = await axios.get("http://ipv4.webshare.io/", {
  //       timeout: 5000,
  //       proxy: {
  //         protocol: "http",
  //         host: pxy.proxy,
  //         port: parseInt(pxy.port),
  //         auth: {
  //           username: pxy.username,
  //           password: pxy.password
  //         }
  //       }
  //     });

  //     if (proxyResult.status === 200) {
  //       console.log(`Success: Proxy ${pxy.proxy} is working. IP shown: ${proxyResult.data}`);
  //       workingProxy = pxy;
  //       break; // found a working proxy, exit loop
  //     }
  //   } catch (error: any) {
  //     console.log(` Failed: Proxy ${pxy.proxy} error: ${error.message}`);
  //   }
  // }

  // if (!workingProxy) {
  //   throw new Error("Could not find any working proxies from the list provided.");
  // }

  const browser = await chromium.launch({
    headless: true,
    // proxy: {
    //   server: `http://${workingProxy.proxy}:${workingProxy.port}`,
    //   username: workingProxy.username,
    //   password: workingProxy.password
    // }
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
  let balanceText: string | null = null;
  try {
    balanceText = await page
      .locator("#account-menu-open-button span")
      .textContent({ timeout: 10000 }); // reduce timeout to fail faster
  } catch (error) {
    console.log("\\n--- LOGIN FAILED. EXTRACTING PAGE TEXT ---");
    try {
      const modalText = await page.locator("modal-container").innerText();
      console.log("MODAL TEXT:\\n", modalText);
    } catch (e) { }

    try {
      const toastText = await page.locator(".toast-message, .ng-trigger-toastAnimation, .error-message, .alert").allInnerTexts();
      console.log("ALERT TEXT:\\n", toastText.join("\\n"));
    } catch (e) { }
    console.log("-------------------------------------------\\n");
    await page.screenshot({ path: "login-failure.png", fullPage: true });
    await browser.close();
    throw new Error("Could not reach dashboard after login. Check console logs above for page text.");
  }

  const balance = parseFloat(balanceText ?? "0");

  console.log("Balance:", balance);

  // -----------------------------
  // OPEN P/L PAGE
  // -----------------------------
  await page.click("#account-menu-open-button");
  await page.click('a[href="/account/pl_statement"]');

  await page.waitForSelector("table");

  // -----------------------------
  // -----------------------------
  // YESTERDAY DATE (UTC BASED)
  // -----------------------------
  // Calculate "yesterday" from a UTC perspective, as requested.
  // regardless of the server's native timezone.

  const now = new Date();

  // Create an Intl.DateTimeFormat object configured for UTC timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC', // UTC timezone
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  // Subtract exactly 24 hours to get "yesterday"
  const yesterday = new Date(now.getTime() - (86400000));

  // Format the date explicitly in UTC
  const date = formatter.format(yesterday);

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

  const Betmessage = `
  📊 Bet Report
  
  Date: ${date}
  Current Balance: ${balance}
  Profit: ${profit}
  Total Bets: ${bets.length}
  `;

  await browser.close();

  await sendMessage(Betmessage)

  return {
    balance,
    profit,
    bets,
    date
  };
}