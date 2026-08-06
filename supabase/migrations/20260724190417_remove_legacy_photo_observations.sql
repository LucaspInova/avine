-- Fotos pertencem à coluna fotos; não devem aparecer como observação textual.
-- Remove apenas a linha automática criada pela versão antiga do formulário.
update public.fstd_produtos
set observacao = nullif(
  trim(regexp_replace(
    observacao,
    '(^|\n)[[:space:]]*Fotos selecionadas[[:space:]]*:[^\n]*(\n|$)',
    '\1',
    'gi'
  )),
  ''
)
where observacao ~* '(^|\n)[[:space:]]*Fotos selecionadas[[:space:]]*:';;
