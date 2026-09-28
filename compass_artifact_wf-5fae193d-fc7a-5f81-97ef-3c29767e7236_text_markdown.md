# Correção do preenchimento de "Data de apontamento:" no SoftExpert (extensão Automa-o-SoftExpert)

A correção tem três partes. Primeiro, troque o seletor por `input[title="Data de apontamento:"]:not([disabled])`. Segundo, rode o preenchimento no mundo MAIN, onde a extensão consegue ver as propriedades internas do React. Terceiro, grave a data pelo `onChange` do próprio React (ou pelo setter nativo com o `_valueTracker` zerado), faça o `blur` e confira o estado depois. Se o componente continuar recusando o valor digitado, o plano B é abrir o calendário e clicar no dia certo.

Aviso importante antes de tudo: não consegui ler o código do repositório. O GitHub só me deixou abrir a página inicial, e os arquivos `content.js`, `patch-moment.js`, `popup.js`, `manifest.json` e `DOCUMENTACAO_COMPLETA.md` ficaram inacessíveis por todos os caminhos que tentei (raw, API e CDN). Por isso, o diagnóstico do código atual é uma **inferência** a partir dos sintomas que você descreveu. Ele não foi conferido linha a linha no código.

## TL;DR

- **Causa provável do campo errado:** o seletor atual deve ser algo como `input[placeholder="DD/MM/YYYY"]` com `querySelector`. Esse método devolve o primeiro campo na ordem do DOM, e o primeiro é o `Data` desabilitado do card "Dados do responsável". Por isso ele recebeu "24/08/2026" e a borda verde, enquanto "Data de apontamento:" nunca foi tocado.
- **Por que só trocar o seletor não basta:** esse é um campo controlado do React ligado a um calendário (react-day-picker + moment). Com `el.value = ...` e um `input` genérico, o React descarta a mudança porque o `_valueTracker` não vê diferença, ou o componente reverte o valor no `blur`. A saída é rodar no mundo MAIN e chamar o `onChange` pelas props do fiber, ou usar o setter nativo com o tracker zerado. Depois é preciso dar `blur` e verificar.
- **Chamado:** "054663" foi apenas digitado. Um lookup só fica com `total="1"` depois que o item da lista de sugestões é clicado. O código precisa esperar a lista aparecer, clicar no item e confirmar `total="1"` e `data` preenchido.

## Principais conclusões

### 1. Por que o seletor pegou o campo desabilitado

O formulário "APONT - Apontamentos" tem **dois** inputs com `placeholder="DD/MM/YYYY"`. O primeiro é o `title="Data"`, desabilitado, com a data de criação do registro. O segundo é o `title="Data de apontamento:"`, obrigatório, com a classe `FormInput_rctFormInputInput_mLSrE`. O resultado que você viu bate com um seletor genérico: `document.querySelector` devolve só o **primeiro** elemento do DOM que casa com o seletor, e o card "Dados do responsável" vem antes na página. Três pistas reforçam essa leitura:

- O valor foi escrito e a borda verde de "sucesso" aplicada no campo desabilitado. Isso mostra que o código não checa `disabled` e não confere o `title`.
- O campo correto ficou com `value=""`. Ou seja, o código nem chegou nele. Não se trata de um valor que "não pegou".
- Hora início, Hora final e Atividade funcionaram. Os seletores desses campos provavelmente são únicos (`type="tel"` e `textarea`), então não há concorrência.

Mesmo que o valor tivesse ido para o campo desabilitado com sucesso, ele não seria salvo: campos `disabled` não disparam interação de usuário e são ignorados pelo formulário.

### 2. Por que o valor "não fica" em um input React controlado

O React guarda uma cópia interna do valor do input e substitui o setter de `value` no próprio nó. Quando você faz `input.value = 'x'`, o rastreador (`_valueTracker`) é atualizado junto. No `input` seguinte, o React compara os dois valores, vê que são iguais e **não chama o `onChange`**. A solução conhecida é usar o setter original, `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)`, e depois disparar `new Event('input', { bubbles: true })`.\[1\]

A versão do React muda o comportamento. A issue #11600 do repositório react/react diz que "disparar um evento DOM 'input' nativo não aciona o handler onChange no React DOM 15.6 e posteriores". A issue #10135 registra que funcionava na 15.5.x e parou de funcionar na 15.6.0. O contorno que ficou consagrado mistura dois truques: `event.simulated = true` para o React 15 e `input._valueTracker.setValue(lastValue)` para o React 16 ou mais novo.\[2\]\[3\] O README da biblioteca `react-trigger-change` (github.com/vitalyq/react-trigger-change) diz literalmente: "This module is a hack and is tightly coupled with React's implementation details. Not intended for production use. Useful for end-to-end testing and debugging." Vale lembrar isso, porque uma atualização do SoftExpert pode quebrar essa técnica.

