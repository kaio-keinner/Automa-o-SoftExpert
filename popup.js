// popup.js - SoftExpert & Obsidian Integration (Captura & Lançamento de Apontamentos)

let dadosChamado = {
  numeroChamado: "000000",
  tituloChamado: "Chamado",
  processo: "Suporte",
  etapa: "Execução",
  solicitante: "",
  descricao: "",
  camposAdicionais: "",
  urlChamado: "",
  dataCaptura: new Date().toISOString().split("T")[0]
};

let listaPendentes = [];
let itemSelecionado = null;

const DEFAULT_API_KEY = "0c0da5ffb4ad5fd30bbaf46fdf15bbc78211113402d2b8554cf1b257205244df";

document.addEventListener("DOMContentLoaded", async () => {
  // Toggle do painel de configuração
  const toggleBtn = document.getElementById("toggleConfig");
  const configBody = document.getElementById("configBody");
  const iconToggle = document.getElementById("iconToggle");
  toggleBtn.addEventListener("click", () => {
    const isHidden = configBody.style.display === "none";
    configBody.style.display = isHidden ? "block" : "none";
    if (iconToggle) iconToggle.classList.toggle("rotated", isHidden);
  });

  // Toggle do painel de detalhes do apontamento (Dados do Lançamento)
  const toggleDetalhesBtn = document.getElementById("toggleDetalhesApontamento");
  const detalhesBody = document.getElementById("detalhesApontamentoBody");
  const iconToggleDetalhes = document.getElementById("iconToggleDetalhes");
  if (toggleDetalhesBtn && detalhesBody && iconToggleDetalhes) {
    toggleDetalhesBtn.addEventListener("click", () => {
      const isHidden = detalhesBody.style.display === "none";
      detalhesBody.style.display = isHidden ? "block" : "none";
      iconToggleDetalhes.classList.toggle("rotated", isHidden);
    });
  }

  // Carrega configurações salvas ou padrão
  chrome.storage.sync.get(["obsidianApiKey", "obsidianPort", "obsidianProtocol", "obsidianVaultFolder"], (cfg) => {
    document.getElementById("apiKey").value = cfg.obsidianApiKey || DEFAULT_API_KEY;
    document.getElementById("apiPort").value = cfg.obsidianPort || "27124";
    document.getElementById("apiProtocol").value = cfg.obsidianProtocol || "https";
    document.getElementById("vaultFolder").value = cfg.obsidianVaultFolder || "2 - Chamados/{MES} - {NOME_MES}";
  });

  // Alternância de Abas
  const tabBtnCapturar = document.getElementById("tabBtnCapturar");
  const tabBtnApontar = document.getElementById("tabBtnApontar");
  const viewCapturar = document.getElementById("viewCapturar");
  const viewApontar = document.getElementById("viewApontar");

  tabBtnCapturar.addEventListener("click", () => {
    tabBtnCapturar.classList.add("active");
    tabBtnApontar.classList.remove("active");
    viewCapturar.style.display = "block";
    viewApontar.style.display = "none";
    exibirStatus("", "");
  });

  tabBtnApontar.addEventListener("click", () => {
    tabBtnApontar.classList.add("active");
    tabBtnCapturar.classList.remove("active");
    viewCapturar.style.display = "none";
    viewApontar.style.display = "block";
    exibirStatus("", "");
    carregarApontamentosPendentes();
  });

  // Botão Recarregar Pendentes
  document.getElementById("btnRecarregarPendentes").addEventListener("click", () => {
    carregarApontamentosPendentes();
  });

  // Mudança no select de pendentes
  document.getElementById("selChamadoPendente").addEventListener("change", (e) => {
    const idx = parseInt(e.target.value, 10);
    if (!isNaN(idx) && listaPendentes[idx]) {
      selecionarApontamento(idx);
    }
  });

  // Botões de Apontamento
  document.getElementById("btnPreencherSE").addEventListener("click", () => {
    preencherFormularioNoSE();
  });

  document.getElementById("btnMarcarApontado").addEventListener("click", () => {
    marcarComoApontadoNoObsidian();
  });

  document.getElementById("btnPreencherEMarcar").addEventListener("click", async () => {
    await preencherFormularioNoSE();
    setTimeout(async () => {
      await marcarComoApontadoNoObsidian();
    }, 400);
  });

  // Botões da Aba Capturar
  document.getElementById("btnSalvarObsidian").addEventListener("click", salvarChamadoNoObsidian);
  document.getElementById("btnCopiarMarkdown").addEventListener("click", copiarMarkdownParaClipboard);

  // Inicializa captura da aba ativa se estiver no SoftExpert
  inicializarCapturaAbaAtiva();
});

