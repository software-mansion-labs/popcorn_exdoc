defmodule Mix.Tasks.PopcornExDoc.Install do
  @moduledoc """
  Installs (or re-installs) the Popcorn WASM runtime for ExDoc.

  Downloads the Popcorn npm tarball, extracts it, and bundles the JS
  with esbuild. The resulting assets are placed in
  `_build/popcorn_ex_doc/assets/` ready for ExDoc to pick up.

      $ mix popcorn_ex_doc.install

  ## Options

    * `--force` — re-install even if already present for current version

  ## Configuration

  Set the version in config/config.exs:

      config :popcorn_ex_doc, version: "0.1.0"

  Optionally override the download URL:

      config :popcorn_ex_doc,
        base_url: "https://my-mirror.example.com/popcorn-$version.tgz"
  """

  @shortdoc "Installs the Popcorn WASM runtime for ExDoc"

  use Mix.Task

  @impl true
  def run(_args) do
    # {opts, _} = OptionParser.parse!(args, strict: [force: :boolean])

    # if opts[:force] do
    #   # Remove version marker to force re-install
    #   version_file = Path.join(["_build", "popcorn_ex_doc", "assets", ".version"])
    #   File.rm(version_file)
    # end

    case PopcornExDoc.install() do
      :ok ->
        version = PopcornExDoc.configured_version()
        Mix.shell().info("Popcorn #{version} assets installed successfully.")

      {:error, reason} ->
        Mix.shell().error("Failed to install Popcorn: #{inspect(reason)}")
        exit({:shutdown, 1})
    end
  end
end
