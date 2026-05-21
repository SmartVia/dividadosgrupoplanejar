// Cole somente a URL publicada do seu Google Apps Script entre as aspas.
// Certo: const API_URL = "https://script.google.com/macros/s/SEU_ID/exec";
const API_URL = "https://script.google.com/macros/s/AKfycby1iZyydOBfSrNpKPx0HulX3gT-KhfUEaOxxcfCq6JaUyB2UF43dAVtKd9hNxSGOoD7/exec";

const dashboardMessage = document.getElementById("dashboardMessage");
const refreshButton = document.getElementById("refreshButton");
const printButton = document.getElementById("printButton");
const clearFiltersButton = document.getElementById("clearFiltersButton");
const lastUpdated = document.getElementById("lastUpdated");
const charts = {};
const printCharts = {};
const QUESTION_COLORS = {
  A: "#16a34a",
  B: "#2563eb",
  C: "#f97316",
  D: "#7c3aed"
};

const filters = {
  cidade: document.getElementById("filterCidade"),
  regiao: document.getElementById("filterRegiao"),
  pesquisador: document.getElementById("filterPesquisador"),
  sexo: document.getElementById("filterSexo"),
  faixaEtaria: document.getElementById("filterFaixaEtaria")
};

let dashboardData = {
  responses: [],
  quotas: [],
  questions: []
};
let printMode = false;

refreshButton.addEventListener("click", loadDashboard);
printButton.addEventListener("click", async () => {
  await preparePrintMode();
  window.print();
});
clearFiltersButton.addEventListener("click", clearFilters);
window.addEventListener("beforeprint", () => {
  preparePrintMode();
});
window.addEventListener("afterprint", restoreScreenMode);

Object.values(filters).forEach((filter) => {
  filter.addEventListener("change", renderDashboard);
});

document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
  setInterval(loadDashboard, 30000);
});

function showDashboardMessage(text, type) {
  dashboardMessage.textContent = text;
  dashboardMessage.className = `message ${type}`;
  dashboardMessage.hidden = false;
}

function clearDashboardMessage() {
  dashboardMessage.hidden = true;
  dashboardMessage.textContent = "";
}

async function loadDashboard() {
  clearDashboardMessage();

  if (!API_URL) {
    showDashboardMessage("Configure a constante API_URL no arquivo dashboard.js.", "error");
    console.error("API_URL vazia em dashboard.js.");
    return;
  }

  refreshButton.disabled = true;
  refreshButton.textContent = "Atualizando...";

  try {
    const data = await apiRequest("dashboard", {});
    console.log("Resposta dashboard:", data);

    if (!data.ok) {
      showDashboardMessage(data.message || "Nao foi possivel carregar os dados.", "error");
      console.warn("Erro retornado pela API:", data);
      return;
    }

    const questionsResponse = await apiRequest("getQuestions", {});
    dashboardData = normalizeDashboardData(data, questionsResponse);

    if (!dashboardData.responses.length && data.total > 0) {
      showDashboardMessage("Atualize o apps-script.js para a nova versao do dashboard. O endpoint ainda nao esta enviando as respostas detalhadas.", "error");
    } else {
      showDashboardMessage("Dados atualizados com sucesso.", "success");
    }

    populateFilters();
    renderDashboard();
    lastUpdated.textContent = `Atualizado em ${new Date().toLocaleTimeString("pt-BR")}`;
  } catch (error) {
    console.error("Erro ao buscar dados do dashboard:", error);
    showDashboardMessage(`Erro ao buscar dados: ${error.message}`, "error");
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Atualizar dados";
  }
}

function normalizeDashboardData(data, questionsResponse) {
  const questions = normalizeQuestions(questionsResponse && questionsResponse.ok ? questionsResponse.questions : []);

  return {
    responses: (data.responses || []).map((row) => ({
      raw: row,
      dataHora: row.DataHora || row.dataHora || "",
      pesquisador: row.Pesquisador || row.pesquisador || "",
      cidade: row.Cidade || row.cidade || "",
      regiao: row.Regiao || row.regiao || "",
      endereco: row.Endereco || row.endereco || "",
      sexo: row.Sexo || row.sexo || "",
      faixaEtaria: row.FaixaEtaria || row.faixaEtaria || "",
      p1: row.P1 || row.p1 || "",
      p2: row.P2 || row.p2 || "",
      p3: row.P3 || row.p3 || "",
      p4: row.P4 || row.p4 || "",
      p5: row.P5 || row.p5 || "",
      respostas: parseResponseJson(row.RespostasJson || row.respostasJson || ""),
      respostasAbertas: extractOpenAnswers(row, questions),
      respostaAberta: row.RespostaAberta || row.respostaAberta || ""
    })),
    quotas: data.quotas || [],
    questions
  };
}

function normalizeQuestions(questions) {
  return (questions || [])
    .map((question, index) => {
      const type = question.tipo || question.Tipo || "Fechada";
      const order = Number(question.ordem || question.Ordem || index + 1);
      let code = String(question.id || question.ID || `P${order || index + 1}`).trim().toUpperCase();

      // Proteção para planilhas antigas/desalinhadas que enviavam "Aberta"
      // ou "Fechada" como ID. O código nunca deve ser o tipo da pergunta.
      if (normalizeText(code) === "aberta" || normalizeText(code) === "fechada") {
        code = normalizeText(type) === "aberta" ? `RA${order || index + 1}` : `P${order || index + 1}`;
      }

      return {
        code,
        text: question.pergunta || question.Pergunta || "",
        type,
        alternatives: {
          A: question.a || question.A || "",
          B: question.b || question.B || "",
          C: question.c || question.C || "",
          D: question.d || question.D || ""
        },
        active: normalizeText(question.ativa || question.Ativa || "Sim") !== "nao",
        order
      };
    })
    .sort((a, b) => a.order - b.order);
}

