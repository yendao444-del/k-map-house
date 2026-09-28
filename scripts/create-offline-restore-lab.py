"""Build a read-only recovery lab from a DBY HOME logical backup.

The lab never contacts Supabase. It stores each row as JSON in SQLite so the
backup can be inspected without changing the running application.
"""

import argparse
import hashlib
import json
import ntpath
import os
import re
import sqlite3
import sys
import zipfile
from pathlib import Path, PurePosixPath


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_destination(root: Path, name: str) -> Path:
    path = PurePosixPath(name)
    if path.is_absolute() or not path.parts or any(part in ("", ".", "..") for part in path.parts):
        raise ValueError(f"Unsafe archive path: {name}")
    target = root.joinpath(*path.parts)
    if not target.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"Archive path escapes lab: {name}")
    return target


def verified_entry(archive: zipfile.ZipFile, name: str, size: int, digest: str) -> bytes:
    data = archive.read(name)
    if len(data) != size or sha256(data) != digest:
        raise ValueError(f"Checksum mismatch: {name}")
    return data


def build_lab(source: Path, destination: Path) -> dict:
    if not source.is_file():
        raise ValueError(f"Backup ZIP not found: {source}")
    if not destination.is_dir() or any(destination.iterdir()):
        raise ValueError("Lab destination must be an existing empty directory")

    archive_hash = sha256(source.read_bytes())
    checksum_path = source.with_suffix(".sha256")
    if not checksum_path.is_file():
        raise ValueError(f"Missing checksum file: {checksum_path}")
    checksum_parts = checksum_path.read_text(encoding="utf-8").strip().split(maxsplit=1)
    if len(checksum_parts) != 2 or checksum_parts != [archive_hash, source.name]:
        raise ValueError("Backup ZIP checksum does not match its sidecar file")

    with zipfile.ZipFile(source) as archive:
        bad_member = archive.testzip()
        if bad_member:
            raise ValueError(f"ZIP CRC failed: {bad_member}")
        metadata = json.loads(archive.read("metadata.json"))
        if metadata.get("format") != "dby-home-logical-backup":
            raise ValueError("Unsupported backup format")

        connection = sqlite3.connect(destination / "restored-data.sqlite")
        try:
            connection.execute("PRAGMA journal_mode=DELETE")
            connection.execute("CREATE TABLE backup_info (name TEXT PRIMARY KEY, value TEXT NOT NULL)")
            for name, value in (
                ("source_file", str(source)),
                ("source_sha256", archive_hash),
                ("created_at", metadata["createdAt"]),
                ("source_project", metadata["sourceProject"]),
            ):
                connection.execute("INSERT INTO backup_info VALUES (?, ?)", (name, value))

            counts = {}
            redacted_tokens = 0
            for table, expected_count in metadata["tables"].items():
                if not re.fullmatch(r"[a-z_]+", table):
                    raise ValueError(f"Unsafe table name: {table}")
                rows = json.loads(archive.read(f"database/{table}.json"))
                if not isinstance(rows, list) or len(rows) != expected_count:
                    raise ValueError(f"Row count mismatch: {table}")
                connection.execute(
                    f'CREATE TABLE "{table}" (row_no INTEGER PRIMARY KEY, record_key TEXT, payload TEXT NOT NULL)'
                )
                for row_number, row in enumerate(rows, 1):
                    if not isinstance(row, dict):
                        raise ValueError(f"Invalid row in {table}")
                    if table == "app_settings" and row.get("sepay_api_token"):
                        row = dict(row)
                        row["sepay_api_token"] = None
                        redacted_tokens += 1
                    key = row.get("id", row.get("key"))
                    connection.execute(
                        f'INSERT INTO "{table}" VALUES (?, ?, ?)',
                        (row_number, str(key) if key is not None else None, json.dumps(row, ensure_ascii=False)),
                    )
                connection.execute(f'CREATE INDEX "idx_{table}_key" ON "{table}" (record_key)')
                counts[table] = len(rows)
            connection.commit()
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise ValueError(f"SQLite integrity check failed: {integrity}")
            foreign_key_checks = {}
            for child, parent, field in (
                ("contracts", "rooms", "room_id"),
                ("invoices", "rooms", "room_id"),
                ("payment_events", "invoices", "invoice_id"),
                ("asset_snapshots", "rooms", "room_id"),
                ("room_assets", "rooms", "room_id"),
            ):
                if child in counts and parent in counts:
                    query = (
                        f'SELECT count(*) FROM "{child}" c WHERE '
                        f'json_extract(c.payload, "$.{field}") IS NOT NULL AND '
                        f'NOT EXISTS (SELECT 1 FROM "{parent}" p WHERE p.record_key = '
                        f'json_extract(c.payload, "$.{field}"))'
                    )
                    foreign_key_checks[f"{child}.{field}->{parent}"] = connection.execute(query).fetchone()[0]
        finally:
            connection.close()

        for item in metadata.get("storage", {}).get("files", []):
            path = f'storage/{metadata["storage"]["bucket"]}/{item["path"]}'
            target = safe_destination(destination, path)
            data = verified_entry(archive, path, item["bytes"], item["sha256"])
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)

        app_data = os.environ.get("APPDATA")
        for item in metadata.get("localState", []):
            if not app_data:
                raise ValueError("APPDATA is needed to map local-state files")
            relative = ntpath.relpath(item["path"], app_data).replace("\\", "/")
            if relative.startswith("../") or relative == "..":
                raise ValueError("Local-state path is outside APPDATA")
            path = f"local-state/{relative}"
            target = safe_destination(destination, path)
            data = verified_entry(archive, path, item["bytes"], item["sha256"])
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)

    report = {
        "lab_type": "offline_sqlite_recovery_test",
        "source_file": str(source),
        "source_sha256": archive_hash,
        "backup_created_at": metadata["createdAt"],
        "tables": counts,
        "total_rows": sum(counts.values()),
        "storage_files": len(metadata.get("storage", {}).get("files", [])),
        "local_files": len(metadata.get("localState", [])),
        "skipped_tables": list(metadata.get("skippedTables", {})),
        "sepay_tokens_redacted": redacted_tokens,
        "sqlite_integrity": "ok",
        "missing_parent_references": foreign_key_checks,
        "limitations": "Offline SQLite inspection only; not a Supabase/Auth/schema restore",
    }
    (destination / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (destination / "README.txt").write_text(
        "OFFLINE RESTORE LAB\n"
        "This directory was created from a backup ZIP without contacting Supabase.\n"
        "restored-data.sqlite contains one table per exported table. Each row has record_key and JSON payload.\n"
        "Storage and local-state files are under their own subdirectories.\n"
        "The SePay API token was removed from the SQLite copy.\n"
        "This is not a runnable Supabase project and does not restore Auth, schema, RLS, or app config.\n"
        "Do not point the production app at this directory or upload it to a public location.\n",
        encoding="ascii",
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Build an isolated offline DBY HOME restore lab")
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--dest", required=True, type=Path)
    args = parser.parse_args()
    try:
        report = build_lab(args.source.resolve(), args.dest.resolve())
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, sqlite3.Error) as error:
        print(f"RESTORE LAB FAILED: {error}", file=sys.stderr)
        return 1
    print("OFFLINE RESTORE LAB CREATED")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
