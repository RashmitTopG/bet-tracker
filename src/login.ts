import { chromium, type Request } from "playwright";
import { sendMessage } from "./message.js";
import axios from "axios"

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

  // console.log("Testing przoxies to find a working one...");

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
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ],
    // proxy: {
    //   server: `http://${workingProxy.proxy}:${workingProxy.port}`,
    //   username: workingProxy.username,
    //   password: workingProxy.password
    // }
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://fairplaypro.com/",
      "Origin": "https://fairplaypro.com"
    }
  });

  // Stealth: Hide webdriver
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  const page = await context.newPage();

  // -----------------------------
  // DEBUG API CALLS & RESPONSES
  // -----------------------------
  let loginRequested = false;
  page.on("request", (req: Request) => {
    const url = req.url();
    if (url.includes("login") || url.includes("auth") || url.includes("authenticate")) {
      console.log("\nLOGIN REQUEST DETECTED:", url);
      loginRequested = true;
    }
  });

  page.on("response", async (res) => {
    const url = res.url();
    if (url.includes("login") || url.includes("auth") || url.includes("authenticate")) {
      console.log(`API RESPONSE [${res.status()}]:`, url);
      if (res.status() !== 200) {
        try {
          const body = await res.text();
          console.log("ERROR RESPONSE BODY:", body.substring(0, 500));
        } catch (e) { }
      }
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
  const usernameInput = modal.locator('input[formcontrolname="username"]');
  const passwordInput = modal.locator('input[formcontrolname="password"]');

  console.log("Typing username...");
  await usernameInput.click();
  await usernameInput.fill("");
  await page.keyboard.type(`${process.env.USERNAME}`, { delay: 150 });
  await page.waitForTimeout(500);

  console.log("Tabbing to password...");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(500);

  console.log("Typing password...");
  await page.keyboard.type(`${process.env.PASSWORD}`, { delay: 150 });
  await page.waitForTimeout(1000);

  const loginButton = modal.locator('button[type="submit"]');
  const isEnabled = await loginButton.isEnabled();
  const isVisible = await loginButton.isVisible();
  console.log(`Login Button - Visible: ${isVisible}, Enabled: ${isEnabled}`);

  console.log("Submitting via Enter key and waiting for response...");
  const authResponsePromise = page.waitForResponse(res => res.url().includes("/p/auth") || res.url().includes("/api/auth"), { timeout: 20000 });

  await page.keyboard.press("Enter");

  // Wait for either the auth response, the balance indicator, or a timeout
  try {
    const result = await Promise.race([
      authResponsePromise,
      page.waitForSelector("#account-menu-open-button", { timeout: 20000 }),
      page.waitForSelector(".toast-message, .error-message", { timeout: 20000 })
    ]);
    console.log("Login event/indicator detected.");

    // If it was a response, log its status
    if (typeof result !== 'boolean' && 'status' in result) {
      console.log(`Auth Response Status: ${result.status()}`);
      if (result.status() !== 200) {
        const errorBody = await result.text();
        console.log("Auth Error Details:", errorBody.substring(0, 500));
      }
    }
  } catch (e) {
    console.log("No auth response or dashboard indicators found within 20s. Trying fallback click...");
    if (isEnabled) {
      await loginButton.click({ force: true });
    } else {
      console.log("CANNOT CLICK: Login button is DISABLED.");
    }
    await page.waitForTimeout(5000);
  }

  // -----------------------------
  // BALANCE
  // -----------------------------
  let balanceText: string | null = null;
  try {
    balanceText = await page
      .locator("#account-menu-open-button span")
      .textContent({ timeout: 10000 }); // reduce timeout to fail faster
  } catch (error) {
    console.log("\n--- LOGIN FAILED. EXTRACTING DIAGNOSTICS ---");
    if (!loginRequested) {
      console.log("CRITICAL: No login/auth request was even attempted by the browser.");
    }
    const currentUrl = page.url();
    const currentTitle = await page.title();
    console.log("Current URL:", currentUrl);
    console.log("Page Title:", currentTitle);

    try {
      const modalText = await page.locator("modal-container").innerText();
      if (modalText.trim()) {
        console.log("MODAL TEXT:\n", modalText);
      }
    } catch (e) { }

    try {
      const toastText = await page.locator(".toast-message, .ng-trigger-toastAnimation, .error-message, .alert").allInnerTexts();
      if (toastText.length > 0) {
        console.log("ALERT/TOAST TEXT:\n", toastText.join("\n"));
      }
    } catch (e) { }

    console.log("-------------------------------------------\n");
    await page.screenshot({ path: "login-failure.png", fullPage: true });
    await browser.close();
    throw new Error(`Could not reach dashboard after login. URL: ${currentUrl}, Title: ${currentTitle}. Check console logs above.`);
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