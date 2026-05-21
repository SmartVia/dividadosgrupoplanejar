const OPTION_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const SCALE_WEIGHTS = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };
const COLORS = { A: "#16a34a", B: "#2563eb", C: "#f97316", D: "#7c3aed", E: "#dc2626", F: "#64748b", G: "#0891b2", H: "#475569", I: "#db2777", J: "#65a30d" };
const PALETTE = ["#0f766e", "#2563eb", "#d97706", "#7c3aed", "#be123c", "#475569"];
const reportRoot = document.getElementById("reportRoot");
const printReportButton = document.getElementById("printReportButton");
const reportCharts = {};
let state = { responses: [], quotas: [], questions: [], report: {} };

printReportButton.addEventListener("click", async () => {
  await wait(500);
  window.print();
});

document.addEventListener("DOMContentLoaded", loadReport);

async function loadReport() {
  try {
    const [dashboardResponse, questionsResponse] = await Promise.all([
      getDashboardData(),
      getQuestions()
    ]);
    if (!dashboardResponse.ok) throw new Error(dashboardResponse.message || "Nao foi possivel carregar dados.");
    state = {
      responses: normalizeResponses(dashboardResponse.responses || []),
      quotas: dashboardResponse.quotas || [],
      questions: normalizeQuestions(questionsResponse.ok ? questionsResponse.questions : []),
      report: buildAutomaticReportConfig(dashboardResponse.responses || [])
    };
    renderReport();
    await wait(250);
    renderCharts();
  } catch (error) {
    reportRoot.innerHTML = `<section class="print-page"><h1>Erro ao carregar relatório</h1><p>${escapeHtml(error.message)}</p></section>`;
  }
}

function renderReport() {
  const report = getReport();
  const closed = questionsByTypes(["fechada", "semifechada"]);
  const scales = questionsByType("escala").map((question) => calculateScaleStats(question));
  const opens = questionsByType("abertatexto").slice(0, 20);
  const semiQuestions = questionsByType("semifechada");
  const crossTables = getAutomaticCrossTables();
  const total = state.responses.length;
  const male = countBy(state.responses, "sexo").Masculino || 0;
  const female = countBy(state.responses, "sexo").Feminino || 0;

  reportRoot.innerHTML = `
    <section class="print-page cover-page" style="${report.fundo ? `background-image:linear-gradient(135deg, rgba(8, 31, 44, .86), rgba(15, 118, 110, .74)), url('${escapeHtml(report.fundo)}')` : ""}">
      <div class="cover-content">
        ${report.logo ? `<img src="${escapeHtml(report.logo)}" alt="Logo" class="report-logo">` : ""}
        <p class="eyebrow">${escapeHtml(report.empresa || "DIVIDADOS")}</p>
        <h1>${escapeHtml(report.titulo || "Pesquisa de Opinião")}</h1>
        <h2>${escapeHtml(report.subtitulo || "Relatório Executivo de Pesquisa")}</h2>
        <div class="cover-meta">
          <strong>${escapeHtml(report.cidade || "Cidade não informada")}</strong>
          <span>${escapeHtml(report.data || new Date().toLocaleDateString("pt-BR"))}</span>
        </div>
      </div>
    </section>

    ${textPage("Sumário", `
      <ol class="report-summary">
        <li>Objetivo da Pesquisa</li>
        <li>Metodologia</li>
        <li>Resumo Executivo</li>
        <li>Perfil da Amostra</li>
        <li>Resultados Quantitativos</li>
        <li>Perguntas Escala e Rankings</li>
        <li>Resultados Qualitativos</li>
        <li>Conclusão</li>
      </ol>
    `)}

    ${textPage("Objetivo da Pesquisa", `<p>${escapeHtml(report.objetivo)}</p>`)}
    ${textPage("Metodologia", `<p>${escapeHtml(report.metodologia)}</p>`)}

    <section class="print-page">
      ${sectionTitle("Resumo Executivo")}
      <p class="report-lead">${escapeHtml(report.resumo)}</p>
      <div class="report-kpi-grid">
        ${kpi("Total de entrevistas", total)}
        ${kpi("Cidade", report.cidade || "Todas")}
        ${kpi("Masculino", male)}
        ${kpi("Feminino", female)}
        ${kpi("Cotas abertas", state.quotas.filter(isQuotaOpen).length)}
        ${kpi("Cotas fechadas", state.quotas.filter((quota) => !isQuotaOpen(quota)).length)}
      </div>
    </section>

    <section class="print-page">
      ${sectionTitle("Perfil da Amostra")}
      <div class="report-chart-grid">
        ${chartCard("Sexo", "profile_sexo", "pie")}
        ${chartCard("Faixa etária", "profile_faixa", "bar")}
        ${chartCard("Cidade", "profile_cidade", "bar")}
        ${chartCard("Região/Bairro", "profile_regiao", "bar")}
      </div>
    </section>

    ${chunkArray(closed, 4).map((chunk, page) => `
      <section class="print-page">
        ${sectionTitle(`Resultados Quantitativos${closed.length > 4 ? ` (${page + 1})` : ""}`)}
        <div class="report-question-grid">
          ${chunk.map((question) => questionBlock(question, "closed")).join("")}
        </div>
      </section>
    `).join("")}

    ${chunkArray(scales, 4).map((chunk, page) => `
      <section class="print-page">
        ${sectionTitle(`Perguntas Escala e Rankings${scales.length > 4 ? ` (${page + 1})` : ""}`)}
        <div class="report-question-grid">
          ${chunk.map((stats) => scaleBlock(stats)).join("")}
        </div>
      </section>
    `).join("")}

    ${chunkArray(crossTables, 2).map((chunk, page) => `
      <section class="print-page">
        ${sectionTitle(`Resultados Cruzados${crossTables.length > 2 ? ` (${page + 1})` : ""}`)}
        <div class="report-cross-grid">
          ${chunk.map((crossTable) => reportCrossBlock(crossTable)).join("")}
        </div>
      </section>
    `).join("")}

    ${opens.map((question) => openQuestionPage(question)).join("")}
    ${semiQuestions.map((question) => semiOtherPage(question)).join("")}

    <section class="print-page conclusion-page">
      ${sectionTitle("Conclusão")}
      <p>${escapeHtml(report.conclusao)}</p>
      <div class="report-signature">
        <strong>${escapeHtml(report.assinatura || report.responsavel || "Responsável técnico")}</strong>
        <span>${escapeHtml(report.rodape || "Dividados Pesquisa e Mercado")}</span>
      </div>
    </section>
  `;
}

