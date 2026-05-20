// Cole somente a URL publicada do seu Google Apps Script entre as aspas.
// Esta URL precisa ser a URL do App da Web publicado no Apps Script.
const API_URL = "https://script.google.com/macros/s/AKfycby1iZyydOBfSrNpKPx0HulX3gT-KhfUEaOxxcfCq6JaUyB2UF43dAVtKd9hNxSGOoD7/exec";

const OFFLINE_QUEUE_KEY = "dividados_offline_queue_v1";

const form = document.getElementById("surveyForm");
const messageBox = document.getElementById("message");
const checkQuotaButton = document.getElementById("checkQuotaButton");
const questionsSection = document.getElementById("questionsSection");
const submitButton = document.getElementById("submitButton");
const offlineBox = document.getElementById("offlineBox");
const connectionStatus = document.getElementById("connectionStatus");
const pendingCountText = document.getElementById("pendingCountText");
const syncNowButton = document.getElementById("syncNowButton");

let quotaIsOpen = false;
let syncInProgress = false;

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

function getProfileData() {
  return {
    pesquisador: document.getElementById("pesquisador").value.trim(),
    cidade: document.getElementById("cidade").value.trim(),
    regiao: document.getElementById("regiao").value.trim(),
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

  return {
    uniqueId,
    dataHora: new Date().toISOString(),
    pesquisador: formData.get("pesquisador").trim(),
    cidade: formData.get("cidade").trim(),
    regiao: formData.get("regiao").trim(),
    endereco: formData.get("endereco").trim(),
    sexo: formData.get("sexo"),
    faixaEtaria: formData.get("faixaEtaria"),
    p1: formData.get("p1"),
    p2: formData.get("p2"),
    p3: formData.get("p3"),
    p4: formData.get("p4"),
    p5: formData.get("p5"),
    respostaAberta: formData.get("respostaAberta").trim(),
    origem: origin,
    statusSincronizacao: origin === "Offline" ? "Pendente" : "Sincronizada"
  };
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
