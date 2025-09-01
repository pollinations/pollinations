{
  description = "Pollinations Dev Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-utils.url = "github:numtide/flake-utils";
    pipelight.url = "github:pipelight/pipelight";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      pipelight,
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
            eval "$(${pkgs.starship}/bin/starship init zsh)"
            ${pkgs.figlet}/bin/figlet -f small "Pollinations"
            # shell improvements
            source ${pkgs.zsh-syntax-highlighting}/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
            source ${pkgs.zsh-autosuggestions}/share/zsh-autosuggestions/zsh-autosuggestions.zsh
            fpath=(${pkgs.zsh-completions}/share/zsh/site-functions $fpath)
            autoload -U compinit && compinit
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

          buildInputs = [
            pipelight.packages.${system}.default
          ]
          ++ (with pkgs; [
            zsh
            zsh-syntax-highlighting
            zsh-autosuggestions
            zsh-completions
            starship
            figlet
            git
            sops
            age
            uv
            nodejs_24

            # Image processing dependencies for image.pollinations.ai
            vips
            pkg-config
            glib

            # ExifTool dependencies
            exiftool
            perl

            # Build tools for native Node.js modules
            gcc
            gnumake
            python3

            # Additional image processing libraries
            imagemagick
            libjpeg
            libpng
            libtiff
            libwebp
          ]);

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
