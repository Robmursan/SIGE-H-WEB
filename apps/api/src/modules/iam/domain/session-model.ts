export interface Principal {
  usuarioId: string;
  sesionId: string;
}
export interface Credential {
  usuario_id: string;
  activo: boolean;
  password_hash: string;
  algoritmo: string;
  requiere_cambio: boolean;
  intentos_fallidos: number;
  bloqueada_hasta: Date | null;
}
export interface Session {
  sesion_id: string;
  usuario_id: string;
  creada_en: Date;
  expira_en: Date;
  ultima_actividad_en: Date;
  inactiva_en: Date;
  revocada_en: Date | null;
}
export interface Refresh {
  token_id: string;
  sesion_id: string;
  expira_en: Date;
  consumido_en: Date | null;
  revocado_en: Date | null;
}
export interface SecurityEvent {
  evento: string;
  resultado: 'ALLOW' | 'DENY';
  actor?: string;
  objetivo?: string;
  sesion?: string;
  hospital?: string;
  division?: string;
  servicio?: string;
}
export interface AuthTransaction {
  now(): Promise<Date>;
  attempt(key: string, maximum: number, window: number): Promise<boolean>;
  credential(identifier: string): Promise<Credential | null>;
  credentialAttempt(
    id: string,
    success: boolean,
    now: Date,
    max: number,
    seconds: number,
  ): Promise<void>;
  userActive(id: string): Promise<boolean>;
  createSession(session: Session): Promise<void>;
  findRefresh(hash: string): Promise<Refresh | null>;
  lockSession(id: string): Promise<Session | null>;
  consumeRefresh(id: string, replacement: string, now: Date): Promise<void>;
  insertRefresh(
    id: string,
    session: string,
    hash: string,
    expires: Date,
  ): Promise<void>;
  touchSession(id: string, now: Date, idle: Date): Promise<void>;
  revoke(id: string, reason: string, now: Date): Promise<void>;
  audit(event: SecurityEvent): Promise<void>;
}
