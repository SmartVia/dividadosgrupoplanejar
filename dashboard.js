const OPTION_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const SCALE_WEIGHTS = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };
const COLORS = {
  A: "#16a34a",
  B: "#2563eb",
  C: "#f97316",
  D: "#7c3aed",
  E: "#dc2626",
  F: "#64748b",
  G: "#0891b2",
  H: "#475569",
  I: "#db2777",
  J: "#65a30d"
};
const PALETTE = ["#0f766e", "#2563eb", "#d97706", "#7c3aed", "#be123c", "#475569", "#059669", "#9333ea"];

const dashboardMessage = document.getElementById("dashboardMessage");
const refreshButton = document.getElementById("refreshButton");
const clearFiltersButton = document.getElementById("clearFiltersButton");
const lastUpdated = document.getElementById("lastUpdated");
const crossQuestionSelect = document.getElementById("crossQuestionSelect");
const crossFieldSelect = document.getElementById("crossFieldSelect");
const crossViewSelect = document.getElementById("crossViewSelect");
const generateCrossButton = document.getElementById("generateCrossButton");
const exportCrossButton = document.getElementById("exportCrossButton");
const printCrossButton = document.getElementById("printCrossButton");
const crossMessage = document.getElementById("crossMessage");
const crossChartWrap = document.getElementById("crossChartWrap");
const crossTableWrap = document.getElementById("crossTableWrap");
const charts = {};

const filters = {
  cidade: document.getElementById("filterCidade"),
  regiao: document.getElementById("filterRegiao"),
  pesquisador: document.getElementById("filterPesquisador"),
  sexo: document.getElementById("filterSexo"),
  faixaEtaria: document.getElementById("filterFaixaEtaria")
};

let dashboardData = { responses: [], quotas: [], questions: [], researchers: [] };

refreshButton.addEventListener("click", loadDashboard);
clearFiltersButton.addEventListener("click", clearFilters);
if (generateCrossButton) generateCrossButton.addEventListener("click", renderCrossAnalysis);
if (exportCrossButton) exportCrossButton.addEventListener("click", exportCrossCsv);
if (printCrossButton) printCrossButton.addEventListener("click", () => window.print());
Object.values(filters).forEach((filter) => filter.addEventListener("change", renderDashboard));
document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
  setInterval(loadDashboard, 30000);
});

async function loadDashboard() {
  clearDashboardMessage();
  refreshButton.disabled = true;
  refreshButton.textContent = "Atualizando...";

  try {
    const [dashboardResponse, questionsResponse] = await Promise.all([
      getDashboardData(),
      getQuestions()
    ]);

    if (!dashboardResponse.ok) throw new Error(dashboardResponse.message || "Nao foi possivel carregar o dashboard.");

    dashboardData = {
      responses: normalizeResponses(dashboardResponse.responses || []),
      quotas: dashboardResponse.quotas || [],
      researchers: normalizeResearchers(dashboardResponse.researchers || []),
      questions: normalizeQuestions(questionsResponse.ok ? questionsResponse.questions : [])
    };

    populateFilters();
    renderDashboard();
    showDashboardMessage("Dados atualizados com sucesso.", "success");
    lastUpdated.textContent = `Atualizado em ${new Date().toLocaleTimeString("pt-BR")}`;
  } catch (error) {
    console.error("Erro ao buscar dados:", error);
    showDashboardMessage(`Erro ao buscar dados: ${error.message}`, "error");
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Atualizar dados";
  }
}

function normalizeResponses(rows) {
  return rows.map((row) => ({
    raw: row,
    uniqueId: row.UniqueId || row.uniqueId || "",
    dataHora: row.DataHora || row.dataHora || "",
    pesquisador: row.Pesquisador || row.pesquisador || "",
    cidade: row.Cidade || row.cidade || "",
    regiao: row.Regiao || row.regiao || "",
    endereco: row.Endereco || row.endereco || "",
    sexo: row.Sexo || row.sexo || "",
    faixaEtaria: row.FaixaEtaria || row.faixaEtaria || "",
    escolaridade: row.Escolaridade || row.escolaridade || "",
    renda: row.Renda || row.renda || "",
    respostas: parseResponseJson(row.RespostasJson || row.respostasJson || "")
  }));
}

function normalizeResearchers(rows) {
  return (rows || []).map((row) => ({
    id: row.id || row.ID || "",
    nome: row.nome || row.Nome || "",
    cidade: row.cidade || row.Cidade || "",
    meta: Number(row.meta || row.Meta) || 0,
    realizado: Number(row.realizado || row.Realizado) || 0,
    restante: Number(row.restante || row.Restante) || 0,
    status: row.status || row.Status || "Ativo"
  })).filter((row) => row.nome);
}

