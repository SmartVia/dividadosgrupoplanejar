/*
  Dividados Pesquisa - Backend Google Apps Script

  Como usar:
  1. Crie uma planilha Google Sheets com as abas:
     Respostas, Cotas, Pesquisadores e Perguntas.
  2. Na aba Cotas, use as colunas:
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
  const action = e.parameter.action;
  const callback = e.parameter.callback;
  const payload = parsePayload_(e);
  let result;

  try {
    if (action === "checkQuota") {
      result = checkQuota_(payload);
    } else if (action === "submitResponse") {
      result = submitResponse_(payload);
    } else if (action === "dashboard") {
      result = getDashboardData_();
    } else {
      result = { ok: false, message: "Ação inválida." };
    }
  } catch (error) {
    result = { ok: false, message: error.message || "Erro interno na API." };
  }

  return output_(result, callback);
}

function parsePayload_(e) {
  if (e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }

  if (e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }

  return {};
}

function output_(data, callback) {
  const json = JSON.stringify(data);
  const content = callback ? `${callback}(${json});` : json;
  const mimeType = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;

  return ContentService
    .createTextOutput(content)
    .setMimeType(mimeType);
}

function checkQuota_(payload) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const quotasSheet = spreadsheet.getSheetByName(SHEETS.quotas);
  const quota = findQuota_(quotasSheet, payload.sexo, payload.faixaEtaria);

  if (!quota) {
    return { ok: false, open: false, error: "quota_not_found", message: "Cota não encontrada." };
  }

  return {
    ok: true,
    open: quota.restante > 0 && quota.status === "Aberta",
    restante: quota.restante,
    status: quota.status
  };
}

function submitResponse_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const responsesSheet = spreadsheet.getSheetByName(SHEETS.responses);
    const quotasSheet = spreadsheet.getSheetByName(SHEETS.quotas);

    ensureResponseHeaders_(responsesSheet);

    const quota = findQuota_(quotasSheet, payload.sexo, payload.faixaEtaria);

    if (!quota || quota.restante <= 0 || quota.status !== "Aberta") {
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
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const responsesSheet = spreadsheet.getSheetByName(SHEETS.responses);
  const quotasSheet = spreadsheet.getSheetByName(SHEETS.quotas);
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

function findQuota_(sheet, sexo, faixaEtaria) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0];
  const columns = getColumnMap_(headers);

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowSexo = String(row[columns.Sexo - 1]).trim();
    const rowFaixa = String(row[columns.FaixaEtaria - 1]).trim();

    if (rowSexo === sexo && rowFaixa === faixaEtaria) {
      const meta = Number(row[columns.Meta - 1]) || 0;
      const realizado = Number(row[columns.Realizado - 1]) || 0;
      const restanteCell = row[columns.Restante - 1];
      const restante = restanteCell === "" ? Math.max(meta - realizado, 0) : Number(restanteCell) || 0;
      const status = String(row[columns.Status - 1] || "").trim() || (restante > 0 ? "Aberta" : "Encerrada");

      return {
        row: i + 1,
        columns: columns,
        sexo: rowSexo,
        faixaEtaria: rowFaixa,
        meta: meta,
        realizado: realizado,
        restante: restante,
        status: status
      };
    }
  }

  return null;
}

function getSheetObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0];
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
    map[String(header).trim()] = index + 1;
    return map;
  }, {});
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
