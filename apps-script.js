/*
  Dividados Pesquisa - Backend Google Apps Script

  Como usar:
  1. Crie uma planilha Google Sheets com as abas:
     Respostas, Cotas, Pesquisadores e Perguntas.
  2. Na aba Cotas, use exatamente estas colunas na primeira linha:
     Sexo, FaixaEtaria, Meta, Realizado, Restante, Status
  3. Cole o ID da planilha na constante SPREADSHEET_ID abaixo.
     O ID fica na URL da planilha, entre /d/ e /edit.
  4. Publique este script como Aplicativo da Web.
     Execute como: vocÃª mesmo.
     Quem tem acesso: qualquer pessoa com o link.
  5. Cole a URL publicada em API_URL nos arquivos script.js e dashboard.js.
*/

const SPREADSHEET_ID = "1IpL7FeQ5y0fo61yYgVIihyeiBmCkwV8WMrgmtsYhC1U";

const SHEETS = {
  responses: "Respostas",
  quotas: "Cotas",
  researchers: "Pesquisadores",
  questions: "Perguntas"
};

const QUOTA_HEADERS = ["Sexo", "FaixaEtaria", "Meta", "Realizado", "Restante", "Status"];

const RESPONSE_HEADERS = [
  "UniqueId",
  "DataHora",
  "Pesquisador",
  "Cidade",
  "Regiao",
  "Endereco",
  "Sexo",
  "FaixaEtaria",
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
    } else if (action === "dashboard") {
      result = getDashboardData_();
    } else {
      result = { ok: false, error: "invalid_action", message: "AÃ§Ã£o invÃ¡lida ou nÃ£o informada." };
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
  const quota = findQuota_(quotasSheet, payload.sexo, payload.faixaEtaria);

  if (!quota) {
    return {
      ok: false,
      open: false,
      error: "quota_not_found",
      message: "Cota nÃ£o encontrada para este perfil. Confira Sexo e FaixaEtaria na aba Cotas."
    };
  }

  if (!isQuotaOpen_(quota)) {
    return {
      ok: true,
      open: false,
      restante: quota.restante,
      status: quota.status,
      message: "Cota encerrada para este perfil. Procure outro entrevistado."
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

    ensureResponseHeaders_(responsesSheet);

    const uniqueId = payload.uniqueId || Utilities.getUuid();
    if (responseAlreadyExists_(responsesSheet, uniqueId)) {
      return { ok: true, duplicate: true, message: "Resposta ja sincronizada anteriormente." };
    }

    const quota = findQuota_(quotasSheet, payload.sexo, payload.faixaEtaria);
    const isOfflineSync = normalizeText_(payload.origem) === "offline";

    if ((!quota || !isQuotaOpen_(quota)) && !isOfflineSync) {
      return {
        ok: false,
        error: "quota_closed",
        message: "Cota encerrada para este perfil. Procure outro entrevistado."
      };
    }

    appendDynamicResponse_(responsesSheet, payload, uniqueId);

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
  const responses = getSheetObjects_(responsesSheet);
  const responseRows = responses.map(function(row) {
    const item = {
      UniqueId: row.UniqueId || "",
      DataHora: formatDateValue_(row.DataHora),
      Pesquisador: row.Pesquisador || "",
      Cidade: row.Cidade || "",
      Regiao: row.Regiao || "",
      Endereco: row.Endereco || "",
      Sexo: row.Sexo || "",
      FaixaEtaria: row.FaixaEtaria || "",
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

  return {
    ok: true,
    total: responses.length,
    bySexo: countBy_(responses, "Sexo"),
    byFaixaEtaria: countBy_(responses, "FaixaEtaria"),
    byCidade: countBy_(responses, "Cidade"),
    byPesquisador: countBy_(responses, "Pesquisador"),
    responses: responseRows,
    quotas: quotas
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

function getNormalizedQuotas_(quotasSheet) {
  return getSheetObjects_(quotasSheet).map(function(row) {
    return {
      sexo: row.Sexo || "",
      faixaEtaria: row.FaixaEtaria || "",
      meta: Number(row.Meta) || 0,
      realizado: Number(row.Realizado) || 0,
      restante: Number(row.Restante) || 0,
      status: row.Status || ""
    };
  });
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
    throw new Error(`Aba "${sheetName}" nÃ£o encontrada. Crie as abas: Respostas, Cotas, Pesquisadores e Perguntas.`);
  }

  return sheet;
}

function findQuota_(sheet, sexo, faixaEtaria) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0].map(function(header) {
    return String(header).trim();
  });
  const columns = getColumnMap_(headers);
  validateColumns_(columns, QUOTA_HEADERS, SHEETS.quotas);

  const searchedSexo = normalizeText_(sexo);
  const searchedFaixa = normalizeText_(faixaEtaria);

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowSexo = normalizeText_(row[columns.Sexo - 1]);
    const rowFaixa = normalizeText_(row[columns.FaixaEtaria - 1]);

    if (rowSexo === searchedSexo && rowFaixa === searchedFaixa) {
      const meta = Number(row[columns.Meta - 1]) || 0;
      const realizado = Number(row[columns.Realizado - 1]) || 0;
      const restanteCell = row[columns.Restante - 1];
      const restante = restanteCell === "" ? Math.max(meta - realizado, 0) : Number(restanteCell) || 0;
      const status = String(row[columns.Status - 1] || "").trim() || (restante > 0 ? "Aberta" : "Encerrada");

      return {
        row: i + 1,
        columns: columns,
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
  if (!payload || !payload.sexo || !payload.faixaEtaria) {
    throw new Error("Dados incompletos para verificar cota: envie sexo e faixaEtaria.");
  }
}

function validateRequiredResponse_(payload) {
  validateRequiredProfile_(payload);

  const requiredFields = ["pesquisador", "cidade", "regiao", "endereco"];
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
    Pesquisador: payload.pesquisador || "",
    Cidade: payload.cidade || "",
    Regiao: payload.regiao || "",
    Endereco: payload.endereco || "",
    Sexo: payload.sexo || "",
    FaixaEtaria: payload.faixaEtaria || "",
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
      row[header] = values[i][index];
      if (values[i][index] !== "") hasValue = true;
    });

    if (hasValue) rows.push(row);
  }

  return rows;
}

function countBy_(rows, field) {
  return rows.reduce(function(acc, row) {
    const key = String(row[field] || "NÃ£o informado").trim() || "NÃ£o informado";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function getColumnMap_(headers) {
  return headers.reduce(function(map, header, index) {
    map[header] = index + 1;
    return map;
  }, {});
}

function normalizeText_(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
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

  // Migra planilhas antigas que comeÃ§avam em DataHora para o novo formato com UniqueId.
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

  RESPONSE_HEADERS.forEach(function(header) {
    const latestHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) {
      return String(value).trim();
    });
    if (latestHeaders.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
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

  columnsToEnsure.push("RespostaAberta", "RespostasJson", "Origem", "StatusSincronizacao");

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

