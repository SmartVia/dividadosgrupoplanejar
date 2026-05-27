const openReportMessage = document.getElementById("openReportMessage");
const openReportSummary = document.getElementById("openReportSummary");
const openQuestionsReport = document.getElementById("openQuestionsReport");
const clearOpenFiltersButton = document.getElementById("clearOpenFiltersButton");
const printOpenReportButton = document.getElementById("printOpenReportButton");
const exportOpenTxtButton = document.getElementById("exportOpenTxtButton");

const openFilters = {
  cidade: document.getElementById("filterOpenCidade"),
  regiao: document.getElementById("filterOpenRegiao"),
  pesquisador: document.getElementById("filterOpenPesquisador"),
  sexo: document.getElementById("filterOpenSexo"),
  faixaEtaria: document.getElementById("filterOpenFaixa"),
  question: document.getElementById("filterOpenQuestion")
};

let openReportState = {
  responses: [],
  questions: []
};

document.addEventListener("DOMContentLoaded", loadOpenAnswersReport);
Object.values(openFilters).forEach((filter) => filter.addEventListener("change", renderOpenAnswersReport));
clearOpenFiltersButton.addEventListener("click", clearOpenFilters);
printOpenReportButton.addEventListener("click", () => window.print());
exportOpenTxtButton.addEventListener("click", exportOpenAnswersTxt);

async function loadOpenAnswersReport() {
  showOpenReportMessage("Carregando respostas abertas...", "success");

  try {
    const [dashboardResponse, questionsResponse] = await Promise.all([
      getDashboardData(),
      getQuestions()
    ]);

    if (!dashboardResponse.ok) {
      throw new Error(dashboardResponse.message || "Não foi possível carregar as respostas.");
    }

    openReportState = {
      responses: normalizeOpenResponses(dashboardResponse.responses || []),
      questions: normalizeOpenQuestions(questionsResponse.ok ? questionsResponse.questions : [])
    };

    populateOpenFilters();
    renderOpenAnswersReport();
    hideOpenReportMessage();
  } catch (error) {
    console.error("Erro ao carregar respostas abertas:", error);
    showOpenReportMessage(`Erro ao carregar respostas abertas: ${error.message}`, "error");
    openQuestionsReport.innerHTML = `
      <section class="open-question-report-section">
        <h2>Não foi possível carregar o relatório.</h2>
        <p>Verifique a conexão e se o Apps Script está publicado corretamente.</p>
      </section>
    `;
  }
}

function normalizeOpenResponses(rows) {
  return (rows || []).map((row) => ({
    raw: row,
    uniqueId: row.UniqueId || row.uniqueId || "",
    dataHora: row.DataHoraEnvio || row.DataHora || row.dataHora || "",
    pesquisador: row.Pesquisador || row.pesquisador || "",
    cidade: row.Cidade || row.cidade || "",
    regiao: row.Regiao || row.regiao || "",
    sexo: row.Sexo || row.sexo || "",
    faixaEtaria: row.FaixaEtaria || row.faixaEtaria || "",
    respostas: parseResponseJson(row.RespostasJson || row.respostasJson || "")
  }));
}

function normalizeOpenQuestions(questions) {
  return (questions || [])
    .map((question, index) => {
      const order = Number(question.ordem || question.Ordem || index + 1);
      const code = String(question.id || question.ID || `P${order}`).trim().toUpperCase();
      return {
        code,
        group: question.grupo || question.Grupo || "Geral",
        context: question.contexto || question.Contexto || "",
        text: question.pergunta || question.Pergunta || code,
        type: normalizeQuestionType(question.tipo || question.Tipo || ""),
        active: normalizeText(question.ativa || question.Ativa || "Sim") !== "nao",
        order
      };
    })
    .filter((question) => question.active && isOpenQuestion(question))
    .sort((a, b) => a.order - b.order)
    .slice(0, 20);
}

function isOpenQuestion(question) {
  return question.type === "abertatexto" || /^RA\d+$/i.test(question.code);
}

