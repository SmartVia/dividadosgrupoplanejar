(function () {
  const OPTION_KEYS_EXTENDED = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  const SCALE_WEIGHTS_EXTENDED = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };
  const MAX_CLOSED = 100;
  const MAX_OPEN = 20;

  window.getQuestionAlternatives = function getQuestionAlternatives(question, type) {
    const alternatives = {};

    if (question.alternatives && typeof question.alternatives === "object") {
      OPTION_KEYS_EXTENDED.forEach((key) => {
        if (question.alternatives[key]) alternatives[key] = String(question.alternatives[key]).trim();
      });
    }

    OPTION_KEYS_EXTENDED.forEach((key) => {
      const value = question[key.toLowerCase()] || question[key] || "";
      if (value && !alternatives[key]) alternatives[key] = String(value).trim();
    });

    if (type === "escala" && !Object.keys(alternatives).length) {
      return {
        A: "Otimo",
        B: "Bom",
        C: "Regular",
        D: "Ruim",
        E: "Pessimo",
        F: "N.T.O"
      };
    }

    return alternatives;
  };

  window.normalizeQuestions = function normalizeQuestions(questions) {
    return (questions || [])
      .filter((question) => normalizeText(question.ativa || question.Ativa || "Sim") !== "nao")
      .sort((a, b) => Number(a.ordem || 99) - Number(b.ordem || 99))
      .map((question, index) => {
        const type = normalizeQuestionType(question.tipo || question.Tipo || "Fechada");
        const id = normalizeQuestionId(question.id || question.ID || question.codigo || question.Codigo || `P${index + 1}`, type, index);
        const alternatives = window.getQuestionAlternatives(question, type);

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
  };

  window.renderQuestions = function renderQuestions(questions) {
    const normalizedQuestions = window.normalizeQuestions(questions);
    const activeQuestions = normalizedQuestions
      .filter((question) => normalizeQuestionType(question.tipo) !== "abertatexto" || getOpenQuestionCount(normalizedQuestions, question) <= MAX_OPEN)
      .slice(0, MAX_CLOSED + MAX_OPEN);
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

      const options = OPTION_KEYS_EXTENDED
        .filter((key) => question.alternatives[key])
        .map((key, optionIndex) => `
          <label>
            <input type="radio" name="${fieldName}" value="${key}" data-option-text="${escapeHtml(question.alternatives[key])}" ${optionIndex === 0 ? "required" : ""}>
            ${key}) ${escapeHtml(question.alternatives[key])}${type === "escala" && SCALE_WEIGHTS_EXTENDED[key] ? ` <small>Peso ${SCALE_WEIGHTS_EXTENDED[key]}</small>` : ""}
          </label>
        `)
        .join("");
      const hasOtherOption = OPTION_KEYS_EXTENDED.some((key) => isOtherOption(question.alternatives[key]));

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
  };
})();
