import type { Command } from "@cliffy/command";

/**
 * Common option definitions for commands
 */

export interface CommonOptions {
  relays?: string;
  privatekey?: string;
  pubkey?: string;
  bunker?: string;
  servers?: string;
  nbunksec?: string;
}

/**
 * Add relay option to a command
 */
export function addRelayOption(command: Command): Command {
  return command.option(
    "-r, --relays <relays:string>",
    "The nostr relays to use (comma separated)."
  );
}

/**
 * Add private key option to a command
 */
export function addPrivateKeyOption(command: Command): Command {
  return command.option(
    "-k, --privatekey <nsec:string>",
    "The private key (nsec/hex) to use for signing."
  );
}

/**
 * Add public key option to a command
 */
export function addPubkeyOption(command: Command, description = "The public key to use"): Command {
  return command.option(
    "-p, --pubkey <npub:string>",
    description
  );
}

/**
 * Add bunker option to a command
 */
export function addBunkerOption(command: Command): Command {
  return command.option(
    "-b, --bunker <url:string>",
    "The NIP-46 bunker URL to use for signing."
  );
}

/**
 * Add server option to a command
 */
export function addServerOption(command: Command): Command {
  return command.option(
    "-s, --servers <servers:string>",
    "The servers to use (comma separated)."
  );
}

/**
 * Add nbunksec option to a command (for CI)
 */
export function addNbunksecOption(command: Command): Command {
  return command.option(
    "--nbunksec <nbunksec:string>",
    "The nbunksec string to use for authentication (for CI/CD)."
  );
}

/**
 * Add all authentication options to a command
 */
export function addAuthOptions(command: Command): Command {
  command = addPrivateKeyOption(command);
  command = addBunkerOption(command);
  command = addNbunksecOption(command);
  return command;
}

/**
 * Add common options (relays, auth) to a command
 */
export function addCommonOptions(command: Command): Command {
  command = addRelayOption(command);
  command = addAuthOptions(command);
  return command;
}