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

test("elk aantal van 2 t/m 32 is geldig, daarbuiten niet", () => {
  assert.equal(isValidParticipantCount(2), true);
  assert.equal(isValidParticipantCount(3), true);
  assert.equal(isValidParticipantCount(10), true);
  assert.equal(isValidParticipantCount(32), true);
  assert.equal(isValidParticipantCount(1), false);
  assert.equal(isValidParticipantCount(33), false);
  assert.equal(isValidParticipantCount(2.5), false);
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

test("10 deelnemers krijgen 6 bye's zodat ronde 2 op 8 uitkomt", () => {
  const shootOut = createShootOut(participants(10));
  const round1 = shootOut.rounds[0];
  const byeMatches = round1.matches.filter((match) => match.isBye);
  const realMatches = round1.matches.filter((match) => !match.isBye);
  assert.equal(byeMatches.length, 6);
  assert.equal(realMatches.length, 2);
  // Elke bye is meteen "gewonnen" door de enige deelnemer, zonder score.
  byeMatches.forEach((match) => {
    assert.equal(match.status, "completed");
    assert.equal(match.shooterB, null);
    assert.equal(match.winnerId, match.shooterA.shooterId);
  });
  // Alle 10 deelnemers komen precies één keer voor in ronde 1.
  const allIds = round1.matches.flatMap((match) => [match.shooterA.shooterId, match.shooterB?.shooterId]).filter(Boolean);
  assert.equal(new Set(allIds).size, 10);
});

test("een bye-schutter gaat automatisch door en het schema rondt netjes af", () => {
  let shootOut = createShootOut(participants(3)); // bracketSize 4, 1 bye
  assert.equal(shootOut.rounds[0].matches.length, 2); // 1 echt duel + 1 bye
  const byeWinnerId = shootOut.rounds[0].matches.find((match) => match.isBye).winnerId;
  shootOut = winPending(shootOut); // rondt het enige echte duel in ronde 1 af
  // Ronde 1 was daarmee compleet (bye telt al als voltooid) -> ronde 2 (finale) is aangemaakt.
  assert.equal(shootOut.rounds.length, 2);
  assert.equal(shootOut.rounds[1].matches.length, 1);
  const finalists = [shootOut.rounds[1].matches[0].shooterA.shooterId, shootOut.rounds[1].matches[0].shooterB.shooterId];
  assert.ok(finalists.includes(byeWinnerId));
  shootOut = winPending(shootOut);
  assert.equal(shootOut.status, "completed");
});

test("een bye kan niet gecorrigeerd worden", () => {
  const shootOut = createShootOut(participants(3));
  const byeMatchId = shootOut.rounds[0].matches.find((match) => match.isBye).id;
  assert.throws(() => rebuildFromCorrectedMatch(shootOut, byeMatchId), /bye kan niet worden gecorrigeerd/);
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
