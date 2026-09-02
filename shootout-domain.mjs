export const SHOOT_OUT_SCORE_MIN = 0;
export const SHOOT_OUT_SCORE_MAX = 1000;

const clone = (value) => structuredClone(value);
const nowIso = () => new Date().toISOString();
const makeId = (prefix) =>
  globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function isValidParticipantCount(count) {
  return Number.isInteger(count) && count >= 2 && (count & (count - 1)) === 0;
}

export function getRoundLabel(participantCount) {
  if (participantCount === 2) return "Finale";
  if (participantCount === 4) return "Halve finale";
  if (participantCount === 8) return "Kwartfinale";
  return `Ronde met ${participantCount} schutters`;
}

export function validateScore(value, max = SHOOT_OUT_SCORE_MAX) {
  const score = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (value === "" || value === null || value === undefined || !Number.isFinite(score)) {
    return { valid: false, message: "Vul een geldige numerieke score in." };
  }
  if (score < SHOOT_OUT_SCORE_MIN || score > max) {
    return { valid: false, message: `De score moet tussen ${SHOOT_OUT_SCORE_MIN} en ${max} liggen.` };
  }
  return { valid: true, value: score, message: "" };
}

function participantSnapshot(participant) {
  return {
    shooterId: String(participant.shooterId || participant.id),
    displayName: String(participant.displayName || participant.name || "Onbekende schutter"),
  };
}

function createMatch(roundIndex, matchIndex, shooterA, shooterB) {
  return {
    id: makeId("shootout-match"),
    roundIndex,
    matchIndex,
    status: "pending",
    shooterA: participantSnapshot(shooterA),
    shooterB: participantSnapshot(shooterB),
    tieBreaks: [],
  };
}

function createRound(participants, roundIndex) {
  const matches = [];
  for (let index = 0; index < participants.length; index += 2) {
    matches.push(createMatch(roundIndex, index / 2, participants[index], participants[index + 1]));
  }
  return {
    id: makeId("shootout-round"),
    roundIndex,
    label: getRoundLabel(participants.length),
    matches,
  };
}

export function createShootOut(participants) {
  if (!Array.isArray(participants) || !isValidParticipantCount(participants.length)) {
    throw new Error("Kies 2, 4, 8, 16 of 32 schutters.");
  }
  const snapshots = participants.map(participantSnapshot);
  if (new Set(snapshots.map((item) => item.shooterId)).size !== snapshots.length) {
    throw new Error("Een schutter mag maar één keer deelnemen.");
  }
  const createdAt = nowIso();
  return {
    id: makeId("shootout"),
    status: "active",
    createdAt,
    updatedAt: createdAt,
    participantIds: snapshots.map((item) => item.shooterId),
    participants: snapshots,
    rounds: [createRound(snapshots, 0)],
  };
}

export function determineMatchWinner(match) {
  const scoreA = validateScore(match?.scoreA);
  const scoreB = validateScore(match?.scoreB);
  if (!scoreA.valid || !scoreB.valid) return null;
  if (scoreA.value > scoreB.value) return match.shooterA.shooterId;
  if (scoreB.value > scoreA.value) return match.shooterB.shooterId;
  for (const tieBreak of match.tieBreaks || []) {
    const tieA = validateScore(tieBreak.scoreA);
    const tieB = validateScore(tieBreak.scoreB);
    if (!tieA.valid || !tieB.valid) return null;
    if (tieA.value > tieB.value) return match.shooterA.shooterId;
    if (tieB.value > tieA.value) return match.shooterB.shooterId;
  }
  return null;
}

export function isRoundComplete(round) {
  return Boolean(round?.matches?.length) && round.matches.every((match) => match.status === "completed" && match.winnerId);
}

export function createNextRound(completedRound) {
  if (!isRoundComplete(completedRound)) throw new Error("Rond eerst alle duels in deze ronde af.");
  const winners = completedRound.matches.map((match) =>
    match.winnerId === match.shooterA.shooterId ? match.shooterA : match.shooterB,
  );
  if (winners.length < 2) return null;
  return createRound(winners, completedRound.roundIndex + 1);
}

export function completeShootOutIfFinalFinished(shootOut) {
  const next = clone(shootOut);
  const finalRound = next.rounds.at(-1);
  if (finalRound?.matches?.length !== 1 || !isRoundComplete(finalRound)) return next;
  const finalMatch = finalRound.matches[0];
  next.status = "completed";
  next.winnerId = finalMatch.winnerId;
  next.completedAt = finalMatch.completedAt || nowIso();
  next.updatedAt = nowIso();
  return next;
}

