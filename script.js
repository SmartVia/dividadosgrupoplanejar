const OFFLINE_QUEUE_KEY = "dividados_offline_queue_v1";
const QUESTIONS_CACHE_KEY = "dividados_questions_cache_v3";
const QUOTAS_CACHE_KEY = "dividados_quotas_cache_v1";
const RESEARCHERS_CACHE_KEY = "dividados_researchers_cache_v1";
const REGIONS_CACHE_KEY = "dividados_regions_cache_v1";
const MAX_CLOSED_QUESTIONS = 100;
const MAX_OPEN_QUESTIONS = 20;
const OPTION_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const SCALE_WEIGHTS = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };

const form = document.getElementById("surveyForm");
const messageBox = document.getElementById("message");
const checkQuotaButton = document.getElementById("checkQuotaButton");
const questionsSection = document.getElementById("questionsSection");
const dynamicQuestions = document.getElementById("dynamicQuestions");
const submitButton = document.getElementById("submitButton");
const offlineBox = document.getElementById("offlineBox");
const connectionStatus = document.getElementById("connectionStatus");
const pendingCountText = document.getElementById("pendingCountText");
const syncNowButton = document.getElementById("syncNowButton");
const cidadeInput = document.getElementById("cidade");
const regiaoInput = document.getElementById("regiao");
const pesquisadorInput = document.getElementById("pesquisador");
const pesquisadorOptions = document.getElementById("pesquisadorOptions");
const pesquisadorToggle = document.getElementById("pesquisadorToggle");
const pesquisadorMenu = document.getElementById("pesquisadorMenu");
const sexoSelect = document.getElementById("sexo");
const faixaEtariaSelect = document.getElementById("faixaEtaria");

let quotaIsOpen = false;
let syncInProgress = false;
let questionDefinitions = [];
let pesquisadorSuggestions = [];
let regionDefinitions = [];
let interviewStartAt = new Date().toISOString();
let gpsState = {
  latitude: "",
  longitude: "",
  status: "IndisponÃ­vel"
};

checkQuotaButton.addEventListener("click", handleCheckQuota);
form.addEventListener("submit", submitSurvey);
syncNowButton.addEventListener("click", syncPendingResponses);
window.addEventListener("online", handleConnectionChange);
window.addEventListener("offline", handleConnectionChange);
sexoSelect.addEventListener("change", closeQuestions);
faixaEtariaSelect.addEventListener("change", closeQuestions);
cidadeInput.addEventListener("change", () => {
  populateRegionSelect(cidadeInput.value);
  closeQuestions();
});
regiaoInput.addEventListener("change", closeQuestions);
document.addEventListener("DOMContentLoaded", initializeOfflineMode);

function initializeOfflineMode() {
  registerServiceWorker();
  updateConnectionBox();
  updatePendingCount();
  loadQuotaOptions();
  loadResearcherOptions();
  loadQuestions();
  setupLocationFields();
  setupSuggestionFields();
  loadRegionOptions();
  requestGpsLocation();

  if (navigator.onLine) {
    syncPendingResponses();
  }
}

async function loadResearcherOptions() {
  const cachedResearchers = getCachedResearchers();
  if (cachedResearchers.length) {
    populateResearcherOptions(cachedResearchers);
  }

  if (!navigator.onLine || !isApiConfigured()) return;

  try {
    const response = await getResearchers();
    if (response.ok && response.researchers) {
      cacheResearchers(response.researchers);
      populateResearcherOptions(response.researchers);
    }
  } catch (error) {
    console.warn("Nao foi possivel carregar pesquisadores da planilha. Usando cache/campo livre.", error);
  }
}

function populateResearcherOptions(researchers) {
  if (!pesquisadorOptions) return;

  const activeResearchers = (researchers || [])
    .filter((researcher) => normalizeText(researcher.status || "Ativo") !== "inativo")
    .map((researcher) => researcher.nome || researcher.Nome || "")
    .filter(Boolean);

  pesquisadorSuggestions = uniqueOrderedValues(activeResearchers);
  pesquisadorOptions.innerHTML = pesquisadorSuggestions
    .map((name) => `<option value="${escapeHtml(name)}"></option>`)
    .join("");
  refreshSuggestionMenu(pesquisadorInput, pesquisadorMenu, pesquisadorSuggestions, false);
}

function cacheResearchers(researchers) {
  localStorage.setItem(RESEARCHERS_CACHE_KEY, JSON.stringify(researchers || []));
}

function getCachedResearchers() {
  try {
    return JSON.parse(localStorage.getItem(RESEARCHERS_CACHE_KEY)) || [];
  } catch (error) {
    localStorage.removeItem(RESEARCHERS_CACHE_KEY);
    return [];
  }
}

