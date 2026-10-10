# Renovação visual do Nook — preto e azul

Preparado em 9/10/2026 a partir dos arquivos e das capturas locais do projeto.
Este documento orientou a renovação já implementada localmente. As alterações e validações estão em [STATUS](STATUS.md).

## O que precisa melhorar

- A identidade atual é marrom, bege e dourada. Esses tons aparecem nos tokens de `src/app/styles/base.css` e também diretamente em botões, formulários, menus, capas de fallback e estilos do leitor. Trocar somente `--accent` deixaria a renovação incompleta.
- Os estilos estão divididos em sete arquivos, importados por `src/app/globals.css`. Há regras sobrepostas e ajustes posteriores em `polish.css`, especialmente no leitor. A renovação precisa organizar essa cascata para manter o resultado previsível.
- As capturas mostram uma base funcional, com catálogo, retomada, navegação móvel e perfil. A melhoria deve dar mais clareza aos textos pequenos, aos filtros, às ações e às diferenças entre superfícies; também deve revisar a densidade das páginas longas no celular.
- Login, recuperação de conta, administração, gerenciamento de arquivos e estados vazios precisam receber o mesmo cuidado que a biblioteca. Uma capa bonita no início não resolve a experiência inteira.
- O leitor já tem recursos importantes: PDF original e texto adaptável, temas, busca, sumário, marcadores, modo foco e retomada. O novo visual deve preservar essas funções e a posição de leitura.
- Segundo `docs/STATUS.md`, cadastro aberto e acesso permanente já foram implementados localmente. A aparência deve acompanhar essa evolução, mas publicação e validação dos serviços externos continuam sendo trabalhos separados.

## Como usar aqui

1. Mantenha esta pasta aberta no Codex.
2. Envie a mensagem abaixo. O arquivo já contém o escopo, a direção visual, as páginas e os critérios de conclusão.

   > Implemente integralmente o prompt de `docs/PROMPT-RENOVACAO-VISUAL-NOOK.md`. Faça as alterações no projeto, revise todas as páginas, valide no navegador e corrija os problemas encontrados. Preserve as alterações existentes e as funções que já funcionam. Quero o resultado implementado, não apenas outra análise ou proposta.

3. Depois da implementação, use `npm run demo:local` e abra o endereço indicado pelo terminal para experimentar com dados temporários. Para testar com Supabase real ou publicar, siga `docs/TESTE-LOCAL-RENDER.md` e `docs/MIGRATIONS.md`.

Não é necessário colar novamente a análise anterior. O prompt executável começa a seguir.

---

## Prompt de implementação

Renove integralmente a interface do Nook, uma biblioteca e leitor de light novels, mangás e manhwas. Trabalhe diretamente neste repositório e entregue a implementação completa, com verificação visual e funcional.

Quero uma identidade predominantemente preta e azulada, elegante, sóbria e confortável para leitura longa. O resultado deve parecer uma aplicação cuidada e consistente em todas as páginas, com boa experiência no celular, tablet e computador.

### 1. Conheça e preserve o projeto

Antes de editar, leia as instruções locais aplicáveis, `README.md`, `docs/STATUS.md` e `docs/LANCAMENTO-NOOK.md`. Confira o estado do Git: há alterações anteriores que precisam ser preservadas.

Inspecione todas as rotas em `src/app`, seus componentes e os estilos realmente usados. Observe as capturas de `artifacts/next-browser` e `artifacts/browser` como referência do estado anterior; elas contêm dados de teste, não conteúdo para inserir na aplicação real.

Mantenha Next.js, React, TypeScript, Supabase, PDF.js, Lucide e as fontes já instaladas. Preserve a marca Nook e o português brasileiro. Reutilize e melhore os componentes existentes quando fizer sentido.

Preserve autenticação, cadastro aberto, confirmação de e-mail, recuperação de senha, administradores, suspensão de acesso, publicação explícita das obras, RLS e arquivos privados. Preserve as migrações e a compatibilidade com os dados existentes.

Esta tarefa é de interface e experiência de uso. Não execute migrações remotas, deploy, mudanças em serviços externos ou exclusão de dados como parte da renovação estética.

### 2. Direção visual

Crie uma biblioteca digital com fundo quase preto, superfícies em azul profundo, texto claro e azul como destaque controlado. As capas das obras devem trazer a maior parte da variedade de cores.

