export type Poll = {
  id: number;
  question: string;
  createdAt: string;
  closedAt: string | null;
};

export type Vote = {
  id: number;
  pollId: number;
  userHash: string;
  option: string;
  createdAt: string;
};

export type CreatePollRequest = {
  question: string;
};

export type CreatePollResponse = {
  poll: Poll;
  activePollId: number;
};

export type VoteRequest = {
  userId: string;
  option: string;
};

export type VoteResults = {
  pollId: number;
  totals: Record<string, number>;
};
