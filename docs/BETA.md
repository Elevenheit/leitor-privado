# Guia operacional do beta Nook

## Situação e ambiente

O usuário confirmou que ainda não existe um Supabase separado. Este guia prepara esse ambiente; nenhum passo remoto foi executado. `main` permanece intacto. A branch local pode ser revisada antes de qualquer publicação.

O beta utiliza Next.js/React/TypeScript, Supabase Auth/PostgreSQL/Storage, PDF.js, fflate e upload resumível TUS para os PDFs existentes. Não existe cobrança nem XP.

## 1. Backup e ensaio de restauração

Antes de qualquer alteração de produção, interrompa uploads e escritas durante a captura consistente. Não confunda o dump do banco com backup dos arquivos: Storage precisa de cópia separada.

1. Configure PostgreSQL `pg_service.conf` e `pgpass` em diretório privado, para que `PGSERVICE` identifique a conexão de origem sem senha em argumentos ou logs.
2. Em ambiente administrativo local, defina `NOOK_BACKUP_URL`, `NOOK_BACKUP_SERVICE_KEY` e `PGSERVICE`. A chave de serviço fica somente no processo local; não entra no `.env.local` da aplicação nem em variáveis `NEXT_PUBLIC_*`.
3. Execute `node scripts/backup.mjs`. O script só lê a origem. Ele gera `backups/<data>/database.dump`, cópia dos buckets `novels`/`covers` (e `profiles`, se existir) e manifesto com SHA-256. Falha interrompe a execução; não use uma pasta incompleta como backup válido. O download consome tráfego e memória proporcional a um arquivo; para acervo muito grande, use exportação S3/streaming administrativa.
4. Execute `supabase/verify-preservation.sql` antes da migração e salve o resultado com o backup.
5. Criptografe e mantenha uma cópia fora do repositório. O dump contém dados privados de Auth.
6. Ensaie a restauração em um banco/projeto descartável. Examine `pg_restore --list database.dump`; em PostgreSQL descartável compatível use `pg_restore --no-owner --exit-on-error --dbname=<serviço de destino> database.dump`. Um Supabase novo já contém schemas e funções gerenciados: não restaure cegamente o dump completo sobre eles. Use o procedimento de restauração suportado pelo provedor ou uma lista de objetos revisada, preservando UUIDs de Auth. Verifique grants, funções Auth, policies e arquivos depois. Este ensaio ainda não foi executado.
7. Restaure objetos pelo Storage com os mesmos bucket/path e confira tamanho e SHA-256. Não faça upload direto em tabelas de metadados de Storage.

## 2. Ordem SQL

**Banco existente no estado do main:** confirme as migrações anteriores; execute apenas `005_closed_beta.sql`, uma vez, em transação. A 005 não deve ser executada novamente depois de aplicada. O erro aborta a transação, sem aplicação parcial.

**Projeto vazio de teste:**

1. Antes da migração, crie uma conta administradora no painel Auth, sem enviar convite por e-mail. Use senha temporária forte. Descubra seu UUID.
2. Ajuste o UUID de proprietário em uma cópia privada de `supabase/schema.sql` e na inserção administrativa da 005 para esse UUID. Não use o UUID do dono da produção em um projeto vazio.
3. Execute `supabase/schema.sql`.
4. Execute `supabase/migrations/002_library_structure.sql`.
5. Execute `supabase/migrations/004_reader_productivity.sql` (não há arquivo 003 no repositório).
6. Execute a cópia revisada de `supabase/migrations/005_closed_beta.sql`.
7. Execute novamente `supabase/verify-preservation.sql`. Compare contagens, caminhos, progresso e marcadores com a captura anterior. Confira a cópia dos favoritos antigos na tabela `favorites`.

A 005 preserva `owner_id` como autoria do catálogo e os caminhos existentes. Converte a chave do progresso para `(owner_id, book_id)`, copia favoritos e substitui as policies antigas. A função `is_private_owner()` fica legada, sem uso nas novas policies. O catálogo é administrado por `beta_access.role`, nunca por user metadata. Perfis privados e uma view limitada de identidade impedem expor bio/preferências/email aos outros usuários. Uma conta pode consultar apenas suas próprias permissões e não pode atribuir a si mesma papel administrativo.

