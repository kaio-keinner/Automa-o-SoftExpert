// se-fill-main.js - Executa no mundo MAIN para interagir diretamente com React / Fiber / Moment no SoftExpert
(() => {
  if (window.__seFillInitialized) {
    console.log("[SoftExpert-Fill] ✅ Módulo __seFill já carregado nesta janela.");
    return;
  }
  window.__seFillInitialized = true;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, timeout = 5000, step = 100) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        const v = fn();
        if (v) return v;
      } catch (e) {}
      await sleep(step);
    }
    return null;
  };

  // --- Normalizador de data DD/MM/YYYY ---
  function extrairPartesData(dataStr) {
    if (!dataStr) return null;
    const s = String(dataStr).trim().replace(/^['"]|['"]$/g, "");
    const mIso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (mIso) {
      return { ano: mIso[1], mes: mIso[2].padStart(2, "0"), dia: mIso[3].padStart(2, "0") };
    }
    const mBr = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (mBr) {
      return { dia: mBr[1].padStart(2, "0"), mes: mBr[2].padStart(2, "0"), ano: mBr[3] };
    }
    return null;
  }

  function normalizarDataBR(dataStr) {
    const p = extrairPartesData(dataStr);
    return p ? `${p.dia}/${p.mes}/${p.ano}` : dataStr;
  }

  // --- Feedback visual momentâneo de sucesso / erro ---
  function aplicarFeedbackVisual(el, sucesso = true) {
    if (!el) return;
    try {
      const oldBorder = el.style.border;
      const oldBg = el.style.backgroundColor;
      el.style.border = sucesso ? "2px solid #16a34a" : "2px solid #dc2626";
      el.style.backgroundColor = sucesso ? "#f0fdf4" : "#fef2f2";
      setTimeout(() => {
        el.style.border = oldBorder;
        el.style.backgroundColor = oldBg;
      }, 2500);
    } catch (e) {}
  }

  // --- 1. Localizadores precisos de elementos ---
  function getDateInput() {
    // IMPORTANTE: Nunca pegar o campo "Data" desabilitado de "Dados do responsável"
    const porTitle = document.querySelector('input[title="Data de apontamento:"]:not([disabled]):not([readonly])')
      || document.querySelector('input[title*="Data de apontamento" i]:not([disabled]):not([readonly])');
    if (porTitle) return porTitle;

    // Busca tolerante evitando campos com title "Data" puro ou desabilitados
    const candidatos = Array.from(document.querySelectorAll('input[placeholder="DD/MM/YYYY"], input[placeholder*="DD/MM"]'));
    return candidatos.find(i => !i.disabled && !i.readOnly && /apontamento/i.test(i.title || ''))
      || candidatos.find(i => !i.disabled && !i.readOnly && (i.title || '').trim().toLowerCase() !== 'data');
  }

  function getChamadoInput() {
    return document.querySelector('input[title="Chamado:"]:not([disabled]):not([readonly])')
      || document.querySelector('input[title*="Chamado" i]:not([disabled]):not([readonly])')
      || Array.from(document.querySelectorAll('input:not([disabled]):not([readonly])')).find(i => (i.title || '').toLowerCase().includes('chamado:'));
  }

  function getHoraInicioInput() {
    return document.querySelector('input[title*="Hora início" i]:not([disabled]):not([readonly]), input[title*="Hora inicio" i]:not([disabled]):not([readonly])')
      || Array.from(document.querySelectorAll('input[placeholder*="HH:MM" i]:not([disabled]):not([readonly]), input[placeholder*="__:__"]:not([disabled]):not([readonly])'))[0]
      || document.querySelector('.dhx_timepicker-input:not([disabled]), input[type="time"]:not([disabled])');
  }

  function getHoraFimInput() {
    return document.querySelector('input[title*="Hora final" i]:not([disabled]):not([readonly]), input[title*="Hora fim" i]:not([disabled]):not([readonly]), input[title*="Hora término" i]:not([disabled]):not([readonly])')
      || Array.from(document.querySelectorAll('input[placeholder*="HH:MM" i]:not([disabled]):not([readonly]), input[placeholder*="__:__"]:not([disabled]):not([readonly])'))[1]
      || Array.from(document.querySelectorAll('.dhx_timepicker-input:not([disabled]), input[type="time"]:not([disabled])'))[1];
  }

  function getAtividadeTextarea() {
    return document.querySelector('textarea[title*="Atividade" i]:not([disabled]):not([readonly])')
      || Array.from(document.querySelectorAll('textarea:not([disabled]):not([readonly])')).find(t => t.offsetParent !== null)
      || document.querySelector('textarea:not([disabled]):not([readonly])');
  }

  // --- 2. Acesso a Props e Fiber do React (15, 16, 17, 18+) ---
  function reactKey(el, prefix) {
    if (!el) return null;
    return Object.keys(el).find(k => k.startsWith(prefix));
  }

  function getReactProps(el) {
    if (!el) return null;
    const pk = reactKey(el, '__reactProps$') || reactKey(el, '__reactEventHandlers$'); // 17+ / 16
    if (pk) return el[pk];
    const ik = reactKey(el, '__reactInternalInstance$');                               // 15 / 16
    const inst = ik && el[ik];
    return inst && (inst.memoizedProps || (inst._currentElement && inst._currentElement.props));
  }

  function getFiber(el) {
    if (!el) return null;
    const k = reactKey(el, '__reactFiber$') || reactKey(el, '__reactInternalInstance$');
    return k ? el[k] : null;
  }

  // --- 3. Setter nativo + reset do tracker + eventos simulados ---
  function setNativeValue(el, value) {
    if (!el) return;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    const last = el.value;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }

    if (el._valueTracker) {
      el._valueTracker.setValue(last); // React 16+
    }

    const ev = new Event('input', { bubbles: true, cancelable: true });
    ev.simulated = true;              // React 15
    el.dispatchEvent(ev);
    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  }

  // --- 4. Fechar overlays do DayPicker ---
  function closeCalendarOverlays(el) {
    try {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
      const doc = el.ownerDocument || document;
      const overlays = doc.querySelectorAll('.DayPickerInput-Overlay, .DayPickerInput-OverlayWrapper, [class*="DayPicker"][class*="Overlay"]');
      overlays.forEach(ov => {
        ov.style.display = 'none';
      });
    } catch (e) {}
  }

  // --- 5. Verificação pós-render da data ---
  async function verifyDate(el, expected) {
    await sleep(250);
    el = getDateInput() || el;
    if (!el) return false;
    const domOk = (el.value || '').trim() === expected;
    const p = getReactProps(el) || {};
    const propOk = p.value === undefined || p.value === expected
      || (window.moment && p.value && window.moment(p.value).format('DD/MM/YYYY') === expected);
    return domOk && propOk;
  }

  // --- 6. Fallback: Clicar no calendário DayPicker ---
  async function pickFromCalendar(el, ddmmyyyy) {
    const partes = extrairPartesData(ddmmyyyy);
    if (!partes) return false;
    const d = Number(partes.dia);
    const m = Number(partes.mes);
    const y = Number(partes.ano);

    el.focus();
    el.click();

    const trigger = el.closest('[class*="CalendarInput"], [class*="FormInput"]')
      ?.querySelector('button, [class*="icon"], [class*="Calendar"] svg');
    if (trigger) trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const picker = await waitFor(() => document.querySelector('[class*="DayPicker"]:not([class*="Input"])'), 3000);
    if (!picker) return false;

    const monthsPt = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const monthsEn = ['january','february','march','april','may','june','july','august','september','october','november','december'];

    for (let i = 0; i < 36; i++) {
      const cap = (picker.querySelector('[class*="Caption"], [class*="DateHeader"]')?.textContent || '').toLowerCase();
      const cm = monthsPt.findIndex(n => cap.includes(n)) >= 0 ? monthsPt.findIndex(n => cap.includes(n))
               : monthsEn.findIndex(n => cap.includes(n));
      const cy = Number((cap.match(/\d{4}/) || [])[0]);
      if (cm === m - 1 && cy === y) break;

      const forward = (cy < y) || (cy === y && cm < m - 1);
      const btn = picker.querySelector(forward ? '[class*="NavButton--next"], [aria-label*="Next"], [aria-label*="Próx"]'
                                               : '[class*="NavButton--prev"], [aria-label*="Previous"], [aria-label*="Anter"]');
      if (!btn) break;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(150);
    }

    const cell = [...picker.querySelectorAll('[class*="DayPicker-Day"], [role="gridcell"]')]
      .find(c => !/outside|disabled/i.test(c.className) && c.textContent.trim() === String(d));
    if (!cell) return false;

    for (const t of ['mousedown', 'mouseup', 'click']) {
      cell.dispatchEvent(new MouseEvent(t, { bubbles: true }));
    }
    await sleep(250);
    return true;
  }

  // --- 7. Preenchimento de Data com estratégia em cascata ---
  async function setDate(ddmmyyyy) {
    const el = getDateInput();
    if (!el) return { ok: false, reason: 'campo "Data de apontamento:" não encontrado' };

    const dataBr = normalizarDataBR(ddmmyyyy);

    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await sleep(100);

    // A) onChange direto via props do React
    const props = getReactProps(el);
    if (props && typeof props.onChange === 'function') {
      const proto = HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, dataBr);
      props.onChange({
        target: el,
        currentTarget: el,
        type: 'change',
        persist() {},
        preventDefault() {},
        stopPropagation() {},
        nativeEvent: new Event('input')
      });
      await sleep(100);
    }

    // B) setter nativo + tracker (se A não preencheu)
    if (el.value !== dataBr) {
      setNativeValue(el, dataBr);
    }

    // C) digitação simulada / colagem (para componentes com máscara estrita)
    if (el.value !== dataBr) {
      el.select();
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
      } catch (e) {}
      for (const ch of dataBr) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
        try {
          document.execCommand('insertText', false, ch);
        } catch (e) {}
        el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
        await sleep(20);
      }
    }

    // Confirmar: Enter + onBlur + blur (momento do parse pelo moment/react-day-picker)
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    if (props && typeof props.onBlur === 'function') {
      props.onBlur({ target: el, currentTarget: el, relatedTarget: null, persist() {} });
    }
    el.blur();
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await sleep(250);

    if (await verifyDate(el, dataBr)) {
      closeCalendarOverlays(el);
      aplicarFeedbackVisual(el, true);
      return { ok: true, via: 'input' };
    }

    // D) Fallback: calendário DayPicker visual
    const okCal = await pickFromCalendar(el, dataBr);
    closeCalendarOverlays(el);

    const verified = (okCal && await verifyDate(getDateInput(), dataBr)) || (getDateInput()?.value === dataBr);
    if (verified) {
      aplicarFeedbackVisual(getDateInput() || el, true);
      return { ok: true, via: 'calendar' };
    }

    return { ok: false, reason: 'falha na validação após input e calendário' };
  }

  // --- 8. Lookup "Chamado:" com seleção de sugestão ---
  async function setChamado(numero) {
    const el = getChamadoInput();
    if (!el) return { ok: false, reason: 'lookup "Chamado:" não encontrado' };

    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.click();
    el.select();

    try {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      document.execCommand('insertText', false, numero);
    } catch (e) {}

    if (el.value !== numero) {
      setNativeValue(el, numero);
    }
    el.dispatchEvent(new KeyboardEvent('keyup', { key: numero.slice(-1), bubbles: true }));

    // Aguarda a lista de sugestões aparecer
    const item = await waitFor(() => {
      const candidates = Array.from(document.querySelectorAll(
        '[role="option"], [role="listbox"] li, [class*="Suggestion"] li, [class*="Autocomplete"] li, [class*="Lookup"] li, [class*="List"] [class*="Item"], div[class*="popup"] li'
      ));
      return candidates.find(n => n.offsetParent !== null && n.textContent.includes(numero));
    }, 5000);

    if (item) {
      for (const t of ['mousedown', 'mouseup', 'click']) {
        item.dispatchEvent(new MouseEvent(t, { bubbles: true }));
      }
    } else {
      // Se a sugestão não apareceu como li separado, tenta pressionar Enter
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
    }

    // Aguarda confirmação do lookup no elemento (total="1" ou data preenchido)
    const ok = await waitFor(() => {
      const f = getChamadoInput();
      if (!f) return false;
      const total1 = f.getAttribute('total') === '1';
      const hasData = (f.getAttribute('data') || '').length > 0;
      const valMatch = (f.value || '').includes(numero);
      return (total1 && hasData) || valMatch;
    }, 4000);

    const success = !!ok || (el.value || '').includes(numero);
    if (success) aplicarFeedbackVisual(getChamadoInput() || el, true);
    return { ok: success };
  }

  // --- 9. Preenchimento de Hora Início, Hora Fim e Atividade ---
  async function setTimeField(el, hhmm) {
    if (!el) return { ok: false };
    el.scrollIntoView({ block: 'center' });
    el.focus();
    await sleep(50);

    const props = getReactProps(el);
    if (props && typeof props.onChange === 'function') {
      const proto = HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, hhmm);
      props.onChange({
        target: el,
        currentTarget: el,
        type: 'change',
        persist() {},
        preventDefault() {},
        stopPropagation() {},
        nativeEvent: new Event('input')
      });
      await sleep(50);
    }

    if (el.value !== hhmm) {
      setNativeValue(el, hhmm);
    }

    if (el.value !== hhmm) {
      el.select();
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, hhmm);
      } catch (e) {}
    }

    if (props && typeof props.onBlur === 'function') {
      props.onBlur({ target: el, currentTarget: el, relatedTarget: null, persist() {} });
    }
    el.blur();
    await sleep(80);

    const ok = el.value.replace(/[^0-9:]/g, '') === hhmm.replace(/[^0-9:]/g, '');
    if (ok) aplicarFeedbackVisual(el, true);
    return { ok };
  }

  async function setHoraInicio(hhmm) {
    const el = getHoraInicioInput();
    if (!el) return { ok: false, reason: 'campo Hora Início não encontrado' };
    return await setTimeField(el, hhmm);
  }

  async function setHoraFim(hhmm) {
    const el = getHoraFimInput();
    if (!el) return { ok: false, reason: 'campo Hora Fim não encontrado' };
    return await setTimeField(el, hhmm);
  }

  async function setAtividade(texto) {
    const el = getAtividadeTextarea();
    if (!el) return { ok: false, reason: 'campo Atividade não encontrado' };
    el.scrollIntoView({ block: 'center' });
    el.focus();
    await sleep(50);

    const props = getReactProps(el);
    if (props && typeof props.onChange === 'function') {
      const proto = HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, texto);
      props.onChange({
        target: el,
        currentTarget: el,
        type: 'change',
        persist() {},
        preventDefault() {},
        stopPropagation() {},
        nativeEvent: new Event('input')
      });
      await sleep(50);
    }

    if (el.value !== texto) {
      setNativeValue(el, texto);
    }

    if (el.value !== texto) {
      el.select();
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, texto);
      } catch (e) {}
    }

    if (props && typeof props.onBlur === 'function') {
      props.onBlur({ target: el, currentTarget: el, relatedTarget: null, persist() {} });
    }
    el.blur();
    await sleep(80);

    const ok = (el.value || '').trim().length > 0;
    if (ok) aplicarFeedbackVisual(el, true);
    return { ok };
  }

  // --- 10. Orquestrador completo na ordem ótima ---
  async function fillAll(dados) {
    const relatorio = {
      chamado: false,
      data: false,
      horaInicio: false,
      horaFim: false,
      atividade: false,
      erros: []
    };

    if (!dados) return relatorio;

    // 1. Chamado PRIMEIRO (evita re-render de lookup limpar campos anteriores)
    if (dados.chamado) {
      const res = await setChamado(dados.chamado);
      relatorio.chamado = res.ok;
      if (!res.ok) relatorio.erros.push('Chamado: ' + (res.reason || 'não confirmado'));
      await sleep(200);
    }

    // 2. Data de Apontamento SEGUNDO (com cascata de validação)
    if (dados.data) {
      const res = await setDate(dados.data);
      relatorio.data = res.ok;
      if (!res.ok) relatorio.erros.push('Data: ' + (res.reason || 'não confirmada'));
      await sleep(150);
    }

    // 3. Hora Início
    if (dados.horaInicio) {
      const res = await setHoraInicio(dados.horaInicio);
      relatorio.horaInicio = res.ok;
      if (!res.ok) relatorio.erros.push('Hora Início');
      await sleep(100);
    }

    // 4. Hora Fim
    if (dados.horaFim) {
      const res = await setHoraFim(dados.horaFim);
      relatorio.horaFim = res.ok;
      if (!res.ok) relatorio.erros.push('Hora Fim');
      await sleep(100);
    }

    // 5. Atividade Executada
    if (dados.atividade) {
      const res = await setAtividade(dados.atividade);
      relatorio.atividade = res.ok;
      if (!res.ok) relatorio.erros.push('Atividade');
    }

    return relatorio;
  }

  // Comunicação bidirecional com content script via postMessage
  window.addEventListener("message", async (evt) => {
    if (!evt.data || evt.data.type !== "SE_FILL_REQUEST") return;
    const { reqId, dados } = evt.data;
    try {
      const rel = await fillAll(dados);
      window.postMessage({ type: "SE_FILL_RESPONSE", reqId, relatorio: rel }, "*");
    } catch (err) {
      window.postMessage({ type: "SE_FILL_RESPONSE", reqId, relatorio: { erros: [String(err)] } }, "*");
    }
  });

  // Exportação para o escopo global do mundo MAIN
  window.__seFill = {
    setDate,
    setChamado,
    setHoraInicio,
    setHoraFim,
    setAtividade,
    fillAll,
    getDateInput,
    getChamadoInput,
    getHoraInicioInput,
    getHoraFimInput,
    getAtividadeTextarea,
    getReactProps,
    getFiber
  };

  console.log("[SoftExpert-Fill] 🚀 Motor de injeção MAIN world (window.__seFill) ativo!");
})();
