/*
  Dividados Pesquisa - camada unica de acesso a dados.

  Hoje este arquivo usa o Google Apps Script publicado como Web App.
  Em uma futura migracao para Supabase, troque apenas a implementacao
  interna destas funcoes, mantendo os nomes e os retornos esperados.
*/

const API_URL = "https://script.google.com/macros/s/AKfycby1iZyydOBfSrNpKPx0HulX3gT-KhfUEaOxxcfCq6JaUyB2UF43dAVtKd9hNxSGOoD7/exec";

function isApiConfigured() {
  return Boolean(API_URL);
}

function getDashboardData() {
  return apiRequest("dashboard", {});
}

function getQuestions() {
  return apiRequest("getQuestions", {});
}

function getQuotas() {
  return apiRequest("getQuotas", {});
}

function getResearchers() {
  return apiRequest("getResearchers", {});
}

function checkQuota(payload) {
  return apiRequest("checkQuota", payload);
}

function submitResponse(payload) {
  return apiRequest("submitResponse", payload);
}

async function apiRequest(action, payload) {
  // Futuro Supabase: substituir fetchRequest/jsonpRequest por chamadas ao Supabase aqui.
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
    const callbackName = `dividadosApi_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
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
