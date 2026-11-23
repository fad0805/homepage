# 어디에도 없는 섬

**Rimien Siarte**의 창작 세계관 웹사이트입니다.

작가 소개와 작품을 공개하는 사이트이면서, 작가가 직접 콘텐츠를 관리하고
개인 기록을 남길 수 있는 개인 홈페이지 도구를 함께 제공합니다.

## 주요 기능

- **작가 페이지**: 작가 프로필, 작품 소개, 등장인물·장소·관계, 삽화, 링크
- **작품 관리**: 책·챕터·카테고리, 임시저장, 공개/비공개, 보호 챕터
- **삽화와 갤러리**: 삽화 업로드·순서 변경·대표 이미지, 일회용 초대 코드로
  비공개 갤러리 열람
- **외관 관리**: 상단/사이드/하단/드로어 레이아웃, 메뉴 위치, 라이트·다크
  모드, 색상 테마와 사용자 색상 오버라이드
- **주석**: 로그인한 작가의 개인 메모
- **책갈피**: 루틴·카테고리·기분 태그·목표·별점·회고·디데이, 기간별 통계와
  달성 기록
- **부록(플래너)**: 일정·할 일·색상 칩·완료/변경 이력·기간 검색
- **내보내기**: 전체 또는 범위별 ZIP 아카이브. 콘텐츠와 이미지, 책갈피 기록을
  데이터베이스 구조와 무관한 JSON으로 보존
- **검색·방문 통계·Mastodon 연동**: 공개 검색, 관리자 방문 통계, 알림 게시 설정

## 기술 스택

| 계층 | 기술 |
|------|------|
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, SCSS, Tiptap, dnd-kit |
| **Backend** | FastAPI (Python 3.11), SQLAlchemy 2.0, Alembic, Pydantic, Pillow |
| **Database** | PostgreSQL 14 |
| **Auth** | JWT access/refresh token, httpOnly cookie, bcrypt |
| **Storage** | 로컬 `/uploads` 또는 S3 호환 오브젝트 스토리지 |
| **Infra** | Docker Compose |
| **Tests** | Python `unittest` + in-memory SQLite |

## 아키텍처

```
Host:2222 → web (Next.js :3000) → /api/* rewrite → api (FastAPI :8000) → db (PostgreSQL :5432)
```

- `web`은 외부 포트 2222로 노출되고, `/api/*`와 `/uploads/*` 요청을 Next.js
  rewrites로 API에 프록시합니다.
- 운영 환경에서 `api`와 `db`는 외부 포트를 열지 않습니다.
- 업로드 이미지는 로컬 볼륨 또는 S3 호환 스토리지에 저장됩니다. DB에는
  오브젝트 키를 저장하고, 조회 시 공개 URL을 결합합니다.
- 공개 가입은 없습니다. 작가 계정은 서버 CLI로 생성하고, 로그인 후 관리자
  화면에서 프로필·외관·콘텐츠를 설정합니다.
- `/admin`, `/bookmark`, `/planner`, `/memo`, `/search`, `/gallery` 등 비공개
  화면은 `noindex`로 검색 노출을 막습니다.

## 시작하기

### 필수 조건

- Docker & Docker Compose

### 개발 환경

```bash
git clone <repo-url>
cd homepage

# 개발 서버 실행
bin/dev
```

또는 직접 실행:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

- **Web**: http://localhost:2222
- **API**: http://localhost:8000
- **API 문서**: http://localhost:8000/docs (개발 모드)
- 개발 계정: `admin` / `admin` (`DEV_ADMIN_SEED=true`일 때 자동 생성)

> 운영 서버에서는 `docker-compose.dev.yml` 또는 `bin/dev`를 사용하지 마세요.
> 개발용 compose는 `ENVIRONMENT=development`와 `DEV_ADMIN_SEED=true`를
> 사용합니다.

### 운영 환경

```bash
cp .env.production.sample .env.production
# .env.production 값 채우기

docker compose up --build -d
```

### 서버 스크립트

API 컨테이너가 실행 중일 때 서버에서 실행합니다.