Use divisões claras entre fundo, cartões, painéis e elementos interativos. Combine bordas discretas, sombras suaves e espaços bem proporcionados. Evite brilho excessivo, neon, transparência que prejudique a leitura e decoração repetida em todas as telas.

Adote esta paleta inicial, ajustando combinações quando a validação de contraste exigir:

| Papel | Cor inicial | Uso |
| --- | --- | --- |
| Fundo | `#080C14` | Fundo geral |
| Superfície | `#0F1724` | Cartões e navegação |
| Superfície elevada | `#162033` | Painéis e diálogos |
| Superfície de interação | `#1C2B43` | Hover e seleção discreta |
| Divisor decorativo | `#26354C` | Separações de conteúdo |
| Borda de controle | `#64748B` | Campos e controles que precisam ser identificáveis |
| Texto principal | `#E8EFFA` | Conteúdo e títulos |
| Texto secundário | `#A5B3C9` | Metadados e explicações |
| Destaque | `#7CB2FF` | Links, indicadores e detalhes da marca |
| Botão principal | `#2563EB` | Ação principal, com texto `#F8FAFC` |
| Hover do botão principal | `#1D4ED8` | Estado de interação |
| Foco | `#93C5FD` | Contorno visível de teclado |
| Sucesso | `#86EFAC` | Confirmações |
| Atenção | `#FCD34D` | Avisos que exigem atenção |
| Erro | `#FDA4AF` | Erros e ações destrutivas identificadas |

Separe a cor de links da cor de fundo de botões: uma única variável não deve obrigar combinações de texto com contraste insuficiente. Bordas decorativas e bordas que identificam campos também têm papéis diferentes.

Use Inter na interface e preserve Literata para a leitura literária. Defina uma hierarquia coerente de títulos, subtítulos, corpo e metadados; mantenha a influência editorial sem usar títulos gigantes em toda página. Evite informações essenciais em letras minúsculas e pouco contrastadas.

Use uma escala consistente de espaços e raios, aproveitando os tokens existentes. Botões equivalentes devem ter a mesma altura, tipografia, borda e comportamento. Mantenha os ícones no sistema Lucide existente.

### 3. Sistema de estilos e componentes

Revise `src/app/globals.css` e todos os arquivos em `src/app/styles`: `base.css`, `library-reader.css`, `catalog-admin.css`, `profile-community.css`, `navigation.css`, `catalog.css` e `polish.css`.

Centralize os tokens globais no local responsável por eles, hoje `base.css`. Mantenha aliases necessários durante a migração. Defina tokens semânticos para ações, foco, seleção, feedback e controles, além das superfícies.

Revise cores e gradientes escritos diretamente nos seletores. Atualize os tons quentes da interface, inclusive seleção de texto, placeholders, abas, barras de progresso, menus e fallbacks de capa. Não faça substituição indiscriminada em imagens, conteúdos, PDFs ou no tema sépia.

Organize as regras sobrepostas e os breakpoints conflitantes. Evite acumular outro arquivo gigante de correções por cima da cascata. Remova CSS sem uso somente depois de verificar seus consumidores.

Padronize botões, campos, seletores, abas, badges, cartões, mensagens, skeletons e diálogos. Inclua estados normal, hover, foco, pressionado, carregando, desabilitado, sucesso e erro. Use componentes compartilhados quando houver repetição real, sem criar abstrações desnecessárias.

### 4. Todas as páginas devem ser renovadas

