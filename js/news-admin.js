const NEWS_ADMIN_API_BASE = "https://customer-news-board.cleansam7.workers.dev";

const loginPanel = document.querySelector("#loginPanel");
const managerPanel = document.querySelector("#managerPanel");
const loginForm = document.querySelector("#loginForm");
const password = document.querySelector("#password");
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

  try {
    const response = await fetch(`${NEWS_ADMIN_API_BASE}/api/admin/news`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-password": adminPassword,
      },
      body: JSON.stringify({ url }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "뉴스를 추가하지 못했습니다.");

    newsUrl.value = "";
    setMessage("뉴스 링크를 추가했습니다.");
    await loadAdminNews();
  } catch (error) {
    setMessage(error.message || "뉴스 API 연결이 차단되었습니다. Workers CORS 설정이 필요합니다.");
  }
});

async function loadAdminNews() {
  try {
    const response = await fetch(`${NEWS_ADMIN_API_BASE}/api/admin/news`, {
      headers: { "x-admin-password": adminPassword },
    });
    const payload = await response.json().catch(() => []);
    if (!response.ok) throw new Error(payload.error || "로그인이 필요합니다.");

    loginPanel.classList.add("hidden");
    managerPanel.classList.remove("hidden");
    loginMessage.textContent = "";
    setMessage("로그인되었습니다.");
    renderAdminList(payload);
  } catch (error) {
    adminPassword = "";
    password.value = "";
    password.focus();
    loginPanel.classList.remove("hidden");
    managerPanel.classList.add("hidden");
    setLoginMessage(error.message || "뉴스 API 연결이 차단되었습니다. Workers CORS 설정이 필요합니다.");
  }
}

function renderAdminList(items) {
  adminCount.textContent = items.length;
  if (!items.length) {
    adminList.innerHTML = '<div class="empty">저장된 뉴스 링크가 없습니다.</div>';
    return;
  }

  adminList.innerHTML = "";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "admin-item";
    row.innerHTML = `
      <a class="admin-url" href="${escapeAdminHtml(item.url)}" target="_blank" rel="noopener">${escapeAdminHtml(item.url)}</a>
      <button class="danger-btn" type="button" aria-label="삭제">×</button>
    `;
    row.querySelector("button").addEventListener("click", () => deleteNews(item.id));
    adminList.appendChild(row);
  });
}

async function deleteNews(id) {
  try {
    const response = await fetch(`${NEWS_ADMIN_API_BASE}/api/admin/news?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-admin-password": adminPassword },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "삭제하지 못했습니다.");

    setMessage("뉴스 링크를 삭제했습니다.");
    await loadAdminNews();
  } catch (error) {
    setMessage(error.message || "뉴스 API 연결이 차단되었습니다. Workers CORS 설정이 필요합니다.");
  }
}

function setMessage(text) {
  message.textContent = text;
}

function setLoginMessage(text) {
  loginMessage.textContent = text;
}

function escapeAdminHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]);
}
