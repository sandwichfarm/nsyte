{
  description = "nsyte - publish your site to nostr and blossom servers";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      version = "0.27.1";

      # Per-system source URLs and SRI hashes.
      # Phase 26 CI patches these placeholders on release via sed.
      sources = {
        "x86_64-linux" = {
          url = "https://github.com/sandwichfarm/nsyte/releases/download/v${version}/nsyte-linux-${version}";
          hash = "sha256-hD3/xQ1uiDS5gU/oyUInNtIew6YJYp+wMvGyUKRlplM=";
        };
        # "aarch64-linux" pending release.yml aarch64 Linux build step - add back when binary is published
        "x86_64-darwin" = {
          url = "https://github.com/sandwichfarm/nsyte/releases/download/v${version}/nsyte-macos-x64-${version}";
          hash = "sha256-qMfz01FDYRldNcCSOsLJxA7S6cfchSKKlNzDb36rgD0=";
        };
        "aarch64-darwin" = {
          url = "https://github.com/sandwichfarm/nsyte/releases/download/v${version}/nsyte-macos-arm64-${version}";
          hash = "sha256-lbqZkvbD0LDn6XlGTO69Oge3aWQd2e6oJbPg2TwmpKE=";
        };
      };

      supportedSystems = builtins.attrNames sources;
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          src = sources.${system};
          isLinux = pkgs.stdenvNoCC.isLinux;
        in
        {
          nsyte = pkgs.stdenvNoCC.mkDerivation {
            pname = "nsyte";
            inherit version;

            src = pkgs.fetchurl {
              inherit (src) url hash;
            };

            # autoPatchelfHook patches the ELF interpreter path for NixOS.
            # Only needed on Linux - Darwin uses Mach-O, no patching needed.
            nativeBuildInputs = pkgs.lib.optionals isLinux [
              pkgs.autoPatchelfHook
            ];

            # glibc is the only runtime dependency for a deno-compile binary.
            buildInputs = pkgs.lib.optionals isLinux [
              pkgs.glibc
            ];

            dontUnpack = true;
            dontBuild = true;

            installPhase = ''
              install -m755 -D $src $out/bin/nsyte
            '';

            meta = with pkgs.lib; {
              description = "Publish your site to nostr and blossom servers";
              homepage = "https://github.com/sandwichfarm/nsyte";
              license = licenses.mit;
              platforms = supportedSystems;
              mainProgram = "nsyte";
            };
          };

          default = self.packages.${system}.nsyte;
        });
    };
}