async function loadQuotaOptions() {
  const cachedQuotas = getCachedQuotas();
  if (cachedQuotas.length) {
    populateQuotaOptions(cachedQuotas);
  }

  if (!navigator.onLine || !isApiConfigured()) return;

  try {
    const response = await getQuotas();
    if (response.ok && response.quotas && response.quotas.length) {
      cacheQuotas(response.quotas);
      populateQuotaOptions(response.quotas);
    }
  } catch (error) {
    console.warn("Nao foi possivel carregar cotas da planilha. Usando opcoes atuais/cache.", error);
  }
}

function populateQuotaOptions(quotas) {
  const currentSexo = sexoSelect.value;
  const currentFaixa = faixaEtariaSelect.value;
  const sexos = uniqueOrderedValues(quotas.map((quota) => quota.sexo));
  const faixas = uniqueOrderedValues(quotas.map((quota) => quota.faixaEtaria));

  if (sexos.length) {
    sexoSelect.innerHTML = '<option value="">Selecione</option>' + sexos
      .map((sexo) => `<option value="${escapeHtml(sexo)}">${escapeHtml(sexo)}</option>`)
      .join("");
    if (sexos.some((sexo) => normalizeText(sexo) === normalizeText(currentSexo))) {
      sexoSelect.value = sexos.find((sexo) => normalizeText(sexo) === normalizeText(currentSexo));
    }
  }

  if (faixas.length) {
    faixaEtariaSelect.innerHTML = '<option value="">Selecione</option>' + faixas
      .map((faixa) => `<option value="${escapeHtml(faixa)}">${escapeHtml(faixa)}</option>`)
      .join("");
    if (faixas.some((faixa) => normalizeText(faixa) === normalizeText(currentFaixa))) {
      faixaEtariaSelect.value = faixas.find((faixa) => normalizeText(faixa) === normalizeText(currentFaixa));
    }
  }
}

function cacheQuotas(quotas) {
  localStorage.setItem(QUOTAS_CACHE_KEY, JSON.stringify(quotas));
}

function getCachedQuotas() {
  try {
    return JSON.parse(localStorage.getItem(QUOTAS_CACHE_KEY)) || [];
  } catch (error) {
    localStorage.removeItem(QUOTAS_CACHE_KEY);
    return [];
  }
}

function uniqueOrderedValues(values) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = normalizeText(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("sw.js").catch((error) => {
    console.warn("Nao foi possivel registrar o service worker:", error);
  });
}

function handleConnectionChange() {
  updateConnectionBox();

  if (navigator.onLine) {
    showMessage("Conexao restabelecida. Tentando sincronizar pesquisas pendentes.", "info");
    syncPendingResponses();
  }
}

function updateConnectionBox() {
  if (navigator.onLine) {
    offlineBox.classList.remove("is-offline");
    offlineBox.classList.add("is-online");
    connectionStatus.textContent = "Online â€” enviando em tempo real";
  } else {
    offlineBox.classList.remove("is-online");
    offlineBox.classList.add("is-offline");
    connectionStatus.textContent = "Offline â€” respostas serÃ£o salvas neste aparelho";
  }
}

function updatePendingCount() {
  const total = getPendingQueue().length;
  pendingCountText.textContent = `${total} ${total === 1 ? "pesquisa pendente" : "pesquisas pendentes"} de sincronizaÃ§Ã£o`;
  syncNowButton.disabled = total === 0 || syncInProgress;
}

function showMessage(text, type) {
  messageBox.textContent = text;
  messageBox.className = `message ${type}`;
  messageBox.hidden = false;
}

function clearMessage() {
  messageBox.hidden = true;
  messageBox.textContent = "";
}

function closeQuestions() {
  quotaIsOpen = false;
  questionsSection.classList.add("hidden");
}

function startInterviewAudit() {
  interviewStartAt = new Date().toISOString();
  if (!gpsState.latitude && gpsState.status !== "Negado pelo usuÃ¡rio") {
    requestGpsLocation();
  }
}

