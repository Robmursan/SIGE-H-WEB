#!/usr/bin/env python3
"""Comprobación local de precedencia de la plantilla; no autentica ni abre sockets."""
import ipaddress
from pathlib import Path
import re

root = Path(__file__).resolve().parents[3]
hba = root / 'infra/qa/c1.1/pg_hba.conf.propuesta'
rules = [line.split('#')[0].split() for line in hba.read_text().splitlines() if line.split('#')[0].strip()]
for rule in rules:
    assert rule[0] in ('local', 'host') and len(rule) == (4 if rule[0] == 'local' else 5)
    assert rule[-1] in ('scram-sha-256', 'reject')
    if rule[0] == 'host':
        ipaddress.ip_network(rule[3])
    if rule[-1] == 'scram-sha-256':
        assert rule[1] == 'sigeh_qa' and rule[2] in ('sigeh_qa_bootstrap', 'sigeh_qa_app')


def match(kind, database, user, address=None):
    for rule in rules:
        if rule[0] != kind:
            continue
        # En HBA "all" database no representa replicación física.
        if not (rule[1] == database or (rule[1] == 'all' and database != 'replication')):
            continue
        if rule[2] not in ('all', user):
            continue
        if kind == 'host' and ipaddress.ip_address(address) not in ipaddress.ip_network(rule[3]):
            continue
        return rule[-1]
    return 'no-match'


cases = [
    ('local','sigeh_qa','sigeh_qa_bootstrap',None,'scram-sha-256'),
    ('local','sigeh_qa','sigeh_qa_app',None,'reject'),
    ('local','replication','sigeh_qa_bootstrap',None,'reject'),
    ('host','sigeh_qa','sigeh_qa_app','127.0.0.1','scram-sha-256'),
    ('host','sigeh_qa','sigeh_qa_app','::1','scram-sha-256'),
    ('host','postgres','sigeh_qa_app','127.0.0.1','reject'),
    ('host','sigeh_qa','otro_rol_ficticio','127.0.0.1','reject'),
    ('host','replication','sigeh_qa_bootstrap','127.0.0.1','reject'),
    ('host','replication','sigeh_qa_bootstrap','::1','reject'),
    ('host','sigeh_qa','sigeh_qa_app','172.19.0.1','reject'),
    ('host','sigeh_qa','sigeh_qa_app','172.19.0.3','reject'),
    ('host','sigeh_qa','sigeh_qa_app','2001:db8::1','reject'),
]
for kind, database, user, address, expected in cases:
    assert match(kind,database,user,address) == expected
sql = (root / 'infra/qa/c1.1/auditoria.sql').read_text()
sql = re.sub(r'--[^\n]*','',sql)
assert all(re.match(r'^\s*SELECT\b', statement, re.I) for statement in sql.split(';') if statement.strip())
assert not re.search(r'\b(pg_reload_conf|pg_terminate_backend|set_config|nextval|setval)\s*\(',sql,re.I)
print(f'PASS: {len(cases)} escenarios de precedencia de plantilla y contrato SELECT-only.')
print('NO valida parser PostgreSQL, HBA cargado ni SCRAM real; bridge pendiente queda rechazado deliberadamente.')
