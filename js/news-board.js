const NEWS_DATA_URL = "./data/news.json";

const managedNewsGrid = document.querySelector("#managedNewsGrid");
const newsCount = document.querySelector("#newsCount");
const newsRefresh = document.querySelector("#newsRefresh");
const newsModal = document.querySelector("#newsModal");
const newsArticleCover = document.querySelector("#newsArticleCover");
const newsArticleMeta = document.querySelector("#newsArticleMeta");
const newsArticleTitle = document.querySelector("#newsArticleTitle");
const newsArticleBody = document.querySelector("#newsArticleBody");
const newsSourceLink = document.querySelector("#newsSourceLink");

newsRefresh?.addEventListener("click", loadManagedNews);
document.querySelector("#newsModalClose")?.addEventListener("click", closeManagedArticle);
document.querySelector("#newsModalShade")?.addEventListener("click", closeManagedArticle);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeManagedArticle();
});

if (managedNewsGrid) loadManagedNews();

async function loadManagedNews() {
  managedNewsGrid.innerHTML = '<div class="news-loading">뉴스를 불러오는 중입니다.</div>';

  try {
    const news = await fetchJson(`${NEWS_DATA_URL}?v=${Date.now()}`);
    newsCount.textContent = news.length;

    if (!news.length) {
      managedNewsGrid.innerHTML = '<div class="news-empty">아직 등록된 뉴스가 없습니다.</div>';
      return;
    }

    const displayNews = buildNewsGridItems(news.map(normalizeNewsItem));
    managedNewsGrid.innerHTML = "";
    displayNews.forEach((item) => managedNewsGrid.appendChild(renderManagedNewsCard(item)));
  } catch (error) {
    newsCount.textContent = "0";
    managedNewsGrid.innerHTML = '<div class="news-error">뉴스 데이터를 불러오지 못했습니다.</div>';
  }
}

function renderManagedNewsCard(item) {
  const card = document.createElement("button");
  card.className = "managed-news-card";
  card.type = "button";
  card.addEventListener("click", () => openManagedArticle(item));

  card.innerHTML = `
    <div class="managed-news-thumb"><div class="managed-news-fallback">NEWS</div></div>
    <div class="managed-news-body">
      <div class="news-meta">
        <span class="news-source">${escapeNewsHtml(item.sourceName)}</span>
        ${item.date ? `<span>${escapeNewsHtml(item.date)}</span>` : ""}
      </div>
      <h3>${escapeNewsHtml(item.title)}</h3>
      <p>${escapeNewsHtml(item.excerpt || "원문 보기 버튼으로 기사를 확인해 주세요.")}</p>
    </div>
  `;
  return card;
}

function openManagedArticle(item) {
  newsModal.dataset.open = "true";
  newsSourceLink.href = item.url;
  newsArticleCover.innerHTML = renderManagedImage(item.image);
  newsArticleMeta.innerHTML = `
    <span class="news-source">${escapeNewsHtml(item.sourceName)}</span>
    ${item.date ? `<span>${escapeNewsHtml(item.date)}</span>` : ""}
  `;
  newsArticleTitle.textContent = item.title || "기사";

  if (Array.isArray(item.paragraphs) && item.paragraphs.length) {
    newsArticleBody.innerHTML = item.paragraphs
      .map((text) => `<p>${escapeNewsHtml(text)}</p>`)
      .join("");
    return;
  }

  newsArticleBody.innerHTML = `<p>${escapeNewsHtml(item.excerpt || "원문 보기 버튼으로 기사를 확인해 주세요.")}</p>`;
}

function closeManagedArticle() {
  if (newsModal) newsModal.dataset.open = "false";
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function renderManagedImage(src) {
  if (!src) return '<div class="managed-news-fallback">NEWS</div>';
  return `<img src="${escapeNewsHtml(src)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(createManagedFallback())">`;
}

function createManagedFallback() {
  const fallback = document.createElement("div");
  fallback.className = "managed-news-fallback";
  fallback.textContent = "NEWS";
  return fallback;
}

function normalizeNewsItem(item) {
  const url = String(item.url || "");
  return {
    id: item.id || crypto.randomUUID(),
    url,
    title: item.title || hostname(url),
    sourceName: item.sourceName || hostname(url),
    excerpt: item.excerpt || "",
    image: item.image || "",
    date: item.date || "",
    paragraphs: item.paragraphs || [],
  };
}

function buildNewsGridItems(news) {
  if (news.length >= 6) return news;
  return Array.from({ length: 6 }, (_, index) => news[index % news.length]);
}

function hostname(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "news";
  }
}

function escapeNewsHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]);
}
