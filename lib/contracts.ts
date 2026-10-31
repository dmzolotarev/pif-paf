import type { CrewRole } from "./roles";
import type { GameSettings } from "./settings";
import type { FinalPerson, FinalStats, FinalTimelineRecord } from "./final-stats";

export type EventItem = {
  id: string;
  type: "killed" | "exposed";
  name: string;
  epitaph: string;
  publish_at: string | null;
  article_format: string | null;
  article_section: string | null;
  article_headline: string | null;
  article_body: string | null;
  article_quote: string | null;
  article_suppressed: number;
  player_id: string;
  has_photo: number;
  feminine: number;
};

export type RosterPlayer = {
  id: string;
  name: string;
  group_name: string;
  role: string;
  hasPhoto: boolean;
  status: "active" | "eliminated" | "removed";
  eliminationReason: "killed" | "exposed" | null;
};

export type Player = {
  id: string;
  name: string;
  group_name: string;
  roleKey: string;
  customRole: string;
  role: string;
  feminine: boolean;
  profileComplete: boolean;
  status: "active" | "eliminated" | "removed";
  hasPhoto: boolean;
  hasPin: boolean;
  eliminationReason: "killed" | "exposed" | null;
};

export type TimelinePerson = FinalPerson;
export type FinalTimelineItem = FinalTimelineRecord;

export type AppState = {
  config: GameSettings;
  game: {
    status: "draft" | "running" | "paused" | "finished";
    activeCount: number | null;
    totalCount: number;
    fogOfWar: boolean;
    exposureRule: "eliminate_killer" | "cancel_kill";
    winners: TimelinePerson[];
  };
  events: EventItem[];
  roster: RosterPlayer[];
  player: Player | null;
  target: { id: string; name: string; group_name: string; role: string; hasPhoto: boolean } | null;
  press: { type: "killed" | "exposed"; submitted: boolean } | null;
  finalTimeline: FinalTimelineItem[];
  finalStats: FinalStats | null;
  crewRoles: CrewRole[];
};
