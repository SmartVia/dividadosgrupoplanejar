// Cole somente a URL publicada do seu Google Apps Script entre as aspas.
// Certo: const API_URL = "https://script.google.com/macros/s/SEU_ID/exec";
// Errado: const API_URL = "const API_URL = \"https://script.google.com/macros/s/SEU_ID/exec\";";
const API_URL = "https://script.google.com/macros/s/AKfycbz2-cqG_YPr2CMXXf2lHyZn_qdjCD_w_2apcRLNlfBwnQ79MjMKEIzjJK_eJtEV7H9DUg/exec";

const dashboardMessage = document.getElementById("dashboardMessage");
const refreshButton = document.getElementById("refreshButton");
const charts = {};

refreshButton.addEventListener("click", loadDashboard);
document.addEventListener("DOMContentLoaded", loadDashboard);

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
    showDashboardMessage("Configure a constante API_URL no arquivo dashboard.js antes de carregar o dashboard.", "error");
    console.error("API_URL esta vazia. Cole a URL publicada do Google Apps Script em dashboard.js.");
    return;
  }

  refreshButton.disabled = true;
  refreshButton.textContent = "Atualizando...";

  try {
    const data = await apiRequest("dashboard", {});
    console.log("Resposta dashboard:", data);

    if (!data.ok) {
      console.warn("Erro retornado pela API do dashboard:", data);
      showDashboardMessage(data.message || "Nao foi possivel carregar os dados.", "error");
      return;
    }

    renderMetrics(data);
    renderCharts(data);
    renderQuotas(data.quotas || []);
    showDashboardMessage("Dados atualizados com sucesso.", "success");
  } catch (error) {
    console.error("Erro ao buscar dados do dashboard:", error);
    showDashboardMessage(`Erro ao buscar dados: ${error.message}`, "error");
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Atualizar dados";
  }
}

function renderMetrics(data) {
  const quotas = data.quotas || [];
  document.getElementById("totalEntrevistas").textContent = data.total || 0;
  document.getElementById("cotasAbertas").textContent = quotas.filter((quota) => quota.status === "Aberta").length;
  document.getElementById("cotasEncerradas").textContent = quotas.filter((quota) => quota.status === "Encerrada").length;
}

function renderCharts(data) {
  createChart("sexoChart", "sexo", "Entrevistas", data.bySexo || {}, "bar");
  createChart("faixaChart", "faixa", "Entrevistas", data.byFaixaEtaria || {}, "bar");
  createChart("cidadeChart", "cidade", "Entrevistas", data.byCidade || {}, "bar");
  createChart("pesquisadorChart", "pesquisador", "Entrevistas", data.byPesquisador || {}, "bar");
}

function createChart(canvasId, chartKey, label, source, type) {
  const labels = Object.keys(source);
  const values = Object.values(source);
  const context = document.getElementById(canvasId);

  if (charts[chartKey]) {
    charts[chartKey].destroy();
  }

  charts[chartKey] = new Chart(context, {
    type,
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        backgroundColor: ["#0f766e", "#2563eb", "#d97706", "#7c3aed", "#be123c", "#475569"],
        borderColor: "#ffffff",
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      }
    }
  });
}

function renderQuotas(quotas) {
  const tableBody = document.getElementById("quotasTableBody");

  if (!quotas.length) {
    tableBody.innerHTML = '<tr><td colspan="6">Nenhuma cota cadastrada.</td></tr>';
    return;
  }

  tableBody.innerHTML = quotas.map((quota) => {
    const isOpen = quota.status === "Aberta";
    const statusClass = isOpen ? "status-open" : "status-closed";

    return `
      <tr>
        <td>${escapeHtml(quota.sexo)}</td>
        <td>${escapeHtml(quota.faixaEtaria)}</td>
        <td>${quota.meta}</td>
        <td>${quota.realizado}</td>
        <td>${quota.restante}</td>
        <td><span class="status-pill ${statusClass}">${escapeHtml(quota.status)}</span></td>
      </tr>
    `;
  }).join("");
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
    console.warn("Fetch falhou. Tentando JSONP, que evita bloqueios de CORS do Apps Script.", error);
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
  const url = buildApiUrl(action, payload);
  const response = await fetch(url.toString(), {
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
    throw new Error(`A API nao retornou JSON valido. Retorno recebido: ${text.slice(0, 160)}`);
  }
}

// Fallback para quando o navegador bloquear fetch por CORS no Google Apps Script.
function jsonpRequest(action, payload) {
  return new Promise((resolve, reject) => {
    const callbackName = `dividadosDashboard_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement("script");
    const url = buildApiUrl(action, payload, callbackName);
    const timeoutId = setTimeout(() => {
      reject(new Error("Tempo esgotado ao chamar a API. Verifique se o Web App esta publicado para qualquer pessoa com o link."));
      cleanup();
    }, 20000);

    window[callbackName] = (data) => {
      resolve(data);
      cleanup();
    };

    script.onerror = () => {
      reject(new Error("Falha na chamada da API. Confira a URL do Apps Script e a implantacao do Web App."));
      cleanup();
    };

    function cleanup() {
      clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    }

    script.src = url.toString();
    document.body.appendChild(script);
  });
}