| Página ou fluxo existente | Resultado esperado |
| --- | --- |
| Login, cadastro, pedido de recuperação e reenvio de confirmação em `auth-gate.tsx` | Entrada elegante, compacta e clara; campos com labels; ações bem hierarquizadas; mensagens úteis; fluxo completo utilizável com teclado virtual. |
| `/auth/confirm` e `/auth/recovery` | Mesma identidade visual do login; estados de processamento, sucesso, link inválido ou expirado e nova senha com ações compreensíveis. |
| `/` | Início com hierarquia entre retomar leitura e explorar biblioteca; saudação discreta; filtros organizados; bom aproveitamento da tela. |
| `/library` | Acervo com grid adaptável, títulos legíveis, informações reais e paginação clara; consistência com o início. |
| `/search` | Busca em destaque; filtros acessíveis no celular; seleção ativa identificável; resultados e ausência de resultados bem apresentados. |
| `/category/novel`, `/category/manga`, `/category/manhwa` | Identidade de categoria sem duplicação de conteúdo ornamental; mesmos padrões de grid, filtros e navegação do catálogo. |
| `/list` | Favoritos com estado de seleção claro e vazio que indique como adicionar obras; preserve o isolamento por conta. |
| `/continue` | Histórico com capa, obra, capítulo e progresso legíveis; ação de continuar fácil de encontrar; distinção entre leitura em andamento e concluída. |
| `/series/[id]` | Capa, sinopse, formato e ação de começar/continuar bem distribuídos; volumes, capítulos e comentários fáceis de consultar em qualquer largura. |
| `/read/[id]` | Leitor de PDF e texto confortável, com interface discreta, controles acessíveis, painéis consistentes e retomada preservada. |
| `/media/[id]` | Leitor CBZ com arte preservada, rolagem confortável, controles claros e layouts adequados para mangá e manhwa. |
| `/profile` | Identidade com avatar e banner; seções de perfil, preferências e segurança bem separadas; formulários agradáveis no celular. |
| `/admin` | Painel legível e eficiente; distinção visual entre leitura e administração; busca, publicação, edição e upload claros. |
| `/admin/series/[id]` | Edição organizada de obra, volumes e capítulos; estados publicada/restrita claros; formulários e ações destrutivas bem identificados. |
| `/manage` | Gerenciamento utilizável no celular; seleção e ações em massa visíveis; nomes longos tratados; confirmações e resultados claros. |
| `/about` | Apresentação editorial alinhada à nova marca, com benefícios reais de leitura e um caminho claro para a biblioteca. |
| Estados globais | Carregamento, erro, acesso suspenso, área exclusiva de admin, obra indisponível e página não encontrada com a mesma linguagem e ações úteis. |

Não deixe telas secundárias, diálogos ou estados especiais no tema antigo. Se a página 404 estiver usando apenas o padrão do Next, crie uma apresentação coerente com o produto e retorno para uma rota existente.

### 5. Navegação, biblioteca e obra

- Renove a navegação lateral, sua expansão, o cabeçalho móvel, o menu e a barra inferior. Mostre o item ativo também por forma ou indicador, não somente pela cor. Preserve os destinos existentes e a visibilidade das ações conforme a permissão.
- Evite deslocamentos inesperados do conteúdo ao expandir o menu. No celular, o menu deve abrir, fechar e devolver o foco corretamente; a barra inferior não pode encobrir o último item nem ações de formulário.
- Preserve o comportamento imersivo dos leitores. Não sobreponha a navegação geral aos controles e à página de leitura.
- Defina largura máxima e margens adequadas por tipo de página. Em monitores grandes, a biblioteca pode usar mais espaço; texto longo deve continuar confortável.
- Faça os filtros se reorganizarem no celular com labels claros e indicação do que está selecionado. Mantenha os filtros, ordenação e paginação no servidor já implementados, inclusive o tamanho de página atual de 24 itens.
- Preserve a proporção das capas, sem esticar imagens. Crie um fallback sóbrio em preto e azul para obras sem capa. Mantenha imagens reais e seus textos alternativos.
- Equilibre o número de colunas com a largura disponível e a legibilidade. Permita quebra de títulos longos; não reduza todo o texto para caber mais cartões.
- Nos cartões de retomada, deixe explícitos obra, capítulo e ação. Mostre somente progresso que realmente exista nos dados.
- Na obra, use composição com capa e informações lado a lado quando houver espaço e empilhamento no celular. Sinopses longas, listas de capítulos e comentários precisam continuar utilizáveis.
- Preserve capítulos de todas as páginas da consulta, links corretos de início/retomada, marcação de concluído, favoritos, spoilers e moderação.

### 6. Leitores: prioridade para o conforto

