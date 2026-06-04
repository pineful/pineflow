# API 계약

마지막 업데이트: 2026-06-04

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

정렬:

- `records`는 세션 시작 시각이 아니라 각 출근/퇴근 이벤트의 실제 `timestamp` 기준 최신순으로 반환한다.
- 자정을 넘긴 세션이나 퇴근 시각만 보정된 세션도 이벤트 시각 기준 위치에 보여야 한다.

## GET /api/usage

목적: 앱 하단 운영 패널에 표시할 이번 달 AWS 기초 사용량을 조회한다.

요청 body: 없음.

응답:

```json
{
  "generatedAt": "2026-06-04T00:00:00.000Z",
  "periodStart": "2026-06-01T00:00:00.000Z",
  "periodEnd": "2026-06-04T00:00:00.000Z",
  "source": "cloudwatch",
  "note": "실제 청구액은 AWS Budgets 알림과 Billing 콘솔에서 최종 확인합니다. 이 화면은 비용을 유발하는 기초 사용량만 보여줍니다.",
  "modules": [
    {
      "id": "lambda",
      "label": "Lambda",
      "caption": "출퇴근 API 실행",
      "metrics": [
        {
          "id": "invocations",
          "label": "호출",
          "value": 10,
          "unit": "count"
        }
      ]
    }
  ]
}
```

현재 표시 대상:

- API Gateway 요청 수.
- Lambda 호출 수와 오류 수.
- DynamoDB consumed read/write capacity units.
- CloudFront 요청 수와 다운로드 전송량.
- S3 저장량과 객체 수.

설계 제약:

- 이 API는 Cost Explorer를 호출하지 않는다. Cost Explorer 권한을 앱 Lambda에 주지 않는다.
- 실제 청구액 판단은 AWS Budgets 알림과 Billing 콘솔에서 한다.
- 앱은 이 API를 화면 진입 직후 즉시 호출하지 않고, `/api/state`와 겹쳐 throttling을 유발하지 않도록 짧게 지연 호출한다.
- 운영 지표 조회 실패는 기록 기능 실패로 보여주지 않고, 하단 운영 패널 안에서만 `불러올 수 없음`으로 표시한다.

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
- 클라이언트는 사용자가 실제로 변경한 필드만 보내야 한다. 메모나 업무 유형만 수정할 때 기존 `timestamp`를 다시 보내지 않는다.
- `timestamp`를 보낼 경우 유효한 ISO 시간이어야 한다.
- 수정 가능 범위는 현재 시각 기준 과거 366일에서 미래 5분까지다.
- `mode`를 보낼 경우 `focus`, `remote`, `study`, `project` 중 하나여야 한다.
- `note`는 서버에서 300자로 자른다.
- 출근 시각은 퇴근 시각보다 빨라야 한다.
- 퇴근 시각은 출근 시각보다 늦어야 하며, 아직 퇴근하지 않은 세션의 퇴근 기록은 수정할 수 없다.
- 출근 시각을 수정하면 `SESSION#<ISO 시간>#<session-id>` 정렬 키도 함께 이동한다.
- `mode`와 `note`는 세션 단위 속성이므로 `:in`, `:out` 어느 쪽 기록에서 수정해도 같은 세션의 출근/퇴근 기록에 함께 반영된다.

응답: `GET /api/state`와 같은 형태.

## DELETE /api/records/{recordId}

목적: 잘못 생성된 기록이 속한 세션 전체를 삭제한다. Pineflow는 출근과 퇴근을 하나의 세션 item에 저장하므로, 개별 출근 또는 개별 퇴근만 삭제하지 않는다.

경로 파라미터:

- `recordId`: `GET /api/state`의 `records[].id`. 예: `session-id:in`, `session-id:out`

요청 body: 없음.

제약:

- 삭제 대상은 `recordId`에서 추출한 `session-id`의 `SESSION#...` item이다.
- 활성 세션을 삭제하면 `ACTIVE_SESSION` item도 같은 transaction에서 삭제한다.
- 존재하지 않는 record id이면 `404`.
- 현재 구현은 복구 감사 로그를 남기지 않는다. 감사 로그나 undo가 필요하면 별도 ADR과 저장소 설계를 먼저 추가한다.

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
