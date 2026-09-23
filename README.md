# Nook — biblioteca privada de light novels

Biblioteca privada de PDFs com Next.js 16, React 19, TypeScript e Supabase. Organize os arquivos em obras, volumes e capítulos; leia em texto contínuo ou em páginas PDF carregadas conforme a rolagem. O progresso é salvo na nuvem.

## Recursos

- Login privado do Supabase Auth. O acesso continua sujeito às policies RLS e ao proprietário configurado em `is_private_owner()`.
- Upload retomável TUS para o bucket privado `novels`. Os PDFs existentes continuam nos paths originais e continuam disponíveis.
- Organização opcional por obra e volume. PDFs antigos sem relações aparecem em **Sem coleção** até serem organizados.
- Progresso por PDF preservado em `reading_progress`.
- Texto contínuo com extração progressiva; modo PDF contínuo com renderização sob demanda, sem criar centenas de canvas simultaneamente.
- Preferências de fonte, entrelinha, largura e tema guardadas no navegador.
- Capas privadas opcionais para obras no bucket `covers`.

## Configuração local

1. Configure o projeto Supabase e a conta privada em Authentication. Para continuar com o modelo atual, mantenha `is_private_owner()` restrita ao UUID do proprietário.
2. Para uma instalação nova, execute [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor.
3. Para uma instalação existente, faça backup e execute [`supabase/migrations/002_library_structure.sql`](supabase/migrations/002_library_structure.sql). Consulte [`MIGRATION_GUIDE.md`](MIGRATION_GUIDE.md) e [`UPGRADE_GUIDE.md`](UPGRADE_GUIDE.md).
4. Defina somente a URL e a chave publicável do Supabase em `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICAVEL
   ```

5. Instale e inicie:

   ```bash
   npm ci
   npm run dev
   ```

Nunca use a `service_role` no frontend ou no Render. Os buckets `novels` e `covers` são privados; o SQL configura acesso autenticado restrito ao proprietário. Os limites de tamanho do Supabase Storage devem permitir o tamanho dos PDFs enviados.

## Verificação

```bash
npm run typecheck
npm run lint
npm run build
```

Para publicar, conecte o repositório ao Blueprint já descrito em [`render.yaml`](render.yaml), configure as duas variáveis publicáveis no Render e faça o deploy manual da branch revisada. Consulte [`UPGRADE_GUIDE.md`](UPGRADE_GUIDE.md) para o roteiro completo.
