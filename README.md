# Sistema de Gestión de Asistencia y Cobertura de Enfermería - Hospital Civil de Guadalajara

Plataforma integral (Web + Móvil) diseñada para digitalizar, optimizar y automatizar el control de asistencia, gestión de suplencias y cálculo de tasa de ausentismo del personal de enfermería en los turnos Matutino (TM), Vespertino (TV) y Nocturno (TN).

---

## 🚀 Arquitectura y Stack Tecnológico

La solución utiliza una arquitectura desacoplada basada en microservicios/módulos con capacidad de operación fuera de línea (*Offline-First*).

* **Portal Web Admin:** Angular 17+ (Signals, RxJS, Angular Material, Tailwind CSS)
* **Aplicación Móvil:** Android Nativo (Kotlin, Jetpack Compose, Room DB, WorkManager, CameraX)
* **Backend & API Gateway:** Node.js (NestJS) / Golang + REST API + WebSockets (Socket.io)
* **Base de Datos & Caché:** PostgreSQL + Redis
* **Seguridad:** JWT, TLS 1.3, SQLCipher (cifrado local en Android)

---

## 👥 Perfiles de Usuario (RBAC)

1. **Jefe de Piso (Móvil):** Realiza el pase de lista inicial en área con casillas de verificación (*checks* por excepción) y registra incidencias directas.
2. **Supervisor de Turno (Móvil/Web):** Monitorea el avance de asistencia en múltiples áreas, aprueba permutas/incidencias y reasigna personal en tiempo real.
3. **Coordinador de Enfermería (Web):** Administra el banco de suplentes temporales (RUD), programa roles de turno y asigna coberturas de mediano/largo plazo.
4. **Jefa de Enfermería / Administrador (Web):** Accede al Dashboard Directivo con métricas globales, administra usuarios y configura parámetros institucionales.

---

## 📋 Requerimientos Funcionales Clave

### Móvil (Android)
* **Pase de Lista Rápido:** Selección por defecto (*Presente*) con desmarque (*Uncheck*) para registro de falta/incidencia en < 60 segundos por área.
* **Operación Offline-First:** Almacenamiento local mediante Room DB y sincronización automática en segundo plano con WorkManager.
* **Lectura de Credencial QR:** Validación rápida de presencia mediante CameraX.

### Web (Angular)
* **Dashboard Térmico en Tiempo Real:** Visualización por mapa de calor del estatus de asistencia y alertas de áreas sin cobertura.
* **Cálculo Automatizado de Ausentismo:** Eliminación de errores de cálculo manuales (`#DIV/0!`, `#REF!`).
* **Reasignación Drag-and-Drop:** Arrastrar y soltar personal entre servicios del mismo turno.

---

## 🗄️ Modelo de Datos (Dominio)

* `Empleado`: ID, RUD, Nombre, Categoria, TipoContrato (Base/Temporal).
* `Servicio_Area`: ID, NombreArea, Piso, Critico (Boolean).
* `Programacion_Plantilla`: ID, EmpleadoID, ServicioID, Fecha, Turno (TM/TV/TN).
* `Registro_Asistencia`: ID, ProgramacionID, Asistio (Boolean), Incidencia, Sincronizado (Boolean).
* `Cobertura_Suplente`: ID, RegistroAsistenciaID, EmpleadoSuplenteID, HoraAsignacion.

---

## ⚙️ Requerimientos No Funcionales

* **Tiempo de Respuesta:** < 200 ms por acción táctil en la app móvil.
* **Concurrencia:** Soporte de hasta 500 pases de lista simultáneos al inicio de turno.
* **Ergonomía Táctil:** Áreas de toque de mínimo 48x48 dp para uso con una sola mano en pasillo.
* **Disponibilidad:** 99.9% de *uptime* en servicios centrales.

---

## 📅 Roadmap de Implementación

1. **Fase 1 (Semanas 1-2):** Migración y limpieza de datos desde archivos base (`PLAN. TEM`, `TEMPORALES`, `DATOS`) a PostgreSQL.
2. **Fase 2 (Semanas 3-6):** Piloto móvil de pase de lista en servicio crítico (Urgencias / Quirófanos).
3. **Fase 3 (Semanas 7-10):** Despliegue del Portal Web Angular y Tablero Directivo.
4. **Fase 4 (Semanas 11-12):** Rollout general en turnos TM, TV y TN.

### 📋 Descripción del Cambio
<!-- Explica qué resuelve este PR y el módulo hospitalario afectado -->
- **Módulo:** Ausentismo / Cobertura / Camas / Ocupación
- **Tipo de cambio:** [ ] Feature  [ ] Bugfix  [ ] Hotfix  [ ] Refactor
- **Resumen:** 

### 🔍 Lista de Cotejo (Checklist del Desarrollador)
- [ ] La rama cumple con la nomenclatura (`prefijo/nombre-kebab-case`).
- [ ] No se incluyeron credenciales, variables `.env` ni datos sensibles de pacientes.
- [ ] El código compila localmente sin advertencias ni errores de TypeScript/linter.
- [ ] Se verificó el flujo visual en dispositivos de escritorio y móviles.

### 👥 Criterios para el Revisor (Code Review)
- [ ] La lógica del cálculo (complejidad/ocupación) arroja resultados consistentes.
- [ ] Las consultas y llamadas a endpoints son eficientes.
- [ ] Se resolvieron todas las conversaciones y observaciones abiertas en este PR.
