# API 계약

마지막 업데이트: 2026-05-24

모든 API는 API Gateway HTTP API 뒤에 있으며, Cognito JWT authorizer를 통과해야 한다. 클라이언트는 `Authorization: Bearer <access_token>` 헤더를 보낸다.

## 공통 응답

성공 응답은 JSON이다.

오류 응답:

```json
{
  "error": "Human readable error message."
}
```

공통 status:

- `400`: 요청 body 형식 또는 값이 잘못됨.
- `401`: JWT가 없거나 authorizer를 통과하지 못함.
- `404`: 정의되지 않은 route.
- `409`: 현재 상태와 충돌.
- `500`: 예상하지 못한 서버 오류. 내부 세부 정보는 노출하지 않는다.

## GET /api/health

목적: 인증된 사용자의 API 연결 확인.

요청 body: 없음.

응답:

```json
{
  "ok": true,
  "service": "pineflow-api"
}
```

설계 메모: 비용 방어를 위해 health route도 public으로 열지 않는다.

## GET /api/state

목적: 현재 사용자 상태, 최근 기록, 활성 세션, 목표 시간을 조회한다.

요청 body: 없음.

응답:

```json
{
  "records": [
    {
      "id": "session-id:in",
      "type": "check-in",
      "timestamp": "2026-05-20T09:00:00.000Z",
      "mode": "focus",
      "note": "오전 집중"
    }
  ],
  "activeSession": {
    "id": "session-id",
    "checkInAt": "2026-05-20T09:00:00.000Z",
    "mode": "focus",
    "note": "오전 집중"
  },
  "dailyGoalMinutes": 480
}
```

## POST /api/check-in

목적: 활성 세션이 없을 때 출근/작업 시작 기록을 만든다.

요청:

```json
{
  "mode": "focus",
  "note": "오전 집중"
}
```

허용 mode:

- `focus`
- `remote`
- `study`
- `project`

제약:

- body는 JSON object여야 한다.
- body 최대 크기는 4KB다.
- `note`는 서버에서 300자로 자른다.
- 이미 활성 세션이 있으면 `409`.

응답: `GET /api/state`와 같은 형태.

## POST /api/check-out

목적: 현재 활성 세션을 종료한다.

요청 body: 없음.

제약:

- 활성 세션이 없으면 `409`.

응답: `GET /api/state`와 같은 형태.

## PATCH /api/records/{recordId}

목적: 잘못 누른 출근/퇴근 기록의 시간, 기록 종류, 메모를 보정한다. 기록 삭제가 아니라 원본 세션의 속성을 수정하며, 응답은 수정 후의 최신 상태다.

경로 파라미터:

- `recordId`: `GET /api/state`의 `records[].id`. 예: `session-id:in`, `session-id:out`

요청:

```json
{
  "timestamp": "2026-05-20T09:10:00.000Z",
  "mode": "study",
  "note": "강의 듣기"
}
```

제약:

- `timestamp`, `mode`, `note` 중 하나 이상을 보낸다.
- `timestamp`를 보낼 경우 유효한 ISO 시간이어야 한다.
- 수정 가능 범위는 현재 시각 기준 과거 366일에서 미래 5분까지다.
- `mode`를 보낼 경우 `focus`, `remote`, `study`, `project` 중 하나여야 한다.
- `note`는 서버에서 300자로 자른다.
- 출근 시각은 퇴근 시각보다 빨라야 한다.
- 퇴근 시각은 출근 시각보다 늦어야 하며, 아직 퇴근하지 않은 세션의 퇴근 기록은 수정할 수 없다.
- 출근 시각을 수정하면 `SESSION#<ISO 시간>#<session-id>` 정렬 키도 함께 이동한다.
- `mode`와 `note`는 세션 단위 속성이므로 `:in`, `:out` 어느 쪽 기록에서 수정해도 같은 세션의 출근/퇴근 기록에 함께 반영된다.

응답: `GET /api/state`와 같은 형태.

## PATCH /api/settings

목적: 사용자 설정을 변경한다.

요청:

```json
{
  "dailyGoalMinutes": 480
}
```

제약:

- `dailyGoalMinutes`는 정수여야 한다.
- 허용 범위는 120 이상 720 이하.

응답: `GET /api/state`와 같은 형태.

## 변경 규칙

API 요청/응답/status가 바뀌면 이 문서를 같은 변경에서 갱신한다. 프론트엔드 타입(`src/types.ts`)과 Lambda 응답 구조가 이 계약을 따라야 한다.
