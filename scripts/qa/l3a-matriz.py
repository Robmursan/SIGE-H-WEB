#!/usr/bin/env python3
"""Generate the endpoint/column review matrix offline; never executes SQL."""
import csv,json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
plan=json.loads((root/'infra/sql/privileges/L3A__lecturas.manifest.json').read_text())['tables']
C3=['contrato_id','empleado_id','hospital_id']
resources=[
 ('GET /api/v1/empleados','PERSONAL_CONSULTAR',{'empleados':plan['empleados'],'contratos':plan['contratos'],'adscripciones':['contrato_id','servicio_id','inicio','fin']}),
 ('GET /api/v1/empleados/{empleadoId}','PERSONAL_CONSULTAR',{'empleados':plan['empleados'],'contratos':plan['contratos'],'adscripciones':plan['adscripciones']}),
 ('GET /api/v1/contratos/{contratoId}/adscripciones','PERSONAL_CONSULTAR',{'empleados':['empleado_id','activo'],'contratos':plan['contratos'],'adscripciones':plan['adscripciones']}),
 ('GET /api/v1/programaciones','PROGRAMACION_CONSULTAR',{'programacion_laboral':plan['programacion_laboral'],'contratos':C3,'horarios':plan['horarios']}),
 ('GET /api/v1/tableros/coordinacion','TABLERO_CONSULTAR',{'programacion_laboral':[c for c in plan['programacion_laboral'] if c!='horario_id'],'contratos':C3}),
]
output=root/'artifacts/permissions/l3a-lecturas.csv';output.parent.mkdir(parents=True,exist_ok=True)
with output.open('w',newline='') as f:
 w=csv.writer(f,lineterminator='\n');w.writerow(['endpoint_preparado','tabla','columna','privilegio_sql_propuesto','facultad_iam_propuesta_no_insertada','alcance_obligatorio','naturaleza'])
 for endpoint,permission,tables in resources:
  for table,cols in tables.items():
   for col in cols:
    assert col in plan[table]
    nature='identificacion_necesaria' if table=='empleados' and col in ['nombres','primer_apellido'] else 'relacion_vigencia_programacion'
    w.writerow([endpoint,'sigeh.'+table,col,'SELECT('+col+')',permission,'hospitalId + servicioId; divisionId coherente; vigencia/mandato',nature])
print('Generated:',output.relative_to(root),'(no SQL, no patient/worker rows)')
