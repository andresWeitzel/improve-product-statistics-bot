import {
  sleep,
  safeGoto,
  dismissCookieBanner,
  simulateHumanBrowse,
  readPageUrl,
  isNavRaceError,
} from "../shared/browser.js";

async function openFacebookListing(page, itemUrl, navTimeoutMs) {
  const hubUrl = "https://www.facebook.com/marketplace/?ref=app_tab";

  try {
    await page.goto(hubUrl, {
      waitUntil: "domcontentloaded",
      timeout: Math.min(navTimeoutMs, 40000),
    });
    await dismissCookieBanner(page, "facebook");
    await sleep(1000 + Math.random() * 1000);
  } catch (err) {
    console.log(`[FB] ⚠️ Hub Marketplace: ${err.message} — sigo al item`);
  }

  return safeGoto(page, itemUrl, {
    waitUntil: "domcontentloaded",
    timeout: navTimeoutMs,
    referer: hubUrl,
  });
}

async function probeFacebookListing(page) {
  return page.evaluate(() => {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ");
    const title = document.title || "";
    return {
      title,
      href: location.href || "",
      hasPrice: /\$\s?\d|ARS\s*\d|USD\s*\d|\d[\d.]*\s*(ARS|USD)/i.test(text),
      hasMessage:
        /enviar mensaje|message seller|enviar un mensaje|\bmessage\b/i.test(text),
      hasUnavailable:
        /no disponible|no longer available|contenido no disponible|esta publicaci[oó]n no est/i.test(
          text
        ),
      snippet: text.slice(0, 180),
    };
  });
}

function looksLikeFbMarketplaceListing(url, title) {
  const onItem = /marketplace\/item\//i.test(url || "");
  const titleOk =
    /marketplace/i.test(title || "") ||
    (Boolean(title) &&
      title.length > 20 &&
      !/^facebook$/i.test(title.trim()) &&
      !/log\s?in|iniciar sesi/i.test(title));
  return onItem && titleOk;
}

async function assertFacebookListingLoaded(page, productName) {
  const finalUrl = await readPageUrl(page);
  if (/\/login|checkpoint/i.test(finalUrl)) {
    throw new Error(`Redirigido a login/checkpoint: ${finalUrl}`);
  }

  let check = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    let pageTitle = "";
    let pageHref = finalUrl;
    try {
      pageTitle = await page.title();
      pageHref = (await readPageUrl(page)) || finalUrl;
      check = await probeFacebookListing(page);
    } catch (err) {
      if (isNavRaceError(err) && attempt < 5) {
        await sleep(800);
        continue;
      }
      throw err;
    }

    const title = check?.title || pageTitle || "";
    const href = check?.href || pageHref || "";

    if (check?.hasUnavailable) {
      throw new Error(`Publicación no disponible: ${productName}`);
    }

    const usable =
      check?.hasPrice ||
      check?.hasMessage ||
      looksLikeFbMarketplaceListing(href, title) ||
      looksLikeFbMarketplaceListing(pageHref, pageTitle);

    if (usable) {
      return {
        ...check,
        title,
        hasMarketplaceTitle: /marketplace/i.test(title),
        hasListingUrl: /marketplace\/item\//i.test(href || pageHref),
      };
    }

    await sleep(800 + attempt * 300);
  }

  throw new Error(
    `Listing FB sin contenido usable (${productName}): ${check?.title || check?.snippet || "vacío"}`
  );
}

async function interactFacebookListing(page) {
  try {
    const img = await page.$('img[src*="scontent"], img[alt]');
    if (img) {
      await img.click({ delay: 40 }).catch(() => {});
      await sleep(600);
    }
  } catch {
    // ignore
  }

  await simulateHumanBrowse(page);

  try {
    await page.mouse.click(400 + Math.random() * 200, 320 + Math.random() * 120);
    await sleep(400);
  } catch {
    // ignore
  }
}

/**
 * Visita un listing de Facebook Marketplace (hub → item → validación → interacción).
 */
export async function runFacebookVisit({ page, url, productName, navTimeoutMs, tag }) {
  const nav = await openFacebookListing(page, url, navTimeoutMs);
  console.log(`${tag} 📍 Landed: ${nav.finalUrl} (HTTP ${nav.status})`);

  await dismissCookieBanner(page, "facebook");

  const check = await assertFacebookListingLoaded(page, productName);
  console.log(
    `${tag} 📄 Listing OK · price=${check.hasPrice} msg=${check.hasMessage} mkt=${Boolean(check.hasMarketplaceTitle)} · ${page.url()}`
  );
  await interactFacebookListing(page);

  return nav;
}
