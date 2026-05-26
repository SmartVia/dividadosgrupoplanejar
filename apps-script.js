/*
  Dividados Pesquisa - Backend Google Apps Script

  Como usar:
  1. Crie uma planilha Google Sheets com as abas:
     Respostas, Cotas, Pesquisadores, Perguntas e Regioes.
  2. Na aba Cotas, use estas colunas na primeira linha:
     Cidade, Regiao/Região, Sexo, FaixaEtaria/Faixa Etaria, Meta, Realizado, Restante, Status, Ordem
  3. Cole o ID da planilha na constante SPREADSHEET_ID abaixo.
     O ID fica na URL da planilha, entre /d/ e /edit.
  4. Publique este script como Aplicativo da Web.
     Execute como: você mesmo.
     Quem tem acesso: qualquer pessoa com o link.
  5. Cole a URL publicada em API_URL nos arquivos script.js e dashboard.js.
*/

const SPREADSHEET_ID = "1IpL7FeQ5y0fo61yYgVIihyeiBmCkwV8WMrgmtsYhC1U";

const SHEETS = {
  responses: "Respostas",
  quotas: "Cotas",
  researchers: "Pesquisadores",
  questions: "Perguntas",
  regions: "Regioes"
};

const QUOTA_HEADERS = ["Cidade", "Regiao", "Sexo", "FaixaEtaria", "Meta", "Realizado", "Restante", "Status", "Ordem"];
const RESEARCHER_HEADERS = ["ID", "Nome", "Cidade", "Meta", "Realizado", "Restante", "Status"];
const REGION_HEADERS = ["Cidade", "Regiao", "Ativa", "Ordem"];

const RESPONSE_HEADERS = [
  "UniqueId",
  "DataHora",
  "DataHoraInicio",
  "DataHoraEnvio",
  "Pesquisador",
  "Cidade",
  "Regiao",
  "Endereco",
  "Numero",
  "Sexo",
  "FaixaEtaria",
  "Latitude",
  "Longitude",
  "StatusGPS",
  "P1",
  "P2",
  "P3",
  "P4",
  "P5",
  "RespostaAberta",
  "RespostasJson",
  "Origem",
  "StatusSincronizacao"
];

function doGet(e) {
  return handleRequest_(e);
}

function doPost(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  const callback = e && e.parameter ? e.parameter.callback : "";
  let result;

  try {
    const request = parseRequest_(e);
    const action = request.action;
    const payload = request.payload;

    if (action === "checkQuota") {
      result = checkQuota_(payload);
    } else if (action === "submitResponse") {
      result = submitResponse_(payload);
    } else if (action === "getQuestions") {
      result = getQuestionsData_();
    } else if (action === "getQuotas") {
      result = getQuotasData_();
    } else if (action === "getResearchers") {
      result = getResearchersData_();
    } else if (action === "getRegions") {
      result = getRegionsData_();
    } else if (action === "dashboard") {
      result = getDashboardData_();
    } else {
      result = { ok: false, error: "invalid_action", message: "Ação inválida ou não informada." };
    }
  } catch (error) {
    result = {
      ok: false,
      error: "server_error",
      message: error.message || "Erro interno na API."
    };
  }

  return output_(result, callback);
}

function parseRequest_(e) {
  const params = e && e.parameter ? e.parameter : {};
  let body = {};

  if (params.payload) {
    body = JSON.parse(params.payload);
  } else if (e && e.postData && e.postData.contents) {
    body = JSON.parse(e.postData.contents);
  }

  return {
    action: params.action || body.action || "",
    payload: body.payload || body || {}
  };
}

