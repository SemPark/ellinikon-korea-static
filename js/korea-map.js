const mapRoot = document.getElementById("map");
const canvas = document.getElementById("koreaMapCanvas");
const canvasStage = canvas?.parentElement;
const pills = document.getElementById("projectPills");
const panel = document.getElementById("projectPanel");
const panelImage = document.getElementById("panelImage");
const panelStatus = document.getElementById("panelStatus");
const panelTitle = document.getElementById("panelTitle");
const panelAddress = document.getElementById("panelAddress");
const panelArea = document.getElementById("panelArea");
const panelUnits = document.getElementById("panelUnits");
const panelCompletion = document.getElementById("panelCompletion");
const panelNote = document.getElementById("panelNote");

const staticProjectLayout = [
  { label: "인천 마리나베이", x: 18.8, y: 20.5 },
  { label: "사당 2동", x: 25.4, y: 22.6 },
  { label: "탄벌 지역 주택조합", x: 31.8, y: 25.4 },
  { label: "동작 하이 팰리스", x: 24.4, y: 24.0 },
  { label: "김포 운양정", x: 20.6, y: 19.6 },
  { label: "더엘본 가평 설악", x: 37.6, y: 18.3 },
  { label: "청주 금천", x: 39.8, y: 42.4 },
  { label: "농성 1동 연례마을", x: 25.3, y: 68.8 },
  { label: "상도동 효성 헤링턴", x: 25.0, y: 23.5 },
  { label: "김천 혁신 휴시티", x: 50.6, y: 54.2 },
  { label: "내당지역 주택조합(제타시티)", x: 59.8, y: 60.5 },
  { label: "안심역 지역주택조합", x: 63.5, y: 58.4 },
];

const mapProjects = projectPins.map((project, index) => ({
  ...project,
  mapLabel: staticProjectLayout[index]?.label || project.label,
  panelAsset: `./assets/map/details/project-${String(index + 1).padStart(2, "0")}.jpg`,
  pinX: staticProjectLayout[index]?.x ?? 50,
  pinY: staticProjectLayout[index]?.y ?? 50,
}));

const pinButtons = new Map();
const pinDefaultSrc = "./assets/map/pin-default.png";
const pinSelectedSrc = "./assets/map/pin-selected.png";
let selectedId = null;

function updatePanel(project) {
  panelImage.src = project.panelAsset;
  panelImage.alt = `${project.name} 상세 정보`;
  panelStatus.textContent = `${String(project.id).padStart(2, "0")} / ${mapProjects.length} · ${project.status}`;
  panelTitle.textContent = project.name;
  panelAddress.textContent = project.address;
  panelArea.textContent = project.area;
  panelUnits.textContent = project.units;
  panelCompletion.textContent = project.completion;
  panelNote.textContent = project.note;
  panel.classList.add("is-active");
  mapRoot.classList.add("has-selection");
}

function updateMapControls() {
  pinButtons.forEach((button, id) => {
    const active = id === selectedId;
    button.classList.toggle("is-active", active);
    const image = button.querySelector("img");
    if (image) image.src = active ? pinSelectedSrc : pinDefaultSrc;
  });

  pills.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.projectId) === selectedId);
  });
}

function selectProject(id) {
  const project = mapProjects.find((item) => item.id === Number(id));
  if (!project) return;
  selectedId = project.id;
  updateMapControls();
  updatePanel(project);
}

function buildStaticMap() {
  if (!canvasStage || !pills) return;

  canvas?.remove();

  const mapImage = document.createElement("img");
  mapImage.className = "korea-outline-map";
  mapImage.src = "./assets/map/korea-outline-white.png";
  mapImage.alt = "대한민국 주요 프로젝트 위치 지도";

  const pinLayer = document.createElement("div");
  pinLayer.className = "map-pin-layer";
  pinLayer.setAttribute("aria-label", "지도 핀");

  canvasStage.append(mapImage, pinLayer);

  mapProjects.forEach((project) => {
    const pinButton = document.createElement("button");
    pinButton.type = "button";
    pinButton.className = "map-static-pin";
    pinButton.dataset.projectId = project.id;
    pinButton.style.left = `${project.pinX}%`;
    pinButton.style.top = `${project.pinY}%`;
    pinButton.setAttribute("aria-label", `${project.mapLabel} 보기`);
    pinButton.innerHTML = `<img src="${pinDefaultSrc}" alt="" />`;
    pinButton.addEventListener("click", () => selectProject(project.id));
    pinLayer.appendChild(pinButton);
    pinButtons.set(project.id, pinButton);

    const pill = document.createElement("button");
    pill.type = "button";
    pill.dataset.projectId = project.id;
    pill.textContent = project.mapLabel;
    pill.addEventListener("click", () => selectProject(project.id));
    pills.appendChild(pill);
  });

  selectProject(mapProjects[0]?.id);
}

window.selectProjectById = selectProject;
buildStaticMap();
requestAnimationFrame(() => mapRoot.classList.add("is-ready"));

// ── One-page site interactions ─────────────────────────
const header = document.querySelector(".ell-header");
const hamburger = document.querySelector(".hamburger");
const navigation = header.querySelector("nav");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let lastScroll = window.scrollY;
let featureIndex = 0;
const worldCopy = document.querySelector(".world-copy");
const worldCopyLines = worldCopy ? Array.from(worldCopy.querySelectorAll(".slide-line")) : [];
const lenis =
  !reduceMotion && window.Lenis
    ? new Lenis({
        smoothWheel: true,
        syncTouch: false,
        lerp: 0.105,
        wheelMultiplier: 0.88,
        touchMultiplier: 1.05,
        prevent: (node) => node.closest?.(".map-pills,.map-card"),
      })
    : null;