function normalizeQuestions(questions) {
  return (questions || [])
    .map((question, index) => {
      const type = normalizeQuestionType(question.tipo || question.Tipo || "Fechada");
      const order = Number(question.ordem || question.Ordem || index + 1);
      const code = String(question.id || question.ID || `P${order}`).trim().toUpperCase();
      return {
        code,
        group: question.grupo || question.Grupo || "Geral",
        context: question.contexto || question.Contexto || "",
        text: question.pergunta || question.Pergunta || code,
        type,
        alternatives: getAlternatives(question, type),
        active: normalizeText(question.ativa || question.Ativa || "Sim") !== "nao",
        order
      };
    })
    .filter((question) => question.active)
    .sort((a, b) => a.order - b.order);
}

function getAlternatives(question, type) {
  const alternatives = {};
  OPTION_KEYS.forEach((key) => {
    const value = question[key.toLowerCase()] || question[key] || "";
    if (value) alternatives[key] = String(value).trim();
  });
  if (type === "escala" && !Object.keys(alternatives).length) {
    return { A: "Otimo", B: "Bom", C: "Regular", D: "Ruim", E: "Pessimo", F: "N.T.O" };
  }
  return alternatives;
}

function renderDashboard() {
  const responses = getFilteredResponses();
  const closedQuestions = getQuestionsByTypes(["fechada", "semifechada"]);
  const scaleQuestions = getQuestionsByType("escala");
  const openQuestions = getQuestionsByType("abertatexto").slice(0, 20);
  const semiQuestions = getQuestionsByType("semifechada");
  const scaleStats = scaleQuestions.map((question) => calculateScaleStats(responses, question));

  renderMetrics(responses, closedQuestions, scaleQuestions, scaleStats);
  renderProfileCharts(responses);
  renderResearcherSummary(responses);
  renderScaleRanking(scaleStats);
  renderClosedQuestions(responses, closedQuestions);
  renderScaleQuestions(scaleStats);
  populateCrossControls(responses);
  renderCrossAnalysis();
  renderOpenQuestions(responses, openQuestions, semiQuestions);
  renderQuotas();
}

function renderMetrics(responses, closedQuestions, scaleQuestions, scaleStats) {
  const avgApproval = average(scaleStats.map((item) => item.approvalPercent).filter((value) => !Number.isNaN(value)));
  document.getElementById("totalEntrevistas").textContent = responses.length;
  document.getElementById("totalCidade").textContent = Object.keys(countBy(responses, "cidade")).length;
  document.getElementById("totalRegiao").textContent = Object.keys(countBy(responses, "regiao")).length;
  document.getElementById("totalFechadas").textContent = closedQuestions.length;
  document.getElementById("totalEscalas").textContent = scaleQuestions.length;
  document.getElementById("aprovacaoMedia").textContent = `${Math.round(avgApproval || 0)}%`;
  document.getElementById("cotasAbertas").textContent = dashboardData.quotas.filter(isQuotaOpen).length;
}

function renderProfileCharts(responses) {
  createChart("sexoChart", "sexo", "doughnut", countBy(responses, "sexo"));
  createChart("faixaChart", "faixa", "bar", countBy(responses, "faixaEtaria"));
  createChart("cidadeChart", "cidade", "bar", countBy(responses, "cidade"));
  createChart("regiaoChart", "regiao", "bar", countBy(responses, "regiao"));
  createChart("pesquisadorChart", "pesquisador", "bar", countBy(responses, "pesquisador"));
  createChart("cotasChart", "cotas", "doughnut", countQuotaStatus(dashboardData.quotas));
}

function renderResearcherSummary(responses) {
  const container = document.getElementById("researcherSummary");
  if (!container) return;

  const summary = buildResearcherSummary(responses);

  if (!summary.length) {
    container.innerHTML = '<article class="insight-card"><h3>Nenhum pesquisador encontrado.</h3><p class="muted-text">Cadastre pesquisadores na aba Pesquisadores ou envie entrevistas com nome preenchido.</p></article>';
    return;
  }

  container.innerHTML = summary.map((item) => {
    const percent = item.meta ? Math.min(Math.round((item.realizado / item.meta) * 100), 100) : 0;
    const statusClass = normalizeText(item.status) === "inativo" ? "status-closed" : "status-open";
    const statusText = item.status || "Ativo";

    return `
      <article class="researcher-card">
        <div>
          <h3>${escapeHtml(item.nome)}</h3>
          <p>${escapeHtml(item.cidade || "Cidade não informada")}</p>
        </div>
        <strong>${item.realizado} entrevistas</strong>
        <div class="researcher-progress">
          <span style="width:${percent}%"></span>
        </div>
        <small>Meta: ${item.meta || "Não definida"} · Restante: ${item.restante || 0} · <em class="${statusClass}">${escapeHtml(statusText)}</em></small>
      </article>
    `;
  }).join("");
}

