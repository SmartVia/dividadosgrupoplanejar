// Cole somente a URL publicada do seu Google Apps Script entre as aspas.
// Esta URL precisa ser a URL do App da Web publicado no Apps Script.
const API_URL = "https://script.google.com/macros/s/AKfycby1iZyydOBfSrNpKPx0HulX3gT-KhfUEaOxxcfCq6JaUyB2UF43dAVtKd9hNxSGOoD7/exec";

const OFFLINE_QUEUE_KEY = "dividados_offline_queue_v1";
const MAX_CLOSED_QUESTIONS = 100;
const CITY_CACHE_KEY = "dividados_mg_cities_v1";
const MG_CITIES_API_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/MG/municipios";
const MG_CITIES_FALLBACK = [
  "Belo Horizonte",
  "Betim",
  "Contagem",
  "Divinópolis",
  "Governador Valadares",
  "Itaúna",
  "Juiz de Fora",
  "Montes Claros",
  "Nova Lima",
  "Sete Lagoas",
  "Uberaba",
  "Uberlândia"
];

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
const cidadeOptions = document.getElementById("cidadeOptions");

let quotaIsOpen = false;
let syncInProgress = false;
let questionDefinitions = [];

checkQuotaButton.addEventListener("click", checkQuota);
form.addEventListener("submit", submitSurvey);
syncNowButton.addEventListener("click", syncPendingResponses);
window.addEventListener("online", handleConnectionChange);
window.addEventListener("offline", handleConnectionChange);
document.getElementById("sexo").addEventListener("change", closeQuestions);
document.getElementById("faixaEtaria").addEventListener("change", closeQuestions);
document.addEventListener("DOMContentLoaded", initializeOfflineMode);

function initializeOfflineMode() {
  registerServiceWorker();
  updateConnectionBox();
  updatePendingCount();
  loadQuestions();
  setupLocationFields();
  loadCityOptions();

  if (navigator.onLine) {
    syncPendingResponses();
  }
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
    connectionStatus.textContent = "Online — enviando em tempo real";
  } else {
    offlineBox.classList.remove("is-online");
    offlineBox.classList.add("is-offline");
    connectionStatus.textContent = "Offline — respostas serão salvas neste aparelho";
  }
}

