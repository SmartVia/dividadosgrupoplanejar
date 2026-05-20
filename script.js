// Cole somente a URL publicada do seu Google Apps Script entre as aspas.
// Certo: const API_URL = "https://script.google.com/macros/s/SEU_ID/exec";
// Errado: const API_URL = "const API_URL = \"https://script.google.com/macros/s/SEU_ID/exec\";";
const API_URL = "https://script.google.com/macros/s/AKfycbz2-cqG_YPr2CMXXf2lHyZn_qdjCD_w_2apcRLNlfBwnQ79MjMKEIzjJK_eJtEV7H9DUg/exec";

const form = document.getElementById("surveyForm");
const messageBox = document.getElementById("message");
const checkQuotaButton = document.getElementById("checkQuotaButton");
const questionsSection = document.getElementById("questionsSection");
const submitButton = document.getElementById("submitButton");

let quotaIsOpen = false;

if (!checkQuotaButton) {
  console.error("Botao #checkQuotaButton nao encontrado no HTML.");
} else {
  checkQuotaButton.addEventListener("click", checkQuota);
}

if (!form) {
  console.error("Formulario #surveyForm nao encontrado no HTML.");
} else {
  form.addEventListener("submit", submitSurvey);
}

document.getElementById("sexo").addEventListener("change", closeQuestions);
document.getElementById("faixaEtaria").addEventListener("change", closeQuestions);

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

  if (!API_URL) {
    showMessage("Configure a constante API_URL no arquivo script.js antes de usar o formulario.", "error");
    console.error("API_URL esta vazia. Cole a URL publicada do Google Apps Script em script.js.");
    return;
  }

  const profile = getProfileData();
  if (!validateProfile(profile)) return;

  checkQuotaButton.disabled = true;
  checkQuotaButton.textContent = "Verificando...";
  showMessage("Verificando...", "info");

  try {
    const response = await apiRequest("checkQuota", {
      sexo: profile.sexo,
      faixaEtaria: profile.faixaEtaria
    });

    console.log("Resposta checkQuota:", response);

    if (response.ok && response.open) {
      quotaIsOpen = true;
      questionsSection.classList.remove("hidden");
      showMessage(`Cota aberta. Restam ${response.restante} entrevista(s) para este perfil.`, "success");
      return;
    }

    closeQuestions();
    showMessage(response.message || "Cota encerrada para este perfil. Procure outro entrevistado.", "error");
    console.warn("Cota fechada ou nao encontrada:", response);
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

  if (!quotaIsOpen) {
    showMessage("Verifique uma cota aberta antes de enviar.", "error");
    return;
  }

  const formData = new FormData(form);
  const payload = {
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
    respostaAberta: formData.get("respostaAberta").trim()
  };

  submitButton.disabled = true;
  submitButton.textContent = "Enviando...";
  showMessage("Enviando resposta...", "info");

  try {
    const response = await apiRequest("submitResponse", payload);
    console.log("Resposta submitResponse:", response);

    if (response.ok) {
      showMessage("Entrevista salva com sucesso.", "success");
      form.reset();
      closeQuestions();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (response.error === "quota_closed") {
      closeQuestions();
      showMessage("Cota encerrada para este perfil. Procure outro entrevistado.", "error");
    } else {
      console.warn("Resposta da API ao salvar:", response);
      showMessage(response.message || "Nao foi possivel salvar a entrevista.", "error");
    }
  } catch (error) {
    console.error("Erro ao enviar entrevista:", error);
    showMessage(`Erro ao enviar: ${error.message}`, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Enviar";
  }
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
    const callbackName = `dividadosCallback_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
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