function buildResearcherSummary(responses) {
  const grouped = {};

  responses.forEach((row) => {
    const name = row.pesquisador || "";
    if (!name) return;
    const key = normalizePersonKey(name);
    if (!grouped[key]) {
      grouped[key] = {
        nome: formatDisplayLabel(name),
        cidade: "",
        meta: 0,
        realizado: 0,
        restante: 0,
        status: "Ativo"
      };
    }
    grouped[key].realizado += 1;
  });

  dashboardData.researchers.forEach((researcher) => {
    const key = normalizePersonKey(researcher.nome);
    if (!grouped[key]) {
      grouped[key] = {
        nome: formatDisplayLabel(researcher.nome),
        cidade: researcher.cidade || "",
        meta: researcher.meta || 0,
        realizado: researcher.realizado || 0,
        restante: researcher.restante || 0,
        status: researcher.status || "Ativo"
      };
      return;
    }

    grouped[key].nome = formatDisplayLabel(researcher.nome);
    grouped[key].cidade = researcher.cidade || grouped[key].cidade;
    grouped[key].meta = researcher.meta || grouped[key].meta;
    grouped[key].restante = grouped[key].meta ? Math.max(grouped[key].meta - grouped[key].realizado, 0) : (researcher.restante || 0);
    grouped[key].status = researcher.status || grouped[key].status;
  });

  return Object.values(grouped).sort((a, b) => b.realizado - a.realizado);
}

function renderClosedQuestions(responses, questions) {
  const container = document.getElementById("closedQuestionsGrid");
  destroyCharts("closed_");

  if (!questions.length) {
    container.innerHTML = emptyCard("Nenhuma pergunta fechada ativa encontrada.");
    return;
  }

  container.innerHTML = questions.map((question) => renderQuestionCard(question, "closed")).join("");
  questions.forEach((question) => {
    const counts = countQuestion(responses, question);
    createQuestionChart(`chart_closed_${question.code}`, `closed_${question.code}`, counts, question);
    renderLegend(`legend_closed_${question.code}`, question, counts);
  });
}

function renderScaleQuestions(scaleStats) {
  const container = document.getElementById("scaleQuestionsGrid");
  destroyCharts("scale_");

  if (!scaleStats.length) {
    container.innerHTML = emptyCard("Nenhuma pergunta escala ativa encontrada.");
    return;
  }

  container.innerHTML = scaleStats.map((stats) => `
    <article class="chart-card question-result-card scale-card">
      <div class="question-card-header">
        <span>${escapeHtml(stats.question.code)}</span>
        <h3>${escapeHtml(stats.question.text)}</h3>
        <small>${escapeHtml(stats.question.group)}${stats.question.context ? " | " + escapeHtml(stats.question.context) : ""}</small>
      </div>
      <div class="scale-kpi-grid">
        <div><span>Média técnica</span><strong>${formatNumber(stats.technicalAverage)}</strong><small>${stats.classification}</small></div>
        <div><span>Aprovação</span><strong>${stats.approvalPercent}%</strong><small>Ótimo + Bom</small></div>
        <div><span>Reprovação</span><strong>${stats.rejectionPercent}%</strong><small>Ruim + Péssimo</small></div>
        <div><span>Sem opinião</span><strong>${stats.ntoPercent}%</strong><small>N.T.O</small></div>
      </div>
      <div class="question-chart-layout">
        <div class="question-canvas-wrap"><canvas id="chart_scale_${stats.question.code}"></canvas></div>
        <div id="legend_scale_${stats.question.code}" class="question-legend"></div>
      </div>
    </article>
  `).join("");

  scaleStats.forEach((stats) => {
    createQuestionChart(`chart_scale_${stats.question.code}`, `scale_${stats.question.code}`, stats.counts, stats.question);
    renderLegend(`legend_scale_${stats.question.code}`, stats.question, stats.counts);
  });
}

function populateCrossControls(responses) {
  if (!crossQuestionSelect || !crossFieldSelect) return;

  const currentQuestion = crossQuestionSelect.value;
  const currentField = crossFieldSelect.value;
  const questions = getEligibleCrossQuestions();
  const fields = getAvailableProfileFields(responses);

  crossQuestionSelect.innerHTML = questions.length
    ? questions.map((question) => `<option value="${escapeHtml(question.code)}">${escapeHtml(question.code)} — ${escapeHtml(question.text)}</option>`).join("")
    : '<option value="">Nenhuma pergunta disponível</option>';
  crossFieldSelect.innerHTML = fields.length
    ? fields.map((field) => `<option value="${escapeHtml(field.key)}">${escapeHtml(field.label)}</option>`).join("")
    : '<option value="">Nenhuma variável disponível</option>';

  if (questions.some((question) => question.code === currentQuestion)) crossQuestionSelect.value = currentQuestion;
  if (fields.some((field) => field.key === currentField)) crossFieldSelect.value = currentField;
}