function output_(data, callback) {
  const json = JSON.stringify(data);

  if (callback) {
    const safeCallback = String(callback).replace(/[^\w.$]/g, "");
    return ContentService
      .createTextOutput(`${safeCallback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function checkQuota_(payload) {
  validateRequiredProfile_(payload);

  const spreadsheet = getSpreadsheet_();
  const quotasSheet = getRequiredSheet_(spreadsheet, SHEETS.quotas);
  const quota = findQuota_(quotasSheet, payload.cidade, payload.regiao, payload.sexo, payload.faixaEtaria);

  if (!quota) {
    return {
      ok: false,
      open: false,
      error: "quota_not_found",
      message: "Cota não encontrada para esta cidade, região, sexo e faixa etária."
    };
  }

  if (!isQuotaOpen_(quota)) {
    return {
      ok: true,
      open: false,
      restante: quota.restante,
      status: quota.status,
      message: "Cota encerrada para este perfil. Selecione outro perfil."
    };
  }

  return {
    ok: true,
    open: true,
    restante: quota.restante,
    status: quota.status,
    message: "Cota aberta."
  };
}

function submitResponse_(payload) {
  validateRequiredResponse_(payload);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = getSpreadsheet_();
    const responsesSheet = getRequiredSheet_(spreadsheet, SHEETS.responses);
    const quotasSheet = getRequiredSheet_(spreadsheet, SHEETS.quotas);
    const researchersSheet = getRequiredSheet_(spreadsheet, SHEETS.researchers);

    ensureResponseHeaders_(responsesSheet);
    ensureResearcherHeaders_(researchersSheet);

    const uniqueId = payload.uniqueId || Utilities.getUuid();
    if (responseAlreadyExists_(responsesSheet, uniqueId)) {
      return { ok: true, duplicate: true, message: "Resposta ja sincronizada anteriormente." };
    }

    const quota = findQuota_(quotasSheet, payload.cidade, payload.regiao, payload.sexo, payload.faixaEtaria);
    const isOfflineSync = normalizeText_(payload.origem) === "offline";

    if ((!quota || !isQuotaOpen_(quota)) && !isOfflineSync) {
      return {
        ok: false,
        error: "quota_closed",
        message: "Esta cota acabou de ser encerrada. Selecione outro perfil."
      };
    }

    appendDynamicResponse_(responsesSheet, payload, uniqueId);
    updateResearcherProgress_(researchersSheet, payload.pesquisador, payload.cidade);

    if (quota) {
      const nextRealizado = quota.realizado + 1;
      const nextRestante = Math.max(quota.meta - nextRealizado, 0);
      const nextStatus = nextRestante > 0 ? "Aberta" : "Encerrada";

      quotasSheet.getRange(quota.row, quota.columns.Realizado).setValue(nextRealizado);
      quotasSheet.getRange(quota.row, quota.columns.Restante).setValue(nextRestante);
      quotasSheet.getRange(quota.row, quota.columns.Status).setValue(nextStatus);
    }

    return { ok: true, message: "Resposta salva com sucesso." };
  } finally {
    lock.releaseLock();
  }
}

function getDashboardData_() {
  const spreadsheet = getSpreadsheet_();
  const responsesSheet = getRequiredSheet_(spreadsheet, SHEETS.responses);
  const quotasSheet = getRequiredSheet_(spreadsheet, SHEETS.quotas);
  const researchersSheet = getRequiredSheet_(spreadsheet, SHEETS.researchers);
  const responses = getSheetObjects_(responsesSheet);
  const responseRows = responses.map(function(row) {
    const item = {
      UniqueId: row.UniqueId || "",
      DataHora: formatDateValue_(row.DataHora),
      DataHoraInicio: formatDateValue_(row.DataHoraInicio),
      DataHoraEnvio: formatDateValue_(row.DataHoraEnvio),
      Pesquisador: row.Pesquisador || "",
      Cidade: row.Cidade || "",
      Regiao: row.Regiao || "",
      Endereco: row.Endereco || "",
      Numero: row.Numero || "",
      Sexo: row.Sexo || "",
      FaixaEtaria: row.FaixaEtaria || "",
      Latitude: row.Latitude || "",
      Longitude: row.Longitude || "",
      StatusGPS: row.StatusGPS || "",
      P1: row.P1 || "",
      P2: row.P2 || "",
      P3: row.P3 || "",
      P4: row.P4 || "",
      P5: row.P5 || "",
      RespostaAberta: row.RespostaAberta || "",
      RespostasJson: row.RespostasJson || "",
      Origem: row.Origem || "",
      StatusSincronizacao: row.StatusSincronizacao || ""
    };

    for (let i = 1; i <= 100; i++) {
      item["P" + i] = row["P" + i] || "";
    }

    for (let i = 1; i <= 20; i++) {
      item["RA" + i] = row["RA" + i] || "";
      item["RespostaAberta" + i] = row["RespostaAberta" + i] || "";
    }

    return item;
  });
  const quotas = getNormalizedQuotas_(quotasSheet);
  const researchers = getResearchersSummary_(researchersSheet, responses);

  return {
    ok: true,
    total: responses.length,
    bySexo: countBy_(responses, "Sexo"),
    byFaixaEtaria: countBy_(responses, "FaixaEtaria"),
    byCidade: countBy_(responses, "Cidade"),
    byRegiao: countBy_(responses, "Regiao"),
    byPesquisador: countBy_(responses, "Pesquisador"),
    responses: responseRows,
    quotas: quotas,
    researchers: researchers
  };
}

function getQuotasData_() {
  const spreadsheet = getSpreadsheet_();
  const quotasSheet = getRequiredSheet_(spreadsheet, SHEETS.quotas);
  return {
    ok: true,
    quotas: getNormalizedQuotas_(quotasSheet)
  };
}

function getResearchersData_() {
  const spreadsheet = getSpreadsheet_();
  const researchersSheet = getRequiredSheet_(spreadsheet, SHEETS.researchers);
  ensureResearcherHeaders_(researchersSheet);
  return {
    ok: true,
    researchers: getResearchersSummary_(researchersSheet, [])
  };
}

function getRegionsData_() {
  const spreadsheet = getSpreadsheet_();
  const regionsSheet = getOrCreateSheet_(spreadsheet, SHEETS.regions, REGION_HEADERS);
  return {
    ok: true,
    regions: getNormalizedRegions_(regionsSheet)
  };
}

function getNormalizedRegions_(regionsSheet) {
  ensureHeaders_(regionsSheet, REGION_HEADERS);
  return getSheetObjects_(regionsSheet).map(function(row, index) {
    return {
      cidade: row.Cidade || "",
      regiao: row.Regiao || "",
      ativa: row.Ativa || "Sim",
      ordem: Number(row.Ordem || index + 1) || index + 1
    };
  }).filter(function(row) {
    return row.cidade && row.regiao && normalizeText_(row.ativa || "Sim") !== "nao";
  }).sort(function(a, b) {
    const cityCompare = normalizeText_(a.cidade).localeCompare(normalizeText_(b.cidade));
    if (cityCompare !== 0) return cityCompare;
    return a.ordem - b.ordem;
  });
}

function getNormalizedQuotas_(quotasSheet) {
  return getSheetObjects_(quotasSheet).map(function(row) {
    const meta = Number(row.Meta) || 0;
    const realizado = Number(row.Realizado) || 0;
    const restanteCell = row.Restante;
    const restante = restanteCell === "" || restanteCell === null || typeof restanteCell === "undefined"
      ? Math.max(meta - realizado, 0)
      : Number(restanteCell) || 0;

    return {
      cidade: row.Cidade || "",
      regiao: row.Regiao || "",
      sexo: row.Sexo || "",
      faixaEtaria: row.FaixaEtaria || "",
      meta: meta,
      realizado: realizado,
      restante: restante,
      status: row.Status || (restante > 0 ? "Aberta" : "Encerrada"),
      ordem: Number(row.Ordem) || 0
    };
  }).sort(function(a, b) {
    const orderA = Number(a.ordem) || 9999;
    const orderB = Number(b.ordem) || 9999;
    return orderA - orderB;
  });
}

function getResearchersSummary_(researchersSheet, responses) {
  ensureResearcherHeaders_(researchersSheet);
  const researchers = getSheetObjects_(researchersSheet).map(function(row) {
    return {
      id: row.ID || "",
      nome: row.Nome || "",
      cidade: row.Cidade || "",
      meta: Number(row.Meta) || 0,
      realizado: Number(row.Realizado) || 0,
      restante: Number(row.Restante) || 0,
      status: row.Status || "Ativo"
    };
  }).filter(function(row) {
    return row.nome;
  });

  const responseCounts = {};
  responses.forEach(function(row) {
    const name = row.Pesquisador || "";
    if (!name) return;
    const key = normalizePersonKey_(name);
    if (!responseCounts[key]) {
      responseCounts[key] = {
        nome: formatName_(name),
        total: 0
      };
    }
    responseCounts[key].total += 1;
  });

  const rowsByKey = {};
  researchers.forEach(function(row) {
    const key = normalizePersonKey_(row.nome);
    const computedTotal = responseCounts[key] ? responseCounts[key].total : row.realizado;
    const meta = Number(row.meta) || 0;
    rowsByKey[key] = {
      id: row.id,
      nome: formatName_(row.nome),
      cidade: row.cidade,
      meta: meta,
      realizado: computedTotal,
      restante: meta ? Math.max(meta - computedTotal, 0) : Number(row.restante) || 0,
      status: row.status || "Ativo"
    };
  });

  Object.keys(responseCounts).forEach(function(key) {
    if (!rowsByKey[key]) {
      rowsByKey[key] = {
        id: "",
        nome: responseCounts[key].nome,
        cidade: "",
        meta: 0,
        realizado: responseCounts[key].total,
        restante: 0,
        status: "Ativo"
      };
    }
  });

  return Object.keys(rowsByKey).map(function(key) {
    return rowsByKey[key];
  }).sort(function(a, b) {
    return b.realizado - a.realizado;
  });
}

function updateResearcherProgress_(sheet, name, city) {
  if (!name) return;

  ensureResearcherHeaders_(sheet);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(header) {
    return String(header).trim();
  });
  const columns = getColumnMap_(headers);
  const values = sheet.getDataRange().getValues();
  const searchedName = normalizePersonKey_(name);
  let rowIndex = -1;

  for (let i = 1; i < values.length; i++) {
    const currentName = values[i][columns.Nome - 1];
    if (normalizePersonKey_(currentName) === searchedName) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    const row = new Array(sheet.getLastColumn()).fill("");
    row[columns.ID - 1] = "PESQ-" + Utilities.getUuid().slice(0, 8).toUpperCase();
    row[columns.Nome - 1] = formatName_(name);
    row[columns.Cidade - 1] = city || "";
    row[columns.Meta - 1] = 0;
    row[columns.Realizado - 1] = 1;
    row[columns.Restante - 1] = 0;
    row[columns.Status - 1] = "Ativo";
    sheet.appendRow(row);
    return;
  }

  const meta = Number(sheet.getRange(rowIndex, columns.Meta).getValue()) || 0;
  const realizado = (Number(sheet.getRange(rowIndex, columns.Realizado).getValue()) || 0) + 1;
  const restante = meta ? Math.max(meta - realizado, 0) : 0;

  sheet.getRange(rowIndex, columns.Nome).setValue(formatName_(name));
  if (city && !sheet.getRange(rowIndex, columns.Cidade).getValue()) {
    sheet.getRange(rowIndex, columns.Cidade).setValue(city);
  }
  sheet.getRange(rowIndex, columns.Realizado).setValue(realizado);
  sheet.getRange(rowIndex, columns.Restante).setValue(restante);
  if (!sheet.getRange(rowIndex, columns.Status).getValue()) {
    sheet.getRange(rowIndex, columns.Status).setValue("Ativo");
  }
}

function getQuestionsData_() {
  const spreadsheet = getSpreadsheet_();
  const questionsSheet = getRequiredSheet_(spreadsheet, SHEETS.questions);
  const rows = getSheetObjects_(questionsSheet);

  const questions = rows.map(function(row, index) {
    return {
      id: row.ID || row.Id || row.id || ("P" + (index + 1)),
      grupo: row.Grupo || row.grupo || "Geral",
      contexto: row.Contexto || row.contexto || "",
      pergunta: row.Pergunta || row.pergunta || "",
      tipo: row.Tipo || row.tipo || "Fechada",
      a: row.A || row.AlternativaA || row["Alternativa A"] || "",
      b: row.B || row.AlternativaB || row["Alternativa B"] || "",
      c: row.C || row.AlternativaC || row["Alternativa C"] || "",
      d: row.D || row.AlternativaD || row["Alternativa D"] || "",
      e: row.E || row.AlternativaE || row["Alternativa E"] || "",
      f: row.F || row.AlternativaF || row["Alternativa F"] || "",
      g: row.G || row.AlternativaG || row["Alternativa G"] || "",
      h: row.H || row.AlternativaH || row["Alternativa H"] || "",
      i: row.I || row.AlternativaI || row["Alternativa I"] || "",
      j: row.J || row.AlternativaJ || row["Alternativa J"] || "",
      ativa: row.Ativa || row.ativa || "Sim",
      ordem: Number(row.Ordem || row.ordem || index + 1)
    };
  }).filter(function(question) {
    return question.pergunta && normalizeText_(question.ativa) !== "nao";
  }).sort(function(a, b) {
    return a.ordem - b.ordem;
  });

  return {
    ok: true,
    questions: questions
  };
}

function formatDateValue_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return value.toISOString();
  }

  return value || "";
}

function getSpreadsheet_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === "COLE_AQUI_O_ID_DA_SUA_PLANILHA") {
    throw new Error("Configure SPREADSHEET_ID no Apps Script com o ID da sua planilha.");
  }

  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getRequiredSheet_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Aba "${sheetName}" não encontrada. Crie as abas: Respostas, Cotas, Pesquisadores, Perguntas e Regioes.`);
  }

  return sheet;
}

