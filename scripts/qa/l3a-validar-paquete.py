#!/usr/bin/env python3
"""L3A static contract only: no pg import, sockets, SQL execution or fixture writes."""
from pathlib import Path
import hashlib,json,re
ROOT=Path(__file__).resolve().parents[2]
folder=ROOT/'infra/sql/privileges'
manifest=json.loads((folder/'L3A__lecturas.manifest.json').read_text())
expected=manifest['tables']
assert len(expected)==5 and sum(map(len,expected.values()))==27
master=Path('/home/robreport/Documents/SIGE-H-sql-maestro/SIGE-H_BASE_DATOS_MAESTRA_V1.sql').read_bytes()
assert hashlib.sha256(master).hexdigest()=='3fddd2ec9f13508bdc779a1f827b9d89a461e10755fba94e9550c54a48645088'
for table,columns in expected.items():
    body=re.search(r'CREATE TABLE '+table+r'\s*\(([\s\S]*?)\);',master.decode()).group(1)
    for col in columns: assert re.search(r'\b'+col+r'\s+(uuid|text|boolean|date|timestamptz|varchar)\b',body),(table,col)
forbidden={'rud','segundo_apellido','categoria_id','tipo','observaciones','creado_en','subarea_id','origen','password_hash'}
assert not forbidden.intersection(c for cols in expected.values() for c in cols)
def clean(text): return re.sub(r'--[^\n]*','',text)
def validate_permissions(text,verb):
    s=clean(text)
    grants={t:cols.split(',') for cols,t in re.findall(verb+r'\s+SELECT\(([^)]+)\)\s+ON\s+sigeh\.([a-z_]+)\s+(?:TO|FROM)\s+sigeh_qa_app\s*;',s,re.I)}
    assert grants==expected
    assert len(re.findall(r'\b'+verb+r'\s+SELECT',s,re.I))==5
    code=re.sub(r"'(?:''|[^'])*'", "''", s)
    assert not re.search(r'\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|EXECUTE|CASCADE)\b',code,re.I)
    assert not re.search(r'\b(?:GRANT|REVOKE)\s+ALL\b|\b(?:TO|FROM)\s+PUBLIC\b|ALTER DEFAULT',code,re.I)
    assert "current_database()<>'sigeh_qa'" in s and "session_user<>'sigeh_qa_bootstrap'" in s
    assert 'pg_control_system' in s and '7707094012630982690' in s
    assert 'pg_auth_members' in s and 'pg_shdepend' in s and 'pg_stat_activity' in s
    assert 'SET LOCAL lock_timeout' in s and s.strip().startswith('BEGIN;')
apply=(folder/'L3A__lecturas-qa.propuesta.sql').read_text()
rollback=(folder/'L3A__lecturas-qa.rollback.propuesta.sql').read_text()
validate_permissions(apply,'GRANT');validate_permissions(rollback,'REVOKE')
assert 'Baseline no vacio' in apply
assert 'sigeh.l3a_baseline_reviewed' in rollback and '<>27' in rollback and 'a.is_grantable' in rollback
verify=clean((folder/'L3A__lecturas-qa.verificacion.sql').read_text())
assert all(re.match(r'^\s*SELECT\b',s,re.I) for s in verify.split(';') if s.strip())
# Mutation tests reject broadened rights and protected fields.
for mutation in [apply.replace('GRANT SELECT(empleado_id,nombres,primer_apellido,activo)','GRANT SELECT(empleado_id,nombres,primer_apellido,activo,rud)'),apply.replace('GRANT SELECT(empleado_id,nombres,primer_apellido,activo)','GRANT ALL'),apply.replace('TO sigeh_qa_app','TO PUBLIC')]:
    try:validate_permissions(mutation,'GRANT')
    except AssertionError:pass
    else:raise AssertionError('Unsafe grant mutation accepted')
print('PASS: 27 SELECT column entries, exact V1 columns, explicit rollback, QA/cluster/owner guards, 3 mutations rejected.')
for p in sorted(folder.glob('L3A*')):print(p.name,hashlib.sha256(p.read_bytes()).hexdigest())
print('NO SQL APPLIED. Static contract is not a PostgreSQL parser, live ACL test or multihospital proof.')