### 3. O mundo de execução (ISOLATED × MAIN) importa

Por padrão, content scripts rodam no mundo **ISOLATED**. Eles compartilham o DOM com a página, mas não as variáveis globais nem as propriedades que o JS da página cria nos nós.\[4\]\[5\] Com isso, `__reactProps$…`, `__reactFiber$…`, `__reactInternalInstance$…` e `window.moment` **não ficam visíveis** para `content.js`. Para chegar neles é preciso injetar no mundo **MAIN**. Há duas formas. A primeira é `chrome.scripting.executeScript({ world: 'MAIN', ... })`: a referência chrome.scripting do developer.chrome.com marca `world` como Chrome 95+ em ScriptInjection e Chrome 102+ em conteúdo registrado. A segunda é `"world": "MAIN"` direto no `content_scripts` do manifest, suportado desde o Chrome 111, segundo uma thread dos Apple Developer Forums. A contrapartida: como diz a discussão #643 do crxjs/chrome-extension-tools, o MAIN roda "no mesmo ambiente de uma página normal, sem APIs especiais de extensão do Chrome". Além disso, a página consegue ler e interferir no código injetado. O `patch-moment.js` (id `__se_moment_patch__`) já usa esse mecanismo, então o caminho é o mesmo.

Um detalhe útil: no ISOLATED, `el.value = v` já cai no setter nativo, porque o setter que o React sobrescreve existe apenas no wrapper do mundo MAIN. Isso explica por que Hora e Atividade funcionaram a partir do content script. Um calendário com máscara e parse no blur, porém, costuma exigir o `onChange` do React **com o valor formatado** e um `blur` que confirme o parse. Por isso recomendo o MAIN para a data.

### 4. O componente de data (react-day-picker + moment)

O HTML mostra `DayPicker`, `CalendarInput`, `DateHeader` e `MonthPicker`, com moment e moment-timezone carregados. O padrão do react-day-picker v7 (`DayPickerInput`) é o seguinte: o componente guarda o texto em estado, faz o parse com `parseDate(value, format, locale)` e, **quando o parse falha, só guarda o texto e não atualiza o dia selecionado**.\[6\]\[7\] O `onDayChange` é chamado quando o usuário digita ou clica num dia.\[7\] No `handleInputBlur`, o componente também mexe no estado do overlay e repassa o `onBlur` recebido em `inputProps`.\[8\]\[9\] Na prática, isso gera dois riscos:

- Se o valor chegar ao componente fora do formato esperado (por exemplo, com espaço ou sem as barras), o parse falha e a data não é gravada.
- Se só o DOM mudar e o estado do React não, o próximo render ou o blur reescreve o input com o valor do estado. O campo volta a ficar vazio.

O plano B mais robusto é o que um humano faz: abrir o calendário, navegar até o mês certo e clicar na célula `DayPicker-Day`. O v7 tem classes padrão para isso: `navButtonPrev`/`navButtonNext` (renderizadas como `DayPicker-NavButton--prev`/`--next`), `caption` (`DayPicker-Caption`, que mostra "mês ano"), `day` e o modificador `outside` para dias de outro mês.\[10\] Os botões de navegação têm `aria-label` configurável (padrão "Next Month" e "Previous Month").\[10\]\[11\]\[12\] A versão exata que o SoftExpert embute pode ter classes com hash, como `FormInput_…_mLSrE`. Por isso o código abaixo usa seletores tolerantes (`[class*="DayPicker-Day"]`).

### 5. APIs próprias do SoftExpert

Não encontrei documentação pública de uma API JavaScript do SE Suite para definir valores de campo em `formexecution.php` (nada do tipo `setFieldValue` ou `executionInstance`). As buscas só devolveram APIs de outros produtos (ServiceNow, AgilePoint, Adobe). A documentação de integração do SoftExpert que aparece publicamente é de web services SOAP/REST, que é o que bibliotecas como SoftExpertAPI (.NET) e SoftExpertAPI (Python) abstraem.\[13\]\[14\] Não é uma API de front-end. Recomendo **não** depender de funções internas não documentadas, a menos que você as encontre no DevTools (veja em Recomendações). A alternativa realmente robusta e suportada é gravar o apontamento via web service do SE, sem passar pela tela.\[15\]