function renderCrossAnalysis() {
  if (!crossQuestionSelect || !crossFieldSelect || !crossTableWrap || !crossChartWrap) return;

  const responses = getFilteredResponses();
  const question = getEligibleCrossQuestions().find((item) => item.code === crossQuestionSelect.value);
  const field = getAvailableProfileFields(responses).find((item) => item.key === crossFieldSelect.value);
  const view = crossViewSelect ? crossViewSelect.value : "both";

  if (!question || !field) {
    crossMessage.textContent = "Selecione uma pergunta e uma variável para gerar o cruzamento.";
    crossTableWrap.innerHTML = "";
    crossChartWrap.hidden = true;
    destroyCharts("cross_");
    return;
  }

  const crossTable = calculateCrossPercentages(buildCrossTable(responses, question, field.key));
  crossTable.question = question;
  crossTable.field = field;

  if (!crossTable.total) {
    crossMessage.textContent = "Sem dados suficientes para este cruzamento.";
    crossTableWrap.innerHTML = "";
    crossChartWrap.hidden = true;
    destroyCharts("cross_");
    return;
  }

  crossMessage.textContent = `${question.code} cruzada com ${field.label}. Total considerado: ${crossTable.total} entrevista(s).`;
  crossTableWrap.hidden = view === "chart";
  crossChartWrap.hidden = view === "table";

  if (view !== "chart") renderCrossTable(crossTableWrap, crossTable);
  if (view !== "table") renderCrossChart("crossChart", crossTable);
}

