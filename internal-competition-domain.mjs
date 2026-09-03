// Score-berekening voor de interne competitie (SVBB), losgetrokken uit
// index.html zodat de kernformule (afgesproken en vastgelegd: korte baan
// weegt 40%, lange baan 60%) automatisch getest wordt in plaats van alleen
// handmatig geverifieerd te worden na elke wijziging elders in de app.
//
// Puur: geen afhankelijkheid van de globale `state` of DOM. De gewichten die
// index.html normaal uit INTERNAL_COMPETITION_CONFIG haalt, komen hier
// binnen als expliciete parameters (`weights`) -- zo blijft dit bestand
// zelfstandig testbaar en hoeft index.html verder nergens aangepast te
// worden dan de ene functie die dit aanroept.

// Bijdrage van één onderdeel (stage) aan de eindscore van een schutter.
// - Precisie-onderdeel (korte baan): netto / max, geschaald naar het
//   precisie-aandeel (standaard 40%, verdeeld over het aantal
//   precisie-onderdelen).
// - Hitfactor-onderdeel (lange baan): 70% precisie (netto / max) + 30%
//   snelheid (snelste tijd van iedereen / eigen tijd), geschaald naar het
//   gewicht van dit onderdeel binnen het dynamische aandeel (standaard 60%).
// Geeft { contribution: 0 } als er nog geen score is (onderdeel nog niet
// geschoten).
export function computeStageContribution(stage, score, dynamicFastestTimeByStage, weights) {
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
