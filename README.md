# 어디에도 없는 섬

**Rimien Siarte**의 창작 세계관 웹사이트입니다.

## 기술 스택

| 계층 | 기술 |
|------|------|
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, SCSS, HeroUI |
| **Backend** | FastAPI (Python 3.11), SQLAlchemy 2.0, Alembic |
| **Database** | PostgreSQL 14 |
| **Auth** | JWT (access + refresh token, httpOnly cookie, bcrypt) |
| **Infra** | Docker Compose |

## 아키텍처

```
Host:2222 → web (Next.js :3000) → /api/* rewrite → api (FastAPI :8000) → db (PostgreSQL :5432)
```

- `web`은 외부 포트 2222로 노출, `api`와 `db`는 내부망 격리
- Next.js rewrites로 `/api/*` 요청을 FastAPI로 프록시
- 개발 모드는 `ENVIRONMENT=development`로 실행되어 hot-reload, 자동 SECRET_KEY 생성 등 지원

## 시작하기

### 필수 조건

- Docker & Docker Compose

### 개발 환경

```bash
# 저장소 클론
git clone <repo-url>
cd homepage

# 개발 서버 실행
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

- **Frontend**: http://localhost:2222
- **API**: http://localhost:8000
- 계정: `admin` / `admin` (개발 환경 자동 생성)

### 운영 환경

```bash
# .env.production 파일 생성 (sample 복사 후 값 채우기)
cp .env.production.sample .env.production

# 운영 서버 실행
docker compose up --build -d
```

### 환경 변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `SECRET_KEY` | 운영 필수 | JWT 서명용 비밀키 (개발은 자동 생성) |
| `ENVIRONMENT` | 선택 | `production` 설정 시 운영 모드 |
| `DB_HOST` | 필수 | PostgreSQL 호스트 |
| `DB_PORT` | 필수 | PostgreSQL 포트 (기본 5432) |
| `DB_NAME` | 필수 | 데이터베이스 이름 |
| `DB_USER` | 필수 | 데이터베이스 사용자 |
| `DB_PASS` | 필수 | 데이터베이스 비밀번호 |
| `POSTGRES_DB` | DB 컨테이너 | PostgreSQL 초기 데이터베이스 |
| `POSTGRES_USER` | DB 컨테이너 | PostgreSQL 초기 사용자 |
| `POSTGRES_PASSWORD` | DB 컨테이너 | PostgreSQL 초기 비밀번호 |

### 마이그레이션

```bash
# 개발 환경
sh api/migrate.sh --dev

# 운영 환경
sh api/migrate.sh
```

## 페이지 구성

| 경로 | 설명 | 인증 |
|------|------|------|
| `/` | 메인 페이지 | - |
| `/author` | 작가 소개 | - |
| `/characters` | 등장인물 갤러리 | - |
| `/characters/profile?character=<slug>` | 캐릭터 상세 | - |
| `/books` | 목차 | - |
| `/links` | 링크 (웹링) | - |
| `/signin` | 관리자 로그인 | - |
| `/admin` | 관리자 대시보드 | 필요 |
| `/admin/*` | 관리 페이지 | 필요 |

## API 엔드포인트

| Method | 경로 | 인증 | 설명 |
|--------|------|------|------|
| GET | `/links` | - | 링크 목록 |
| POST | `/links` | 필요 | 링크 생성 |
| PUT | `/links/{id}` | 필요 | 링크 수정 |
| DELETE | `/links/{id}` | 필요 | 링크 삭제 |
| GET | `/profiles` | - | 프로필 목록 |
| POST | `/profiles` | 필요 | 프로필 생성 |
| PUT | `/profiles/{id}` | 필요 | 프로필 수정 |
| DELETE | `/profiles/{id}` | 필요 | 프로필 삭제 |
| POST | `/users/signin` | - | 로그인 |
| GET | `/users/me` | 필요 | 현재 사용자 정보 |

쓰기(POST/PUT/DELETE) 엔드포인트는 JWT 인증이 필요합니다.

## 프로젝트 구조

```
├── api/                    # FastAPI 백엔드
│   ├── alembic/            # DB 마이그레이션
│   ├── crud/               # CRUD 로직
│   ├── db/                 # DB 세션/엔진
│   ├── models/             # SQLAlchemy ORM 모델
│   ├── routers/            # API 라우터
│   ├── schemas/            # Pydantic 스키마
│   ├── entrypoint.sh       # 컨테이너 시작 스크립트
│   └── migrate.sh          # 마이그레이션 스크립트
├── web/                    # Next.js 프론트엔드
│   ├── app/                # App Router 페이지
│   │   ├── admin/          # 관리자 페이지
│   │   ├── author/         # 작가 소개
│   │   ├── books/          # 목차
│   │   ├── characters/     # 등장인물
│   │   ├── links/          # 링크
│   │   └── signin/         # 로그인
│   └── components/         # 공통 컴포넌트
├── docker-compose.yml       # 운영 Docker Compose
├── docker-compose.dev.yml   # 개발 Docker Compose
└── .env.development         # 개발 환경 변수
```

## 라이선스

GNU General Public License v3.0