function getOpenQuestions() {
  return (dashboardData.questions || [])
    .filter((question) => question.active !== false)
    .filter((question) => normalizeText(question.type) === "aberta")
    .sort((a, b) => a.order - b.order)
    .slice(0, 20);
}

function extractOpenAnswers(row, questions) {
  const answers = [];
  const parsed = parseResponseJson(row.RespostasJson || row.respostasJson || "");

  for (let i = 1; i <= 20; i++) {
    const raValue = row[`RA${i}`] || row[`ra${i}`] || "";
    const openValue = row[`RespostaAberta${i}`] || row[`respostaAberta${i}`] || "";
    const value = raValue || openValue;
    if (value) {
      const code = getOpenQuestionCodeForNumber(i, questions) || `RA${i}`;
      answers.push({
        code,
        questionText: "",
        text: value,
        order: i
      });
    }
  }

  if ((row.RespostaAberta || row.respostaAberta) && !answers.length) {
    answers.push({
      code: "RA1",
      questionText: "",
      text: row.RespostaAberta || row.respostaAberta,
      order: 1
    });
  }

  parsed.forEach((item, index) => {
    const code = String(item.campo || item.id || "").toUpperCase();
    const type = normalizeText(item.tipo || item.type || "");
    const isOpen = code.startsWith("RA") || type === "aberta";
    const text = item.respostaAberta || item.resposta || item.texto || "";

    if (isOpen && text) {
      answers.push({
        code: code || `RA${index + 1}`,
        questionText: item.pergunta || "",
        text,
        order: Number(String(code).replace(/\D/g, "")) || index + 1
      });
    }
  });

  return dedupeOpenAnswers(answers).slice(0, 20);
}

function getOpenQuestionCodeForNumber(number, questions) {
  const openQuestions = (questions || []).filter((question) => normalizeText(question.type) === "aberta");
  const sameNumber = openQuestions.find((question) => Number(String(question.code).replace(/\D/g, "")) === number);
  return sameNumber ? sameNumber.code : "";
}

