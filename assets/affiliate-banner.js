(() => {
  "use strict";

  if (window.__achanbayAffiliateBannerLoaded) return;
  window.__achanbayAffiliateBannerLoaded = true;

  const loader = document.currentScript;
  const configUrl = loader?.dataset.config || "./assets/affiliate-banners.json";
  const prefix = "achanbay_affiliate_banner_v13_";
  const now = Date.now();

  const storage = {
    get(key) {
      try { return window.localStorage.getItem(prefix + key); } catch (_) { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(prefix + key, String(value)); } catch (_) {}
    }
  };

  const normalise = value => String(value || "").trim().toLowerCase();
  const asList = value => Array.isArray(value) ? value.map(normalise) : [];

  function wildcardMatch(pattern, value) {
    if (pattern === "*" || pattern === "all") return true;
    if (!pattern.includes("*")) return pattern === value;
    const escaped = pattern.split("*").map(part => part.replace(/[|\\{}()[\]^$+?.-]/g, "\\$&")).join(".*");
    return new RegExp("^" + escaped + "$").test(value);
  }

  function listMatches(list, value) {
    const values = asList(list);
    return !values.length || values.some(item => wildcardMatch(item, normalise(value)));
  }

  function pageCategory(path) {
    const genreMatch = path.match(/genre-(ramen|chinese|cafe|japanese|izakaya|other)\.html/);
    if (genreMatch) return genreMatch[1];
    if (/shops\.html/.test(path)) {
      const selectedGenre = normalise(new URLSearchParams(window.location.search).get("genre"));
      const queryCategory = [
        ["ramen", /ラーメン|つけ麺/],
        ["chinese", /中華|餃子/],
        ["cafe", /カフェ|喫茶|スイーツ/],
        ["japanese", /和食|日本料理|寿司|そば|うどん|とんかつ/],
        ["izakaya", /居酒屋|バー/]
      ].find(([, pattern]) => pattern.test(selectedGenre));
      return queryCategory?.[0] || "directory";
    }
    if (/area-/.test(path)) return "directory";
    if (path === "/" || /index\.html/.test(path)) return "home";

    const linkedGenre = ["ramen", "chinese", "cafe", "japanese", "izakaya", "other"]
      .find(category => document.querySelector(`a[href$="genre-${category}.html"]`));
    return linkedGenre || "other";
  }

  function trafficSource() {
    const params = new URLSearchParams(window.location.search);
    const campaignSource = normalise(params.get("utm_source"));
    if (campaignSource) return campaignSource;
    if (!document.referrer) return "direct";
    try {
      const host = new URL(document.referrer).hostname;
      if (/instagram|facebook|t\.co|twitter|x\.com/.test(host)) return "social";
      if (/google|bing|yahoo/.test(host)) return "search";
      if (host === window.location.hostname) return "internal";
      return "referral";
    } catch (_) {
      return "other";
    }
  }

  function visitorType() {
    const seen = storage.get("seen");
    storage.set("seen", now);
    return seen ? "returning" : "new";
  }

  function context(config) {
    const settings = config.personalization || {};
    return {
      path: normalise(window.location.pathname || "/"),
      category: settings.usePageCategory === false ? "all" : pageCategory(window.location.pathname),
      device: settings.useDevice === false ? "all" : (window.matchMedia("(max-width: 640px)").matches ? "mobile" : "desktop"),
      source: settings.useTrafficSource === false ? "all" : trafficSource(),
      visitorType: settings.useVisitorType === false ? "all" : visitorType()
    };
  }

  function isWithinSchedule(ad) {
    const start = ad.startAt ? Date.parse(ad.startAt) : null;
    const end = ad.endAt ? Date.parse(ad.endAt) : null;
    if ((start !== null && !Number.isFinite(start)) || (end !== null && !Number.isFinite(end))) return false;
    return (start === null || start <= now) && (end === null || end >= now);
  }

  function isFrequencyCapped(ad, placement) {
    const hours = Number(ad.frequencyCapHours || 0);
    if (!hours) return false;
    const lastShown = Number(storage.get("impression_" + placement + "_" + ad.id) || 0);
    return Boolean(lastShown && now - lastShown < hours * 60 * 60 * 1000);
  }

  function isAllowedInPlacement(ad, config, placement) {
    const placementConfig = config.placements?.[placement];
    const adIds = placementConfig?.adIds;
    const fallbackAdIds = placementConfig?.fallbackAdIds;
    if ((!Array.isArray(adIds) || !adIds.length) &&
        (!Array.isArray(fallbackAdIds) || !fallbackAdIds.length)) return true;
    return (Array.isArray(adIds) && adIds.includes(ad.id)) ||
      (Array.isArray(fallbackAdIds) && fallbackAdIds.includes(ad.id));
  }

  function isEligible(ad, config, ctx, placement) {
    const hasOfficialCreative = ad?.creativeType === "rakuten-official-html" &&
      typeof ad.officialHtml === "string" && Boolean(ad.officialHtml.trim());
    if (!ad || ad.active === false || !ad.id || (!ad.destinationUrl && !hasOfficialCreative)) return false;
    if (!isAllowedInPlacement(ad, config, placement)) return false;
    if (!isWithinSchedule(ad) || isFrequencyCapped(ad, placement)) return false;
    const target = ad.targeting || {};
    return listMatches(target.paths, ctx.path) &&
      listMatches(target.categories, ctx.category) &&
      listMatches(target.devices, ctx.device) &&
      listMatches(target.sources, ctx.source) &&
      listMatches(target.visitorTypes, ctx.visitorType);
  }

  function relevanceScore(ad, ctx) {
    const target = ad.targeting || {};
    let score = Number(ad.priority || 0);
    if (asList(target.paths).length && !asList(target.paths).some(value => value === "*" || value === "all")) score += 40;
    if (asList(target.categories).length && !asList(target.categories).includes("all")) score += 35;
    if (asList(target.devices).length && !asList(target.devices).includes("all")) score += 15;
    if (asList(target.sources).length && !asList(target.sources).includes("all")) score += 25;
    if (asList(target.visitorTypes).length && !asList(target.visitorTypes).includes("all")) score += 10;
    return score;
  }

  function adWeight(ad) {
    const weight = Number(ad.weight);
    return Number.isFinite(weight) ? Math.max(0, weight) : 1;
  }

  function chooseAd(ads, ttlHours, ctx, placement) {
    const bestScore = Math.max(...ads.map(ad => relevanceScore(ad, ctx)));
    const candidates = ads.filter(ad => relevanceScore(ad, ctx) === bestScore);
    const storedId = storage.get("selected_" + placement + "_id");
    const selectedAt = Number(storage.get("selected_" + placement + "_at") || 0);
    const ttl = Math.max(0, Number(ttlHours || 0)) * 60 * 60 * 1000;
    const stored = candidates.find(ad => ad.id === storedId);
    if (stored && (!ttl || now - selectedAt < ttl)) return stored;

    const total = candidates.reduce((sum, ad) => sum + adWeight(ad), 0);
    let cursor = Math.random() * (total || candidates.length);
    const selected = candidates.find(ad => {
      cursor -= total ? adWeight(ad) : 1;
      return cursor <= 0;
    }) || candidates[0];

    storage.set("selected_" + placement + "_id", selected.id);
    storage.set("selected_" + placement + "_at", now);
    return selected;
  }

  function eligibleAdsForPlacement(ads, config, ctx, placement) {
    const eligible = ads.filter(ad => isEligible(ad, config, ctx, placement));
    const placementConfig = config.placements?.[placement];
    const fallbackAdIds = placementConfig?.fallbackAdIds;
    if (!Array.isArray(fallbackAdIds) || !fallbackAdIds.length) return eligible;

    const primaryAdIds = Array.isArray(placementConfig?.adIds) ? placementConfig.adIds : [];
    const primary = eligible.filter(ad => primaryAdIds.includes(ad.id));
    if (primary.length) return primary;
    return eligible.filter(ad => fallbackAdIds.includes(ad.id));
  }

  function track(eventName, ad, ctx, placement, details = {}) {
    if (window.__achanbayAnalyticsOptOut === true) return;
    const parameters = {
      ad_id: ad.id,
      ad_name: ad.title || ad.id,
      ad_placement: placement,
      asp: ad.asp || "unknown",
      creative_type: ad.creativeType || "product-card",
      page_category: ctx.category,
      page_path: window.location.pathname,
      page_title: document.title,
      device_type: ctx.device,
      traffic_source: ctx.source,
      visitor_type: ctx.visitorType,
      ...details
    };
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, parameters);
    } else {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: eventName, ...parameters });
    }
  }

  function promotionDetails(ad, placement) {
    const promotion = {
      promotion_id: ad.id,
      promotion_name: ad.title || ad.id,
      creative_name: ad.creativeType || "product-card",
      creative_slot: placement
    };
    return {
      ...promotion,
      items: [{
        item_id: ad.id,
        item_name: ad.title || ad.id,
        affiliation: ad.asp || "unknown",
        item_category: "affiliate",
        ...promotion
      }]
    };
  }

  function trackClick(ad, ctx, placement, details) {
    track("affiliate_banner_click", ad, ctx, placement, details);
    track("select_promotion", ad, ctx, placement, {
      ...promotionDetails(ad, placement),
      ...details
    });
  }

  function trackImpression(ad, ctx, placement) {
    track("affiliate_banner_impression", ad, ctx, placement);
    track("view_promotion", ad, ctx, placement, promotionDetails(ad, placement));
  }

  function analyticsLink(value) {
    try {
      const parsed = new URL(String(value || ""), window.location.href);
      return `${parsed.hostname}${parsed.pathname}`.slice(0, 100);
    } catch (_) {
      return String(value || "").slice(0, 100);
    }
  }

  function addStyles() {
    if (document.getElementById("achanbay-affiliate-banner-style")) return;
    const style = document.createElement("style");
    style.id = "achanbay-affiliate-banner-style";
    style.textContent = `
      .achanbay-affiliate-slot{box-sizing:border-box;width:min(100%,1120px);margin:30px auto;padding:0 18px}
      .seo-main>.achanbay-affiliate-slot{padding:0}
      .achanbay-affiliate-card{box-sizing:border-box;display:grid;min-width:0;align-items:center;gap:14px;color:#38251d;background:#fff8ed;border:1px solid #edc9a8;border-radius:16px;box-shadow:0 10px 24px rgba(89,54,28,.09);font-family:"Noto Sans JP",sans-serif;text-align:left}
      .achanbay-affiliate-card--inline{grid-template-columns:auto minmax(0,1fr);width:min(100%,840px);margin:0 auto;padding:18px}
      .achanbay-affiliate-card__visual{display:block;grid-row:1/3;align-self:start;max-width:100%;line-height:0}
      .achanbay-affiliate-card__visual img{display:block;width:auto;height:auto;max-width:100%;border:0}
      .achanbay-affiliate-card__body{min-width:0}
      .achanbay-affiliate-card__label{display:inline-flex;margin-bottom:8px;padding:4px 9px;color:#8e294c;background:#ffe5ee;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.03em}
      .achanbay-affiliate-card__title{display:block;margin:0;color:#38251d;font-size:18px;font-weight:800;line-height:1.45}
      .achanbay-affiliate-card__description{margin:7px 0 0;color:#775d51;font-family:"Noto Sans JP",sans-serif;font-size:13px;font-weight:400;line-height:1.7}
      .achanbay-affiliate-card__cta{display:inline-flex;grid-column:2;align-items:center;justify-content:center;justify-self:start;min-height:44px;padding:9px 16px;color:#fff;background:#bf0000;border:2px solid #38251d;border-radius:999px;box-shadow:2px 3px 0 #38251d;font-size:13px;font-weight:800;text-decoration:none;white-space:nowrap}
      .achanbay-affiliate-card__cta:hover,.achanbay-affiliate-card__cta:focus-visible{color:#fff;background:#a90000;transform:translateY(-1px)}
      .achanbay-affiliate-card--official{display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px}
      .achanbay-affiliate-card__official-heading{align-self:stretch;text-align:center}
      .achanbay-affiliate-card__official-heading .achanbay-affiliate-card__label{margin-bottom:5px}
      .achanbay-affiliate-card__official{max-width:100%;line-height:0;text-align:center}
      .achanbay-affiliate-card__official a{display:block;max-width:100%}
      .achanbay-affiliate-card__official img{display:block;max-width:100%;height:auto;margin:2px auto!important}
      .landing-grid>.achanbay-affiliate-slot{grid-column:1/-1;width:100%;margin:8px auto;padding:0}
      @media(max-width:640px){
        .achanbay-affiliate-slot{margin:24px auto;padding:0}
        .seo-main>.achanbay-affiliate-slot{width:calc(100% + 32px);margin-right:-16px;margin-left:-16px}
        .achanbay-affiliate-card--inline{grid-template-columns:1fr;gap:13px;padding:10px;border-right:0;border-left:0;border-radius:0}
        .achanbay-affiliate-card--official{display:flex;padding:8px 0 10px}
        .achanbay-affiliate-card__official-heading{padding:0 10px}
        .achanbay-affiliate-card__visual{grid-row:auto;justify-self:center}
        .achanbay-affiliate-card__cta{grid-column:1;justify-self:stretch;width:100%}
        .achanbay-affiliate-card__title{font-size:16px}
        .achanbay-affiliate-card__description{font-size:12px}
      }
    `;
    document.head.appendChild(style);
  }

  function affiliateLink(ad, ctx, placement, className, label, clickArea) {
    const link = document.createElement("a");
    link.className = className;
    link.href = ad.destinationUrl;
    link.target = "_blank";
    link.rel = ad.sponsored === false ? "noopener noreferrer" : "sponsored nofollow noopener noreferrer";
    if (label) link.setAttribute("aria-label", label);
    link.addEventListener("click", () => trackClick(ad, ctx, placement, {
      click_area: clickArea || "link",
      link_url: analyticsLink(ad.destinationUrl)
    }));
    return link;
  }

  function hasOnlyAllowedAttributes(element, allowedNames) {
    return Array.from(element.attributes).every(attribute => allowedNames.includes(attribute.name));
  }

  function parseOfficialCreative(ad) {
    const template = document.createElement("template");
    template.innerHTML = String(ad.officialHtml || "").trim();
    const topLevelElements = Array.from(template.content.children);
    if (topLevelElements.length !== 1) return null;

    const link = topLevelElements[0];
    const hasUnexpectedTopLevelText = Array.from(template.content.childNodes)
      .some(node => node !== link && normalise(node.textContent));
    if (hasUnexpectedTopLevelText || link.tagName !== "A" || link.childElementCount !== 1) return null;

    const image = link.children[0];
    const hasUnexpectedLinkText = Array.from(link.childNodes)
      .some(node => node !== image && normalise(node.textContent));
    if (hasUnexpectedLinkText || image.tagName !== "IMG") return null;
    if (!hasOnlyAllowedAttributes(link, ["href", "target", "rel", "style"])) return null;
    if (!hasOnlyAllowedAttributes(image, ["src", "border", "style", "alt", "title"])) return null;

    try {
      const destination = new URL(link.getAttribute("href"), window.location.href);
      const creative = new URL(image.getAttribute("src"), window.location.href);
      const rel = new Set(normalise(link.getAttribute("rel")).split(/\s+/));
      if (destination.protocol !== "https:" || destination.hostname !== "hb.afl.rakuten.co.jp" || !destination.pathname.startsWith("/hsc/")) return null;
      if (creative.protocol !== "https:" || creative.hostname !== "hbb.afl.rakuten.co.jp" || !creative.pathname.startsWith("/hsb/")) return null;
      if (link.getAttribute("target") !== "_blank") return null;
      if (!["nofollow", "sponsored", "noopener"].every(value => rel.has(value))) return null;
    } catch (_) {
      return null;
    }

    return template.content;
  }

  function createOfficialBanner(ad, ctx, placement) {
    const officialCreative = parseOfficialCreative(ad);
    if (!officialCreative) return null;

    const card = document.createElement("div");
    card.className = "achanbay-affiliate-card achanbay-affiliate-card--" + placement + " achanbay-affiliate-card--official";
    card.dataset.adId = ad.id;
    card.dataset.adPlacement = placement;
    card.setAttribute("role", "region");
    card.setAttribute("aria-label", "記事内の楽天アフィリエイト広告");

    const heading = document.createElement("div");
    heading.className = "achanbay-affiliate-card__official-heading";
    const label = document.createElement("span");
    label.className = "achanbay-affiliate-card__label";
    label.textContent = ad.label || "楽天アフィリエイト広告";
    const title = document.createElement("strong");
    title.className = "achanbay-affiliate-card__title";
    title.textContent = ad.title || "楽天市場のキャンペーン";
    heading.append(label, title);

    const host = document.createElement("div");
    host.className = "achanbay-affiliate-card__official";
    host.appendChild(officialCreative);
    const creativeLink = host.querySelector("a");
    const creativeImage = host.querySelector("img");
    creativeLink?.setAttribute("aria-label", `${ad.title || "楽天市場のキャンペーン"}を見る`);
    if (creativeImage && !creativeImage.getAttribute("alt")) {
      creativeImage.setAttribute("alt", ad.title || "楽天市場のキャンペーン");
    }
    host.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest("a");
      if (!link) return;
      trackClick(ad, ctx, placement, {
        click_area: target?.closest("img") ? "image" : "creative",
        link_url: analyticsLink(link.href)
      });
    });
    card.append(heading, host);
    return card;
  }

  function createCard(ad, ctx, placement) {
    if (ad.creativeType === "rakuten-official-html") {
      return createOfficialBanner(ad, ctx, placement);
    }

    const card = document.createElement("div");
    card.className = "achanbay-affiliate-card achanbay-affiliate-card--" + placement;
    card.dataset.adId = ad.id;
    card.dataset.adPlacement = placement;
    card.setAttribute("role", "region");
    card.setAttribute("aria-label", ad.sponsored === false ? "記事内のおすすめ情報" : "記事内の楽天アフィリエイト広告");

    if (ad.imageUrl) {
      const visual = affiliateLink(ad, ctx, placement, "achanbay-affiliate-card__visual", `${ad.title || "商品"}を楽天市場で見る`, "image");
      const image = document.createElement("img");
      image.src = ad.imageUrl;
      image.alt = ad.imageAlt || ad.title || "楽天市場の商品";
      image.width = Math.max(1, Number(ad.imageWidth || 240));
      image.height = Math.max(1, Number(ad.imageHeight || 240));
      card.classList.add("has-image");
      image.addEventListener("error", () => {
        card.classList.remove("has-image");
        visual.remove();
      });
      visual.appendChild(image);
      card.appendChild(visual);
    }

    const body = document.createElement("div");
    body.className = "achanbay-affiliate-card__body";

    const label = document.createElement("span");
    label.className = "achanbay-affiliate-card__label";
    label.textContent = ad.label || (ad.sponsored === false ? "おすすめ" : "広告・PR");

    const title = document.createElement("strong");
    title.className = "achanbay-affiliate-card__title";
    title.textContent = ad.title || "おすすめ情報";
    body.append(label, title);

    if (ad.description) {
      const description = document.createElement("p");
      description.className = "achanbay-affiliate-card__description";
      description.textContent = ad.description;
      body.appendChild(description);
    }

    const link = affiliateLink(ad, ctx, placement, "achanbay-affiliate-card__cta", null, "cta");
    link.textContent = ad.cta || "詳しく見る";

    card.append(body, link);
    return card;
  }

  function placementTarget(placement) {
    if (placement === "inline") {
      return document.querySelector(".seo-layout") ||
        document.querySelector(".article-layout") ||
        document.querySelector(".landing-grid .landing-card:nth-child(4)") ||
        document.querySelector(".landing-grid .landing-card:last-child") ||
        document.querySelector(".meal-gallery") ||
        document.querySelector("#instagram-latest") ||
        document.querySelector("#ranking") ||
        document.querySelector(".featured-guides") ||
        document.querySelector(".seo-hero.landing-intro") ||
        document.querySelector("main > section");
    }
    if (placement === "campaign") {
      return document.querySelector("#instagram-latest");
    }
    return null;
  }

  function renderPlacement(ad, ctx, placement) {
    const target = placementTarget(placement);
    if (!target) return false;
    addStyles();
    const card = createCard(ad, ctx, placement);
    if (!card) return false;
    const slot = document.createElement("aside");
    slot.className = "achanbay-affiliate-slot";
    slot.setAttribute("aria-label", "楽天アフィリエイト広告");
    slot.setAttribute("data-nosnippet", "");
    slot.appendChild(card);
    target.after(slot);

    const recordImpression = () => {
      const viewedAt = Date.now();
      storage.set("impression_" + placement + "_" + ad.id, viewedAt);
      storage.set("global_impression_" + placement, viewedAt);
      trackImpression(ad, ctx, placement);
    };

    if ("IntersectionObserver" in window) {
      let qualificationTimer = null;
      const observer = new window.IntersectionObserver(entries => {
        const qualified = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5);
        if (!qualified) {
          if (qualificationTimer) window.clearTimeout(qualificationTimer);
          qualificationTimer = null;
          return;
        }
        if (qualificationTimer) return;
        qualificationTimer = window.setTimeout(() => {
          observer.disconnect();
          qualificationTimer = null;
          recordImpression();
        }, 1000);
      }, { threshold: [0.5] });
      observer.observe(card);
    } else {
      recordImpression();
    }
    return true;
  }

  function isPlacementCapped(config, placement) {
    const hours = Math.max(0, Number(config.globalFrequencyCapHours || 0));
    const lastImpression = Number(storage.get("global_impression_" + placement) || 0);
    return Boolean(hours && lastImpression && now - lastImpression < hours * 60 * 60 * 1000);
  }

  async function initialise() {
    try {
      const response = await fetch(configUrl, { credentials: "same-origin", cache: "no-cache" });
      if (!response.ok) throw new Error("Banner config request failed");
      const config = await response.json();
      if (!config.enabled || !Array.isArray(config.ads)) return;

      const ctx = context(config);
      const usedIds = new Set();
      const placements = ["inline", "campaign"];

      const display = () => {
        placements.forEach(placement => {
          if (!placementTarget(placement) || isPlacementCapped(config, placement)) return;
          const eligible = eligibleAdsForPlacement(config.ads, config, ctx, placement);
          const candidates = eligible.filter(ad => !usedIds.has(ad.id));
          if (!candidates.length) return;
          const ad = chooseAd(candidates, config.selectionTtlHours, ctx, placement);
          if (renderPlacement(ad, ctx, placement)) usedIds.add(ad.id);
        });
      };

      const delay = Math.max(0, Number(config.displayDelayMs || 0));
      if (delay) window.setTimeout(display, delay);
      else display();
    } catch (error) {
      if (window.console) console.warn("[Achanbay banner]", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialise, { once: true });
  } else {
    initialise();
  }
})();
