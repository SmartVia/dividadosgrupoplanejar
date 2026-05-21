const fieldMessage = document.getElementById("fieldMessage");
const refreshFieldButton = document.getElementById("refreshFieldButton");
const exportCsvButton = document.getElementById("exportCsvButton");
const printFieldButton = document.getElementById("printFieldButton");
const clearFieldFiltersButton = document.getElementById("clearFieldFiltersButton");
const fieldTableBody = document.getElementById("fieldTableBody");
const fieldResearcherSummary = document.getElementById("fieldResearcherSummary");
const fieldLastUpdated = document.getElementById("fieldLastUpdated");

const filters = {
  pesquisador: document.getElementById("fieldPesquisador"),
  cidade: document.getElementById("fieldCidade"),
  regiao: document.getElementById("fieldRegiao"),
  dataInicial: document.getElementById("fieldDataInicial"),
  dataFinal: document.getElementById("fieldDataFinal"),
  statusGps: document.getElementById("fieldStatusGps"),
  statusSync: document.getElementById("fieldStatusSync")
};

let fieldRows = [];

document.addEventListener("DOMContentLoaded", loadFieldReport);
refreshFieldButton.addEventListener("click", loadFieldReport);
exportCsvButton.addEventListener("click", exportCsv);
printFieldButton.addEventListener("click", () => window.print());
clearFieldFiltersButton.addEventListener("click", clearFilters);
Object.values(filters).forEach((filter) => filter.addEventListener("change", renderFieldReport));

async function loadFieldReport() {
  showMessage("", "");
  refreshFieldButton.disabled = true;
  refreshFieldButton.textContent = "Atualizando...";

  try {
    const response = await getDashboardData();
    if (!response.ok) throw new Error(response.message || "Nao foi possivel carregar o relatório de campo.");

    fieldRows = normalizeRows(response.responses || []);
    populateFilters();
    renderFieldReport();
    fieldLastUpdated.textContent = `Atualizado em ${new Date().toLocaleTimeString("pt-BR")}`;
  } catch (error) {
    console.error("Erro no relatório de campo:", error);
    showMessage(`Erro ao carregar relatório: ${error.message}`, "error");
  } finally {
    refreshFieldButton.disabled = false;
    refreshFieldButton.textContent = "Atualizar dados";
  }
}

function normalizeRows(rows) {
  return rows.map((row) => {
    const inicio = row.DataHoraInicio || row.dataHoraInicio || row.DataHora || row.dataHora || "";
    const envio = row.DataHoraEnvio || row.dataHoraEnvio || row.DataHora || row.dataHora || "";
    return {
      uniqueId: row.UniqueId || row.uniqueId || "",
      dataHoraInicio: inicio,
      dataHoraEnvio: envio,
      pesquisador: formatLabel(row.Pesquisador || row.pesquisador || ""),
      cidade: formatLabel(row.Cidade || row.cidade || ""),
      regiao: formatLabel(row.Regiao || row.regiao || ""),
      endereco: row.Endereco || row.endereco || "",
      sexo: row.Sexo || row.sexo || "",
      faixaEtaria: row.FaixaEtaria || row.faixaEtaria || "",
      latitude: row.Latitude || row.latitude || "",
      longitude: row.Longitude || row.longitude || "",
      statusGPS: row.StatusGPS || row.statusGPS || "Indisponível",
      origem: row.Origem || row.origem || "",
      statusSincronizacao: row.StatusSincronizacao || row.statusSincronizacao || "",
      inicioDate: parseDate(inicio),
      envioDate: parseDate(envio)
    };
  });
}

function populateFilters() {
  setOptions(filters.pesquisador, uniqueValues(fieldRows, "pesquisador"), "Todos");
  setOptions(filters.cidade, uniqueValues(fieldRows, "cidade"), "Todas");
  setOptions(filters.regiao, uniqueValues(fieldRows, "regiao"), "Todas");
  setOptions(filters.statusGps, uniqueValues(fieldRows, "statusGPS"), "Todos");
  setOptions(filters.statusSync, uniqueValues(fieldRows, "statusSincronizacao"), "Todos");
}

function renderFieldReport() {
  const rows = getFilteredRows();
  renderMetrics(rows);
  renderResearcherSummary(rows);
  renderTable(rows);
}

function renderMetrics(rows) {
  const today = new Date();
  const todayKey = toDateInputValue(today);
  const gpsCaptured = rows.filter((row) => normalizeText(row.statusGPS) === "capturado").length;

  setText("fieldTotal", rows.length);
  setText("fieldToday", rows.filter((row) => toDateInputValue(row.inicioDate || row.envioDate) === todayKey).length);
  setText("fieldResearchers", uniqueValues(rows, "pesquisador").length);
  setText("fieldGpsCaptured", gpsCaptured);
  setText("fieldGpsMissing", Math.max(rows.length - gpsCaptured, 0));
}

