# seihou-managed. Both hooks use the same packages as the dev shell.
{ inputs, ... }:
{
  imports = [ inputs.pre-commit-hooks.flakeModule ];
  perSystem = { pkgs, ... }:
    let
      tooling = pkgs.callPackage ./tooling.nix { };
    in {
      pre-commit.settings.hooks = {
        oxlint = {
          enable = true;
          name = "oxlint";
          entry = "${tooling.oxlint}/bin/oxlint";
          files = "\\.(c|m)?(j|t)sx?$";
          pass_filenames = false;
        };
        oxfmt = {
          enable = true;
          name = "oxfmt";
          entry = "${tooling.oxfmt}/bin/oxfmt --check";
          files = "\\.(c|m)?(j|t)sx?$|\\.json$";
          pass_filenames = true;
        };
      };
    };
}
