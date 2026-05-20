// Cole somente a URL publicada do seu Google Apps Script entre as aspas.
const API_URL = "https://script.google.com/macros/s/AKfycby1iZyydOBfSrNpKPx0HulX3gT-KhfUEaOxxcfCq6JaUyB2UF43dAVtKd9hNxSGOoD7/exec";

const reportRoot = document.getElementById("reportRoot");
const reportMessage = document.getElementById("reportMessage");
const printReportButton = document.getElementById("printReportButton");
const reportCharts = {};
const COLORS = {
  A: "#16a34a",
  B: "#2563eb",
  C: "#f97316",
  D: "#7c3aed"
};

let reportState = {
  responses: [],
  quotas: [],
  questions: [],
  config: {}
};

document.addEventListener("DOMContentLoaded", loadReport);
printReportButton.addEventListener("click", async () => {
  printReportButton.disabled = true;
  printReportButton.textContent = "Preparando PDF...";
  await wait(500);
  window.print();
  printReportButton.disabled = false;
  printReportButton.textContent = "Imprimir / Salvar PDF";
});

async function loadReport() {
  try {
    const [dashboard, questions, reportConfig] = await Promise.all([
      apiRequest("dashboard", {}),
      apiRequest("getQuestions", {}),
      apiRequest("getReportConfig", {})
    ]);

    if (!dashboard.ok) throw new Error(dashboard.message || "Não foi possível carregar o dashboard.");

    reportState = {
      responses: normalizeResponses(dashboard.responses || []),
      quotas: dashboard.quotas || [],
      questions: normalizeQuestions(questions.ok ? questions.questions : []),
      config: reportConfig.ok ? reportConfig.config : {}
    };

    buildReport();
    drawReportCharts();
    if (reportConfig.source === "sheet") {
      reportMessage.textContent = "Relatório carregado com textos da aba Relatorio. Clique em Imprimir / Salvar PDF.";
      reportMessage.className = "message success no-print";
    } else {
      reportMessage.textContent = reportConfig.message || "Relatório carregado com textos padrão. Confira se a aba Relatorio existe e se o Apps Script foi reimplantado.";
      reportMessage.className = "message warning no-print";
      console.warn("Configuração do relatório não veio da planilha:", reportConfig);
    }
    printReportButton.disabled = false;
  } catch (error) {
    console.error("Erro ao gerar relatório:", error);
    reportMessage.textContent = `Erro ao gerar relatório: ${error.message}`;
    reportMessage.className = "message error no-print";
  }
}

