import json
import os
from datetime import date
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ANALYSIS = r"C:\Users\luizr\.codex\visualizations\2026\08\05\019fd1a6-52e1-7481-a63e-9d4ee3971ade\xlsx-analysis\analysis.json"
OUTPUT = os.path.join(REPO, "output", "pdf", "relatorio_cadastro_usuarios_20260805.pdf")

FONT = r"C:\Windows\Fonts\segoeui.ttf"
FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
if os.path.exists(FONT):
    pdfmetrics.registerFont(TTFont("SegoeUI", FONT))
    pdfmetrics.registerFont(TTFont("SegoeUI-Bold", FONT_BOLD))
    BODY_FONT = "SegoeUI"
    BOLD_FONT = "SegoeUI-Bold"
else:
    BODY_FONT = "Helvetica"
    BOLD_FONT = "Helvetica-Bold"


with open(ANALYSIS, "r", encoding="utf-8") as stream:
    report = json.load(stream)

users = report["users"]
ce_users = report["addedToCeBecauseRegionalNull"]
duplicates = report["duplicateEmailsSkipped"]
pending = report["incompleteOrUnmapped"]
kept_by_email = {user["email"]: user for user in users}

os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="ReportTitle", parent=styles["Title"], fontName=BOLD_FONT,
    fontSize=20, leading=24, textColor=colors.HexColor("#146b32"), alignment=TA_CENTER,
    spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="Subtitle", parent=styles["Normal"], fontName=BODY_FONT,
    fontSize=9, leading=13, textColor=colors.HexColor("#5c6b62"), alignment=TA_CENTER,
    spaceAfter=14,
))
styles.add(ParagraphStyle(
    name="Section", parent=styles["Heading2"], fontName=BOLD_FONT,
    fontSize=12, leading=15, textColor=colors.HexColor("#146b32"), spaceBefore=10, spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="Body", parent=styles["BodyText"], fontName=BODY_FONT,
    fontSize=8.5, leading=12, textColor=colors.HexColor("#26352b"), spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="Small", parent=styles["BodyText"], fontName=BODY_FONT,
    fontSize=7, leading=9, textColor=colors.HexColor("#26352b"),
))
styles.add(ParagraphStyle(
    name="SmallBold", parent=styles["BodyText"], fontName=BOLD_FONT,
    fontSize=7, leading=9, textColor=colors.HexColor("#26352b"),
))


def p(value, style="Small"):
    return Paragraph(escape(str(value if value is not None else "")), styles[style])


def bullet(text):
    return Paragraph(f"- {escape(text)}", styles["Body"])


