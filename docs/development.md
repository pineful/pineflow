# 개발 메모

## Node와 npm

이 작업공간은 Windows의 Node.js와 npm을 사용합니다. 현재 환경에서는 npm이 레지스트리에 접근할 때 Node가 Windows 시스템 인증서 저장소를 사용하도록 설정해야 합니다.

의존성 설치나 네트워크가 필요한 npm 명령을 실행하기 전에 다음 값을 설정합니다.

```powershell
$env:NODE_OPTIONS='--use-system-ca'
```

이 설정은 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 문제를 SSL 검증 비활성화 없이 해결합니다.

## 로컬 실행 명령

```powershell
& "C:\Program Files\nodejs\npm.cmd" install
docker compose up -d postgres
& "C:\Program Files\nodejs\npm.cmd" run api
& "C:\Program Files\nodejs\npm.cmd" run build
& "C:\Program Files\nodejs\npm.cmd" run dev
```

API 설정을 바꾸려면 `.env.example`을 `.env`로 복사한 뒤 값을 수정합니다.

Vite 개발 서버를 API와 별도로 띄울 때는 `.env`에 `VITE_API_BASE_URL=http://127.0.0.1:3001`를 둡니다. 그러면 브라우저 요청이 API 서버로 전달됩니다.

`docker compose up -d postgres`를 실행하기 전에는 Docker Desktop이 켜져 있어야 합니다. Docker가 설치되어 있어도 엔진이 꺼져 있으면 PostgreSQL 이미지를 내려받거나 컨테이너를 시작할 수 없습니다.

## 문서 갱신 규칙

기능 변경은 가장 가까운 설계 문서와 함께 반영합니다.

- 기록 동작: `docs/modules/recording.md`
- 요약 계산: `docs/modules/summary.md`
- 저장소 계약: `docs/modules/storage.md`
- 이름, 문구, 로고: `docs/modules/branding.md`
- 제품 범위: `docs/product-plan.md`
- 코드 구조: `docs/architecture.md`
- AWS 운영 구조: `docs/deployment-aws.md`