async function apiRequest(action, payload) {
  const params = new URLSearchParams({
    action,
    payload: JSON.stringify(payload || {})
  });
  const response = await fetch(`${API_URL}?${params.toString()}`, { method: "GET" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function normalizeResponses(rows) {
  return rows.map((row) => ({
    raw: row,
    dataHora: row.DataHora || row.dataHora || "",
    pesquisador: row.Pesquisador || row.pesquisador || "",
    cidade: row.Cidade || row.cidade || "",
    regiao: row.Regiao || row.regiao || "",
    sexo: row.Sexo || row.sexo || "",
    faixaEtaria: row.FaixaEtaria || row.faixaEtaria || "",
    respostas: parseJson(row.RespostasJson || row.respostasJson || ""),
    respostaAberta: row.RespostaAberta || row.respostaAberta || ""
  }));
}

function normalizeQuestions(questions) {
  return (questions || [])
    .map((question, index) => ({
      code: String(question.id || question.ID || `P${index + 1}`).trim().toUpperCase(),
      text: question.pergunta || question.Pergunta || "",
      type: question.tipo || question.Tipo || "Fechada",
      active: normalizeText(question.ativa || question.Ativa || "Sim") !== "nao",
      order: Number(question.ordem || question.Ordem || index + 1),
      alternatives: {
        A: question.a || question.A || "",
        B: question.b || question.B || "",
        C: question.c || question.C || "",
        D: question.d || question.D || ""
      }
    }))
    .filter((question) => question.active)
    .sort((a, b) => a.order - b.order);
}

function buildReport() {
  const config = reportState.config;
  const responses = reportState.responses;
  const closedQuestions = getClosedQuestions();
  const openQuestions = getOpenGroups();
  const chunksClosed = chunkArray(closedQuestions, 4);
  const chunksOpen = chunkArray(openQuestions, 2);

  reportRoot.innerHTML = `
    ${renderCover(config)}
    ${renderSummaryPage()}
    ${renderTextPage("1. Objetivo da Pesquisa", config.objetivo)}
    ${renderTextPage("2. Metodologia", config.metodologia)}
    ${renderExecutiveSummary(config)}
    ${renderSampleProfilePage()}
    ${chunksClosed.map((chunk, index) => renderClosedQuestionsPage(chunk, index + 1, chunksClosed.length)).join("")}
    ${chunksOpen.map((chunk, index) => renderOpenQuestionsPage(chunk, index + 1, chunksOpen.length)).join("")}
    ${renderConclusionPage(config)}
  `;
}

function renderCover(config) {
  const coverStyle = config.fundo ? ` style="background-image: linear-gradient(rgba(7, 18, 32, 0.68), rgba(7, 18, 32, 0.78)), url('${escapeAttr(config.fundo)}')"` : "";
  return `
    <section class="report-a4 cover-page"${coverStyle}>
      <div class="cover-content">
        ${config.logo ? `<img class="cover-logo" src="${escapeAttr(config.logo)}" alt="Logo">` : ""}
        <p>${escapeHtml(config.empresa || "DIVIDADOS")}</p>
        <h1>${escapeHtml(config.titulo || "PESQUISA DE OPINIÃO")}</h1>
        <h2>${escapeHtml(config.subtitulo || "Relatório Executivo de Pesquisa")}</h2>
        <strong>${escapeHtml(config.cidade || "Cidade não informada")}</strong>
      </div>
      <footer>
        <span>${escapeHtml(config.data || new Date().toLocaleDateString("pt-BR"))}</span>
        <span>${escapeHtml(config.rodape || "Dividados Pesquisa e Mercado")}</span>
      </footer>
    </section>
  `;
}

function renderSummaryPage() {
  const items = [
    "Objetivo da Pesquisa",
    "Metodologia",
    "Resumo Executivo",
    "Perfil da Amostra",
    "Resultados das Perguntas Fechadas",
    "Análise das Perguntas Abertas",
    "Conclusão"
  ];
  return `
    <section class="report-a4">
      ${reportHeader("Sumário", "Estrutura do relatório")}
      <ol class="report-index">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ol>
    </section>
  `;
}

function renderTextPage(title, text) {
  return `
    <section class="report-a4">
      ${reportHeader(title, "Contexto da pesquisa")}
      <div class="report-text-block">
        <p>${escapeHtml(text || "Texto não informado na aba Relatorio.")}</p>
      </div>
    </section>
  `;
}

function renderExecutiveSummary(config) {
  const responses = reportState.responses;
  const sexCounts = countBy(responses, "sexo");
  const quotas = reportState.quotas;
  return `
    <section class="report-a4">
      ${reportHeader("3. Resumo Executivo", "Principais indicadores")}
      <div class="report-text-block compact">
        <p>${escapeHtml(config.resumo || "")}</p>
      </div>
      <div class="report-metric-grid">
        ${metric("Total de entrevistas", responses.length)}
        ${metric("Cidade", config.cidade || mostCommon(responses, "cidade") || "Todas")}
        ${metric("Masculino", sexCounts.Masculino || sexCounts.masculino || 0)}
        ${metric("Feminino", sexCounts.Feminino || sexCounts.feminino || 0)}
        ${metric("Cotas abertas", quotas.filter(isQuotaOpen).length)}
        ${metric("Cotas fechadas", quotas.filter((quota) => !isQuotaOpen(quota)).length)}
      </div>
      <div class="report-table-block">
        <h3>Resumo das cotas</h3>
        ${quotasTable(quotas)}
      </div>
    </section>
  `;
}

function renderSampleProfilePage() {
  return `
    <section class="report-a4">
      ${reportHeader("4. Perfil da Amostra", "Distribuição das entrevistas")}
      <div class="report-chart-grid">
        ${chartBox("Sexo", "chart_sexo", "pie")}
        ${chartBox("Faixa etária", "chart_faixa", "bar")}
        ${chartBox("Cidade", "chart_cidade", "bar")}
        ${chartBox("Região/Bairro", "chart_regiao", "bar")}
        ${chartBox("Status das cotas", "chart_cotas", "pie")}
      </div>
    </section>
  `;
}

function renderClosedQuestionsPage(questions, page, totalPages) {
  if (!questions.length) return "";
  return `
    <section class="report-a4">
      ${reportHeader("5. Resultados das Perguntas Fechadas", totalPages > 1 ? `Página ${page} de ${totalPages}` : "Distribuição das alternativas")}
      <div class="report-question-grid">
        ${questions.map(renderClosedQuestionCard).join("")}
      </div>
    </section>
  `;
}

function renderClosedQuestionCard(question) {
  const counts = countQuestion(question.code);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return `
    <article class="report-question-card avoid-break">
      <header>
        <span>${escapeHtml(question.code)}</span>
        <h3>${escapeHtml(question.text || question.code)}</h3>
      </header>
      <div class="report-question-layout">
        <canvas id="chart_${escapeAttr(question.code)}" width="220" height="220"></canvas>
        <div class="report-legend">
          ${["A", "B", "C", "D"].map((key) => legendRow(key, question, counts, total)).join("")}
        </div>
      </div>
    </article>
  `;
}

function renderOpenQuestionsPage(groups, page, totalPages) {
  if (!groups.length) return "";
  return `
    <section class="report-a4">
      ${reportHeader("6. Análise das Perguntas Abertas", totalPages > 1 ? `Página ${page} de ${totalPages}` : "Análise qualitativa")}
      <div class="report-open-list">
        ${groups.map(renderOpenQuestionCard).join("")}
      </div>
    </section>
  `;
}

function renderOpenQuestionCard(group) {
  const validAnswers = group.answers.filter((answer) => answer.text && !isLowValue(answer.text));
  const words = topWords(validAnswers.map((answer) => answer.text).join(" "), 8);
  const themes = detectThemes(validAnswers.map((answer) => answer.text).join(" "));
  return `
    <article class="report-open-card avoid-break">
      <header>
        <span>${escapeHtml(group.code)}</span>
        <h3>${escapeHtml(group.code)} — ${escapeHtml(group.text || group.code)}</h3>
        <p>${group.answers.length} respostas · ${validAnswers.length} válidas para análise</p>
      </header>
      <div class="report-open-layout">
        <div class="report-open-responses">
          ${group.answers.slice(0, 6).map((answer) => `
            <div>
              <strong>${escapeHtml(answer.cidade || "Sem cidade")}${answer.regiao ? " / " + escapeHtml(answer.regiao) : ""}</strong>
              <p>"${escapeHtml(answer.text)}"</p>
              <small>${escapeHtml(answer.pesquisador || "Pesquisador não informado")} · ${escapeHtml(answer.sexo || "")} · ${escapeHtml(answer.faixaEtaria || "")}</small>
            </div>
          `).join("") || "<p>Sem respostas abertas para esta pergunta ainda.</p>"}
        </div>
        <aside>
          <h4>Palavras mais repetidas</h4>
          <div class="report-tags">${words.map((word) => `<span>${escapeHtml(word.word)} <strong>${word.count}</strong></span>`).join("") || "<span>Sem palavras suficientes</span>"}</div>
          <h4>Principais temas</h4>
          <ul>${themes.map((theme) => `<li>${escapeHtml(theme.label)} (${theme.count})</li>`).join("") || "<li>Nenhum tema predominante identificado.</li>"}</ul>
        </aside>
      </div>
    </article>
  `;
}

function renderConclusionPage(config) {
  return `
    <section class="report-a4 conclusion-page">
      ${reportHeader("7. Conclusão", "Encerramento")}
      <div class="report-text-block">
        <p>${escapeHtml(config.conclusao || "")}</p>
      </div>
      <footer class="report-signature">
        <strong>${escapeHtml(config.assinatura || config.responsavel || "")}</strong>
        <span>${escapeHtml(config.rodape || "Dividados Pesquisa e Mercado")}</span>
      </footer>
    </section>
  `;
}

function drawReportCharts() {
  destroyCharts();
  const responses = reportState.responses;
  createChart("chart_sexo", "pie", countBy(responses, "sexo"));
  createChart("chart_faixa", "bar", countBy(responses, "faixaEtaria"));
  createChart("chart_cidade", "bar", countBy(responses, "cidade"));
  createChart("chart_regiao", "bar", countBy(responses, "regiao"));
  createChart("chart_cotas", "pie", countQuotaStatus(reportState.quotas));
  getClosedQuestions().forEach((question) => createQuestionChart(question));
}

function createChart(canvasId, type, source) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const labels = Object.keys(source);
  const values = Object.values(source);
  reportCharts[canvasId] = new Chart(canvas, {
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
    options: chartOptions(type)
  });
}

function createQuestionChart(question) {
  const canvasId = `chart_${question.code}`;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const counts = countQuestion(question.code);
  reportCharts[canvasId] = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["A", "B", "C", "D"],
      datasets: [{
        data: ["A", "B", "C", "D"].map((key) => counts[key] || 0),
        backgroundColor: ["A", "B", "C", "D"].map((key) => COLORS[key]),
        borderColor: "#ffffff",
        borderWidth: 2
      }]
    },
    options: { ...chartOptions("pie"), cutout: "58%", plugins: { legend: { display: false } } }
  });
}