// ==============================================================================
// FUNÇÕES AUXILIARES DA REST API DO OBSIDIAN
// ==============================================================================

function getConfigObsidian() {
  const apiKey = document.getElementById("apiKey").value.trim() || DEFAULT_API_KEY;
  const port = document.getElementById("apiPort").value.trim() || "27124";
  const protocol = document.getElementById("apiProtocol").value || "https";
  const rawFolder = document.getElementById("vaultFolder").value.trim() || "2 - Chamados/{MES} - {NOME_MES}";

  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const nomesMeses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const nomeMes = nomesMeses[agora.getMonth()];

  const resolvedFolder = rawFolder
    .replace(/{ANO}/gi, ano)
    .replace(/{MES}/gi, mes)
    .replace(/{NOME_MES}/gi, nomeMes)
    .replace(/^\/+|\/+$/g, "");

  return { apiKey, port, protocol, resolvedFolder };
}

function encodePathSegments(path) {
  if (!path) return "";
  return path
    .split("/")
    .filter(seg => seg.length > 0)
    .map(seg => encodeURIComponent(seg))
    .join("/");
}

async function listarArquivosPasta(protocol, port, apiKey, folderPath) {
  const folderEncoded = encodePathSegments(folderPath);
  const url = `${protocol}://127.0.0.1:${port}/vault/${folderEncoded ? folderEncoded + "/" : ""}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json"
      }
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn("Erro ao listar pasta:", folderPath, e);
  }
  return null;
}

async function obterConteudoArquivo(protocol, port, apiKey, fullRelativePath) {
  const encodedPath = encodePathSegments(fullRelativePath);
  const url = `${protocol}://127.0.0.1:${port}/vault/${encodedPath}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "text/markdown"
      }
    });
    if (res.ok) {
      const rawText = await res.text();
      // NORMALIZAÇÃO CRUCIAL CRLF -> LF PARA WINDOWS
      return rawText ? rawText.replace(/\r\n/g, "\n") : null;
    }
  } catch (e) {
    console.warn("Erro ao obter arquivo:", fullRelativePath, e);
  }
  return null;
}

async function salvarArquivo(protocol, port, apiKey, fullRelativePath, markdown) {
  const encodedPath = encodePathSegments(fullRelativePath);
  const url = `${protocol}://127.0.0.1:${port}/vault/${encodedPath}`;
  return await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "text/markdown"
    },
    body: markdown
  });
}

async function deletarArquivo(protocol, port, apiKey, fullRelativePath) {
  const encodedPath = encodePathSegments(fullRelativePath);
  const url = `${protocol}://127.0.0.1:${port}/vault/${encodedPath}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${apiKey}`
    }
  });
  return res.ok;
}

