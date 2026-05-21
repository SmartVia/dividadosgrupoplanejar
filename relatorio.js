const API_URL = "https://script.google.com/macros/s/AKfycby1iZyydOBfSrNpKPx0HulX3gT-KhfUEaOxxcfCq6JaUyB2UF43dAVtKd9hNxSGOoD7/exec";

const OPTION_KEYS = ["A", "B", "C", "D", "E", "F"];
const SCALE_WEIGHTS = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };
const COLORS = { A: "#16a34a", B: "#2563eb", C: "#f97316", D: "#7c3aed", E: "#dc2626", F: "#64748b" };
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
      apiRequest("dashboard", {}),
      apiRequest("getQuestions", {})
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
  createChart("profile_sexo", "doughnut", countBy(state.responses, "sexo"));
  createChart("profile_faixa", "bar", countBy(state.responses, "faixaEtaria"));
  createChart("profile_cidade", "bar", countBy(state.responses, "cidade"));
  createChart("profile_regiao", "bar", countBy(state.responses, "regiao"));

  questionsByType("fechada").forEach((question) => {
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
  reportCharts[canvasId] = new Chart(canvas, {
    type,
    data: {
      labels: labels.length ? labels : ["Sem dados"],
      datasets: [{ data: values.length ? values : [0], backgroundColor: colors || PALETTE, borderColor: "#fff", borderWidth: 2, borderRadius: type === "bar" ? 6 : 0 }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: true,
      animation: false,
      devicePixelRatio: 4,
      plugins: { legend: { display: type !== "bar", position: "bottom", labels: { boxWidth: 9, font: { size: 9 } } } },
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
  return rows.map((row) => ({ raw: row, dataHora: row.DataHora || "", pesquisador: row.Pesquisador || "", cidade: row.Cidade || "", regiao: row.Regiao || "", sexo: row.Sexo || "", faixaEtaria: row.FaixaEtaria || "", respostas: parseJson(row.RespostasJson || "") }));
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
  const total = OPTION_KEYS.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const validKeys = OPTION_KEYS.filter((key) => key !== "F");
  const valid = validKeys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const weighted = validKeys.reduce((sum, key) => sum + ((counts[key] || 0) * SCALE_WEIGHTS[key]), 0);
  const avg = valid ? weighted / valid : 0;
  return { question, counts, technicalAverage: avg, classification: classifyAverage(avg), approvalPercent: percent((counts.A || 0) + (counts.B || 0), valid), rejectionPercent: percent((counts.D || 0) + (counts.E || 0), valid), ntoPercent: percent(counts.F || 0, total) };
}

function countBy(rows, field) {
  return rows.reduce((acc, row) => { const key = formatLabel(row[field] || "Nao informado"); acc[key] = (acc[key] || 0) + 1; return acc; }, {});
}

function optionKeys(question) { return OPTION_KEYS.filter((key) => question.alternatives[key]); }
function percent(value, total) { return total ? Math.round((value / total) * 100) : 0; }
function classifyAverage(value) { if (!value) return "Sem dados"; if (value <= 1.8) return "Excelente"; if (value <= 2.6) return "Boa"; if (value <= 3.4) return "Regular"; if (value <= 4.2) return "Ruim"; return "Pessima"; }
function normalizeQuestionType(type) { const n = normalizeText(type); if (n === "escala") return "escala"; if (n === "semifechada" || n === "semi fechada" || n === "semi-fechada") return "semifechada"; if (n === "abertatexto" || n === "aberta" || n === "texto") return "abertatexto"; return "fechada"; }
function isQuotaOpen(q) { return normalizeText(q.status) === "aberta" && Number(q.restante || 0) > 0; }
function formatNumber(value) { return Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatLabel(value) { return String(value || "").replace(/\s+/g, " ").trim() || "Nao informado"; }
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

async function apiRequest(action, payload) {
  try { return await fetchRequest(action, payload); } catch (error) { return jsonpRequest(action, payload); }
}
function buildApiUrl(action, payload, callbackName) {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("payload", JSON.stringify(payload || {}));
  if (callbackName) url.searchParams.set("callback", callbackName);
  return url;
}
async function fetchRequest(action, payload) {
  const response = await fetch(buildApiUrl(action, payload).toString(), { method: "GET", cache: "no-store", redirect: "follow" });
  return JSON.parse(await response.text());
}
function jsonpRequest(action, payload) {
  return new Promise((resolve, reject) => {
    const callbackName = `dividadosReport_${Date.now()}`;
    const script = document.createElement("script");
    const timeoutId = setTimeout(() => { reject(new Error("Tempo esgotado ao chamar a API.")); cleanup(); }, 20000);
    window[callbackName] = (data) => { resolve(data); cleanup(); };
    script.onerror = () => { reject(new Error("Falha na API.")); cleanup(); };
    function cleanup() { clearTimeout(timeoutId); delete window[callbackName]; script.remove(); }
    script.src = buildApiUrl(action, payload, callbackName).toString();
    document.body.appendChild(script);
  });
}
