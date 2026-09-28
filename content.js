// content.js - SoftExpert Suite Extractor & Auto-Filler

function ehValidoSolicitante(texto) {
  if (!texto) return false;
  const t = texto.trim().toLowerCase();
  // Ignora variáveis de sistema, ids técnicos e termos padrão
  if (t === "cduser" || t === "nmuser" || t.includes("cduser") || t.startsWith("bc_") || t === "selecione" || t === "nenhum") {
    return false;
  }
  return t.length >= 3 && t.length <= 80;
}

function extrairTramites(doc) {
  const tramites = [];
  if (!doc) return tramites;

  try {
    // Procura linhas da tabela de trâmites (classes e seletores do SE Lite em React)
    const rows = doc.querySelectorAll('tr[data-test-selector="rctBodyRow"], tr.BodyRow_row_R9nDZ');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td[data-test-selector="rctBodyCell"], td');
      // Colunas: [0: Checkbox], [1: Data], [2: Retorno], [3: Atividade], [4: Responsável], [5: Descrição], [6: Anexo]
      if (cells.length >= 6) {
        const data = (cells[1]?.innerText || "").trim();
        const papel = (cells[2]?.innerText || "").trim();
        const atividade = (cells[3]?.innerText || "").trim();
        const responsavel = (cells[4]?.innerText || "").trim();

        // O SE guarda o texto completo em uma div display:none quando há "ver mais..."
        const cellDesc = cells[5];
        const hiddenFullText = cellDesc?.querySelector('div[style*="display: none"]');
        let desc = (hiddenFullText?.innerText || cellDesc?.innerText || "").trim();
        desc = desc.replace(/ver mais\.\.\.$/i, "").trim();

        const anexo = (cells[6]?.innerText || "").trim();

        if (data && (responsavel || desc)) {
          tramites.push({
            data,
            papel,
            atividade,
            responsavel,
            descricao: desc,
            anexo
          });
        }
      }
    });
  } catch (err) {
    console.warn("Aviso ao extrair trâmites:", err);
  }

  return tramites;
}

function formatarTramitesMarkdown(tramites) {
  if (!tramites || tramites.length === 0) return "";

  let md = "## Histórico de Trâmites\n\n";
  tramites.forEach(t => {
    md += `#### [${t.data}] ${t.papel ? `${t.papel} — ` : ""}${t.responsavel}\n`;
    let meta = [];
    if (t.atividade) meta.push(`**Atividade:** ${t.atividade}`);
    if (t.anexo) meta.push(`📎 **Anexo:** ${t.anexo}`);
    if (meta.length > 0) md += `${meta.join(" | ")}\n\n`;

    if (t.descricao) {
      const citacao = t.descricao.split("\n").map(l => `> ${l}`).join("\n");
      md += `${citacao}\n\n`;
    }
  });

  return md;
}

function extrairDoDocumento(doc) {
  let solicitante = "";
  let descricao = "";
  let detalhes = [];

  if (!doc) return { solicitante, descricao, detalhes };

  try {
    // 1. PRIORIDADE MÁXIMA: Campo de Solicitante no Formulário React/Lite do SoftExpert
    const inputsReact = doc.querySelectorAll('input[title="Nome"], input[data-test-id="85"], input[class*="rctFormInputInput"], input[title*="Solicitante" i]');
    for (const inp of inputsReact) {
      const val = (inp.value || inp.getAttribute("value") || "").trim();
      if (ehValidoSolicitante(val)) {
        solicitante = val;
        break;
      }
    }

    // 2. Procura Textareas (descrição, erro, detalhamento)
    const textareas = doc.querySelectorAll("textarea, [class*='rctForm'] textarea, textarea[class*='rctForm'], textarea [class*='FormInput_rctFormInputInput_mLSrE']");
    textareas.forEach(t => {
      const val = (t.value || t.innerText || "").trim();
      if (val.length > 5 && !descricao.includes(val)) {
        descricao += (descricao ? "\n\n" : "") + val;
      }
    });

    // 3. Fallback de Solicitante se ainda não achou
    if (!ehValidoSolicitante(solicitante)) {
      const inputs = doc.querySelectorAll("input[type='text'], input:not([type])");
      for (const inp of inputs) {
        const val = (inp.value || inp.getAttribute("value") || "").trim();
        const placeholder = (inp.placeholder || "").toLowerCase();
        const idName = ((inp.id || "") + (inp.name || "")).toLowerCase();
        if ((placeholder.includes("solicitante") || idName.includes("solicitante")) && ehValidoSolicitante(val)) {
          solicitante = val;
          break;
        }
      }
    }

    // 4. Procura campos adicionais relevantes
    const labels = doc.querySelectorAll(".dhx_label, label, [class*='label'], .panel-title, strong, b");
    labels.forEach(lbl => {
      const labelText = (lbl.innerText || "").trim();
      if (labelText.length > 2 && labelText.length < 50) {
        const container = lbl.closest(".dhx_form-group, .form-group, div, tr");
        if (container) {
          const valEl = container.querySelector("input:not([type='hidden']), textarea, select, .dhx_text");
          const valText = (valEl?.value || valEl?.innerText || "").trim();
          if (valText && valText !== labelText && valText.length < 100) {
            detalhes.push(`- **${labelText.replace(/:$/, "")}:** ${valText}`);
          }
        }
      }
    });

    // 5. Coleta histórico de trâmites
    const tramites = extrairTramites(doc);

    return { solicitante, descricao, detalhes, tramites };
  } catch (err) {
    console.warn("Erro ao ler documento interno do SoftExpert:", err);
    return { solicitante, descricao, detalhes, tramites: [] };
  }
}

