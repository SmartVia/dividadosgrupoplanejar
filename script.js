// Cole aqui a URL publicada do seu Google Apps Script.
// Exemplo: const API_URL = "https://script.google.com/macros/s/SEU_ID/exec";
const API_URL = "const API_URL = "https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxx/exec";";

const form = document.getElementById("surveyForm");
const messageBox = document.getElementById("message");
const checkQuotaButton = document.getElementById("checkQuotaButton");
const questionsSection = document.getElementById("questionsSection");
const submitButton = document.getElementById("submitButton");

let quotaIsOpen = false;

checkQuotaButton.addEventListener("click", checkQuota);
form.addEventListener("submit", submitSurvey);
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
    showMessage("Configure a constante API_URL no arquivo script.js antes de usar o formulário.", "error");
    return;
  }

  const profile = getProfileData();
  if (!validateProfile(profile)) return;

  checkQuotaButton.disabled = true;
  checkQuotaButton.textContent = "Verificando...";

  try {
    const response = await apiRequest("checkQuota", {
      sexo: profile.sexo,
      faixaEtaria: profile.faixaEtaria
    });

    if (response.ok && response.open) {
      quotaIsOpen = true;
      questionsSection.classList.remove("hidden");
      showMessage(`Cota aberta. Restam ${response.restante} entrevista(s) para este perfil.`, "success");
    } else {
      closeQuestions();
      showMessage("Cota encerrada para este perfil. Procure outro entrevistado.", "error");
    }
  } catch (error) {
    showMessage("Não foi possível verificar a cota. Confira a URL da API e sua conexão.", "error");
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

  try {
    const response = await apiRequest("submitResponse", payload);

    if (response.ok) {
      showMessage("Entrevista salva com sucesso.", "success");
      form.reset();
      closeQuestions();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (response.error === "quota_closed") {
      closeQuestions();
      showMessage("Cota encerrada para este perfil. Procure outro entrevistado.", "error");
    } else {
      showMessage(response.message || "Não foi possível salvar a entrevista.", "error");
    }
  } catch (error) {
    showMessage("Erro ao enviar. Tente novamente em alguns instantes.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Enviar";
  }
}

// JSONP evita problemas de CORS ao usar GitHub Pages com Google Apps Script.
function apiRequest(action, payload) {
  return new Promise((resolve, reject) => {
    const callbackName = `dividadosCallback_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement("script");
    const url = new URL(API_URL);

    url.searchParams.set("action", action);
    url.searchParams.set("payload", JSON.stringify(payload || {}));
    url.searchParams.set("callback", callbackName);

    window[callbackName] = (data) => {
      resolve(data);
      cleanup();
    };

    script.onerror = () => {
      reject(new Error("Falha na chamada da API"));
      cleanup();
    };

    function cleanup() {
      delete window[callbackName];
      script.remove();
    }

    script.src = url.toString();
    document.body.appendChild(script);
  });
}
