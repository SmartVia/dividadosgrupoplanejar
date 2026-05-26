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
const chartModeSelect = document.getElementById("chartModeSelect");
const charts = {};
const CHART_MODE_KEY = "dividados_chart_mode";

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
if (chartModeSelect) {
  chartModeSelect.value = localStorage.getItem(CHART_MODE_KEY) || "pie";
  chartModeSelect.addEventListener("change", () => {
    localStorage.setItem(CHART_MODE_KEY, chartModeSelect.value);
    renderDashboard();
  });
}
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
    numero: row.Numero || row.numero || "",
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
  document.getElementById("cotasAbertas").textContent = dashboardData.quotas.filter((quota) => getQuotaStatusKey(quota) === "open").length;
  document.getElementById("cotasQuase").textContent = dashboardData.quotas.filter((quota) => getQuotaStatusKey(quota) === "warning").length;
  document.getElementById("cotasEncerradas").textContent = dashboardData.quotas.filter((quota) => getQuotaStatusKey(quota) === "closed").length;
}

function renderProfileCharts(responses) {
  const mode = getChartMode();
  const categoricalType = mode === "pie" ? "doughnut" : "bar";
  const tower3d = mode === "tower";
  createChart("sexoChart", "sexo", categoricalType, countBy(responses, "sexo"), { tower3d });
  createChart("faixaChart", "faixa", "bar", countBy(responses, "faixaEtaria"), { tower3d });
  createChart("cidadeChart", "cidade", "bar", countBy(responses, "cidade"), { tower3d });
  createChart("regiaoChart", "regiao", "bar", countBy(responses, "regiao"), { tower3d });
  createChart("pesquisadorChart", "pesquisador", "bar", countBy(responses, "pesquisador"), { tower3d });
  createChart("cotasChart", "cotas", categoricalType, countQuotaStatus(dashboardData.quotas), { tower3d });
  renderRegionRanking(responses);
}

