#!/usr/bin/env python3
"""Contrato estático D1. No conecta, aplica SQL ni pretende validar el parser PG."""
from pathlib import Path
import hashlib
import re

root=Path(__file__).resolve().parents[2]
folder=root/'infra/sql/migrations'
def uncomment(path):
    return re.sub(r'--[^\n]*','',path.read_text())
owner=uncomment(folder/'V2__iam_local.sql')
expected={'usuario_credenciales','sesiones_usuario','refresh_tokens_sesion','iam_limites_acceso',
          'auditoria_seguridad','usuario_roles_contexto','encargo_permisos'}
assert set(re.findall(r'CREATE TABLE sigeh\.([a-z_]+)',owner))==expected
assert not re.search(r'\b(ALTER TABLE|DROP|DELETE|GRANT)\b',owner,re.I)
assert "current_database()<>'sigeh_qa'" in owner and "<>51" in owner and '<>261' in owner
assert 'DEFERRABLE INITIALLY DEFERRED' in owner and 'uq_refresh_activo_por_sesion' in owner
permissions=uncomment(folder/'V2__iam_local.permisos-qa.sql')
assert 'has_any_column_privilege' in permissions
for grant in re.findall(r'GRANT\s+(.+?);',permissions,re.S|re.I):
    assert 'sigeh.' in grant and grant.strip().endswith('TO sigeh_qa_app')
    assert not re.search(r'\b(ALL|DELETE|TRUNCATE|TRIGGER|REFERENCES|MAINTAIN|EXECUTE|CREATE)\b',grant,re.I)
assert not re.search(r'GRANT\s+SELECT.*?ON\s+sigeh\.auditoria_seguridad',permissions,re.I)
rollback=uncomment(folder/'V2__iam_local.rollback.sql')
assert 'iam_rollback_reviewed' in rollback and 'pg_stat_activity' in rollback
assert not re.search(r'\b(DROP|DELETE|CASCADE)\b',rollback,re.I)
verify=uncomment(folder/'V2__iam_local.verificacion.sql')
def validate_verifier(text):
    """Regresión 42809 y contrato de solo lectura, sin ejecutar archivos SQL."""
    assert not re.search(r'\\(?:i|ir|include|gexec)\b',text,re.I)
    assert all(re.match(r'^\s*SELECT\b',s,re.I) for s in text.split(';') if s.strip())
    assert not re.search(r'\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE|INTO|CALL|DO)\b',
                         re.sub(r"'(?:''|[^'])*'", "''", text),re.I)
    assert not re.search(r'\b(pg_read_file|pg_write_file|pg_reload_conf|set_config|dblink_exec)\s*\(',text,re.I)
    calls=list(re.finditer(r'has_sequence_privilege\s*\(',text,re.I))
    assert len(calls)==1
    assert re.search(r"CASE\s+WHEN\s+c\.relkind='S'\s+THEN\s+$",text[:calls[0].start()],re.I)
    assert re.match(r"has_sequence_privilege\('sigeh_qa_app',c\.oid,'USAGE,SELECT,UPDATE'\)\s+ELSE false END",text[calls[0].start():],re.I)
    counts=set(re.findall(r'count\(\*\)\s+(?:AS filas\s+)?FROM sigeh\.([a-z_]+)',text,re.I))
    assert counts==expected
validate_verifier(verify)
# Mutation tests: reject the previous unsafe predicate, DDL replay and hidden writes.
unsafe=verify.replace("CASE WHEN c.relkind='S' THEN", "c.relkind='S' AND")
for mutation in [unsafe,verify+'\n\\i V2__iam_local.sql',
                 verify+'\nCREATE TABLE sigeh.forbidden(id int);',
                 verify+'\nSELECT 1 INTO sigeh.forbidden;']:
    try:
        validate_verifier(mutation)
    except AssertionError:
        pass
    else:
        raise AssertionError('Verificador inseguro aceptado')
master=Path('/home/robreport/Documents/SIGE-H-sql-maestro/SIGE-H_BASE_DATOS_MAESTRA_V1.sql')
assert hashlib.sha256(master.read_bytes()).hexdigest()=='3fddd2ec9f13508bdc779a1f827b9d89a461e10755fba94e9550c54a48645088'
print('PASS: 7 tablas, baseline QA/V1, grants acotados, rollback conservador, SELECT-only y SHA-256 maestro.')
print('PASS: verificador corregido y 4 mutaciones inseguras rechazadas (incluye regresión 42809).')
print('NO valida sintaxis/constraints/locks reales PostgreSQL; D2/D3 pendientes, ningún SQL ejecutado.')