function renderCharts() {
  if (typeof Chart === "undefined") {
    reportRoot.insertAdjacentHTML("afterbegin", '<div class="message error no-print">A biblioteca de graficos nao carregou. Atualize a pagina com Ctrl+F5 e tente novamente.</div>');
    return;
  }
  createChart("profile_sexo", "doughnut", countBy(state.responses, "sexo"));
  createChart("profile_faixa", "bar", countBy(state.responses, "faixaEtaria"));
  createChart("profile_cidade", "bar", countBy(state.responses, "cidade"));
  createChart("profile_regiao", "bar", countBy(state.responses, "regiao"));

  questionsByTypes(["fechada", "semifechada"]).forEach((question) => {
    createQuestionChart(`chart_closed_${question.code}`, countQuestion(question), question);
  });
  questionsByType("escala").forEach((question) => {
    createQuestionChart(`chart_scale_${question.code}`, countQuestion(question), question);
  });
}

function questionBlock(question, prefix) {
  const counts = countQuestion(question);
  return `
    <article class="report-question-card avoid-break">
      <h3>${escapeHtml(question.code)} — ${escapeHtml(question.text)}</h3>
      ${question.context ? `<p class="report-context">${escapeHtml(question.context)}</p>` : ""}
      <canvas id="chart_${prefix}_${question.code}" width="220" height="220"></canvas>
      ${legend(question, counts)}
    </article>
  `;
}

function scaleBlock(stats) {
  return `
    <article class="report-question-card avoid-break">
      <h3>${escapeHtml(stats.question.code)} — ${escapeHtml(stats.question.text)}</h3>
      <div class="report-scale-kpis">
        <span>Média técnica <strong>${formatNumber(stats.technicalAverage)}</strong></span>
        <span>Classificação <strong>${stats.classification}</strong></span>
        <span>Aprovação <strong>${stats.approvalPercent}%</strong></span>
        <span>Reprovação <strong>${stats.rejectionPercent}%</strong></span>
        <span>N.T.O <strong>${stats.ntoPercent}%</strong></span>
      </div>
      <canvas id="chart_scale_${stats.question.code}" width="220" height="220"></canvas>
      ${legend(stats.question, stats.counts)}
    </article>
  `;
}

