{
  description = "nsyte - publish your site to nostr and blossom servers";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-darwin.url = "github:NixOS/nixpkgs/nixpkgs-26.05-darwin";
    deno2nix.url = "github:hzrd149/deno2nix";
    deno2nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    {
      self,
      nixpkgs,
      nixpkgs-darwin,
      deno2nix,
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forAllSystems =
        f:
        nixpkgs.lib.genAttrs systems (
          system:
          f system (
            import (if system == "x86_64-darwin" then nixpkgs-darwin else nixpkgs) {
              inherit system;
              overlays = [ deno2nix.overlays.default ];
            }
          )
        );

      # Include only files needed by `deno run src/cli.ts`, so unrelated
      # repository changes cannot affect the package derivation.
      src = nixpkgs.lib.fileset.toSource {
        root = ./.;
        fileset = nixpkgs.lib.fileset.unions [
          ./deno.json
          ./deno.lock
          ./src
        ];
      };
    in
    {
      packages = forAllSystems (
        _system: pkgs:
        import ./nix/package.nix {
          inherit pkgs src;
          version = (builtins.fromJSON (builtins.readFile ./deno.json)).version;
        }
      );

      apps = forAllSystems (
        system: _pkgs: {
          default = {
            type = "app";
            program = "${self.packages.${system}.default}/bin/nsyte";
            meta.description = "Run nsyte";
          };
        }
      );

      devShells = forAllSystems (
        _system: pkgs: {
          default = pkgs.mkShell {
            packages = [ pkgs.deno ];

            shellHook = ''
              echo "nsyte dev shell"
              echo "  deno task dev"
              echo "  nix build .#nsyte"
            '';
          };
        }
      );

      checks = forAllSystems (
        system: _pkgs: {
          package = self.packages.${system}.default;
        }
      );
    };
}