- Faça o tema escuro padrão combinar com a nova identidade, com fundo quase preto azulado e texto claro sem azul saturado no corpo da leitura.
- Preserve os temas claro e sépia como escolhas reais. Mantenha os tokens `--reader-*` separados dos tokens globais e valide os painéis nos três temas.
- Preserve a diagramação e as cores das páginas do PDF original e das imagens CBZ. Não aplique filtros de cor para forçar o tema do site sobre a obra.
- Mantenha preferências de fonte, tamanho, espaçamento e largura que já existam. Ajustar o layout ou alternar PDF/texto não pode perder a página, a âncora textual ou a posição de leitura.
- Organize título, capítulo, estado de salvamento, modo de leitura, configurações e navegação sem lotar a barra. Em telas estreitas, distribua os controles em linhas ou agrupamentos claros, mantendo os alvos de toque.
- Revise sumário, busca no PDF, ir à página, configurações, índice e marcadores. Os painéis devem caber na altura disponível, ter rolagem interna e manter o fechamento acessível.
- Preserve busca cancelável, carregamento gradual e limites existentes. Não extraia o PDF inteiro na abertura só para alimentar a nova interface.
- Mantenha resultados, seleção e ação de ler o trecho acessíveis no celular. PDFs digitalizados sem texto precisam ter uma explicação honesta e acesso ao original.
- Preserve modo foco, controle para recuperar a interface, navegação entre capítulos, marcadores antigos, progresso local/remoto e sincronização após reconexão.
- Revise retrato, paisagem, tela curta, teclado virtual e áreas seguras do dispositivo. Não esconda o texto atrás de barras fixas; não crie saltos de rolagem ao mostrar controles.

### 7. Perfil, administração e estados de interface

No perfil, garanta legibilidade sobre banners personalizados, bons fallbacks de avatar e feedback de upload/salvamento. Preserve campos, preferências e dados que a tela não edita. Diferencie alterações de perfil, preferências de leitura e senha sem criar um formulário interminável e confuso.

Na administração e no gerenciamento, priorize clareza das operações: criar, editar, publicar, restringir, selecionar e excluir. Uma ação destrutiva deve ter confirmação coerente com o que será removido. Preserve o fluxo de upload individual, em lote e retomável, com progresso, erros e possibilidade de correção visíveis.

No celular, reorganize linhas densas e grupos de ações. Use rolagem horizontal somente em regiões que realmente exijam uma tabela; a página inteira não pode transbordar. Menus de ações não devem depender de hover.

Estados vazios devem explicar a situação e oferecer uma ação existente. Diferencie biblioteca vazia, nenhum resultado para o filtro, obra sem capítulos e falha de carregamento. Não mostre ausência de resultados como se fosse erro de rede.

Use mensagens curtas e diretas em português. Não exponha detalhes de implementação ao leitor quando não ajudarem a resolver o problema. Preserve o reconhecimento da demonstração local e seus dados temporários.

### 8. Responsividade e acessibilidade

