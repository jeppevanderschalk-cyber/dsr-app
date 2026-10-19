export const CHRISTMAS_COMPETITION_ID = "internal-christmas-v1";
export const DEFAULT_CHRISTMAS_RULES = Object.freeze({
  points: Object.freeze({ clay: 25, sleigh: 10, advent: 15, tree: 5, stockings: 10 }),
  scoring: "hitfactor",
});

export function normalizeChristmasRules(rules) {
  const points = Object.fromEntries(Object.entries(DEFAULT_CHRISTMAS_RULES.points).map(([id, fallback]) => {
    const value = rules?.points?.[id];
    return [id, value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback];
  }));
  return { points, scoring: ["points", "hitfactor"].includes(rules?.scoring) ? rules.scoring : DEFAULT_CHRISTMAS_RULES.scoring, updatedAt: String(rules?.updatedAt || "") };
}

// Beschrijvingen uit Christmas editie.pdf. Puntwaarden die de PDF niet noemt,
// worden door de wedstrijdleiding vastgelegd voordat resultaten worden berekend.
export const CHRISTMAS_STAGES = Object.freeze([
  { id: "clay", label: "Stage 1 · Kerstduifjes", description: "Kleiduif: geraakt / niet geraakt.", targetLabel: "Geraakte kleiduif", max: 1 },
  { id: "sleigh", label: "Stage 2 · Arreslee", description: "Zittend vanuit de arreslee: 5 schoten op 5 kerstballen.", targetLabel: "Geraakte kerstballen", max: 5 },
  { id: "advent", label: "Stage 3 · Lucky Bingo", description: "Adventkalender: staand, schiet de feestdagen.", targetLabel: "Geraakte feestdagen" },
  { id: "tree", label: "Stage 4 · Kerstboom", description: "Beklim de ladder en beschiet de kerstboom. Elke geraakte kerstbal levert minpunten op.", targetLabel: "Geraakte kerstballen (minpunten)", penalty: true },
  { id: "stockings", label: "Stage 5 · Kerstsokken", description: "Schiet de kerstsokken van de schouw.", targetLabel: "Geraakte kerstsokken" },
  { id: "oliebollen", label: "Stage 6 · Oliebollen", description: "Liggend, schiet zoveel mogelijk oliebollen. 1 punt per bal.", targetLabel: "Geraakte oliebollen", points: 1 },
]);

export function createChristmasDraft(shooterId = "") {
  return {
    shooterId,
    hits: Object.fromEntries(CHRISTMAS_STAGES.map(({ id }) => [id, 0])),
    time: "",
    notes: "",
    editScoreId: "",
    status: "normal",
  };
}

export function calculateChristmasScore(draft, rules) {
  const stages = CHRISTMAS_STAGES.map((stage) => {
    const hits = Number(draft.hits?.[stage.id]);
    if (!Number.isSafeInteger(hits) || hits < 0 || (stage.max !== undefined && hits > stage.max)) {
      throw new Error(`Ongeldig aantal bij ${stage.label}`);
    }
    const value = stage.points ?? rules?.points?.[stage.id];
    if (value === null || value === undefined || value === "" || !Number.isSafeInteger(Number(value)) || Number(value) < 0) {
      throw new Error(`Puntentelling ontbreekt bij ${stage.label}`);
    }
    if (!Number.isSafeInteger(hits * Number(value))) throw new Error(`Te veel punten bij ${stage.label}`);
    return { id: stage.id, hits, value: Number(value), points: hits * Number(value) * (stage.penalty ? -1 : 1) };
  });
  if (!["points", "hitfactor"].includes(rules?.scoring)) throw new Error("Kies hoe de tijd meetelt");
  const time = Number(String(draft.time ?? "").replace(",", "."));
  const blocked = ["dq", "ended"].includes(draft.status);
  if (!Number.isFinite(time) || time < 0 || (!blocked && rules.scoring === "hitfactor" && time <= 0)) {
    throw new Error("Vul een geldige totaaltijd in");
  }
  const rawPoints = stages.reduce((sum, stage) => sum + Math.max(0, stage.points), 0);
  const penaltyPoints = stages.reduce((sum, stage) => sum + Math.max(0, -stage.points), 0);
  const net = blocked ? 0 : rawPoints - penaltyPoints;
  const hitfactor = time > 0 ? net / time : 0;
  return { stages, rawPoints, penaltyPoints, net, time, hitfactor, result: rules.scoring === "hitfactor" ? hitfactor : net };
}

export function getChristmasRanking(scores, shooters) {
  const firstByShooter = new Map();
  scores.filter((score) => score.competitionId === CHRISTMAS_COMPETITION_ID)
    .slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)))
    .forEach((score) => { if (!firstByShooter.has(score.shooterId)) firstByShooter.set(score.shooterId, score); });
  return [...firstByShooter.values()]
    .map((score) => ({ score, shooter: shooters.find((shooter) => shooter.id === score.shooterId) }))
    .filter((entry) => entry.shooter)
    .sort((a, b) => Number(a.score.status === "dq") - Number(b.score.status === "dq") || Number(b.score.christmasResult) - Number(a.score.christmasResult) || a.shooter.name.localeCompare(b.shooter.name, "nl"));
}