function renderRegionRanking(responses) {
  const container = document.getElementById("regionRanking");
  if (!container) return;

  const ranking = Object.entries(countBy(responses, "regiao"))
    .filter(([region]) => normalizeText(region) !== "nao informado")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  container.innerHTML = ranking.length
    ? ranking.map(([region, total], index) => `
      <div class="territory-ranking-item">
        <strong>${index + 1}º</strong>
        <span>${escapeHtml(region)}</span>
        <em>${total} ${total === 1 ? "entrevista" : "entrevistas"}</em>
      </div>
    `).join("")
    : '<p class="muted-text">Nenhuma região com entrevistas nos filtros atuais.</p>';
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

  container.innerHTML = questions.map((question) => {
    const counts = countQuestion(responses, question);
    return renderQuestionCard(question, "closed", counts, {
      otherAnswers: question.type === "semifechada" ? getSemiOtherAnswers(responses, question) : []
    });
  }).join("");
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
    <article class="chart-card question-result-card scale-card ${scaleStatusClass(stats.classification)}">
      <div class="question-card-header">
        <span>${escapeHtml(stats.question.code)}</span>
        <h3>${escapeHtml(stats.question.text)}</h3>
        <small>${escapeHtml(stats.question.group)}${stats.question.context ? " | " + escapeHtml(stats.question.context) : ""}</small>
      </div>
      <div class="scale-status-row">
        <span class="scale-status-badge ${scaleStatusClass(stats.classification)}">${escapeHtml(stats.classification)}</span>
        <strong>Média técnica ${formatNumber(stats.technicalAverage)}</strong>
      </div>
      <div class="scale-kpi-grid">
        <div><span>Total</span><strong>${stats.total}</strong><small>respostas</small></div>
        <div><span>Válidas</span><strong>${stats.validResponses}</strong><small>sem N.T.O</small></div>
        <div><span>N.T.O</span><strong>${stats.ntoCount}</strong><small>${stats.ntoPercent}%</small></div>
        <div><span>Média geral</span><strong>${formatNumber(stats.averageWithNto)}</strong><small>com N.T.O</small></div>
        <div><span>Aprovação</span><strong>${stats.approvalPercent}%</strong><small>${stats.approvalCount} votos</small></div>
        <div><span>Regular</span><strong>${stats.regularPercent}%</strong><small>${stats.regularCount} votos</small></div>
        <div><span>Reprovação</span><strong>${stats.rejectionPercent}%</strong><small>${stats.rejectionCount} votos</small></div>
        <div><span>Classificação</span><strong>${escapeHtml(stats.classification)}</strong><small>média técnica</small></div>
      </div>
      <div class="question-chart-layout">
        <div class="question-canvas-wrap"><canvas id="chart_scale_${stats.question.code}"></canvas></div>
        <div id="legend_scale_${stats.question.code}" class="question-legend"></div>
      </div>
      ${renderStatsTable(stats.question, stats.counts, { scaleStats: stats })}
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
  setChartVisualMode(canvas, getChartMode());
  document.getElementById("crossChartTitle").textContent = `${crossTable.question.code} x ${crossTable.field.label}`;
  charts.cross_table = new Chart(canvas, {
    type: "bar",
    data: {
      labels: crossTable.columns.map((column) => column.label),
      datasets: crossTable.rows.filter((row) => row.total > 0).map((row) => ({
        label: `${row.key} — ${row.label}`,
        data: crossTable.columns.map((column) => row.cells[column.key] || 0),
        backgroundColor: COLORS[row.key] || "#64748b",
        borderRadius: getChartMode() === "tower" ? 9 : 6,
        borderSkipped: false
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12 } },
        tower3d: { enabled: getChartMode() === "tower" }
      },
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
    ranking.innerHTML = renderScaleRankingGroups(ranked);
  }

}

function renderScaleRankingGroups(scaleStats) {
  const groups = groupScaleStatsByGroup(scaleStats);
  return Object.entries(groups).map(([group, items]) => {
    const best = [...items].sort((a, b) => a.technicalAverage - b.technicalAverage);
    const worst = [...items].sort((a, b) => b.technicalAverage - a.technicalAverage);
    const groupAverage = average(items.map((item) => item.technicalAverage));
    return `
      <article class="scale-ranking-group">
        <div class="scale-ranking-group-header">
          <strong>${escapeHtml(group)}</strong>
          <span>Média técnica do grupo: ${formatNumber(groupAverage)} | ${escapeHtml(classifyAverage(groupAverage))}</span>
        </div>
        <div class="scale-ranking-columns">
          <div>
            <h4>Melhores avaliações</h4>
            ${best.map((item, index) => renderScaleRankingItem(item, index)).join("")}
          </div>
          <div>
            <h4>Piores avaliações</h4>
            ${worst.map((item, index) => renderScaleRankingItem(item, index)).join("")}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderScaleRankingItem(item, index) {
  return `
    <div class="ranking-item ${scaleStatusClass(item.classification)}">
      <strong>${index + 1}</strong>
      <span>${escapeHtml(item.question.text)}</span>
      <em>${formatNumber(item.technicalAverage)} | ${escapeHtml(item.classification)}</em>
    </div>
  `;
}

function groupScaleStatsByGroup(scaleStats) {
  return scaleStats.reduce((acc, item) => {
    const group = item.question.group || "Geral";
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});
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

function renderQuestionCard(question, prefix, counts = {}, options = {}) {
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
      ${renderStatsTable(question, counts, options)}
    </article>
  `;
}

function createQuestionChart(canvasId, key, counts, question) {
  const source = {};
  getOptionKeys(question).forEach((option) => { source[option] = counts[option] || 0; });
  const mode = getChartMode();
  createChart(canvasId, key, mode === "pie" ? "doughnut" : "bar", source, {
    colors: getOptionKeys(question).map((option) => COLORS[option]),
    tower3d: mode === "tower"
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
    const weight = question.type === "escala" ? ` · Peso ${getScaleWeight(key, question.alternatives[key])}` : "";
    return `
      <div class="legend-row">
        <span class="legend-color" style="background:${COLORS[key]}"></span>
        <span><strong>${key}</strong> — ${escapeHtml(question.alternatives[key] || key)} — ${percent}% (${count} votos)${weight}</span>
      </div>
    `;
  }).join("");
}

function renderStatsTable(question, counts, options = {}) {
  const rows = buildQuestionStatsRows(question, counts, { includeNto: Boolean(options.scaleStats) });
  const totalValid = rows.totalValid;
  const ntoTotal = rows.ntoTotal;
  const maxCount = Math.max(...rows.items.map((item) => item.count), 0);
  const isScale = Boolean(options.scaleStats);

  const scaleSummary = options.scaleStats ? `
    <div class="stats-summary-grid">
      <span>Total <strong>${options.scaleStats.total}</strong></span>
      <span>Válidas <strong>${options.scaleStats.validResponses}</strong></span>
      <span>N.T.O <strong>${options.scaleStats.ntoCount} (${options.scaleStats.ntoPercent}%)</strong></span>
      <span>Média geral <strong>${formatNumber(options.scaleStats.averageWithNto)}</strong></span>
      <span>Média técnica <strong>${formatNumber(options.scaleStats.technicalAverage)}</strong></span>
      <span>Aprovação <strong>${options.scaleStats.approvalPercent}% (${options.scaleStats.approvalCount})</strong></span>
      <span>Regular <strong>${options.scaleStats.regularPercent}% (${options.scaleStats.regularCount})</strong></span>
      <span>Reprovação <strong>${options.scaleStats.rejectionPercent}% (${options.scaleStats.rejectionCount})</strong></span>
      <span>Classificação <strong>${escapeHtml(options.scaleStats.classification)}</strong></span>
    </div>
  ` : "";

  const otherAnswers = options.otherAnswers || [];
  const otherList = otherAnswers.length ? `
    <div class="other-answer-summary">
      <strong>Respostas digitadas em Outra</strong>
      <ul>${otherAnswers.slice(0, 6).map((text) => `<li>${escapeHtml(text)}</li>`).join("")}</ul>
      ${otherAnswers.length > 6 ? `<small>+ ${otherAnswers.length - 6} resposta(s) adicional(is)</small>` : ""}
    </div>
  ` : "";

  return `
    <div class="stats-table-block">
      <div class="stats-table-header">
        <strong>Tabela estatística</strong>
        <span>${totalValid} resposta(s) válida(s)${ntoTotal && !isScale ? ` | N.T.O: ${ntoTotal}` : ""}</span>
      </div>
      ${scaleSummary}
      <div class="stats-table-wrap">
        <table class="stats-table">
          <thead>
            <tr>
              <th>Pos.</th>
              <th>Alt.</th>
              <th>Texto da alternativa</th>
              ${isScale ? "<th>Peso</th>" : ""}
              <th>Votos</th>
              <th>%</th>
              <th>Proporção</th>
            </tr>
          </thead>
          <tbody>
            ${rows.items.length ? rows.items.map((item, index) => `
              <tr class="${index === 0 && item.count > 0 ? "winner-row" : ""}">
                <td>${index + 1}º</td>
                <td><strong>${escapeHtml(item.key)}</strong></td>
                <td>${escapeHtml(item.label)}${index === 0 && item.count > 0 ? ' <span class="winner-badge">Mais votada</span>' : ""}</td>
                ${isScale ? `<td>Peso ${item.weight}</td>` : ""}
                <td>${item.count}</td>
                <td>${item.percent}%</td>
                <td><div class="proportion-bar"><span style="width:${maxCount ? Math.round((item.count / maxCount) * 100) : 0}%"></span></div></td>
              </tr>
            `).join("") : `<tr><td colspan="${isScale ? 7 : 6}">Sem respostas válidas.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${ntoTotal ? `<p class="nto-note">N.T.O contabilizado separadamente: <strong>${ntoTotal}</strong> resposta(s).</p>` : ""}
      ${otherList}
    </div>
  `;
}

function buildQuestionStatsRows(question, counts, options = {}) {
  const keys = getOptionKeys(question);
  const ntoKeys = keys.filter((key) => isNtoOption(question.alternatives[key]));
  const rowKeys = options.includeNto ? keys : keys.filter((key) => !ntoKeys.includes(key));
  const validKeys = keys.filter((key) => !ntoKeys.includes(key));
  const percentBaseKeys = options.includeNto ? keys : validKeys;
  const percentBase = percentBaseKeys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const totalValid = validKeys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const ntoTotal = ntoKeys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const items = rowKeys.map((key) => ({
    key,
    label: question.alternatives[key] || key,
    count: counts[key] || 0,
    percent: percent(counts[key] || 0, percentBase),
    weight: getScaleWeight(key, question.alternatives[key]),
    originalIndex: keys.indexOf(key)
  })).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.originalIndex - b.originalIndex;
  });
  return { items, totalValid, ntoTotal };
}

function getSemiOtherAnswers(responses, question) {
  return responses
    .map((row) => getOtherTextForQuestion(row, question))
    .filter(Boolean);
}

function calculateScaleStats(responses, question) {
  const counts = countQuestion(responses, question);
  const keys = getOptionKeys(question);
  const ntoKeys = keys.filter((key) => isNtoOption(question.alternatives[key]));
  const validKeys = keys.filter((key) => !ntoKeys.includes(key) && getScaleWeight(key, question.alternatives[key]) <= 5);
  const total = keys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const validResponses = validKeys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const weightedTotal = keys.reduce((sum, key) => sum + ((counts[key] || 0) * getScaleWeight(key, question.alternatives[key])), 0);
  const technicalWeightedTotal = validKeys.reduce((sum, key) => sum + ((counts[key] || 0) * getScaleWeight(key, question.alternatives[key])), 0);
  const approval = (counts.A || 0) + (counts.B || 0);
  const regular = counts.C || 0;
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
    approvalCount: approval,
    approvalPercent: percent(approval, validResponses),
    rejectionCount: rejection,
    rejectionPercent: percent(rejection, validResponses),
    regularCount: regular,
    regularPercent: percent(regular, validResponses),
    ntoCount: nto,
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
  setChartVisualMode(canvas, options.tower3d ? "tower" : type === "bar" ? "bar" : "pie");
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
        borderRadius: type === "bar" ? (options.tower3d ? 9 : 6) : 0,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: type === "bar" ? 1.7 : 1,
      devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
      animation: false,
      plugins: {
        legend: { display: type !== "bar", position: "bottom", labels: { boxWidth: 12, padding: 12 } },
        tower3d: { enabled: Boolean(options.tower3d) }
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

const tower3dPlugin = {
  id: "tower3d",
  beforeDatasetDraw(chart, args, pluginOptions) {
    if (!pluginOptions?.enabled) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.24)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 7;
    ctx.shadowOffsetY = 5;
  },
  afterDatasetDraw(chart, args, pluginOptions) {
    if (!pluginOptions?.enabled) return;
    chart.ctx.restore();
  }
};

if (typeof Chart !== "undefined") {
  Chart.register(tower3dPlugin);
}

function getChartMode() {
  return chartModeSelect?.value || localStorage.getItem(CHART_MODE_KEY) || "pie";
}

function setChartVisualMode(canvas, mode) {
  const wrap = canvas.parentElement;
  if (!wrap) return;
  wrap.classList.toggle("chart-tower-3d", mode === "tower");
  wrap.classList.toggle("chart-bar-mode", mode === "bar");
}

function renderQuotas() {
  const body = document.getElementById("quotasTableBody");
  const insights = document.getElementById("quotaRegionInsights");
  const quotas = dashboardData.quotas || [];
  if (!quotas.length) {
    body.innerHTML = '<tr><td colspan="8">Nenhuma cota cadastrada.</td></tr>';
    if (insights) insights.innerHTML = "";
    return;
  }
  body.innerHTML = quotas.map((quota) => `
    <tr>
      <td>${escapeHtml(quota.cidade || "Não informada")}</td>
      <td>${escapeHtml(quota.regiao || "Não informada")}</td>
      <td>${escapeHtml(quota.sexo)}</td>
      <td>${escapeHtml(quota.faixaEtaria)}</td>
      <td>${numberValue(quota.meta)}</td>
      <td>${numberValue(quota.realizado)}</td>
      <td>${numberValue(quota.restante)}</td>
      <td><span class="status-pill ${quotaStatusClass(quota)}">${quotaStatusLabel(quota)}</span></td>
    </tr>
  `).join("");
  if (insights) insights.innerHTML = renderQuotaRegionInsights(quotas);
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

function getScaleWeight(key, label) {
  const normalized = normalizeText(label).replace(/\./g, "").replace(/\s+/g, "");
  if (normalized === "otimo") return 1;
  if (normalized === "bom") return 2;
  if (normalized === "regular") return 3;
  if (normalized === "ruim") return 4;
  if (normalized === "pessimo") return 5;
  if (isNtoOption(label)) return 6;
  return SCALE_WEIGHTS[key] || 0;
}

function classifyAverage(value) {
  if (!value) return "Sem dados";
  if (value <= 1.8) return "Excelente";
  if (value <= 2.6) return "Boa";
  if (value <= 3.4) return "Regular";
  if (value <= 4.2) return "Ruim";
  return "Pessima";
}

function scaleStatusClass(classification) {
  const normalized = normalizeText(classification);
  if (normalized === "excelente" || normalized === "boa") return "scale-status-good";
  if (normalized === "regular") return "scale-status-warning";
  if (normalized === "ruim" || normalized === "pessima") return "scale-status-bad";
  return "scale-status-empty";
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
    const key = quotaStatusLabel(quota);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function isQuotaOpen(quota) {
  return normalizeText(quota.status) === "aberta" && numberValue(quota.restante) > 0;
}

function getQuotaStatusKey(quota) {
  const restante = numberValue(quota.restante);
  if (restante <= 0 || normalizeText(quota.status) === "encerrada") return "closed";
  if (restante <= 5) return "warning";
  return "open";
}

function quotaStatusLabel(quota) {
  const status = getQuotaStatusKey(quota);
  if (status === "closed") return "Encerrada";
  if (status === "warning") return "Quase encerrando";
  return "Aberta";
}

function quotaStatusClass(quota) {
  const status = getQuotaStatusKey(quota);
  if (status === "closed") return "status-closed";
  if (status === "warning") return "status-warning";
  return "status-open";
}

function renderQuotaRegionInsights(quotas) {
  const regions = {};
  (quotas || []).forEach((quota) => {
    const key = `${quota.cidade || "Não informada"} / ${quota.regiao || "Não informada"}`;
    if (!regions[key]) {
      regions[key] = { label: key, meta: 0, realizado: 0, restante: 0 };
    }
    regions[key].meta += numberValue(quota.meta);
    regions[key].realizado += numberValue(quota.realizado);
    regions[key].restante += numberValue(quota.restante);
  });

  const rows = Object.values(regions).map((item) => ({
    ...item,
    progress: item.meta ? Math.round((item.realizado / item.meta) * 100) : 0
  })).sort((a, b) => b.progress - a.progress);

  if (!rows.length) return "";
  const mostAdvanced = rows[0];
  const mostDelayed = [...rows].sort((a, b) => a.progress - b.progress)[0];
  const pending = rows.filter((row) => row.restante > 0).length;

  return `
    <div class="quota-region-grid">
      <article class="insight-card"><h3>Região mais avançada</h3><strong>${escapeHtml(mostAdvanced.label)}</strong><p>${mostAdvanced.progress}% concluído</p></article>
      <article class="insight-card"><h3>Região mais atrasada</h3><strong>${escapeHtml(mostDelayed.label)}</strong><p>${mostDelayed.progress}% concluído</p></article>
      <article class="insight-card"><h3>Regiões com cotas pendentes</h3><strong>${pending}</strong><p>com restante maior que zero</p></article>
    </div>
    <div class="quota-progress-list">
      ${rows.slice(0, 10).map((row) => `
        <div class="quota-progress-item">
          <span>${escapeHtml(row.label)}</span>
          <strong>${row.progress}%</strong>
          <div class="proportion-bar"><span style="width:${Math.min(row.progress, 100)}%"></span></div>
        </div>
      `).join("")}
    </div>
  `;
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


