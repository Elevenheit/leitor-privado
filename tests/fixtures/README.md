# Mídia original de teste

`nook-original.cbz` e `nook-original.webm` são gerados por `tests/browser.mjs` com canvas (texto “nook. mídia original” e formas/cores simples). Não contêm obras de terceiros. Autorizados para uso e distribuição como fixtures deste projeto, sob CC0-1.0.

O vídeo curto é intencional: valida reprodução e limite de duração. Destinos reais de 90/110 segundos precisam também de vídeo original longo na homologação. Estes arquivos não são carregados automaticamente no catálogo ou em produção.

`nook-long.webm` foi produzido repetindo o vídeo original com FFmpeg (stream copy) até 120 segundos. O teste de navegador verifica buscas reais em 90 e 110 segundos; o fluxo autenticado ainda exige homologação. `nook-frame.png` é a imagem original usada no CBZ.
