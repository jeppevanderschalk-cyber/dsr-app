import test from "node:test";
import assert from "node:assert/strict";
import { calculateChristmasScore, createChristmasDraft, CHRISTMAS_STAGES, DEFAULT_CHRISTMAS_RULES, normalizeChristmasRules, getChristmasRanking, CHRISTMAS_COMPETITION_ID } from "./christmas-course.mjs";

// Testwaarden: geen vastgelegde wedstrijdregels.
const rules = { points: { clay: 10, sleigh: 5, advent: 3, tree: 2, stockings: 4 }, scoring: "points" };
const draft = { ...createChristmasDraft("shooter-a"), hits: { clay: 1, sleigh: 5, advent: 2, tree: 3, stockings: 2, oliebollen: 7 } };

test("zes stages uit de PDF, oliebollen tellen ieder voor één punt", () => {
  assert.equal(CHRISTMAS_STAGES.length, 6);
  const result = calculateChristmasScore(draft, rules);
  assert.equal(result.rawPoints, 56);
  assert.equal(result.penaltyPoints, 6);
  assert.equal(result.net, 50);
  assert.equal(result.result, 50);
});

test("tijd telt alleen mee wanneer de wedstrijdregels hitfactor voorschrijven", () => {
  assert.equal(calculateChristmasScore({ ...draft, time: "12,50" }, { ...rules, scoring: "hitfactor" }).result, 4);
  assert.throws(() => calculateChristmasScore(draft, { ...rules, scoring: "hitfactor" }), /totaaltijd/);
});

test("geen verzonnen puntwaarden of berekening bij ontbrekende wedstrijdregels", () => {
  assert.throws(() => calculateChristmasScore(draft, {}), /Puntentelling ontbreekt/);
  assert.throws(() => calculateChristmasScore(draft, { ...rules, scoring: undefined }), /tijd meetelt/);
});

test("maximaal vijf treffers vanuit de arreslee en één kleiduif; geen negatieve of halve treffers", () => {
  for (const [id, hits] of [["sleigh", 6], ["clay", 2], ["tree", -1], ["advent", 1.5], ["oliebollen", NaN]]) {
    assert.throws(() => calculateChristmasScore({ ...draft, hits: { ...draft.hits, [id]: hits } }, rules), /Ongeldig aantal/);
  }
});

test("veel minpunten blijven zichtbaar als negatief resultaat", () => {
  const input = createChristmasDraft();
  input.hits.tree = 3;
  assert.equal(calculateChristmasScore(input, rules).result, -6);
});

test("voorlopige kerstregels: zes stages met boomstraf en totaaltijd", () => {
  const input = { ...createChristmasDraft(), time: "40", hits: { clay: 1, sleigh: 5, advent: 3, tree: 2, stockings: 4, oliebollen: 12 } };
  const result = calculateChristmasScore(input, DEFAULT_CHRISTMAS_RULES);
  assert.equal(result.rawPoints, 172);
  assert.equal(result.penaltyPoints, 10);
  assert.equal(result.net, 162);
  assert.equal(result.result, 4.05);
});

test("DQ en einde wedstrijd leveren nul op zonder verplichte tijd", () => {
  for (const status of ["dq", "ended"]) {
    assert.equal(calculateChristmasScore({ ...draft, status }, DEFAULT_CHRISTMAS_RULES).result, 0);
  }
});

test("instellingen herstellen ongeldige waarden en behouden expliciet nul", () => {
  const normalized = normalizeChristmasRules({ points: { clay: 0, tree: -5, advent: "" }, scoring: "invalid" });
  assert.equal(normalized.points.clay, 0);
  assert.equal(normalized.points.tree, 5);
  assert.equal(normalized.points.advent, 15);
  assert.equal(normalized.scoring, "hitfactor");
});

test("kerstklassement gebruikt alleen de eerste kerstronde; gewone competitie telt niet mee", () => {
  const scores = [
    { id: "practice", competitionId: CHRISTMAS_COMPETITION_ID, shooterId: "a", createdAt: "2026-10-20", christmasResult: 99, status: "normal" },
    { id: "first", competitionId: CHRISTMAS_COMPETITION_ID, shooterId: "a", createdAt: "2026-10-19", christmasResult: 2, status: "normal" },
    { id: "b", competitionId: CHRISTMAS_COMPETITION_ID, shooterId: "b", createdAt: "2026-10-19", christmasResult: 3, status: "normal" },
    { id: "ordinary", competitionId: "internal-competition-v1", shooterId: "a", createdAt: "2026-10-01", christmasResult: 999 },
  ];
  const ranking = getChristmasRanking(scores, [{ id: "a", name: "Anna" }, { id: "b", name: "Bram" }]);
  assert.deepEqual(ranking.map(({ score }) => score.id), ["b", "first"]);
  assert.deepEqual(getChristmasRanking(scores.filter((score) => score.id !== "first"), [{ id: "a", name: "Anna" }, { id: "b", name: "Bram" }]).map(({ score }) => score.id), ["practice", "b"]);
});