function openQuestionPage(question) {
  const answers = state.responses.map((row) => ({ row, text: getAnswer(row, question) })).filter((item) => item.text);
  const valid = answers.filter((item) => !isLowValueOpenAnswer(item.text));
  const words = topWords(valid.map((item) => item.text).join(" "), 12);
  const themes = detectThemes(valid.map((item) => item.text).join(" "));
  return `
    <section class="print-page">
      ${sectionTitle(`${question.code} — ${question.text}`)}
      ${question.context ? `<p class="report-context">${escapeHtml(question.context)}</p>` : ""}
      <div class="report-open-layout">
        <div>
          <h3>Respostas recentes (${answers.length})</h3>
          <div class="report-open-list">
            ${answers.length ? answers.slice(0, 18).map(({ row, text }) => `
              <div>
                <strong>${escapeHtml(row.cidade || "Sem cidade")}${row.regiao ? " / " + escapeHtml(row.regiao) : ""}</strong>
                <p>"${escapeHtml(text)}"</p>
                <small>${escapeHtml(row.pesquisador || "Pesquisador não informado")} · ${escapeHtml(row.sexo || "")} · ${escapeHtml(row.faixaEtaria || "")}</small>
              </div>
            `).join("") : "<p>Sem respostas abertas para esta pergunta.</p>"}
          </div>
        </div>
        <aside>
          <h3>Palavras mais repetidas</h3>
          <div class="word-cloud compact">${words.length ? words.map((word) => `<span>${escapeHtml(word.word)} <strong>${word.count}</strong></span>`).join("") : "<span>Sem dados</span>"}</div>
          <h3>Principais temas</h3>
          <ul class="theme-list compact">${themes.length ? themes.map((theme) => `<li>${escapeHtml(theme.label)} <strong>${theme.count}</strong></li>`).join("") : "<li>Sem tema predominante</li>"}</ul>
        </aside>
      </div>
    </section>
  `;
}

function semiOtherPage(question) {
  const answers = state.responses
    .map((row) => ({ row, text: getOtherText(row, question) }))
    .filter((item) => item.text);
  const words = topWords(answers.map((item) => item.text).join(" "), 12);
  const themes = detectThemes(answers.map((item) => item.text).join(" "));
  return `
    <section class="print-page">
      ${sectionTitle(`${question.code} — Principais respostas abertas da alternativa Outra`)}
      <p class="report-context">${escapeHtml(question.text)}</p>
      <div class="report-open-layout">
        <div>
          <h3>Respostas digitadas (${answers.length})</h3>
          <div class="report-open-list">
            ${answers.length ? answers.slice(0, 18).map(({ row, text }) => `
              <div>
                <strong>${escapeHtml(row.cidade || "Sem cidade")}${row.regiao ? " / " + escapeHtml(row.regiao) : ""}</strong>
                <p>"${escapeHtml(text)}"</p>
                <small>${escapeHtml(row.pesquisador || "Pesquisador não informado")} · ${escapeHtml(row.sexo || "")} · ${escapeHtml(row.faixaEtaria || "")}</small>
              </div>
            `).join("") : "<p>Sem respostas digitadas na alternativa Outra.</p>"}
          </div>
        </div>
        <aside>
          <h3>Palavras mais repetidas</h3>
          <div class="word-cloud compact">${words.length ? words.map((word) => `<span>${escapeHtml(word.word)} <strong>${word.count}</strong></span>`).join("") : "<span>Sem dados</span>"}</div>
          <h3>Principais temas</h3>
          <ul class="theme-list compact">${themes.length ? themes.map((theme) => `<li>${escapeHtml(theme.label)} <strong>${theme.count}</strong></li>`).join("") : "<li>Sem tema predominante</li>"}</ul>
        </aside>
      </div>
    </section>
  `;
}

function reportCrossBlock(crossTable) {
  return `
    <article class="report-cross-card avoid-break">
      <h3>${escapeHtml(crossTable.question.code)} x ${escapeHtml(crossTable.field.label)}</h3>
      <p>${escapeHtml(crossTable.question.text)}</p>
      ${renderReportCrossTable(crossTable)}
    </article>
  `;
}

