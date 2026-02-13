export type BacklogEpicStatus = "todo" | "in-progress" | "done" | "blocked";
export type BacklogItemStatus = "todo" | "wait-implementation" | "in-progress" | "done" | "blocked";
export type BacklogQuestionStatus = "open" | "answered";

export type VisibilityType = "always-visible" | "blocked-until-epic-complete";

export interface VisibilityRule {
  type: VisibilityType;
  dependsOnEpicIds: string[];
}

export interface BacklogEpic {
  id: string;
  title: string;
  notes?: string[];
  status: BacklogEpicStatus;
  visibility: VisibilityRule;
  acceptanceTestIds: string[];
  updatedAt: string;
}

export interface BacklogItem {
  id: string;
  epicId: string;
  title: string;
  notes?: string[];
  status: BacklogItemStatus;
  acceptanceTestIds: string[];
  updatedAt: string;
}

export interface BacklogQuestion {
  id: string;
  title: string;
  details?: string;
  status: BacklogQuestionStatus;
  answer?: string;
  updatedAt: string;
}

export interface BacklogItems {
  version: number;
  updatedAt: string;
  epics: BacklogEpic[];
  items: BacklogItem[];
  questions?: BacklogQuestion[];
}
