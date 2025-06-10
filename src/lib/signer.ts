import { normalizeToSecretKey } from "applesauce-core/helpers";
import { type Nip07Interface, SimpleSigner } from "applesauce-signers";

export type { Nip07Interface as Signer };

/**
 * Private key signer that works with hex and bech32 nsec keys
 * @deprecated use SimpleSigner from applesauce-signers instead
 */
export class PrivateKeySigner extends SimpleSigner {
  /** Create a new private key signer */
  constructor(privateKey: string) {
    super(normalizeToSecretKey(privateKey));
  }
}
