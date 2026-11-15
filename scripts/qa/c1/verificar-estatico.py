#!/usr/bin/env python3
"""Contrato local C1: no importa pg, no abre sockets ni ejecuta SQL."""
import ast
import hashlib
from pathlib import Path
import re

root = Path(__file__).resolve().parents[3]
folder = root / 'infra/qa/c1'
master = Path('/home/robreport/Documents/SIGE-H-sql-maestro/SIGE-H_BASE_DATOS_MAESTRA_V1.sql')
expected = '3fddd2ec9f13508bdc779a1f827b9d89a461e10755fba94e9550c54a48645088'
assert hashlib.sha256(master.read_bytes()).hexdigest() == expected, 'Maestro modificado'

def statements(name):
    source = (folder / name).read_text()
    return re.sub(r'--[^\n]*', '', source)

for name in ['01-auditoria.sql', '04-verificacion.sql']:
    sql = statements(name)
    # Consultas sencillas sin cuerpos/dynamic SQL: cada sentencia empieza por SELECT.
    assert all(re.match(r'^\s*SELECT\b', s, re.I) for s in sql.split(';') if s.strip()), name
    assert not re.search(r'\b(pg_read_file|pg_write_file|pg_terminate_backend|dblink|lo_import|nextval|setval|set_config)\s*\(', sql, re.I)

sql = statements('02-provision.propuesta.sql')
assert 'current_database()' in sql and "session_user <> 'sigeh_qa_bootstrap'" in sql
assert "auth_method='trust'" in sql and "RAISE EXCEPTION 'HBA" in sql
assert "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sigeh_qa_app')" in sql
assert 'PASSWORD NULL' in sql
assert re.findall(r'^GRANT (.+);$', sql, re.M) == [
    'CONNECT ON DATABASE sigeh_qa TO sigeh_qa_app',
    'USAGE ON SCHEMA sigeh TO sigeh_qa_app']
for word in ['NOSUPERUSER', 'NOCREATEDB', 'NOCREATEROLE', 'NOINHERIT', 'NOREPLICATION', 'NOBYPASSRLS']:
    assert word in sql
assert not re.search(r'^\s*(GRANT ALL|ALTER DEFAULT PRIVILEGES|CREATE[^;]*SECURITY DEFINER|DROP[^;]*CASCADE)\b', sql)
assert not statements('03-public.revision.sql').strip(), 'Plantilla PUBLIC dejó de ser inerte'
for file in folder.glob('*.sql'):
    content = file.read_text()
    assert not re.search(r"PASSWORD\s+'|postgres(?:ql)?://|DB_PASSWORD=", content, re.I), file
    assert 'sigeh_db' not in content, file
    assert content.count('$$') % 2 == 0 and content.count('$c1$') % 2 == 0, file
for script in (root / 'scripts/qa/c1').glob('*.py'):
    ast.parse(script.read_text())
print('C1: contrato estático, SELECT-only, grants exactos, guardas, ausencia de literales secretos y SHA-256: PASS')
print('Esto no valida sintaxis PostgreSQL ni demuestra permisos efectivos ni autenticación.')
