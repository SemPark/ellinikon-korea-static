const CACHE_TTL = 60 * 60 * 6;
const CACHE_VERSION = "v5";
const NEWS_KEY = "news-links";
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:4174",
  "http://localhost:4174",
  "https://sempark.github.io",
]);

export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method === "OPTIONS") return corsPreflight(request);
      const response = await handleRequest(request, env, ctx);
      return withCors(request, response);
    } catch (error) {
      if (error instanceof Response) return withCors(request, error);
      return withCors(request, json({ error: "요청을 처리하지 못했습니다." }, 500));
    }
  },
};

async function handleRequest(request, env, ctx) {
      const url = new URL(request.url);

      if (url.pathname === "/api/news") {
        return json(await getNewsList(env, ctx));
      }

      if (url.pathname === "/api/article") {
        const source = url.searchParams.get("url");
        if (!source || !(await isAllowedNewsUrl(env, source))) {
          return json({ error: "등록되지 않은 뉴스 링크입니다." }, 400);
        }
        return json(await fetchArticle(source, ctx));
      }

      if (url.pathname === "/api/image") {
        return fetchImage(url.searchParams.get("url"));
      }

      if (url.pathname === "/api/admin/news" && request.method === "GET") {
        const denied = requireAdmin(request, env);
        if (denied) return denied;
        return json(await readLinks(env));
      }

      if (url.pathname === "/api/admin/news" && request.method === "POST") {
        const denied = requireAdmin(request, env);
        if (denied) return denied;
        const body = await request.json().catch(() => ({}));
        const record = await addLink(env, body.url);
        return json(record, 201);
      }

      if (url.pathname === "/api/admin/news" && request.method === "DELETE") {
        const denied = requireAdmin(request, env);
        if (denied) return denied;
        const id = url.searchParams.get("id");
        await deleteLink(env, id);
        return json({ ok: true });
      }

      if (url.pathname === "/admin") {
        return html(renderAdmin());
      }

      return html(renderApp());
}