async function loadQuestions() {
  const cachedQuestions = getCachedQuestions();

  if (cachedQuestions.length) {
    questionDefinitions = normalizeQuestions(cachedQuestions);
    safeRenderQuestions(questionDefinitions);
  }

  if (!navigator.onLine || !isApiConfigured()) {
    if (!questionDefinitions.length) {
      questionDefinitions = getFallbackQuestions();
      safeRenderQuestions(questionDefinitions);
    }
    return;
  }

  try {
    const response = await getQuestions();
    if (response.ok && response.questions && response.questions.length) {
      questionDefinitions = normalizeQuestions(response.questions);
      cacheQuestions(questionDefinitions);
      safeRenderQuestions(questionDefinitions);
    } else if (!questionDefinitions.length) {
      questionDefinitions = getFallbackQuestions();
      safeRenderQuestions(questionDefinitions);
    }
  } catch (error) {
    console.warn("Nao foi possivel carregar perguntas da planilha. Usando cache/fallback.", error);
    if (!questionDefinitions.length) {
      questionDefinitions = getFallbackQuestions();
      safeRenderQuestions(questionDefinitions);
    }
  }
}

function safeRenderQuestions(questions) {
  try {
    renderQuestions(normalizeQuestions(questions));
  } catch (error) {
    console.error("Erro ao renderizar perguntas:", error);
    localStorage.removeItem(QUESTIONS_CACHE_KEY);
    localStorage.removeItem("dividados_questions_cache_v1");
    questionDefinitions = getFallbackQuestions();
    renderQuestions(normalizeQuestions(questionDefinitions));
    showMessage("Nao foi possivel carregar as perguntas salvas neste aparelho. Atualizei o cache e carreguei um modelo temporario.", "info");
  }
}

function normalizeQuestions(questions) {
  return questions
    .filter((question) => normalizeText(question.ativa || question.Ativa || "Sim") !== "nao")
    .sort((a, b) => Number(a.ordem || 99) - Number(b.ordem || 99))
    .map((question, index) => {
      const type = normalizeQuestionType(question.tipo || question.Tipo || "Fechada");
      const id = normalizeQuestionId(question.id || question.ID || question.codigo || question.Codigo || `P${index + 1}`, type, index);
      const alternatives = getQuestionAlternatives(question, type);

      return {
        id,
        grupo: question.grupo || question.Grupo || "Geral",
        contexto: question.contexto || question.Contexto || "",
        pergunta: question.pergunta || question.Pergunta || "",
        tipo: type,
        alternatives,
        a: alternatives.A || "",
        b: alternatives.B || "",
        c: alternatives.C || "",
        d: alternatives.D || "",
        e: alternatives.E || "",
        f: alternatives.F || "",
        g: alternatives.G || "",
        h: alternatives.H || "",
        i: alternatives.I || "",
        j: alternatives.J || "",
        ordem: Number(question.ordem || question.Ordem || index + 1)
      };
    });
}

function normalizeQuestionId(id, type, index) {
  const value = String(id || "").trim();
  const normalized = normalizeText(value);

  if (normalized === "aberta" || normalized === "fechada") {
    return type === "abertatexto" ? `p${index + 1}` : `p${index + 1}`;
  }

  return value.toLowerCase();
}

function renderQuestions(questions) {
  const normalizedQuestions = normalizeQuestions(questions);
  const activeQuestions = normalizedQuestions
    .filter((question) => normalizeQuestionType(question.tipo) !== "abertatexto" || getOpenQuestionCount(normalizedQuestions, question) <= MAX_OPEN_QUESTIONS)
    .slice(0, MAX_CLOSED_QUESTIONS + MAX_OPEN_QUESTIONS);
  let lastContext = "";

  dynamicQuestions.innerHTML = activeQuestions.map((question, index) => {
    const type = normalizeQuestionType(question.tipo);
    const questionCode = String(question.id || `p${index + 1}`).toLowerCase();
    const fieldName = `q_${questionCode.replace(/[^a-z0-9]/g, "_")}`;
    const questionMeta = encodeURIComponent(JSON.stringify({
      id: question.id || `p${index + 1}`,
      campo: String(question.id || `P${index + 1}`).toUpperCase(),
      pergunta: question.pergunta || `Pergunta ${index + 1}`,
      contexto: question.contexto || "",
      grupo: question.grupo || "Geral",
      tipo: question.tipo,
      ordem: question.ordem || index + 1
    }));
    const contextHtml = question.contexto && normalizeText(question.contexto) !== normalizeText(lastContext)
      ? `<div class="question-context"><strong>Contexto</strong><p>${escapeHtml(question.contexto)}</p></div>`
      : "";

    lastContext = question.contexto || lastContext;

    if (type === "abertatexto") {
      return `
        ${contextHtml}
        <label class="open-text-question" data-open-question-meta="${questionMeta}" data-field-name="${fieldName}">
          <span>${index + 1}. ${escapeHtml(question.pergunta || `Pergunta aberta ${index + 1}`)}</span>
          <textarea name="${fieldName}" rows="5" placeholder="Escreva a resposta do entrevistado"></textarea>
        </label>
      `;
    }

    const options = OPTION_KEYS
      .filter((key) => question.alternatives[key])
      .map((key, optionIndex) => `
        <label>
          <input type="radio" name="${fieldName}" value="${key}" data-option-text="${escapeHtml(question.alternatives[key])}" ${optionIndex === 0 ? "required" : ""}>
          ${key}) ${escapeHtml(question.alternatives[key])}${type === "escala" && SCALE_WEIGHTS[key] ? ` <small>Peso ${SCALE_WEIGHTS[key]}</small>` : ""}
        </label>
      `)
      .join("");
    const hasOtherOption = OPTION_KEYS.some((key) => isOtherOption(question.alternatives[key]));

    return `
      ${contextHtml}
      <fieldset data-question-meta="${questionMeta}" data-field-name="${fieldName}">
        <legend>${index + 1}. ${escapeHtml(question.pergunta || `Pergunta ${index + 1}`)}</legend>
        <div class="${type === "escala" ? "scale-options" : ""}">
          ${options || '<p class="muted-text">Cadastre alternativas na aba Perguntas.</p>'}
        </div>
        ${type === "semifechada" && hasOtherOption ? `
          <label class="other-answer-field hidden" data-other-for="${fieldName}">
            Descreva a alternativa Outra
            <textarea name="${fieldName}_outra" rows="3" placeholder="Digite a resposta complementar"></textarea>
          </label>
        ` : ""}
      </fieldset>
    `;
  }).join("") || '<p class="muted-text">Nenhuma pergunta ativa encontrada na aba Perguntas.</p>';

  setupSemiClosedOtherFields();
}

