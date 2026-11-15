# 렛츠 플레오: 주행 중 적립 → 모바일 꾸미기 데모

## 최신 데모

[89초 실제 앱 영상](../verification/20261115/live-collection/lets-pleo-live-materials-demo.mp4)

1. **차량 주행:** 재료 수량이 `0/0/0/0 → 2/1/0/0 → 4/3/2/1`로 늘어난다. 순서는 나무·돌·천·씨앗이다.
2. **D 상태에서 정지:** 10초 이상 같은 수량을 유지한다. 속도를 올리면 이동 기록 수집이 재개된다.
3. **도착:** P·정지 30초 후, 차량 여행 가방의 `4/3/2/1`이 모바일 수령 가능 보상으로 확정된다.
4. **모바일:** 같은 `4/3/2/1`을 수령하고, 그 안의 나무 4·돌 1로 새 여행 벤치를 제작·배치한다. 기존 벤치·화단 옆에 벤치 1개가 추가된다.

이 시연 계정은 같은 날 기본 보상 `8/6/4/2`를 이미 받았으므로 남은 일일 상한까지 적립했다. 기존 인벤토리는 삭제하지 않았다. 수령 전후 재료 차이와 제작 비용을 실제 API 상태로 대조했다.

차량 영상은 전용 Pleos 에뮬레이터의 실제 SDK 입력을 녹화한 것이다. 실차 시험은 아니다. 주행 일부 구간을 발췌했으며 원본도 보관한다. 게임 시계 가속, 재료 주입, 예시 수량 화면은 이 데모에 사용하지 않았다.

## 달라진 적립 규칙

- 새 차량 앱은 **유효 이동 15초마다** 실제 수집 시간을 서버에 전달한다.
- 나무는 15초당 2개, 돌은 1개, 천과 씨앗은 30초당 1개씩 적립한다.
- 차량 화면은 서버가 적립한 수량만 표시한다. 임의로 숫자를 올리는 클라이언트 연출이 아니다.
- 하루 최대 나무 12·돌 9·천 6·씨앗 3. 기존 당일 보상도 한도에서 차감한다. 새 여행은 시작일의 한국 날짜에 귀속한다.
- 정지·유효 속도 신호 없음은 이동 시간을 늘리지 않는다. 네트워크 오류에는 마지막 확인 수량과 연결 대기를 표시한다.
- 주행 중 적립한 가방은 도착 전까지 모바일 수령이 잠긴다. 도착 후 같은 적립 내역을 한 번 수령한다.
- 구형 클라이언트의 5분/15분 보따리 규칙은 호환용으로 남았다. 실시간 적립을 시작한 계정은 이후 새 규칙을 따른다.

## 증거

- [주행 시작](../verification/20261115/live-collection/drive-00.png) · [첫 적립](../verification/20261115/live-collection/drive-first.png) · [재료 누적](../verification/20261115/live-collection/drive-stacked.png)
- [차량 도착](../verification/20261115/live-collection/arrival.png) · [모바일 수령](../verification/20261115/live-collection/mobile-received.png) · [새 벤치 배치](../verification/20261115/live-collection/mobile-final.png)
- [차량 수량·정지·도착 검사](../verification/20261115/live-collection/drive-result.json) · [동일 보상 수령·제작·배치 검사](../verification/20261115/live-collection/mobile-result.json)
- [차량 원본 영상](../verification/20261115/live-collection/drive-raw.mp4) · [모바일 원본 영상](../verification/20261115/live-collection/mobile-raw.mp4)

차량 이동 68초를 실제 SDK로 수집했다. 서버 테스트 18개, 차량 JVM 테스트 9개, debug/demo APK 빌드가 통과했다. 이 단일 데모를 전체 51개 기준·새 계정 3회·장시간 내구성 통과로 처리하지 않는다.

## 실행 환경

| 구성 | 위치 |
|---|---|
| 차량 | `LetsPleoCar`, ADB 5038 / `emulator-5580`, Android 사용자 10 |
| 차량 데모 앱 | `dev.pleos.letspleo.demo` / `렛츠 플레오 데모` |
| 차량 데모 APK | `car/app/build/outputs/apk/demo/app-demo.apk` |
| 제품 차량 APK | `car/app/build/outputs/apk/debug/app-debug.apk` |
| 모바일 | `LetsPleoMobile`, ADB 5038 / `emulator-5582` |
| 모바일 데모 앱 | `dev.pleos.letspleo.mobile.demo` |
| 모바일 데모 APK | `.runtime/lets-pleo-journey-demo.apk` |
| 서버 | `http://127.0.0.1:4187`, `.runtime/lets-pleo-dev.sqlite` |

두 작업 전용 기기와 서버는 실행 상태로 유지한다. 다른 세션의 에뮬레이터는 사용하지 않는다. 최신 수령·제작 흐름은 기존 모바일 제품 코드 그대로 동작하며 차량·서버만 이번에 변경했다.

촬영에 쓴 보상은 이미 수령했다. 반복 발표에는 영상을 재생하고 현재 모바일 마을의 추가 벤치를 보여주면 된다. 일일 상한을 되돌리거나 기존 마을을 초기화하지 않았다. 다음 여행에서도 남은 재료 한도까지만 적립된다.

## 이전 시연

[이전 77초 영상](../verification/20261115/lets-pleo-vehicle-to-village-demo.mp4)은 도착 일괄 보상 버전이다. 최신 주행 중 수량 누적의 증거로 사용하지 않는다. `materials/arrival-preview.png`는 이전 UI 예시 화면이며, 위 최신 영상에는 들어가지 않는다.
