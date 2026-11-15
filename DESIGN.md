# 렛츠 플레오 디자인

## Source of truth
- Status: Active
- Last refreshed: 2026-11-15
- Primary product surfaces: Android 모바일 마을, 제작, 오늘 할 일, 여행 연결; Pleos 차량 탐험
- Evidence reviewed: `docs/lets-pleo-plan.md`, `mobile/main.gd`, `mobile/models.gd`, `mobile/residents.gd`, `verification/20261115/mobile-latest-shortcut.png`.
- References: [Animal Crossing: Pocket Camp Complete](https://www.nintendo.com/en-gb/Games/Smart-device-games/Animal-Crossing-Pocket-Camp-Complete-2711347.html), [Hello Kitty Island Adventure](https://apps.apple.com/us/app/hello-kitty-island-adventure/id1553505132), [Cozy Grove: Camp Spirit](https://www.netflix.com/tudum/articles/cozy-grove-camp-spirit-release-date-news). 장면을 크게 두고 소형 상태 표시와 맥락별 메뉴를 가장자리에 놓는 화면 구성을 참고한다. 캐릭터와 에셋은 자체 제작한다.

## Brand
- Personality: 다정한 여행 기념품, 손으로 만든 작은 마을, 느긋한 수집.
- Trust signals: 보상·재료·오프라인 배치 상태가 읽히고, 운전 중 모바일 조작을 권하지 않는다.
- Avoid: 기본 회색 버튼·드롭다운, 디버그 정보 나열, 게임 장면을 가리는 긴 메뉴, 타 게임 캐릭터·아이콘 모방.

## Product goals
- Goals: 주행 보상을 마을 꾸미기에 쓰는 즐거움; 가구의 발견·제작·배치·주민 반응을 한 흐름으로 연결.
- Non-goals: 주행 중 모바일 플레이, 경쟁·결제·강제 체류.
- Success signals: 기존 51개 성공 기준을 유지하며 D13, E04 시각·조작 검사를 특히 적용한다.

## Personas and jobs
- Primary personas: 차량에서 재료를 모으고 주차 후 마을을 살피는 모바일 플레이어.
- User jobs: 마을 감상, 재료 확인, 가구 제작·배치, 오늘의 정원·의뢰, 차량 연결 및 보상 수령.
- Key contexts of use: 세로 화면, 한 손 터치, 오프라인 감상·배치 초안.

## Information architecture
- Primary navigation: 마을 / 꾸미기 / 오늘 / 여행 4개 탭.
- Core routes/screens: 마을 전체 장면; 꾸미기 가구 카드 목록과 선택·배치; 오늘 정원·의뢰; 여행 보상·차량 코드.
- Content hierarchy: 3D 마을 > 현재 행동 > 자원 요약 > 보조 상태.

## Design principles
- 마을이 주인공: 기본 화면에서 장면이 화면 대부분을 차지한다.
- 한 번에 한 일: 제작·의뢰·차량 연결은 선택한 패널에만 표시한다.
- 재료를 촉각적으로: 크림 종이, 살구색 버튼, 세이지 배경, 얕은 그림자와 둥근 카드.
- Tradeoffs: 화려한 장식보다 작은 화면의 한글 가독성·터치 크기를 우선한다.

## Visual language
- Color: 배경 `#EAF2DC`, 종이 `#FFF8E9`, 잉크 `#3D5141`, 세이지 `#78A887`, 살구 `#ED9C70`, 연한 황금 `#F3CF78`.
- Typography: 한글 시스템 폴백, 제목 22–28, 정보 13–16, 주요 버튼 15–17 Godot 가상 픽셀.
- Spacing/layout rhythm: 8 단위, 화면 가장자리 12–16, 카드 안쪽 12–16.
- Shape/radius/elevation: 카드 반경 18–26, 칩 16 이상, 가벼운 그림자, 회색 기본 테마를 드러내지 않는다.
- Motion: 주민 걷기와 장면 조작을 중심으로, 패널은 즉시 열린다.
- Imagery/iconography: 자체 저폴리곤 가구·주민, 재료별 색 점과 간결한 문자 기호. 원본 게임 에셋 사용 금지.

## Components
- Existing components to reuse: `mobile/models.gd` 27종 모델, `mobile/residents.gd` 주민, 제작·배치·정원·의뢰 API 흐름.
- New/changed components: 상태 상단 배지와 새로고침, 자원 칩, 하단 내비게이션, 자체 3D 모델의 192×192 미리보기를 넣은 가구 카드, 맥락별 패널, 첫 마을 안내 카드, 스타일이 적용된 행동 버튼.
- Variants and states: 선택, 비활성, 제작 가능 여부, 오프라인 배치 초안, 배치 충돌.
- Token/component ownership: 색과 스타일은 `mobile/main.gd` 공용 헬퍼에 둔다.

## Accessibility
- Target standard: 작은 화면에서 글과 조작의 가독성 확보.
- Keyboard/focus behavior: Godot 버튼의 기본 포커스 조작 유지; 시각적 상태도 적용.
- Contrast/readability: 어두운 녹색 글자와 밝은 크림 배경, 상태 문구는 빈 화면 대신 설명 표시.
- Screen-reader semantics: Godot 4 모바일 UI의 접근성 지원 범위는 별도 기기 검증이 필요하다.
- Reduced motion and sensory considerations: 자동 화면 흔들림과 점멸 없음.

## Responsive behavior
- Supported breakpoints/devices: 360×800dp 및 412×915dp 목표; 현재 304×640 렌더도 시각 검사.
- Layout adaptations: 기본 화면은 상단 정보와 하단 탭만; 열린 패널은 스크롤 가능.
- Touch/hover differences: 필수 기능은 탭으로 사용 가능, 마을 회전·확대는 터치 제스처.

## Interaction states
- Loading: 마을을 불러오는 문구와 화면 구조 유지.
- Empty: 제작 목록이 비어 있으면 다시 시도 안내.
- First run: 벤치 제작·배치 → 첫 의뢰 → 꽃 화단·주민 초대를 장면 위의 작은 카드로 안내.
- Error: 상단 상태에 원인·재시도 방법 표시.
- Success: 제작·배치·수확·의뢰 완료를 짧은 문장으로 표시.
- Disabled: 오늘 수확 완료 시 버튼 비활성 상태를 명확히 표시.
- Offline/slow network: 마을 감상 유지, 배치 초안 표시, 재연결 시 재검증.

## Content voice
- Tone: 친근하고 간결한 한국어.
- Terminology: 재료, 꾸미기, 의뢰, 여행 보상, 차량 연결 코드.
- Microcopy rules: 내부 API 오류 코드를 그대로 보여주지 않고 사용자가 할 일을 알려준다.

## Implementation constraints
- Framework/styling system: Godot 4.7.2 GDScript, 기본 Control·StyleBoxFlat 재사용.
- Design-token constraints: 네이티브 회색 기본 Button·OptionButton 외관 노출 금지.
- Performance constraints: 저폴리곤 모델과 모바일 Compatibility 렌더러.
- Compatibility constraints: Android 모바일 APK, 기존 서버 계약과 저장 파일 호환.
- Test/screenshot expectations: 실제 전용 AVD에서 기본·꾸미기·오늘·여행·편집 화면을 캡처하고 51개 성공 기준 상태에 반영.

## Open questions
- [ ] 출시 전 전용 한글 폰트 라이선스와 접근성 읽기 지원 범위 확인.

## 차량 화면

- 모바일과 같은 크림·살구·세이지 색상, 큰 제목과 72dp 이상의 주요 버튼을 사용한다.
- 정차 화면에는 자체 제작 마을 엽서 일러스트와 탐험 시작·마무리 행동을 둔다.
- 주행 중에는 정적인 여행 가방과 나무·돌·천·씨앗 그림으로 수집 중임을 보여준다. 서버가 적립한 수량은 표시하되 보상 팝업·점멸·조작 버튼은 표시하지 않는다. 차량 상태가 불명이고 수집 중이 아니면 정차 안내를 표시한다.
- 위치 미지원·권한 부족·서버 실패는 할 수 있는 다음 행동을 문장으로 안내한다.

### 차량 재료 수집과 도착 결과

- 글자 크기는 같은 저장소의 road-context-helper 및 trip-soundtrack 차량 UI를 참조했다. 본문 24–28sp, 제목 36–40sp, 상태 22–24sp, 재료 이름 28sp, 획득 수량 40sp, 주요 버튼 28sp·최소 76dp로 맞춘다.
- 나무·돌·천·씨앗은 독립된 Canvas 그림을 쓴다. 주행 중 수집 영역과 도착 수량 영역에서 같은 그림을 재사용한다.
- 주행 중 재료별 수량은 이동 체크포인트에 대한 서버 응답으로 갱신한다. 화면용 임의 카운터를 쓰지 않는다. 시간은 보조 정보로 낮춘다.
- 도착 수량은 서버가 그 여행에 적립한 재료를 그대로 표시한다. 모바일 수령 후에도 같은 결과를 유지한다. 풍경 조각도 그 여행에서 새로 생긴 경우만 표시한다.
- 서버 연결 대기, 새 재료 0개, 기존 여행 상세 미보관을 서로 다르게 표시한다. 알 수 없는 값은 0으로 표현하지 않는다.