As policies de Storage removidas são as antigas com prefixo `Owner `; revise policies adicionais personalizadas antes de aplicar. O teste local cobre somente as policies versionadas. Buckets permanecem privados. URLs assinadas duram uma hora: revogar acesso impede novas URLs, mas não cancela imediatamente URLs já emitidas nem arquivos já baixados.

## 3. Auth sem confirmação de e-mail

No projeto **de teste**, em Authentication → Sign In / Providers → Email:

- Email/password: habilitado.
- **Confirm Email: desativado.**
- Allow new users to sign up: habilitado somente depois da 005 e dos convites.
- Anonymous sign-ins: desativado; provedores externos desativados para este ensaio.
- Comprimento mínimo de senha: pelo menos 10.
- Site URL: endereço do serviço de teste; desenvolvimento em `http://localhost:3100` quando necessário.
- Não é necessário configurar SMTP para esse fluxo. Não há recuperação automática exibida no aplicativo.

O trigger `enroll_beta` roda em `auth.users`: cadastro fora da lista ou convite expirado aborta a criação, inclusive por API direta. Não depende de um Auth Hook configurado no painel. Com confirmação desativada, `signUp` deve entregar sessão. Caso venha sem sessão, a UI orienta tentar Entrar e revisar a configuração, sem pedir confirmação por e-mail.