function chartOptions(type) {
  return {
    responsive: false,
    maintainAspectRatio: true,
    animation: false,
    devicePixelRatio: 4,
    plugins: {
      legend: {
        display: type !== "bar",
        position: "bottom",
        labels: { boxWidth: 10, padding: 10, font: { size: 10 } }
      }
    },
    scales: type === "bar" ? {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 25, minRotation: 0 } },
      y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } }
    } : {}
  };
}

function getClosedQuestions() {
  return reportState.questions.filter((question) => normalizeText(question.type) === "fechada" && /^P\d+$/i.test(question.code)).slice(0, 20);
}

function getOpenGroups() {
  const openQuestions = reportState.questions.filter((question) => normalizeText(question.type) === "aberta");
  const groups = new Map(openQuestions.map((question) => [question.code, { ...question, answers: [] }]));
  reportState.responses.forEach((row) => {
    extractOpenAnswers(row).forEach((answer) => {
      if (!groups.has(answer.code)) groups.set(answer.code, { code: answer.code, text: answer.questionText || answer.code, order: answer.order || 99, answers: [] });
      groups.get(answer.code).answers.push({ ...answer, cidade: row.cidade, regiao: row.regiao, pesquisador: row.pesquisador, sexo: row.sexo, faixaEtaria: row.faixaEtaria, dataHora: row.dataHora });
    });
  });
  return [...groups.values()].sort((a, b) => a.order - b.order);
}