function renderReportCrossTable(crossTable) {
  return `
    <table class="report-cross-table">
      <thead>
        <tr>
          <th>Alternativa</th>
          ${crossTable.columns.map((column) => `<th>${escapeHtml(column.label)}<small>${column.total}</small></th>`).join("")}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${crossTable.rows.map((row) => `
          <tr>
            <th>${escapeHtml(row.key)} — ${escapeHtml(row.label)}</th>
            ${crossTable.columns.map((column) => {
              const cell = row.columns[column.key] || { count: 0, percentColumn: 0 };
              return `<td><strong>${cell.count}</strong><span>${cell.percentColumn}%</span></td>`;
            }).join("")}
            <td><strong>${row.total}</strong><span>${row.percentTotal}%</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function legend(question, counts) {
  const keys = optionKeys(question);
  const total = keys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  return `<div class="report-legend">${keys.map((key) => {
    const count = counts[key] || 0;
    return `<div><span style="background:${COLORS[key]}"></span><strong>${key}</strong> — ${escapeHtml(question.alternatives[key] || key)} — ${percent(count, total)}% (${count} votos)</div>`;
  }).join("")}</div>`;
}

function createQuestionChart(canvasId, counts, question) {
  const keys = optionKeys(question);
  createChart(canvasId, "doughnut", keys.reduce((acc, key) => {
    acc[key] = counts[key] || 0;
    return acc;
  }, {}), keys.map((key) => COLORS[key]));
}

function createChart(canvasId, type, source, colors) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const labels = Object.keys(source);
  const values = Object.values(source);
  const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
  const chartLabels = labels.length && total > 0 ? labels : ["Sem respostas"];
  const chartValues = values.length && total > 0 ? values : [1];
  const chartColors = values.length && total > 0 ? (colors || PALETTE) : ["#e5e7eb"];
  reportCharts[canvasId] = new Chart(canvas, {
    type,
    data: {
      labels: chartLabels,
      datasets: [{ data: chartValues, backgroundColor: chartColors, borderColor: "#fff", borderWidth: 2, borderRadius: type === "bar" ? 6 : 0 }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: true,
      animation: false,
      devicePixelRatio: 4,
      plugins: { legend: { display: type !== "bar" && total > 0, position: "bottom", labels: { boxWidth: 9, font: { size: 9 } } } },
      scales: type === "bar" ? { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { beginAtZero: true, ticks: { precision: 0, font: { size: 9 } } } } : {}
    }
  });
}

function textPage(title, html) {
  return `<section class="print-page">${sectionTitle(title)}<div class="report-text">${html}</div></section>`;
}

function sectionTitle(title) {
  return `<header class="report-section-title"><p class="eyebrow">Dividados Pesquisa</p><h2>${escapeHtml(title)}</h2></header>`;
}

function chartCard(title, id) {
  return `<article class="report-chart-card avoid-break"><h3>${escapeHtml(title)}</h3><canvas id="${id}" width="260" height="220"></canvas></article>`;
}

function kpi(label, value) {
  return `<div class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function getReport() {
  return state.report || {};
}

function buildAutomaticReportConfig(rows) {
  const cities = [...new Set((rows || []).map((row) => row.Cidade || row.cidade || "").filter(Boolean))];
  const cityLabel = cities.length === 1 ? cities[0] : (cities.length > 1 ? "Multicidades" : "Cidade não informada");
  const month = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return {
    titulo: "Pesquisa de Opinião",
    subtitulo: "Relatório Executivo Quantitativo e Qualitativo",
    cidade: cityLabel,
    data: month,
    empresa: "DIVIDADOS PESQUISA",
    objetivo: "Apresentar os resultados consolidados da pesquisa de opinião, com leitura do perfil da amostra, avaliação quantitativa, perguntas de escala, rankings técnicos e análise qualitativa das respostas abertas.",
    metodologia: "Pesquisa realizada por entrevistadores em campo, com formulário digital, controle de cotas por sexo e faixa etária, registro das respostas no Google Sheets e consolidação automática dos indicadores no painel executivo.",
    resumo: "Este relatório apresenta a distribuição da amostra, os resultados das perguntas fechadas, as médias técnicas das perguntas de escala e a síntese das respostas abertas coletadas em campo.",
    conclusao: "Os dados consolidados permitem identificar tendências de percepção pública, pontos fortes, pontos críticos e prioridades relatadas pelos entrevistados.",
    assinatura: "Dividados Pesquisa",
    rodape: "Dividados Pesquisa e Mercado"
  };
}

function normalizeResponses(rows) {
  return rows.map((row) => ({ raw: row, dataHora: row.DataHora || "", pesquisador: row.Pesquisador || "", cidade: row.Cidade || "", regiao: row.Regiao || "", sexo: row.Sexo || "", faixaEtaria: row.FaixaEtaria || "", escolaridade: row.Escolaridade || "", renda: row.Renda || "", respostas: parseJson(row.RespostasJson || "") }));
}

function normalizeQuestions(questions) {
  return (questions || []).map((q, index) => {
    const type = normalizeQuestionType(q.tipo || q.Tipo || "Fechada");
    const order = Number(q.ordem || q.Ordem || index + 1);
    return { code: String(q.id || q.ID || `P${order}`).toUpperCase(), group: q.grupo || q.Grupo || "Geral", context: q.contexto || q.Contexto || "", text: q.pergunta || q.Pergunta || "", type, alternatives: alternatives(q, type), active: normalizeText(q.ativa || q.Ativa || "Sim") !== "nao", order };
  }).filter((q) => q.active).sort((a, b) => a.order - b.order);
}

function alternatives(q, type) {
  const result = {};
  OPTION_KEYS.forEach((key) => { if (q[key.toLowerCase()] || q[key]) result[key] = q[key.toLowerCase()] || q[key]; });
  if (type === "escala" && !Object.keys(result).length) return { A: "Otimo", B: "Bom", C: "Regular", D: "Ruim", E: "Pessimo", F: "N.T.O" };
  return result;
}

function questionsByType(type) {
  return state.questions.filter((q) => q.type === type);
}

function questionsByTypes(types) {
  return state.questions.filter((q) => types.includes(q.type));
}

function countQuestion(question) {
  const counts = {};
  optionKeys(question).forEach((key) => { counts[key] = 0; });
  state.responses.forEach((row) => {
    const answer = String(getAnswer(row, question) || "").toUpperCase();
    if (counts[answer] !== undefined) counts[answer] += 1;
  });
  return counts;
}

function getAnswer(row, question) {
  const fromRaw = row.raw[question.code] || row.raw[question.code.toLowerCase()];
  if (fromRaw) return fromRaw;
  const item = row.respostas.find((answer) => String(answer.campo || answer.id || "").toUpperCase() === question.code);
  return item ? item.resposta || "" : "";
}

function getOtherText(row, question) {
  const item = row.respostas.find((answer) => String(answer.campo || answer.id || "").toUpperCase() === question.code);
  return item ? String(item.respostaTexto || item.complemento || item.textoComplementar || "").trim() : "";
}

function calculateScaleStats(question) {
  const counts = countQuestion(question);
  const keys = optionKeys(question);
  const ntoKeys = keys.filter((key) => isNtoOption(question.alternatives[key]));
  const validKeys = keys.filter((key) => !ntoKeys.includes(key) && SCALE_WEIGHTS[key]);
  const total = keys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const valid = validKeys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const weighted = validKeys.reduce((sum, key) => sum + ((counts[key] || 0) * SCALE_WEIGHTS[key]), 0);
  const avg = valid ? weighted / valid : 0;
  const nto = ntoKeys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  return { question, counts, technicalAverage: avg, classification: classifyAverage(avg), approvalPercent: percent((counts.A || 0) + (counts.B || 0), valid), rejectionPercent: percent((counts.D || 0) + (counts.E || 0), valid), ntoPercent: percent(nto, total) };
}

function getAutomaticCrossTables() {
  const fields = [
    { key: "sexo", label: "Sexo" },
    { key: "faixaEtaria", label: "Faixa etária" },
    { key: "regiao", label: "Região/Bairro" }
  ];
  return getEligibleCrossQuestions().slice(0, 6).flatMap((question) => {
    return fields.map((field) => {
      const crossTable = calculateCrossPercentages(buildCrossTable(state.responses, question, field.key));
      crossTable.question = question;
      crossTable.field = field;
      return crossTable;
    }).filter((crossTable) => crossTable.total > 0);
  });
}

function buildCrossTable(responses, question, profileField) {
  const rows = optionKeys(question).map((key) => ({ key, label: question.alternatives[key] || key, total: 0, cells: {} }));
  const byKey = rows.reduce((acc, row) => {
    acc[row.key] = row;
    return acc;
  }, {});
  const columnsMap = {};
  let total = 0;

  responses.forEach((response) => {
    const answer = String(getAnswer(response, question) || "").trim().toUpperCase();
    if (!byKey[answer]) return;

    const profileValue = response[profileField] || response.raw?.[profileField] || "Não informado";
    const label = formatLabel(profileValue);
    const columnKey = normalizeGroupKey(label);
    if (!columnsMap[columnKey]) columnsMap[columnKey] = { key: columnKey, label, total: 0 };

    byKey[answer].cells[columnKey] = (byKey[answer].cells[columnKey] || 0) + 1;
    byKey[answer].total += 1;
    columnsMap[columnKey].total += 1;
    total += 1;
  });

  return {
    question,
    profileField,
    rows,
    columns: Object.values(columnsMap).sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    total
  };
}

function calculateCrossPercentages(crossTable) {
  crossTable.rows.forEach((row) => {
    row.percentTotal = percent(row.total, crossTable.total);
    row.columns = {};
    crossTable.columns.forEach((column) => {
      const count = row.cells[column.key] || 0;
      row.columns[column.key] = {
        count,
        percentColumn: percent(count, column.total),
        percentTotal: percent(count, crossTable.total)
      };
    });
  });
  return crossTable;
}

function getEligibleCrossQuestions() {
  return questionsByTypes(["fechada", "semifechada", "escala"]);
}

function countBy(rows, field) {
  return rows.reduce((acc, row) => { const key = formatLabel(row[field] || "Nao informado"); acc[key] = (acc[key] || 0) + 1; return acc; }, {});
}

function optionKeys(question) { return OPTION_KEYS.filter((key) => question.alternatives[key]); }
function isNtoOption(value) { const normalized = normalizeText(value).replace(/\./g, "").replace(/\s+/g, ""); return normalized === "nto" || normalized === "naotemopiniao" || normalized === "semopiniao"; }
function percent(value, total) { return total ? Math.round((value / total) * 100) : 0; }
function classifyAverage(value) { if (!value) return "Sem dados"; if (value <= 1.8) return "Excelente"; if (value <= 2.6) return "Boa"; if (value <= 3.4) return "Regular"; if (value <= 4.2) return "Ruim"; return "Pessima"; }
function normalizeQuestionType(type) { const n = normalizeText(type); if (n === "escala") return "escala"; if (n === "semifechada" || n === "semi fechada" || n === "semi-fechada") return "semifechada"; if (n === "abertatexto" || n === "aberta" || n === "texto") return "abertatexto"; return "fechada"; }
function isQuotaOpen(q) { return normalizeText(q.status) === "aberta" && Number(q.restante || 0) > 0; }
function formatNumber(value) { return Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatLabel(value) { return String(value || "").replace(/\s+/g, " ").trim() || "Nao informado"; }
function normalizeGroupKey(value) { return normalizeText(value).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim() || "nao informado"; }
function parseJson(value) { try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed : []; } catch (e) { return []; } }
function chunkArray(items, size) { const chunks = []; for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size)); return chunks; }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function normalizeText(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

function topWords(text, limit) {
  const stop = new Set(["a", "o", "os", "as", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "para", "por", "com", "que", "nao", "sim", "mais", "muito"]);
  const counts = {};
  normalizeText(text).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stop.has(w)).forEach((w) => { counts[w] = (counts[w] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word, count]) => ({ word, count }));
}

function detectThemes(text) {
  const normalized = normalizeText(text);
  const themes = [{ label: "Saude", terms: ["saude", "hospital"] }, { label: "Seguranca", terms: ["seguranca", "policia"] }, { label: "Infraestrutura", terms: ["rua", "asfalto", "obra"] }, { label: "Educacao", terms: ["educacao", "escola"] }, { label: "Gestao", terms: ["prefeitura", "gestao"] }];
  return themes.map((t) => ({ label: t.label, count: t.terms.reduce((s, term) => s + ((normalized.match(new RegExp(`\\b${term}\\b`, "g")) || []).length), 0) })).filter((t) => t.count > 0);
}

function isLowValueOpenAnswer(text) {
  return new Set(["", "nao sei", "nada", "nenhuma", "sem opiniao", "nao respondeu"]).has(normalizeText(text));
}