function corsPreflight(request) {
  const origin = allowedOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

function withCors(request, response) {
  const origin = allowedOrigin(request);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(origin)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function allowedOrigin(request) {
  const origin = request.headers.get("origin");
  return ALLOWED_ORIGINS.has(origin) ? origin : "";
}

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,x-admin-password",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

async function getNewsList(env, ctx) {
  const links = await readLinks(env);
  const jobs = links.map((record) => fetchArticle(record.url, ctx, { summaryOnly: true }));
  const settled = await Promise.allSettled(jobs);

  return settled.map((result, index) => {
    const record = links[index];
    if (result.status === "fulfilled") return { id: record.id, ...result.value };
    return {
      id: record.id,
      url: record.url,
      title: hostname(record.url),
      sourceName: hostname(record.url),
      excerpt: "기사 정보를 불러오지 못했습니다. 원문 링크로 확인해 주세요.",
      image: "",
      date: "",
      readTime: "",
    };
  });
}

async function readLinks(env) {
  assertStore(env);
  const links = await env.NEWS_KV.get(NEWS_KEY, "json");
  return Array.isArray(links) ? links.filter((item) => item?.id && item?.url) : [];
}

async function writeLinks(env, links) {
  assertStore(env);
  await env.NEWS_KV.put(NEWS_KEY, JSON.stringify(links));
}

async function addLink(env, value) {
  const url = normalizeUrl(value);
  const links = await readLinks(env);

  if (links.some((item) => item.url === url)) {
    throw new Response(JSON.stringify({ error: "이미 등록된 링크입니다." }), {
      status: 409,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const record = {
    id: crypto.randomUUID(),
    url,
    createdAt: new Date().toISOString(),
  };

  await writeLinks(env, [record, ...links]);
  return record;
}

async function deleteLink(env, id) {
  if (!id) return;
  const links = await readLinks(env);
  await writeLinks(env, links.filter((item) => item.id !== id));
}

async function isAllowedNewsUrl(env, source) {
  const links = await readLinks(env);
  return links.some((item) => item.url === source);
}

function requireAdmin(request, env) {
  const password = env.ADMIN_PASSWORD;
  if (!password) {
    return json({ error: "ADMIN_PASSWORD가 설정되지 않았습니다." }, 500);
  }

  const provided = request.headers.get("x-admin-password") || "";
  if (provided !== password) {
    return json({ error: "관리자 비밀번호가 올바르지 않습니다." }, 401);
  }

  return null;
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid protocol");
    return url.toString();
  } catch {
    throw new Response(JSON.stringify({ error: "올바른 뉴스 링크를 입력해 주세요." }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

function assertStore(env) {
  if (!env.NEWS_KV) {
    throw new Response(JSON.stringify({ error: "NEWS_KV 저장소가 연결되지 않았습니다." }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

async function fetchArticle(source, ctx, options = {}) {
  const cache = caches.default;
  const cacheUrl = new URL(`https://cache.local/article?version=${CACHE_VERSION}&url=${encodeURIComponent(source)}&summary=${options.summaryOnly ? "1" : "0"}`);
  const cached = await cache.match(cacheUrl);
  if (cached) return cached.json();

  const res = await fetch(source, {
    headers: {
      "user-agent": BROWSER_USER_AGENT,
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

  const page = await res.text();
  const title = pickMeta(page, ["og:title", "twitter:title"]) || pickTitle(page) || hostname(source);
  const excerpt = pickMeta(page, ["og:description", "twitter:description", "description"]) || "";
  const image = pickImage(page, source);
  const date = pickMeta(page, ["article:published_time", "pubdate", "publishdate", "date"]) || "";
  const paragraphs = options.summaryOnly ? [] : extractParagraphs(page);
  const bodyText = paragraphs.join(" ");

  const payload = {
    url: source,
    title: clean(title),
    sourceName: hostname(source),
    excerpt: clean(excerpt || paragraphs.slice(0, 2).join(" ")),
    image,
    date: formatDate(date),
    readTime: bodyText ? `${Math.max(1, Math.ceil(bodyText.split(/\s+/).length / 450))}분` : "",
    paragraphs,
  };

  const response = json(payload);
  response.headers.set("cache-control", `public, max-age=${CACHE_TTL}`);
  ctx.waitUntil(cache.put(cacheUrl, response.clone()));
  return payload;
}

async function fetchImage(value) {
  const source = normalizeUrl(value);
  const cache = caches.default;
  const cacheUrl = new URL(`https://cache.local/image?url=${encodeURIComponent(source)}`);
  const cached = await cache.match(cacheUrl);
  if (cached) return cached;

  const res = await fetch(source, {
    headers: {
      "user-agent": BROWSER_USER_AGENT,
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });

  const contentType = res.headers.get("content-type") || "";
  if (!res.ok || !contentType.startsWith("image/")) {
    return new Response("Image unavailable", { status: 404 });
  }

  const response = new Response(res.body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400",
    },
  });
  await cache.put(cacheUrl, response.clone());
  return response;
}

function pickMeta(markup, names) {
  for (const name of names) {
    const escaped = escapeRegExp(name);
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const match = markup.match(pattern);
      if (match?.[1]) return decodeEntities(match[1]);
    }
  }
  return "";
}

function pickTitle(markup) {
  return decodeEntities(markup.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function pickImage(markup, source) {
  const candidates = collectMeta(markup, ["og:image", "twitter:image", "thumbnail", "image"])
    .map((value) => absolutize(value, source))
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);

  if (!candidates.length) return "";

  const sourceHost = hostname(source);
  const scored = candidates.map((value) => {
    const host = hostname(value);
    const isHttps = value.startsWith("https://") ? 2 : 0;
    const sameSite = host.endsWith(sourceHost) ? 4 : 0;
    const looksLikeImage = /\.(jpe?g|png|webp|gif)(\?|$)/i.test(value) ? 1 : 0;
    return { value, score: isHttps + sameSite + looksLikeImage };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].value;
}

function collectMeta(markup, names) {
  const values = [];
  for (const name of names) {
    const escaped = escapeRegExp(name);
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "gi"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]*>`, "gi"),
    ];
    for (const pattern of patterns) {
      for (const match of markup.matchAll(pattern)) {
        if (match?.[1]) values.push(decodeEntities(match[1]));
      }
    }
  }
  return values;
}

function extractParagraphs(markup) {
  const cleaned = markup
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "");

  const articleLike = cleaned.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] || cleaned;
  const paragraphMatches = [...articleLike.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];

  return paragraphMatches
    .map((match) => clean(match[1].replace(/<[^>]+>/g, " ")))
    .filter((text) => text.length >= 40)
    .filter((text, index, list) => list.indexOf(text) === index)
    .slice(0, 18);
}

function clean(value) {
  return decodeEntities(String(value || ""))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value) {
  let decoded = String(value || "");
  for (let i = 0; i < 3; i += 1) {
    const next = decodeNumericEntities(decoded)
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'")
      .replace(/&ldquo;/g, "“")
      .replace(/&rdquo;/g, "”")
      .replace(/&lsquo;/g, "‘")
      .replace(/&rsquo;/g, "’")
      .replace(/&hellip;/g, "…")
      .replace(/&middot;/g, "·")
      .replace(/&ndash;/g, "–")
      .replace(/&mdash;/g, "—")
      .replace(/&#39;/g, "'")
      .replace(/&#x2F;/g, "/");
    if (next === decoded) return next;
    decoded = next;
  }
  return decoded;
}

function decodeNumericEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function absolutize(value, source) {
  if (!value) return "";
  try {
    return new URL(value, source).toString();
  } catch {
    return "";
  }
}

function hostname(source) {
  try {
    return new URL(source).hostname.replace(/^www\./, "");
  } catch {
    return "뉴스";
  }
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value).slice(0, 16);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function json(data, status = 200) {
  if (data instanceof Response) return data;
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function html(markup) {
  return new Response(markup, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function renderApp() {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>고객사 뉴스</title>
  <style>${baseStyles()}</style>
</head>
<body>
  <main class="shell">
    <nav class="topbar" aria-label="상단 메뉴">
      <div class="brand"><span class="mark" aria-hidden="true">N</span><span>고객사 뉴스</span></div>
      <button class="refresh" id="refresh" title="새로고침" aria-label="새로고침">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
      </button>
    </nav>

    <section class="hero">
      <div>
        <h1>고객사의 최신 뉴스를 한곳에서 확인하세요.</h1>
        <p class="lead">관리자가 Cloudflare 백엔드에 등록한 뉴스가 자동으로 표시됩니다.</p>
      </div>
      <aside class="stat" aria-label="등록된 뉴스 수">
        <strong id="count">0</strong>
        <span>등록된 뉴스 링크</span>
      </aside>
    </section>

    <section class="grid" id="newsGrid" aria-live="polite">
      <div class="loading">뉴스를 불러오는 중입니다.</div>
    </section>
  </main>

  <section class="modal" id="modal" aria-modal="true" role="dialog" aria-labelledby="articleTitle">
    <div class="shade" id="shade"></div>
    <article class="article">
      <div class="article-actions">
        <button class="icon-btn" id="close" title="닫기" aria-label="닫기">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
        <a class="text-btn" id="sourceLink" target="_blank" rel="noopener">원문 보기</a>
      </div>
      <div class="article-cover" id="articleCover"></div>
      <div class="article-inner">
        <div class="meta" id="articleMeta"></div>
        <h2 id="articleTitle"></h2>
        <div id="articleBody"></div>
      </div>
    </article>
  </section>

  <script>
    const grid = document.querySelector("#newsGrid");
    const count = document.querySelector("#count");
    const modal = document.querySelector("#modal");
    const articleCover = document.querySelector("#articleCover");
    const articleMeta = document.querySelector("#articleMeta");
    const articleTitle = document.querySelector("#articleTitle");
    const articleBody = document.querySelector("#articleBody");
    const sourceLink = document.querySelector("#sourceLink");

    document.querySelector("#refresh").addEventListener("click", loadNews);
    document.querySelector("#close").addEventListener("click", closeArticle);
    document.querySelector("#shade").addEventListener("click", closeArticle);
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeArticle();
    });

    loadNews();

    async function loadNews() {
      grid.innerHTML = '<div class="loading">뉴스를 불러오는 중입니다.</div>';
      const news = await fetch("/api/news").then((res) => res.json()).catch(() => []);
      count.textContent = news.length;

      if (!news.length) {
        grid.innerHTML = '<div class="empty">아직 등록된 뉴스가 없습니다. 관리자 화면에서 뉴스 링크를 추가해 주세요.</div>';
        return;
      }

      grid.innerHTML = "";
      news.forEach((item) => grid.appendChild(renderCard(item)));
    }

    function renderCard(item) {
      const card = document.createElement("button");
      card.className = "card";
      card.type = "button";
      card.addEventListener("click", () => openArticle(item.url));

      card.innerHTML = \`
        <div class="thumb">\${renderImage(item.image)}</div>
        <div class="card-body">
          <div class="meta">
            <span class="source">\${escapeHtml(item.sourceName)}</span>
            \${item.date ? \`<span>\${escapeHtml(item.date)}</span>\` : ""}
            \${item.readTime ? \`<span>\${escapeHtml(item.readTime)}</span>\` : ""}
          </div>
          <h2>\${escapeHtml(decodeHtmlText(item.title))}</h2>
          <p class="excerpt">\${escapeHtml(decodeHtmlText(item.excerpt || "요약 정보가 없습니다."))}</p>
        </div>
      \`;
      return card;
    }

    async function openArticle(url) {
      modal.dataset.open = "true";
      articleCover.innerHTML = "";
      articleMeta.innerHTML = "";
      articleTitle.textContent = "기사 불러오는 중";
      articleBody.innerHTML = '<p>잠시만 기다려 주세요.</p>';

      const article = await fetch("/api/article?url=" + encodeURIComponent(url)).then((res) => res.json());
      sourceLink.href = article.url;
      articleCover.innerHTML = renderImage(article.image);
      articleMeta.innerHTML = \`
        <span class="source">\${escapeHtml(article.sourceName || "")}</span>
        \${article.date ? \`<span>\${escapeHtml(article.date)}</span>\` : ""}
        \${article.readTime ? \`<span>\${escapeHtml(article.readTime)}</span>\` : ""}
      \`;
      articleTitle.textContent = decodeHtmlText(article.title || "기사");

      if (article.paragraphs && article.paragraphs.length) {
        articleBody.innerHTML = article.paragraphs.map((text) => \`<p>\${escapeHtml(decodeHtmlText(text))}</p>\`).join("");
      } else {
        articleBody.innerHTML = '<p>본문을 자동으로 가져오지 못했습니다. 위의 원문 보기 버튼으로 기사를 확인해 주세요.</p>';
      }
    }

    function closeArticle() {
      modal.dataset.open = "false";
    }

    function renderImage(src) {
      if (!src) return '<div class="fallback">NEWS</div>';
      return \`<img src="\${proxiedImage(src)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(createFallback())">\`;
    }

    function proxiedImage(src) {
      return "/api/image?url=" + encodeURIComponent(src);
    }

    function createFallback() {
      const fallback = document.createElement("div");
      fallback.className = "fallback";
      fallback.textContent = "NEWS";
      return fallback;
    }

    function decodeHtmlText(value) {
      const textarea = document.createElement("textarea");
      let decoded = String(value || "");
      for (let i = 0; i < 3; i += 1) {
        textarea.innerHTML = decoded;
        const next = textarea.value;
        if (next === decoded) return next;
        decoded = next;
      }
      return decoded;
    }

    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\\"": "&quot;",
        "'": "&#39;"
      })[char]);
    }
  </script>
</body>
</html>`;
}

function renderAdmin() {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>뉴스 관리자</title>
  <style>${baseStyles()}
    .admin-shell { width: min(920px, calc(100% - 40px)); margin: 0 auto; padding: 34px 0 54px; }
    .login-shell { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .login-card { width: min(420px, 100%); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); padding: 24px; }
    .login-card .brand { margin-bottom: 24px; }
    .login-card h1 { font-size: 28px; line-height: 1.15; margin-bottom: 10px; }
    .login-card p { margin: 0; color: var(--muted); }
    .admin-panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); padding: 22px; }
    .admin-form { display: grid; grid-template-columns: 1fr 130px; gap: 10px; margin-top: 18px; }
    .login-form { display: grid; gap: 10px; margin-top: 20px; }
    .input { min-height: 46px; border: 1px solid var(--line); border-radius: 8px; padding: 0 14px; font: inherit; }
    .primary-btn { min-height: 46px; border: 0; border-radius: 8px; background: var(--accent); color: white; font-weight: 800; cursor: pointer; }
    .danger-btn { width: 40px; height: 40px; border: 1px solid #efcaca; border-radius: 8px; background: #fff8f8; color: #a33a3a; cursor: pointer; }
    .admin-list { display: grid; gap: 10px; margin-top: 22px; }
    .admin-item { display: grid; grid-template-columns: 1fr 46px; gap: 12px; align-items: center; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .admin-url { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--accent-dark); font-weight: 750; }
    .message { min-height: 24px; margin-top: 12px; color: var(--muted); }
    .hidden { display: none; }
    @media (max-width: 640px) {
      .admin-shell { width: min(100% - 28px, 920px); padding-top: 22px; }
      .admin-form, .login-form { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="login-shell" id="loginScreen">
    <section class="login-card">
      <div class="brand"><span class="mark" aria-hidden="true">N</span><span>뉴스 관리자</span></div>
      <h1>관리자 비밀번호를 입력하세요.</h1>
      <p>인증 후 뉴스 링크 관리 화면이 열립니다.</p>
      <form class="login-form" id="loginForm">
        <input class="input" id="password" type="password" autocomplete="current-password" placeholder="관리자 비밀번호" autofocus>
        <button class="primary-btn" type="submit">로그인</button>
      </form>
      <p class="message" id="loginMessage"></p>
    </section>
  </main>

  <main class="admin-shell hidden" id="adminScreen">
    <nav class="topbar" aria-label="상단 메뉴">
      <div class="brand"><span class="mark" aria-hidden="true">N</span><span>뉴스 관리자</span></div>
      <a class="text-btn" href="/">게시판 보기</a>
    </nav>

    <section class="hero">
      <div>
        <h1>Cloudflare 백엔드에서 뉴스 링크를 관리합니다.</h1>
        <p class="lead">여기서 등록한 링크만 공개 게시판에 표시됩니다.</p>
      </div>
      <aside class="stat" aria-label="등록된 뉴스 수">
        <strong id="adminCount">0</strong>
        <span>저장된 링크</span>
      </aside>
    </section>

    <section class="admin-panel">
      <div id="manager">
        <form class="admin-form" id="newsForm">
          <input class="input" id="newsUrl" type="url" placeholder="https://news.example.com/article" required>
          <button class="primary-btn" type="submit">추가</button>
        </form>
        <div class="admin-list" id="adminList"></div>
      </div>

      <p class="message" id="message"></p>
    </section>
  </main>

  <script>
    const loginScreen = document.querySelector("#loginScreen");
    const adminScreen = document.querySelector("#adminScreen");
    const loginForm = document.querySelector("#loginForm");
    const password = document.querySelector("#password");
    const manager = document.querySelector("#manager");
    const newsForm = document.querySelector("#newsForm");
    const newsUrl = document.querySelector("#newsUrl");
    const adminList = document.querySelector("#adminList");
    const message = document.querySelector("#message");
    const loginMessage = document.querySelector("#loginMessage");
    const adminCount = document.querySelector("#adminCount");

    let adminPassword = "";

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      adminPassword = password.value;
      await loadAdminNews();
    });

    newsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const url = newsUrl.value.trim();
      const res = await fetch("/api/admin/news", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({ url }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(payload.error || "뉴스를 추가하지 못했습니다.");
        return;
      }
      newsUrl.value = "";
      setMessage("뉴스 링크를 추가했습니다.");
      await loadAdminNews();
    });

    async function loadAdminNews() {
      const res = await fetch("/api/admin/news", {
        headers: { "x-admin-password": adminPassword },
      });
      const payload = await res.json().catch(() => []);

      if (!res.ok) {
        adminPassword = "";
        password.value = "";
        password.focus();
        setLoginMessage(payload.error || "로그인이 필요합니다.");
        return;
      }

      loginScreen.classList.add("hidden");
      adminScreen.classList.remove("hidden");
      setMessage("로그인되었습니다.");
      renderList(payload);
    }

    function renderList(items) {
      adminCount.textContent = items.length;
      if (!items.length) {
        adminList.innerHTML = '<div class="empty">저장된 뉴스 링크가 없습니다.</div>';
        return;
      }

      adminList.innerHTML = "";
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "admin-item";
        row.innerHTML = \`
          <a class="admin-url" href="\${escapeHtml(item.url)}" target="_blank" rel="noopener">\${escapeHtml(item.url)}</a>
          <button class="danger-btn" type="button" title="삭제" aria-label="삭제">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>
          </button>
        \`;
        row.querySelector("button").addEventListener("click", () => deleteNews(item.id));
        adminList.appendChild(row);
      });
    }

    async function deleteNews(id) {
      const res = await fetch("/api/admin/news?id=" + encodeURIComponent(id), {
        method: "DELETE",
        headers: { "x-admin-password": adminPassword },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setMessage(payload.error || "삭제하지 못했습니다.");
        return;
      }
      setMessage("뉴스 링크를 삭제했습니다.");
      await loadAdminNews();
    }

    function setMessage(text) {
      message.textContent = text;
    }

    function setLoginMessage(text) {
      loginMessage.textContent = text;
    }

    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\\"": "&quot;",
        "'": "&#39;"
      })[char]);
    }
  </script>
</body>
</html>`;
}

function baseStyles() {
  return `
    :root {
      color-scheme: light;
      --bg: #f6f7f4;
      --text: #171a18;
      --muted: #66706b;
      --line: #dfe4de;
      --panel: #ffffff;
      --accent: #14786a;
      --accent-dark: #0c554a;
      --shadow: 0 18px 60px rgba(21, 42, 35, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    button, a, input { font: inherit; }
    a { color: inherit; }
    .shell {
      width: min(1120px, calc(100% - 40px));
      margin: 0 auto;
      padding: 34px 0 54px;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 30px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 800;
      font-size: 20px;
    }
    .mark {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      background: linear-gradient(135deg, var(--accent), #2aa876);
      display: grid;
      place-items: center;
      color: white;
      box-shadow: 0 10px 26px rgba(20, 120, 106, 0.22);
    }
    .refresh {
      border: 1px solid var(--line);
      background: var(--panel);
      width: 42px;
      height: 42px;
      border-radius: 8px;
      cursor: pointer;
      display: grid;
      place-items: center;
      color: var(--accent-dark);
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 330px;
      gap: 28px;
      align-items: end;
      padding-bottom: 28px;
      border-bottom: 1px solid var(--line);
      margin-bottom: 28px;
    }
    h1 {
      font-size: clamp(34px, 5vw, 62px);
      line-height: 1.02;
      margin: 0 0 16px;
      letter-spacing: 0;
    }
    .lead {
      max-width: 660px;
      margin: 0;
      color: var(--muted);
      font-size: 18px;
    }
    .stat {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 22px;
      box-shadow: var(--shadow);
    }
    .stat strong {
      display: block;
      font-size: 44px;
      line-height: 1;
      color: var(--accent-dark);
    }
    .stat span {
      color: var(--muted);
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      min-height: 424px;
      display: flex;
      flex-direction: column;
      transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
      text-align: left;
    }
    .card:hover {
      transform: translateY(-3px);
      border-color: rgba(20, 120, 106, 0.38);
      box-shadow: var(--shadow);
    }
    .thumb {
      height: 184px;
      background: linear-gradient(135deg, #dfe4de, #f0dca8);
      position: relative;
      overflow: hidden;
    }
    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .fallback {
      height: 100%;
      display: grid;
      place-items: center;
      color: var(--accent-dark);
      font-weight: 800;
      font-size: 38px;
    }
    .card-body {
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex: 1;
    }
    .meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      color: var(--muted);
      font-size: 13px;
    }
    .source {
      color: var(--accent-dark);
      font-weight: 750;
    }
    .card h2 {
      font-size: 20px;
      line-height: 1.25;
      margin: 0;
    }
    .excerpt {
      margin: 0;
      color: var(--muted);
      font-size: 15px;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .empty, .loading {
      border: 1px dashed #bbc6bf;
      border-radius: 8px;
      padding: 42px;
      background: rgba(255, 255, 255, 0.62);
      color: var(--muted);
      text-align: center;
      grid-column: 1 / -1;
    }
    .modal {
      position: fixed;
      inset: 0;
      display: none;
      z-index: 20;
    }
    .modal[data-open="true"] { display: block; }
    .shade {
      position: absolute;
      inset: 0;
      background: rgba(11, 23, 19, 0.56);
    }
    .article {
      position: absolute;
      inset: 24px 24px 24px auto;
      width: min(720px, calc(100% - 48px));
      overflow: auto;
      background: var(--panel);
      border-radius: 8px;
      box-shadow: 0 24px 90px rgba(0, 0, 0, 0.26);
    }
    .article-cover {
      height: 300px;
      background: linear-gradient(135deg, #dfe4de, #f0dca8);
    }
    .article-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .article-inner { padding: 30px; }
    .article h2 {
      margin: 10px 0 16px;
      font-size: clamp(28px, 4vw, 42px);
      line-height: 1.1;
      letter-spacing: 0;
    }
    .article p {
      color: #303832;
      font-size: 17px;
      margin: 0 0 16px;
    }
    .article-actions {
      position: sticky;
      top: 0;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.86);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--line);
    }
    .icon-btn, .text-btn {
      border: 1px solid var(--line);
      background: white;
      color: var(--accent-dark);
      min-height: 40px;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-decoration: none;
    }
    .icon-btn { width: 40px; }
    .text-btn {
      padding: 0 14px;
      font-weight: 750;
    }
    @media (max-width: 900px) {
      .hero { grid-template-columns: 1fr; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 640px) {
      .shell { width: min(100% - 28px, 1120px); padding-top: 22px; }
      .topbar { margin-bottom: 22px; }
      .hero { gap: 20px; }
      .grid { grid-template-columns: 1fr; }
      .card { min-height: 0; }
      .article { inset: 12px; width: auto; }
      .article-cover { height: 210px; }
      .article-inner { padding: 22px; }
      .lead { font-size: 16px; }
    }
  `;
}