function getFallbackQuestions() {
  return [
    { id: "p1", grupo: "Opiniao publica", contexto: "", pergunta: "Qual area deve receber mais atencao?", tipo: "Fechada", alternatives: { A: "Saude", B: "Educacao", C: "Seguranca", D: "Transporte" }, ordem: 1 },
    { id: "p2", grupo: "Avaliacao", contexto: "Avalie os servicos publicos da sua regiao.", pergunta: "Saude", tipo: "Escala", alternatives: getDefaultScaleAlternatives(), ordem: 2 },
    { id: "p3", grupo: "Qualitativo", contexto: "", pergunta: "O que precisa melhorar na cidade?", tipo: "AbertaTexto", alternatives: {}, ordem: 3 }
  ];
}

function cacheQuestions(questions) {
  localStorage.setItem(QUESTIONS_CACHE_KEY, JSON.stringify(normalizeQuestions(questions)));
  localStorage.removeItem("dividados_questions_cache_v1");
}

function getCachedQuestions() {
  try {
    return JSON.parse(localStorage.getItem(QUESTIONS_CACHE_KEY)) || [];
  } catch (error) {
    localStorage.removeItem(QUESTIONS_CACHE_KEY);
    return [];
  }
}

function getProfileData() {
  pesquisadorInput.value = formatPersonName(pesquisadorInput.value);

  return {
    pesquisador: pesquisadorInput.value.trim(),
    cidade: cidadeInput.value.trim(),
    regiao: regiaoInput.value.trim(),
    endereco: document.getElementById("endereco").value.trim(),
    numero: document.getElementById("numero").value.trim(),
    sexo: document.getElementById("sexo").value,
    faixaEtaria: document.getElementById("faixaEtaria").value
  };
}

function validateProfile(profile) {
  if (!profile.pesquisador || !profile.cidade || !profile.regiao || !profile.endereco || !profile.numero || !profile.sexo || !profile.faixaEtaria) {
    showMessage("Preencha todos os dados do perfil antes de verificar a cota.", "error");
    return false;
  }

  return true;
}

async function handleCheckQuota() {
  clearMessage();

  const profile = getProfileData();
  if (!validateProfile(profile)) return;

  if (!navigator.onLine) {
    quotaIsOpen = true;
    startInterviewAudit();
    questionsSection.classList.remove("hidden");
    showMessage("Sem internet. A verificaÃ§Ã£o de cota nÃ£o estÃ¡ disponÃ­vel agora, mas vocÃª pode continuar a pesquisa. A resposta serÃ¡ sincronizada depois.", "info");
    return;
  }

  if (!isApiConfigured()) {
    showMessage("Configure a URL da API no arquivo api-client.js antes de usar o formulario.", "error");
    return;
  }

  checkQuotaButton.disabled = true;
  checkQuotaButton.textContent = "Verificando...";
  showMessage("Verificando...", "info");

  try {
    const response = await checkQuota({
      sexo: profile.sexo,
      faixaEtaria: profile.faixaEtaria
    });

    if (response.ok && response.open) {
      quotaIsOpen = true;
      startInterviewAudit();
      questionsSection.classList.remove("hidden");
      showMessage(`Cota aberta. Restam ${response.restante} entrevista(s) para este perfil.`, "success");
      return;
    }

    closeQuestions();
    showMessage(response.message || "Cota encerrada para este perfil. Procure outro entrevistado.", "error");
  } catch (error) {
    closeQuestions();
    console.error("Erro ao verificar cota:", error);
    showMessage(`Erro ao verificar cota: ${error.message}`, "error");
  } finally {
    checkQuotaButton.disabled = false;
    checkQuotaButton.textContent = "Verificar cota";
  }
}