function updatePendingCount() {
  const total = getPendingQueue().length;
  pendingCountText.textContent = `${total} ${total === 1 ? "pesquisa pendente" : "pesquisas pendentes"} de sincronização`;
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

async function loadQuestions() {
  const cachedQuestions = getCachedQuestions();

  if (cachedQuestions.length) {
    questionDefinitions = cachedQuestions;
    renderQuestions(questionDefinitions);
  }

  if (!navigator.onLine || !API_URL) {
    if (!questionDefinitions.length) {
      questionDefinitions = getFallbackQuestions();
      renderQuestions(questionDefinitions);
    }
    return;
  }

  try {
    const response = await apiRequest("getQuestions", {});
    if (response.ok && response.questions && response.questions.length) {
      questionDefinitions = normalizeQuestions(response.questions);
      cacheQuestions(questionDefinitions);
      renderQuestions(questionDefinitions);
    } else if (!questionDefinitions.length) {
      questionDefinitions = getFallbackQuestions();
      renderQuestions(questionDefinitions);
    }
  } catch (error) {
    console.warn("Nao foi possivel carregar perguntas da planilha. Usando cache/fallback.", error);
    if (!questionDefinitions.length) {
      questionDefinitions = getFallbackQuestions();
      renderQuestions(questionDefinitions);
    }
  }
}

function normalizeQuestions(questions) {
  return questions
    .filter((question) => normalizeText(question.ativa || question.Ativa || "Sim") !== "nao")
    .sort((a, b) => Number(a.ordem || 99) - Number(b.ordem || 99))
    .map((question, index) => ({
      id: normalizeQuestionId(question.id || question.ID || question.codigo || question.Codigo || `P${index + 1}`, question.tipo || question.Tipo, index),
      pergunta: question.pergunta || question.Pergunta || "",
      tipo: question.tipo || question.Tipo || "Fechada",
      a: question.a || question.A || "Alternativa A",
      b: question.b || question.B || "Alternativa B",
      c: question.c || question.C || "Alternativa C",
      d: question.d || question.D || "Alternativa D",
      ordem: Number(question.ordem || question.Ordem || index + 1)
    }));
}

function normalizeQuestionId(id, type, index) {
  const value = String(id || "").trim();
  const normalized = normalizeText(value);
  const normalizedType = normalizeText(type);

  if (normalized === "aberta" || normalized === "fechada") {
    return normalizedType === "aberta" ? `ra${index + 1}` : `p${index + 1}`;
  }

  return value.toLowerCase();
}

function renderQuestions(questions) {
  const closedQuestions = questions
    .filter((question) => normalizeText(question.tipo) !== "aberta")
    .slice(0, MAX_CLOSED_QUESTIONS);
  const openQuestions = questions.filter((question) => normalizeText(question.tipo) === "aberta").slice(0, 20);

  dynamicQuestions.innerHTML = closedQuestions.map((question, index) => {
    const questionCode = String(question.id || `p${index + 1}`).toLowerCase();
    const fieldName = `q_${questionCode.replace(/[^a-z0-9]/g, "_")}`;
    const questionMeta = encodeURIComponent(JSON.stringify({
      id: question.id || `p${index + 1}`,
      campo: String(question.id || `P${index + 1}`).toUpperCase(),
      pergunta: question.pergunta || `Pergunta ${index + 1}`,
      tipo: "Fechada",
      ordem: question.ordem || index + 1
    }));
    return `
      <fieldset data-question-meta="${questionMeta}" data-field-name="${fieldName}">
        <legend>${index + 1}. ${escapeHtml(question.pergunta || `Pergunta ${index + 1}`)}</legend>
        <label><input type="radio" name="${fieldName}" value="A" required> A) ${escapeHtml(question.a)}</label>
        <label><input type="radio" name="${fieldName}" value="B"> B) ${escapeHtml(question.b)}</label>
        <label><input type="radio" name="${fieldName}" value="C"> C) ${escapeHtml(question.c)}</label>
        <label><input type="radio" name="${fieldName}" value="D"> D) ${escapeHtml(question.d)}</label>
      </fieldset>
    `;
  }).join("");

  const openQuestionsHtml = openQuestions.map((question, index) => {
    const questionCode = String(question.id || `ra${index + 1}`).toLowerCase();
    const fieldName = `q_${questionCode.replace(/[^a-z0-9]/g, "_")}`;
    const questionMeta = encodeURIComponent(JSON.stringify({
      id: question.id || `ra${index + 1}`,
      campo: String(question.id || `RA${index + 1}`).toUpperCase(),
      pergunta: question.pergunta || `Pergunta aberta ${index + 1}`,
      tipo: "Aberta",
      ordem: question.ordem || index + 1
    }));

    return `
      <label data-open-question-meta="${questionMeta}" data-field-name="${fieldName}">
        ${escapeHtml(question.pergunta || `Pergunta aberta ${index + 1}`)}
        <textarea name="${fieldName}" rows="5" placeholder="Escreva a resposta do entrevistado"></textarea>
      </label>
    `;
  }).join("");

  dynamicQuestions.insertAdjacentHTML("beforeend", openQuestionsHtml || `
    <label data-open-question-meta="${encodeURIComponent(JSON.stringify({ id: "ra1", campo: "RA1", pergunta: "Pergunta aberta final", tipo: "Aberta", ordem: 999 }))}" data-field-name="q_ra1">
      Pergunta aberta final
      <textarea name="q_ra1" rows="5" placeholder="Escreva a resposta do entrevistado"></textarea>
    </label>
  `);
}

function getFallbackQuestions() {
  return [
    { id: "p1", pergunta: "Como voce avalia os servicos publicos da sua regiao?", tipo: "Fechada", a: "Muito bons", b: "Bons", c: "Regulares", d: "Ruins", ordem: 1 },
    { id: "p2", pergunta: "Qual area deve receber mais atencao?", tipo: "Fechada", a: "Saude", b: "Educacao", c: "Seguranca", d: "Transporte", ordem: 2 },
    { id: "p3", pergunta: "Com que frequencia voce acompanha noticias locais?", tipo: "Fechada", a: "Todos os dias", b: "Algumas vezes por semana", c: "Raramente", d: "Nunca", ordem: 3 },
    { id: "p4", pergunta: "Qual canal voce mais usa para se informar?", tipo: "Fechada", a: "Televisao", b: "Radio", c: "Redes sociais", d: "Sites de noticias", ordem: 4 },
    { id: "p5", pergunta: "Voce pretende participar mais das decisoes da sua comunidade?", tipo: "Fechada", a: "Sim, com certeza", b: "Talvez", c: "Pouco provavel", d: "Nao", ordem: 5 },
    { id: "aberta", pergunta: "Pergunta aberta final", tipo: "Aberta", ordem: 6 }
  ];
}

function cacheQuestions(questions) {
  localStorage.setItem("dividados_questions_cache_v1", JSON.stringify(questions));
}

function getCachedQuestions() {
  try {
    return JSON.parse(localStorage.getItem("dividados_questions_cache_v1")) || [];
  } catch (error) {
    return [];
  }
}

function getProfileData() {
  cidadeInput.value = formatPlaceName(cidadeInput.value);
  regiaoInput.value = formatPlaceName(regiaoInput.value);

  return {
    pesquisador: document.getElementById("pesquisador").value.trim(),
    cidade: cidadeInput.value.trim(),
    regiao: regiaoInput.value.trim(),
    endereco: document.getElementById("endereco").value.trim(),
    sexo: document.getElementById("sexo").value,
    faixaEtaria: document.getElementById("faixaEtaria").value
  };
}

function validateProfile(profile) {
  if (!profile.pesquisador || !profile.cidade || !profile.regiao || !profile.endereco || !profile.sexo || !profile.faixaEtaria) {
    showMessage("Preencha todos os dados do perfil antes de verificar a cota.", "error");
    return false;
  }

  return true;
}

async function checkQuota() {
  clearMessage();

  const profile = getProfileData();
  if (!validateProfile(profile)) return;

  if (!navigator.onLine) {
    quotaIsOpen = true;
    questionsSection.classList.remove("hidden");
    showMessage("Sem internet. A verificação de cota não está disponível agora, mas você pode continuar a pesquisa. A resposta será sincronizada depois.", "info");
    return;
  }

  if (!API_URL) {
    showMessage("Configure a constante API_URL no arquivo script.js antes de usar o formulario.", "error");
    return;
  }

  checkQuotaButton.disabled = true;
  checkQuotaButton.textContent = "Verificando...";
  showMessage("Verificando...", "info");

  try {
    const response = await apiRequest("checkQuota", {
      sexo: profile.sexo,
      faixaEtaria: profile.faixaEtaria
    });

    if (response.ok && response.open) {
      quotaIsOpen = true;
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
    const response = await apiRequest("submitResponse", payload);

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
    showMessage("Sem conexão com a API. A pesquisa foi salva neste aparelho e será sincronizada depois.", "info");
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
  const firstOpenAnswer = questionAnswers.find((answer) => normalizeText(answer.tipo) === "aberta" && answer.resposta);

  return {
    uniqueId,
    dataHora: new Date().toISOString(),
    pesquisador: formData.get("pesquisador").trim(),
    cidade: formatPlaceName(formData.get("cidade")),
    regiao: formatPlaceName(formData.get("regiao")),
    endereco: formData.get("endereco").trim(),
    sexo: formData.get("sexo"),
    faixaEtaria: formData.get("faixaEtaria"),
    p1: formData.get("p1"),
    p2: formData.get("p2"),
    p3: formData.get("p3"),
    p4: formData.get("p4"),
    p5: formData.get("p5"),
    respostas: questionAnswers,
    respostasJson: JSON.stringify(questionAnswers),
    respostaAberta: firstOpenAnswer ? firstOpenAnswer.resposta : "",
    origem: origin,
    statusSincronizacao: origin === "Offline" ? "Pendente" : "Sincronizada"
  };
}

function setupLocationFields() {
  [cidadeInput, regiaoInput].forEach((input) => {
    input.addEventListener("blur", () => {
      input.value = formatPlaceName(input.value);
    });
  });
}

async function loadCityOptions() {
  const cachedCities = getCachedCities();
  populateCityOptions(cachedCities.length ? cachedCities : MG_CITIES_FALLBACK);

  if (!navigator.onLine) return;

  try {
    const response = await fetch(MG_CITIES_API_URL);
    if (!response.ok) throw new Error("Nao foi possivel carregar municipios de MG.");

    const cities = (await response.json())
      .map((city) => city.nome)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));

    if (cities.length) {
      localStorage.setItem(CITY_CACHE_KEY, JSON.stringify(cities));
      populateCityOptions(cities);
    }
  } catch (error) {
    console.warn("Nao foi possivel carregar cidades do IBGE. Usando cache/lista basica.", error);
  }
}

function getCachedCities() {
  try {
    return JSON.parse(localStorage.getItem(CITY_CACHE_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function populateCityOptions(cities) {
  if (!cidadeOptions) return;

  cidadeOptions.innerHTML = cities
    .map((city) => `<option value="${escapeHtml(city)}"></option>`)
    .join("");
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

function collectQuestionAnswers(formData) {
  const closedAnswers = Array.from(dynamicQuestions.querySelectorAll("fieldset[data-question-meta]")).map((fieldset, index) => {
    let meta = {};

    try {
      meta = JSON.parse(decodeURIComponent(fieldset.dataset.questionMeta || "{}"));
    } catch (error) {
      meta = {};
    }

    const fieldName = fieldset.dataset.fieldName || `p${index + 1}`;

    return {
      campo: String(meta.campo || meta.id || fieldName).toUpperCase(),
      id: meta.id || fieldName,
      pergunta: meta.pergunta || "",
      tipo: meta.tipo || "Fechada",
      resposta: formData.get(fieldName) || ""
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
      tipo: meta.tipo || "Aberta",
      resposta: String(formData.get(fieldName) || "").trim()
    };
  });

  return [...closedAnswers, ...openAnswers];
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
  showMessage("Pesquisa salva neste aparelho. Ela será enviada automaticamente quando a internet voltar.", "success");
  resetFormAfterSave();
  submitButton.disabled = false;
  submitButton.textContent = "Enviar";
  updatePendingCount();
}

function resetFormAfterSave() {
  form.reset();
  closeQuestions();
  window.scrollTo({ top: 0, behavior: "smooth" });
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
  if (syncInProgress || !navigator.onLine || !API_URL) return;

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
        origem: "Offline",
        statusSincronizacao: "Sincronizada"
      };
      const response = await apiRequest("submitResponse", payload);

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
    showMessage(`${stillPending.length} pesquisa(s) ainda pendente(s). O sistema tentará novamente depois.`, "info");
  } else {
    showMessage("Todas as pesquisas pendentes foram sincronizadas.", "success");
  }
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
    throw new Error(`A API nao retornou JSON valido. Retorno recebido: ${text.slice(0, 160)}`);
  }
}

function jsonpRequest(action, payload) {
  return new Promise((resolve, reject) => {
    const callbackName = `dividadosCallback_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
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