## Detalhes: código proposto

### manifest.json (trechos relevantes)

```json
{
  "manifest_version": 3,
  "permissions": ["scripting", "activeTab", "storage"],
  "host_permissions": ["https://*/*"],
  "content_scripts": [
    { "matches": ["https://*/softexpert/*"], "js": ["content.js"], "all_frames": true, "run_at": "document_idle" }
  ],
  "web_accessible_resources": [
    { "resources": ["patch-moment.js", "se-fill-main.js"], "matches": ["https://*/*"] }
  ]
}
```

`all_frames: true` é essencial. O `formexecution.php` costuma abrir dentro de um iframe, e sem isso o script nunca alcança o formulário. No popup, injete com `chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: 'MAIN', files: ['se-fill-main.js'] })`, ou use `func` com `args: [dados]`.\[4\]

### se-fill-main.js (roda no mundo MAIN)

```js
(() => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, timeout = 5000, step = 100) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { const v = fn(); if (v) return v; await sleep(step); }
    return null;
  };

  // --- 1. Localizar o campo certo (nunca o "Data" desabilitado) ---
  function getDateInput() {
    return document.querySelector('input[title="Data de apontamento:"]:not([disabled])')
      || [...document.querySelectorAll('input[placeholder="DD/MM/YYYY"]')]
           .find(i => !i.disabled && !i.readOnly && /apontamento/i.test(i.title || ''));
  }

  // --- 2. Acesso às props/fiber do React (15, 16, 17, 18+) ---
  function reactKey(el, prefix) { return Object.keys(el).find(k => k.startsWith(prefix)); }
  function getReactProps(el) {
    const pk = reactKey(el, '__reactProps$') || reactKey(el, '__reactEventHandlers$'); // 17+/16
    if (pk) return el[pk];
    const ik = reactKey(el, '__reactInternalInstance$');                               // 15/16
    const inst = ik && el[ik];
    return inst && (inst.memoizedProps || (inst._currentElement && inst._currentElement.props));
  }
  function getFiber(el) {
    const k = reactKey(el, '__reactFiber$') || reactKey(el, '__reactInternalInstance$');
    return k ? el[k] : null;
  }

  // --- 3. Setter nativo + reset do tracker + eventos ---
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    const last = el.value;
    setter.call(el, value);
    if (el._valueTracker) el._valueTracker.setValue(last); // React 16+
    const ev = new Event('input', { bubbles: true });
    ev.simulated = true;                                   // React 15
    el.dispatchEvent(ev);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // --- 4. Estratégias em cascata ---
  async function setDate(ddmmyyyy) {
    const el = getDateInput();
    if (!el) return { ok: false, reason: 'campo "Data de apontamento:" não encontrado (iframe?)' };

    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await sleep(150);

    // A) onChange direto via props do React
    const props = getReactProps(el);
    if (props && typeof props.onChange === 'function') {
      const proto = HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ddmmyyyy);
      props.onChange({ target: el, currentTarget: el, type: 'change',
                       persist() {}, preventDefault() {}, stopPropagation() {}, nativeEvent: new Event('input') });
      await sleep(150);
    }

    // B) setter nativo + tracker (se A não existir ou não surtir efeito)
    if (el.value !== ddmmyyyy) setNativeValue(el, ddmmyyyy);

    // C) digitação simulada (máscaras que só reagem a teclado)
    if (el.value !== ddmmyyyy) {
      el.select();
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      for (const ch of ddmmyyyy) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
        document.execCommand('insertText', false, ch);
        el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
        await sleep(30);
      }
    }

    // Confirmar: Enter/Tab + blur (é aqui que o componente faz o parse)
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    if (props && typeof props.onBlur === 'function') props.onBlur({ target: el, currentTarget: el, relatedTarget: null, persist() {} });
    el.blur();
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await sleep(400);

    if (await verifyDate(el, ddmmyyyy)) return { ok: true, via: 'input' };

    // D) Fallback: clicar no calendário
    const ok = await pickFromCalendar(el, ddmmyyyy);
    return { ok: ok && await verifyDate(getDateInput(), ddmmyyyy), via: 'calendar' };
  }

  // --- 5. Verificação: DOM + props do React após re-render ---
  async function verifyDate(el, expected) {
    await sleep(300);
    el = getDateInput() || el;                 // o React pode ter recriado o nó
    const domOk = el.value === expected;
    const p = getReactProps(el) || {};
    const propOk = p.value === undefined || p.value === expected
      || (window.moment && p.value && window.moment(p.value).format('DD/MM/YYYY') === expected);
    return domOk && propOk;
  }

  // --- 6. Fallback via DayPicker ---
  async function pickFromCalendar(el, ddmmyyyy) {
    const [d, m, y] = ddmmyyyy.split('/').map(Number);
    el.focus(); el.click();
    const trigger = el.closest('[class*="CalendarInput"], [class*="FormInput"]')
      ?.querySelector('button, [class*="icon"], [class*="Calendar"] svg');
    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const picker = await waitFor(() => document.querySelector('[class*="DayPicker"]:not([class*="Input"])'));
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
      if (!btn) return false;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(150);
    }
    const cell = [...picker.querySelectorAll('[class*="DayPicker-Day"], [role="gridcell"]')]
      .find(c => !/outside|disabled/i.test(c.className) && c.textContent.trim() === String(d));
    if (!cell) return false;
    for (const t of ['mousedown', 'mouseup', 'click']) cell.dispatchEvent(new MouseEvent(t, { bubbles: true }));
    await sleep(300);
    return true;
  }

  // --- 7. Lookup "Chamado:" ---
  async function setChamado(numero) {
    const el = document.querySelector('input[title="Chamado:"]:not([disabled])');
    if (!el) return { ok: false, reason: 'lookup Chamado não encontrado' };
    el.focus(); el.click();
    el.select(); document.execCommand('insertText', false, numero);  // dispara input "de verdade"
    if (el.value !== numero) setNativeValue(el, numero);
    el.dispatchEvent(new KeyboardEvent('keyup', { key: numero.slice(-1), bubbles: true }));

    const item = await waitFor(() => [...document.querySelectorAll(
        '[role="option"], [role="listbox"] li, [class*="Suggestion"] li, [class*="Autocomplete"] li, [class*="Lookup"] li, [class*="List"] [class*="Item"]')]
      .find(n => n.offsetParent !== null && n.textContent.includes(numero)), 8000);
    if (!item) return { ok: false, reason: 'lista de sugestões não apareceu' };
    for (const t of ['mousedown', 'mouseup', 'click']) item.dispatchEvent(new MouseEvent(t, { bubbles: true }));

    const ok = await waitFor(() => {
      const f = document.querySelector('input[title="Chamado:"]');
      return f && f.getAttribute('total') === '1' && (f.getAttribute('data') || '') !== '';
    }, 5000);
    return { ok: !!ok };
  }

  window.__seFill = { setDate, setChamado, getReactProps, getFiber };
})();
```