function getOrCreateSheet_(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  ensureHeaders_(sheet, headers || []);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  if (!headers || !headers.length) return;

  const firstRow = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getValues()[0];
  const isEmpty = firstRow.every(function(cell) {
    return cell === "";
  });

  if (isEmpty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(header) {
    return String(header).trim();
  });

  headers.forEach(function(header) {
    if (existing.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      existing.push(header);
    }
  });
}

function findQuota_(sheet, cidade, regiao, sexo, faixaEtaria) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0].map(function(header) {
    return String(header).trim();
  });
  const columns = getColumnMap_(headers);
  validateColumns_(columns, QUOTA_HEADERS, SHEETS.quotas);

  const searchedCidade = normalizeText_(cidade);
  const searchedRegiao = normalizeText_(regiao);
  const searchedSexo = normalizeText_(sexo);
  const searchedFaixa = normalizeText_(faixaEtaria);

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowCidade = normalizeText_(row[columns.Cidade - 1]);
    const rowRegiao = normalizeText_(row[columns.Regiao - 1]);
    const rowSexo = normalizeText_(row[columns.Sexo - 1]);
    const rowFaixa = normalizeText_(row[columns.FaixaEtaria - 1]);

    if (rowCidade === searchedCidade && rowRegiao === searchedRegiao && rowSexo === searchedSexo && rowFaixa === searchedFaixa) {
      const meta = Number(row[columns.Meta - 1]) || 0;
      const realizado = Number(row[columns.Realizado - 1]) || 0;
      const restanteCell = row[columns.Restante - 1];
      const restante = restanteCell === "" ? Math.max(meta - realizado, 0) : Number(restanteCell) || 0;
      const status = String(row[columns.Status - 1] || "").trim() || (restante > 0 ? "Aberta" : "Encerrada");

      return {
        row: i + 1,
        columns: columns,
        cidade: row[columns.Cidade - 1],
        regiao: row[columns.Regiao - 1],
        sexo: row[columns.Sexo - 1],
        faixaEtaria: row[columns.FaixaEtaria - 1],
        meta: meta,
        realizado: realizado,
        restante: restante,
        status: status
      };
    }
  }

  return null;
}