function renderResearcherSummary(rows) {
  const counts = countBy(rows, "pesquisador");
  const items = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  fieldResearcherSummary.innerHTML = items.length
    ? items.map(([name, total]) => `
      <article class="researcher-card">
        <h3>${escapeHtml(name)}</h3>
        <strong>${total}</strong>
        <small>${total === 1 ? "entrevista" : "entrevistas"}</small>
      </article>
    `).join("")
    : '<p class="muted-text">Nenhuma entrevista encontrada para os filtros selecionados.</p>';
}

function renderTable(rows) {
  fieldTableBody.innerHTML = rows.length
    ? rows.map((row) => `
      <tr>
        <td>${escapeHtml(formatDateTime(row.dataHoraInicio))}</td>
        <td>${escapeHtml(formatDateTime(row.dataHoraEnvio))}</td>
        <td>${escapeHtml(row.pesquisador)}</td>
        <td>${escapeHtml(row.cidade)}</td>
        <td>${escapeHtml(row.regiao)}</td>
        <td>${escapeHtml(row.endereco)}</td>
        <td>${escapeHtml(row.sexo)}</td>
        <td>${escapeHtml(row.faixaEtaria)}</td>
        <td>${escapeHtml(row.latitude)}</td>
        <td>${escapeHtml(row.longitude)}</td>
        <td>${escapeHtml(row.statusGPS)}</td>
        <td>${escapeHtml(row.origem)}</td>
        <td>${escapeHtml(row.statusSincronizacao)}</td>
      </tr>
    `).join("")
    : '<tr><td colspan="13">Nenhuma entrevista encontrada para os filtros selecionados.</td></tr>';
}

function getFilteredRows() {
  const start = filters.dataInicial.value ? new Date(`${filters.dataInicial.value}T00:00:00`) : null;
  const end = filters.dataFinal.value ? new Date(`${filters.dataFinal.value}T23:59:59`) : null;

  return fieldRows.filter((row) => {
    const date = row.inicioDate || row.envioDate;
    return (!filters.pesquisador.value || sameValue(row.pesquisador, filters.pesquisador.value)) &&
      (!filters.cidade.value || sameValue(row.cidade, filters.cidade.value)) &&
      (!filters.regiao.value || sameValue(row.regiao, filters.regiao.value)) &&
      (!filters.statusGps.value || sameValue(row.statusGPS, filters.statusGps.value)) &&
      (!filters.statusSync.value || sameValue(row.statusSincronizacao, filters.statusSync.value)) &&
      (!start || (date && date >= start)) &&
      (!end || (date && date <= end));
  });
}

function exportCsv() {
  const rows = getFilteredRows();
  const headers = [
    "Data/Hora Início",
    "Data/Hora Envio",
    "Pesquisador",
    "Cidade",
    "Região/Bairro",
    "Endereço",
    "Sexo",
    "Faixa Etária",
    "Latitude",
    "Longitude",
    "Status GPS",
    "Origem",
    "Status Sincronização"
  ];
  const body = rows.map((row) => [
    formatDateTime(row.dataHoraInicio),
    formatDateTime(row.dataHoraEnvio),
    row.pesquisador,
    row.cidade,
    row.regiao,
    row.endereco,
    row.sexo,
    row.faixaEtaria,
    row.latitude,
    row.longitude,
    row.statusGPS,
    row.origem,
    row.statusSincronizacao
  ]);

  const csv = [headers, ...body].map((line) => line.map(csvCell).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-campo-dividados-${toDateInputValue(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearFilters() {
  Object.values(filters).forEach((filter) => { filter.value = ""; });
  renderFieldReport();
}

function setOptions(select, values, label) {
  const current = select.value;
  select.innerHTML = `<option value="">${label}</option>` + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if (values.some((value) => sameValue(value, current))) {
    select.value = values.find((value) => sameValue(value, current));
  }
}

function uniqueValues(rows, field) {
  return Object.keys(countBy(rows, field)).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = formatLabel(row[field] || "Não informado");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function showMessage(text, type) {
  if (!text) {
    fieldMessage.hidden = true;
    fieldMessage.textContent = "";
    return;
  }
  fieldMessage.textContent = text;
  fieldMessage.className = `message ${type}`;
  fieldMessage.hidden = false;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = parseDate(value);
  return date ? date.toLocaleString("pt-BR") : "";
}

function toDateInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sameValue(a, b) {
  return normalizeText(a) === normalizeText(b);
}

function formatLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim() || "Não informado";
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