function escapeRegExp(string) {
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizarDataBR(dataStr) {
  if (!dataStr) return "";
  const s = String(dataStr).trim().replace(/^['"]|['"]$/g, "");
  // Se for YYYY-MM-DD ou YYYY/MM/DD
  const mIso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (mIso) {
    const ano = mIso[1];
    const mes = mIso[2].padStart(2, "0");
    const dia = mIso[3].padStart(2, "0");
    return `${dia}/${mes}/${ano}`;
  }
  // Se for DD/MM/YYYY ou DD-MM-YYYY
  const mBr = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (mBr) {
    const dia = mBr[1].padStart(2, "0");
    const mes = mBr[2].padStart(2, "0");
    const ano = mBr[3];
    return `${dia}/${mes}/${ano}`;
  }
  return s;
}

// ==============================================================================
// ABA 2: GERENCIAMENTO DE APONTAMENTOS PENDENTES (OBSIDIAN ➔ SOFTEXPERT)
// ==============================================================================

async function carregarApontamentosPendentes() {
  const { apiKey, port, protocol, resolvedFolder } = getConfigObsidian();
  const badgeQtd = document.getElementById("badgeQtdPendentes");
  const selPendente = document.getElementById("selChamadoPendente");
  const dispPasta = document.getElementById("dispPastaLendo");

  badgeQtd.innerText = "Buscando...";
  badgeQtd.className = "badge badge-warning";
  selPendente.innerHTML = "<option value=''>Carregando chamados do Obsidian...</option>";
  listaPendentes = [];

  exibirStatus("🔍 Conectando ao Obsidian para carregar fila de chamados...", "info");

  try {
    // 1. Tenta listar a pasta resolvida
    let targetFolder = resolvedFolder;
    let data = await listarArquivosPasta(protocol, port, apiKey, targetFolder);

    // Se não encontrou arquivos .md na pasta resolvida, tenta fallback inteligente
    let mdFiles = (data && Array.isArray(data.files)) ? data.files.filter(f => f.endsWith(".md")) : [];
    
    if (mdFiles.length === 0) {
      const fallbacks = [
        "2 - Chamados/09 - Setembro",
        "2 - Chamados",
        "Chamados"
      ];
      for (const fb of fallbacks) {
        if (fb === targetFolder) continue;
        const fbData = await listarArquivosPasta(protocol, port, apiKey, fb);
        const fbMds = (fbData && Array.isArray(fbData.files)) ? fbData.files.filter(f => f.endsWith(".md")) : [];
        if (fbMds.length > 0) {
          targetFolder = fb;
          data = fbData;
          mdFiles = fbMds;
          break;
        }
      }
    }

    if (dispPasta) {
      dispPasta.innerText = `📁 Lendo: ${targetFolder} (${mdFiles.length} notas)`;
    }

    if (mdFiles.length === 0) {
      selPendente.innerHTML = "<option value=''>Nenhum arquivo .md encontrado na pasta</option>";
      badgeQtd.innerText = "0 pendentes";
      exibirStatus(`Nenhum arquivo .md encontrado em: ${targetFolder}`, "erro");
      return;
    }

    // 2. Lê cada arquivo e extrai apontamentos com status pendente
    for (const fileRel of mdFiles) {
      const fullPath = fileRel.includes("/") ? fileRel : `${targetFolder}/${fileRel}`;
      const content = await obterConteudoArquivo(protocol, port, apiKey, fullPath);
      if (!content) continue;

      // Se o chamado inteiro já estiver marcado como apontado, pula!
      const statusGeral = extrairCampoFrontmatter(content, "status_apontamento");
      if (statusGeral === "apontado") {
        continue;
      }

      const numChamado = extrairCampoFrontmatter(content, "numero") || fileRel.split("/").pop().split(" - ")[0];
      const tituloChamado = extrairCampoFrontmatter(content, "titulo") || "";
      const solicitante = extrairCampoFrontmatter(content, "solicitante") || "";

      // Parse flexível do bloco apontamentos: no frontmatter
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const fmLines = fmMatch[1].split("\n");
        let emApontamentos = false;
        let itemAtual = null;

        for (let i = 0; i < fmLines.length; i++) {
          const linha = fmLines[i];
          if (/^apontamentos:\s*$/.test(linha)) {
            emApontamentos = true;
            continue;
          }

          if (emApontamentos) {
            // Início de item na lista: "  - data: ..." ou "  - hora_inicio: ..."
            if (/^\s*-\s+/.test(linha)) {
              if (itemAtual && itemAtual.status !== "apontado") {
                listaPendentes.push(itemAtual);
              }
              itemAtual = {
                filePath: fullPath,
                chamado: numChamado,
                titulo: tituloChamado,
                solicitante: solicitante,
                data: "",
                dataOriginal: "",
                horaInicio: "08:00",
                horaFim: "08:30",
                status: "pendente",
                atividade: ""
              };
            }

            if (itemAtual) {
              const mData = linha.match(/data:\s*"?(.*?)"?\s*$/);
              if (mData) {
                itemAtual.dataOriginal = mData[1].trim();
                itemAtual.data = normalizarDataBR(mData[1].trim());
              }

              const mIni = linha.match(/hora_inicio:\s*"?(.*?)"?\s*$/);
              if (mIni) itemAtual.horaInicio = mIni[1].trim();

              const mFim = linha.match(/hora_fim:\s*"?(.*?)"?\s*$/);
              if (mFim) itemAtual.horaFim = mFim[1].trim();

              const mSt = linha.match(/status:\s*"?(.*?)"?\s*$/);
              if (mSt) itemAtual.status = mSt[1].trim();

              const mAtiv = linha.match(/atividade:\s*"?(.*?)"?\s*$/);
              if (mAtiv) itemAtual.atividade = mAtiv[1].trim().replace(/\\"/g, '"');
            }

            // Se sair da indentação
            if (/^[a-zA-Z0-9_-]+:/.test(linha) && !/^\s+/.test(linha)) {
              emApontamentos = false;
              if (itemAtual && itemAtual.status !== "apontado") {
                listaPendentes.push(itemAtual);
                itemAtual = null;
              }
            }
          }
        }

        if (itemAtual && itemAtual.status !== "apontado") {
          listaPendentes.push(itemAtual);
        }
      }
    }

    // 3. Atualiza UI com a lista encontrada
    if (listaPendentes.length === 0) {
      selPendente.innerHTML = "<option value=''>🎉 Todos os chamados já foram apontados!</option>";
      badgeQtd.innerText = "0 pendentes";
      badgeQtd.className = "badge badge-success";
      limparCamposApontamento();
      exibirStatus("Todos os chamados da pasta já estão marcados como apontados!", "sucesso");
      return;
    }

    badgeQtd.innerText = `${listaPendentes.length} pendentes`;
    badgeQtd.className = "badge badge-warning";

    selPendente.innerHTML = "";
    listaPendentes.forEach((item, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      const solicText = item.solicitante ? ` - ${item.solicitante}` : "";
      opt.innerText = `[${item.chamado}] ${item.data} (${item.horaInicio} às ${item.horaFim})${solicText}`;
      selPendente.appendChild(opt);
    });

    // Seleciona o primeiro da fila
    selecionarApontamento(0);
    exibirStatus(`Carregados ${listaPendentes.length} apontamentos pendentes!`, "sucesso");

  } catch (err) {
    console.error("Erro ao carregar pendentes:", err);
    exibirStatus("Erro ao conectar à REST API do Obsidian. Verifique porta e API Key.", "erro");
    badgeQtd.innerText = "Erro";
  }
}

function selecionarApontamento(index) {
  if (!listaPendentes[index]) return;
  itemSelecionado = listaPendentes[index];

  document.getElementById("badgeItemIndex").innerText = `#${index + 1} de ${listaPendentes.length}`;
  document.getElementById("aptChamado").value = itemSelecionado.chamado || "";
  document.getElementById("aptData").value = normalizarDataBR(itemSelecionado.data || "");
  document.getElementById("aptHoraInicio").value = itemSelecionado.horaInicio || "";
  document.getElementById("aptHoraFim").value = itemSelecionado.horaFim || "";
  document.getElementById("aptAtividade").value = itemSelecionado.atividade || "";

  document.getElementById("selChamadoPendente").value = index;
}

function limparCamposApontamento() {
  document.getElementById("badgeItemIndex").innerText = "#0";
  document.getElementById("aptChamado").value = "";
  document.getElementById("aptData").value = "";
  document.getElementById("aptHoraInicio").value = "";
  document.getElementById("aptHoraFim").value = "";
  document.getElementById("aptAtividade").value = "";
}

function setProgressoInjecao(visivel, texto = "Injetando dados no SoftExpert...") {
  const el = document.getElementById("injectionProgress");
  const txtEl = document.getElementById("injectionText");
  if (!el) return;
  if (visivel) {
    if (txtEl) txtEl.innerText = texto;
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

async function preencherFormularioNoSE() {
  const chamado = document.getElementById("aptChamado").value.trim();
  const data = normalizarDataBR(document.getElementById("aptData").value.trim());
  const horaInicio = document.getElementById("aptHoraInicio").value.trim();
  const horaFim = document.getElementById("aptHoraFim").value.trim();
  const atividade = document.getElementById("aptAtividade").value.trim();

  if (!chamado) {
    exibirStatus("Selecione um chamado pendente na lista!", "erro");
    return;
  }

  // Copia a data para a área de transferência para garantir que esteja no Ctrl+V
  try {
    if (data) await navigator.clipboard.writeText(data);
  } catch(e) {}

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("softexpert.com")) {
    exibirStatus("Abra a aba do SoftExpert com o formulário de apontamento!", "erro");
    return;
  }

  setProgressoInjecao(true, `Injetando dados do chamado ${chamado}...`);
  exibirStatus(`Injetando dados do chamado ${chamado} no SoftExpert...`, "info");

  function processarResposta(resp) {
    setProgressoInjecao(false);
    if (!resp) {
      exibirStatus("Formulário preenchido! Verifique a tela do SoftExpert.", "sucesso");
      return;
    }
    const rel = resp.relatorio || {};
    const total = [rel.chamado, rel.data, rel.horaInicio, rel.horaFim, rel.atividade].filter(Boolean).length;
    if (total === 5) {
      exibirStatus(`Todos os 5 campos do chamado ${chamado} preenchidos com sucesso no SE!`, "sucesso");
    } else if (total > 0) {
      const faltou = rel.erros && rel.erros.length > 0 ? rel.erros.join(", ") : "alguns campos";
      exibirStatus(`Preenchido parcialmente (${total}/5). Faltou localizar: ${faltou}`, "erro");
    } else {
      exibirStatus("Nenhum campo do formulário de apontamento foi localizado nesta tela.", "erro");
    }
  }

  // ESTRATÉGIA 1: Execução no mundo MAIN com acesso direto ao React / Fiber / Moment
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: "MAIN",
      files: ["patch-moment.js", "se-fill-main.js"]
    });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: "MAIN",
      func: async (dados) => {
        if (window.__seFill && typeof window.__seFill.fillAll === "function") {
          return await window.__seFill.fillAll(dados);
        }
        return null;
      },
      args: [{ chamado, data, horaInicio, horaFim, atividade }]
    });

    let bestRel = null;
    let maxCampos = 0;
    if (Array.isArray(results)) {
      for (const r of results) {
        if (r && r.result) {
          const rel = r.result;
          const count = [rel.chamado, rel.data, rel.horaInicio, rel.horaFim, rel.atividade].filter(Boolean).length;
          if (count > maxCampos) {
            maxCampos = count;
            bestRel = rel;
          }
        }
      }
    }

    if (bestRel && maxCampos > 0) {
      processarResposta({ sucesso: true, relatorio: bestRel });
      return;
    }
  } catch (err) {
    console.warn("Injeção direta no MAIN world encontrou restrição, usando fallback de mensageria:", err);
  }

  // ESTRATÉGIA 2: Fallback via mensageria para o content script
  chrome.tabs.sendMessage(tab.id, {
    action: "PREENCHER_APONTAMENTO",
    dados: { chamado, data, horaInicio, horaFim, atividade }
  }, (response) => {
    if (chrome.runtime.lastError || !response) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["content.js"]
      }, () => {
        chrome.tabs.sendMessage(tab.id, {
          action: "PREENCHER_APONTAMENTO",
          dados: { chamado, data, horaInicio, horaFim, atividade }
        }, (resp2) => {
          processarResposta(resp2);
        });
      });
    } else {
      processarResposta(response);
    }
  });
}

