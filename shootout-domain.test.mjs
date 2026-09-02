import test from "node:test";
import assert from "node:assert/strict";
import {
  completeMatch,
  createShootOut,
  determineMatchWinner,
  getNextPendingMatch,
  hasCompletedDependentMatches,
  isValidParticipantCount,
  mergeShootOut,
  rebuildFromCorrectedMatch,
  validateScore,
} from "./shootout-domain.mjs";

const participants = (count) => Array.from({ length: count }, (_, index) => ({ id: `s${index + 1}`, name: `Schutter ${index + 1}` }));
// Standaard: s1 was de aangewezen snelste en heeft ook de hoogste score.
const winPending = (shootOut, scoreA = 10, scoreB = 5, fasterShooterId) => {
  const match = getNextPendingMatch(shootOut);
  return completeMatch(shootOut, match.id, { scoreA, scoreB, fasterShooterId: fasterShooterId || match.shooterA.shooterId });
};

test("alleen machten van twee vanaf 2 zijn geldig", () => {
  assert.equal(isValidParticipantCount(2), true);
  assert.equal(isValidParticipantCount(4), true);
  assert.equal(isValidParticipantCount(8), true);
  assert.equal(isValidParticipantCount(3), false);
  assert.equal(isValidParticipantCount(1), false);
});

test("twee deelnemers spelen direct een finale", () => {
  let shootOut = createShootOut(participants(2));
  assert.equal(shootOut.rounds[0].label, "Finale");
  shootOut = winPending(shootOut);
  assert.equal(shootOut.status, "completed");
  assert.equal(shootOut.winnerId, "s1");
});

test("vier deelnemers leveren halve finale en finale", () => {
  let shootOut = createShootOut(participants(4));
  shootOut = winPending(shootOut);
  shootOut = winPending(shootOut);
  assert.equal(shootOut.rounds.length, 2);
  assert.deepEqual(shootOut.rounds[1].matches[0].shooterA.shooterId, "s1");
  assert.deepEqual(shootOut.rounds[1].matches[0].shooterB.shooterId, "s3");
  shootOut = winPending(shootOut);
  assert.equal(shootOut.winnerId, "s1");
});

test("acht deelnemers bouwen kwartfinale, halve finale en finale", () => {
  let shootOut = createShootOut(participants(8));
  for (let index = 0; index < 7; index += 1) shootOut = winPending(shootOut);
  assert.deepEqual(shootOut.rounds.map((round) => round.matches.length), [4, 2, 1]);
  assert.equal(shootOut.status, "completed");
});

test("aangewezen snelste wint bij gelijke score", () => {
  const shootOut = createShootOut(participants(2));
  const match = getNextPendingMatch(shootOut);
  const completed = completeMatch(shootOut, match.id, { scoreA: 8, scoreB: 8, fasterShooterId: "s2" });
  assert.equal(completed.winnerId, "s2");
});

test("aangewezen snelste wint ook met minder treffers, zolang het niet minder is dan de ander", () => {
  const match = {
    shooterA: { shooterId: "s1" },
    shooterB: { shooterId: "s2" },
    scoreA: 9,
    scoreB: 9,
    fasterShooterId: "s1",
  };
  assert.equal(determineMatchWinner(match), "s1");
});

test("snelste verliest alsnog als hij een doel heeft gemist en de ander meer treffers heeft", () => {
  const shootOut = createShootOut(participants(2));
  const match = getNextPendingMatch(shootOut);
  // s1 was sneller (aangewezen), maar miste een doel: 8 treffers tegen 10 van s2.
  const completed = completeMatch(shootOut, match.id, { scoreA: 8, scoreB: 10, fasterShooterId: "s1" });
  assert.equal(completed.winnerId, "s2");
});

test("snelste wint gewoon als hij evenveel of meer treffers heeft dan de ander", () => {
  const shootOut = createShootOut(participants(2));
  const match = getNextPendingMatch(shootOut);
  const completed = completeMatch(shootOut, match.id, { scoreA: 10, scoreB: 8, fasterShooterId: "s1" });
  assert.equal(completed.winnerId, "s1");
});

test("zonder aangewezen snelste schutter is er geen winnaar", () => {
  const shootOut = createShootOut(participants(2));
  const match = getNextPendingMatch(shootOut);
  assert.throws(() => completeMatch(shootOut, match.id, { scoreA: 10, scoreB: 8 }), /Kies welke schutter/);
});

test("correctie verwijdert afhankelijke vervolgrondes", () => {
  let shootOut = createShootOut(participants(4));
  const firstMatchId = getNextPendingMatch(shootOut).id;
  shootOut = winPending(shootOut);
  shootOut = winPending(shootOut);
  shootOut = winPending(shootOut);
  assert.equal(hasCompletedDependentMatches(shootOut, firstMatchId), true);
  shootOut = rebuildFromCorrectedMatch(shootOut, firstMatchId);
  assert.equal(shootOut.status, "active");
  assert.equal(shootOut.rounds.length, 1);
  assert.equal(shootOut.rounds[0].matches[0].status, "pending");
});

test("scorevalidatie blokkeert leeg, tekst, negatief en boven maximum", () => {
  assert.equal(validateScore(0).valid, true);
  assert.equal(validateScore(1000).valid, true);
  assert.equal(validateScore("").valid, false);
  assert.equal(validateScore("tekst").valid, false);
  assert.equal(validateScore(-1).valid, false);
  assert.equal(validateScore(1001).valid, false);
});

test("mergeShootOut kiest de shootOut met de nieuwste eigen tijdstempel, niet die van de hele state", () => {
  const older = { id: "so-1", updatedAt: "2026-01-01T10:00:00.000Z", status: "active" };
  const newer = { id: "so-1", updatedAt: "2026-01-01T10:05:00.000Z", status: "active" };
  assert.equal(mergeShootOut(newer, older).updatedAt, newer.updatedAt);
  assert.equal(mergeShootOut(older, newer).updatedAt, newer.updatedAt);
  assert.equal(mergeShootOut(null, newer).updatedAt, newer.updatedAt);
  assert.equal(mergeShootOut(newer, null).updatedAt, newer.updatedAt);
  assert.equal(mergeShootOut(null, null), null);
});