function populateOpenFilters() {
  setFilterOptions(openFilters.cidade, uniqueValues(openReportState.responses, "cidade"), "Todas");
  setFilterOptions(openFilters.regiao, uniqueValues(openReportState.responses, "regiao"), "Todas");
  setFilterOptions(openFilters.pesquisador, uniqueValues(openReportState.responses, "pesquisador"), "Todos");
  setFilterOptions(openFilters.sexo, uniqueValues(openReportState.responses, "sexo"), "Todos");
  setFilterOptions(openFilters.faixaEtaria, uniqueValues(openReportState.responses, "faixaEtaria"), "Todas");

  openFilters.question.innerHTML = [
    '<option value="">Todas</option>',
    ...openReportState.questions.map((question) => (
      `<option value="${escapeHtml(question.code)}">${escapeHtml(question.code)} — ${escapeHtml(question.text)}</option>`
    ))
  ].join("");
}

function renderOpenAnswersReport() {
  const responses = getFilteredOpenResponses();
  const questions = getFilteredOpenQuestions();
  const groups = questions.map((question) => ({
    question,
    answers: responses
      .map((row) => ({ row, text: getOpenAnswer(row, question) }))
      .filter((item) => item.text)
  }));
  const totalAnswers = groups.reduce((sum, group) => sum + group.answers.length, 0);

  renderOpenSummary(responses.length, questions.length, totalAnswers);

  if (!questions.length) {
    openQuestionsReport.innerHTML = `
      <section class="open-question-report-section">
        <h2>Nenhuma pergunta aberta encontrada.</h2>
        <p>Cadastre perguntas com Tipo = AbertaTexto ou IDs RA1, RA2, RA3... na aba Perguntas.</p>
      </section>
    `;
    return;
  }

  openQuestionsReport.innerHTML = groups.map(({ question, answers }) => renderOpenQuestionSection(question, answers)).join("");
}

function renderOpenSummary(totalInterviews, totalQuestions, totalAnswers) {
  openReportSummary.innerHTML = `
    <div class="open-summary-card">
      <span>Entrevistas filtradas</span>
      <strong>${totalInterviews}</strong>
    </div>
    <div class="open-summary-card">
      <span>Perguntas abertas</span>
      <strong>${totalQuestions}</strong>
    </div>
    <div class="open-summary-card">
      <span>Respostas abertas</span>
      <strong>${totalAnswers}</strong>
    </div>
  `;
}

function renderOpenQuestionSection(question, answers) {
  return `
    <section class="open-question-report-section avoid-break">
      <header class="open-question-report-header">
        <div>
          <p class="eyebrow">${escapeHtml(question.group || "Pergunta aberta")}</p>
          <h2>${escapeHtml(question.code)} — ${escapeHtml(question.text || question.code)}</h2>
          ${question.context ? `<p>${escapeHtml(question.context)}</p>` : ""}
        </div>
        <strong>${answers.length} resposta(s)</strong>
      </header>
      <div class="open-answer-report-list">
        ${answers.length ? answers.map((item, index) => renderOpenAnswerItem(item, index)).join("") : `
          <article class="open-answer-report-item">
            <p>Sem respostas abertas para esta pergunta ainda.</p>
          </article>
        `}
      </div>
    </section>
  `;
}

function renderOpenAnswerItem({ row, text }, index) {
  return `
    <article class="open-answer-report-item avoid-break">
      <div class="open-answer-report-number">${index + 1}</div>
      <div>
        <p class="open-answer-meta">
          Cidade: ${escapeHtml(row.cidade || "Não informada")} |
          Região: ${escapeHtml(row.regiao || "Não informada")} |
          Sexo: ${escapeHtml(row.sexo || "Não informado")} |
          Faixa: ${escapeHtml(row.faixaEtaria || "Não informada")} |
          Pesquisador: ${escapeHtml(row.pesquisador || "Não informado")}
        </p>
        <p class="open-answer-label">Resposta:</p>
        <blockquote>${escapeHtml(text)}</blockquote>
      </div>
    </article>
  `;
}

function getFilteredOpenQuestions() {
  const selected = openFilters.question.value;
  return openReportState.questions.filter((question) => !selected || question.code === selected);
}