### Ordem recomendada no fluxo do Modo Turbo

1. `setChamado('054663')` primeiro. Selecionar o lookup costuma disparar um re-render que pode apagar campos já preenchidos.
2. `setDate('24/08/2026')`.
3. Horas e Atividade, que já funcionam.
4. Aplicar a borda verde **só** quando `verifyDate` e `total="1"` derem `ok: true`. Hoje a borda verde está sendo aplicada sem verificar nada, o que esconde o erro.

### Sequência da data (resumo)

| Passo | Ação | Motivo |
|---|---|---|
| 1 | `querySelector('input[title="Data de apontamento:"]:not([disabled])')` | Evitar o campo "Data" desabilitado |
| 2 | `focus` / `focusin` | Alguns componentes só aceitam mudança com foco (e abrem o calendário) |
| 3 | `props.onChange(...)` via `__reactProps$` | Grava direto no estado do React, sem depender do tracker |
| 4 | Setter nativo + `_valueTracker.setValue(last)` + `input`/`change` | Contorno padrão para React 16+ (e `simulated` para 15) |
| 5 | `execCommand('insertText')` caractere a caractere | Máscaras que só reagem a teclado |
| 6 | Enter + `onBlur` + `blur()` | Momento em que o `DayPickerInput`/moment faz o parse |
| 7 | Esperar cerca de 300–400 ms e reler DOM e props | Confirmar que o re-render não reverteu o valor |
| 8 | Fallback: calendário → navegar mês → clicar no dia | Mesmo caminho do usuário; é o mais resistente a mudanças de parse |

## Recomendações

