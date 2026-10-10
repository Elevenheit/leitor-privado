# Teste local e publicação

Para biblioteca temporária: `npm run demo:local`, aguarde `DEMO READY` e abra
<http://127.0.0.1:3100/__demo>. Os dados desaparecem ao encerrar.

Se a demo já estiver aberta, encerre-a com `Ctrl+C` no terminal original antes
de iniciá-la novamente para receber as alterações de código. Isso reinicia os
dados temporários da demonstração.

Se aparecer `EADDRINUSE` ou uma mensagem de porta ocupada, outra aplicação já está
usando uma das portas da demo (54321, 3100 ou 3102). Encerre a instância anterior
antes de tentar novamente. Cole somente `npm run demo:local` no terminal: as
linhas começando com `>` são a saída do npm, não comandos para executar.

Para usar Supabase real:

1. Prepare homologação e aplique [MIGRATIONS](MIGRATIONS.md).
2. Copie `.env.example` para `.env.local`; preencha URL e chave pública
   anon/publishable desse projeto. Chave service-role não pertence ao app.
3. Execute `npm ci` e `npm run dev`; abra <http://localhost:3000>.
4. Cadastre sem convite, confirme e-mail, recupere a senha e leia obra publicada.
5. Confira admin, suspensão, obra restrita, PDF/CBZ, marcadores, favoritos e retomada
   em duas contas/aparelhos. Desconecte após abrir o arquivo e reconecte para testar
   sincronização; biblioteca offline completa não foi implementada.

`npm run dev` usa o banco indicado, inclusive para uploads/exclusões; a demo é o
modo temporário. Execute os checks do README e a homologação de [E2E](E2E.md).

## Render

`render.yaml`: build `npm ci && npm run build`, início
`npm run start -- -p $PORT`, Node 24.21.0 e deploy automático desativado.
O nome histórico `nook-closed-beta` identifica o serviço e não controla acesso;
foi preservado para não mudar a identificação de um Blueprint existente.

Escolha serviço/branch/banco alvo, aplique migrações pendentes e configure Auth,
SMTP e origem HTTPS. Defina `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_ANON_KEY` antes do build. Publique manualmente a revisão
validada; alterações dessas variáveis exigem novo build. Fontes:
[variáveis do Render](https://render.com/docs/configure-environment-variables) e
[Node](https://render.com/docs/node-version).

Na origem publicada, repita cadastro, confirmação, recuperação/senha nova, login,
admin, leitura, retomada entre aparelhos e restrição de obra. Build local não
homologa esses serviços. Esta sessão não publicou nem modificou banco remoto.
Se precisar voltar o frontend, preserve dados; cadastro já aberto no banco não
volta ao beta automaticamente. Suspender novos cadastros exige configuração Auth explícita.