```bash
# 작가 계정 생성 (비밀번호는 대화형 입력)
bin/create-author --username alice

# 관리자 역할로 생성
bin/create-author --username alice --role admin

# 자동화용: 표준입력으로 비밀번호 전달
printf '%s\n' "$PASSWORD" | bin/create-author --username alice --password-stdin
```

- 공개 가입 UI는 없습니다.
- 계정 생성 후 로그인하면 프로필, 외관, 콘텐츠 설정을 관리할 수 있습니다.
- `bin/run-api-python <script.py>`로 API 컨테이너 안에서 임의의 Python
  스크립트를 실행할 수 있습니다.

## 테스트

날짜 계산, 기간별 집계, 기록 보존 로직은 `api/tests/`에서 자동 테스트합니다.
테스트는 in-memory SQLite를 사용하므로 개발 DB에 영향을 주지 않습니다.

API 컨테이너가 실행 중이라면:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml \
  exec api python -m unittest discover -s tests -v
```

API 의존성이 설치된 호스트에서는:

```bash
cd api
python3 -m unittest discover -s tests -v
```

현재 테스트 범위:

- 월말·윤년·월 이동 경계
- 매월 특정 날짜 / n번째 요일
- 주간 요일 복수 선택
- 분기별 특정 분기
- 연간 윤일
- 루틴 시작일·종료일 경계
- 월간/주간 통계 집계
- 기간별 통계 버킷
- 오래된 체크 삭제와 월간 집계 보존
- 플래너 정오 기준 마감일과 범위 일정 검증
- 플래너 색상·일정 CRUD와 상태 전이
- 플래너 이력 조회·검색·완료 기록

## 환경 변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `SECRET_KEY` | 운영 필수 | JWT 서명 비밀키 (개발은 `.env.development`의 고정 키 사용, 없으면 자동 생성) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 선택 | access 토큰 만료 시간(분, 기본 30) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | 선택 | refresh 토큰/로그인 유지 기간(일, 기본 30) |
| `REFRESH_TOKEN_GRACE_SECONDS` | 선택 | refresh 토큰 회전 후 이전 토큰 허용 시간(초, 기본 60) |
| `ENVIRONMENT` | 선택 | `production` 설정 시 운영 모드 |
| `API_DOCS_ENABLED` | 선택 | API 문서(`/docs`, `/openapi.json`) 노출 여부 |
| `DEV_ADMIN_SEED` | 개발 전용 | 개발용 `admin/admin` 계정 생성 여부 |
| `DB_HOST` / `DB_PORT` | 필수 | PostgreSQL 호스트/포트 |
| `DB_NAME` / `DB_USER` / `DB_PASS` | 필수 | PostgreSQL 접속 정보 |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | DB 컨테이너 | PostgreSQL 초기 설정 |
| `MAX_UPLOAD_SIZE` | 선택 | 이미지 업로드 최대 크기(바이트, 기본 50MB) |
| `S3_ENDPOINT_URL` / `S3_REGION` / `S3_BUCKET` | 선택 | S3 호환 스토리지 설정 |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | 선택 | S3 인증 정보 |
| `S3_PUBLIC_BASE_URL` / `S3_KEY_PREFIX` | 선택 | 공개 URL 접두사와 오브젝트 키 prefix |
| `S3_ADDRESSING_STYLE` / `S3_ACL` | 선택 | S3 호환 스토리지 옵션 |
| `GALLERY_SESSION_DAYS` / `GALLERY_INVITE_HOURS` | 선택 | 갤러리 열람 유지/초대 코드 유효 시간 |
| `ARCHIVE_DIR` / `ARCHIVE_RETENTION_HOURS` | 선택 | 내보내기 ZIP 저장 경로/보관 시간 |
| `ARCHIVE_REEXPORT_HOURS` | 선택 | 생성된 ZIP 이후 재요청 제한 시간(기본 24) |
| `ARCHIVE_THROTTLE_SECONDS` | 선택 | 내보내기 파일 생성 간 지연 |
| `SITE_URL` / `API_INTERNAL_URL` / `PUBLIC_DATA_REVALIDATE` | 선택 | Web 컨테이너의 공개 URL, API 주소, 캐시 시간 |

S3 설정을 비우면 업로드는 로컬 `/uploads`에 저장됩니다. 자세한 S3 버킷
권한은 `.env.production.sample`의 주석을 참고하세요.

## 마이그레이션

```bash
# 개발 환경
sh api/migrate.sh --dev

