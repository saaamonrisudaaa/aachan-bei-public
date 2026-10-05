(() => {
  "use strict";

  const grid = document.querySelector(".instagram-link-grid");
  if (!grid) return;

  const placeholderCaptions = new Set([
    "Instagramで最新の店舗投稿を見る",
    "Instagramで店舗投稿を見る"
  ]);

  const titleFromCaption = caption => {
    const firstLine = String(caption || "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line && !line.startsWith("#"));
    if (!firstLine || placeholderCaptions.has(firstLine)) return "";
    const cleaned = firstLine.replace(/\s*#.*$/, "").trim();
    return cleaned.length > 46 ? cleaned.slice(0, 45) + "..." : cleaned;
  };

  const isPhotoPost = post => {
    const kind = String(post?.type || "").trim().toLowerCase();
    const mediaType = String(post?.mediaType || "").trim().toUpperCase();
    return Boolean(
      post?.url &&
      String(post.imageUrl || "").trim() &&
      kind !== "reel" &&
      kind !== "video" &&
      mediaType !== "VIDEO" &&
      mediaType !== "REELS"
    );
  };

  const render = posts => {
    const latest = posts.filter(isPhotoPost).slice(0, 3);
    if (latest.length < 3) return;

    const fragment = document.createDocumentFragment();
    latest.forEach((post, index) => {
      const link = document.createElement("a");
      link.className = "instagram-post-link";
      link.href = post.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute(
        "aria-label",
        `Instagramの最新投稿${index + 1}を見る`
      );

      const captionTitle = titleFromCaption(post.caption);
      const titleText = captionTitle || "最新の店舗投稿をInstagramで見る";
      const imageUrl = String(post.imageUrl || "").trim();
      const placeholder = document.createElement("span");
      placeholder.className = "instagram-post-placeholder-mark";
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.textContent = "IG";
      link.appendChild(placeholder);

      if (imageUrl) {
        const media = document.createElement("span");
        media.className = "instagram-post-media";

        const image = document.createElement("img");
        image.className = "instagram-post-thumb";
        image.src = imageUrl;
        image.alt = titleText;
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("error", () => {
          media.remove();
          link.classList.remove("has-image");
          link.classList.add("is-placeholder");
        });
        media.appendChild(image);
        link.classList.add("has-image");
        link.appendChild(media);
      } else {
        link.classList.add("is-placeholder");
      }

      const content = document.createElement("span");
      content.className = "instagram-post-content";

      const number = document.createElement("span");
      number.className = "instagram-post-label";
      const kind = post.type === "reel" ? "最新リール" : "最新投稿";
      number.textContent = `${kind} ${String(index + 1).padStart(2, "0")}`;

      const title = document.createElement("strong");
      title.textContent = titleText;

      const action = document.createElement("span");
      action.className = "instagram-post-action";
      action.textContent = "投稿を開く ↗";

      content.append(number, title, action);
      link.appendChild(content);
      fragment.appendChild(link);
    });

    grid.replaceChildren(fragment);
  };

  fetch("./assets/instagram-posts.json", {
    cache: "no-cache",
    credentials: "same-origin"
  })
    .then(response => {
      if (!response.ok) throw new Error("Instagram feed request failed");
      return response.json();
    })
    .then(data => {
      if (Array.isArray(data.posts)) render(data.posts);
    })
    .catch(() => {
      // Keep the HTML fallback links when the feed cannot be refreshed.
    });
})();