// Monta a matriz de frequência: alternativas nas linhas e categorias de perfil nas colunas.
function buildCrossTable(responses, question, profileField) {
  const rows = getOptionKeys(question).map((key) => ({ key, label: question.alternatives[key] || key, total: 0, cells: {} }));
  const byKey = rows.reduce((acc, row) => {
    acc[row.key] = row;
    return acc;
  }, {});
  const columnsMap = {};
  let total = 0;

  responses.forEach((response) => {
    const answer = String(getAnswerForQuestion(response, question) || "").trim().toUpperCase();
    if (!byKey[answer]) return;

    const profileValue = response[profileField] || response.raw?.[profileField] || "Não informado";
    const column = formatDisplayLabel(profileValue);
    const columnKey = normalizeGroupKey(column);
    if (!columnsMap[columnKey]) columnsMap[columnKey] = { key: columnKey, label: column, total: 0 };

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

function renderCrossTable(container, crossTable) {
  container.innerHTML = `
    <table class="cross-table">
      <thead>
        <tr>
          <th>Alternativa</th>
          ${crossTable.columns.map((column) => `<th>${escapeHtml(column.label)}<small>${column.total}</small></th>`).join("")}
          <th>Total geral</th>
        </tr>
      </thead>
      <tbody>
        ${crossTable.rows.map((row) => `
          <tr>
            <th>${escapeHtml(row.key)} — ${escapeHtml(row.label)}</th>
            ${crossTable.columns.map((column) => {
              const cell = row.columns[column.key] || { count: 0, percentColumn: 0 };
              return `<td><strong>${cell.count}</strong><span>${cell.percentColumn}% col.</span></td>`;
            }).join("")}
            <td><strong>${row.total}</strong><span>${row.percentTotal}% geral</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderCrossChart(canvasId, crossTable) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (!isChartReady()) return;
  if (charts.cross_table) charts.cross_table.destroy();
  document.getElementById("crossChartTitle").textContent = `${crossTable.question.code} x ${crossTable.field.label}`;
  charts.cross_table = new Chart(canvas, {
    type: "bar",
    data: {
      labels: crossTable.columns.map((column) => column.label),
      datasets: crossTable.rows.filter((row) => row.total > 0).map((row) => ({
        label: `${row.key} — ${row.label}`,
        data: crossTable.columns.map((column) => row.cells[column.key] || 0),
        backgroundColor: COLORS[row.key] || "#64748b",
        borderRadius: 6
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });
}

function getEligibleCrossQuestions() {
  return dashboardData.questions.filter((question) => ["fechada", "semifechada", "escala"].includes(question.type));
}

function getAvailableProfileFields(responses = dashboardData.responses) {
  const candidates = [
    { key: "sexo", label: "Sexo" },
    { key: "faixaEtaria", label: "Faixa etária" },
    { key: "cidade", label: "Cidade" },
    { key: "regiao", label: "Região/Bairro" },
    { key: "pesquisador", label: "Pesquisador" },
    { key: "escolaridade", label: "Escolaridade" },
    { key: "renda", label: "Renda" }
  ];
  return candidates.filter((field) => {
    if (["sexo", "faixaEtaria", "cidade", "regiao", "pesquisador"].includes(field.key)) return true;
    return responses.some((row) => row[field.key] || row.raw?.[field.key] || row.raw?.[field.label]);
  });
}

function exportCrossCsv() {
  if (!crossQuestionSelect || !crossFieldSelect) return;
  const responses = getFilteredResponses();
  const question = getEligibleCrossQuestions().find((item) => item.code === crossQuestionSelect.value);
  const field = getAvailableProfileFields(responses).find((item) => item.key === crossFieldSelect.value);
  if (!question || !field) return;

  const crossTable = calculateCrossPercentages(buildCrossTable(responses, question, field.key));
  const header = ["Alternativa", ...crossTable.columns.map((column) => `${column.label} (${column.total})`), "Total geral"];
  const rows = crossTable.rows.map((row) => [
    `${row.key} — ${row.label}`,
    ...crossTable.columns.map((column) => {
      const cell = row.columns[column.key] || { count: 0, percentColumn: 0 };
      return `${cell.count} (${cell.percentColumn}% col.)`;
    }),
    `${row.total} (${row.percentTotal}% geral)`
  ]);
  const csv = [header, ...rows].map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cruzamento-${question.code}-${field.key}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function renderScaleRanking(scaleStats) {
  const ranking = document.getElementById("scaleRanking");
  const ranked = [...scaleStats]
    .filter((item) => item.validResponses > 0)
    .sort((a, b) => a.technicalAverage - b.technicalAverage);

  if (!ranked.length) {
    ranking.innerHTML = '<p class="muted-text">Sem respostas de escala ainda.</p>';
  } else {
    ranking.innerHTML = ranked.map((item, index) => `
      <div class="ranking-item">
        <strong>${index + 1}</strong>
        <span>${escapeHtml(item.question.text)}</span>
        <em>${formatNumber(item.technicalAverage)} | ${item.classification}</em>
      </div>
    `).join("");
  }

  const groupStats = calculateGroupScaleStats(ranked);
  createChart("grupoMediaChart", "grupoMedia", "bar", groupStats, { reverseScale: true });
}

function renderOpenQuestions(responses, questions, semiQuestions = []) {
  const container = document.getElementById("openQuestionCards");
  const openGroups = questions.map((question) => ({
    question,
    answers: responses
      .map((row) => ({ row, text: getAnswerForQuestion(row, question) }))
      .filter((item) => item.text)
  }));
  const semiGroups = semiQuestions.map((question) => ({
    question: {
      ...question,
      text: `${question.text} — respostas da alternativa Outra`
    },
    answers: responses
      .map((row) => ({ row, text: getOtherTextForQuestion(row, question) }))
      .filter((item) => item.text)
  }));
  const groups = [...openGroups, ...semiGroups];
  const total = groups.reduce((sum, group) => sum + group.answers.length, 0);
  document.getElementById("totalRespostasAbertas").textContent = total;

  if (!groups.length) {
    container.innerHTML = '<article class="insight-card"><h3>Nenhuma pergunta aberta ativa encontrada.</h3></article>';
    return;
  }

  container.innerHTML = groups.map(({ question, answers }) => {
    const validAnswers = answers.filter((item) => !isLowValueOpenAnswer(item.text));
    const joined = validAnswers.map((item) => item.text).join(" ");
    const words = topWords(joined, 12);
    const themes = detectThemes(joined);
    return `
      <article class="insight-card open-question-card">
        <div class="open-question-header">
          <span>${escapeHtml(question.code)}</span>
          <div>
            <h3>${escapeHtml(question.code)} — ${escapeHtml(question.text)}</h3>
            <p>${answers.length} respostas | ${validAnswers.length} válidas para análise</p>
            ${question.context ? `<small class="open-question-meta">${escapeHtml(question.context)}</small>` : ""}
          </div>
        </div>
        <div class="open-question-content">
          <div class="open-answer-list">
            ${answers.length ? answers.slice(0, 80).map(({ row, text }) => `
              <div class="open-answer-item">
                <strong>${escapeHtml(row.cidade || "Sem cidade")}${row.regiao ? " / " + escapeHtml(row.regiao) : ""}</strong>
                <p>"${escapeHtml(text)}"</p>
                <small>${escapeHtml(row.pesquisador || "Pesquisador não informado")} · ${escapeHtml(row.sexo || "Sexo não informado")} · ${escapeHtml(row.faixaEtaria || "Faixa não informada")}</small>
              </div>
            `).join("") : '<div class="open-empty-state">Sem respostas abertas para esta pergunta ainda.</div>'}
          </div>
          <aside class="open-analysis-panel">
            <h4>Palavras mais repetidas</h4>
            <div class="word-cloud compact">${words.length ? words.map((word) => `<span>${escapeHtml(word.word)} <strong>${word.count}</strong></span>`).join("") : "<span>Sem palavras suficientes</span>"}</div>
            <h4>Principais temas</h4>
            <ul class="theme-list compact">${themes.length ? themes.map((theme) => `<li>${escapeHtml(theme.label)} <strong>${theme.count}</strong></li>`).join("") : "<li>Nenhum tema predominante identificado.</li>"}</ul>
          </aside>
        </div>
      </article>
    `;
  }).join("");
}

function renderQuestionCard(question, prefix) {
  return `
    <article class="chart-card question-result-card">
      <div class="question-card-header">
        <span>${escapeHtml(question.code)}</span>
        <h3>${escapeHtml(question.text)}</h3>
        <small>${escapeHtml(question.group)}${question.context ? " | " + escapeHtml(question.context) : ""}</small>
      </div>
      <div class="question-chart-layout">
        <div class="question-canvas-wrap"><canvas id="chart_${prefix}_${question.code}"></canvas></div>
        <div id="legend_${prefix}_${question.code}" class="question-legend"></div>
      </div>
    </article>
  `;
}

function createQuestionChart(canvasId, key, counts, question) {
  const source = {};
  getOptionKeys(question).forEach((option) => { source[option] = counts[option] || 0; });
  createChart(canvasId, key, "doughnut", source, {
    colors: getOptionKeys(question).map((option) => COLORS[option])
  });
}

function renderLegend(containerId, question, counts) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const keys = getOptionKeys(question);
  const total = keys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  if (!total) {
    container.innerHTML = '<p class="muted-text">Sem respostas ainda.</p>';
    return;
  }
  container.innerHTML = keys.map((key) => {
    const count = counts[key] || 0;
    const percent = total ? Math.round((count / total) * 100) : 0;
    return `
      <div class="legend-row">
        <span class="legend-color" style="background:${COLORS[key]}"></span>
        <span><strong>${key}</strong> — ${escapeHtml(question.alternatives[key] || key)} — ${percent}% (${count} votos)</span>
      </div>
    `;
  }).join("");
}

function calculateScaleStats(responses, question) {
  const counts = countQuestion(responses, question);
  const keys = getOptionKeys(question);
  const ntoKeys = keys.filter((key) => isNtoOption(question.alternatives[key]));
  const validKeys = keys.filter((key) => !ntoKeys.includes(key) && SCALE_WEIGHTS[key]);
  const total = keys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const validResponses = validKeys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const weightedTotal = keys.reduce((sum, key) => sum + ((counts[key] || 0) * (SCALE_WEIGHTS[key] || 0)), 0);
  const technicalWeightedTotal = validKeys.reduce((sum, key) => sum + ((counts[key] || 0) * SCALE_WEIGHTS[key]), 0);
  const approval = (counts.A || 0) + (counts.B || 0);
  const rejection = (counts.D || 0) + (counts.E || 0);
  const nto = ntoKeys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const technicalAverage = validResponses ? technicalWeightedTotal / validResponses : 0;
  return {
    question,
    counts,
    total,
    validResponses,
    averageWithNto: total ? weightedTotal / total : 0,
    technicalAverage,
    classification: classifyAverage(technicalAverage),
    approvalPercent: percent(approval, validResponses),
    rejectionPercent: percent(rejection, validResponses),
    regularPercent: percent(counts.C || 0, validResponses),
    ntoPercent: percent(nto, total)
  };
}

function countQuestion(responses, question) {
  const counts = {};
  getOptionKeys(question).forEach((key) => { counts[key] = 0; });
  responses.forEach((row) => {
    const answer = String(getAnswerForQuestion(row, question) || "").trim().toUpperCase();
    if (counts[answer] !== undefined) counts[answer] += 1;
  });
  return counts;
}

function getAnswerForQuestion(row, question) {
  const rawCode = question.code;
  const lowerCode = rawCode.toLowerCase();
  if (row.raw && row.raw[rawCode]) return row.raw[rawCode];
  if (row.raw && row.raw[lowerCode]) return row.raw[lowerCode];
  const found = (row.respostas || []).find((answer) => {
    const code = String(answer.campo || answer.id || "").toUpperCase();
    return code === rawCode;
  });
  return found ? String(found.resposta || "") : "";
}

function getOtherTextForQuestion(row, question) {
  const found = (row.respostas || []).find((answer) => {
    const code = String(answer.campo || answer.id || "").toUpperCase();
    return code === question.code;
  });
  return found ? String(found.respostaTexto || found.complemento || found.textoComplementar || "").trim() : "";
}

function createChart(canvasId, key, type, source, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (!isChartReady()) return;
  if (charts[key]) charts[key].destroy();
  const labels = Object.keys(source);
  const values = Object.values(source);
  charts[key] = new Chart(canvas, {
    type,
    data: {
      labels: labels.length ? labels : ["Sem dados"],
      datasets: [{
        data: values.length ? values : [0],
        backgroundColor: options.colors || PALETTE,
        borderColor: "#ffffff",
        borderWidth: 2,
        borderRadius: type === "bar" ? 6 : 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: type === "bar" ? 1.7 : 1,
      devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
      animation: false,
      plugins: {
        legend: { display: type !== "bar", position: "bottom", labels: { boxWidth: 12, padding: 12 } }
      },
      scales: type === "bar" ? {
        x: { grid: { display: false }, ticks: { maxRotation: 30, minRotation: 0 } },
        y: {
          beginAtZero: true,
          reverse: options.reverseScale || false,
          ticks: { precision: 0 }
        }
      } : {}
    }
  });
}

function renderQuotas() {
  const body = document.getElementById("quotasTableBody");
  const quotas = dashboardData.quotas || [];
  if (!quotas.length) {
    body.innerHTML = '<tr><td colspan="6">Nenhuma cota cadastrada.</td></tr>';
    return;
  }
  body.innerHTML = quotas.map((quota) => `
    <tr>
      <td>${escapeHtml(quota.sexo)}</td>
      <td>${escapeHtml(quota.faixaEtaria)}</td>
      <td>${numberValue(quota.meta)}</td>
      <td>${numberValue(quota.realizado)}</td>
      <td>${numberValue(quota.restante)}</td>
      <td><span class="status-pill ${isQuotaOpen(quota) ? "status-open" : "status-closed"}">${isQuotaOpen(quota) ? "Aberta" : "Encerrada"}</span></td>
    </tr>
  `).join("");
}

function populateFilters() {
  setFilterOptions(filters.cidade, uniqueValues(dashboardData.responses, "cidade"), "Todas");
  setFilterOptions(filters.regiao, uniqueValues(dashboardData.responses, "regiao"), "Todas");
  setFilterOptions(filters.pesquisador, uniqueValues(dashboardData.responses, "pesquisador"), "Todos");
  setFilterOptions(filters.sexo, uniqueValues(dashboardData.responses, "sexo"), "Todos");
  setFilterOptions(filters.faixaEtaria, uniqueValues(dashboardData.responses, "faixaEtaria"), "Todas");
}

function setFilterOptions(select, values, allLabel) {
  const currentValue = select.value;
  select.innerHTML = `<option value="">${allLabel}</option>` + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  const matchingValue = currentValue ? values.find((value) => sameNormalizedValue(value, currentValue)) : "";
  if (matchingValue) select.value = matchingValue;
}

function clearFilters() {
  Object.values(filters).forEach((filter) => { filter.value = ""; });
  renderDashboard();
}

function getFilteredResponses() {
  return dashboardData.responses.filter((row) => (
    (!filters.cidade.value || sameNormalizedValue(row.cidade, filters.cidade.value)) &&
    (!filters.regiao.value || sameNormalizedValue(row.regiao, filters.regiao.value)) &&
    (!filters.pesquisador.value || sameNormalizedValue(row.pesquisador, filters.pesquisador.value)) &&
    (!filters.sexo.value || sameNormalizedValue(row.sexo, filters.sexo.value)) &&
    (!filters.faixaEtaria.value || sameNormalizedValue(row.faixaEtaria, filters.faixaEtaria.value))
  ));
}

function uniqueValues(rows, field) {
  return Object.values(groupTextValues(rows, field)).map((item) => item.label).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function countBy(rows, field) {
  return Object.values(groupTextValues(rows, field)).reduce((acc, item) => {
    acc[item.label] = item.count;
    return acc;
  }, {});
}

function groupTextValues(rows, field) {
  return rows.reduce((acc, row) => {
    const rawValue = String(row[field] || "").replace(/\s+/g, " ").trim();
    const key = field === "pesquisador" ? normalizePersonKey(rawValue || "Nao informado") : normalizeGroupKey(rawValue || "Nao informado");
    if (!acc[key]) acc[key] = { label: rawValue ? formatDisplayLabel(rawValue) : "Nao informado", count: 0 };
    acc[key].count += 1;
    return acc;
  }, {});
}

function calculateGroupScaleStats(scaleStats) {
  const groups = {};
  scaleStats.forEach((item) => {
    if (!item.validResponses) return;
    const group = item.question.group || "Geral";
    if (!groups[group]) groups[group] = [];
    groups[group].push(item.technicalAverage);
  });
  return Object.entries(groups).reduce((acc, [group, values]) => {
    acc[group] = Number(formatNumber(average(values)));
    return acc;
  }, {});
}

function getQuestionsByType(type) {
  return dashboardData.questions.filter((question) => question.type === type);
}

function getQuestionsByTypes(types) {
  return dashboardData.questions.filter((question) => types.includes(question.type));
}

function getOptionKeys(question) {
  return OPTION_KEYS.filter((key) => question.alternatives[key]);
}

function isNtoOption(value) {
  const normalized = normalizeText(value).replace(/\./g, "").replace(/\s+/g, "");
  return normalized === "nto" || normalized === "naotemopiniao" || normalized === "semopiniao";
}

function classifyAverage(value) {
  if (!value) return "Sem dados";
  if (value <= 1.8) return "Excelente";
  if (value <= 2.6) return "Boa";
  if (value <= 3.4) return "Regular";
  if (value <= 4.2) return "Ruim";
  return "Pessima";
}

function normalizeQuestionType(type) {
  const normalized = normalizeText(type);
  if (normalized === "escala") return "escala";
  if (normalized === "semifechada" || normalized === "semi fechada" || normalized === "semi-fechada") return "semifechada";
  if (normalized === "abertatexto" || normalized === "aberta" || normalized === "texto") return "abertatexto";
  return "fechada";
}

function countQuotaStatus(quotas) {
  return (quotas || []).reduce((acc, quota) => {
    const key = isQuotaOpen(quota) ? "Abertas" : "Encerradas";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function isQuotaOpen(quota) {
  return normalizeText(quota.status) === "aberta" && numberValue(quota.restante) > 0;
}

function topWords(text, limit) {
  const stopWords = new Set(["a", "o", "os", "as", "um", "uma", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "nos", "nas", "para", "por", "com", "que", "se", "ao", "aos", "mais", "menos", "muito", "muita", "muitos", "muitas", "ser", "ter", "tem", "foi", "sao", "sim", "nao", "tambem", "sobre", "entre", "como", "quando", "onde", "porque", "pra", "pro", "pela", "pelo", "pelos", "pelas", "isso", "essa", "esse", "esta", "este", "voce", "minha", "meu", "sua", "seu"]);
  const counts = {};
  normalizeText(text).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 2 && !stopWords.has(word)).forEach((word) => {
    counts[word] = (counts[word] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word, count]) => ({ word, count }));
}

function detectThemes(text) {
  const normalized = normalizeText(text);
  const themes = [
    { label: "Saude", terms: ["saude", "hospital", "posto", "medico", "upa", "consulta"] },
    { label: "Educacao", terms: ["educacao", "escola", "creche", "professor", "ensino"] },
    { label: "Seguranca", terms: ["seguranca", "policia", "crime", "roubo", "violencia"] },
    { label: "Infraestrutura", terms: ["rua", "asfalto", "obra", "buraco", "estrada", "iluminacao"] },
    { label: "Limpeza urbana", terms: ["limpeza", "lixo", "coleta", "entulho", "capina"] },
    { label: "Gestao publica", terms: ["prefeitura", "gestao", "governo", "administracao", "prefeito"] }
  ];
  return themes.map((theme) => ({
    label: theme.label,
    count: theme.terms.reduce((sum, term) => sum + ((normalized.match(new RegExp(`\\b${term}\\b`, "g")) || []).length), 0)
  })).filter((theme) => theme.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);
}

function isLowValueOpenAnswer(text) {
  const low = new Set(["", "nao sei", "nao quero falar", "prefiro nao responder", "nenhuma", "nada", "nao respondeu", "sem resposta", "sem opiniao"]);
  return low.has(normalizeText(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim());
}

function destroyCharts(prefix) {
  Object.keys(charts).filter((key) => key.startsWith(prefix)).forEach((key) => {
    charts[key].destroy();
    delete charts[key];
  });
}

function emptyCard(text) {
  return `<article class="chart-card empty-question-card"><h3>${escapeHtml(text)}</h3></article>`;
}

function showDashboardMessage(text, type) {
  dashboardMessage.textContent = text;
  dashboardMessage.className = `message ${type}`;
  dashboardMessage.hidden = false;
}

function isChartReady() {
  if (typeof Chart !== "undefined") return true;
  showDashboardMessage("Dados carregados, mas a biblioteca de graficos nao carregou. Atualize a pagina com Ctrl+F5.", "error");
  return false;
}

function clearDashboardMessage() {
  dashboardMessage.hidden = true;
  dashboardMessage.textContent = "";
}

function percent(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberValue(value) {
  return Number(value) || 0;
}

function sameNormalizedValue(a, b) {
  return normalizeGroupKey(a) === normalizeGroupKey(b);
}

function normalizePersonKey(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "nao informado";
}

function normalizeGroupKey(value) {
  return normalizeText(value).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim() || "nao informado";
}

function formatDisplayLabel(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "Nao informado";
  const lowercaseWords = new Set(["de", "da", "do", "das", "dos", "e"]);
  return text.toLocaleLowerCase("pt-BR").split(" ").map((word, index) => {
    if (index > 0 && lowercaseWords.has(word)) return word;
    return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
  }).join(" ");
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseResponseJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}
