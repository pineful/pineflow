import type { WorkMode } from "./types";

export const productName = "Pineflow";
export const tagline = "나만의 리듬으로 흐르는 하루 기록";

export const modeLabels: Record<WorkMode, string> = {
  focus: "집중 근무",
  remote: "원격 루틴",
  study: "학습/성장",
  project: "개인 프로젝트"
};