function coletarRecursivo(doc) {
  const resultado = {
    solicitante: "",
    descricao: "",
    detalhes: [],
    tramites: []
  };

  const dadosDoc = extrairDoDocumento(doc);
  if (ehValidoSolicitante(dadosDoc.solicitante)) resultado.solicitante = dadosDoc.solicitante;
  if (dadosDoc.descricao) resultado.descricao = dadosDoc.descricao;
  resultado.detalhes.push(...dadosDoc.detalhes);
  if (dadosDoc.tramites) resultado.tramites.push(...dadosDoc.tramites);

  // Vasculha todos os iframes da página (incluindo ribbonFrame e sub-iframes)
  const iframes = doc.querySelectorAll("iframe");
  iframes.forEach(iframe => {
    try {
      const subDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (subDoc) {
        const subResultado = coletarRecursivo(subDoc);
        
        if (ehValidoSolicitante(subResultado.solicitante)) {
          resultado.solicitante = subResultado.solicitante;
        }
        
        if (subResultado.descricao) {
          resultado.descricao += (resultado.descricao ? "\n\n" : "") + subResultado.descricao;
        }
        resultado.detalhes.push(...subResultado.detalhes);

        if (subResultado.tramites && subResultado.tramites.length > 0) {
          resultado.tramites.push(...subResultado.tramites);
        }
      }
    } catch (e) {
      // Cross-origin se houver iframe externo
    }
  });

  return resultado;
}

function extrairDadosSoftExpert() {
  const docRaiz = window.top.document;

  const headerRaw = docRaiz.getElementById("headerTitle")?.innerText?.trim() || 
                    docRaiz.querySelector(".mainTitleOneLine")?.innerText?.trim() || "";
  
  const subTitle = docRaiz.getElementById("headerSubTitle")?.innerText?.trim() || 
                   docRaiz.querySelector(".subTitleOneLine")?.innerText?.trim() || "";

  const statusEtapa = docRaiz.getElementById("statusTextSpan")?.innerText?.trim() || 
                      docRaiz.querySelector(".statusText")?.innerText?.trim() || "Execução";

  let numeroChamado = "";
  let tituloChamado = headerRaw;
  const matchHeader = headerRaw.match(/^(\d+)\s*[-:]\s*(.+)$/);
  if (matchHeader) {
    numeroChamado = matchHeader[1].trim();
    tituloChamado = matchHeader[2].trim();
  } else if (!numeroChamado) {
    const idMatch = headerRaw.match(/\b\d{5,7}\b/) || window.location.href.match(/idprocess=(\d+)/);
    if (idMatch) numeroChamado = idMatch[1] || idMatch[0];
  }

  const coleta = coletarRecursivo(docRaiz);

  if (!ehValidoSolicitante(coleta.solicitante) && coleta.tramites.length > 0) {
    const tramiteSolicitante = coleta.tramites.find(t => t.papel.toLowerCase().includes("solicitante"));
    if (tramiteSolicitante && ehValidoSolicitante(tramiteSolicitante.responsavel)) {
      coleta.solicitante = tramiteSolicitante.responsavel;
    }
  }

  const tramitesUnicos = [];
  const chavesVistas = new Set();
  coleta.tramites.forEach(t => {
    const k = `${t.data}-${t.responsavel}-${t.descricao.substring(0, 30)}`;
    if (!chavesVistas.has(k)) {
      chavesVistas.add(k);
      tramitesUnicos.push(t);
    }
  });

  const tramitesMarkdown = formatarTramitesMarkdown(tramitesUnicos);
  const detalhesUnicos = Array.from(new Set(coleta.detalhes));

  return {
    numeroChamado: numeroChamado || "Sem-Numero",
    tituloChamado: tituloChamado || "Chamado Sem Título",
    processo: subTitle || "Processo de Suporte",
    etapa: statusEtapa,
    solicitante: ehValidoSolicitante(coleta.solicitante) ? coleta.solicitante : "Não identificado",
    descricao: coleta.descricao || "Descrição não encontrada automaticamente.",
    camposAdicionais: detalhesUnicos.slice(0, 10).join("\n"),
    tramitesMarkdown: tramitesMarkdown,
    qtdTramites: tramitesUnicos.length,
    urlChamado: window.location.href,
    dataCaptura: new Date().toISOString().split("T")[0]
  };
}

