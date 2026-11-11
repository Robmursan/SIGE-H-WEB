# Diagnóstico Inicial del Repositorio — SIGE-H

**Fecha de inspección:** 2026-11-10  
**Modo de inspección:** Solo lectura (previo a configuración de `DatabaseModule`, `HealthModule` y Swagger en `/docs`)

---

## 1. Entorno y Toolchain Detectado

| Componente | Valor observado |
|---|---|
| **Sistema Operativo** | Arch Linux (x86_64) |
| **Raíz del monorepo** | `/home/robreport/Documents/SIGE-H` |
| **Raíz del proyecto NestJS** | `/home/robreport/Documents/SIGE-H/apps/api` |
| **Sistema de módulos** | ESM (`"type": "module"`, `moduleResolution: "nodenext"`, imports relativos con `.js`) |
| **Versión de NestJS** | `@nestjs/core` `^12.0.1`, `@nestjs/common` `^12.0.1`, `@nestjs/config` `^12.1.1`, `@nestjs/swagger` `^12.1.1` |
| **Driver PostgreSQL** | `pg` `^8.23.1` + `@types/pg` |
| **Validación** | `class-validator` `^0.15.1`, `class-transformer` `^0.5.1` |
| **Runner de pruebas** | `vitest` `^4.1.2` (`npm test` y `npm run test:e2e`) |
| **Linter** | `oxlint` `^1.58.0` con `--type-aware` |

---

## 2. Estado de PostgreSQL en Docker

- **Contenedor activo:** `sigeh_postgres` (`postgres:17-alpine`)
- **Versión del motor:** `PostgreSQL 17.11 on x86_64-pc-linux-musl`
- **Puerto publicado en host:** `127.0.0.1:5432 -> 5432/tcp`
- **Base de datos:** `sigeh_db`
- **Esquema maestro:** `sigeh`
- **Usuario configurado en entorno local:** `sigeh_admin`
- **Total de tablas base en esquema `sigeh`:** `51`

### Inventario de las 51 tablas en `sigeh`

1. `adscripciones`
2. `aplicaciones_cobertura`
3. `asignaciones_operativas`
4. `auditoria_general`
5. `calendario_festivos`
6. `cambios_descanso`
7. `categorias`
8. `cierres_balance`
9. `competencias`
10. `contratos`
11. `convenios_sustitucion`
12. `disponibilidad_eventual`
13. `divisiones`
14. `efectos_programacion_movimiento`
15. `empleado_competencias`
16. `empleado_funciones`
17. `empleado_patrones`
18. `empleados`
19. `eventos_asistencia`
20. `funciones`
21. `horarios`
22. `hospitales`
23. `incidencia_autorizaciones`
24. `incidencia_documentos`
25. `incidencia_jornadas`
26. `incidencia_versiones`
27. `incidencias`
28. `incorporaciones_servicio`
29. `indicadores_complejidad`
30. `mediciones_complejidad`
31. `movimiento_decisiones`
32. `movimiento_eventos`
33. `movimientos_laborales`
34. `movimientos_operativos`
35. `necesidad_competencias`
36. `necesidades_cobertura`
37. `pases_salida`
38. `patron_dias`
39. `patrones_laborales`
40. `permisos`
41. `plantilla_servicio`
42. `programacion_laboral`
43. `registros_asistencia`
44. `rol_permisos`
45. `roles`
46. `rotaciones_subarea`
47. `servicios`
48. `subareas`
49. `tipos_incidencia`
50. `usuario_roles`
51. `usuarios`

---

## 3. Hallazgos y Riesgos Iniciales

1. **Validación de variables de entorno faltante:** `ConfigModule.forRoot` estaba registrado sin función `validate`, permitiendo levantar la aplicación con configuración incompleta o puertos inválidos.
2. **Módulo de infraestructura `pg` (`Pool`) faltante:** El proyecto tenía `pg` instalado pero carecía de un `DatabaseModule` con `Pool` nativo, cierre ordenado (`OnModuleDestroy`) y soporte de transacciones por `PoolClient`.
3. **Ruta de Swagger y Health Check:** Swagger estaba montado en `/api/docs` en lugar de `/docs`, y no existía el endpoint `GET /api/v1/health` con verificación `SELECT 1` y respuestas `200` / `503`.
4. **Prueba unitaria rota en `app.controller.spec.ts`:** `AppController` fallaba porque `AppService` requería `DataSource` sin mock y devolvía un string distinto al esperado por el test original.
5. **Rol de base de datos en entorno local:** `sigeh_admin` posee atributos `rolsuper=true` y `rolbypassrls=true` en el contenedor local. Para ambientes de QA/producción y pruebas de RLS multi-hospital se deberá crear un rol de aplicación sin privilegios de superusuario (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`).

---

## 4. Decisiones Explícitas de Protección

- **NO** ejecutar `nest new` ni alterar el layout ESM/Vitest existente.
- **NO** re-ejecutar el DDL maestro ni modificar las 51 tablas del esquema `sigeh`.
- **NO** activar `synchronize: true` en ningún componente.
- **NO** persistir datos ficticios permanentes durante pruebas unitarias o de integración.
- **NO** exponer contraseñas, secretos ni `DATABASE_URL` real en código, logs, Swagger ni archivos versionados.
