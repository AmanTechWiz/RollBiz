/** Most rooms one account can sit in at once; stops a single token from hoarding seats. */
export const MAX_SEATS_PER_USER = 2;

// Process-wide: rooms live in this process's memory (single Fly machine).
const seats = new Map<string, number>();

export function canTakeSeat(userId: string): boolean {
  return (seats.get(userId) ?? 0) < MAX_SEATS_PER_USER;
}

export function takeSeat(userId: string) {
  seats.set(userId, (seats.get(userId) ?? 0) + 1);
}

export function releaseSeat(userId: string) {
  const left = (seats.get(userId) ?? 0) - 1;
  if (left > 0) seats.set(userId, left);
  else seats.delete(userId);
}
