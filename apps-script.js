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
     Execute como: você mesmo.
     Quem tem acesso: qualquer pessoa com o link.
  5. Cole a URL publicada em API_URL nos arquivos script.js e dashboard.js.
*/

const SPREADSHEET_ID = "COLE_AQUI_O_ID_DA_SUA_PLANILHA";

const SHEETS = {
  responses: "Respostas",
  quotas: "Cotas",
  researchers: "Pesquisadores",
  questions: "Perguntas"
};

const QUOTA_HEADERS = ["Sexo", "FaixaEtaria", "Meta", "Realizado", "Restante", "Status"];

const RESPONSE_HEADERS = [
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
  "RespostaAberta"
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
  const quota = findQuota_(quotasSheet, payload.sexo, payload.faixaEtaria);

  if (!quota) {
    return {
      ok: false,
      open: false,
      error: "quota_not_found",
      message: "Cota não encontrada para este perfil. Confira Sexo e FaixaEtaria na aba Cotas."
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

    const quota = findQuota_(quotasSheet, payload.sexo, payload.faixaEtaria);

    if (!quota || !isQuotaOpen_(quota)) {
      return {
        ok: false,
        error: "quota_closed",
        message: "Cota encerrada para este perfil. Procure outro entrevistado."
      };
    }

    responsesSheet.appendRow([
      new Date(),
      payload.pesquisador || "",
      payload.cidade || "",
      payload.regiao || "",
      payload.endereco || "",
      payload.sexo || "",
      payload.faixaEtaria || "",
      payload.p1 || "",
      payload.p2 || "",
      payload.p3 || "",
      payload.p4 || "",
      payload.p5 || "",
      payload.respostaAberta || ""
    ]);

    const nextRealizado = quota.realizado + 1;
    const nextRestante = Math.max(quota.meta - nextRealizado, 0);
    const nextStatus = nextRestante > 0 ? "Aberta" : "Encerrada";

    quotasSheet.getRange(quota.row, quota.columns.Realizado).setValue(nextRealizado);
    quotasSheet.getRange(quota.row, quota.columns.Restante).setValue(nextRestante);
    quotasSheet.getRange(quota.row, quota.columns.Status).setValue(nextStatus);

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
  const quotas = getSheetObjects_(quotasSheet).map(function(row) {
    return {
      sexo: row.Sexo || "",
      faixaEtaria: row.FaixaEtaria || "",
      meta: Number(row.Meta) || 0,
      realizado: Number(row.Realizado) || 0,
      restante: Number(row.Restante) || 0,
      status: row.Status || ""
    };
  });

  return {
    ok: true,
    total: responses.length,
    bySexo: countBy_(responses, "Sexo"),
    byFaixaEtaria: countBy_(responses, "FaixaEtaria"),
    byCidade: countBy_(responses, "Cidade"),
    byPesquisador: countBy_(responses, "Pesquisador"),
    quotas: quotas
  };
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
    throw new Error(`Aba "${sheetName}" não encontrada. Crie as abas: Respostas, Cotas, Pesquisadores e Perguntas.`);
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

  const requiredFields = ["pesquisador", "cidade", "regiao", "endereco", "p1", "p2", "p3", "p4", "p5"];
  const missing = requiredFields.filter(function(field) {
    return !payload[field];
  });

  if (missing.length) {
    throw new Error(`Dados incompletos para salvar resposta. Campos faltando: ${missing.join(", ")}.`);
  }
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
    const key = String(row[field] || "Não informado").trim() || "Não informado";
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
  return String(value || "").trim().toLowerCase();
}

function ensureResponseHeaders_(sheet) {
  const firstRow = sheet.getRange(1, 1, 1, RESPONSE_HEADERS.length).getValues()[0];
  const isEmpty = firstRow.every(function(cell) {
    return cell === "";
  });

  if (isEmpty) {
    sheet.getRange(1, 1, 1, RESPONSE_HEADERS.length).setValues([RESPONSE_HEADERS]);
  }
}
