export const SHOOT_OUT_SCORE_MIN = 0;
export const SHOOT_OUT_SCORE_MAX = 1000;
export const SHOOT_OUT_MAX_PARTICIPANTS = 32;

const clone = (value) => structuredClone(value);
const nowIso = () => new Date().toISOString();
const makeId = (prefix) =>
  globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// Elk aantal vanaf 2 mag meedoen -- geen macht-van-2 eis meer. Zit het
// aantal er niet precies op (bijv. 10), dan lost createShootOut() dat op met
// bye's (zie daar) zodat de tweede ronde alsnog een nette macht van 2 is.
export function isValidParticipantCount(count) {
  return Number.isInteger(count) && count >= 2 && count <= SHOOT_OUT_MAX_PARTICIPANTS;
}

function nextPowerOfTwo(count) {
  let value = 1;
  while (value < count) value *= 2;
  return value;
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
    return { valid: false, message: "Vul een geldig aantal treffers in." };
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
  };
}

// Een bye is geen duel: de schutter gaat automatisch door zonder te spelen.
// Als "meteen voltooide match zonder tegenstander" gemodelleerd, zodat de
// bestaande ronde-voltooiing/volgende-ronde-logica (isRoundComplete,
// createNextRound) ongewijzigd kan blijven werken.
function createByeMatch(roundIndex, matchIndex, shooter) {
  const snapshot = participantSnapshot(shooter);
  return {
    id: makeId("shootout-match"),
    roundIndex,
    matchIndex,
    status: "completed",
    isBye: true,
    shooterA: snapshot,
    shooterB: null,
    winnerId: snapshot.shooterId,
    completedAt: nowIso(),
  };
}

function createRound(participants, roundIndex, { label, byeIds } = {}) {
  const byeSet = byeIds || new Set();
  const playing = participants.filter((item) => !byeSet.has(String(item.shooterId || item.id)));
  const byes = participants.filter((item) => byeSet.has(String(item.shooterId || item.id)));
  const matches = [];
  for (let index = 0; index < playing.length; index += 2) {
    matches.push(createMatch(roundIndex, matches.length, playing[index], playing[index + 1]));
  }
  byes.forEach((shooter) => matches.push(createByeMatch(roundIndex, matches.length, shooter)));
  return {
    id: makeId("shootout-round"),
    roundIndex,
    label: label || getRoundLabel(participants.length),
    matches,
  };
}

export function createShootOut(participants) {
  if (!Array.isArray(participants) || !isValidParticipantCount(participants.length)) {
    throw new Error(`Kies minimaal 2 en maximaal ${SHOOT_OUT_MAX_PARTICIPANTS} schutters.`);
  }
  const snapshots = participants.map(participantSnapshot);
  if (new Set(snapshots.map((item) => item.shooterId)).size !== snapshots.length) {
    throw new Error("Een schutter mag maar één keer deelnemen.");
  }
  // Staat het aantal niet precies op een macht van 2 (bijv. 10), dan krijgen
  // (bracketSize - aantal) willekeurig geloten schutters een bye in de
  // eerste ronde -- zij slaan die ronde over en gaan automatisch door, zodat
  // de tweede ronde alsnog netjes op bracketSize/2 uitkomt en de rest van
  // het schema (kwartfinale/halve finale/finale) ongewijzigd werkt.
  const bracketSize = nextPowerOfTwo(snapshots.length);
  const byeCount = bracketSize - snapshots.length;
  const byeIds = new Set();
  if (byeCount > 0) {
    const shuffled = snapshots.slice();
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    shuffled.slice(0, byeCount).forEach((item) => byeIds.add(item.shooterId));
  }
  const label = byeCount > 0 ? `Eerste ronde · ${byeCount} bye${byeCount > 1 ? "s" : ""} geloot` : getRoundLabel(bracketSize);
  const createdAt = nowIso();
  return {
    id: makeId("shootout"),
    status: "active",
    createdAt,
    updatedAt: createdAt,
    participantIds: snapshots.map((item) => item.shooterId),
    participants: snapshots,
    rounds: [createRound(snapshots, 0, { label, byeIds })],
  };
}