async function submitSurvey(event) {
  event.preventDefault();
  clearMessage();

  if (!quotaIsOpen && navigator.onLine) {
    showMessage("Verifique uma cota aberta antes de enviar.", "error");
    return;
  }

  const payload = buildSurveyPayload(navigator.onLine ? "Online" : "Offline");

  submitButton.disabled = true;
  submitButton.textContent = navigator.onLine ? "Enviando..." : "Salvando...";

  if (!navigator.onLine) {
    saveOfflineResponse(payload);
    finishOfflineSave();
    return;
  }

  try {
    const response = await submitResponse(compactSubmitPayload(payload));

    if (response.ok) {
      showMessage("Entrevista salva com sucesso.", "success");
      resetFormAfterSave();
    } else if (response.error === "quota_closed") {
      closeQuestions();
      showMessage("Cota encerrada para este perfil. Procure outro entrevistado.", "error");
    } else {
      showMessage(response.message || "Nao foi possivel salvar a entrevista.", "error");
    }
  } catch (error) {
    console.error("Falha no envio online. Salvando offline:", error);
    payload.origem = "Offline";
    payload.statusSincronizacao = "Pendente";
    saveOfflineResponse(payload);
    showMessage("Sem conexÃ£o com a API. A pesquisa foi salva neste aparelho e serÃ¡ sincronizada depois.", "info");
    resetFormAfterSave();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Enviar";
    updatePendingCount();
  }
}

function buildSurveyPayload(origin) {
  const formData = new FormData(form);
  const uniqueId = createUniqueId();
  const questionAnswers = collectQuestionAnswers(formData);
  const firstOpenAnswer = questionAnswers.find((answer) => normalizeQuestionType(answer.tipo) === "abertatexto" && answer.resposta);
  const now = new Date().toISOString();

  return {
    uniqueId,
    dataHora: now,
    dataHoraInicio: interviewStartAt || now,
    dataHoraEnvio: origin === "Online" ? now : "",
    pesquisador: formatPersonName(formData.get("pesquisador")),
    cidade: formData.get("cidade"),
    regiao: formData.get("regiao"),
    endereco: formData.get("endereco").trim(),
    numero: formData.get("numero").trim(),
    sexo: formData.get("sexo"),
    faixaEtaria: formData.get("faixaEtaria"),
    latitude: gpsState.latitude || "",
    longitude: gpsState.longitude || "",
    statusGPS: gpsState.status || "IndisponÃ­vel",
    respostas: questionAnswers,
    respostaAberta: firstOpenAnswer ? firstOpenAnswer.resposta : "",
    origem: origin,
    statusSincronizacao: origin === "Offline" ? "Pendente" : "Sincronizada"
  };
}

function compactSubmitPayload(payload) {
  return {
    uniqueId: payload.uniqueId,
    dataHora: payload.dataHora,
    dataHoraInicio: payload.dataHoraInicio,
    dataHoraEnvio: payload.dataHoraEnvio || new Date().toISOString(),
    pesquisador: payload.pesquisador,
    cidade: payload.cidade,
    regiao: payload.regiao,
    endereco: payload.endereco,
    numero: payload.numero,
    sexo: payload.sexo,
    faixaEtaria: payload.faixaEtaria,
    latitude: payload.latitude || "",
    longitude: payload.longitude || "",
    statusGPS: payload.statusGPS || "IndisponÃ­vel",
    respostas: (payload.respostas || []).map((answer) => ({
      campo: answer.campo,
      id: answer.id,
      tipo: answer.tipo,
      resposta: answer.resposta,
      respostaTexto: answer.respostaTexto || "",
      peso: answer.peso || ""
    })),
    respostaAberta: payload.respostaAberta || "",
    origem: payload.origem,
    statusSincronizacao: payload.statusSincronizacao
  };
}

