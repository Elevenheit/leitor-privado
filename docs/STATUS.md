# Estado verificável da entrega

Data: 24/09/2026. Branch: `feat/nook-closed-beta`; base: `origin/main` (`1a019c1`). Sem push, merge, deploy, pagamentos ou migração remota. O usuário confirmou ausência de projeto separado e solicitou configuração documentada.

## Implementado e verificado localmente

- Migração PostgreSQL executada em PGlite com schemas Auth/Storage mínimos de teste, RLS real, administrador e dois leitores. Cobre convite obrigatório, preservação de PDF/progresso/marcadores/favoritos, catálogo autorizado, independência do progresso, bloqueio de alterações alheias, proibição de autopromoção, Storage, comentários, spam, denúncia, moderação e expiração. **Não equivale a testar o serviço Supabase Auth.**
- Regras de abertura: visível desde tempo zero, destinos 90/110 segundos, curta duração, desligada e desaparecimento após destino. Nenhum salto automático.
- Chromium: CBZ original real descompactado pelo worker da aplicação; ordenação 1/2/10 e decodificação das imagens, rejeição de ZIP corrompido. WebM original gerado no browser, decodificado, reproduzido, pausado e buscado; fixture longa com buscas reais a 90 e 110 segundos. Não é um teste ponta a ponta da rota autenticada do player.
- Tela real de acesso/cadastro em desktop 1440×1000 e celular 390×844; sem overflow horizontal. Capturas em `docs/screenshots`. Nenhuma captura autenticada foi falsificada com um catálogo simulado.
- Lint, tipos e build de produção verificados nesta máquina. Os comandos e testes ficam versionados.

## Implementado, ainda exige homologação no Supabase separado

| Área | Implementação | Verificação remota pendente |
|---|---|---|
| Entrada | Email/senha, Entrar/Criar conta, convites no trigger, mensagens de erro, submit bloqueado enquanto aguarda | Cadastro sem SMTP, sessão emitida, duplicação, sessão expirada, configuração exata do projeto |
| Apresentação | Uma vez por navegador, Sobre o Nook, fallback se localStorage falha | Navegação autenticada em dispositivos reais |
| Catálogo | Home, quatro categorias, busca específica/global, recém adicionados, paginação de 24, capas privadas, lista pessoal | Acervo de produção clonado e resultados grandes |
| Obra | Sinopse/capa, itens em ordem numérica, volumes/temporadas, continuar e conversa no final | Associação de todo o acervo e agrupamento visual de temporadas |
| Perfil | Nickname único, nome/bio, ícone/avatar/banner, senha atual/nova, tema/fonte/tamanho | Upload e troca de senha real, políticas de Storage do provedor |
| Privacidade | Perfil completo só da própria pessoa; view expõe somente nickname/ícone/avatar; favoritos/progresso/marcadores privados | Não há página pública de perfil nem seletor para tornar a atividade pública; padrão privado é fixo |
| PDF | Leitor existente preservado; chave por usuário; Range privado; índice/marcadores/ilustrações; fonte e preferências da conta | PDF grande, corrompido/protegido, sem texto, retomada em outro dispositivo e memória em celular |
| CBZ | ZIP real em worker, limites, PNG/JPEG, páginas próximas, zoom/ajuste/direção, teclado, modos página e rolagem, progresso/posição, próximo | Rota com arquivo no Storage, retomada entre dispositivos, gestos nos aparelhos. Rolagem mostra janela de duas páginas com avanço explícito; não é uma tira infinita do capítulo inteiro |
| Vídeo | MP4/WebM por URL assinada, HTML5 controls, retomada, conclusão, próximo, abertura por episódio | Codecs reais de todos os navegadores, vídeo longo >110s, renovação de URL, reprodução pela rota autenticada |
| Conversa | Persistência, avatar/nickname/HH:mm, spoiler, resposta de um nível, CRUD próprio, paginação, denúncia/moderação, atualização manual | Cenários simultâneos em três navegadores e experiência de respostas atravessando páginas |
| Admin | Área separada, uploads PDF/lote existentes, editor de obras/volumes, CBZ/vídeo/temporada, abertura por episódio, autorização por obra, denúncias | Falhas entre Storage/banco, duplicatas concorrentes, grandes lotes; convites/acessos ainda administrados pelo SQL Editor |

