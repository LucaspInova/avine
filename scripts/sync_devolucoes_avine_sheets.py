"""Executa a sincronização de devoluções via Google Sheets."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


FUNCTION_NAME = "sync-devolucoes-avine-sheets"
REQUEST_TIMEOUT_SECONDS = 300
MAX_DAYS_PER_CALL = 31
ENV_FILE = ".env"


def load_env_file() -> None:
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
    project_id = os.getenv("SUPABASE_PROJECT_ID", "").strip()
    if not project_id:
        raise ValueError("Configure SUPABASE_PROJECT_ID no arquivo .env.")
    return f"https://{project_id}.supabase.co/functions/v1/{FUNCTION_NAME}"


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


def execute_for_range(
    function_url: str, cron_secret: str, start_date: date, end_date: date
) -> bool:
    request_url = (
        f"{function_url}?start_date={start_date.isoformat()}"
        f"&end_date={end_date.isoformat()}"
    )
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
    label = f"{start_date.isoformat()} a {end_date.isoformat()}"
    print(f"\n===== {label} =====")
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sincroniza devoluções do Google Sheets por intervalo."
    )
    parser.add_argument("start_date", nargs="?", help="Data inicial YYYY-MM-DD")
    parser.add_argument("end_date", nargs="?", help="Data final YYYY-MM-DD")
    return parser.parse_args()


def main() -> int:
    load_env_file()
    args = parse_args()
    print("Sincronização de devoluções Avine via Google Sheets")
    print("As datas são inclusivas e devem estar no formato YYYY-MM-DD.\n")

    try:
        start_date = (
            date.fromisoformat(args.start_date)
            if args.start_date else read_date("Data inicial: ")
        )
        end_date = (
            date.fromisoformat(args.end_date)
            if args.end_date else read_date("Data final: ")
        )
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

    total_days = (end_date - start_date).days + 1
    total_calls = (total_days + MAX_DAYS_PER_CALL - 1) // MAX_DAYS_PER_CALL
    print(f"\nSerão executadas {total_calls} chamadas sequenciais.")

    current = start_date
    failures: list[str] = []
    completed = 0
    while current <= end_date:
        chunk_end = min(current + timedelta(days=MAX_DAYS_PER_CALL - 1), end_date)
        if execute_for_range(function_url, cron_secret, current, chunk_end):
            completed += 1
        else:
            failures.append(f"{current.isoformat()} a {chunk_end.isoformat()}")
        current = chunk_end + timedelta(days=1)

    print("\n===== RESUMO =====")
    print(f"Sucesso: {completed}/{total_calls}")
    print(f"Falhas: {len(failures)}")
    if failures:
        print("Intervalos com falha: " + "; ".join(failures))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