function setupLocationFields() {
  pesquisadorInput.addEventListener("blur", () => {
    pesquisadorInput.value = formatPersonName(pesquisadorInput.value);
  });
}

async function loadRegionOptions() {
  const cachedRegions = getCachedRegions();
  if (cachedRegions.length) {
    regionDefinitions = normalizeRegions(cachedRegions);
    populateCitySelect();
  }

  if (!navigator.onLine || !isApiConfigured()) {
    if (!regionDefinitions.length) {
      populateEmptyRegionState();
    }
    return;
  }

  try {
    const response = await getRegions();
    if (response.ok && response.regions && response.regions.length) {
      regionDefinitions = normalizeRegions(response.regions);
      cacheRegions(regionDefinitions);
      populateCitySelect();
    } else if (!regionDefinitions.length) {
      populateEmptyRegionState();
    }
  } catch (error) {
    console.warn("Nao foi possivel carregar regioes da planilha. Usando cache local.", error);
    if (!regionDefinitions.length) populateEmptyRegionState();
  }
}

function normalizeRegions(regions) {
  return (regions || [])
    .map((item, index) => ({
      cidade: formatPlaceName(item.cidade || item.Cidade || ""),
      regiao: formatPlaceName(item.regiao || item.Regiao || ""),
      ativa: item.ativa || item.Ativa || "Sim",
      ordem: Number(item.ordem || item.Ordem || index + 1) || index + 1
    }))
    .filter((item) => item.cidade && item.regiao && normalizeText(item.ativa) !== "nao")
    .sort((a, b) => {
      const cityCompare = a.cidade.localeCompare(b.cidade, "pt-BR");
      if (cityCompare !== 0) return cityCompare;
      return a.ordem - b.ordem;
    });
}

function cacheRegions(regions) {
  localStorage.setItem(REGIONS_CACHE_KEY, JSON.stringify(regions || []));
}

function getCachedRegions() {
  try {
    return JSON.parse(localStorage.getItem(REGIONS_CACHE_KEY)) || [];
  } catch (error) {
    localStorage.removeItem(REGIONS_CACHE_KEY);
    return [];
  }
}

function populateCitySelect() {
  const currentCity = cidadeInput.value;
  const cities = uniqueOrderedValues(regionDefinitions.map((item) => item.cidade));
  cidadeInput.innerHTML = '<option value="">Selecione a cidade</option>' + cities
    .map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`)
    .join("");

  if (cities.some((city) => normalizeText(city) === normalizeText(currentCity))) {
    cidadeInput.value = cities.find((city) => normalizeText(city) === normalizeText(currentCity));
  }

  populateRegionSelect(cidadeInput.value);
}

function populateRegionSelect(city) {
  const currentRegion = regiaoInput.value;
  const regions = regionDefinitions
    .filter((item) => normalizeText(item.cidade) === normalizeText(city))
    .sort((a, b) => a.ordem - b.ordem)
    .slice(0, 20)
    .map((item) => item.regiao);

  regiaoInput.disabled = !city || !regions.length;
  regiaoInput.innerHTML = !city
    ? '<option value="">Selecione a cidade primeiro</option>'
    : '<option value="">Selecione a região</option>' + regions
      .map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`)
      .join("");

  if (regions.some((region) => normalizeText(region) === normalizeText(currentRegion))) {
    regiaoInput.value = regions.find((region) => normalizeText(region) === normalizeText(currentRegion));
  }
}

function populateEmptyRegionState() {
  cidadeInput.innerHTML = '<option value="">Cadastre cidades na aba Regioes</option>';
  regiaoInput.innerHTML = '<option value="">Cadastre regiões na aba Regioes</option>';
  regiaoInput.disabled = true;
}

function setupSuggestionFields() {
  setupSuggestionField({
    input: pesquisadorInput,
    button: pesquisadorToggle,
    menu: pesquisadorMenu,
    getOptions: () => pesquisadorSuggestions,
    onSelect: formatPersonName,
    maxVisible: 80
  });
}

function setupSuggestionField(config) {
  const { input, button, menu } = config;
  if (!input || !button || !menu) return;

  button.addEventListener("click", () => {
    const shouldOpen = menu.classList.contains("hidden");
    closeSuggestionMenus();
    refreshSuggestionMenu(input, menu, config.getOptions(), shouldOpen, config);
    if (shouldOpen) input.focus();
  });

  input.addEventListener("input", () => {
    refreshSuggestionMenu(input, menu, config.getOptions(), !menu.classList.contains("hidden"), config);
  });

  input.addEventListener("focus", () => {
    if (!menu.classList.contains("hidden")) {
      refreshSuggestionMenu(input, menu, config.getOptions(), true, config);
    }
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSuggestionMenus();
  });
}

