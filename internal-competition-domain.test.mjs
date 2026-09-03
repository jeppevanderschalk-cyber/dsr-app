import test from "node:test";
import assert from "node:assert/strict";
import { computeStageContribution } from "./internal-competition-domain.mjs";

// Letterlijke kopie van de formule zoals hij vóór deze refactor in
// index.html stond (getInternalStageContribution, met
// INTERNAL_COMPETITION_CONFIG.dynamicWeight en getPrecisionStageWeight()
// vervangen door dezelfde parameters). Dit is een differential test: als
// computeStageContribution() ooit per ongeluk afwijkt van deze bevroren
// referentie, faalt de test -- ook voor invoer die niemand had bedacht als
// los testgeval. Dit bestand zelf nooit wijzigen om een falende test te
// laten slagen; dat zou het hele nut ervan tenietdoen.
function oldFormulaReference(stage, score, dynamicFastestTimeByStage, weights) {
  if (!score) return { contribution: 0 };
  if (stage.scoringType === "precision") {
    const percentage = Math.min(100, ((score.net || 0) / stage.maxPoints) * 100);
    return { contribution: (percentage / 100) * weights.precisionStageWeight };
  }
  const precisionPercentage = Math.min(100, ((score.net || 0) / stage.maxPoints) * 100);
  const fastestTime = dynamicFastestTimeByStage.get(stage.id) || 0;
  const speedPercentage = score.time > 0 && fastestTime > 0 ? Math.min(100, (fastestTime / score.time) * 100) : 0;
  const percentage = precisionPercentage * 0.7 + speedPercentage * 0.3;
  return { contribution: (Math.min(100, percentage) / 100) * weights.dynamicWeight * (stage.weight / 100) };
}

const precisionStage = { id: "stage-short", scoringType: "precision", maxPoints: 100 };
const dynamicStage = { id: "stage-long", scoringType: "hitfactor", maxPoints: 1750, weight: 100 };
const weights = { precisionStageWeight: 40, dynamicWeight: 60 };

test("precisie-onderdeel: netto/max * precisiegewicht (korte baan)", () => {
  const result = computeStageContribution(precisionStage, { net: 80 }, new Map(), weights);
  // 80/100 = 80% * 40 (precisiegewicht) = 32
  assert.equal(result.contribution, 32);
});

test("hitfactor-onderdeel: 70% precisie + 30% snelheid, geschaald naar dynamisch gewicht (lange baan)", () => {
  const fastest = new Map([["stage-long", 20]]); // snelste tijd van iedereen: 20s
  // eigen netto 1400/1750 = 80% precisie; eigen tijd 25s -> snelheid 20/25 = 80%
  const result = computeStageContribution(dynamicStage, { net: 1400, time: 25 }, fastest, weights);
  // (80*0.7 + 80*0.3) = 80% * 60 (dynamisch gewicht) * (100/100 stage-weight) = 48
  assert.equal(result.contribution, 48);
});

test("geen score voor dit onderdeel -> geen bijdrage", () => {
  assert.deepEqual(computeStageContribution(precisionStage, null, new Map(), weights), { contribution: 0 });
  assert.deepEqual(computeStageContribution(precisionStage, undefined, new Map(), weights), { contribution: 0 });
});

test("precisiepercentage wordt begrensd op 100%, ook bij een netto boven het maximum", () => {
  const result = computeStageContribution(precisionStage, { net: 999 }, new Map(), weights);
  assert.equal(result.contribution, 40); // 100% * precisiegewicht 40, niet meer
});

test("geen (geldige) tijd van deze schutter -> 0% snelheid, alleen precisie telt mee", () => {
  const fastest = new Map([["stage-long", 20]]);
  const result = computeStageContribution(dynamicStage, { net: 1750, time: 0 }, fastest, weights);
  // 100% precisie * 0.7 + 0% snelheid * 0.3 = 70% * 60 = 42
  assert.equal(result.contribution, 42);
});

test("nog niemand een geldige tijd neergezet (snelste tijd 0) -> 0% snelheid", () => {
  const result = computeStageContribution(dynamicStage, { net: 1750, time: 25 }, new Map(), weights);
  assert.equal(result.contribution, 42); // zelfde als hierboven: snelheid telt niet mee
});

test("stage-gewicht (bij meerdere lange-baan-onderdelen) schaalt de bijdrage evenredig mee", () => {
  const halfWeightStage = { ...dynamicStage, weight: 50 };
  const fastest = new Map([["stage-long", 20]]);
  const full = computeStageContribution(dynamicStage, { net: 1750, time: 20 }, fastest, weights);
  const half = computeStageContribution(halfWeightStage, { net: 1750, time: 20 }, fastest, weights);
  assert.equal(half.contribution, full.contribution / 2);
});

test("differential: komt overeen met de bevroren oude formule over een brede reeks scenario's", () => {
  const nets = [0, 1, 50, 80, 100, 175, 1000, 1750, 2000, -5];
  const times = [0, -1, 5, 20, 25, 100];
  const fastestTimes = [0, 5, 20, 25];
  const stages = [
    precisionStage,
    { ...precisionStage, maxPoints: 40 },
    dynamicStage,
    { ...dynamicStage, weight: 50 },
    { ...dynamicStage, weight: 33.33 },
  ];
  const weightSets = [weights, { precisionStageWeight: 20, dynamicWeight: 60 }, { precisionStageWeight: 40, dynamicWeight: 80 }];

  let compared = 0;
  stages.forEach((stage) => {
    weightSets.forEach((w) => {
      nets.forEach((net) => {
        times.forEach((time) => {
          fastestTimes.forEach((fastest) => {
            const score = { net, time };
            const map = new Map([[stage.id, fastest]]);
            const actual = computeStageContribution(stage, score, map, w);
            const expected = oldFormulaReference(stage, score, map, w);
            assert.deepEqual(actual, expected, `mismatch voor stage=${JSON.stringify(stage)} score=${JSON.stringify(score)} fastest=${fastest} weights=${JSON.stringify(w)}`);
            compared += 1;
          });
        });
      });
    });
  });
  assert.ok(compared > 1000, `verwachtte >1000 vergelijkingen, kreeg er ${compared}`);
});