function dedupeOpenAnswers(answers) {
  const seen = new Set();
  return answers.filter((answer) => {
    const key = `${answer.code}::${answer.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getOpenAnswersForRow(row) {
  const questionMap = new Map(getOpenQuestions().map((question) => [question.code, question]));

  return (row.respostasAbertas || []).map((answer) => {
    const question = questionMap.get(answer.code);
    return {
      ...answer,
      questionText: answer.questionText || (question ? question.text : ""),
      order: answer.order || (question ? question.order : 99)
    };
  });
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
  select.innerHTML = `<option value="">${allLabel}</option>` + values
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("");

  const matchingValue = currentValue ? values.find((value) => sameNormalizedValue(value, currentValue)) : "";
  if (matchingValue) {
    select.value = matchingValue;
  }
}

function uniqueValues(rows, field) {
  const grouped = groupTextValues(rows, field);
  return Object.values(grouped)
    .map((item) => item.label)
    .sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
}

function clearFilters() {
  Object.values(filters).forEach((filter) => {
    filter.value = "";
  });
  renderDashboard();
}

function getFilteredResponses() {
  return dashboardData.responses.filter((row) => {
    return (!filters.cidade.value || sameNormalizedValue(row.cidade, filters.cidade.value))
      && (!filters.regiao.value || sameNormalizedValue(row.regiao, filters.regiao.value))
      && (!filters.pesquisador.value || sameNormalizedValue(row.pesquisador, filters.pesquisador.value))
      && (!filters.sexo.value || sameNormalizedValue(row.sexo, filters.sexo.value))
      && (!filters.faixaEtaria.value || sameNormalizedValue(row.faixaEtaria, filters.faixaEtaria.value));
  });
}

function renderDashboard() {
  const responses = getFilteredResponses();
  renderMetrics(responses, dashboardData.quotas);
  renderCharts(responses, dashboardData.quotas);
  renderOpenAnswers(responses);
  renderQuotas(dashboardData.quotas);
  updatePrintHeader();
}

function renderMetrics(responses, quotas) {
  const openQuotas = quotas.filter((quota) => isQuotaOpen(quota)).length;
  const closedQuotas = quotas.filter((quota) => !isQuotaOpen(quota)).length;

  document.getElementById("totalEntrevistas").textContent = responses.length;
  document.getElementById("totalSexo").textContent = Object.keys(countBy(responses, "sexo")).length;
  document.getElementById("totalFaixa").textContent = Object.keys(countBy(responses, "faixaEtaria")).length;
  document.getElementById("totalCidade").textContent = Object.keys(countBy(responses, "cidade")).length;
  document.getElementById("totalRegiao").textContent = Object.keys(countBy(responses, "regiao")).length;
  document.getElementById("cotasAbertas").textContent = openQuotas;
  document.getElementById("cotasFechadas").textContent = closedQuotas;
}

async function preparePrintMode() {
  printMode = true;
  document.body.classList.add("printing");
  updatePrintHeader();
  buildPrintReport();
  await waitForPrintCharts();
}

function restoreScreenMode() {
  printMode = false;
  document.body.classList.remove("printing");
  destroyPrintCharts();
}

function updatePrintHeader() {
  const responses = getFilteredResponses();
  const cidade = filters.cidade.value || "Todas";
  const printCidade = document.getElementById("printCidade");
  const printData = document.getElementById("printData");
  const printTotal = document.getElementById("printTotalEntrevistas");

  if (printCidade) printCidade.textContent = cidade;
  if (printData) printData.textContent = new Date().toLocaleDateString("pt-BR");
  if (printTotal) printTotal.textContent = responses.length;
}

function renderCharts(responses, quotas) {
  createChart("sexoChart", "sexo", "pie", countBy(responses, "sexo"));
  createChart("faixaChart", "faixa", "bar", countBy(responses, "faixaEtaria"));
  createChart("cidadeChart", "cidade", "bar", countBy(responses, "cidade"));
  createChart("regiaoChart", "regiao", "bar", countBy(responses, "regiao"));
  createChart("cotasStatusChart", "cotasStatus", "pie", countQuotaStatus(quotas));

  renderQuestionCharts(responses);
  renderQuestionsSummary(responses);
}

function createChart(canvasId, chartKey, type, source) {
  const context = document.getElementById(canvasId);
  const labels = Object.keys(source);
  const values = Object.values(source);

  if (charts[chartKey]) {
    charts[chartKey].destroy();
  }

  charts[chartKey] = new Chart(context, {
    type,
    data: {
      labels: labels.length ? labels : ["Sem dados"],
      datasets: [{
        data: values.length ? values : [0],
        backgroundColor: ["#0f766e", "#2563eb", "#d97706", "#7c3aed", "#be123c", "#475569", "#059669", "#9333ea"],
        borderColor: "#ffffff",
        borderWidth: 2,
        borderRadius: type === "bar" ? 6 : 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: type === "bar" ? 1.65 : 1,
      devicePixelRatio: getChartPixelRatio(),
      animation: false,
      plugins: {
        legend: {
          display: type !== "bar",
          position: "bottom",
          labels: {
            boxWidth: 12,
            padding: 14
          }
        }
      },
      scales: type === "bar" ? {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 30, minRotation: 0 }
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      } : {}
    }
  });
}

function renderQuestionCharts(responses) {
  const grid = document.getElementById("questionChartsGrid");
  const questionMeta = getDetectedQuestions(responses);

  Object.keys(charts)
    .filter((key) => key.startsWith("question_"))
    .forEach((key) => {
      charts[key].destroy();
      delete charts[key];
    });

  if (!questionMeta.length) {
    grid.innerHTML = '<article class="chart-card empty-question-card"><h3>Sem respostas ainda</h3><p>Nenhuma pergunta fechada foi encontrada nas respostas sincronizadas.</p></article>';
    return;
  }

  grid.innerHTML = questionMeta.map((question) => `
    <article class="chart-card question-result-card">
      <div class="question-card-header">
        <span>${escapeHtml(question.code)}</span>
        <h3>${escapeHtml(question.text || question.code)}</h3>
      </div>
      <div class="question-chart-layout">
        <div class="question-canvas-wrap">
          <canvas id="chart_${escapeHtml(question.code)}"></canvas>
        </div>
        <div id="legend_${escapeHtml(question.code)}" class="question-legend"></div>
      </div>
    </article>
  `).join("");

  questionMeta.forEach((question) => {
    const counts = countQuestionByCode(responses, question.code);
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    createQuestionChart(question.code, counts);
    renderQuestionLegend(question, counts, total);
  });
}

function getDetectedQuestions(responses) {
  const fromSheet = (dashboardData.questions || []).filter((question) => normalizeText(question.type) !== "aberta");
  const closedQuestionCodes = new Set(fromSheet.map((question) => question.code));
  const detectedCodes = new Set();

  responses.forEach((row) => {
    (row.respostas || []).forEach((answer, index) => {
      const code = String(answer.campo || answer.id || `P${index + 1}`).toUpperCase();
      const isClosed = normalizeText(answer.tipo || answer.type || "") !== "aberta";
      if (/^P\d+$/.test(code) && (closedQuestionCodes.has(code) || isClosed)) detectedCodes.add(code);
    });

    Object.keys(row).forEach((key) => {
      if (/^p\d+$/i.test(key) && row[key]) {
        detectedCodes.add(key.toUpperCase());
      }
    });

    Object.keys(row.raw || {}).forEach((key) => {
      if (/^P\d+$/.test(key) && row.raw[key] && closedQuestionCodes.has(key.toUpperCase())) {
        detectedCodes.add(key.toUpperCase());
      }
    });
  });

  fromSheet.forEach((question) => {
    if (detectedCodes.has(question.code)) return;
    if (responses.some((row) => getAnswerForQuestion(row, question.code))) {
      detectedCodes.add(question.code);
    }
  });

  return [...detectedCodes]
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    .map((code) => {
      const sheetQuestion = fromSheet.find((question) => question.code === code);
      const jsonQuestion = findQuestionFromResponses(responses, code);
      return sheetQuestion || jsonQuestion || {
        code,
        text: code,
        alternatives: { A: "", B: "", C: "", D: "" },
        order: Number(code.slice(1))
      };
    });
}

function findQuestionFromResponses(responses, code) {
  for (const row of responses) {
    const answer = (row.respostas || []).find((item, index) => {
      const itemCode = String(item.campo || item.id || `P${index + 1}`).toUpperCase();
      return itemCode === code;
    });

    if (answer) {
      return {
        code,
        text: answer.pergunta || code,
        alternatives: { A: "", B: "", C: "", D: "" },
        order: Number(code.slice(1))
      };
    }
  }

  return null;
}

function createQuestionChart(code, counts) {
  const canvas = document.getElementById(`chart_${code}`);
  if (!canvas) return;

  charts[`question_${code}`] = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["A", "B", "C", "D"],
      datasets: [{
        data: ["A", "B", "C", "D"].map((key) => counts[key] || 0),
        backgroundColor: ["A", "B", "C", "D"].map((key) => QUESTION_COLORS[key]),
        borderColor: "#ffffff",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      devicePixelRatio: getChartPixelRatio(),
      animation: false,
      cutout: "58%",
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function getChartPixelRatio() {
  const base = window.devicePixelRatio || 1;
  return printMode ? 7 : Math.max(base, 2);
}

function waitForPrintCharts() {
  return new Promise((resolve) => window.setTimeout(resolve, 450));
}

function buildPrintReport() {
  const report = document.getElementById("printReport");
  if (!report) return;

  destroyPrintCharts();

  const responses = getFilteredResponses();
  const quotas = dashboardData.quotas || [];
  const closedQuestions = getDetectedQuestions(responses);
  const openGroups = groupOpenAnswersByQuestion(responses);
  const today = new Date().toLocaleDateString("pt-BR");
  const cidade = filters.cidade.value || "Todas";
  const openQuotas = quotas.filter((quota) => isQuotaOpen(quota)).length;
  const closedQuotas = quotas.filter((quota) => !isQuotaOpen(quota)).length;

  const closedPages = chunkArray(closedQuestions, 4).map((group, pageIndex) => `
    <section class="print-page">
      ${printSectionHeader("Perguntas fechadas", `Distribuição das alternativas ${closedQuestions.length > 4 ? `(${pageIndex + 1})` : ""}`)}
      <div class="print-grid-2">
        ${group.map((question) => printClosedQuestionCard(question, responses)).join("")}
      </div>
    </section>
  `).join("");

  const openPages = chunkArray(openGroups, 2).map((group, pageIndex) => `
    <section class="print-page">
      ${printSectionHeader("Respostas abertas", `Análise qualitativa ${openGroups.length > 2 ? `(${pageIndex + 1})` : ""}`)}
      <div class="print-open-list">
        ${group.map((openGroup) => printOpenQuestionCard(openGroup)).join("")}
      </div>
    </section>
  `).join("");

  report.innerHTML = `
    <section class="print-page print-cover">
      <div class="print-cover-header">
        <p class="eyebrow">DIVIDADOS PESQUISA</p>
        <h1>Relatório Executivo de Pesquisa</h1>
        <p>Resultados consolidados das entrevistas sincronizadas no Google Sheets.</p>
      </div>

      <div class="print-cover-meta">
        ${printMetaBox("Cidade", cidade)}
        ${printMetaBox("Data", today)}
        ${printMetaBox("Entrevistas", responses.length)}
        ${printMetaBox("Cotas abertas", openQuotas)}
        ${printMetaBox("Cotas fechadas", closedQuotas)}
      </div>

      <div class="print-summary-grid">
        ${printMetricCard("Total de entrevistas", responses.length)}
        ${printMetricCard("Sexo", Object.keys(countBy(responses, "sexo")).length)}
        ${printMetricCard("Faixa etária", Object.keys(countBy(responses, "faixaEtaria")).length)}
        ${printMetricCard("Cidade", Object.keys(countBy(responses, "cidade")).length)}
        ${printMetricCard("Região/Bairro", Object.keys(countBy(responses, "regiao")).length)}
        ${printMetricCard("Pesquisadores", Object.keys(countBy(responses, "pesquisador")).length)}
      </div>

      <div class="print-table-block">
        <h2>Resumo das cotas</h2>
        ${printQuotasTable(quotas)}
      </div>
    </section>

    <section class="print-page">
      ${printSectionHeader("Perfil da amostra", "Distribuição das entrevistas")}
      <div class="print-grid-2">
        ${printChartCard("Sexo", "print_sexo", "pie")}
        ${printChartCard("Faixa etária", "print_faixa", "bar")}
        ${printChartCard("Cidade", "print_cidade", "bar")}
        ${printChartCard("Região/Bairro", "print_regiao", "bar")}
      </div>
    </section>

    ${closedPages || `
      <section class="print-page">
        ${printSectionHeader("Perguntas fechadas", "Sem respostas ainda")}
        <p class="print-empty">Nenhuma pergunta fechada foi encontrada.</p>
      </section>
    `}

    ${openPages || `
      <section class="print-page">
        ${printSectionHeader("Respostas abertas", "Sem respostas ainda")}
        <p class="print-empty">Nenhuma resposta aberta foi encontrada.</p>
      </section>
    `}

    <section class="print-page">
      ${printSectionHeader("Resumo final", "Tabelas consolidadas")}
      <div class="print-table-block">
        <h2>Resumo das perguntas fechadas</h2>
        ${printClosedSummaryTable(closedQuestions, responses)}
      </div>
      <div class="print-table-block">
        <h2>Resumo das perguntas abertas</h2>
        ${printOpenSummaryTable(openGroups)}
      </div>
    </section>
  `;

  createPrintChart("print_sexo", "pie", countBy(responses, "sexo"));
  createPrintChart("print_faixa", "bar", countBy(responses, "faixaEtaria"));
  createPrintChart("print_cidade", "bar", countBy(responses, "cidade"));
  createPrintChart("print_regiao", "bar", countBy(responses, "regiao"));

  closedQuestions.forEach((question) => {
    createPrintQuestionChart(question.code, countQuestionByCode(responses, question.code));
  });
}

function printSectionHeader(eyebrow, title) {
  return `
    <header class="print-section-header avoid-break">
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <h1>${escapeHtml(title)}</h1>
    </header>
  `;
}

function printMetaBox(label, value) {
  return `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function printMetricCard(label, value) {
  return `
    <article class="summary-card avoid-break">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function printChartCard(title, canvasId, type) {
  return `
    <article class="print-chart-card chart-card avoid-break">
      <h2>${escapeHtml(title)}</h2>
      <div class="${type === "bar" ? "print-bar-wrap" : "print-pie-wrap"}">
        <canvas id="${canvasId}" width="${type === "bar" ? 520 : 260}" height="${type === "bar" ? 300 : 260}"></canvas>
      </div>
    </article>
  `;
}

function printClosedQuestionCard(question, responses) {
  const counts = countQuestionByCode(responses, question.code);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return `
    <article class="print-question-card chart-card avoid-break">
      <div class="question-card-header">
        <span>${escapeHtml(question.code)}</span>
        <h2>${escapeHtml(question.text || question.code)}</h2>
      </div>
      <div class="print-question-layout">
        <div class="print-pie-wrap">
          <canvas id="print_question_${escapeHtml(question.code)}" width="240" height="240"></canvas>
        </div>
        <div class="question-legend">
          ${["A", "B", "C", "D"].map((key) => printLegendRow(key, question, counts, total)).join("")}
        </div>
      </div>
    </article>
  `;
}

function printLegendRow(key, question, counts, total) {
  const count = counts[key] || 0;
  const percent = total ? Math.round((count / total) * 100) : 0;
  const text = question.alternatives[key] || key;
  return `
    <div class="legend-row">
      <span class="legend-color" style="background:${QUESTION_COLORS[key]}"></span>
      <span><strong>${key}</strong> — ${escapeHtml(text)} — ${percent}% (${count})</span>
    </div>
  `;
}

function printOpenQuestionCard(group) {
  const answers = [...group.answers].slice(0, 8);
  const validAnswers = getValidOpenAnswers(group.answers);
  const words = topWords(validAnswers.map((answer) => answer.text).join(" "), 8);
  const themes = detectThemes(validAnswers.map((answer) => answer.text).join(" "));

  return `
    <article class="open-answer-card avoid-break">
      <header>
        <span>${escapeHtml(group.code)}</span>
        <h2>${escapeHtml(group.code)} — ${escapeHtml(group.text || group.code)}</h2>
        <p>${group.answers.length} respostas · ${validAnswers.length} válidas para análise</p>
      </header>
      <div class="print-open-layout">
        <div class="print-open-responses">
          ${answers.length ? answers.map((answer) => `
            <div>
              <strong>${escapeHtml(answer.cidade || "Sem cidade")}${answer.regiao ? " / " + escapeHtml(answer.regiao) : ""}</strong>
              <p>"${escapeHtml(answer.text)}"</p>
              <small>${escapeHtml(answer.pesquisador || "Pesquisador não informado")} · ${escapeHtml(answer.sexo || "")} · ${escapeHtml(answer.faixaEtaria || "")}</small>
            </div>
          `).join("") : '<p class="print-empty">Sem respostas abertas para esta pergunta ainda.</p>'}
        </div>
        <aside class="print-open-analysis">
          <h3>Palavras mais repetidas</h3>
          <div class="word-cloud compact">
            ${words.length ? words.map((word) => `<span>${escapeHtml(word.word)} <strong>${word.count}</strong></span>`).join("") : "<span>Sem palavras suficientes</span>"}
          </div>
          <h3>Principais temas</h3>
          <ul class="theme-list compact">
            ${themes.length ? themes.map((theme) => `<li>${escapeHtml(theme.label)} <strong>${theme.count}</strong></li>`).join("") : "<li>Nenhum tema predominante identificado.</li>"}
          </ul>
        </aside>
      </div>
    </article>
  `;
}

function printQuotasTable(quotas) {
  if (!quotas.length) return '<p class="print-empty">Nenhuma cota cadastrada.</p>';

  return `
    <table>
      <thead>
        <tr><th>Sexo</th><th>Faixa etária</th><th>Meta</th><th>Realizado</th><th>Restante</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${quotas.map((quota) => `
          <tr>
            <td>${escapeHtml(quota.sexo)}</td>
            <td>${escapeHtml(quota.faixaEtaria)}</td>
            <td>${numberValue(quota.meta)}</td>
            <td>${numberValue(quota.realizado)}</td>
            <td>${numberValue(quota.restante)}</td>
            <td>${isQuotaOpen(quota) ? "Aberta" : "Encerrada"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function printClosedSummaryTable(questions, responses) {
  if (!questions.length) return '<p class="print-empty">Nenhuma pergunta fechada encontrada.</p>';

  return `
    <table>
      <thead>
        <tr><th>Pergunta</th><th>A</th><th>B</th><th>C</th><th>D</th><th>Total</th><th>Mais votada</th></tr>
      </thead>
      <tbody>
        ${questions.map((question) => {
          const counts = countQuestionByCode(responses, question.code);
          const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
          return `
            <tr>
              <td><strong>${escapeHtml(question.code)}</strong> ${escapeHtml(question.text || "")}</td>
              <td>${formatSummaryCell("A", question, counts, total)}</td>
              <td>${formatSummaryCell("B", question, counts, total)}</td>
              <td>${formatSummaryCell("C", question, counts, total)}</td>
              <td>${formatSummaryCell("D", question, counts, total)}</td>
              <td>${total}</td>
              <td>${getWinner(question, counts)}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function printOpenSummaryTable(groups) {
  if (!groups.length) return '<p class="print-empty">Nenhuma pergunta aberta encontrada.</p>';

  return `
    <table>
      <thead>
        <tr><th>Código</th><th>Pergunta</th><th>Total</th><th>Palavra mais citada</th><th>Principal tema</th><th>Vazias/sem opinião</th></tr>
      </thead>
      <tbody>
        ${groups.map((group) => {
          const validAnswers = getValidOpenAnswers(group.answers);
          const words = topWords(validAnswers.map((answer) => answer.text).join(" "), 1);
          const themes = detectThemes(validAnswers.map((answer) => answer.text).join(" "));
          return `
            <tr>
              <td>${escapeHtml(group.code)}</td>
              <td>${escapeHtml(group.text || group.code)}</td>
              <td>${group.answers.length}</td>
              <td>${words[0] ? `${escapeHtml(words[0].word)} (${words[0].count})` : "Sem dados"}</td>
              <td>${themes[0] ? `${escapeHtml(themes[0].label)} (${themes[0].count})` : "Sem tema predominante"}</td>
              <td>${countLowValueOpenAnswers(group.answers)}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function createPrintChart(canvasId, type, source) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const labels = Object.keys(source);
  const values = Object.values(source);
  printCharts[canvasId] = new Chart(canvas, {
    type,
    data: {
      labels: labels.length ? labels : ["Sem dados"],
      datasets: [{
        data: values.length ? values : [0],
        backgroundColor: ["#0f766e", "#2563eb", "#d97706", "#7c3aed", "#be123c", "#475569", "#059669", "#9333ea"],
        borderColor: "#ffffff",
        borderWidth: 2
      }]
    },
    options: printChartOptions(type)
  });
}

function createPrintQuestionChart(code, counts) {
  const canvasId = `print_question_${code}`;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  printCharts[canvasId] = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["A", "B", "C", "D"],
      datasets: [{
        data: ["A", "B", "C", "D"].map((key) => counts[key] || 0),
        backgroundColor: ["A", "B", "C", "D"].map((key) => QUESTION_COLORS[key]),
        borderColor: "#ffffff",
        borderWidth: 2
      }]
    },
    options: {
      ...printChartOptions("doughnut"),
      cutout: "58%",
      plugins: { legend: { display: false } }
    }
  });
}

function printChartOptions(type) {
  return {
    responsive: false,
    maintainAspectRatio: true,
    animation: false,
    devicePixelRatio: 4,
    plugins: {
      legend: {
        display: type !== "bar",
        position: "bottom",
        labels: { boxWidth: 9, padding: 8, font: { size: 9 } }
      }
    },
    scales: type === "bar" ? {
      x: { grid: { display: false }, ticks: { maxRotation: 20, minRotation: 0, font: { size: 9 } } },
      y: { beginAtZero: true, ticks: { precision: 0, font: { size: 9 } } }
    } : {}
  };
}

function destroyPrintCharts() {
  Object.keys(printCharts).forEach((key) => {
    printCharts[key].destroy();
    delete printCharts[key];
  });
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function renderQuestionLegend(question, counts, total) {
  const container = document.getElementById(`legend_${question.code}`);
  if (!container) return;

  if (!total) {
    container.innerHTML = '<p class="muted-text">Sem respostas ainda</p>';
    return;
  }

  container.innerHTML = ["A", "B", "C", "D"].map((key) => {
    const count = counts[key] || 0;
    const percent = total ? Math.round((count / total) * 100) : 0;
    const text = question.alternatives[key] || key;
    return `
      <div class="legend-row">
        <span class="legend-color" style="background:${QUESTION_COLORS[key]}"></span>
        <span><strong>${key}</strong> — ${escapeHtml(text)} — ${percent}% (${count} votos)</span>
      </div>
    `;
  }).join("");
}

function renderQuestionsSummary(responses) {
  const tableBody = document.getElementById("questionsSummaryTableBody");
  const questions = getDetectedQuestions(responses);

  if (!questions.length) {
    tableBody.innerHTML = '<tr><td colspan="7">Sem respostas ainda.</td></tr>';
    return;
  }

  tableBody.innerHTML = questions.map((question) => {
    const counts = countQuestionByCode(responses, question.code);
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const winner = getWinner(question, counts);

    return `
      <tr>
        <td><strong>${escapeHtml(question.code)}</strong><br><span class="muted-text">${escapeHtml(question.text || question.code)}</span></td>
        <td>${formatSummaryCell("A", question, counts, total)}</td>
        <td>${formatSummaryCell("B", question, counts, total)}</td>
        <td>${formatSummaryCell("C", question, counts, total)}</td>
        <td>${formatSummaryCell("D", question, counts, total)}</td>
        <td>${total}</td>
        <td>${winner}</td>
      </tr>
    `;
  }).join("");
}

function formatSummaryCell(key, question, counts, total) {
  const count = counts[key] || 0;
  const percent = total ? Math.round((count / total) * 100) : 0;
  const text = question.alternatives[key] || key;
  return `${escapeHtml(text)}<br><strong>${percent}% (${count})</strong>`;
}

function getWinner(question, counts) {
  const entries = Object.entries(counts);
  const winner = entries.sort((a, b) => b[1] - a[1])[0];
  if (!winner || winner[1] === 0) return "Sem respostas";
  const text = question.alternatives[winner[0]] || winner[0];
  return `${winner[0]} — ${escapeHtml(text)} (${winner[1]})`;
}

function renderOpenAnswers(responses) {
  const grouped = groupOpenAnswersByQuestion(responses);
  const total = grouped.reduce((sum, group) => sum + group.answers.length, 0);
  const container = document.getElementById("openQuestionCards");

  document.getElementById("totalRespostasAbertas").textContent = total;
  renderOpenQuestionsSummary(grouped);

  if (!grouped.length) {
    container.innerHTML = '<article class="insight-card open-question-card"><h3>Sem respostas abertas ainda</h3><p class="muted-text">As respostas abertas aparecerão aqui após a sincronização.</p></article>';
    return;
  }

  container.innerHTML = grouped.map((group) => renderOpenQuestionCard(group)).join("");
}

function groupOpenAnswersByQuestion(responses) {
  const openQuestions = getOpenQuestions();
  const groups = new Map();

  openQuestions.forEach((question, index) => {
    groups.set(question.code, {
      code: question.code,
      text: question.text || question.code,
      order: question.order || index + 1,
      answers: []
    });
  });

  responses.forEach((row) => {
    getOpenAnswersForRow(row).forEach((answer) => {
      if (!answer.text) return;

      if (!groups.has(answer.code)) {
        groups.set(answer.code, {
          code: answer.code,
          text: answer.questionText || answer.code,
          order: answer.order || Number(answer.code.replace(/\D/g, "")) || 99,
          answers: []
        });
      }

      groups.get(answer.code).answers.push({
        text: answer.text,
        cidade: row.cidade,
        regiao: row.regiao,
        pesquisador: row.pesquisador,
        sexo: row.sexo,
        faixaEtaria: row.faixaEtaria,
        dataHora: row.dataHora
      });
    });
  });

  return [...groups.values()]
    .sort((a, b) => a.order - b.order);
}

function renderOpenQuestionCard(group) {
  const validAnswers = getValidOpenAnswers(group.answers);
  const words = topWords(validAnswers.map((answer) => answer.text).join(" "), 10);
  const themes = detectThemes(validAnswers.map((answer) => answer.text).join(" "));
  const sortedAnswers = [...group.answers].sort((a, b) => new Date(b.dataHora || 0) - new Date(a.dataHora || 0));
  const filtersText = getAppliedFiltersSummary();
  const title = `${group.code} — ${group.text || group.code}`;

  return `
    <article class="insight-card open-question-card">
      <div class="open-question-header">
        <span>${escapeHtml(group.code)}</span>
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${group.answers.length} ${group.answers.length === 1 ? "resposta" : "respostas"} · ${validAnswers.length} válidas para análise</p>
          ${filtersText ? `<small class="open-question-meta">Filtros: ${escapeHtml(filtersText)}</small>` : ""}
        </div>
      </div>

      <div class="open-question-content">
        <div class="open-answer-list">
          ${sortedAnswers.length ? sortedAnswers.map((answer) => `
            <div class="open-answer-item">
              <strong>${escapeHtml(answer.cidade || "Sem cidade")}${answer.regiao ? " / " + escapeHtml(answer.regiao) : ""}</strong>
              <p>"${escapeHtml(answer.text)}"</p>
              <small>${escapeHtml(answer.pesquisador || "Pesquisador não informado")} · ${escapeHtml(answer.sexo || "Sexo não informado")} · ${escapeHtml(answer.faixaEtaria || "Faixa não informada")}</small>
            </div>
          `).join("") : '<div class="open-empty-state">Sem respostas abertas para esta pergunta ainda.</div>'}
        </div>

        <aside class="open-analysis-panel">
          <h4>Palavras mais repetidas</h4>
          <div class="word-cloud compact">
            ${words.length ? words.map((word) => `<span>${escapeHtml(word.word)} <strong>${word.count}</strong></span>`).join("") : "<span>Sem palavras suficientes</span>"}
          </div>

          <h4>Principais temas</h4>
          <ul class="theme-list compact">
            ${themes.length ? themes.map((theme) => `<li>${escapeHtml(theme.label)} <strong>${theme.count}</strong></li>`).join("") : "<li>Nenhum tema predominante identificado.</li>"}
          </ul>
        </aside>
      </div>
    </article>
  `;
}

function renderOpenQuestionsSummary(grouped) {
  const tableBody = document.getElementById("openQuestionsSummaryTableBody");
  if (!tableBody) return;

  if (!grouped.length) {
    tableBody.innerHTML = '<tr><td colspan="6">Nenhuma pergunta aberta ativa encontrada.</td></tr>';
    return;
  }

  tableBody.innerHTML = grouped.map((group) => {
    const validAnswers = getValidOpenAnswers(group.answers);
    const words = topWords(validAnswers.map((answer) => answer.text).join(" "), 1);
    const themes = detectThemes(validAnswers.map((answer) => answer.text).join(" "));
    const topWord = words[0] ? `${words[0].word} (${words[0].count})` : "Sem dados";
    const mainTheme = themes[0] ? `${themes[0].label} (${themes[0].count})` : "Sem tema predominante";

    return `
      <tr>
        <td><strong>${escapeHtml(group.code)}</strong></td>
        <td>${escapeHtml(group.text || group.code)}</td>
        <td>${group.answers.length}</td>
        <td>${escapeHtml(topWord)}</td>
        <td>${escapeHtml(mainTheme)}</td>
        <td>${countLowValueOpenAnswers(group.answers)}</td>
      </tr>
    `;
  }).join("");
}

function getValidOpenAnswers(answers) {
  return (answers || []).filter((answer) => answer.text && !isLowValueOpenAnswer(answer.text));
}

function countLowValueOpenAnswers(answers) {
  return (answers || []).filter((answer) => !answer.text || isLowValueOpenAnswer(answer.text)).length;
}

function isLowValueOpenAnswer(text) {
  const normalized = normalizeText(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lowValueAnswers = new Set([
    "",
    "nao sei",
    "nao quero falar",
    "prefiro nao responder",
    "nenhuma",
    "nada",
    "nao respondeu",
    "sem resposta",
    "sem opiniao"
  ]);

  return lowValueAnswers.has(normalized);
}

function getAppliedFiltersSummary() {
  const labels = {
    cidade: "Cidade",
    regiao: "Região",
    pesquisador: "Pesquisador",
    sexo: "Sexo",
    faixaEtaria: "Faixa etária"
  };

  return Object.entries(filters)
    .filter(([, element]) => element && element.value)
    .map(([key, element]) => `${labels[key]}: ${element.value}`)
    .join(" | ");
}

function renderQuotas(quotas) {
  const tableBody = document.getElementById("quotasTableBody");

  if (!quotas.length) {
    tableBody.innerHTML = '<tr><td colspan="6">Nenhuma cota cadastrada.</td></tr>';
    return;
  }

  tableBody.innerHTML = quotas.map((quota) => {
    const open = isQuotaOpen(quota);
    const statusClass = open ? "status-open" : "status-closed";
    const statusLabel = open ? "Aberta" : "Encerrada";

    return `
      <tr>
        <td>${escapeHtml(quota.sexo)}</td>
        <td>${escapeHtml(quota.faixaEtaria)}</td>
        <td>${numberValue(quota.meta)}</td>
        <td>${numberValue(quota.realizado)}</td>
        <td>${numberValue(quota.restante)}</td>
        <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
      </tr>
    `;
  }).join("");
}

function countBy(rows, field) {
  const grouped = groupTextValues(rows, field);

  return Object.values(grouped)
    .sort((a, b) => String(a.label).localeCompare(String(b.label), "pt-BR"))
    .reduce((acc, item) => {
      acc[item.label] = item.count;
      return acc;
    }, {});
}

function countQuestion(rows, field) {
  const questionIndex = Number(String(field).replace("p", "")) - 1;
  const base = { A: 0, B: 0, C: 0, D: 0 };
  rows.forEach((row) => {
    const jsonAnswer = row.respostas && row.respostas[questionIndex] ? row.respostas[questionIndex].resposta : "";
    const answer = String(row[field] || jsonAnswer || "").trim().toUpperCase();
    if (base[answer] !== undefined) {
      base[answer] += 1;
    }
  });
  return base;
}

function countQuestionByCode(rows, code) {
  const counts = { A: 0, B: 0, C: 0, D: 0 };

  rows.forEach((row) => {
    const answer = String(getAnswerForQuestion(row, code) || "").trim().toUpperCase();
    if (counts[answer] !== undefined) {
      counts[answer] += 1;
    }
  });

  return counts;
}

function getAnswerForQuestion(row, code) {
  const field = code.toLowerCase();
  if (row[field]) return row[field];
  if (row.raw && row.raw[code]) return row.raw[code];
  if (row.raw && row.raw[field]) return row.raw[field];

  const index = Number(code.slice(1)) - 1;
  const answer = row.respostas && row.respostas[index] ? row.respostas[index].resposta : "";
  return answer || "";
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

function countQuotaStatus(quotas) {
  return quotas.reduce((acc, quota) => {
    const key = isQuotaOpen(quota) ? "Abertas" : "Fechadas";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function isQuotaOpen(quota) {
  return normalizeText(quota.status) === "aberta" && numberValue(quota.restante) > 0;
}

function topWords(text, limit) {
  const stopWords = new Set(["a", "o", "os", "as", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "nos", "nas", "para", "por", "com", "que", "se", "ao", "aos", "mais", "menos", "muito", "muita", "muitos", "muitas", "ser", "ter", "tem", "foi", "sao", "sim", "nao", "nao", "tambem", "sobre", "entre", "como", "quando", "onde", "porque", "pra", "pro", "pela", "pelo", "pelos", "pelas", "isso", "essa", "esse", "esta", "este", "eles", "elas", "ele", "ela", "voce", "voces", "minha", "meu", "sua", "seu"]);
  const counts = {};

  normalizeText(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word))
    .forEach((word) => {
      counts[word] = (counts[word] || 0) + 1;
    });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

function detectThemes(text) {
  const normalized = normalizeText(text);
  const themeMap = [
    { label: "Saude", terms: ["saude", "hospital", "posto", "medico", "upa", "consulta", "remedio"] },
    { label: "Educacao", terms: ["educacao", "escola", "creche", "professor", "aluno", "ensino"] },
    { label: "Seguranca", terms: ["seguranca", "policia", "crime", "roubo", "violencia"] },
    { label: "Transporte", terms: ["transporte", "onibus", "transito", "rua", "estrada", "asfalto"] },
    { label: "Limpeza urbana", terms: ["limpeza", "lixo", "coleta", "entulho", "capina"] },
    { label: "Atendimento publico", terms: ["atendimento", "prefeitura", "servico", "demora", "fila"] }
  ];

  return themeMap
    .map((theme) => ({
      label: theme.label,
      count: theme.terms.reduce((sum, term) => sum + countOccurrences(normalized, term), 0)
    }))
    .filter((theme) => theme.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function countOccurrences(text, term) {
  return (text.match(new RegExp(`\\b${term}\\b`, "g")) || []).length;
}

function groupTextValues(rows, field) {
  return rows.reduce((acc, row) => {
    const rawValue = String(row[field] || "").replace(/\s+/g, " ").trim();
    const key = normalizeGroupKey(rawValue || "Nao informado");

    if (!acc[key]) {
      acc[key] = {
        label: rawValue ? formatDisplayLabel(rawValue) : "Nao informado",
        count: 0
      };
    } else {
      acc[key].label = chooseBestLabel(acc[key].label, rawValue);
    }

    acc[key].count += 1;
    return acc;
  }, {});
}

function normalizeGroupKey(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "nao informado";
}

function sameNormalizedValue(a, b) {
  if (!b) return false;
  return normalizeGroupKey(a) === normalizeGroupKey(b);
}

function chooseBestLabel(currentLabel, incomingLabel) {
  const current = String(currentLabel || "").trim();
  const incoming = String(incomingLabel || "").trim();
  if (!incoming) return current || "Nao informado";
  if (!current || normalizeGroupKey(current) === "nao informado") return formatDisplayLabel(incoming);

  const currentScore = labelQualityScore(current);
  const incomingFormatted = formatDisplayLabel(incoming);
  const incomingScore = labelQualityScore(incomingFormatted);
  return incomingScore > currentScore ? incomingFormatted : current;
}

function labelQualityScore(label) {
  const text = String(label || "");
  const hasAccent = text !== text.normalize("NFD").replace(/[\u0300-\u036f]/g, "") ? 2 : 0;
  const hasUppercase = /[A-Z]/.test(text) ? 1 : 0;
  return text.length + hasAccent + hasUppercase;
}

function formatDisplayLabel(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "Nao informado";

  const lowercaseWords = new Set(["de", "da", "do", "das", "dos", "e"]);

  return text
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((word, index) => {
      if (index > 0 && lowercaseWords.has(word)) return word;
      return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
    })
    .join(" ");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function numberValue(value) {
  return Number(value) || 0;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function apiRequest(action, payload) {
  try {
    return await fetchRequest(action, payload);
  } catch (error) {
    console.warn("Fetch falhou. Tentando JSONP.", error);
    return jsonpRequest(action, payload);
  }
}

function buildApiUrl(action, payload, callbackName) {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("payload", JSON.stringify(payload || {}));

  if (callbackName) {
    url.searchParams.set("callback", callbackName);
  }

  return url;
}

async function fetchRequest(action, payload) {
  const response = await fetch(buildApiUrl(action, payload).toString(), {
    method: "GET",
    cache: "no-store",
    redirect: "follow"
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`API retornou HTTP ${response.status}: ${text.slice(0, 120)}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`A API nao retornou JSON valido: ${text.slice(0, 160)}`);
  }
}

function jsonpRequest(action, payload) {
  return new Promise((resolve, reject) => {
    const callbackName = `dividadosDashboard_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement("script");
    const timeoutId = setTimeout(() => {
      reject(new Error("Tempo esgotado ao chamar a API."));
      cleanup();
    }, 20000);

    window[callbackName] = (data) => {
      resolve(data);
      cleanup();
    };

    script.onerror = () => {
      reject(new Error("Falha na chamada da API."));
      cleanup();
    };

    function cleanup() {
      clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    }

    script.src = buildApiUrl(action, payload, callbackName).toString();
    document.body.appendChild(script);
  });
}