document.addEventListener("click", (event) => {
  if (event.target.closest(".combo-field")) return;
  closeSuggestionMenus();
});

function refreshSuggestionMenu(input, menu, options, shouldShow, config = {}) {
  if (!input || !menu) return;

  const query = normalizeText(input.value);
  const maxVisible = config.maxVisible || 80;
  const filtered = (options || [])
    .filter((option) => !query || normalizeText(option).includes(query))
    .slice(0, maxVisible);

  if (!shouldShow) {
    menu.classList.add("hidden");
    return;
  }

  menu.innerHTML = filtered.length
    ? filtered.map((option) => `<button type="button" class="combo-option" data-value="${escapeHtml(option)}">${escapeHtml(option)}</button>`).join("")
    : '<div class="combo-empty">Nenhuma opÃ§Ã£o encontrada. Pode digitar normalmente.</div>';

  menu.querySelectorAll(".combo-option").forEach((item) => {
    item.addEventListener("click", () => {
      const value = item.dataset.value || "";
      input.value = config.onSelect ? config.onSelect(value) : value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      closeSuggestionMenus();
      input.focus();
    });
  });

  menu.classList.remove("hidden");
}

function closeSuggestionMenus() {
  [pesquisadorMenu].forEach((menu) => {
    if (menu) menu.classList.add("hidden");
  });
}

function formatPlaceName(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

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

function formatPersonName(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

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

function collectQuestionAnswers(formData) {
  const closedAnswers = Array.from(dynamicQuestions.querySelectorAll("fieldset[data-question-meta]")).map((fieldset, index) => {
    let meta = {};

    try {
      meta = JSON.parse(decodeURIComponent(fieldset.dataset.questionMeta || "{}"));
    } catch (error) {
      meta = {};
    }

    const fieldName = fieldset.dataset.fieldName || `p${index + 1}`;
    const selected = fieldset.querySelector(`input[name="${cssEscape(fieldName)}"]:checked`);
    const selectedText = selected ? selected.dataset.optionText || "" : "";
    const otherText = String(formData.get(`${fieldName}_outra`) || "").trim();

    return {
      campo: String(meta.campo || meta.id || fieldName).toUpperCase(),
      id: meta.id || fieldName,
      pergunta: meta.pergunta || "",
      contexto: meta.contexto || "",
      grupo: meta.grupo || "Geral",
      tipo: meta.tipo || "Fechada",
      peso: SCALE_WEIGHTS[String(formData.get(fieldName) || "").toUpperCase()] || "",
      resposta: formData.get(fieldName) || "",
      respostaTexto: isOtherOption(selectedText) ? otherText : ""
    };
  });

  const openAnswers = Array.from(dynamicQuestions.querySelectorAll("[data-open-question-meta]")).map((label, index) => {
    let meta = {};

    try {
      meta = JSON.parse(decodeURIComponent(label.dataset.openQuestionMeta || "{}"));
    } catch (error) {
      meta = {};
    }

    const fieldName = label.dataset.fieldName || `ra${index + 1}`;

    return {
      campo: String(meta.campo || meta.id || `RA${index + 1}`).toUpperCase(),
      id: meta.id || `ra${index + 1}`,
      pergunta: meta.pergunta || "",
      contexto: meta.contexto || "",
      grupo: meta.grupo || "Geral",
      tipo: meta.tipo || "AbertaTexto",
      resposta: String(formData.get(fieldName) || "").trim()
    };
  });

  return [...closedAnswers, ...openAnswers];
}

function normalizeQuestionType(type) {
  const normalized = normalizeText(type);
  if (normalized === "escala") return "escala";
  if (normalized === "semifechada" || normalized === "semi fechada" || normalized === "semi-fechada") return "semifechada";
  if (normalized === "abertatexto" || normalized === "aberta" || normalized === "texto") return "abertatexto";
  return "fechada";
}

function setupSemiClosedOtherFields() {
  dynamicQuestions.querySelectorAll("fieldset[data-question-meta]").forEach((fieldset) => {
    const fieldName = fieldset.dataset.fieldName;
    const otherField = fieldset.querySelector(`[data-other-for="${fieldName}"]`);
    if (!otherField) return;

    const textarea = otherField.querySelector("textarea");
    const radios = fieldset.querySelectorAll(`input[name="${cssEscape(fieldName)}"]`);

    const updateOtherField = () => {
      const selected = fieldset.querySelector(`input[name="${cssEscape(fieldName)}"]:checked`);
      const shouldShow = selected && isOtherOption(selected.dataset.optionText);
      otherField.classList.toggle("hidden", !shouldShow);
      textarea.required = Boolean(shouldShow);
      if (!shouldShow) textarea.value = "";
    };

    radios.forEach((radio) => radio.addEventListener("change", updateOtherField));
    updateOtherField();
  });
}

function isOtherOption(value) {
  const normalized = normalizeText(value).replace(/\./g, "").replace(/\s+/g, " ").trim();
  return normalized === "outra" || normalized === "outro";
}

function isNtoOption(value) {
  const normalized = normalizeText(value).replace(/\./g, "").replace(/\s+/g, "").trim();
  return normalized === "nto" || normalized === "naotemopiniao";
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function getQuestionAlternatives(question, type) {
  const alternatives = {};

  if (question.alternatives && typeof question.alternatives === "object") {
    OPTION_KEYS.forEach((key) => {
      if (question.alternatives[key]) alternatives[key] = String(question.alternatives[key]).trim();
    });
  }

  OPTION_KEYS.forEach((key) => {
    const value = question[key.toLowerCase()] || question[key] || "";
    if (value && !alternatives[key]) alternatives[key] = String(value).trim();
  });

  if (type === "escala" && !Object.keys(alternatives).length) {
    return getDefaultScaleAlternatives();
  }

  return alternatives;
}

function getDefaultScaleAlternatives() {
  return {
    A: "Otimo",
    B: "Bom",
    C: "Regular",
    D: "Ruim",
    E: "Pessimo",
    F: "N.T.O"
  };
}

function getOpenQuestionCount(questions, targetQuestion) {
  return questions
    .filter((question) => normalizeQuestionType(question.tipo) === "abertatexto")
    .filter((question) => Number(question.ordem || 999) <= Number(targetQuestion.ordem || 999))
    .length;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function finishOfflineSave() {
  showMessage("Pesquisa salva neste aparelho. Ela serÃ¡ enviada automaticamente quando a internet voltar.", "success");
  resetFormAfterSave();
  submitButton.disabled = false;
  submitButton.textContent = "Enviar";
  updatePendingCount();
}

function resetFormAfterSave() {
  form.reset();
  populateRegionSelect("");
  interviewStartAt = new Date().toISOString();
  closeQuestions();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function requestGpsLocation() {
  if (!("geolocation" in navigator)) {
    gpsState = { latitude: "", longitude: "", status: "IndisponÃ­vel" };
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      gpsState = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        status: "Capturado"
      };
    },
    (error) => {
      gpsState = {
        latitude: "",
        longitude: "",
        status: error && error.code === error.PERMISSION_DENIED ? "Negado pelo usuÃ¡rio" : "IndisponÃ­vel"
      };
    },
    {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 300000
    }
  );
}

function createUniqueId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `dividados-${Date.now()}-${randomPart}`;
}

function getPendingQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)) || [];
  } catch (error) {
    console.error("Fila offline corrompida. Reiniciando fila.", error);
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
    return [];
  }
}

function savePendingQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function saveOfflineResponse(payload) {
  const queue = getPendingQueue();
  queue.push({
    uniqueId: payload.uniqueId,
    dataHora: payload.dataHora,
    status: "pendente",
    payload
  });
  savePendingQueue(queue);
  updatePendingCount();
}

async function syncPendingResponses() {
  if (syncInProgress || !navigator.onLine || !isApiConfigured()) return;

  let queue = getPendingQueue();
  if (!queue.length) {
    updatePendingCount();
    return;
  }

  syncInProgress = true;
  syncNowButton.disabled = true;
  syncNowButton.textContent = "Sincronizando...";

  const stillPending = [];

  for (const item of queue) {
    try {
      const payload = {
        ...item.payload,
        dataHoraEnvio: new Date().toISOString(),
        origem: "Offline",
        statusSincronizacao: "Sincronizada"
      };
      const response = await submitResponse(compactSubmitPayload(payload));

      if (!response.ok) {
        stillPending.push(item);
      }
    } catch (error) {
      console.error("Falha ao sincronizar pesquisa pendente:", item.uniqueId, error);
      stillPending.push(item);
    }
  }

  savePendingQueue(stillPending);
  syncInProgress = false;
  syncNowButton.textContent = "Sincronizar agora";
  updatePendingCount();

  if (stillPending.length) {
    showMessage(`${stillPending.length} pesquisa(s) ainda pendente(s). O sistema tentarÃ¡ novamente depois.`, "info");
  } else {
    showMessage("Todas as pesquisas pendentes foram sincronizadas.", "success");
  }
}


