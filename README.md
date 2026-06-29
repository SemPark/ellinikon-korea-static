# THE IN PARTNERS — One Page Website

히어로 영상, 스크롤 애니메이션, 대한민국 3D 프로젝트 지도와 뉴스 섹션을 포함한 정적 원페이지 웹사이트입니다.

- GitHub 저장소: `SemPark/THE-IN-PARTNERS`
- Pages 주소: `https://sempark.github.io/THE-IN-PARTNERS/`
- 관리자 주소: `https://sempark.github.io/THE-IN-PARTNERS/admin.html`

## 구조

```text
/
├─ index.html
├─ css/
│  └─ style.css
├─ data/
│  └─ news.json
├─ js/
│  ├─ korea-map.js
│  ├─ project-data.js
│  └─ pin_mesh_factory.js
└─ assets/
   ├─ original/
   └─ project-01.png ... project-12.png
```

## 로컬 실행

ES 모듈 빌드 과정 없이 정적 서버에서 바로 실행할 수 있습니다.

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 엽니다.

## 배포

- GitHub Pages: GitHub Actions 워크플로로 배포합니다.
- 모든 내부 파일과 이미지 경로는 상대경로로 연결되어 있습니다.

## 구현 원칙

- 전체 원페이지는 빌드 과정 없이 정적 HTML/CSS/JavaScript로 실행됩니다.
- 3D 지도는 WebGL renderer, scene, camera, canvas를 각각 하나만 사용합니다.
- 프로젝트 핀은 `project-data.js`의 `projectPins`에서 관리합니다.
- 뉴스 링크는 `data/news.json`에서 관리합니다.
- 핀은 `pin_mesh_factory.js`가 생성한 Three.js Mesh를 `scene.add(pin)`으로 추가합니다.
- 핀 선택은 Raycaster로 처리합니다.
- 선택 전에는 회색, 선택 시에는 빨간색으로 전환됩니다.
