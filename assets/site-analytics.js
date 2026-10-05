(() => {
  "use strict";

  if (window.__achanbayAnalyticsLoaded) return;
  window.__achanbayAnalyticsLoaded = true;

  const measurementId = "G-JF0EBJ85Z0";
  const disableProperty = `ga-disable-${measurementId}`;
  const optOutStorageKey = "achanbay_analytics_opt_out_v1";
  const campaignStorageKey = "achanbay_campaign_context_v1";
  const campaignParameters = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term"
  ];
  const controlParameter = "analytics";
  const supportedControlModes = new Set(["off", "on"]);

  function cleanAnalyticsValue(value, maximumLength = 100) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, maximumLength);
  }

  function readStoredCampaign() {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(campaignStorageKey) || "null");
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
      return campaignParameters.reduce((campaign, parameter) => {
        const value = cleanAnalyticsValue(stored[parameter]);
        if (value) campaign[parameter] = value;
        return campaign;
      }, {});
    } catch (_) {
      return {};
    }
  }

  function campaignAttribution() {
    let incoming = {};
    try {
      const parameters = new URL(window.location.href).searchParams;
      incoming = campaignParameters.reduce((campaign, parameter) => {
        const value = cleanAnalyticsValue(parameters.get(parameter));
        if (value) campaign[parameter] = value;
        return campaign;
      }, {});
    } catch (_) {
      return readStoredCampaign();
    }

    if (!Object.keys(incoming).length) return readStoredCampaign();
    try {
      window.sessionStorage.setItem(campaignStorageKey, JSON.stringify(incoming));
    } catch (_) {
      // The current page can still use its UTM values if session storage is blocked.
    }
    return incoming;
  }

  function requestedControlMode() {
    try {
      const value = new URL(window.location.href).searchParams.get(controlParameter);
      return supportedControlModes.has(value) ? value : null;
    } catch (_) {
      return null;
    }
  }

  function removeControlParameter() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(controlParameter);
      const query = url.searchParams.toString();
      const cleanUrl = `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
      window.history.replaceState(window.history.state, "", cleanUrl);
    } catch (_) {
      // Analytics control still works if a browser blocks History API access.
    }
  }

  function readStoredOptOut() {
    try {
      return window.localStorage.getItem(optOutStorageKey) === "1";
    } catch (_) {
      return false;
    }
  }

  function storeOptOut(mode) {
    try {
      if (mode === "off") {
        window.localStorage.setItem(optOutStorageKey, "1");
      } else if (mode === "on") {
        window.localStorage.removeItem(optOutStorageKey);
      }
      return mode !== "off" || readStoredOptOut();
    } catch (_) {
      return false;
    }
  }

  function renderAnalyticsControls(isOptedOut, controlMode, persisted) {
    const render = () => {
      document.querySelectorAll("[data-analytics-status]").forEach(element => {
        element.textContent = isOptedOut
          ? persisted
            ? "現在：このブラウザのアクセス計測は停止中です。"
            : "現在：このページの計測は停止中ですが、端末には保存できませんでした。"
          : "現在：このブラウザはアクセス計測の対象です。";
      });
      document.querySelectorAll('[data-analytics-control="off"]').forEach(element => {
        element.hidden = isOptedOut && persisted;
      });
      document.querySelectorAll('[data-analytics-control="on"]').forEach(element => {
        element.hidden = !isOptedOut;
      });

      if (!controlMode || document.getElementById("analytics-control-notice")) return;
      const notice = document.createElement("div");
      notice.id = "analytics-control-notice";
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      notice.textContent = controlMode === "on"
        ? "この端末のアクセス計測を再開しました。"
        : persisted
          ? "この端末のアクセス計測を停止しました。"
          : "このページの計測は停止しましたが、端末への設定保存に失敗しました。通常のブラウザでお試しください。";
      Object.assign(notice.style, {
        position: "fixed",
        zIndex: "2147483647",
        right: "16px",
        bottom: "16px",
        left: "16px",
        maxWidth: "680px",
        margin: "0 auto",
        padding: "14px 18px",
        color: "#ffffff",
        background: isOptedOut ? "#315d49" : "#38251d",
        border: "2px solid #ffffff",
        borderRadius: "12px",
        boxShadow: "0 8px 24px rgba(0,0,0,.24)",
        fontFamily: '"Noto Sans JP", sans-serif',
        fontSize: "14px",
        fontWeight: "700",
        lineHeight: "1.6",
        textAlign: "center"
      });
      document.body.appendChild(notice);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
      render();
    }
  }

  const controlMode = requestedControlMode();
  const persisted = controlMode ? storeOptOut(controlMode) : true;
  let analyticsOptOut = controlMode === "off"
    ? true
    : controlMode === "on"
      ? false
      : readStoredOptOut();

  window[disableProperty] = analyticsOptOut;
  window.__achanbayAnalyticsOptOut = analyticsOptOut;
  renderAnalyticsControls(analyticsOptOut, controlMode, persisted);
  if (controlMode) removeControlParameter();

  window.addEventListener("storage", event => {
    if (event.key !== optOutStorageKey) return;
    analyticsOptOut = event.newValue === "1";
    window[disableProperty] = analyticsOptOut;
    window.__achanbayAnalyticsOptOut = analyticsOptOut;
    renderAnalyticsControls(analyticsOptOut, null, true);
  });

  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return;
  if (analyticsOptOut) return;

  const campaignContext = campaignAttribution();

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: true
  });

  function trackEvent(eventName, parameters = {}) {
    if (analyticsOptOut || window.__achanbayAnalyticsOptOut === true) return;
    const eventParameters = {
      page_path: window.location.pathname,
      page_title: document.title,
      transport_type: "beacon",
      ...campaignContext,
      ...parameters
    };
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, eventParameters);
    } else {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: eventName, ...eventParameters });
    }
  }

  function linkPlatform(url) {
    const host = url.hostname.toLowerCase();
    if (host === "maps.app.goo.gl" ||
        ((host === "google.com" || host.endsWith(".google.com")) && url.pathname.includes("/maps"))) {
      return "google_maps";
    }
    if (host === "tabelog.com" || host.endsWith(".tabelog.com")) return "tabelog";
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
    return "external";
  }

  function analyticsLink(url) {
    if (url.protocol === "tel:") return "tel";
    return `${url.hostname}${url.pathname}`.slice(0, 120);
  }

  function isReviewProfileLink(link) {
    return Boolean(link.closest("#review-profiles, .review-profiles, .review-profile-card")) ||
      link.matches(".review-profile-link, .review-profile-sub-link");
  }

  function classifyLink(link) {
    if (link.closest(".achanbay-affiliate-slot") || link.matches("[data-analytics-control]")) return null;
    const rawHref = link.getAttribute("href") || "";
    if (!rawHref || rawHref.startsWith("mailto:") || rawHref.startsWith("javascript:")) return null;

    if (rawHref.startsWith("tel:")) {
      return {
        eventName: "restaurant_action_click",
        parameters: {
          action_type: "telephone",
          link_url: "tel",
          link_text: cleanAnalyticsValue(link.textContent, 80)
        }
      };
    }

    let url;
    try {
      url = new URL(rawHref, window.location.href);
    } catch (_) {
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const platform = linkPlatform(url);
    const sharedParameters = {
      link_url: analyticsLink(url),
      link_text: cleanAnalyticsValue(link.textContent, 80)
    };

    if (isReviewProfileLink(link)) {
      return {
        eventName: "review_profile_click",
        parameters: { review_platform: platform, ...sharedParameters }
      };
    }

    if (url.origin === window.location.origin) {
      const fileName = url.pathname.split("/").pop() || "index.html";
      const isCollectionPage = /^(?:index|shops|about|privacy|area-[^/]+|genre-[^/]+)\.html$/i.test(fileName);
      const isArticle = link.matches(".local-link") || (fileName.endsWith(".html") && !isCollectionPage);
      return {
        eventName: "select_content",
        parameters: {
          content_type: isArticle ? "internal_article" : "internal_navigation",
          item_id: `${url.pathname}${url.hash}`.slice(0, 120),
          ...sharedParameters
        }
      };
    }

    if (["google_maps", "tabelog", "instagram"].includes(platform)) {
      return {
        eventName: "restaurant_action_click",
        parameters: { action_type: platform, ...sharedParameters }
      };
    }
    return {
      eventName: "restaurant_action_click",
      parameters: { action_type: "official", ...sharedParameters }
    };
  }

  function directoryFilterParameters(form, filterAction) {
    const search = form.querySelector("#shop-search");
    const area = form.querySelector("#area-filter");
    const genre = form.querySelector("#genre-filter");
    const resultCount = Number.parseInt(document.querySelector("#result-count")?.textContent || "", 10);
    const query = String(search?.value || "").trim();
    const parameters = {
      filter_action: filterAction,
      query_present: Boolean(query),
      query_length: Math.min(query.length, 100),
      area_filter: cleanAnalyticsValue(area?.value || "all", 40),
      genre_filter: cleanAnalyticsValue(genre?.value || "all", 40)
    };
    if (Number.isFinite(resultCount)) parameters.result_count = resultCount;
    return parameters;
  }

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const reset = target.closest("#reset-filter");
    if (reset) {
      const form = reset.closest("form");
      if (form?.id === "shop-filter-form") {
        window.setTimeout(() => {
          trackEvent("directory_filter_apply", directoryFilterParameters(form, "reset"));
        }, 0);
      }
      return;
    }

    const link = target.closest("a[href]");
    if (!link) return;
    const tracking = classifyLink(link);
    if (tracking) trackEvent(tracking.eventName, tracking.parameters);
  });

  document.addEventListener("submit", event => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form || form.id !== "shop-filter-form") return;
    trackEvent("directory_filter_apply", directoryFilterParameters(form, "apply"));
  });

  if (document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${measurementId}"]`)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
})();
