import type { WorkMode } from "./types";

export const productName = "Pineflow";
export const tagline = "나만의 리듬으로 흐르는 하루 기록";

export const modeLabels: Record<WorkMode, string> = {
  focus: "집중 근무",
  remote: "원격 루틴",
  study: "학습/성장",
  project: "개인 프로젝트"
};

export const modeDescriptions: Record<WorkMode, string> = {
  focus: "혼자 깊게 하는 일",
  remote: "장소가 중요한 일",
  study: "배우거나 연습하는 일",
  project: "결과물을 만드는 일"
};

export const modePlans: Record<WorkMode, string[]> = {
  focus: ["문서 작성", "코딩", "기획 정리", "딥워크"],
  remote: ["집 업무", "외부 장소", "회의/통화", "운영 정리"],
  study: ["강의 듣기", "책 읽기", "복습 노트", "실습"],
  project: ["기능 구현", "디자인 수정", "버그 수정", "배포 점검"]
};
