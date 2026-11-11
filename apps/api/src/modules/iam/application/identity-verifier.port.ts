export const IDENTITY_VERIFIER = Symbol('IDENTITY_VERIFIER');

/** Only an approved provider may produce this subject after authentication and
 * session/revocation validation. Request fields and decoded JWT claims do not. */
export interface IdentityVerifier {
  verify(credential: string | undefined): Promise<{ usuarioId: string }>;
}

export class IdentityUnavailableError extends Error {
  constructor() {
    super('IDENTIDAD_NO_DISPONIBLE');
  }
}

/** Fail closed. No test identity, JWT decoding or environment bypass. */
export class UnavailableIdentityVerifier implements IdentityVerifier {
  verify(): Promise<never> {
    return Promise.reject(new IdentityUnavailableError());
  }
}