# 운영 환경
sh api/migrate.sh
```

API 컨테이너는 시작 시 `api/entrypoint.sh`에서 `alembic upgrade head`를
실행합니다.

## 페이지 구성

### 공개 페이지

| 경로 | 설명 | 인증 |
|------|------|------|
| `/` | 통합 인덱스/홈 | - |
| `/author` | 작가 소개 목록, `?profile=<id>`로 상세 | - |
| `/characters` | 등장인물 갤러리 | - |
| `/characters/profile?character=<slug>` | 캐릭터 상세 | - |
| `/books` | 목차와 챕터 열람 | - |
| `/illustrations` | 삽화 목록 | - |
| `/illustrations/<illustrationId>` | 삽화 상세 | - |
| `/links` | 링크(놀러가기) | - |
| `/search` | 통합 검색 | - |
| `/gallery/unlock` | 일회용 코드로 비공개 갤러리 열람 | 코드 |
| `/signin` | 로그인 | - |
| `/memo` | 개인 주석 | 로그인 |
| `/bookmark` | 책갈피 루틴·기록 | 로그인 |
| `/planner` | 부록(플래너) | 로그인 |

### 관리자 페이지

| 경로 | 설명 | 인증 |
|------|------|------|
| `/admin` | 관리자 대시보드 | 관리자 |
| `/admin/index` | 통합/작가 인덱스 관리 | 로그인 |
| `/admin/author` | 작가 프로필 관리 | 로그인 |
| `/admin/characters` | 등장인물·장소·관계 관리 | 로그인 |
| `/admin/books` | 책·챕터 관리 | 로그인 |
| `/admin/books/<bookId>` | 책 상세 관리 | 로그인 |
| `/admin/books/<bookId>/chapters/<chapterId>` | 챕터 편집 | 로그인 |
| `/admin/illustrations` | 삽화 업로드·순서·공개 범위 관리 | 로그인 |
| `/admin/links` | 링크·카테고리 관리 | 로그인 |
| `/admin/links/<linkId>` | 링크 상세 관리 | 로그인 |
| `/admin/gallery` | 갤러리 초대·세션 관리 | 로그인 |
| `/admin/connections` | Mastodon 연결 관리 | 로그인 |
| `/admin/appearance` | 레이아웃·색상 테마·기본 모드 관리 | 로그인 |
| `/admin/account` | 계정·비밀번호 관리 | 로그인 |
| `/admin/export` | 전체/부분 ZIP 내보내기 | 로그인 |

## API 엔드포인트

아래 경로는 웹을 통한 공개 경로 기준입니다. API 컨테이너에 직접 호출할 때는
`/api` 접두사를 뺍니다. 전체 스키마는 개발 모드의 `/docs` 또는
`/openapi.json`에서 확인할 수 있습니다.

| 영역 | 주요 엔드포인트 | 인증 |
|------|-----------------|------|
| 인증/계정 | `POST /api/users/signin`, `POST /api/users/signout`, `GET /api/users/me`, `GET /api/users/me/status`, `GET/PUT /api/users/me/account`, `PUT /api/users/me/password`, `GET/PUT /api/users/me/appearance` | 일부 |
| 외관 | `GET /api/appearance` | - |
| 프로필 | `GET/POST /api/profiles`, `GET/PUT/DELETE /api/profiles/{id}`, `POST /api/profiles/upload`, `GET /api/profiles/others` | 쓰기/관리자 |
| 등장인물 | `/api/characters`, `/api/characters/{id}`, `/api/characters/reorder`, `/api/characters/upload`, `/api/characters/image-proxy`, `/api/characters/locations` | 쓰기 |
| 책/챕터 | `/api/books`, `/api/books/{id}`, `/api/books/reorder`, `/api/books/categories`, `/api/chapters`, `/api/chapters/{id}`, `/api/chapters/reorder`, `/api/chapters/upload`, `/api/chapters/{id}/view`, `/api/chapter-drafts/{key}` | 쓰기 |
| 삽화 | `/api/illustrations`, `/api/illustrations/admin`, `/api/illustrations/bulk`, `/api/illustrations/reorder`, `/api/illustrations/{id}`, `/api/illustrations/{id}/view`, 이미지 순서·대표 이미지 변경 | 쓰기 |
| 링크 | `/api/links`, `/api/links/{id}`, `/api/links/reorder`, `/api/links/upload`, `/api/links/categories` | 쓰기 |
| 주석 | `GET/POST /api/memos`, `PUT/DELETE /api/memos/{id}` | 로그인 |
| 책갈피 | `/api/bookmark`, `/api/bookmark/today`, `/api/bookmark/statistics`, `/api/bookmark/routines`, `/api/bookmark/routines/order`, `/api/bookmark/routines/{id}/check`, `/api/bookmark/routines/{id}/history`, `/api/bookmark/categories`, `/api/bookmark/mood-tags`, `/api/bookmark/special-dates`, `/api/bookmark/goals`, `/api/bookmark/day-meta`, `/api/bookmark/rating`, `/api/bookmark/review` | 로그인 |
| 부록 | `/api/planner/tasks`, `/api/planner/colors`, `/api/planner/events`, `/api/planner/search`, `/api/planner/completed` | 로그인 |
| 인덱스 | `GET/PUT /api/index-page`, `GET /api/index-page/mine`, `POST /api/index-page/upload` | 쓰기 |
| 갤러리 | `POST /api/gallery/unlock`, `GET /api/gallery/status`, `/api/gallery/invites`, `/api/gallery/sessions` | 일부 관리자 |
| 내보내기 | `POST /api/archive/jobs`, `GET /api/archive/jobs`, `GET /api/archive/jobs/{id}`, `GET /api/archive/jobs/{id}/download` | 로그인/관리자 |
| Mastodon | `/api/settings/mastodon`, `/api/settings/mastodon/test` | 로그인 |
| 방문 통계 | `POST /api/visits`, `GET /api/visits/stats` | 통계 관리자 |
| 임베드 | `GET /api/embeds/preview` | 관리자 |
| 정적 업로드 | `GET /uploads/{path}` | - |

쓰기(POST/PUT/PATCH/DELETE) 요청은 대부분 로그인 세션이 필요합니다. 관리자
전용 여부는 각 라우터의 `require_admin` 의존성을 따릅니다.

## 프로젝트 구조

```
├── api/                         # FastAPI 백엔드
│   ├── alembic/                 # DB 마이그레이션
│   ├── core/                    # 보안·설정·업로드·백그라운드 작업
│   ├── crud/                    # CRUD 로직
│   │   ├── bookmark/            # 책갈피 도메인 패키지
│   │   └── planner/             # 플래너 도메인 패키지
│   ├── db/                      # DB 세션/엔진
│   ├── models/                  # SQLAlchemy ORM 모델
│   ├── routers/                 # API 라우터
│   ├── schemas/                 # Pydantic 스키마
│   ├── tests/                   # unittest 기반 API 테스트
│   ├── main.py                  # FastAPI 앱
│   ├── entrypoint.sh            # 컨테이너 시작 + 마이그레이션
│   └── migrate.sh               # 마이그레이션 스크립트
├── web/                         # Next.js 프론트엔드
│   ├── app/                     # App Router 페이지
│   │   ├── admin/               # 관리자 페이지
│   │   ├── bookmark/            # 책갈피
│   │   ├── planner/             # 부록
│   │   ├── memo/                # 주석
│   │   ├── gallery/             # 갤러리 초대/열람
│   │   └── ...                  # 작가·책·삽화·링크·검색
│   ├── components/              # 공통 컴포넌트
│   ├── config/                  # 레이아웃·테마·내비게이션 설정
│   ├── lib/                     # API·인증·날짜·테마 유틸
│   └── public/styles/           # SCSS 스타일
├── bin/                         # 개발/운영 서버 스크립트
├── docker-compose.yml           # 운영 Docker Compose
├── docker-compose.dev.yml       # 개발 Docker Compose
└── .env.development             # 개발 환경 변수
```

## 라이선스

GNU General Public License v3.0
