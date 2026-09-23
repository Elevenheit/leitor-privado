# Atualização do Nook

## 1. Backup recomendado

No Supabase, confirme um backup recente em Database > Backups. Exporte também `books` e `reading_progress` se precisar de uma cópia independente. Guarde a branch atual e o commit anterior; a atualização não altera os arquivos PDF já guardados.

## 2. SQL no Supabase

Para a instalação existente, execute uma vez `supabase/migrations/002_library_structure.sql` no SQL Editor. Confira as tabelas, colunas, RLS e buckets usando os comandos de [`MIGRATION_GUIDE.md`](MIGRATION_GUIDE.md). O SQL prepara `series`, `volumes`, os metadados opcionais em `books` e um bucket privado `covers`. Não execute `schema.sql` sobre o projeto de produção existente.

## 3. Storage

O bucket atual `novels` continua privado, com PDFs nos paths que já existem. Não mova nem reenvie os PDFs antigos. A migration cria `covers`, privado, aceitando JPEG, PNG e WebP, com policies limitadas à pasta do usuário. A chave `service_role` não é necessária. Confirme no painel que os dois buckets estão privados e que os limites de upload atendem aos seus arquivos.

## 4. Teste local

Use a branch de desenvolvimento e `.env.local` já configurado localmente; esse arquivo não deve ser compartilhado ou commitado. Instale dependências e rode:

```bash
npm ci
npm run dev
```

Faça login com a conta privada existente. Teste primeiro a home e um PDF já cadastrado; depois crie obra e volume, envie um arquivo pequeno e confira o modo Texto contínuo, PDF contínuo e o retorno ao ponto salvo.

## 5. Teste com um único PDF

1. Crie uma obra e um volume na biblioteca.
2. Envie um PDF pequeno como Capítulo, com número e título.
3. Abra a obra, confira o capítulo e leia algumas telas no modo Texto contínuo.
4. Feche e reabra o leitor; confirme que o ponto é aproximado.
5. Troque para PDF contínuo e confira que imagens e páginas renderizam ao rolar.
6. Repita com um PDF antigo ainda em “Sem coleção” para confirmar compatibilidade.
7. Não use um PDF importante como teste de exclusão; as confirmações de exclusão de PDF removem também o objeto privado.

## 6. Git

O trabalho foi preparado na branch `feature/library-series-reader`. Após revisão, publique-a e abra um pull request. Exemplo:

```bash
git status
git add README.md MIGRATION_GUIDE.md UPGRADE_GUIDE.md src supabase
git commit -m "Add private series library and continuous reader"
git push -u origin feature/library-series-reader
```

Não faça merge em `main` até aprovar o diff e confirmar que o SQL está pronto para ser aplicado.

## 7. Render

O `render.yaml` continua sendo o Blueprint do app Node. No Render, confirme `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` como variáveis de ambiente; não adicione `service_role`. Faça deploy da branch revisada apenas depois da migration ser executada e validada. `NEXT_PUBLIC_*` é incorporada durante o build, então alterações nelas requerem um novo build. Esta branch não dispara deploy.

## 8. Voltar à versão anterior

Se houver falha depois de publicar, use Render > Deploys para promover o deploy anterior. Também é possível reverter o commit em uma nova branch e publicar esse rollback. A versão antiga ignora as tabelas/colunas novas; portanto a primeira ação é reverter o app e manter a migration aplicada. Se decidir remover a estrutura no banco, faça backup e siga o SQL opcional de reversão em [`MIGRATION_GUIDE.md`](MIGRATION_GUIDE.md). PDFs e progresso permanecem preservados nesse rollback.
