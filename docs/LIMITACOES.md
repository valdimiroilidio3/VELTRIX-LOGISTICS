# Limitações, riscos e trabalho pendente

Documento deliberadamente conservador: tudo o que não foi validado em ambiente real está aqui.

## 1. Ambiente em que foi construído

- Sem PostgreSQL nem credenciais Supabase no sandbox → desenvolvimento e testes sobre SQLite
  (`node:sqlite`). O driver PostgreSQL existe e as migrações estão escritas, mas **não foram aplicadas
  a uma base real**. Um job de CI sobe PostgreSQL 16 e aplica-as duas vezes.
- Sem acesso a APIs externas no ambiente → as integrações foram implementadas por adaptadores, com
  estados honestos. Nenhuma resposta externa foi simulada.
- Sem browser/Chromium → não houve testes de interação (cliques, drag, upload real de ficheiros) nem
  capturas de ecrã automatizadas. A verificação foi feita por HTTP (SSR), testes de domínio e revisão.

## 2. Funcionalidades parcialmente implementadas

| Item | O que existe | O que falta |
| --- | --- | --- |
| Portal do cliente | Dashboard scoped, lista de encomendas/faturas, rastreio | Pedido de nova encomenda pelo cliente, downloads de documentos em lote |
| Motorista | Tarefas, navegação por link, POD | Modo offline real (fila local + sincronização), captura de câmara testada em dispositivo |
| Rotas | Planeamento, capacidade, heurística, estimativa de distância | Otimização com restrições (janelas horárias, múltiplos veículos), trânsito real |
| Armazém | Zonas, ocupação manual, movimentos, 3D esquemático | Leituras RFID/código de barras, endereçamento por posição, picking por onda |
| Faturação | Emissão interna, IVA, pagamentos manuais, estados | Certificação fiscal (Portaria 363/2010), SAF-T, séries por estabelecimento |
| Notificações | Outbox, backoff, templates, cron | SMS/WhatsApp com fornecedor, preferências por cliente, modelos aprovados |
| Relatórios | Métricas com definição + séries diárias | Exportações XLSX, agendamento de relatórios, comparação de períodos |
| 3D | Cena R3F com zonas derivadas da BD, filtros, seleção, sombras e animações decorativas; hero de landing com animação de marca (sem dados) | Plantas importáveis (IFC/CAD), colisão, localização em tempo real |
| Mapas | Componente MapLibre + fallback SVG | Estilo/tiles contratados, geocoding, clustering de paragens |
| RLS | Políticas escritas e forçadas | Aplicação a uma instância Supabase e testes com JWT reais |
| Cron de faturas vencidas | Estado `overdue` derivado na leitura | Job diário que notifica e audita a transição |

## 3. Riscos técnicos

1. **Rate limiting em memória** — por instância. Com várias instâncias, o limite efetivo multiplica-se.
   Migrar para Redis/Upstash antes de escalar.
2. **Sessões em BD com SQLite** — concorrência limitada; adequado a dev/demonstração, não a produção.
3. **Storage local** — no Vercel o sistema de ficheiros é efémero; produção deve usar Supabase Storage
   (variáveis já previstas) ou volume persistente.
4. **Sem CSP completa** — cabeçalhos parciais. Uma CSP com nonces exige auditar scripts inline do Next.
5. **Sem 2FA** para `admin`/`super_admin` — recomendado antes de uso real.
6. **Assinatura simples no POD** — não é assinatura eletrónica qualificada (eIDAS).
7. **Faturação interna** — não cumpre requisitos fiscais portugueses. A UI avisa em `/app/invoices`.
8. **Dados demo na mesma base** — o campo `data_mode` e o aviso na UI reduzem o risco de confusão, mas
   a limpeza em produção é uma tarefa manual auditada.
9. **Heurística de rotas** — vizinho mais próximo com peso de prioridade; não é ótimo global e não
   respeita janelas horárias.
10. **Preços provisórios** — os valores semeados não são a política comercial; estão editáveis em
    `/app/settings` com auditoria.

## 4. Conformidade e negócio (decisões que não são técnicas)

- Cobertura geográfica, certificações, parcerias, SLAs e preços **não foram inventados**: a UI usa
  linguagem condicional («mediante validação») e os valores são configuráveis.
- Operação em Moçambique ou outros mercados exige validação aduaneira, legal e operacional.
- RGPD: base legal, prazos de conservação e encarregado de proteção de dados devem ser definidos pela
  empresa; a aplicação implementa minimização e controlo de acessos, não substitui essa decisão.

## 5. Próximos passos sugeridos (ordem)

1. Provisionar Supabase, aplicar migrações e correr o smoke contra PostgreSQL real.
2. Configurar Resend + domínio verificado e ativar a fila de notificações.
3. Migrar storage para Supabase Storage com políticas privadas.
4. Contratar/auto-alojar motor de rotas e tiles; remover avisos de estimativa.
5. Redis para rate limiting + sessões, e 2FA para administradores.
6. Certificação fiscal (software certificado, SAF-T) antes de emitir faturas reais.
7. Testes E2E de browser (Playwright) e de acessibilidade (axe), com pipeline dedicado.
