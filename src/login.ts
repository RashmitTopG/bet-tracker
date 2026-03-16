import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { type Request } from "playwright";
import { sendMessage } from "./message.js";
import axios from "axios"

// Initialize stealth plugin
chromium.use(stealth());

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

  // Shuffle proxies to pick a random order
  const shuffledProxies = proxies.sort(() => 0.5 - Math.random());

  let workingProxy = null;

  console.log("Testing proxies to find a working one...");

  for (const pxy of shuffledProxies) {
    try {
      console.log(`Testing proxy ${pxy.proxy}:${pxy.port}...`);
      const proxyResult = await axios.get("https://google.com/", {
        timeout: 5000,
        proxy: {
          protocol: "http",
          host: pxy.proxy,
          port: parseInt(pxy.port),
          auth: {
            username: pxy.username,
            password: pxy.password
          }
        }
      });

      if (proxyResult.status === 200) {
        console.log(`Success: Proxy ${pxy.proxy} is working.`);
        workingProxy = pxy;
        break; // found a working proxy, exit loop
      }
    } catch (error: any) {
      console.log(` Failed: Proxy ${pxy.proxy} error: ${error.message}`);
    }
  }

  if (!workingProxy) {
    console.log("WARNING: Could not find any working proxies. Proceeding WITHOUT proxy (EC2 IP).");
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ],
    ...(workingProxy ? {
      proxy: {
        server: `http://${workingProxy.proxy}:${workingProxy.port}`,
        username: workingProxy.username,
        password: workingProxy.password
      }
    } : {})
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    locale: "en-US",
    timezoneId: "Asia/Kolkata",
    extraHTTPHeaders: {
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://fairplaypro.com/",
      "Origin": "https://fairplaypro.com",
      "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"macOS"'
    }
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
    if (url.includes("login") || url.includes("auth") || url.includes("authenticate") || url.includes("api")) {
      console.log(`API RESPONSE [${res.status()}]:`, url);
      if (res.status() !== 200) {
        try {
          const body = await res.text();
          console.log(`ERROR RESPONSE [${res.status()}]:`, body.substring(0, 500));
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
  // Ensure the field is cleared properly in a way Angular detects
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await usernameInput.type(`${process.env.USERNAME}`, { delay: 150 });
  await page.waitForTimeout(500);

  console.log("Tabbing to password...");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(500);

  console.log("Typing password...");
  await passwordInput.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await passwordInput.type(`${process.env.PASSWORD}`, { delay: 150 });
  await page.waitForTimeout(1000);

  const loginButton = modal.locator('.btn-group button[type="submit"]');
  const isEnabled = await loginButton.isEnabled().catch(() => false);
  const isVisible = await loginButton.isVisible().catch(() => false);

  console.log(`Login Button Visible: ${isVisible}, Enabled: ${isEnabled}`);

  console.log("Submitting via Click and waiting for response...");
  const authResponsePromise = page.waitForResponse(res => res.url().includes("/p/auth") || res.url().includes("/api/auth") || res.url().includes("/login"), { timeout: 15000 }).catch(() => null);

  // Click aggressively
  await loginButton.click({ force: true, delay: 100 }).catch(() => {});
  
  // Also press Enter just in case the click missed the event listener
  await page.keyboard.press("Enter");

  // Wait for either the auth response, the balance indicator, or a timeout
  try {
    console.log("Waiting for auth response or dashboard indicators...");
    const result = await Promise.race([
      authResponsePromise,
      page.waitForSelector("#account-menu-open-button", { timeout: 20000 }).catch(() => "timeout_dashboard"),
      page.waitForSelector(".toast-message, .error-message, .alert", { timeout: 20000 }).catch(() => "timeout_alert")
    ]);
    console.log("Race finished. Result type:", typeof result === 'string' ? result : 'response object');

    // If it was a response, log its status
    if (result && typeof result !== 'string' && 'status' in result) {
      console.log(`Auth Response Status Recorded: ${result.status()}`);
      try {
        const body = await result.text();
        console.log("Auth Response Body Sample:", body.substring(0, 300));
      } catch (e) {}
      
      if (result.status() !== 200) {
        console.log("Login API failed with status", result.status());
      } else {
        console.log("Login API call succeeded (200 OK)!");
      }
    }
    
    // Explicitly wait for the redirect or dashboard to load
    console.log("Waiting for dashboard DOM or potential redirect...");
    await page.waitForTimeout(5000);
    
  } catch (e) {
    console.log("Error during login race:", e);
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