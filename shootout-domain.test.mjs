import test from "node:test";
import assert from "node:assert/strict";
import {
  completeMatch,
  createShootOut,
  getNextPendingMatch,
  hasCompletedDependentMatches,
  isValidParticipantCount,
  rebuildFromCorrectedMatch,
  validateScore,
} from "./shootout-domain.mjs";

const participants = (count) => Array.from({ length: count }, (_, index) => ({ id: `s${index + 1}`, name: `Schutter ${index + 1}` }));
const winPending = (shootOut, scoreA = 10, scoreB = 5) => completeMatch(shootOut, getNextPendingMatch(shootOut).id, { scoreA, scoreB });

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

test("gelijke basisscore vereist een beslissende score", () => {
  const shootOut = createShootOut(participants(2));
  const match = getNextPendingMatch(shootOut);
  assert.throws(() => completeMatch(shootOut, match.id, { scoreA: 10, scoreB: 10 }), /Gelijke score/);
  const completed = completeMatch(shootOut, match.id, { scoreA: 10, scoreB: 10 }, [{ scoreA: 3, scoreB: 4 }]);
  assert.equal(completed.winnerId, "s2");
});

test("meerdere gelijke beslissingsrondes blijven bewaard", () => {
  const shootOut = createShootOut(participants(2));
  const match = getNextPendingMatch(shootOut);
  const completed = completeMatch(
    shootOut,
    match.id,
    { scoreA: 8, scoreB: 8 },
    [
      { scoreA: 2, scoreB: 2 },
      { scoreA: 5, scoreB: 4 },
    ],
  );
  assert.equal(completed.rounds[0].matches[0].tieBreaks.length, 2);
  assert.equal(completed.winnerId, "s1");
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
