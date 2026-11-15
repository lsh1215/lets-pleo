# 렛츠 플레오 서버

Node.js 22.23.2, TypeScript, Fastify, SQLite로 만든 로컬 개발 서버다. 모바일 게스트 계정과 차량 연결, 여행 제출, 기본 보상, 재료 사용, 가구 배치를 제공한다. 현재 제품 전체 범위 중 일부만 구현되어 있다.

```sh
npm ci
npm run build
npm test
npm run dev
```

셸의 `node --version`이 22가 아니면 먼저 `nvm use`로 `.nvmrc`의 버전을 선택한다. 다른 Node 메이저 버전에서는 SQLite 네이티브 모듈이 실행되지 않을 수 있다.

기본 주소는 `http://127.0.0.1:4187`이다. `PORT`와 `LETS_PLEO_DB`로 포트와 SQLite 경로를 바꿀 수 있다. 비밀값을 담은 설정 파일은 사용하지 않는다. 로컬 DB 파일은 소스 관리에서 제외한다.

구현된 API: `POST /v1/guest`, `POST /v1/pair-code`, `POST /v1/pair`, `GET /v1/devices`, `DELETE /v1/devices/:deviceId`, `GET /v1/state`, `POST /v1/trips`, `POST /v1/grants/:grantId/claim`, `POST /v1/craft`, `POST /v1/items/:itemId/place`, `GET /health`. 연결 코드는 8자리 숫자이며 5분 만료, 재사용 금지, 10분당 오입력 5회 제한을 적용한다. 차량 토큰은 여행 제출에만 사용하고 모바일 토큰은 마을 명령과 차량 연결 관리에 사용한다.

2026-11-15 검증: TypeScript 컴파일과 게스트→기기 연결→여행→보상→제작→배치 통합 테스트, 코드 만료·오입력 제한·연결 해제·토큰 권한 분리 테스트가 Node 22에서 통과했다. 실제 두 AVD의 연결 UI도 통과했다. 서버의 모든 성공 기준이 완료된 것은 아니다. 오프라인 복구, 3D 게임 콘텐츠, 보안·성능·내구성 기준은 계속 구현·검증해야 한다.
