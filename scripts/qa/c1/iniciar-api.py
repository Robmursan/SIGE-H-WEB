#!/usr/bin/env python3
"""PROPUESTA NO EJECUTADA: inyectar secreto externo a NestJS QA tras C2 autorizada."""
import os
from pathlib import Path
import stat
import sys


def main():
    if len(sys.argv) != 2:
        raise ValueError()
    repo = Path(__file__).resolve().parents[3]
    secret_file = Path(sys.argv[1])
    if not secret_file.is_absolute() or secret_file.is_symlink() or secret_file.parent.is_symlink():
        raise ValueError()
    resolved = secret_file.resolve(strict=True)
    if repo in resolved.parents:
        raise ValueError()
    parent_stat = resolved.parent.stat()
    if parent_stat.st_uid != os.getuid() or stat.S_IMODE(parent_stat.st_mode) != 0o700:
        raise ValueError()
    fd = os.open(resolved, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'r', encoding='ascii') as source:
        metadata = os.fstat(source.fileno())
        if metadata.st_uid != os.getuid() or not stat.S_ISREG(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o600:
            raise ValueError()
        password = source.read(1024)
    # Formato generado: 48 bytes de entropía codificados URL-safe, sin newline.
    if len(password) != 64 or any(c not in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-' for c in password):
        raise ValueError()
    env = os.environ.copy()
    env.pop('DATABASE_URL', None)
    env.update(DB_HOST='127.0.0.1', DB_PORT='55432', DB_NAME='sigeh_qa',
               DB_USER='sigeh_qa_app', DB_PASSWORD=password, DB_SCHEMA='sigeh')
    os.chdir(repo / 'apps/api')
    os.execvpe('node', ['node', 'dist/main.js'], env)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        sys.exit('Inicio QA rechazado; revisar archivo secreto, permisos y build sin imprimir contenido.')
