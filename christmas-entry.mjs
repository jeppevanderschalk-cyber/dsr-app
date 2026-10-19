import { CHRISTMAS_STAGES, CHRISTMAS_COMPETITION_ID, createChristmasDraft, calculateChristmasScore, normalizeChristmasRules, getChristmasRanking } from "./christmas-course.mjs";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const number = (value, digits = 0) => Number(value || 0).toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function createChristmasEntry(host, actions) {
  let draft = createChristmasDraft();
  let signed = false;
  let drawing = false;
  let saving = false;
  let currentRules = normalizeChristmasRules();
  let rulesEditing = false;
  let visible = false;
  const $ = (selector) => host.querySelector(selector);

  host.innerHTML = `
    <div class="christmas-heading">
      <img src="svbb-competition-christmas-logo-v2.png" alt="SVBB Christmas editie" width="100" height="82" />
      <div><span class="christmas-kicker">Interne competitie · Santa Run</span><h3>Christmas editie</h3><p>Breng de kado’s op tijd naar de kinderen.</p></div>
    </div>
    <p class="internal-help">Zes stages, één parcours. Per schutter telt de eerste ronde voor het kerstklassement; volgende rondes blijven als oefenronde bewaard.</p>
    <a class="mini-action christmas-parcours-link" href="christmas-editie-parcours.pdf" target="_blank" rel="noopener">Bekijk het parcours (PDF)</a>
    <details class="christmas-rules" data-christmas-rules>
      <summary>Puntentelling Christmas editie</summary>
      <p class="muted">Voorlopige puntentelling. Aanpasbaar door een trainer tot de eerste kerstscore is opgeslagen. Bestaande wedstrijdscores houden hun eigen puntentelling.</p>
      <form data-christmas-rules-form>
        <div class="field-grid">
          ${CHRISTMAS_STAGES.filter((stage) => stage.points === undefined).map((stage) => `<label><span>${escape(stage.targetLabel)}${stage.penalty ? " · aftrek per treffer" : " · punten per treffer"}</span><input type="number" min="0" step="1" required data-christmas-rule="${stage.id}" /></label>`).join("")}
          <label><span>Eindscore</span><select data-christmas-scoring><option value="hitfactor">Netto punten ÷ totale tijd</option><option value="points">Alleen netto punten</option></select></label>
        </div>
        <p>Oliebollen: vast 1 punt per bal.</p>
        <p data-christmas-rules-lock class="muted" hidden>Puntentelling vastgezet omdat er kerstscores zijn opgeslagen.</p>
        <button class="mini-action" type="submit" data-christmas-save-rules>Puntentelling opslaan</button>
      </form>
    </details>
    <form class="score-form christmas-form" data-christmas-form>
      <label><span>Schutter</span><select data-christmas-shooter required></select></label>
      <p class="duplicate-score-warning-pink" data-christmas-duplicate hidden></p>
      <div class="christmas-stages">
        ${CHRISTMAS_STAGES.map((stage, index) => `<section class="long-stage-card christmas-stage${stage.penalty ? " christmas-stage-penalty" : ""}">
          <div class="christmas-stage-heading"><span class="christmas-stage-number">${index + 1}</span><div><h4>${escape(stage.label)}</h4><p>${escape(stage.description)}</p></div><strong data-christmas-stage-total="${stage.id}">0 pt</strong></div>
          <div class="long-stage-line"><label for="christmas-${stage.id}">${escape(stage.targetLabel)}<small data-christmas-value="${stage.id}"></small></label>
            <button class="long-stage-step" type="button" data-christmas-step="${stage.id}" data-delta="-1" aria-label="${escape(stage.targetLabel)} verlagen">−</button>
            <input id="christmas-${stage.id}" type="number" min="0" ${stage.max !== undefined ? `max="${stage.max}"` : ""} step="1" inputmode="numeric" required data-christmas-hits="${stage.id}" value="0" />
            <button class="long-stage-step" type="button" data-christmas-step="${stage.id}" data-delta="1" aria-label="${escape(stage.targetLabel)} verhogen">+</button>
          </div>
        </section>`).join("")}
      </div>
      <div class="field-grid">
        <label><span>Totale looptijd (seconden)</span><input type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00" data-christmas-time /></label>
        <label><span>Status</span><select data-christmas-status><option value="normal">Normaal</option><option value="ended">Einde wedstrijd · 0 punten</option><option value="dq">DQ · 0 punten</option></select></label>
        <label><span>Opmerkingen</span><input type="text" maxlength="500" placeholder="Optioneel" data-christmas-notes /></label>
      </div>
      <section class="long-course-total-card christmas-total" aria-label="Kerstscore">
        <span data-christmas-result-label>Hitfactor Christmas editie</span><strong data-christmas-result>—</strong><small data-christmas-breakdown></small>
      </section>
      <p class="internal-help" data-christmas-error role="status"></p>
      <section class="signature-panel"><div class="signature-heading"><div><strong>Akkoord schutter</strong><small data-christmas-signature-status>Laat de schutter tekenen voor akkoord van score en tijd.</small></div><button class="mini-action" type="button" data-christmas-clear-signature>Wissen</button></div><canvas class="christmas-signature" aria-label="Handtekening kerstscore akkoord"></canvas></section>
      <p class="edit-score-notice" data-christmas-edit-notice hidden>Je wijzigt een opgeslagen kerstscore. Laat de schutter opnieuw tekenen.</p>
      <div class="christmas-form-actions"><button class="mini-action" type="button" data-christmas-reset>Invoer wissen</button><button class="primary-action" type="submit" data-christmas-save>Kerstscore opslaan</button></div>
    </form>
    <section class="christmas-results" aria-label="Kerstklassement"><h3>Kerstklassement</h3><p class="muted">Eerste ronde per schutter · hoogste eindscore bovenaan.</p><div data-christmas-ranking></div><h3>Opgeslagen kerstscores</h3><div data-christmas-results></div></section>`;

  const canvas = $("canvas");
  const clearSignature = () => {
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    signed = false;
    drawing = false;
    $("[data-christmas-signature-status]").textContent = "Laat de schutter tekenen voor akkoord van score en tijd.";
    canvas.closest(".signature-panel").classList.remove("is-signed");
  };
  function resizeSignature() {
    if (!visible || !actions.canEdit()) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (canvas.width === width && canvas.height === height) return;
    // Een formaatwijziging mag de reeds getekende handtekening niet wissen.
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    if (signed) copy.getContext("2d").drawImage(canvas, 0, 0);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (signed) context.drawImage(copy, 0, 0, width, height);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#f5c518";
  }
  function reset(shooterId = draft.shooterId) {
    draft = createChristmasDraft(shooterId);
    rulesEditing = false;
    clearSignature();
    refreshDraft();
    updateTotals();
  }
  function refreshDraft() {
    $("[data-christmas-shooter]").value = draft.shooterId;
    for (const stage of CHRISTMAS_STAGES) $(`[data-christmas-hits="${stage.id}"]`).value = draft.hits[stage.id];
    $("[data-christmas-time]").value = draft.time;
    $("[data-christmas-notes]").value = draft.notes;
    $("[data-christmas-status]").value = draft.status;
    $("[data-christmas-edit-notice]").hidden = !draft.editScoreId;
    $("[data-christmas-save]").textContent = draft.editScoreId ? "Kerstscore bijwerken" : "Kerstscore opslaan";
  }
  function updateTotals() {
    for (const stage of CHRISTMAS_STAGES) {
      const value = stage.points ?? currentRules.points[stage.id];
      const count = Number(draft.hits[stage.id]) || 0;
      $(`[data-christmas-stage-total="${stage.id}"]`).textContent = `${number(count * value * (stage.penalty ? -1 : 1))} pt`;
      $(`[data-christmas-value="${stage.id}"]`).textContent = `${stage.penalty ? "−" : "+"}${number(value, value % 1 ? 1 : 0)} pt per treffer${stage.max ? ` · maximaal ${stage.max}` : ""}`;
    }
    $("[data-christmas-result-label]").textContent = currentRules.scoring === "hitfactor" ? "Hitfactor Christmas editie" : "Netto punten Christmas editie";
    let calc;
    try {
      calc = calculateChristmasScore(draft, currentRules);
      $("[data-christmas-result]").textContent = number(calc.result, currentRules.scoring === "hitfactor" ? 3 : 0);
      $("[data-christmas-error]").textContent = "";
    } catch (error) {
      $("[data-christmas-result]").textContent = "—";
      $("[data-christmas-error]").textContent = error.message;
    }
    const raw = CHRISTMAS_STAGES.filter((stage) => !stage.penalty).reduce((sum, stage) => sum + (Number(draft.hits[stage.id]) || 0) * (stage.points ?? currentRules.points[stage.id]), 0);
    const penalty = (Number(draft.hits.tree) || 0) * currentRules.points.tree;
    $("[data-christmas-breakdown]").textContent = `${number(raw)} punten − ${number(penalty)} strafpunten = ${number(calc?.net ?? raw - penalty)} netto${Number(draft.time) > 0 ? ` · ${number(Number(draft.time), 2)} sec` : ""}`;
    const blocked = draft.status !== "normal";
    const time = $("[data-christmas-time]");
    time.required = currentRules.scoring === "hitfactor" && !blocked;
    time.min = time.required ? "0.01" : "0";
    const rounds = actions.getState().scores.filter((score) => score.competitionId === CHRISTMAS_COMPETITION_ID && score.shooterId === draft.shooterId);
    const notice = $("[data-christmas-duplicate]");
    notice.hidden = !rounds.length || Boolean(draft.editScoreId);
    notice.textContent = `Er zijn al ${rounds.length} kerstrondes voor deze schutter. Dit wordt een oefenronde; de eerste ronde blijft tellen.`;
  }

  function renderResults(state, canEdit) {
    const records = state.scores.filter((score) => score.competitionId === CHRISTMAS_COMPETITION_ID);
    const ranking = getChristmasRanking(records, state.shooters);
    $("[data-christmas-ranking]").innerHTML = ranking.length ? `<div class="christmas-ranking">${ranking.map(({ score, shooter }, index) => `<div><span>${index + 1}</span><strong>${escape(shooter.name)}</strong><b>${score.status === "dq" ? "DQ" : number(score.christmasResult, score.christmasRules?.scoring === "points" ? 0 : 3)}</b><small>${number(score.net)} pt · ${number(score.time, 2)} sec</small></div>`).join("")}</div>` : `<div class="empty">Nog geen kerstscores opgeslagen.</div>`;
    const firstIds = new Set(ranking.map(({ score }) => score.id));
    $("[data-christmas-results]").innerHTML = records.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((score) => {
      const shooter = state.shooters.find((person) => person.id === score.shooterId);
      return `<article class="score-progress-card"><header><div><strong>${escape(shooter?.name || "Verwijderde schutter")}</strong><small>${firstIds.has(score.id) ? "Wedstrijdronde" : "Oefenronde"} · ${score.status === "dq" ? "DQ" : score.status === "ended" ? "Einde wedstrijd" : "Normaal"} · ${escape(new Date(score.createdAt).toLocaleString("nl-NL"))}</small></div><strong>${number(score.christmasResult, score.christmasRules?.scoring === "points" ? 0 : 3)}</strong></header>
      <p>${number(score.rawPoints)} punten − ${number(score.penaltyPoints)} strafpunten · ${number(score.time, 2)} sec</p>
      <details><summary>Stages en opmerkingen</summary><p>${CHRISTMAS_STAGES.map((stage) => `${escape(stage.label)}: ${number(score.christmasHits?.[stage.id])}`).join("<br>")}</p>${score.notes ? `<p>${escape(score.notes)}</p>` : ""}</details>
      <div class="score-row-actions">${canEdit ? `<button class="mini-action" type="button" data-christmas-edit="${escape(score.id)}">Wijzig</button><button class="mini-action" type="button" data-christmas-delete="${escape(score.id)}">Verwijder</button>` : ""}${score.signatureDataUrl ? `<button class="mini-action" type="button" data-view-signature="${escape(score.id)}">Handtekening</button>` : ""}</div></article>`;
    }).join("");
  }

  function render(show) {
    visible = show && actions.isInternal();
    host.hidden = !visible;
    if (!visible) return;
    const state = actions.getState();
    const nextRules = normalizeChristmasRules(state.christmasRules);
    if (JSON.stringify(currentRules) !== JSON.stringify(nextRules)) {
      currentRules = nextRules;
      clearSignature();
    }
    const canEdit = actions.canEdit();
    $("[data-christmas-form]").hidden = !canEdit;
    const locked = state.scores.some((score) => score.competitionId === CHRISTMAS_COMPETITION_ID);
    const ruleForm = $("[data-christmas-rules-form]");
    for (const input of ruleForm.querySelectorAll("input,select,button")) input.disabled = !canEdit || locked;
    $("[data-christmas-rules-lock]").hidden = !locked;
    $("[data-christmas-save-rules]").hidden = !canEdit || locked;
    if (!rulesEditing) {
      for (const input of host.querySelectorAll("[data-christmas-rule]")) input.value = currentRules.points[input.dataset.christmasRule];
      $("[data-christmas-scoring]").value = currentRules.scoring;
    }
    const shooters = state.shooters.filter((shooter) => shooter.active || shooter.id === draft.shooterId);
    const options = `<option value="">Kies een schutter</option>` + shooters.map((shooter) => `<option value="${escape(shooter.id)}">${escape(shooter.name)}</option>`).join("");
    const select = $("[data-christmas-shooter]");
    if (select.innerHTML !== options) select.innerHTML = options;
    if (draft.shooterId && !shooters.some((shooter) => shooter.id === draft.shooterId)) reset("");
    select.value = draft.shooterId;
    $("[data-christmas-save]").disabled = saving;
    updateTotals();
    renderResults(state, canEdit);
    requestAnimationFrame(resizeSignature);
  }

  host.addEventListener("input", (event) => {
    if (!actions.isInternal() || !actions.canEdit()) return;
    const input = event.target;
    if (input.closest("[data-christmas-rules-form]")) { rulesEditing = true; return; }
    if (input.matches("[data-christmas-hits]")) draft.hits[input.dataset.christmasHits] = input.value === "" ? NaN : Number(input.value);
    else if (input.matches("[data-christmas-time]")) draft.time = input.value;
    else if (input.matches("[data-christmas-status]")) draft.status = input.value;
    else if (input.matches("[data-christmas-notes]")) draft.notes = input.value;
    else if (input.matches("[data-christmas-shooter]")) { draft.shooterId = input.value; draft.editScoreId = ""; refreshDraft(); }
    else return;
    clearSignature();
    updateTotals();
  });

  host.addEventListener("click", (event) => {
    if (!actions.isInternal() || !actions.canEdit() || saving) return;
    const step = event.target.closest("[data-christmas-step]");
    if (step) {
      const stage = CHRISTMAS_STAGES.find((item) => item.id === step.dataset.christmasStep);
      draft.hits[stage.id] = Math.max(0, Math.min(stage.max ?? Number.MAX_SAFE_INTEGER, (Number(draft.hits[stage.id]) || 0) + Number(step.dataset.delta)));
      $(`[data-christmas-hits="${stage.id}"]`).value = draft.hits[stage.id];
      clearSignature();
      updateTotals();
    }
    if (event.target.closest("[data-christmas-clear-signature]")) clearSignature();
    if (event.target.closest("[data-christmas-reset]")) reset();
    const edit = event.target.closest("[data-christmas-edit]");
    if (edit) {
      const record = actions.getState().scores.find((score) => score.id === edit.dataset.christmasEdit && score.competitionId === CHRISTMAS_COMPETITION_ID);
      if (!record) return;
      draft = { ...createChristmasDraft(record.shooterId), hits: { ...record.christmasHits }, time: record.time, notes: record.notes || "", editScoreId: record.id, status: record.status || "normal" };
      clearSignature();
      refreshDraft();
      render(true);
      $("[data-christmas-form]").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const remove = event.target.closest("[data-christmas-delete]");
    if (remove) {
      if (actions.remove(remove.dataset.christmasDelete)) {
        if (draft.editScoreId === remove.dataset.christmasDelete) reset();
        render(true);
      }
    }
  });

  $("[data-christmas-rules-form]").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!actions.isInternal() || !actions.canEdit() || actions.getState().scores.some((score) => score.competitionId === CHRISTMAS_COMPETITION_ID)) return;
    const rules = { points: Object.fromEntries([...host.querySelectorAll("[data-christmas-rule]")].map((input) => [input.dataset.christmasRule, Number(input.value)])), scoring: $("[data-christmas-scoring]").value, updatedAt: new Date().toISOString() };
    try { calculateChristmasScore({ ...createChristmasDraft(), time: "1" }, rules); } catch (error) { actions.toast(error.message); return; }
    rulesEditing = false;
    actions.saveRules(rules);
    render(true);
    actions.toast("Puntentelling voor Christmas editie opgeslagen");
  });

  $("[data-christmas-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!actions.isInternal() || !actions.canEdit() || saving) return;
    if (!draft.shooterId || !actions.getState().shooters.some((shooter) => shooter.id === draft.shooterId)) { actions.toast("Kies een schutter"); return; }
    let calc;
    try { calc = calculateChristmasScore(draft, currentRules); } catch (error) { actions.toast(error.message); return; }
    if (!signed) { actions.toast("Laat de schutter eerst tekenen voor akkoord"); return; }
    const existingRounds = actions.getState().scores.filter((score) => score.competitionId === CHRISTMAS_COMPETITION_ID && score.shooterId === draft.shooterId);
    if (!draft.editScoreId && existingRounds.length && !window.confirm("Er is al een kerstscore voor deze schutter. Deze nieuwe ronde wordt een oefenronde en telt niet mee voor het kerstklassement. Doorgaan?")) return;
    const signature = document.createElement("canvas");
    signature.width = Math.min(800, canvas.width);
    signature.height = Math.round(canvas.height * signature.width / canvas.width);
    const context = signature.getContext("2d");
    context.fillStyle = "#0d0d0f";
    context.fillRect(0, 0, signature.width, signature.height);
    context.drawImage(canvas, 0, 0, signature.width, signature.height);
    saving = true;
    $("[data-christmas-save]").disabled = true;
    try {
      // Save returns after local persistence; cloud confirmation may continue.
      actions.save({ draft: structuredClone(draft), calc, rules: structuredClone(currentRules), signatureDataUrl: signature.toDataURL("image/jpeg", 0.82) });
      reset();
      render(true);
    } catch (error) { actions.toast(error.message || "Kerstscore kon niet worden opgeslagen"); }
    finally { saving = false; $("[data-christmas-save]").disabled = false; }
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!visible || !actions.isInternal() || !actions.canEdit() || saving) return;
    event.preventDefault();
    resizeSignature();
    drawing = true;
    signed = true;
    canvas.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    context.beginPath();
    context.moveTo(event.clientX - rect.left, event.clientY - rect.top);
    context.lineTo(event.clientX - rect.left + 0.1, event.clientY - rect.top + 0.1);
    context.stroke();
    $("[data-christmas-signature-status]").textContent = "Getekend · klaar om op te slaan.";
    canvas.closest(".signature-panel").classList.add("is-signed");
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    context.lineTo(event.clientX - rect.left, event.clientY - rect.top);
    context.stroke();
  });
  for (const type of ["pointerup", "pointercancel"]) canvas.addEventListener(type, () => { drawing = false; });
  window.addEventListener("resize", resizeSignature);
  return { render, reset, isSaving: () => saving };
}