Fontes: [configuração Auth](https://supabase.com/docs/guides/auth/general-configuration), [signUp](https://supabase.com/docs/reference/javascript/auth-signup) e [senhas](https://supabase.com/docs/guides/auth/passwords).

No SQL Editor administrativo, cadastre os e-mails exatos em minúsculas, com o mesmo encerramento do beta (substitua os valores de exemplo):

```sql
insert into public.beta_invites(email, expires_at)
values ('amigo-a@example.test', '<encerramento UTC>'::timestamptz),
       ('amigo-b@example.test', '<encerramento UTC>'::timestamptz);
```

Os amigos abrem o site, escolhem Criar conta e informam e-mail/senha. A lista de convites não é legível pelo navegador. Um convite só pode ser usado uma vez. Não inclua uma lista pública de e-mails convidados. Sem confirmação, conhecer um e-mail convidado permite tentar reivindicá-lo; use apenas o grupo pequeno e conhecido. Antes de abertura pública, substitua por convites de alta entropia/verificação de identidade.

Para encerrar antecipadamente: `update public.beta_access set revoked=true where user_id='<UUID>';`. Para administrar convites e acessos, use o SQL Editor; ainda não há painel de gestão de convidados na UI.

**Senha esquecida:** confirme a identidade do amigo por canal já conhecido. Um administrador do projeto usa a Admin API `updateUserById` num script local com chave de serviço e define uma senha temporária aleatória. Entregue-a por canal privado separado e peça troca imediata em Meu perfil. Não registre senha em issues, comentários, logs ou no Git. Não há “Esqueci minha senha” que dependa de SMTP. A troca autenticada pede a senha atual.

## 4. Publicar somente conteúdo autorizado

Entre como administrador → Administrar acervo. Os controles existentes preservam PDF individual, lote, obras e volumes. O painel “Publicar mangá, manhwa ou anime” permite escolher obra/formato, enviar CBZ ou MP4/WebM, criar temporada e definir número do episódio e abertura.

Obras existentes começam restritas à administração. Registre a autorização em “Autorização de compartilhamento” e clique “Liberar obra autorizada aos convidados”. A mudança de formato é bloqueada se já houver mídia incompatível. Uma obra nova deve ser criada primeiro pelos controles do acervo. A estrutura de temporadas reutiliza volumes; episódios reutilizam books com `media_type=video`.

Use `tests/fixtures/nook-original.cbz` e `nook-original.webm`, produzidos pelo teste do navegador, como mídia original autorizada. O CBZ contém três páginas PNG com nomes `1`, `2`, `10`. O WebM é curto, serve para testar reprodução e o limite de duração; `nook-long.webm` contém 120 segundos (repetição da mídia original) e foi usado para buscar posições reais em 90/110 segundos no navegador. O player integrado ainda precisa dessa homologação autenticada.

Não presumimos direitos sobre os PDFs atuais. Preencha `rights_note` por obra e mantenha provas de licença fora do banco, quando necessário. Tags estão previstas em `series.tags`; filtros vazios e planos fictícios não são exibidos.

## 5. Render — somente depois da aprovação

1. Revise a branch e os resultados; obtenha autorização para publicar o serviço de teste. O trabalho entregue não faz push nem deploy.
2. Envie a branch ao remoto e crie um serviço separado, usando `render.yaml`, sem substituir o serviço atual.
3. **Blueprint Auto Sync: No** e **Auto-Deploy: Off**. O arquivo já usa `autoDeployTrigger: off`, mas Auto Sync do Blueprint é uma configuração separada no painel.
4. Node `24.21.0`; build `npm ci && npm run build`; start `npm run start -- -p $PORT`.
5. Configure apenas `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` do projeto de teste. São valores públicos destinados ao cliente; RLS protege os dados. Nenhuma chave de serviço é necessária no Render.
6. Execute a implantação manual e ajuste Site URL no Supabase. Mudanças de variáveis `NEXT_PUBLIC_*` exigem rebuild.
7. Verifique o fluxo completo com as três contas antes de convidar o grupo maior.

[Referência do Blueprint](https://render.com/docs/blueprint-spec), [Auto Sync](https://render.com/docs/infrastructure-as-code). O serviço gratuito hiberna após 15 minutos sem tráfego e tem filesystem efêmero; o primeiro acesso frio pode ser lento. [Limites do Render Free](https://render.com/docs/free).

## 6. Reversão

Não altere o main nem remova dados para tentar compatibilizar o banco com o código antigo. O main fazia upsert por `book_id`, incompatível com a nova chave por usuário.

Se a 005 falhar antes do commit, execute ROLLBACK e corrija no clone. Se houver problema após o beta começar: feche os cadastros, revogue temporariamente os leitores, suspenda escritas e tire **novo backup** do estado atual. Preserve os registros criados pelos amigos.

Restaure o backup anterior em **outro projeto**, verifique objetos e manifesto, use o commit `1a019c1` com as variáveis desse projeto e só então aprove a troca do serviço. Mantenha o projeto do beta íntegro para extrair comentários/progresso novos depois. Não há um down.sql que descarte progresso de leitores para recuperar uma chave global. O ensaio de reversão é bloqueador do início do beta e ainda precisa ser feito.

## 7. Homologação com administrador + dois leitores

Em três perfis de navegador independentes, e um quarto contexto para simular outro dispositivo:

1. Admin: comparar contagens de obras/PDFs/capas/volumes/progresso/marcadores e abrir arquivos antigos. Autorizar quatro obras de teste, uma de cada categoria.
2. Anônimo: testar Entrar e Criar conta, credenciais erradas, convite inexistente/expirado, duplicação de envio, rede desligada. Confirmar que não há confirmação por e-mail.
3. Amigos A e B: cadastrar com e-mails convidados. Apresentação deve aparecer uma vez no navegador, depois biblioteca. Reabrir em Sobre o Nook. Bloquear localStorage e verificar usabilidade.
4. Cada pessoa muda nickname, avatar/banner, preferências, favorito, marcador e progresso. Conferir nickname único e ausência de e-mail em comentários e identidades.
5. A lê página 2, B página 10 do mesmo PDF/CBZ. A abre outro navegador e retoma sua posição. Testar PDF só com imagens, corrompido e protegido; modo página continua disponível.
6. Buscar em cada categoria. Conferir recém adicionados somente naquele formato e busca global identificada na home. Testar segunda página do catálogo.
7. Conferir CBZ na ordem 1,2,10, zoom, direção, teclado, rolagem, retomada, próximo capítulo e limite de arquivo.
8. Reproduzir WebM/MP4 autorizado, pausar/buscar, retomar em outro navegador, concluir e avançar. Em vídeo longo testar abertura 90/110; em vídeo curto verificar que não ultrapassa duração; desativar abertura e conferir ausência do botão. Nenhum salto automático.
9. Publicar/editar/excluir/responder; marcar spoiler; denunciar como B e moderar como admin. Conferir avatar, nickname, HH:mm, data de dias anteriores e conversa após toda a lista de itens. Conferir paginação e atualização manual sem Realtime.
10. Executar `npm run test:integration` com as variáveis abaixo. Ele faz chamadas reais ao Supabase, cria uma obra/item temporários e remove ao final; não cria mídia fictícia para fingir reprodução. Conferir também acesso anônimo/revogado ao Storage e ausência de permissões herdadas desconhecidas.
11. Expirar B e confirmar que novas consultas/URLs são negadas. Revalidar tokens já emitidos considerando TTL de uma hora.
12. Verificar 390×844 e 1440×1000, teclado/foco, iOS/Android reais, memória, leitor longo e falhas de rede. Registrar tempos conforme STATUS.md.

Variáveis de integração (somente no shell local; não enviar ao Render/Git): `NOOK_TEST_URL`, `NOOK_TEST_ANON_KEY`, `NOOK_TEST_PROJECT_REF`, `NOOK_TEST_ADMIN_EMAIL`, `NOOK_TEST_ADMIN_PASSWORD`, `NOOK_TEST_READER_A_EMAIL`, `NOOK_TEST_READER_A_PASSWORD`, `NOOK_TEST_READER_B_EMAIL`, `NOOK_TEST_READER_B_PASSWORD`, `NOOK_ALLOW_TEST_WRITES=isolated-beta-only`. As contas devem existir e ter papéis corretos antes do teste.

## 8. Sete dias e feedback

Dia 0: homologação e restauração. Dia 1: acesso e biblioteca. Dia 2: PDFs. Dia 3: CBZ. Dia 4: vídeos. Dia 5: conversa e perfis. Dia 6: repetição em celular/rede ruim. Dia 7: revisão, expiração e exportação do feedback.

Use um arquivo compartilhado ou issue privada com o modelo `docs/feedback-template.md`. Colete: apelido, data, dispositivo/navegador, tela, ação, esperado/observado, gravidade e captura sem e-mail/token. Não envie senhas ou URLs assinadas. Não foi criado nem enviado formulário externo.

## 9. Custos e limites

A mídia vai diretamente do Storage ao navegador, sem retransmissão pelo Render. PDF usa URL privada e leitura por intervalos, quando o Storage responde Range; CBZ precisa baixar o ZIP antes de abrir. Não há transcodificação/HLS nem legendas anunciadas.

Limites locais: CBZ 40 MB comprimido, até 400 páginas PNG/JPEG, 12 MB por página, 160 MB descompactados totais e 16 megapixels por imagem. Apenas páginas próximas são descompactadas; o ZIP fica em memória. Avatar/banner até 2 MB, validação de resolução no cliente. MP4/WebM até 500 MB no código; **o limite global do plano Supabase pode ser menor**, e prevalece sobre o bucket. Comece com vídeos pequenos.

Na consulta de 24/09/2026, Supabase Free informa 1 GB de Storage e quotas separadas de 5 GB de egress cacheado e 5 GB não cacheado. Não some como se fossem intercambiáveis. Confirme o painel antes do teste. [Preços](https://supabase.com/pricing), [egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

Estimativa: `tamanho em GB × reproduções completas + seeks/repetições + downloads de backup`. Um vídeo de 100 MB visto uma vez por cinco amigos nos sete dias pode consumir aproximadamente 3,5 GB (35 reproduções), sem contar overhead e cache. Um vídeo de 500 MB no mesmo uso pode consumir 17,5 GB. Não há medição de custo real nesta entrega. Mantenha limites/alertas de consumo e revise diariamente.

## 10. Antes de abrir ao público ou cobrar

Concluir homologação remota, testes em aparelhos reais, backup/restauração, monitoramento, validação server-side de imagens/antimalware, convites fortes, recuperação de conta, políticas de privacidade/retenção e moderação operacional. Formalizar direitos de distribuição por obra e território. Planejar transcodificação/CDN/DRM conforme necessidade, custos e suporte a legendas.

Planos comerciais e direitos futuros devem usar tabelas de planos/entitlements verificadas no banco e servidor, sem confiar em atributos do cliente. Hoje o acesso é exclusivamente `beta_access` + publicação da obra, com `rights_note`/tags como estrutura inicial. Não há integração de pagamento, assinatura ou autorização comercial implementada. XP confiável segue pendente e não é exibido.