function getFilteredOpenResponses() {
  return openReportState.responses.filter((row) => (
    matchesFilter(row.cidade, openFilters.cidade.value) &&
    matchesFilter(row.regiao, openFilters.regiao.value) &&
    matchesFilter(row.pesquisador, openFilters.pesquisador.value) &&
    matchesFilter(row.sexo, openFilters.sexo.value) &&
    matchesFilter(row.faixaEtaria, openFilters.faixaEtaria.value)
  ));
}

function getOpenAnswer(row, question) {
  const code = question.code;
  const raw = row.raw || {};
  const rawValue = raw[code] || raw[code.toLowerCase()];
  if (rawValue) return String(rawValue).trim();

  const item = (row.respostas || []).find((answer) => {
    const answerCode = String(answer.campo || answer.id || "").toUpperCase();
    return answerCode === code;
  });

  if (item) {
    return String(item.resposta || item.respostaAberta || item.texto || "").trim();
  }

  const number = Number(code.replace(/\D/g, ""));
  if (code.startsWith("RA") && number) {
    return String(raw[`RespostaAberta${number}`] || raw.RespostaAberta || "").trim();
  }

  return "";
}

function exportOpenAnswersTxt() {
  const text = buildOpenAnswersTxt();
  const blob = new Blob([`\uFEFF${text}`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `respostas-abertas-dividados-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildOpenAnswersTxt() {
  const responses = getFilteredOpenResponses();
  const questions = getFilteredOpenQuestions();
  const filtersText = [
    ["Cidade", openFilters.cidade.value || "Todas"],
    ["Região/Bairro", openFilters.regiao.value || "Todas"],
    ["Pesquisador", openFilters.pesquisador.value || "Todos"],
    ["Sexo", openFilters.sexo.value || "Todos"],
    ["Faixa etária", openFilters.faixaEtaria.value || "Todas"]
  ].map(([label, value]) => `${label}: ${value}`).join(" | ");

  const lines = [
    "RELATÓRIO DE RESPOSTAS ABERTAS - DIVIDADOS PESQUISA",
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
    `Filtros: ${filtersText}`,
    ""
  ];

  questions.forEach((question) => {
    const answers = responses
      .map((row) => ({ row, text: getOpenAnswer(row, question) }))
      .filter((item) => item.text);

    lines.push(`${question.code} — ${question.text || question.code}`);
    if (question.context) lines.push(`Contexto: ${question.context}`);
    lines.push(`Total de respostas: ${answers.length}`, "");

    if (!answers.length) {
      lines.push("Sem respostas abertas para esta pergunta ainda.", "");
      return;
    }

    answers.forEach(({ row, text }, index) => {
      lines.push(`${index + 1}. Cidade: ${row.cidade || "Não informada"} | Região: ${row.regiao || "Não informada"} | Sexo: ${row.sexo || "Não informado"} | Faixa: ${row.faixaEtaria || "Não informada"} | Pesquisador: ${row.pesquisador || "Não informado"}`);
      lines.push("Resposta:");
      lines.push(`"${text}"`, "");
    });

    lines.push("------------------------------------------------------------", "");
  });

  return lines.join("\r\n");
}

function clearOpenFilters() {
  Object.values(openFilters).forEach((filter) => { filter.value = ""; });
  renderOpenAnswersReport();
}

function setFilterOptions(select, values, defaultLabel) {
  const current = select.value;
  select.innerHTML = [
    `<option value="">${escapeHtml(defaultLabel)}</option>`,
    ...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
  ].join("");
  if (values.includes(current)) select.value = current;
}

function uniqueValues(rows, field) {
  return [...new Set(rows.map((row) => formatLabel(row[field])).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function matchesFilter(value, expected) {
  return !expected || normalizeGroupKey(value) === normalizeGroupKey(expected);
}

function parseResponseJson(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function normalizeQuestionType(type) {
  const normalized = normalizeText(type).replace(/\s|-/g, "");
  if (normalized === "abertatexto" || normalized === "aberta" || normalized === "texto") return "abertatexto";
  return normalized || "fechada";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGroupKey(value) {
  return normalizeText(value).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function formatLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function showOpenReportMessage(message, type) {
  openReportMessage.textContent = message;
  openReportMessage.className = `message no-print ${type || ""}`;
  openReportMessage.hidden = false;
}

function hideOpenReportMessage() {
  openReportMessage.hidden = true;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
