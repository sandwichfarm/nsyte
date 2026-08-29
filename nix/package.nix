{
  pkgs,
  src,
  version,
}:
let
  inherit (pkgs) lib;

  nsyte = pkgs.buildDenoApplication {
    pname = "nsyte";
    inherit version src;

    entrypoint = "src/cli.ts";
    denoDepsHash = "sha256-lNkreZhZU+rH2QeXFE8ZfwlXRkykJwuqHzTnyfW43CU=";

    runFlags = [
      "--vendor=true"
      "--allow-run"
      "--allow-read"
      "--allow-write"
      "--allow-net"
      "--allow-env"
      "--allow-sys"
    ];

    runtimeInputs = [
      pkgs.git
      pkgs.which
    ]
    ++ lib.optionals pkgs.stdenv.hostPlatform.isLinux [
      pkgs.libsecret
      pkgs.xdg-utils
    ];

    meta = {
      description = "Publish your site to nostr and blossom servers";
      homepage = "https://github.com/sandwichfarm/nsyte";
      license = lib.licenses.mit;
    };
  };
in
{
  default = nsyte;
  inherit nsyte;
  denoDeps = nsyte.denoDeps;
}
