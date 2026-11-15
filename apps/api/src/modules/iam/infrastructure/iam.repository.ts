import { Injectable } from '@nestjs/common';
import { type PoolClient } from 'pg';
import { PostgresService } from '../../../database/postgres.service.js';
import {
  type AuthTransaction,
  type Credential,
  type Session,
  type Refresh,
  type SecurityEvent,
} from '../domain/session-model.js';

export class PgAuthTransaction implements AuthTransaction {
  constructor(private readonly client: PoolClient) {}
  async now(): Promise<Date> {
    return (
      await this.client.query<{ now: Date }>('SELECT clock_timestamp() AS now')
    ).rows[0]!.now;
  }
  async attempt(
    key: string,
    maximum: number,
    window: number,
  ): Promise<boolean> {
    const { rows } = await this.client.query<{ intentos: number }>(
      `
      INSERT INTO sigeh.iam_limites_acceso AS bucket(clave_hash,ventana_desde,intentos)
      VALUES($1,statement_timestamp(),1)
      ON CONFLICT(clave_hash) DO UPDATE SET
        intentos=CASE WHEN bucket.ventana_desde + $2::int * interval '1 second' <= statement_timestamp()
          THEN 1 ELSE LEAST(bucket.intentos+1,1000000) END,
        ventana_desde=CASE WHEN bucket.ventana_desde + $2::int * interval '1 second' <= statement_timestamp()
          THEN statement_timestamp() ELSE bucket.ventana_desde END
      RETURNING intentos`,
      [key, window],
    );
    return rows[0]!.intentos <= maximum;
  }
  async credential(identifier: string): Promise<Credential | null> {
    return (
      (
        await this.client.query<Credential>(
          `SELECT u.usuario_id,u.activo,c.password_hash,c.algoritmo,c.requiere_cambio,c.intentos_fallidos,c.bloqueada_hasta
      FROM sigeh.usuarios u JOIN sigeh.usuario_credenciales c USING(usuario_id)
      WHERE u.identificador=$1 FOR UPDATE OF c`,
          [identifier],
        )
      ).rows[0] ?? null
    );
  }
  async credentialAttempt(
    id: string,
    success: boolean,
    now: Date,
    max: number,
    seconds: number,
  ): Promise<void> {
    await this.client.query(
      `UPDATE sigeh.usuario_credenciales SET
      intentos_fallidos=CASE WHEN $2::boolean THEN 0 WHEN bloqueada_hasta<=$3 THEN 1 ELSE LEAST(intentos_fallidos+1,$4) END,
      bloqueada_hasta=CASE WHEN $2::boolean THEN NULL WHEN bloqueada_hasta<=$3 THEN NULL WHEN intentos_fallidos+1>=$4 THEN $3::timestamptz+$5::int*interval '1 second' ELSE NULL END
      WHERE usuario_id=$1::uuid`,
      [id, success, now, max, seconds],
    );
  }
  async userActive(id: string): Promise<boolean> {
    return (
      (
        await this.client.query<{ activo: boolean }>(
          'SELECT activo FROM sigeh.usuarios WHERE usuario_id=$1::uuid',
          [id],
        )
      ).rows[0]?.activo === true
    );
  }
  async createSession(s: Session): Promise<void> {
    await this.client.query(
      `INSERT INTO sigeh.sesiones_usuario(sesion_id,usuario_id,creada_en,expira_en,ultima_actividad_en,inactiva_en)
      VALUES($1,$2,$3,$4,$5,$6)`,
      [
        s.sesion_id,
        s.usuario_id,
        s.creada_en,
        s.expira_en,
        s.ultima_actividad_en,
        s.inactiva_en,
      ],
    );
  }
  async findRefresh(hash: string): Promise<Refresh | null> {
    return (
      (
        await this.client.query<Refresh>(
          'SELECT token_id,sesion_id,expira_en,consumido_en,revocado_en FROM sigeh.refresh_tokens_sesion WHERE token_hash=$1',
          [hash],
        )
      ).rows[0] ?? null
    );
  }
  async lockSession(id: string): Promise<Session | null> {
    return (
      (
        await this.client.query<Session>(
          'SELECT sesion_id,usuario_id,creada_en,expira_en,ultima_actividad_en,inactiva_en,revocada_en FROM sigeh.sesiones_usuario WHERE sesion_id=$1::uuid FOR UPDATE',
          [id],
        )
      ).rows[0] ?? null
    );
  }
  async consumeRefresh(
    id: string,
    replacement: string,
    now: Date,
  ): Promise<void> {
    const r = await this.client.query(
      'UPDATE sigeh.refresh_tokens_sesion SET consumido_en=$2,reemplazado_por=$3 WHERE token_id=$1::uuid AND consumido_en IS NULL AND revocado_en IS NULL',
      [id, now, replacement],
    );
    if (r.rowCount !== 1) throw new Error('REFRESH_STATE_CONFLICT');
  }
  async insertRefresh(
    id: string,
    session: string,
    hash: string,
    expires: Date,
  ): Promise<void> {
    await this.client.query(
      'INSERT INTO sigeh.refresh_tokens_sesion(token_id,sesion_id,token_hash,expira_en) VALUES($1,$2,$3,$4)',
      [id, session, hash, expires],
    );
  }
  async touchSession(id: string, now: Date, idle: Date): Promise<void> {
    await this.client.query(
      'UPDATE sigeh.sesiones_usuario SET ultima_actividad_en=$2,inactiva_en=$3 WHERE sesion_id=$1::uuid',
      [id, now, idle],
    );
  }
  async revoke(id: string, reason: string, now: Date): Promise<void> {
    await this.client.query(
      'UPDATE sigeh.sesiones_usuario SET revocada_en=COALESCE(revocada_en,$2),motivo_revocacion=COALESCE(motivo_revocacion,$3) WHERE sesion_id=$1::uuid',
      [id, now, reason],
    );
    await this.client.query(
      'UPDATE sigeh.refresh_tokens_sesion SET revocado_en=COALESCE(revocado_en,$2) WHERE sesion_id=$1::uuid',
      [id, now],
    );
  }
  async audit(e: SecurityEvent): Promise<void> {
    await this.client.query(
      `INSERT INTO sigeh.auditoria_seguridad(evento,resultado,actor_usuario_id,objetivo_usuario_id,sesion_id,hospital_id,division_id,servicio_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        e.evento,
        e.resultado,
        e.actor ?? null,
        e.objetivo ?? null,
        e.sesion ?? null,
        e.hospital ?? null,
        e.division ?? null,
        e.servicio ?? null,
      ],
    );
  }
}

@Injectable()
export class IamRepository {
  constructor(private readonly postgres: PostgresService) {}
  transaction<T>(work: (tx: AuthTransaction) => Promise<T>): Promise<T> {
    return this.postgres.withTransaction(
      (c) => work(new PgAuthTransaction(c)),
      { readOnly: false },
    );
  }
  async activeSession(principal: {
    usuarioId: string;
    sesionId: string;
  }): Promise<boolean> {
    return (
      (
        await this.postgres.query(
          `SELECT 1 FROM sigeh.sesiones_usuario s JOIN sigeh.usuarios u USING(usuario_id)
      WHERE s.sesion_id=$1::uuid AND u.usuario_id=$2::uuid AND u.activo AND s.revocada_en IS NULL
      AND s.expira_en>clock_timestamp() AND s.inactiva_en>clock_timestamp()`,
          [principal.sesionId, principal.usuarioId],
        )
      ).rowCount === 1
    );
  }
  async sessions(user: string) {
    return (
      await this.postgres.query<Session>(
        `SELECT sesion_id,usuario_id,creada_en,expira_en,ultima_actividad_en,inactiva_en,revocada_en
      FROM sigeh.sesiones_usuario WHERE usuario_id=$1::uuid ORDER BY creada_en DESC,sesion_id DESC LIMIT 50`,
        [user],
      )
    ).rows;
  }
}