1. **Confirme o seletor atual no `content.js`.** Procure por `placeholder="DD/MM/YYYY"`, `DD/MM` ou `querySelector('input[placeholder`. Se aparecer, essa é a causa do campo errado. Troque pelo seletor por `title` e acrescente `:not([disabled])`.
2. **Descubra a versão do React pelo DevTools.** No console do frame do formulário, rode `Object.keys($0).filter(k=>k.startsWith('__react'))` com o input selecionado. Se aparecer `__reactProps$`, é React 17 ou mais novo. `__reactEventHandlers$` indica 16. Só `__reactInternalInstance$` indica 15/16. Depois veja `$0[chave].onChange.toString()` e `onBlur` para saber em que formato o componente espera o valor (string `DD/MM/YYYY`, `Date` ou moment).
3. **Procure APIs internas no frame do formulário antes de adotá-las.** Rode `Object.keys(window).filter(k=>/form|exec|field/i.test(k))`. Se aparecer algo como um objeto de execução do formulário com métodos de set de campo, teste manualmente. Só use se o valor persistir depois de salvar, porque isso não é documentado e pode mudar entre versões (a sua é a v73952).
4. **Se o SoftExpert atualizar e quebrar o hack:** use o fallback do calendário como caminho principal, ou migre o lançamento para o web service oficial do SE.
5. **Mantenha o `patch-moment.js`, mas carregue-o antes do preenchimento e só uma vez.** Cheque se o id `__se_moment_patch__` já existe, porque uma injeção duplicada pode causar o SyntaxError citado na documentação.

## Ressalvas

- **Não li o código do repositório.** Todas as tentativas de abrir `content.js`, `patch-moment.js`, `popup.js`, `manifest.json` e `DOCUMENTACAO_COMPLETA.md` foram bloqueadas, e só a página inicial do repo ficou acessível. O diagnóstico do seletor é inferido dos sintomas. É o mais provável, mas não está verificado.
- O código proposto é **"com cara de testado", mas não foi executado** no seu ambiente SoftExpert v73952. As classes com hash (`_mLSrE`) e os nomes dos componentes (`CalendarInput`, `DateHeader`) podem variar. Os seletores foram escritos de forma tolerante, mas talvez precisem de ajuste pelo DevTools.
- Chamar `props.onChange` com um objeto de evento falso e mexer em `_valueTracker` depende de detalhes internos do React. Os próprios autores do `react-trigger-change` avisam que isso não serve para produção.\[16\]
- Rodar no mundo MAIN expõe o código à página: a página consegue detectar e interferir nele.\[5\] Não passe credenciais nem o token do Obsidian para o script MAIN. Envie só os dados do apontamento.
- `document.execCommand` é considerado obsoleto, mas continua funcionando no Chrome para `insertText` em inputs focados.

## Fontes

1. [Why input.value = 'x' doesn't fill a React form (and what actually works) - DEV Community](https://dev.to/flinthive/why-inputvalue-x-doesnt-fill-a-react-form-and-what-actually-works-1hl7)
2. [Javascript Tips & Tricks](https://help.observepoint.com/article/341-javascript-tips-tricks)
3. [let input = someInput;](https://qna.habr.com/user/lazalu68/comments?page=27)
4. [executeScript function can't access full window/globalThis object](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/SSxnEOeebLc)
5. [developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/ExecutionWorld)
6. [Using DayPickerInput](https://react-day-picker-v7.netlify.app/docs/input/)
7. [DayPickerInput API](https://react-day-picker-v7.netlify.app/api/daypickerinput/)
8. [onDayChange not always called from DayPickerInput · Issue #614 · gpbl/react-day-picker](https://github.com/gpbl/react-day-picker/issues/614)
9. [DayPickerInput onBlur always fires · Issue #672 · gpbl/react-day-picker](https://github.com/gpbl/react-day-picker/issues/672)
10. [react-day-picker - Flexible date picker component for React](https://react-day-picker-v7.netlify.app/api/daypicker/)
11. [react-day-picker@10.0.1 - jsDocs.io](https://www.jsdocs.io/package/react-day-picker)
12. [Github](https://npmdoc.github.io/node-npmdoc-react-day-picker/build/apidoc.html)
13. [GitHub - hudsonventura/SoftExpertAPI: API em .NET Core para abstrair a comunicação SOAP com o SoftExpert SESuite. · GitHub](https://github.com/hudsonventura/SoftExpertAPI)
14. [softexpert · GitHub Topics · GitHub](https://github.com/topics/softexpert)
15. [PROTIME - Importação de apontamento de horas](https://developer.softexpert.com/docs/data-integration/import/import-models/project/PROTIME)
16. [react trigger change](https://github.com/vitalyq/react-trigger-change)
