# public/models — ativos 3D (GLB) de terceiros

As cenas 3D (`src/components/three`) suportam **drop-in** de modelos GLB: se o ficheiro estiver
presente aqui com o nome abaixo, é carregado automaticamente; na sua ausência, a geometria
procedimental incluída no código mantém tudo funcional.

| Ficheiro esperado | Uso | Referência pedida pela equipa |
| --- | --- | --- |
| `trucks-fiction-logistics-company.glb` | Camiões nas cenas (centro 3D e hero) | [Sketchfab `4519a4f6`](https://sketchfab.com/3d-models/trucks-fiction-logistics-company-4519a4f623e14c3a995cb3bd010efce5) — Thcyrax (fan art de nurapixel) |
| `logistics-center.glb` | Exterior do armazém na vista «Arquitetura» | [Sketchfab `c527aad6`](https://sketchfab.com/3d-models/logistics-center-c527aad63fee47c7b0f32350779e719a) — mednik13 |

## ⚠️ Estado de licenciamento (verificado via API oficial em 2026-10-24)

- Ambos os modelos têm **`isDownloadable: false`** — o autor não ativou transferências.
- O campo `license` vem **vazio** — não há licença Creative Commons; aplica-se a licença standard do
  Sketchfab (todos os direitos reservados ao autor). O modelo de camiões é ainda *fan art* de outro
  artista (`nurapixel`).
- Por isso **não copiamos nem distribuímos** a geometria/texturas neste repositório.

## Como usar os modelos exatos, legitimamente

1. Falar com o autor no Sketchfab (mensagem ou comentário) e pedir a ativação do download **ou** uma
   licença escrita. Alternativa: modelos equivalentes com licença CC0/CC-BY.
2. Exportar/converter para **GLB** (Blender: *File → Export → glTF 2.0 (.glb)*, texturas embebidas).
3. Colocar o ficheiro nesta pasta com o nome exato da tabela. Sem passos extra — o `HEAD` check das
   cenas (`src/components/three/optional-model.tsx`) deteta-o e substitui o fallback procedimental.
4. Se o modelo for todo (não apenas um camião), ajustar `scale`/`rotation` no ponto de integração.
5. Publicar o crédito (ex.: «Modelo 3D: Thcyrax, via Sketchfab, com autorização») — CC-BY exige
   atribuição visível; a banda de créditos no rodapé do FacilityViewer é o local sugerido.

> Nunca extrair («rip») o modelo do viewer do Sketchfab: viola os termos da plataforma e os direitos
> dos autores.