// Er wordt geen tijd gemeten: de baancommandant wijst per duel aan welke
// schutter als eerste klaar was. Die schutter wint, TENZIJ hij/zij een doel
// heeft gemist en de andere schutter (die dus langzamer was) meer treffers
// heeft -- dan wint de andere schutter alsnog. Bij gelijke treffers wint de
// aangewezen snelste. Zonder aanwijzing (nog) geen winnaar te bepalen.
export function determineMatchWinner(match) {
  const scoreA = validateScore(match?.scoreA);
  const scoreB = validateScore(match?.scoreB);
  if (!scoreA.valid || !scoreB.valid) return null;
  const shooterAId = match?.shooterA?.shooterId;
  const shooterBId = match?.shooterB?.shooterId;
  const fasterId = match?.fasterShooterId;
  if (fasterId !== shooterAId && fasterId !== shooterBId) return null;
  const fasterIsA = fasterId === shooterAId;
  const fasterScore = fasterIsA ? scoreA.value : scoreB.value;
  const otherScore = fasterIsA ? scoreB.value : scoreA.value;
  const otherWins = otherScore > fasterScore;
  if (!otherWins) return fasterId;
  return fasterIsA ? shooterBId : shooterAId;
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

export function completeMatch(shootOut, matchId, result) {
  const next = clone(shootOut);
  if (next.status !== "active") throw new Error("Deze Shoot Out is niet meer actief.");
  const roundIndex = next.rounds.findIndex((round) => round.matches.some((match) => match.id === matchId));
  if (roundIndex < 0) throw new Error("Duel niet gevonden.");
  if (roundIndex !== next.rounds.length - 1) throw new Error("Een eerder duel moet via corrigeren worden aangepast.");
  const round = next.rounds[roundIndex];
  const match = round.matches.find((item) => item.id === matchId);
  if (match.status === "completed") throw new Error("Dit duel is al afgerond.");
  const scoreA = validateScore(result?.scoreA);
  const scoreB = validateScore(result?.scoreB);
  if (!scoreA.valid || !scoreB.valid) throw new Error(scoreA.message || scoreB.message);
  if (result?.fasterShooterId !== match.shooterA.shooterId && result?.fasterShooterId !== match.shooterB.shooterId) {
    throw new Error("Kies welke schutter als eerste klaar was.");
  }
  match.scoreA = scoreA.value;
  match.scoreB = scoreB.value;
  match.fasterShooterId = result.fasterShooterId;
  const winnerId = determineMatchWinner(match);
  if (!winnerId) throw new Error("Kon geen winnaar bepalen.");
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
  if (match.isBye) throw new Error("Een bye kan niet worden gecorrigeerd.");
  match.status = "pending";
  delete match.scoreA;
  delete match.scoreB;
  delete match.fasterShooterId;
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

// Voegt de twee losse toplevel-tijdstempels (state.updatedAt) samen tot één
// winnaar op basis van welke shootOut zélf het meest recent is bijgewerkt --
// niet op basis van welke hele sync-state toevallig nieuwer is. Zonder dit
// kan een heel andere, ongerelateerde wijziging op een ander apparaat een
// net bevestigd duel-resultaat weer laten verdwijnen (zie mergeSyncStates in
// index.html): elk veld dat niet los gemerged wordt, volgt namelijk blind de
// hele-state-tijdstempel, terwijl een live Shoot Out juist per duel, snel
// na elkaar, wordt bijgewerkt.
export function mergeShootOut(localShootOut, remoteShootOut) {
  const localAt = String(localShootOut?.updatedAt || "");
  const remoteAt = String(remoteShootOut?.updatedAt || "");
  if (!localShootOut) return remoteShootOut ? clone(remoteShootOut) : null;
  if (!remoteShootOut) return clone(localShootOut);
  return clone(remoteAt > localAt ? remoteShootOut : localShootOut);
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
        if (!match?.id || !match.shooterA?.shooterId || (!match.isBye && !match.shooterB?.shooterId)) return null;
        match.roundIndex = roundIndex;
        match.matchIndex = matchIndex;
      }
    }
    return normalized;
  } catch {
    return null;
  }
}
