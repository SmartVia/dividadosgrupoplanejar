// Cole somente a URL publicada do seu Google Apps Script entre as aspas.
// Certo: const API_URL = "https://script.google.com/macros/s/SEU_ID/exec";
const API_URL = "https://script.google.com/macros/s/AKfycby1iZyydOBfSrNpKPx0HulX3gT-KhfUEaOxxcfCq6JaUyB2UF43dAVtKd9hNxSGOoD7/exec";

const dashboardMessage = document.getElementById("dashboardMessage");
const refreshButton = document.getElementById("refreshButton");
const printButton = document.getElementById("printButton");
const clearFiltersButton = document.getElementById("clearFiltersButton");
const lastUpdated = document.getElementById("lastUpdated");
const charts = {};

const filters = {
  cidade: document.getElementById("filterCidade"),
  regiao: document.getElementById("filterRegiao"),
  pesquisador: document.getElementById("filterPesquisador"),
  sexo: document.getElementById("filterSexo"),
  faixaEtaria: document.getElementById("filterFaixaEtaria")
};

let dashboardData = {
  responses: [],
  quotas: []
};

refreshButton.addEventListener("click", loadDashboard);
printButton.addEventListener("click", () => window.print());
clearFiltersButton.addEventListener("click", clearFilters);

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

    dashboardData = normalizeDashboardData(data);

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

function normalizeDashboardData(data) {
  return {
    responses: (data.responses || []).map((row) => ({
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
      respostaAberta: row.RespostaAberta || row.respostaAberta || ""
    })),
    quotas: data.quotas || []
  };
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

  if (values.includes(currentValue)) {
    select.value = currentValue;
  }
}

function uniqueValues(rows, field) {
  return [...new Set(rows.map((row) => row[field]).filter(Boolean))]
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
    return (!filters.cidade.value || row.cidade === filters.cidade.value)
      && (!filters.regiao.value || row.regiao === filters.regiao.value)
      && (!filters.pesquisador.value || row.pesquisador === filters.pesquisador.value)
      && (!filters.sexo.value || row.sexo === filters.sexo.value)
      && (!filters.faixaEtaria.value || row.faixaEtaria === filters.faixaEtaria.value);
  });
}

function renderDashboard() {
  const responses = getFilteredResponses();
  renderMetrics(responses, dashboardData.quotas);
  renderCharts(responses, dashboardData.quotas);
  renderOpenAnswers(responses);
  renderQuotas(dashboardData.quotas);
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

function renderCharts(responses, quotas) {
  createChart("sexoChart", "sexo", "pie", countBy(responses, "sexo"));
  createChart("faixaChart", "faixa", "bar", countBy(responses, "faixaEtaria"));
  createChart("cidadeChart", "cidade", "bar", countBy(responses, "cidade"));
  createChart("regiaoChart", "regiao", "bar", countBy(responses, "regiao"));
  createChart("cotasStatusChart", "cotasStatus", "pie", countQuotaStatus(quotas));

  ["p1", "p2", "p3", "p4", "p5"].forEach((field) => {
    createChart(`${field}Chart`, field, "pie", countQuestion(responses, field));
  });
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
      maintainAspectRatio: false,
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

function renderOpenAnswers(responses) {
  const answers = responses
    .filter((row) => row.respostaAberta && row.respostaAberta.trim())
    .sort((a, b) => new Date(b.dataHora || 0) - new Date(a.dataHora || 0));

  document.getElementById("totalRespostasAbertas").textContent = answers.length;
  renderRecentAnswers(answers);
  renderTopWords(answers);
  renderThemeSummary(answers);
  renderOpenAnswersTable(answers);
}

function renderRecentAnswers(answers) {
  const list = document.getElementById("recentOpenAnswers");
  const recent = answers.slice(0, 6);

  list.innerHTML = recent.length ? recent.map((row) => `
    <li>
      <strong>${escapeHtml(row.cidade || "Sem cidade")}</strong>
      <span>${escapeHtml(row.respostaAberta)}</span>
    </li>
  `).join("") : "<li>Nenhuma resposta aberta encontrada.</li>";
}

function renderTopWords(answers) {
  const container = document.getElementById("topWords");
  const words = topWords(answers.map((row) => row.respostaAberta).join(" "), 12);

  container.innerHTML = words.length ? words.map((word) => `
    <span>${escapeHtml(word.word)} <strong>${word.count}</strong></span>
  `).join("") : "<span>Sem palavras suficientes</span>";
}

function renderThemeSummary(answers) {
  const list = document.getElementById("themeSummary");
  const themes = detectThemes(answers.map((row) => row.respostaAberta).join(" "));

  list.innerHTML = themes.length ? themes.map((theme) => `
    <li>${escapeHtml(theme.label)} <strong>${theme.count}</strong></li>
  `).join("") : "<li>Nenhum tema predominante identificado.</li>";
}

function renderOpenAnswersTable(answers) {
  const tableBody = document.getElementById("openAnswersTableBody");

  if (!answers.length) {
    tableBody.innerHTML = '<tr><td colspan="6">Nenhuma resposta aberta encontrada.</td></tr>';
    return;
  }

  tableBody.innerHTML = answers.map((row) => `
    <tr>
      <td>${escapeHtml(row.pesquisador)}</td>
      <td>${escapeHtml(row.cidade)}</td>
      <td>${escapeHtml(row.regiao)}</td>
      <td>${escapeHtml(row.sexo)}</td>
      <td>${escapeHtml(row.faixaEtaria)}</td>
      <td class="wrap-cell">${escapeHtml(row.respostaAberta)}</td>
    </tr>
  `).join("");
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
  return rows.reduce((acc, row) => {
    const key = String(row[field] || "Nao informado").trim() || "Nao informado";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function countQuestion(rows, field) {
  const base = { A: 0, B: 0, C: 0, D: 0 };
  rows.forEach((row) => {
    const answer = String(row[field] || "").trim().toUpperCase();
    if (base[answer] !== undefined) {
      base[answer] += 1;
    }
  });
  return base;
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
  const stopWords = new Set(["a", "o", "os", "as", "um", "uma", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "nos", "nas", "para", "por", "com", "que", "se", "ao", "aos", "mais", "menos", "muito", "muita", "muitos", "muitas", "ser", "ter", "tem", "foi", "sao", "sim", "nao"]);
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
