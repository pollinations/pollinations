{
  description = "Pollinations Dev Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachSystem flake-utils.lib.defaultSystems (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };

        zsh-config = pkgs.writeTextFile {
          name = "config.zsh";
          text = ''
            # initialize shell
            export SHELL=${pkgs.zsh}/bin/zsh;
            source $HOME/.zshrc
          '';
        };

        zsh-config-dir = pkgs.runCommand "zsh-config-dir" { } ''
          mkdir -p $out/config
          cp ${zsh-config} $out/config/.zshrc
        '';
      in
      {
        devShells.default = pkgs.mkShell {
          name = "pollinations";

          buildInputs = with pkgs; [
            zsh
            sops
            age
            uv
            nodejs_24
          ];

          shellHook = ''
            # runs each time the shell is entered

            # enable recursive globbing
            shopt -s globstar

            # set project root path variable
            export FLAKE_PATH=$(git rev-parse --show-toplevel)

            # set age key file location if not set
            if [[ -z "$SOPS_AGE_KEY_FILE" ]]; then
                export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
            fi

            # decrypt and load environment variables
            for file in **/.encrypted.env; do
              echo "Decrypting: $file"
              eval "$(sops decrypt $file \
                | grep -v '^#' \
                | grep -v '^$' \
                | sed 's/^/export /' \
              )"
            done

            # switch to zsh if direnv is not enabled
            if [[ ! -f .envrc ]]; then
              export ZDOTDIR=${zsh-config-dir}/config
              exec ${pkgs.zsh}/bin/zsh -i
            fi
          '';
        };
      }
    );
}