function isQuotaOpen_(quota) {
  return quota.restante > 0 && normalizeText_(quota.status) === "aberta";
}

function validateRequiredProfile_(payload) {
  if (!payload || !payload.cidade || !payload.regiao || !payload.sexo || !payload.faixaEtaria) {
    throw new Error("Dados incompletos para verificar cota: envie cidade, regiao, sexo e faixaEtaria.");
  }
}

function validateRequiredResponse_(payload) {
  validateRequiredProfile_(payload);

  const requiredFields = ["pesquisador", "cidade", "regiao", "endereco", "numero"];
  const missing = requiredFields.filter(function(field) {
    return !payload[field];
  });

  const respostas = parseRespostas_(payload);
  const unanswered = respostas.filter(function(item) {
    return !isOpenQuestionType_(item.tipo || item.type || "") && !item.resposta;
  });

  if (missing.length || unanswered.length) {
    throw new Error("Dados incompletos para salvar resposta. Confira perfil e perguntas obrigatorias.");
  }
}

function appendDynamicResponse_(sheet, payload, uniqueId) {
  const respostas = parseRespostas_(payload);
  const headers = ensureDynamicResponseColumns_(sheet, respostas);
  const rowObject = {
    UniqueId: uniqueId,
    DataHora: payload.dataHora ? new Date(payload.dataHora) : new Date(),
    DataHoraInicio: payload.dataHoraInicio ? new Date(payload.dataHoraInicio) : "",
    DataHoraEnvio: payload.dataHoraEnvio ? new Date(payload.dataHoraEnvio) : new Date(),
    Pesquisador: payload.pesquisador || "",
    Cidade: payload.cidade || "",
    Regiao: payload.regiao || "",
    Endereco: payload.endereco || "",
    Numero: payload.numero || "",
    Sexo: payload.sexo || "",
    FaixaEtaria: payload.faixaEtaria || "",
    Latitude: payload.latitude || "",
    Longitude: payload.longitude || "",
    StatusGPS: payload.statusGPS || "",
    RespostaAberta: payload.respostaAberta || "",
    RespostasJson: payload.respostasJson || JSON.stringify(respostas),
    Origem: payload.origem || "Online",
    StatusSincronizacao: payload.statusSincronizacao || "Sincronizada"
  };

  for (let i = 1; i <= 100; i++) {
    rowObject["P" + i] = "";
  }

  for (let i = 1; i <= 20; i++) {
    rowObject["RA" + i] = "";
    rowObject["RespostaAberta" + i] = "";
  }

  respostas.forEach(function(item, index) {
    const code = String(item.campo || item.id || "").toUpperCase();
    const value = item.resposta || item.respostaAberta || "";
    const isOpen = isOpenQuestionType_(item.tipo || item.type || "");

    if (/^P\d+$/.test(code) && !isOpen) {
      rowObject[code] = value;
      return;
    }

    if (/^RA\d+$/.test(code) || (/^P\d+$/.test(code) && isOpen)) {
      const number = Number(code.replace(/\D/g, ""));
      rowObject[code] = value;

      if (number >= 1 && number <= 20) {
        rowObject["RespostaAberta" + number] = value;
      }

      if (!rowObject.RespostaAberta) {
        rowObject.RespostaAberta = value;
      }
      return;
    }

    if (index < 100) {
      rowObject["P" + (index + 1)] = value;
    }
  });

  const values = headers.map(function(header) {
    return rowObject[header] !== undefined ? rowObject[header] : "";
  });

  sheet.appendRow(values);
}