async function marcarComoApontadoNoObsidian() {
  if (!itemSelecionado) {
    exibirStatus("Nenhum chamado selecionado.", "erro");
    return;
  }

  const { apiKey, port, protocol } = getConfigObsidian();
  const item = itemSelecionado;
  exibirStatus(`💾 Gravando status apontado para o chamado ${item.chamado}...`, "info");

  try {
    const content = await obterConteudoArquivo(protocol, port, apiKey, item.filePath);
    if (!content) {
      exibirStatus(`Erro ao abrir arquivo ${item.filePath} no Obsidian.`, "erro");
      return;
    }

    // Normaliza quebras de linha
    let novoConteudo = content.replace(/\r\n/g, "\n");

    const dataOriginal = item.dataOriginal || item.data;
    const dataBr = normalizarDataBR(item.data);
    const regexData = `(?:${escapeRegExp(dataOriginal)}|${escapeRegExp(dataBr)}|${escapeRegExp(item.data)})`;

    // 1. Atualiza status no array YAML apontamentos:
    const regexItemFm = new RegExp(`(data:\\s*"*${regexData}"*[\\s\\S]*?hora_inicio:\\s*"*${escapeRegExp(item.horaInicio)}"*?[\\s\\S]*?status:\\s*)pendente`, "i");
    if (regexItemFm.test(novoConteudo)) {
      novoConteudo = novoConteudo.replace(regexItemFm, `$1apontado`);
    }

    // 2. Atualiza checkbox visual no Markdown: - [ ] **25/09/2026** (09:30 -> - [x]
    const regexCheckbox = new RegExp(`(- \\[ \\]\\s+\\*\\*${regexData}\\*\\*\\s+\\(${escapeRegExp(item.horaInicio)})`, "gi");
    novoConteudo = novoConteudo.replace(regexCheckbox, `- [x] **${dataBr}** (${item.horaInicio}`);

    // 3. Verifica se ainda restam apontamentos pendentes neste arquivo
    const aindaTemPendentes = /status:\s*pendente/i.test(novoConteudo);
    if (!aindaTemPendentes) {
      novoConteudo = novoConteudo.replace(/status_apontamento:\s*pendente/i, "status_apontamento: apontado");
    }

    // 4. Salva a versão atualizada no Obsidian
    const resSalvar = await salvarArquivo(protocol, port, apiKey, item.filePath, novoConteudo);
    if (resSalvar.ok) {
      const idxAtual = listaPendentes.indexOf(item);
      if (idxAtual !== -1) {
        listaPendentes.splice(idxAtual, 1);
      }

      const badgeQtd = document.getElementById("badgeQtdPendentes");
      badgeQtd.innerText = `${listaPendentes.length} pendentes`;

      const selPendente = document.getElementById("selChamadoPendente");
      selPendente.innerHTML = "";
      if (listaPendentes.length === 0) {
        selPendente.innerHTML = "<option value=''>Todos os chamados foram apontados!</option>";
        badgeQtd.innerText = "0 pendentes";
        badgeQtd.className = "badge badge-success";
        limparCamposApontamento();
        exibirStatus(`Chamado ${item.chamado} apontado! Todos concluídos!`, "sucesso");
        return;
      }

      listaPendentes.forEach((it, i) => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.innerText = `[${it.chamado}] ${it.data} (${it.horaInicio} às ${it.horaFim}) - ${it.solicitante || ""}`;
        selPendente.appendChild(opt);
      });

      // Seleciona automaticamente o próximo da fila!
      const proximoIdx = idxAtual < listaPendentes.length ? idxAtual : 0;
      selecionarApontamento(proximoIdx);

      exibirStatus(`✅ Chamado ${item.chamado} marcado como apontado! Próximo carregado.`, "sucesso");
    } else {
      exibirStatus(`Falha ao salvar no Obsidian (${resSalvar.status}).`, "erro");
    }

  } catch (err) {
    console.error("Erro ao marcar como apontado:", err);
    exibirStatus("Erro de comunicação ao atualizar Obsidian.", "erro");
  }
}