## Limitações que não devem ser chamadas de prontas

- Beta **não está liberado para uso real** sem homologação e ensaio de restauração do guia BETA.md.
- XP/nível/tempo de atividade não implementados e não são exibidos. Perfil ainda não agrega uma estante de concluídas/atividade; a lista de favoritos e o continuar estão em suas rotas próprias.
- Sem HLS/transcodificação, legendas ou importação de CBR/EPUB. CBZ suporta somente JPEG/PNG; vídeo depende dos codecs do navegador.
- Novo upload de CBZ/vídeo é individual; o lote existente continua sendo de PDFs. Upload grande de vídeo ainda usa o upload padrão do Storage, não retomada TUS. O limite do plano pode ser menor que 500 MB.
- A validação de imagens de perfil é feita no cliente, além de MIME/tamanho no bucket. Não substitui inspeção server-side contra arquivos maliciosos. Imagens substituídas ficam no Storage até limpeza administrativa; não são apagadas antes de persistir a referência nova.
- O player salva a cada cinco segundos e em pausa/seek/fim; encerramento abrupto pode perder os segundos ainda não enviados. O CBZ salva rolagem por intervalos; fechar abruptamente pode perder o último trecho.
- URLs privadas expiram em uma hora e são renovadas ao reabrir. Ainda não há renovação transparente no meio de filmes longos. Revogação de conta não invalida imediatamente URLs já emitidas.
- Algumas consultas administrativas e índice do leitor ainda carregam listas completas (ou ficam sujeitas ao limite padrão do Supabase). Work detail pagina os itens em 100; o “continuar” desse detalhe procura nos itens da página carregada. Não homologado com milhares de capítulos.
- PDF já renderiza páginas próximas, mas caches de texto/ilustração de uma sessão longa merecem medição e limite adicional. Mudança para Range está implementada; latência/consumo real do Storage ainda não medidos.
- Páginas autenticadas ainda precisam de inspeção visual real desktop/mobile, foco e leitores de tela. O menu usa navegação normal e Escape, sem se apresentar como dialog modal.
- Lote legado e exclusão ainda precisam de recuperação mais robusta quando o Storage muda e a gravação de metadados falha. Não foi executada exclusão no acervo real.
- Direitos comerciais e planos futuros têm direção documentada, tags e nota de autorização; não há sistema de assinaturas/entitlements comerciais pronto.

## Desempenho: definição objetiva da medição

Não há números de rede inventados. Os tempos reais abaixo aguardam o ambiente de teste, usando o mesmo arquivo/cache e cinco execuções por cenário, reportando mediana e pior caso.

| Momento | Início → fim | Trabalho esperado |
|---|---|---|
| Biblioteca utilizável | sessão aceita → primeiros 24 cards clicáveis | RLS, favoritos, consulta paginada; capas privadas assíncronas |
| Primeira página PDF | clique em Ler → texto/canvas visível | metadados, URL assinada, PDF.js Range; PDF não linearizado pode pedir final/início do arquivo |
| Primeira página CBZ | clique → imagem decodificada | download completo até 40 MB, índice ZIP em worker, somente página próxima descompactada |
| Primeiro frame anime | clique em reproduzir → evento `playing`/frame | URL assinada, metadata/Range, buffer inicial e decoder |

Repetir com cache frio/quente e rede móvel, observar heap do Chrome, medir tráfego no painel Supabase, registrar demora do Render após hibernação. Um vídeo grande mal indexado pode exigir muito download antes do primeiro frame; prefira MP4 com metadados no início (faststart) ou WebM adequado.

## Comandos

`npm test` — migração/RLS PostgreSQL local e regras de mídia.

`npm run test:browser` — exige app em localhost:3100 e Chromium instalado; gera mídia original/capturas, sem efetuar cadastro ou alteração remota.

`npm run test:integration` — preparado, **não executado**; depende de três contas reais e das variáveis de teste documentadas.

`npm run lint`, `npm run typecheck`, `npm run build` — verificações estáticas/build, sem comprovar funcionamento do Supabase remoto.