function parseRespostas_(payload) {
  if (payload.respostas && Array.isArray(payload.respostas)) {
    return payload.respostas;
  }

  if (payload.respostasJson) {
    try {
      const parsed = JSON.parse(payload.respostasJson);
      if (Array.isArray(parsed)) return parsed;
    } catch (error) {
      // Continua para fallback P1...P100.
    }
  }

  const respostas = [];
  for (let i = 1; i <= 100; i++) {
    const value = payload["p" + i];
    if (value) {
      respostas.push({
        campo: "P" + i,
        id: "p" + i,
        pergunta: "",
        resposta: value
      });
    }
  }

  return respostas;
}

function responseAlreadyExists_(sheet, uniqueId) {
  if (!uniqueId) return false;

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return false;

  const headers = values[0].map(function(header) {
    return String(header).trim();
  });
  const columns = getColumnMap_(headers);
  const uniqueIdColumn = columns.UniqueId;

  if (!uniqueIdColumn) return false;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][uniqueIdColumn - 1]).trim() === String(uniqueId).trim()) {
      return true;
    }
  }

  return false;
}

function validateColumns_(columns, requiredHeaders, sheetName) {
  const missing = requiredHeaders.filter(function(header) {
    return !columns[header];
  });

  if (missing.length) {
    throw new Error(`Colunas faltando na aba "${sheetName}": ${missing.join(", ")}.`);
  }
}

function getSheetObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(function(header) {
    return String(header).trim();
  });
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    const row = {};
    let hasValue = false;

    headers.forEach(function(header, index) {
      const canonicalHeader = canonicalHeader_(header);
      row[header] = values[i][index];
      row[canonicalHeader] = values[i][index];
      if (values[i][index] !== "") hasValue = true;
    });

    if (hasValue) rows.push(row);
  }

  return rows;
}

function countBy_(rows, field) {
  return rows.reduce(function(acc, row) {
    const key = String(row[field] || "Não informado").trim() || "Não informado";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function getColumnMap_(headers) {
  return headers.reduce(function(map, header, index) {
    map[header] = index + 1;
    map[canonicalHeader_(header)] = index + 1;
    return map;
  }, {});
}

function canonicalHeader_(header) {
  const key = normalizeText_(header).replace(/[^a-z0-9]/g, "");
  const map = {
    id: "ID",
    nome: "Nome",
    cidade: "Cidade",
    regiao: "Regiao",
    regiaobairro: "Regiao",
    bairro: "Regiao",
    sexo: "Sexo",
    faixaetaria: "FaixaEtaria",
    idade: "FaixaEtaria",
    meta: "Meta",
    realizado: "Realizado",
    restante: "Restante",
    status: "Status",
    ordem: "Ordem",
    endereco: "Endereco",
    numero: "Numero",
    pesquisador: "Pesquisador",
    datahora: "DataHora",
    datahorainicio: "DataHoraInicio",
    datahoraenvio: "DataHoraEnvio",
    latitude: "Latitude",
    longitude: "Longitude",
    statusgps: "StatusGPS",
    origem: "Origem",
    statussincronizacao: "StatusSincronizacao",
    ativa: "Ativa",
    pergunta: "Pergunta",
    tipo: "Tipo",
    grupo: "Grupo",
    contexto: "Contexto"
  };
  return map[key] || String(header || "").trim();
}

function normalizeText_(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizePersonKey_(value) {
  return normalizeText_(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatName_(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const lowerWords = {
    "de": true,
    "da": true,
    "do": true,
    "das": true,
    "dos": true,
    "e": true
  };

  return text.toLowerCase().split(" ").map(function(word, index) {
    if (index > 0 && lowerWords[word]) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(" ");
}

function isOpenQuestionType_(type) {
  const normalized = normalizeText_(type);
  return normalized === "aberta" || normalized === "abertatexto" || normalized === "texto";
}

function ensureResponseHeaders_(sheet) {
  const firstRow = sheet.getRange(1, 1, 1, Math.max(RESPONSE_HEADERS.length, sheet.getLastColumn())).getValues()[0];
  const isEmpty = firstRow.every(function(cell) {
    return cell === "";
  });

  if (isEmpty) {
    sheet.getRange(1, 1, 1, RESPONSE_HEADERS.length).setValues([RESPONSE_HEADERS]);
    return;
  }

  const headers = firstRow.map(function(header) {
    return String(header).trim();
  });

  // Migra planilhas antigas que começavam em DataHora para o novo formato com UniqueId.
  if (headers[0] === "DataHora") {
    sheet.insertColumnBefore(1);
    sheet.getRange(1, 1).setValue("UniqueId");
  }

  const currentLastColumn = sheet.getLastColumn();
  const currentHeaders = sheet.getRange(1, 1, 1, currentLastColumn).getValues()[0].map(function(header) {
    return String(header).trim();
  });

  if (currentHeaders.indexOf("Origem") === -1) {
    sheet.getRange(1, currentLastColumn + 1).setValue("Origem");
  }

  if (currentHeaders.indexOf("StatusSincronizacao") === -1) {
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue("StatusSincronizacao");
  }

  const headersBeforeDynamic = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) {
    return String(value).trim();
  });
  if (headersBeforeDynamic.indexOf("Numero") === -1 && headersBeforeDynamic.indexOf("Endereco") !== -1) {
    sheet.insertColumnAfter(headersBeforeDynamic.indexOf("Endereco") + 1);
    sheet.getRange(1, headersBeforeDynamic.indexOf("Endereco") + 2).setValue("Numero");
  }

  RESPONSE_HEADERS.forEach(function(header) {
    const latestHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) {
      return String(value).trim();
    });
    if (latestHeaders.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
    }
  });
}

function ensureResearcherHeaders_(sheet) {
  const firstRow = sheet.getRange(1, 1, 1, Math.max(RESEARCHER_HEADERS.length, sheet.getLastColumn())).getValues()[0];
  const isEmpty = firstRow.every(function(cell) {
    return cell === "";
  });

  if (isEmpty) {
    sheet.getRange(1, 1, 1, RESEARCHER_HEADERS.length).setValues([RESEARCHER_HEADERS]);
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(header) {
    return String(header).trim();
  });

  RESEARCHER_HEADERS.forEach(function(header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });
}

function ensureDynamicResponseColumns_(sheet, answersOrCount) {
  ensureResponseHeaders_(sheet);

  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(header) {
    return String(header).trim();
  });

  const columnsToEnsure = [];
  const maxQuestions = Math.min(Array.isArray(answersOrCount) ? answersOrCount.length : Number(answersOrCount) || 0, 100);

  for (let i = 1; i <= maxQuestions; i++) {
    columnsToEnsure.push("P" + i);
  }

  if (Array.isArray(answersOrCount)) {
    answersOrCount.forEach(function(item) {
      const code = String(item.campo || item.id || "").toUpperCase();
      const isOpen = isOpenQuestionType_(item.tipo || item.type || "");
      if (/^P\d+$/.test(code)) {
        columnsToEnsure.push(code);
      }
      if ((/^RA\d+$/.test(code) || (/^P\d+$/.test(code) && isOpen)) && Number(code.replace(/\D/g, "")) <= 20) {
        columnsToEnsure.push("RespostaAberta" + Number(code.replace(/\D/g, "")));
      }
    });
  }

  for (let i = 1; i <= 20; i++) {
    columnsToEnsure.push("RA" + i, "RespostaAberta" + i);
  }

  columnsToEnsure.push(
    "DataHoraInicio",
    "DataHoraEnvio",
    "Latitude",
    "Longitude",
    "StatusGPS",
    "RespostaAberta",
    "RespostasJson",
    "Origem",
    "StatusSincronizacao"
  );

  columnsToEnsure.forEach(function(header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });

  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(header) {
    return String(header).trim();
  });
}


