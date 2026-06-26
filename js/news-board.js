const NEWS_API_BASE = "https://customer-news-board.cleansam7.workers.dev";

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
    const news = await fetchJson(`${NEWS_API_BASE}/api/news`);
    newsCount.textContent = news.length;

    if (!news.length) {
      managedNewsGrid.innerHTML = '<div class="news-empty">아직 등록된 뉴스가 없습니다.</div>';
      return;
    }

    managedNewsGrid.innerHTML = "";
    news.forEach((item) => managedNewsGrid.appendChild(renderManagedNewsCard(item)));
  } catch (error) {
    newsCount.textContent = "0";
    managedNewsGrid.innerHTML = [
      '<div class="news-error">',
      "뉴스 API 연결이 차단되었습니다. Workers API에 CORS 허용 설정이 필요합니다.",
      "</div>",
    ].join("");
  }
}

function renderManagedNewsCard(item) {
  const card = document.createElement("button");
  card.className = "managed-news-card";
  card.type = "button";
  card.addEventListener("click", () => openManagedArticle(item.url));

  card.innerHTML = `
    <div class="managed-news-thumb">${renderManagedImage(item.image)}</div>
    <div class="managed-news-body">
      <div class="news-meta">
        <span class="news-source">${escapeNewsHtml(item.sourceName)}</span>
        ${item.date ? `<span>${escapeNewsHtml(item.date)}</span>` : ""}
        ${item.readTime ? `<span>${escapeNewsHtml(item.readTime)}</span>` : ""}
      </div>
      <h3>${escapeNewsHtml(decodeNewsHtml(item.title))}</h3>
      <p>${escapeNewsHtml(decodeNewsHtml(item.excerpt || "요약 정보가 없습니다."))}</p>
    </div>
  `;
  return card;
}

async function openManagedArticle(url) {
  newsModal.dataset.open = "true";
  newsArticleCover.innerHTML = "";
  newsArticleMeta.innerHTML = "";
  newsArticleTitle.textContent = "기사 불러오는 중";
  newsArticleBody.innerHTML = "<p>잠시만 기다려 주세요.</p>";

  try {
    const article = await fetchJson(`${NEWS_API_BASE}/api/article?url=${encodeURIComponent(url)}`);
    newsSourceLink.href = article.url || url;
    newsArticleCover.innerHTML = renderManagedImage(article.image);
    newsArticleMeta.innerHTML = `
      <span class="news-source">${escapeNewsHtml(article.sourceName || "")}</span>
      ${article.date ? `<span>${escapeNewsHtml(article.date)}</span>` : ""}
      ${article.readTime ? `<span>${escapeNewsHtml(article.readTime)}</span>` : ""}
    `;
    newsArticleTitle.textContent = decodeNewsHtml(article.title || "기사");

    if (article.paragraphs?.length) {
      newsArticleBody.innerHTML = article.paragraphs
        .map((text) => `<p>${escapeNewsHtml(decodeNewsHtml(text))}</p>`)
        .join("");
    } else {
      newsArticleBody.innerHTML = "<p>본문을 자동으로 가져오지 못했습니다. 원문 보기 버튼으로 기사를 확인해 주세요.</p>";
    }
  } catch (error) {
    newsSourceLink.href = url;
    newsArticleTitle.textContent = "기사 정보를 불러오지 못했습니다.";
    newsArticleBody.innerHTML = "<p>Workers API 연결이 차단되었습니다. 원문 보기 버튼으로 기사를 확인해 주세요.</p>";
  }
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
  const imageUrl = `${NEWS_API_BASE}/api/image?url=${encodeURIComponent(src)}`;
  return `<img src="${imageUrl}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(createManagedFallback())">`;
}

function createManagedFallback() {
  const fallback = document.createElement("div");
  fallback.className = "managed-news-fallback";
  fallback.textContent = "NEWS";
  return fallback;
}

function decodeNewsHtml(value) {
  const textarea = document.createElement("textarea");
  let decoded = String(value || "");
  for (let index = 0; index < 3; index += 1) {
    textarea.innerHTML = decoded;
    const next = textarea.value;
    if (next === decoded) return next;
    decoded = next;
  }
  return decoded;
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