// ==============================================================================
// ABA 1: CAPTURA DO SOFTEXPERT ➔ OBSIDIAN (FLUXO ORIGINAL PRESERVADO)
// ==============================================================================

async function inicializarCapturaAbaAtiva() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("softexpert.com")) {
    return;
  }

  try {
    chrome.tabs.sendMessage(tab.id, { action: "CAPTURAR_SE" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ["content.js"]
        }, () => {
          if (!chrome.runtime.lastError) {
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, { action: "CAPTURAR_SE" }, (resp2) => {
                if (resp2) preencherDadosCaptura(resp2);
              });
            }, 300);
          }
        });
      } else {
        preencherDadosCaptura(response);
      }
    });
  } catch (e) {}
}

function preencherDadosCaptura(resp) {
  dadosChamado = resp;
  document.getElementById("dispNumero").innerText = resp.numeroChamado;
  document.getElementById("dispTitulo").innerText = resp.tituloChamado;
  document.getElementById("badgeEtapa").innerText = resp.etapa || "Execução";
  document.getElementById("dispSolicitante").value = resp.solicitante !== "Não identificado" ? resp.solicitante : "";
  document.getElementById("dispDescricao").value = resp.descricao !== "Descrição não encontrada automaticamente." ? resp.descricao : "";

  const badgeTramites = document.getElementById("badgeTramites");
  if (badgeTramites) {
    if (resp.qtdTramites && resp.qtdTramites > 0) {
      badgeTramites.innerText = `💬 ${resp.qtdTramites} trâmites`;
      badgeTramites.style.display = "inline-block";
    } else {
      badgeTramites.style.display = "none";
    }
  }
}

