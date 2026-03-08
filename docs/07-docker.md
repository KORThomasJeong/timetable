# 07. Docker 배포

## Docker를 사용하는 이유

- **환경 독립성**: Node.js 버전, OS에 관계없이 동일하게 동작
- **간편한 배포**: `docker compose up -d` 한 줄로 시작
- **데이터 영속성**: 볼륨 마운트로 컨테이너를 재시작해도 DB 유지
- **자동 재시작**: 서버가 재부팅돼도 컨테이너 자동 복구

---

## 파일 구조

```
timetable/
├── Dockerfile           ← 이미지 빌드 설정
├── docker-compose.yml   ← 컨테이너 실행 설정
└── .dockerignore        ← 이미지에서 제외할 파일
```

---

## Dockerfile 설명

```dockerfile
FROM node:18-alpine
# node:18-alpine = Node.js 18 + Alpine Linux (매우 가벼운 Linux)

# better-sqlite3는 네이티브 모듈(C++ 코드 포함)이라 빌드 도구가 필요
RUN apk add --no-cache python3 make g++

WORKDIR /app

# package.json 먼저 복사 → npm install → 소스 복사
# (소스 변경 시 npm install 캐시 재사용 가능)
COPY package*.json ./
RUN npm ci --omit=dev   # 개발 의존성 제외하고 설치

COPY . .    # 나머지 소스 복사

EXPOSE 3000

CMD ["node", "server.js"]
```

### 왜 `npm ci`를 사용하나요?

`npm install`은 `package.json`을 기준으로 최신 버전을 설치하지만,
`npm ci`는 `package-lock.json`에 기록된 **정확한 버전**을 설치합니다.
배포 환경에서는 버전이 바뀌어 예기치 않은 오류가 생기지 않도록 `npm ci`를 씁니다.

---

## docker-compose.yml 설명

```yaml
services:
  timetable:
    build: .          # 현재 폴더의 Dockerfile로 이미지 빌드
    ports:
      - "3000:3000"   # 호스트:컨테이너 포트 매핑
    volumes:
      - ./data:/app/data  # 호스트의 ./data ↔ 컨테이너의 /app/data
    env_file:
      - .env          # .env 파일의 환경변수를 컨테이너에 주입
    environment:
      - PORT=3000
    restart: unless-stopped  # 크래시 시 자동 재시작 (수동 중지 제외)
```

### 볼륨 마운트 (`./data:/app/data`)

```
호스트 (내 서버)          컨테이너
timetable/
└── data/          ←→    /app/data/
    └── timetable.db         └── timetable.db
```

컨테이너 안에서 DB에 쓰는 내용이 호스트 파일에 바로 반영됩니다.
컨테이너를 삭제해도 `./data` 폴더는 남아있으므로 **데이터가 보존**됩니다.

---

## .dockerignore 설명

```
node_modules   ← 이미지 안에서 새로 설치하므로 복사 불필요 (용량 절약)
data           ← DB는 볼륨으로 관리, 이미지에 포함 불필요
.env           ← 비밀 정보 포함, 이미지에 넣으면 보안 위험
.git           ← git 이력 불필요
*.log          ← 로그 파일 불필요
```

---

## 자주 쓰는 명령어

```bash
# 시작 (백그라운드)
docker compose up -d

# 중지
docker compose down

# 재시작 (환경변수 변경 반영 안 됨)
docker compose restart

# 환경변수(.env) 변경 후 재시작 (컨테이너 재생성)
docker compose up -d

# 실시간 로그 보기
docker compose logs -f

# 최근 50줄 로그
docker compose logs --tail=50

# 컨테이너 상태 확인
docker compose ps

# 이미지 재빌드 후 시작 (소스 변경 후)
docker compose up -d --build
```

---

## 환경변수 변경 시 주의사항

```bash
# ❌ 이렇게 하면 환경변수가 반영되지 않음
docker compose restart

# ✅ 이렇게 해야 .env 변경사항이 반영됨
docker compose up -d
```

`restart` 명령은 기존 컨테이너를 그대로 재시작합니다.
환경변수를 새로 읽으려면 컨테이너를 **재생성(recreate)** 해야 합니다.

---

## 포트 변경하기

다른 포트(예: 8080)를 사용하고 싶다면:

```yaml
# docker-compose.yml
ports:
  - "8080:3000"   # 호스트 8080 → 컨테이너 3000
```

또는 `.env`에서:

```env
PORT=8080
```

그리고 `docker compose up -d`로 재시작.
