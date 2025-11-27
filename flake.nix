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
            # shell improvements
            source ${pkgs.zsh-syntax-highlighting}/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
            source ${pkgs.zsh-autosuggestions}/share/zsh-autosuggestions/zsh-autosuggestions.zsh
            fpath=(${pkgs.zsh-completions}/share/zsh/site-functions $fpath)
            autoload -U compinit && compinit
            # fzf
            source ${pkgs.fzf}/share/fzf/key-bindings.zsh
            source ${pkgs.fzf}/share/fzf/completion.zsh
            export FZF_DEFAULT_OPTS="--height 40% --layout=reverse --color=16"
            # initialize shell
            eval "$(${pkgs.starship}/bin/starship init zsh)"
            ${pkgs.figlet}/bin/figlet -f small "Pollinations"
          '';
        };

        zsh-config-dir = pkgs.runCommand "zsh-config-dir" { } ''
          mkdir -p $out/config
          cp ${zsh-config} $out/config/.zshrc
        '';

        tinybird-cli = pkgs.stdenv.mkDerivation {
          pname = "tinybird-cli";
          version = "latest";

          nativeBuildInputs = [
            pkgs.uv
            pkgs.python311
          ];

          unpackPhase = "true"; # no source to unpack

          buildPhase = ''
            export HOME=$TMPDIR
            export UV_TOOL_DIR=$out
            export UV_TOOL_BIN_DIR=$out/bin
            export UV_CACHE_DIR=$out/cache
            mkdir -p $out/bin
            uv tool install tinybird --python 3.11 --force
          '';

          postFixup = ''
            # Fix shebangs to point to the correct python interpreter
            patchShebangs $out/bin
          '';

          meta = with pkgs.lib; {
            description = "Tinybird CLI";
            platforms = platforms.unix;
          };
        };
      in
      {
        devShells.default = pkgs.mkShell {
          name = "pollinations";

          buildInputs = [
            tinybird-cli
          ]
          ++ (with pkgs; [
            zsh
            zsh-syntax-highlighting
            zsh-autosuggestions
            zsh-completions
            starship
            fzf
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

            # prevents nix from messing with the time
            unset SOURCE_DATE_EPOCH

            # enable recursive globbing
            shopt -s globstar

            # set project root path variable
            export FLAKE_PATH=$(git rev-parse --show-toplevel)

            # set age key file location if not set
            if [[ -z "$SOPS_AGE_KEY_FILE" ]]; then
                export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
            fi

            # decrypt and load environment variables
            for file in $FLAKE_PATH/**/secrets/env.json; do
              echo "Decrypting: $file"
              eval "$(sops decrypt "$file" \
                | jq -r 'to_entries | .[] | "export \(.key)=\(.value | @sh)"'
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