export function completeMatch(shootOut, matchId, scores, tieBreaks = []) {
  const next = clone(shootOut);
  if (next.status !== "active") throw new Error("Deze Shoot Out is niet meer actief.");
  const roundIndex = next.rounds.findIndex((round) => round.matches.some((match) => match.id === matchId));
  if (roundIndex < 0) throw new Error("Duel niet gevonden.");
  if (roundIndex !== next.rounds.length - 1) throw new Error("Een eerder duel moet via corrigeren worden aangepast.");
  const round = next.rounds[roundIndex];
  const match = round.matches.find((item) => item.id === matchId);
  if (match.status === "completed") throw new Error("Dit duel is al afgerond.");
  const scoreA = validateScore(scores?.scoreA);
  const scoreB = validateScore(scores?.scoreB);
  if (!scoreA.valid || !scoreB.valid) throw new Error(scoreA.message || scoreB.message);
  const normalizedTieBreaks = (tieBreaks || []).map((tieBreak, index) => {
    const tieA = validateScore(tieBreak.scoreA);
    const tieB = validateScore(tieBreak.scoreB);
    if (!tieA.valid || !tieB.valid) throw new Error(tieA.message || tieB.message);
    return { index, scoreA: tieA.value, scoreB: tieB.value };
  });
  match.scoreA = scoreA.value;
  match.scoreB = scoreB.value;
  match.tieBreaks = normalizedTieBreaks;
  const winnerId = determineMatchWinner(match);
  if (!winnerId) throw new Error("Gelijke score – voer een beslissende score in.");
  match.status = "completed";
  match.winnerId = winnerId;
  match.completedAt = nowIso();
  if (isRoundComplete(round)) {
    const followingRound = createNextRound(round);
    if (followingRound) next.rounds.push(followingRound);
  }
  next.updatedAt = nowIso();
  return completeShootOutIfFinalFinished(next);
}

export function getNextPendingMatch(shootOut) {
  if (!shootOut || shootOut.status !== "active") return null;
  for (const round of shootOut.rounds || []) {
    const match = round.matches?.find((item) => item.status === "pending");
    if (match) return match;
  }
  return null;
}

export function rebuildFromCorrectedMatch(shootOut, matchId) {
  const next = clone(shootOut);
  const roundIndex = next.rounds.findIndex((round) => round.matches.some((match) => match.id === matchId));
  if (roundIndex < 0) throw new Error("Duel niet gevonden.");
  const match = next.rounds[roundIndex].matches.find((item) => item.id === matchId);
  match.status = "pending";
  delete match.scoreA;
  delete match.scoreB;
  match.tieBreaks = [];
  delete match.winnerId;
  delete match.completedAt;
  next.rounds = next.rounds.slice(0, roundIndex + 1);
  next.status = "active";
  delete next.winnerId;
  delete next.completedAt;
  next.updatedAt = nowIso();
  return next;
}

export function hasCompletedDependentMatches(shootOut, matchId) {
  const roundIndex = shootOut?.rounds?.findIndex((round) => round.matches.some((match) => match.id === matchId)) ?? -1;
  return roundIndex >= 0 && shootOut.rounds.slice(roundIndex + 1).some((round) => round.matches.some((match) => match.status === "completed"));
}

export function normalizeShootOut(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.rounds)) return null;
  try {
    const normalized = clone(value);
    if (!["active", "completed", "cancelled"].includes(normalized.status)) return null;
    if (!Array.isArray(normalized.participantIds) || !isValidParticipantCount(normalized.participantIds.length)) return null;
    for (const [roundIndex, round] of normalized.rounds.entries()) {
      if (!round || !Array.isArray(round.matches) || !round.matches.length) return null;
      round.roundIndex = roundIndex;
      round.label = round.label || getRoundLabel(round.matches.length * 2);
      for (const [matchIndex, match] of round.matches.entries()) {
        if (!match?.id || !match.shooterA?.shooterId || !match.shooterB?.shooterId) return null;
        match.roundIndex = roundIndex;
        match.matchIndex = matchIndex;
        match.tieBreaks = Array.isArray(match.tieBreaks) ? match.tieBreaks : [];
      }
    }
    return normalized;
  } catch {
    return null;
  }
}