// ==============================================================================
// FUNÇÕES DE INJEÇÃO / PREENCHIMENTO DE FORMULÁRIO (SOFTEXPERT REACT/DHTMLX)
// ==============================================================================

function extrairPartesData(dataStr) {
  if (!dataStr) return null;
  const s = String(dataStr).trim().replace(/^['"]|['"]$/g, "");
  
  // YYYY-MM-DD ou YYYY/MM/DD
  const mIso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (mIso) {
    return {
      ano: mIso[1],
      mes: mIso[2].padStart(2, "0"),
      dia: mIso[3].padStart(2, "0")
    };
  }

  // DD/MM/YYYY ou DD-MM-YYYY
  const mBr = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (mBr) {
    return {
      dia: mBr[1].padStart(2, "0"),
      mes: mBr[2].padStart(2, "0"),
      ano: mBr[3]
    };
  }

  return null;
}

function normalizarDataBR(dataStr) {
  const p = extrairPartesData(dataStr);
  return p ? `${p.dia}/${p.mes}/${p.ano}` : dataStr;
}

function injetarPatchMomentEmTodosOsDocs() {
  const docs = coletarTodosOsDocumentos();
  for (const doc of docs) {
    try {
      if (doc.getElementById("__se_moment_patch__")) continue;
      const script = doc.createElement("script");
      script.id = "__se_moment_patch__";
      script.src = chrome.runtime.getURL("patch-moment.js");
      (doc.head || doc.documentElement).appendChild(script);
    } catch (e) {
      console.warn("Erro ao injetar script do moment:", e);
    }
  }
}

function preencherCampoData(elData, dataStr) {
  if (!elData) return false;

  const partes = extrairPartesData(dataStr);
  if (!partes) return false;

  const { dia, mes, ano } = partes;
  const dataBr = `${dia}/${mes}/${ano}`;
  const dataIso = `${ano}-${mes}-${dia}`;
  const dateObj = new Date(Number(ano), Number(mes) - 1, Number(dia), 12, 0, 0);

  // 1. Aplica o patch no moment.js do SoftExpert
  injetarPatchMomentEmTodosOsDocs();

  // 2. Foca no elemento e seleciona todo o texto existente (preparando para Ctrl+V / insertText)
  try {
    elData.focus();
    elData.select();
  } catch(e) {}

  // 3. Simula colagem nativa idêntica ao Ctrl+V (execCommand insertText)
  let colouSucesso = false;
  try {
    colouSucesso = elData.ownerDocument.execCommand("insertText", false, dataBr);
  } catch(e) {}

  // 4. Se execCommand não preencheu, aplica via setter nativo com eventos de colagem
  if (!colouSucesso || !elData.value || !elData.value.includes(dia)) {
    setNativeValue(elData, dataBr);
  }

  // 5. Dispara eventos de input e paste para o React/máscara reconhecerem
  try {
    elData.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertFromPaste",
      data: dataBr
    }));
    elData.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    elementDisparaChange(elData);
  } catch(e) {}

  // 6. Tenta invocar via React Fiber / Props (DayPickerInput onDayChange)
  try {
    let cur = elData;
    for (let i = 0; i < 5 && cur; i++) {
      const pKey = Object.keys(cur).find(k => k.startsWith("__reactProps") || k.startsWith("__reactEventHandlers"));
      if (pKey && cur[pKey]) {
        const props = cur[pKey];
        if (typeof props.onDayChange === "function") {
          props.onDayChange(dateObj, {}, elData);
          break;
        }
      }
      cur = cur.parentElement;
    }
  } catch (err) {}

  // 7. Notifica o onChange do React diretamente se disponível
  try {
    const pKey = Object.keys(elData).find(k => k.startsWith("__reactProps") || k.startsWith("__reactEventHandlers"));
    if (pKey && elData[pKey] && typeof elData[pKey].onChange === "function") {
      elData[pKey].onChange({
        target: { value: dataBr, name: elData.name, id: elData.id },
        currentTarget: { value: dataBr, name: elData.name, id: elData.id },
        bubbles: true
      });
    }
  } catch (err) {}

  // 8. FECHA O CALENDÁRIO / OVERLAY IMEDIATAMENTE (sem deixá-lo aberto na tela)
  try {
    elData.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    elData.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    elData.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true }));
    elData.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true }));
  } catch(e) {}

  // Remove o foco do campo de data
  try {
    elData.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    elData.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    elData.blur();
  } catch(e) {}

  // Oculta quaisquer overlays do calendário que o SoftExpert tenha aberto
  try {
    const overlays = elData.ownerDocument.querySelectorAll(".DayPickerInput-Overlay, .DayPickerInput-OverlayWrapper, [class*='DayPicker'][class*='Overlay']");
    overlays.forEach(ov => {
      ov.style.display = "none";
    });
  } catch(e) {}

  return true;
}

