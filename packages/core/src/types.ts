export type State = 'open' | 'in_progress' | 'done' | 'cancelled' | 'tombstone';

export interface ImportanceToken {
  kind: 'importance';
  raw: string;
  tier: 1 | 2 | 3;
}

export interface EstimateToken {
  kind: 'estimate';
  raw: string;
  minutes: number;
}

export interface DueToken {
  kind: 'due';
  raw: string;
  date: string; // ISO YYYY-MM-DD
}

export interface DoneToken {
  kind: 'done';
  raw: string;
  date: string; // ISO YYYY-MM-DD
}

export interface ProjectToken {
  kind: 'project';
  raw: string;
  project: string;
}

export interface FromToken {
  kind: 'from';
  raw: string;
  note: string;
  blockId: string | null; // present for recurrence backrefs (Recurring#^id)
}

export interface MovedToken {
  kind: 'moved';
  raw: string;
  note: string;
  blockId: string;
}

export interface RecurrenceToken {
  kind: 'recurrence';
  raw: string;
  rule: string; // daily | weekly | monthly | mon | … (Phase 2; inert in Phase 1)
}

/** Trailing-metadata tokens, parsed by the right-to-left scan (§3.3–3.4). */
export type Token =
  | ImportanceToken
  | EstimateToken
  | DueToken
  | DoneToken
  | ProjectToken
  | FromToken
  | MovedToken
  | RecurrenceToken;

export interface TaskLine {
  state: State;
  live: boolean;
  text: string;
  tokens: Token[];
  tags: string[];
  blockId: string | null;
}
