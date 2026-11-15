#!/usr/bin/env python3
"""Propuesta C1: generación local sin imprimir secretos. No conecta a PostgreSQL."""
import os
from pathlib import Path
import secrets
import stat
import sys


def main():
    if len(sys.argv) != 2:
        raise ValueError('Indicar un directorio externo nuevo (ruta absoluta)')
    directory = Path(sys.argv[1])
    repo = Path(__file__).resolve().parents[3]
    if not directory.is_absolute() or directory.is_symlink():
        raise ValueError('Ruta externa absoluta requerida')
    directory = directory.resolve()
    if directory == repo or repo in directory.parents:
        raise ValueError('No guardar secretos en el repositorio')
    # Sin exist_ok: no reutilizar directorios, enlaces ni archivos previos.
    directory.mkdir(mode=0o700)
    os.chmod(directory, 0o700)
    secret_file = directory / 'app-password'
    fd = os.open(secret_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='ascii') as target:
        target.write(secrets.token_urlsafe(48))
    if stat.S_IMODE(directory.stat().st_mode) != 0o700 or stat.S_IMODE(secret_file.stat().st_mode) != 0o600:
        raise ValueError('Permisos inesperados')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Nunca imprimir excepciones con entradas/rutas ni contenido secreto.
        sys.exit('No se generó o no se verificó el secreto; revisar ruta y permisos localmente.')