def styled_table(data, widths, header=True, font_size=7):
    table = Table(data, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d6ded8")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if header:
        commands.extend([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#146b32")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), BOLD_FONT),
        ])
        start = 1
    else:
        start = 0
    for row in range(start, len(data)):
        if (row - start) % 2 == 1:
            commands.append(("BACKGROUND", (0, row), (-1, row), colors.HexColor("#f4f8f4")))
    table.setStyle(TableStyle(commands))
    return table


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont(BODY_FONT, 7)
    canvas.setFillColor(colors.HexColor("#66756a"))
    canvas.drawString(15 * mm, 9 * mm, "Avine - relatório de preparação do cadastro")
    canvas.drawRightString(282 * mm, 9 * mm, f"Página {doc.page}")
    canvas.restoreState()


story = [
    Spacer(1, 12 * mm),
    Paragraph("Relatório de preparação do cadastro de usuários", styles["ReportTitle"]),
    Paragraph(
        f"Fonte: dados gerencial.xlsx / Planilha1 - emitido em {date.today().strftime('%d/%m/%Y')}",
        styles["Subtitle"],
    ),
    Paragraph("Status do cadastro", styles["Section"]),
    Paragraph(
        "Os dados foram classificados, deduplicados e preparados para criação. As contas Auth ainda não foram criadas nesta execução porque não havia uma sessão administrativa autenticada disponível para executar o fluxo seguro de cadastro.",
        styles["Body"],
    ),
    styled_table([
        [p("Indicador", "SmallBold"), p("Resultado", "SmallBold")],
        [p("Linhas da planilha"), p(report["rawRows"])],
        [p("Linhas elegíveis antes da deduplicação"), p(report["eligibleBeforeDeduplication"])],
        [p("Usuários preparados para criação"), p(report["toCreate"])],
        [p("Usuários enviados para CE por Regional nulo"), p(len(ce_users))],
        [p("E-mails duplicados desconsiderados"), p(len(duplicates))],
        [p("Linhas pendentes por função/nome/e-mail"), p(len(pending))],
    ], [105 * mm, 35 * mm]),
    Paragraph("Regras aplicadas", styles["Section"]),
    bullet("Admin foi preparado com perfil público Gerencial e role Auth admin."),
    bullet("Logística e Comercial foram preparados com perfil público Gerencial e role Auth gerencial."),
    bullet("Regional vazio foi convertido para UF CE; a relação completa está na seção específica."),
    bullet("Senha: primeiro nome + role + 1!. Quando o mesmo primeiro nome aparece com a mesma role, o sobrenome ou identificador disponível foi acrescentado."),
    bullet("O sufixo 1! foi mantido porque a política atual de autenticação exige maiúscula, minúscula, número e símbolo."),
    Paragraph("Alteração da role Entregador", styles["Section"]),
    Paragraph(
        "A migração removeu Entregador do conjunto válido do banco e converteu os dois usuários existentes para Promotor. O cadastro ativo do projeto agora aceita Promotor, Gerencial e Supervisor; a interface também não oferece mais Entregador.",
        styles["Body"],
    ),
    styled_table([
        [p("Situação após a migração", "SmallBold"), p("Quantidade", "SmallBold")],
        [p("Gerencial"), p("4")],
        [p("Promotor"), p("248")],
        [p("Entregador"), p("0")],
    ], [105 * mm, 35 * mm]),
    PageBreak(),
    Paragraph("Usuários preparados - Nome e senha", styles["Section"]),
    Paragraph("As senhas abaixo são as credenciais planejadas para o cadastro. Elas devem ser entregues por canal seguro e alteradas pelo usuário no primeiro acesso, quando aplicável.", styles["Body"]),
]

user_rows = [[p("#", "SmallBold"), p("Nome do usuário", "SmallBold"), p("E-mail", "SmallBold"), p("UF", "SmallBold"), p("Role", "SmallBold"), p("Senha do usuário", "SmallBold")]]
for index, user in enumerate(users, 1):
    user_rows.append([p(index), p(user["nome"]), p(user["email"]), p(user["estado"]), p(user["authRole"]), p(user["password"])])
story.append(styled_table(user_rows, [9 * mm, 42 * mm, 77 * mm, 12 * mm, 20 * mm, 42 * mm]))

story.extend([
    PageBreak(),
    Paragraph("Usuários adicionados ao CE por Regional nulo", styles["Section"]),
    Paragraph("Estas pessoas tinham o campo Regional vazio na planilha e receberam UF CE conforme solicitado.", styles["Body"]),
])
ce_rows = [[p("Linha", "SmallBold"), p("Nome", "SmallBold"), p("E-mail", "SmallBold"), p("Função", "SmallBold")]]
for user in ce_users:
    ce_rows.append([p(user["sourceRow"]), p(user["nome"]), p(user["email"]), p(user["funcao"])])
story.append(styled_table(ce_rows, [13 * mm, 48 * mm, 92 * mm, 42 * mm]))

story.extend([
    PageBreak(),
    Paragraph("Duplicidades e linhas pendentes", styles["Section"]),
    Paragraph("E-mails duplicados foram mantidos uma única vez. Quando havia duas regiões, foi mantida a linha com região preenchida.", styles["Body"]),
])
duplicate_rows = [[p("Linha descartada", "SmallBold"), p("E-mail", "SmallBold"), p("Linha mantida", "SmallBold")]]
for duplicate in duplicates:
    kept = kept_by_email.get(duplicate["email"], {})
    duplicate_rows.append([p(duplicate["sourceRow"]), p(duplicate["email"]), p(kept.get("sourceRow", "-") )])
story.append(styled_table(duplicate_rows, [32 * mm, 110 * mm, 32 * mm]))
story.append(Spacer(1, 5 * mm))
story.append(Paragraph("Linhas não cadastradas", styles["Section"]))
pending_rows = [[p("Linha", "SmallBold"), p("Nome", "SmallBold"), p("E-mail", "SmallBold"), p("Função", "SmallBold"), p("Motivo", "SmallBold")]]
for item in pending:
    reasons = []
    if not item.get("role"):
        reasons.append("função não mapeada")
    if not item.get("nome"):
        reasons.append("nome vazio")
    if not item.get("email") or "@" not in item.get("email", ""):
        reasons.append("e-mail inválido")
    pending_rows.append([p(item["sourceRow"]), p(item.get("nome") or "-"), p(item.get("email") or "-"), p(item.get("funcao") or "-") , p(", ".join(reasons))])
story.append(styled_table(pending_rows, [13 * mm, 48 * mm, 86 * mm, 35 * mm, 48 * mm]))

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=landscape(A4),
    rightMargin=15 * mm,
    leftMargin=15 * mm,
    topMargin=13 * mm,
    bottomMargin=15 * mm,
    title="Relatório de preparação do cadastro de usuários",
    author="Codex",
)
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
