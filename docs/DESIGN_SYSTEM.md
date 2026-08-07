# Design system Avine

Este documento define a base visual compartilhada do sistema. Novas telas devem usar os tokens de `src/shared/styles/tokens.css` e, sempre que possível, os componentes de `src/shared/ui`.

## Princípios

- **Consistência antes de novidade:** a mesma função deve ter a mesma aparência em todas as áreas e perfis.
- **Superfícies neutras:** cards e filtros usam fundo branco; cores semânticas aparecem em indicadores, estados e ações, não como fundos decorativos concorrentes.
- **Hierarquia clara:** Roboto é a fonte única, com pesos 400, 500 e 700 e tamanhos vindos dos tokens.
- **Acessibilidade:** controles têm no mínimo 44 px, foco visível e não comunicam estado somente por cor.

## Padrões de componentes

| Elemento | Padrão |
| --- | --- |
| Página | Fundo `--color-background` e conteúdo em `--color-surface` |
| Card | Borda `--color-border`, raio `--radius-sm` ou `--radius-md` e sombra `--shadow-sm` |
| Campo/filtro | Altura `--control-height`, raio `--radius-sm`, rótulo de 12 px e foco `--focus-ring` |
| Botão primário | Verde `--color-brand-600`, texto branco e hover `--color-brand-700` |
| Botão secundário | Fundo branco, borda neutra e hover verde suave |
| Indicador de status | Card neutro com uma borda superior semântica; verde para concluído, âmbar para pendente e cinza para desconhecido |

## Uso de cores

O verde representa marca, seleção e sucesso. Âmbar representa atenção ou pendência; vermelho é reservado para erros e ações destrutivas. Cinzas formam texto, bordas e superfícies. Não devem ser criados novos tons locais quando um token semântico já atender ao caso.

## Espaçamento e responsividade

Use a escala `--space-1` a `--space-10`. Agrupamentos próximos usam 8–12 px; blocos usam 16–24 px; separações de seção usam 32–40 px. Em telas estreitas, controles devem empilhar sem reduzir a área mínima de toque.
