"""Executa a sincronização de devoluções da Avine para um intervalo de datas."""

from __future__ import annotations

import json
import os
import sys
from datetime import date, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_FUNCTION_URL = (
    "https://<PROJECT_REF>.supabase.co/functions/v1/"
    "sync-devolucoes-avine"
)
REQUEST_TIMEOUT_SECONDS = 300
ENV_FILE = ".env"


def load_env_file() -> None:
    """Carrega pares simples KEY=VALUE sem sobrescrever o ambiente atual."""
    if not os.path.isfile(ENV_FILE):
        return

    with open(ENV_FILE, encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def read_date(prompt: str) -> date:
    while True:
        value = input(prompt).strip()
        try:
            return date.fromisoformat(value)
        except ValueError:
            print("Data inválida. Use o formato YYYY-MM-DD.")


def get_function_url() -> str:
    url = os.getenv("SUPABASE_SYNC_DEVOLUCOES_URL", DEFAULT_FUNCTION_URL).strip()
    if "<PROJECT_REF>" in url:
        raise ValueError(
            "Configure SUPABASE_SYNC_DEVOLUCOES_URL no arquivo .env."
        )

    return url.rstrip("/")


def get_cron_secret() -> str:
    secret = os.getenv("CRON_SECRET", "")
    if not secret:
        raise ValueError("Configure CRON_SECRET no arquivo .env.")

    return secret


def print_response_body(body: str) -> None:
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        print(body)
        return

    print(json.dumps(parsed, ensure_ascii=False, indent=2))


def execute_for_date(function_url: str, cron_secret: str, target_date: date) -> bool:
    date_value = target_date.isoformat()
    request_url = f"{function_url}?due_date={date_value}"
    request = Request(
        request_url,
        method="POST",
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "x-cron-secret": cron_secret,
        },
        data=b"{}",
    )

    print(f"\n===== {date_value} =====")
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8", errors="replace")
            print(f"HTTP {response.status}")
            print_response_body(body)
            return 200 <= response.status < 300
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        print(f"HTTP {error.code}")
        print_response_body(body)
        return False
    except (TimeoutError, URLError, OSError) as error:
        print(f"Erro de comunicação: {error}")
        return False


def main() -> int:
    load_env_file()
    print("Sincronização de devoluções Avine")
    print("As datas são inclusivas e devem estar no formato YYYY-MM-DD.\n")

    try:
        start_date = read_date("Data inicial: ")
        end_date = read_date("Data final: ")

        if start_date > end_date:
            raise ValueError("A data inicial não pode ser posterior à data final.")

        function_url = get_function_url()
        cron_secret = get_cron_secret()
    except (EOFError, KeyboardInterrupt):
        print("\nOperação cancelada.")
        return 130
    except ValueError as error:
        print(f"Erro: {error}")
        return 2

    total = (end_date - start_date).days + 1
    print(f"\nSerão executadas {total} chamadas sequenciais.")

    current_date = start_date
    failures: list[str] = []
    completed = 0

    while current_date <= end_date:
        if not execute_for_date(function_url, cron_secret, current_date):
            failures.append(current_date.isoformat())
        else:
            completed += 1
        current_date += timedelta(days=1)

    print("\n===== RESUMO =====")
    print(f"Sucesso: {completed}/{total}")
    print(f"Falhas: {len(failures)}")
    if failures:
        print("Datas com falha: " + ", ".join(failures))
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