function elementDisparaChange(el) {
  try {
    el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  } catch(e) {}
}

function coletarTodosOsDocumentos() {
  const docs = [];
  function explorar(w) {
    if (!w) return;
    try {
      if (w.document && !docs.includes(w.document)) {
        docs.push(w.document);
      }
    } catch (e) {}

    try {
      const iframes = w.document ? Array.from(w.document.querySelectorAll('iframe, frame')) : [];
      for (const ifr of iframes) {
        try {
          const subWin = ifr.contentWindow;
          if (subWin) explorar(subWin);
        } catch (e) {}
      }
    } catch (e) {}

    try {
      if (w.frames && w.frames.length > 0) {
        for (let i = 0; i < w.frames.length; i++) {
          try {
            explorar(w.frames[i]);
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  let inicio = window;
  try {
    if (window.top && window.top.document) {
      inicio = window.top;
    }
  } catch (e) {}

  explorar(inicio);
  return docs;
}

function buscarCampoEmTodosOsDocs(fnBusca) {
  const docs = coletarTodosOsDocumentos();
  for (const doc of docs) {
    try {
      const el = fnBusca(doc);
      if (el) return el;
    } catch (e) {}
  }
  return null;
}

function setNativeValue(element, value) {
  if (!element || element.disabled || element.readOnly) return false;
  try {
    element.focus();

    const win = element.ownerDocument?.defaultView || window;
    const isTextarea = element instanceof win.HTMLTextAreaElement || element.tagName === "TEXTAREA";
    const proto = isTextarea 
      ? (win.HTMLTextAreaElement?.prototype || HTMLTextAreaElement.prototype)
      : (win.HTMLInputElement?.prototype || HTMLInputElement.prototype);
      
    const valueSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    if (element._valueTracker) {
      try { element._valueTracker.setValue(""); } catch(e) {}
    }

    // Dispara bateria completa de eventos DOM para que React / DayPicker / DHTMLX sincronizem estado
    const ev = new Event("input", { bubbles: true, cancelable: true });
    ev.simulated = true;
    element.dispatchEvent(ev);
    element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter" }));
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter" }));
    element.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true }));

    // Aplica feedback visual de sucesso somente se o valor foi aceito
    const ok = (element.value || "").trim().length > 0;
    if (ok) {
      const oldBorder = element.style.border;
      const oldBg = element.style.backgroundColor;
      element.style.border = "2px solid #16a34a";
      element.style.backgroundColor = "#f0fdf4";
      setTimeout(() => {
        element.style.border = oldBorder;
        element.style.backgroundColor = oldBg;
      }, 2500);
    }

    return ok;
  } catch (err) {
    console.warn("Erro ao aplicar setNativeValue no SoftExpert:", err);
    try {
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (e) {
      return false;
    }
  }
}

function buscarInputPorTextoRotulo(doc, termo) {
  if (!doc) return null;
  const regex = new RegExp(termo, "i");
  
  const candidatos = Array.from(doc.querySelectorAll("label, .dhx_label, span, div, b, strong, p, td, th"));
  for (const el of candidatos) {
    const texto = (el.innerText || el.textContent || "").trim();
    if (!texto || !regex.test(texto)) continue;

    // Se algum nó filho já contém o texto, deixa o filho mais específico lidar
    const temFilhoComTexto = Array.from(el.children).some(ch => regex.test(ch.innerText || ch.textContent || ""));
    if (temFilhoComTexto) continue;

    // 1. <label for="...">
    if (el.tagName === "LABEL" && el.htmlFor) {
      const target = doc.getElementById(el.htmlFor);
      if (target && !target.disabled && !target.readOnly) return target;
    }

    // 2. Input contido dentro do próprio elemento
    const inpDentro = el.querySelector("input:not([type=\"hidden\"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])");
    if (inpDentro) return inpDentro;

    // 3. Irmãos subsequentes imediatos
    let prox = el.nextElementSibling;
    while (prox) {
      if ((prox.tagName === "INPUT" || prox.tagName === "TEXTAREA") && !prox.disabled && !prox.readOnly) return prox;
      const inpNoProx = prox.querySelector("input:not([type=\"hidden\"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])");
      if (inpNoProx) return inpNoProx;
      prox = prox.nextElementSibling;
    }

    // 4. Subir na hierarquia de pais buscando o input (suporte a layouts em grid)
    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 6 && parent.tagName !== "BODY" && parent.tagName !== "HTML") {
      const inpParent = parent.querySelector("input:not([type=\"hidden\"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])");
      if (inpParent && !el.contains(inpParent)) {
        return inpParent;
      }
      
      let parentNext = parent.nextElementSibling;
      while (parentNext) {
        if ((parentNext.tagName === "INPUT" || parentNext.tagName === "TEXTAREA") && !parentNext.disabled && !parentNext.readOnly) return parentNext;
        const inpPNext = parentNext.querySelector("input:not([type=\"hidden\"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])");
        if (inpPNext) return inpPNext;
        parentNext = parentNext.nextElementSibling;
      }

      parent = parent.parentElement;
      depth++;
    }
  }

  return null;
}

// ------------------------------------------------------------------------------
// LOCALIZADORES ESPECÍFICOS PARA CADA CAMPO DO FORMULÁRIO DE APONTAMENTO
// ------------------------------------------------------------------------------

function buscarCampoChamado(doc) {
  if (!doc) return null;

  // 0. Seletor exato com title "Chamado:" não desabilitado
  const porTitle = doc.querySelector('input[title="Chamado:"]:not([disabled]):not([readonly])') ||
                   doc.querySelector('input[title*="Chamado" i]:not([disabled]):not([readonly])');
  if (porTitle) return porTitle;

  // 1. Rótulo específico
  const porRotulo = buscarInputPorTextoRotulo(doc, "Chamado") ||
                    buscarInputPorTextoRotulo(doc, "Solicitação") ||
                    buscarInputPorTextoRotulo(doc, "pesquisar");
  if (porRotulo && !porRotulo.disabled && !porRotulo.readOnly) return porRotulo;

  // 2. Placeholder
  const porPlaceholder = Array.from(doc.querySelectorAll('input:not([type="hidden"]):not([disabled]):not([readonly])')).find(inp => {
    const ph = (inp.getAttribute("placeholder") || "").toLowerCase();
    return ph.includes("chamado") || ph.includes("pesquisar") || ph.includes("clique aqui");
  });
  if (porPlaceholder) return porPlaceholder;

  // 3. Name ou Id
  const porNameId = Array.from(doc.querySelectorAll('input:not([type="hidden"]):not([disabled]):not([readonly])')).find(inp => {
    const s = ((inp.id || "") + " " + (inp.name || "")).toLowerCase();
    return s.includes("chamado") || s.includes("solicitacao") || s.includes("processo");
  });
  if (porNameId) return porNameId;

  return null;
}

function buscarCampoData(doc) {
  if (!doc) return null;

  // 0. Seletor exato com title "Data de apontamento:" NÃO DESABILITADO
  const porTitleExato = doc.querySelector('input[title="Data de apontamento:"]:not([disabled]):not([readonly])') ||
                        doc.querySelector('input[title*="Data de apontamento" i]:not([disabled]):not([readonly])');
  if (porTitleExato) return porTitleExato;

  // 1. Componente DayPicker / Calendar do SoftExpert (React Lite) NÃO DESABILITADO
  const dayPickerInp = Array.from(doc.querySelectorAll('.DayPickerInput input, [class*="DayPicker"] input, [class*="Calendar"] input, [class*="DatePicker"] input'))
    .find(i => !i.disabled && !i.readOnly && !/^(data)$/i.test((i.title || "").trim()));
  if (dayPickerInp) return dayPickerInp;

  // 2. Por placeholder clássico de data: DD/MM/YYYY, dd/mm/aaaa, etc. NÃO DESABILITADO
  const porPlaceholder = Array.from(doc.querySelectorAll('input:not([type="hidden"]):not([disabled]):not([readonly])')).find(inp => {
    const ph = (inp.getAttribute("placeholder") || "").toLowerCase();
    const title = (inp.title || "").toLowerCase();
    if (title === "data") return false;
    return (ph.includes("dd/mm") || ph.includes("aaaa") || ph.includes("yyyy") || ph.includes("__/__"));
  });
  if (porPlaceholder) return porPlaceholder;

  // 3. Por rótulo específico "Data de apontamento"
  const porRotulo = buscarInputPorTextoRotulo(doc, "Data de apontamento") ||
                    buscarInputPorTextoRotulo(doc, "Data do apontamento") ||
                    buscarInputPorTextoRotulo(doc, "Data apontamento");
  if (porRotulo && !porRotulo.disabled && !porRotulo.readOnly) return porRotulo;

  // 4. input type="date"
  const inpDate = doc.querySelector('input[type="date"]:not([disabled]):not([readonly])');
  if (inpDate) return inpDate;

  // 5. Name ou Id
  const porNameId = Array.from(doc.querySelectorAll('input:not([type="hidden"]):not([disabled]):not([readonly])')).find(inp => {
    const s = ((inp.id || "") + " " + (inp.name || "")).toLowerCase();
    return s.includes("dtapontamento") || s.includes("dataapontamento") || s.includes("dt_apontamento") || s.includes("data_apontamento");
  });
  if (porNameId) return porNameId;

  return null;
}

function buscarCampoHoraInicio(doc) {
  if (!doc) return null;

  // 0. Title específico
  const porTitle = doc.querySelector('input[title*="Hora início" i]:not([disabled]):not([readonly]), input[title*="Hora inicio" i]:not([disabled]):not([readonly])');
  if (porTitle) return porTitle;

  // 1. Rótulo "Hora inicio" ou "Início"
  const porRotulo = buscarInputPorTextoRotulo(doc, "Hora inicio") ||
                    buscarInputPorTextoRotulo(doc, "Hora início") ||
                    buscarInputPorTextoRotulo(doc, "Início");
  if (porRotulo && !porRotulo.disabled && !porRotulo.readOnly) return porRotulo;

  // 2. Primeiro input com placeholder HH:MM
  const inputsHHMM = Array.from(doc.querySelectorAll('input:not([type="hidden"]):not([disabled]):not([readonly])')).filter(inp => {
    const ph = (inp.getAttribute("placeholder") || "").toUpperCase();
    return ph.includes("HH:MM") || ph.includes("__:__");
  });
  if (inputsHHMM.length >= 1) return inputsHHMM[0];

  // 3. Timepicker input
  const timePickers = Array.from(doc.querySelectorAll('.dhx_timepicker-input:not([disabled]), [class*="timepicker"] input:not([disabled]), input[type="time"]:not([disabled])'));
  if (timePickers.length >= 1) return timePickers[0];

  // 4. Name ou Id
  const porNameId = Array.from(doc.querySelectorAll('input:not([type="hidden"]):not([disabled]):not([readonly])')).find(inp => {
    const s = ((inp.id || "") + " " + (inp.name || "")).toLowerCase();
    return s.includes("horainicio") || s.includes("hrinicio") || s.includes("hora_inicio");
  });
  if (porNameId) return porNameId;

  return null;
}

function buscarCampoHoraFim(doc) {
  if (!doc) return null;

  // 0. Title específico
  const porTitle = doc.querySelector('input[title*="Hora final" i]:not([disabled]):not([readonly]), input[title*="Hora fim" i]:not([disabled]):not([readonly]), input[title*="Hora término" i]:not([disabled]):not([readonly])');
  if (porTitle) return porTitle;

  // 1. Rótulo "Hora final", "Hora fim", "Fim", "Término"
  const porRotulo = buscarInputPorTextoRotulo(doc, "Hora final") ||
                    buscarInputPorTextoRotulo(doc, "Hora fim") ||
                    buscarInputPorTextoRotulo(doc, "Fim") ||
                    buscarInputPorTextoRotulo(doc, "Término");
  if (porRotulo && !porRotulo.disabled && !porRotulo.readOnly) return porRotulo;

  // 2. Segundo input com placeholder HH:MM
  const inputsHHMM = Array.from(doc.querySelectorAll('input:not([type="hidden"]):not([disabled]):not([readonly])')).filter(inp => {
    const ph = (inp.getAttribute("placeholder") || "").toUpperCase();
    return ph.includes("HH:MM") || ph.includes("__:__");
  });
  if (inputsHHMM.length >= 2) return inputsHHMM[1];

  // 3. Timepicker input (segundo)
  const timePickers = Array.from(doc.querySelectorAll('.dhx_timepicker-input:not([disabled]), [class*="timepicker"] input:not([disabled]), input[type="time"]:not([disabled])'));
  if (timePickers.length >= 2) return timePickers[1];

  // 4. Name ou Id
  const porNameId = Array.from(doc.querySelectorAll('input:not([type="hidden"]):not([disabled]):not([readonly])')).find(inp => {
    const s = ((inp.id || "") + " " + (inp.name || "")).toLowerCase();
    return s.includes("horafim") || s.includes("horafinal") || s.includes("hrfim") || s.includes("hora_fim");
  });
  if (porNameId) return porNameId;

  return null;
}

function buscarCampoAtividade(doc) {
  if (!doc) return null;

  // 0. Title específico
  const porTitle = doc.querySelector('textarea[title*="Atividade" i]:not([disabled]):not([readonly]), input[title*="Atividade" i]:not([disabled]):not([readonly])');
  if (porTitle) return porTitle;

  // 1. Rótulo "Atividade executada" ou "Atividade"
  const porRotulo = buscarInputPorTextoRotulo(doc, "Atividade executada") ||
                    buscarInputPorTextoRotulo(doc, "Atividade");
  if (porRotulo && !porRotulo.disabled && !porRotulo.readOnly) return porRotulo;

  // 2. Textarea na tela (geralmente só há um na janela de apontamento)
  const textareas = Array.from(doc.querySelectorAll('textarea:not([disabled]):not([readonly])'));
  if (textareas.length > 0) {
    const visivel = textareas.find(t => t.offsetParent !== null) || textareas[0];
    return visivel;
  }

  // 3. Name ou Id
  const porNameId = Array.from(doc.querySelectorAll('textarea:not([disabled]):not([readonly]), input:not([type="hidden"]):not([disabled]):not([readonly])')).find(inp => {
    const s = ((inp.id || "") + " " + (inp.name || "")).toLowerCase();
    return s.includes("atividade") || s.includes("descricao");
  });
  if (porNameId) return porNameId;

  return null;
}

function preencherFormularioApontamento(dados) {
  const relatorio = {
    chamado: false,
    data: false,
    horaInicio: false,
    horaFim: false,
    atividade: false,
    erros: []
  };

  if (!dados) return relatorio;

  // 1. Campo Chamado PRIMEIRO (evita que re-render limpe campos já preenchidos)
  const elChamado = buscarCampoEmTodosOsDocs(buscarCampoChamado);
  if (elChamado && dados.chamado) {
    relatorio.chamado = setNativeValue(elChamado, dados.chamado);
  } else if (!elChamado) {
    relatorio.erros.push("Chamado");
  }

  // 2. Campo Data de apontamento SEGUNDO
  const elData = buscarCampoEmTodosOsDocs(buscarCampoData);
  if (elData && dados.data) {
    relatorio.data = preencherCampoData(elData, dados.data);
  } else if (!elData) {
    relatorio.erros.push("Data");
  }

  // 3. Campo Hora início
  const elHoraInicio = buscarCampoEmTodosOsDocs(buscarCampoHoraInicio);
  if (elHoraInicio && dados.horaInicio) {
    relatorio.horaInicio = setNativeValue(elHoraInicio, dados.horaInicio);
  } else if (!elHoraInicio) {
    relatorio.erros.push("Hora Início");
  }

  // 4. Campo Hora final
  const elHoraFim = buscarCampoEmTodosOsDocs(buscarCampoHoraFim);
  if (elHoraFim && dados.horaFim) {
    relatorio.horaFim = setNativeValue(elHoraFim, dados.horaFim);
  } else if (!elHoraFim) {
    relatorio.erros.push("Hora Fim");
  }

  // 5. Campo Atividade executada
  const elAtividade = buscarCampoEmTodosOsDocs(buscarCampoAtividade);
  if (elAtividade && dados.atividade) {
    relatorio.atividade = setNativeValue(elAtividade, dados.atividade);
  } else if (!elAtividade) {
    relatorio.erros.push("Atividade");
  }

  // Feedback visual com Toast na tela do SoftExpert
  mostrarToastFeedback(relatorio);

  return relatorio;
}

function mostrarToastFeedback(relatorio) {
  try {
    const totalPreenchidos = [
      relatorio.chamado,
      relatorio.data,
      relatorio.horaInicio,
      relatorio.horaFim,
      relatorio.atividade
    ].filter(Boolean).length;

    const docs = coletarTodosOsDocumentos();
    const docAlvo = docs[0] || document;

    const toast = docAlvo.createElement("div");
    toast.style.position = "fixed";
    toast.style.bottom = "24px";
    toast.style.right = "24px";
    toast.style.padding = "10px 18px";
    toast.style.background = "#202124";
    toast.style.color = "#ffffff";
    toast.style.fontSize = "12.5px";
    toast.style.fontFamily = "Google Sans, -apple-system, BlinkMacSystemFont, Roboto, sans-serif";
    toast.style.fontWeight = "500";
    toast.style.borderRadius = "24px";
    toast.style.boxShadow = "0 4px 14px rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.12)";
    toast.style.zIndex = "99999999";
    toast.style.display = "flex";
    toast.style.alignItems = "center";
    toast.style.gap = "8px";
    toast.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";

    let iconSvg = "";
    if (totalPreenchidos === 5) {
      iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="#34a853"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
    } else if (totalPreenchidos > 0) {
      iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="#fbbc04"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>';
    } else {
      iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="#ea4335"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';
    }

    let msg = `Apontamento preenchido (${totalPreenchidos}/5 campos)`;
    if (totalPreenchidos < 5 && relatorio.erros && relatorio.erros.length > 0) {
      msg += ` · Pendente: ${relatorio.erros.join(", ")}`;
    }

    toast.innerHTML = `${iconSvg}<span>${msg}</span>`;
    docAlvo.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      setTimeout(() => toast.remove(), 350);
    }, 3200);
  } catch (e) {}
}