function extractOpenAnswers(row) {
  const answers = [];
  (row.respostas || []).forEach((item, index) => {
    const code = String(item.campo || item.id || `RA${index + 1}`).toUpperCase();
    if (normalizeText(item.tipo || item.type || "") === "aberta" || /^RA\d+$/i.test(code)) {
      answers.push({ code, questionText: item.pergunta || "", text: item.resposta || item.respostaAberta || "", order: Number(code.replace(/\D/g, "")) || index + 1 });
    }
  });
  return answers.filter((answer) => answer.text);
}

function countQuestion(code) {
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  reportState.responses.forEach((row) => {
    const direct = row.raw[code] || row.raw[code.toLowerCase()];
    const jsonAnswer = (row.respostas || []).find((item) => String(item.campo || item.id || "").toUpperCase() === code);
    const answer = String(direct || (jsonAnswer ? jsonAnswer.resposta : "") || "").trim().toUpperCase();
    if (counts[answer] !== undefined) counts[answer] += 1;
  });
  return counts;
}

function legendRow(key, question, counts, total) {
  const count = counts[key] || 0;
  const percent = total ? Math.round((count / total) * 100) : 0;
  const text = question.alternatives[key] || key;
  return `<div><i style="background:${COLORS[key]}"></i><span><strong>${key}</strong> — ${escapeHtml(text)} — ${percent}% (${count} votos)</span></div>`;
}