function lenisRaf(time) {
  lenis?.raf(time);
  requestAnimationFrame(lenisRaf);
}

if (lenis) requestAnimationFrame(lenisRaf);

function jumpTo(id) {
  const target = document.getElementById(id);
  if (target && lenis) lenis.scrollTo(target, { duration: 1.05 });
  else target?.scrollIntoView({ behavior: "smooth" });
  navigation.classList.remove("open");
  hamburger.textContent = "MENU";
}

document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => jumpTo(button.dataset.jump));
});

hamburger.addEventListener("click", () => {
  const open = navigation.classList.toggle("open");
  hamburger.textContent = open ? "CLOSE" : "MENU";
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("in");
    });
  },
  { threshold: 0.18 },
);
document.querySelectorAll("[data-reveal]").forEach((element) => {
  if (!element.closest(".world-copy")) revealObserver.observe(element);
});

function replayWorldCopyLine(line) {
  line.classList.add("in");
  line.classList.remove("replaying");
  void line.offsetWidth;
  requestAnimationFrame(() => {
    line.classList.add("replaying");
  });
}

function updateWorldCopyLines(isScrollingDown, isScrollingUp) {
  if (!worldCopyLines.length) return;

  const revealLine = window.innerHeight * 0.94;
  const resetLine = window.innerHeight * 0.98;

  worldCopyLines.forEach((line) => {
    const rect = line.getBoundingClientRect();
    const enteringFromBottom = rect.top <= revealLine && rect.bottom >= 0;
    const belowViewport = rect.top > resetLine;

    if (isScrollingDown && enteringFromBottom && !line.classList.contains("in")) {
      replayWorldCopyLine(line);
    } else if (isScrollingUp && belowViewport && line.classList.contains("in")) {
      line.classList.remove("in", "replaying");
    }
  });
}

function setDestination(index) {
  document.querySelectorAll("[data-destination]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.destination) === index);
  });
  document.querySelectorAll(".destination-visual article").forEach((article, articleIndex) => {
    article.classList.toggle("active", articleIndex === index);
  });
}
document.querySelectorAll("[data-destination]").forEach((button) => {
  button.addEventListener("click", () => setDestination(Number(button.dataset.destination)));
});

function setFeature(index) {
  featureIndex = index;
  document.querySelectorAll(".feature-sticky > article").forEach((article, articleIndex) => {
    article.classList.toggle("active", articleIndex === index);
  });
  document.querySelectorAll("[data-feature]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.feature) === index);
  });
}
document.querySelectorAll("[data-feature]").forEach((button) => {
  button.addEventListener("click", () => setFeature(Number(button.dataset.feature)));
});

function updatePage() {
  const y = window.scrollY;
  const previous = lastScroll;
  const isScrollingDown = y > previous + 4;
  const hero = document.querySelector(".ell-hero");
  const city = document.querySelector(".city-intro");
  const featureSlider = document.querySelector(".feature-slider");
  const solidStart = hero
    ? Math.max(120, hero.offsetHeight - window.innerHeight * 0.92)
    : window.innerHeight * 0.55;

  document.documentElement.style.setProperty("--page-scroll", String(y));
  document.documentElement.style.setProperty(
    "--hero-progress",
    String(Math.max(0, Math.min(1, y / (window.innerHeight * 0.42)))),
  );

  if (city) {
    const rect = city.getBoundingClientRect();
    const start = window.innerHeight * 0.82;
    const end = window.innerHeight * 0.18;
    const progress = Math.max(0, Math.min(1, (start - rect.top) / (start - end)));
    document.documentElement.style.setProperty(
      "--city-progress",
      String(1 - Math.pow(1 - progress, 3)),
    );
  }

  const mapRect = mapRoot.getBoundingClientRect();
  const mapProgress = Math.max(
    0,
    Math.min(1, (window.innerHeight * 0.9 - mapRect.top) / (window.innerHeight * 0.75)),
  );
  document.documentElement.style.setProperty(
    "--map-progress",
    String(1 - Math.pow(1 - mapProgress, 3)),
  );
  updateWorldCopyLines(isScrollingDown, y < previous - 4);

  header.classList.toggle("is-solid", y > solidStart);
  if (y <= 0) header.classList.remove("is-hidden");
  else if (isScrollingDown && !navigation.classList.contains("open")) header.classList.add("is-hidden");
  else if (y < previous - 4) header.classList.remove("is-hidden");
  lastScroll = Math.max(0, y);

  if (featureSlider) {
    const range = Math.max(1, featureSlider.offsetHeight - window.innerHeight);
    const progress = Math.max(0, Math.min(0.999, (y - featureSlider.offsetTop) / range));
    if (y >= featureSlider.offsetTop && y <= featureSlider.offsetTop + range) {
      const nextFeature = Math.floor(progress * 3);
      if (nextFeature !== featureIndex) setFeature(nextFeature);
    }
  }
}

lenis?.on("scroll", updatePage);
window.addEventListener("scroll", updatePage, { passive: true });
updatePage();
