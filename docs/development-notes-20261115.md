> README 정리 전 개발 기록입니다. 과거 실행 경로와 APK 상태를 포함하며 현재 제품 소개는 저장소 루트 README를 참고하세요. 시험 원본 링크 일부는 로컬 환경에서만 열립니다.

# 렛츠 플레오

> 이 폴더가 이 앱의 독립 Git 저장소 루트입니다. [독립 빌드·GitHub 업로드 안내](../docs/repository-setup.md)를 참고하세요.

현재 상태: 0단계 차량 앱 골격과 신호 수신 검증 코드 작성. 제품 기능과 51개 성공 기준 검증은 진행 중이며 완료 상태가 아니다.

## 개발 구성

- `car/`: Kotlin 2.2.21, Compose, AGP 8.10.1, Gradle 8.11.1, JDK 17, Android API 28 이상. 차량 앱 application ID는 `dev.pleos.letspleo`.
- Pleos FusedLocation SDK `ai.pleos.playground:FusedLocation:1.1.3`으로 위치 지원 여부와 위치 콜백을 확인한다.
- AAOS CarPropertyManager로 속도·기어 속성 지원 여부와 콜백을 확인한다. CarUxRestrictionsManager로 조작 제한을 읽는다.
- `mobile/` 및 `server/`: 후속 구현 대상. 현재 앱이나 서버가 있다고 표시하지 않는다.

## 빌드

`car/local.properties`에 로컬 Android SDK 경로를 설정한다. 비밀값은 필요 없다.

```sh
cd car
JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew assembleDebug --no-daemon
```

2026-11-15: 별도 Gradle 캐시 경로를 사용해 빌드 성공. APK: `car/app/build/outputs/apk/debug/app-debug.apk`. Pleos 에뮬레이터와 실차 실행은 미검증.

## 검증 상태

- SDK 신호 수신 코드는 빌드되었지만 실제 콜백 수신은 확인하지 못했다.
- 기존 세션의 에뮬레이터를 피하기 위해 프로젝트 전용 AVD `LetsPleoCar`를 만들고 포트 5580으로 기동을 시도했다. 에뮬레이터 프로세스가 종료 코드 132로 종료되어 앱 설치·실행 검증은 진행되지 않았다.
- ADB는 별도 서버 포트 5038을 사용했다. 기본 ADB 포트 5037의 기존 세션에는 앱을 설치하거나 AVD를 종료하지 않았다.
- [51개 성공 기준](../docs/lets-pleo-plan.md) 중 현재 PASS는 빌드 성공을 구성하는 일부 조건뿐이다. 여러 조건이 묶인 A01~E10 항목 전체를 PASS로 판정하지 않는다.

## 공식 근거

- [공모전 개발 환경](https://appdevchallenge.auto-hmg.io/guide/development) — API 28 이상, Gradle 8.0 이상, Java/Kotlin. 확인일 2026-11-15.
- [Pleos 개발 환경](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator) — Pleos Connect Emulator와 Android API 34 이미지. 확인일 2026-11-15.
- [FusedLocation SDK](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/FusedLocation/intro) — 지원 확인, 위치 콜백, `pleos.car.permission.FUSED_LOCATION`. 확인일 2026-11-15.
- [AAOS 차량 속성](https://developer.android.google.cn/reference/android/car/VehiclePropertyIds) — `PERF_VEHICLE_SPEED`, `GEAR_SELECTION`과 읽기 권한. 확인일 2026-11-15.

실제 차량·지역·Pleos App Market의 권한 승인과 API 제공 여부는 에뮬레이터 검증 결과와 별도로 확인해야 한다.
