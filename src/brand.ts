import type { WorkMode } from "./types";

export const productName = "Pineflow";
export const serviceTitle = "작업사령탑";
export const tagline = "기록 · 날씨 · 지식 브리프";

export const modeLabels: Record<WorkMode, string> = {
  focus: "집중 근무",
  remote: "원격 루틴",
  study: "학습/성장",
  project: "개인 프로젝트"
};

export const modeIcons: Record<WorkMode, string> = {
  focus: "🎯",
  remote: "📍",
  study: "📘",
  project: "✨"
};

export const modeDescriptions: Record<WorkMode, string> = {
  focus: "깊은 일",
  remote: "장소 기반",
  study: "학습/연습",
  project: "결과물"
};

export const modePlans: Record<WorkMode, string[]> = {
  focus: ["문서 작성", "코딩", "기획 정리", "딥워크"],
  remote: ["집 업무", "외부 장소", "회의/통화", "운영 정리"],
  study: ["강의 듣기", "책 읽기", "복습 노트", "실습"],
  project: ["기능 구현", "디자인 수정", "버그 수정", "배포 점검"]
};