function reportHeader(title, subtitle) {
  return `<header class="report-section-header"><p class="eyebrow">Dividados Pesquisa</p><h2>${escapeHtml(title)}</h2><span>${escapeHtml(subtitle || "")}</span></header>`;
}

function chartBox(title, id, type) {
  const size = type === "bar" ? 'width="520" height="260"' : 'width="220" height="220"';
  return `<article class="report-chart-card avoid-break"><h3>${escapeHtml(title)}</h3><canvas id="${id}" ${size}></canvas></article>`;
}

function metric(label, value) {
  return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function quotasTable(quotas) {
  if (!quotas.length) return "<p>Nenhuma cota cadastrada.</p>";
  return `<table><thead><tr><th>Sexo</th><th>Faixa etária</th><th>Meta</th><th>Realizado</th><th>Restante</th><th>Status</th></tr></thead><tbody>${quotas.map((quota) => `<tr><td>${escapeHtml(quota.sexo)}</td><td>${escapeHtml(quota.faixaEtaria)}</td><td>${numberValue(quota.meta)}</td><td>${numberValue(quota.realizado)}</td><td>${numberValue(quota.restante)}</td><td>${isQuotaOpen(quota) ? "Aberta" : "Encerrada"}</td></tr>`).join("")}</tbody></table>`;
}

function countQuotaStatus(quotas) {
  return quotas.reduce((acc, quota) => {
    const key = isQuotaOpen(quota) ? "Abertas" : "Fechadas";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = String(row[field] || "Não informado").trim() || "Não informado";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function mostCommon(rows, field) {
  const entries = Object.entries(countBy(rows, field)).sort((a, b) => b[1] - a[1]);
  return entries[0] ? entries[0][0] : "";
}

function isQuotaOpen(quota) {
  return normalizeText(quota.status) === "aberta" && numberValue(quota.restante) > 0;
}

function topWords(text, limit) {
  const stopWords = new Set(["a", "o", "os", "as", "um", "uma", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "para", "por", "com", "que", "se", "ao", "mais", "muito", "nao", "sim", "como", "pra", "pela", "pelo", "isso", "essa", "esse", "ele", "ela", "voce", "minha", "meu", "sua", "seu"]);
  const counts = {};
  normalizeText(text).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 2 && !stopWords.has(word)).forEach((word) => {
    counts[word] = (counts[word] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word, count]) => ({ word, count }));
}

function detectThemes(text) {
  const normalized = normalizeText(text);
  const themes = [
    { label: "Saúde", terms: ["saude", "hospital", "posto", "medico", "upa"] },
    { label: "Educação", terms: ["educacao", "escola", "creche", "professor"] },
    { label: "Segurança", terms: ["seguranca", "policia", "crime", "roubo"] },
    { label: "Infraestrutura", terms: ["rua", "asfalto", "buraco", "obra", "iluminacao"] },
    { label: "Administração", terms: ["prefeitura", "gestao", "governo", "atendimento"] }
  ];
  return themes.map((theme) => ({ label: theme.label, count: theme.terms.reduce((sum, term) => sum + ((normalized.match(new RegExp(`\\b${term}\\b`, "g")) || []).length), 0) })).filter((theme) => theme.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);
}

function isLowValue(text) {
  const value = normalizeText(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return ["", "nao sei", "nao quero falar", "prefiro nao responder", "nenhuma", "nada", "nao respondeu"].includes(value);
}

function parseJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function destroyCharts() {
  Object.keys(reportCharts).forEach((key) => {
    reportCharts[key].destroy();
    delete reportCharts[key];
  });
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function numberValue(value) {
  return Number(value) || 0;
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