- Desenvolva a composição a partir do celular e amplie conforme o conteúdo permitir. Use breakpoints coerentes, sem colecionar correções para aparelhos específicos.
- Verifique larguras de 320, 360, 390, 430, 768, 900, 1024, 1440 e 1920 pixels, além de uma tela em paisagem de aproximadamente 844 × 390.
- Evite scroll horizontal na página, cortes de textos essenciais, botões sobrepostos, menus fora da tela e modais com fechamento inacessível. Não esconda problemas com `overflow-x: hidden` global.
- Adote alvos interativos de pelo menos 44 × 44 CSS px como requisito deste produto, inclusive botões só com ícones. Não apresente esse valor como se fosse o mínimo AA da WCAG 2.2.
- Garanta contraste de pelo menos 4,5:1 para textos comuns e 3:1 para textos grandes. Valide combinações reais, incluindo texto secundário, placeholder, badges, hover e temas de leitura. Referência: [W3C — contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- Valide a identificação dos controles e o foco contra seus fundos. Não use a borda decorativa fraca da paleta como único meio de identificar um campo.
- Mantenha labels associados aos campos, nomes acessíveis para ícones, hierarquia de headings, foco visível, link de pular para o conteúdo, navegação por Tab e fechamento por Escape onde aplicável.
- Diálogos devem gerenciar foco e devolvê-lo ao acionador. Alertas e estados de salvamento precisam ser anunciados sem gerar ruído contínuo.
- Teste zoom de 200% e reorganização a uma largura equivalente de 320 CSS px. Registre separadamente zoom nativo do navegador e simulação por CSS; não declare um teste como se fosse o outro. Referência: [W3C — reorganização do conteúdo](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Mantenha campos confortáveis para digitar no celular, sem desativar o zoom do navegador. Respeite `prefers-reduced-motion` e a preferência já existente de reduzir animações.
- Use animações curtas somente para ajudar a entender uma interação. Preserve a escolha de som de boas-vindas; não introduza áudio automático ou movimento obrigatório.

### 9. Aparência de produto estável

Revise textos visíveis e remova referências obsoletas a closed beta, convite ou acesso temporário quando não corresponderem mais ao comportamento atual. Não substitua mensagens necessárias de suspensão, erro ou permissão por promessas de acesso irrestrito.

Biblioteca privada por conta não significa closed beta: autenticação, privacidade e administração continuam fazendo parte do produto. Não torne arquivos públicos para cumprir um objetivo visual.

Nomes históricos como `BetaAccess`, `beta_visible` e o serviço `nook-closed-beta` não controlam sozinhos a aparência nem justificam renomear banco ou infraestrutura nesta tarefa. Preserve contratos existentes; foque nos textos e fluxos vistos pelo usuário.

Não invente avaliações, estatísticas, leitores ativos, novidades, suporte, assinaturas ou recursos ausentes. Não remova a indicação de demonstração para simular uma instalação em produção.

A renovação deve melhorar a percepção de qualidade por meio de consistência, legibilidade e funcionamento. Não declare lançamento remoto, e-mails funcionando ou homologação de Supabase sem evidência real.

### 10. Execute e valide até concluir

1. Registre o estado inicial das telas principais e identifique os componentes compartilhados e conflitos de CSS. Use os testes existentes como referência de comportamento.
2. Implemente tokens, superfícies, tipografia e controles; depois navegação e fluxos de conta.
3. Renove todas as páginas da tabela, incluindo filtros, cartões, listas, formulários e estados especiais. Faça as mudanças compartilhadas propagarem de forma consistente.
4. Refine os leitores e seus painéis com atenção à posição de leitura, temas, altura disponível e controles móveis.
5. Abra a aplicação local, percorra as rotas com dados temporários e confira as versões de celular e computador. Use as ferramentas de navegador disponíveis. Não considere apenas build ou screenshots antigos como validação do novo visual.
6. Capture e inspecione o resultado nas telas principais e nos estados críticos. Verifique títulos longos, ausência de capa, filtros vazios, erros, carregamento, upload e painéis abertos.
7. Rode `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:browser` e `npm run test:next-browser`. Corrija regressões introduzidas. Se a interface ou a demo exigir ajustes, valide também `npm run test:demo-local`, seguindo o procedimento existente para iniciar o ambiente necessário.
8. Ajuste seletores de testes somente quando a mudança de interface justificar; preserve as verificações de comportamento. Mantenha cobertura de acesso, isolamento de dados, retomada, PDF real, CBZ, busca, teclado, toque e descarte de recursos. Não transforme falhas em sucesso removendo assertions.
9. Revise o diff, remova apenas resíduos da própria implementação e entregue um relatório curto das mudanças, validações e limitações reais.

Não adicione dependências pesadas para produzir efeitos visuais simples. Preserve carregamento gradual de imagens/documentos e o catálogo paginado. Não execute `npm audit fix --force` ou atualizações de infraestrutura como atalho para esta renovação.

Não pare depois de desenhar a paleta, entregar um plano ou renovar apenas a página inicial. Continue pelas etapas locais autorizadas até completar o escopo. Se alguma validação depender de ferramenta ou ambiente indisponível, informe exatamente o que faltou e conclua o restante possível sem inventar evidências.

### Critérios de conclusão

- Todas as rotas e fluxos da tabela usam a nova identidade e padrões coerentes.
- Preto e azul predominam na interface; capas reais e temas claro/sépia mantêm sua finalidade.
- O site é utilizável nas larguras propostas, com navegação, controles e formulários acessíveis.
- Leitura, progresso, favoritos, comentários, conta, permissões e administração continuam funcionando.
- Não há textos obsoletos de beta nos fluxos normais nem alegações falsas sobre publicação.
- Os checks executados e a revisão no navegador têm seus resultados registrados, incluindo qualquer pendência.
- A entrega explica o que mudou, quais arquivos foram relevantes e como testar o resultado, sem criar uma coleção desnecessária de novos documentos.
