# Automação SoftExpert & Obsidian (N1 Sankhya)

Extensão do Google Chrome para integração e automação bidirecional entre o **SoftExpert Suite (SE)** e o **Obsidian** via **Local REST API**.

---

## 🚀 Funcionalidades

### 1. 📥 Captura de Chamados (SoftExpert ➔ Obsidian)
- Extração de metadados do chamado ativo na tela do SoftExpert:
  - Número do chamado
  - Título / Atividade
  - Solicitante
  - Descrição do problema
  - Histórico completo de trâmites (data, responsável, papel, atividade, descrição formatada em citação)
- Geração automática de notas Markdown estruturadas com frontmatter YAML no Obsidian.
- Criação automática da fila de apontamentos pendentes vinculada ao chamado.

### 2. ⏱️ Lançamento de Apontamentos (Obsidian ➔ SoftExpert)
- Leitura em tempo real das notas de chamados do Obsidian via REST API local (`https://127.0.0.1:27124`).
- Filtro inteligente de apontamentos pendentes (`status: pendente`).
- **Preenchimento Automático do Formulário SE:**
  - Campo Chamado
  - Campo Data de apontamento (formatação brasileira `DD/MM/YYYY` e suporte ao componente `react-day-picker`)
  - Campo Hora início (`HH:MM`)
  - Campo Hora final (`HH:MM`)
  - Campo Atividade executada (textarea)
- **Marcação Automática no Obsidian:**
  - Atualiza o status do apontamento para `apontado` no YAML frontmatter.
  - Marca a checklist visual no corpo da nota: `- [ ]` ➔ `- [x]`.
  - Se todos os apontamentos da nota forem concluídos, atualiza o status geral do chamado para `status_apontamento: apontado`.
- **Modo Turbo (`🚀 Preencher & Marcar Próximo`):** Preenche o formulário do SE e avança para o próximo chamado da fila em um clique.

---

## 📁 Estrutura de Arquivos

```text
├── manifest.json       # Manifesto Manifest V3 da extensão Chrome
├── popup.html          # Interface gráfica com abas "Capturar" e "Lançar Apontamentos"
├── popup.js            # Lógica de integração com a REST API do Obsidian e interface
├── content.js          # Injetor DOM no SoftExpert (leitura de tela e preenchimento React/DHTMLX)
└── README.md           # Documentação do projeto
```

---

## ⚙️ Instalação e Uso

1. Abra o Google Chrome e acesse `chrome://extensions/`.
2. Ative o **Modo do desenvolvedor** no canto superior direito.
3. Clique em **Carregar sem compactação** e selecione a pasta deste repositório.
4. No Obsidian, garanta que o plugin **Local REST API** esteja ativo na porta `27124` (HTTPS).
5. Abra o SoftExpert e utilize o popup da extensão para capturar ou lançar apontamentos.
