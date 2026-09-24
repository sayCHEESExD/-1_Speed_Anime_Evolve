/**
 * PLAYTIME GIFTS: the Rewards tile. Each gift opens after that many minutes
 * of the CURRENT session and pays Wins once per session, scaled by rebirths so
 * they stay worth opening. The server counts the minutes and pays.
 */
export interface GiftDef {
  readonly minutes: number;
  readonly wins: number;
}

export const GIFTS: readonly GiftDef[] = [
  { minutes: 1, wins: 2 },
  { minutes: 3, wins: 5 },
  { minutes: 5, wins: 10 },
  { minutes: 10, wins: 20 },
  { minutes: 15, wins: 35 },
  { minutes: 20, wins: 50 },
  { minutes: 30, wins: 80 },
  { minutes: 45, wins: 150 },
];

export const giftWins = (index: number, rebirths: number): number =>
  Math.round((GIFTS[index]?.wins ?? 0) * (1 + Math.max(0, Math.floor(rebirths)) * 0.5));

export const giftReady = (index: number, sessionSeconds: number): boolean => {
  const gift = GIFTS[index];
  return !!gift && sessionSeconds >= gift.minutes * 60;
};