function extrairCampoFrontmatter(conteudo, campo) {
  const regex = new RegExp(`^${campo}\\s*:\\s*(.+)$`, "m");
  const match = conteudo.match(regex);
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : null;
}

function extrairSecao(conteudo, nomeSecao) {
  const escaped = nomeSecao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=(?:\\n##\\s+)|$)`, "i");
  const match = conteudo.match(regex);
  if (!match) return null;
  return match[1].replace(/\n?\s*---\s*$/, "").trim();
}

function extrairSecoesExtras(conteudoExistente) {
  const conhecidas = [
    "apontamento softexpert",
    "descrição do problema",
    "descricao do problema",
    "histórico de trâmites",
    "historico de tramites",
    "consultas oracle (sankhya)",
    "diagnóstico & causa raiz",
    "diagnostico & causa raiz",
    "procedimento / solução realizada",
    "procedimento / solucao realizada",
    "resposta formatada para o usuário (softexpert)",
    "resposta formatada para o usuario (softexpert)",
    "chamados e soluções relacionadas",
    "chamados e solucoes relacionadas"
  ];

  const regex = /##\s+([^\n]+)\n([\s\S]*?)(?=(?:\n##\s+)|$)/gi;
  let match;
  const extras = [];
  while ((match = regex.exec(conteudoExistente)) !== null) {
    const titulo = match[1].trim();
    const corpo = match[2].trim();
    if (!conhecidas.includes(titulo.toLowerCase()) && corpo.length > 0) {
      extras.push(`## ${titulo}\n${corpo}`);
    }
  }
  return extras.join("\n\n");
}

function formatarTag(texto) {
  if (!texto || texto === "Não informado" || texto === "Não identificado") return "";
  return texto
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-_/]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function montarMarkdown(conteudoExistente = null) {
  const solicitanteFinal = document.getElementById("dispSolicitante").value.trim() || "Não informado";
  const descricaoFinal = document.getElementById("dispDescricao").value.trim() || "Sem descrição";
  const tagSolicitante = formatarTag(solicitanteFinal);

  let statusAnalise = "em_investigacao";
  let statusApontamento = "pendente";
  let blocoApontamentoFrontmatter = "";
  let secaoApontamento = null;
  let secaoConsultas = null;
  let secaoDiagnostico = null;
  let secaoProcedimento = null;
  let secaoResposta = null;
  let secaoRelacionados = null;
  let secoesExtras = "";

  if (conteudoExistente) {
    statusAnalise = extrairCampoFrontmatter(conteudoExistente, "status_analise") || statusAnalise;
    statusApontamento = extrairCampoFrontmatter(conteudoExistente, "status_apontamento") || statusApontamento;
    
    const matchAptFm = conteudoExistente.match(/apontamentos:\s*\n([\s\S]*?)(?=\n[a-zA-Z0-9_-]+:|\n---)/);
    if (matchAptFm) {
      blocoApontamentoFrontmatter = `\napontamentos:\n${matchAptFm[1]}`;
    }

    secaoApontamento = extrairSecao(conteudoExistente, "Apontamento SoftExpert");
    secaoConsultas = extrairSecao(conteudoExistente, "Consultas Oracle (Sankhya)");
    secaoDiagnostico = extrairSecao(conteudoExistente, "Diagnóstico & Causa Raiz");
    secaoProcedimento = extrairSecao(conteudoExistente, "Procedimento / Solução Realizada");
    secaoResposta = extrairSecao(conteudoExistente, "Resposta Formatada para o Usuário (SoftExpert)");
    secaoRelacionados = extrairSecao(conteudoExistente, "Chamados e Soluções Relacionadas");
    secoesExtras = extrairSecoesExtras(conteudoExistente);
  }

  const blocoConsultas = secaoConsultas !== null
    ? secaoConsultas
    : `\`\`\`sql\n-- Consulta inicial de usuário e acessos:\nSELECT CODUSU, NOMEUSU, EMAIL, ATIVO FROM TSIUSU WHERE NOMEUSU LIKE '%${solicitanteFinal.split(" ")[0]}%';\n\`\`\``;

  const blocoDiagnostico = secaoDiagnostico !== null ? secaoDiagnostico : `<!-- Preenchido pelo Gemini durante análise técnica -->`;
  const blocoProcedimento = secaoProcedimento !== null ? secaoProcedimento : `<!-- Passo a passo executado -->`;
  const blocoResposta = secaoResposta !== null ? secaoResposta : `<!-- Mensagem pronta para colar no chamado -->`;
  const blocoRelacionados = secaoRelacionados !== null ? secaoRelacionados : `- `;

  const secaoApontamentoMd = secaoApontamento !== null ? `## Apontamento SoftExpert\n${secaoApontamento}\n\n` : "";

  return `---
tipo: chamado
sistema: Sankhya
empresa: Botuverá
origem: SoftExpert
numero: "${dadosChamado.numeroChamado}"
titulo: "${dadosChamado.tituloChamado}"
processo: "${dadosChamado.processo}"
etapa: "${dadosChamado.etapa}"
solicitante: "${solicitanteFinal}"
data: ${dadosChamado.dataCaptura}
status_analise: ${statusAnalise}
status_apontamento: ${statusApontamento}${blocoApontamentoFrontmatter}
tags:
${tagSolicitante ? `  - ${tagSolicitante}\n` : ""}---
${secaoApontamentoMd}##  Descrição do Problema

${descricaoFinal}

${dadosChamado.tramitesMarkdown ? `${dadosChamado.tramitesMarkdown}\n` : ""}---

## Consultas Oracle (Sankhya)
${blocoConsultas}

## Diagnóstico & Causa Raiz
${blocoDiagnostico}

## Procedimento / Solução Realizada
${blocoProcedimento}

## Resposta Formatada para o Usuário (SoftExpert)
${blocoResposta}

---
## Chamados e Soluções Relacionadas
${blocoRelacionados}
${secoesExtras ? `\n\n${secoesExtras}` : ""}
`;
}

async function salvarChamadoNoObsidian() {
  const { apiKey, port, protocol, resolvedFolder } = getConfigObsidian();

  if (!apiKey) {
    exibirStatus("Preencha a API Key do Obsidian!", "erro");
    return;
  }

  chrome.storage.sync.set({
    obsidianApiKey: apiKey,
    obsidianPort: port,
    obsidianProtocol: protocol,
    obsidianVaultFolder: document.getElementById("vaultFolder").value.trim()
  });

  const safeTitulo = dadosChamado.tituloChamado.replace(/[/\\?%*:|"<>]/g, "-").trim();
  const newFilename = `${dadosChamado.numeroChamado} - ${safeTitulo}.md`;
  const targetFullPath = resolvedFolder ? `${resolvedFolder}/${newFilename}` : newFilename;

  exibirStatus("🔍 Verificando se chamado já existe no Obsidian...", "info");

  try {
    const existingFile = await buscarArquivoExistente(protocol, port, apiKey, resolvedFolder, dadosChamado.numeroChamado);
    let conteudoExistente = null;

    if (existingFile) {
      exibirStatus("📥 Nota existente encontrada! Mesclando dados manuais...", "info");
      conteudoExistente = await obterConteudoArquivo(protocol, port, apiKey, existingFile);
    }

    const markdown = montarMarkdown(conteudoExistente);

    if (existingFile && existingFile !== targetFullPath) {
      exibirStatus("🔄 Título alterado: removendo nota anterior...", "info");
      await deletarArquivo(protocol, port, apiKey, existingFile);
    }

    exibirStatus("💾 Gravando no Obsidian...", "info");
    const response = await salvarArquivo(protocol, port, apiKey, targetFullPath, markdown);

    if (response.ok || response.status === 200 || response.status === 201 || response.status === 204) {
      const acao = existingFile ? (existingFile !== targetFullPath ? "Renomeado e Atualizado" : "Atualizado") : "Criado";
      exibirStatus(`✅ ${acao}: ${targetFullPath}`, "sucesso");
    } else {
      const errText = await response.text();
      exibirStatus(`Erro (${response.status}): ${errText}`, "erro");
    }
  } catch (err) {
    console.error("Erro na requisição:", err);
    exibirStatus("Falha de conexão com Obsidian. Verifique porta e se aceitou certificado HTTPS.", "erro");
  }
}

async function buscarArquivoExistente(protocol, port, apiKey, folder, numeroChamado) {
  const folderEncoded = encodePathSegments(folder);
  const url = `${protocol}://127.0.0.1:${port}/vault/${folderEncoded ? folderEncoded + "/" : ""}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json"
      }
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data || !Array.isArray(data.files)) return null;

    const prefixo = `${numeroChamado} - `;
    for (const item of data.files) {
      const nomeBase = item.split("/").pop();
      if (nomeBase.endsWith(".md") && (nomeBase.startsWith(prefixo) || nomeBase.startsWith(`${numeroChamado}-`))) {
        return item.includes("/") ? item : (folder ? `${folder}/${item}` : item);
      }
    }
  } catch (err) {
    console.warn("Não foi possível listar pasta no Obsidian:", err);
  }

  return null;
}

function copiarMarkdownParaClipboard() {
  const markdown = montarMarkdown();
  navigator.clipboard.writeText(markdown).then(() => {
    exibirStatus("Markdown copiado com sucesso!", "sucesso");
  }).catch(() => {
    exibirStatus("Falha ao copiar para clipboard.", "erro");
  });
}

function exibirStatus(texto, tipo) {
  const statusEl = document.getElementById("msgStatus");
  if (!statusEl) return;
  if (!texto) {
    statusEl.style.display = "none";
    return;
  }

  // Remove emojis residuais para um visual 100% minimalista
  const textoLimpo = texto.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1FA70}-\u{1FAFF}]/gu, "").trim();

  let iconSvg = "";
  if (tipo === "sucesso") {
    iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
  } else if (tipo === "erro") {
    iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';
  } else if (tipo === "info") {
    iconSvg = '<svg class="spin-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke="rgba(26,115,232,0.25)"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-linecap="round"/></svg>';
  }

  statusEl.className = `status ${tipo}`;
  statusEl.innerHTML = `${iconSvg}<span>${textoLimpo}</span>`;
  statusEl.style.display = "flex";
}