function executarPreenchimentoViaMainWorld(dados) {
  return new Promise((resolve) => {
    const reqId = "req_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
    let timeoutId;

    function onMsg(evt) {
      if (evt.data && evt.data.type === "SE_FILL_RESPONSE" && evt.data.reqId === reqId) {
        clearTimeout(timeoutId);
        window.removeEventListener("message", onMsg);
        resolve(evt.data.relatorio);
      }
    }

    window.addEventListener("message", onMsg);
    window.postMessage({ type: "SE_FILL_REQUEST", reqId, dados }, "*");

    timeoutId = setTimeout(() => {
      window.removeEventListener("message", onMsg);
      resolve(null);
    }, 8000);
  });
}

// Ouve mensagens vindas do popup da extensão
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CAPTURAR_SE") {
    const dados = extrairDadosSoftExpert();
    sendResponse(dados);
  } else if (request.action === "PREENCHER_APONTAMENTO") {
    (async () => {
      // 1. Tenta preenchimento completo no MAIN world via se-fill-main.js
      const relMain = await executarPreenchimentoViaMainWorld(request.dados);
      if (relMain && [relMain.chamado, relMain.data, relMain.horaInicio, relMain.horaFim, relMain.atividade].filter(Boolean).length > 0) {
        mostrarToastFeedback(relMain);
        sendResponse({ sucesso: true, relatorio: relMain });
        return;
      }

      // 2. Fallback local via DOM do content script
      const relLocal = preencherFormularioApontamento(request.dados);
      sendResponse({ sucesso: true, relatorio: relLocal });
    })();
    return true; // Mantém o canal de resposta assíncrono aberto
  }
  return true;
});

// Inicializa patch do moment logo no carregamento
try {
  injetarPatchMomentEmTodosOsDocs();
} catch (e) {}

