# ===========================================================================
# lib/popcorn_ex_doc.ex — Main module: download, bundle, ExDoc hooks
# ===========================================================================
#
# Pattern: same as phoenixframework/esbuild and phoenixframework/tailwind.
# On first use, downloads popcorn npm tarball, extracts it,
# runs esbuild to bundle JS, then copies WASM + bundled JS to doc output.
#
# User config in config/config.exs:
#
#   config :popcorn_ex_doc,
#     version: "0.1.0",
#     # optional: override base URL for air-gapped environments
#     base_url: "https://registry.npmjs.org/popcorn-elixir/-"

defmodule PopcornExDoc do
  @moduledoc """
  ExDoc extension for interactive Elixir code evaluation via Popcorn/WASM.

  Downloads the Popcorn JS/WASM runtime from npm at install time
  (like Phoenix's esbuild/tailwind wrappers), bundles with esbuild,
  and provides ExDoc hooks to inject the result into generated docs.

  ## Setup

      # mix.exs
      defp deps do
        [
          {:ex_doc, "~> 0.34", only: :dev, runtime: false},
          {:esbuild, "~> 0.10", only: :dev, runtime: false},
          {:popcorn_ex_doc, "~> 0.1", only: :dev, runtime: false}
        ]
      end

      # config/config.exs
      config :popcorn_ex_doc, version: "0.1.0"

      # mix.exs — docs config
      defp docs do
        [main: "readme", extras: ["README.md"]]
        |> Keyword.merge(PopcornExDoc.config())
      end

      # mix.exs — aliases (optional, auto-installs before docs)
      defp aliases do
        ["docs": ["popcorn_ex_doc.install", "docs"]]
      end

  Then in your markdown:

      ```popcorn-eval
      IO.puts("Hello from WASM!")
      Enum.map(1..5, &(&1 * 2))
      ```
  """

  require Logger

  @popcorn_version "0.2.0-rc.6"
  @base_popcorn_url "https://registry.npmjs.org/@swmansion/popcorn/-/popcorn-#{@popcorn_version}.tgz"

  # Where we keep the downloaded + extracted npm package
  @cache_dir Path.join(["_build", "popcorn_ex_doc"])
  @js_dir "js"

  # Where the final bundled assets end up (ready for ExDoc)
  @output_dir Path.join([@cache_dir, "assets"])

  # ---------------------------------------------------------------
  # Configuration
  # ---------------------------------------------------------------

  @doc "Configured Popcorn version."
  def configured_version do
    Application.get_env(:popcorn_ex_doc, :version, @popcorn_version)
  end

  def default_base_url do
    Application.get_env(
      :popcorn_ex_doc,
      :base_url,
      @base_popcorn_url
    )
  end

  @doc "Full URL for the configured version."
  def archive_url do
    default_base_url()
    |> String.replace("$version", configured_version())
  end

  @doc """
  Installs Popcorn assets if not already present.

  1. Downloads the npm tarball (or GitHub release archive)
  2. Extracts to `_build/popcorn_ex_doc/package/`
  3. Runs esbuild to bundle JS into `_build/popcorn_ex_doc/assets/`
  4. Copies WASM and static files alongside the bundle

  This is idempotent — skips if assets are already built for the
  configured version.
  """
  def install do
    version = configured_version()
    # version_file = Path.join(@output_dir, ".version")

    # if File.exists?(version_file) and File.read!(version_file) == version do
    #   :ok
    # else
      do_install(version)
    # end
  end

  defp do_install(version) do
    url = archive_url()
    Logger.info("Downloading Popcorn #{version} from #{url}")

    # Ensure clean slate
    File.rm_rf!(@cache_dir)
    File.mkdir_p!(@cache_dir)
    File.mkdir_p!(@output_dir)

    # 1. Download
    archive_data = fetch_body!(url)

    # 2. Extract .tgz (gzip-compressed tar)
    extract_dir = Path.join(@cache_dir, "package")
    extract_tgz!(archive_data, @cache_dir)

    # npm tarballs extract to a `package/` subdirectory
    unless File.dir?(extract_dir) do
      # GitHub releases may not have the `package/` wrapper
      # Try to find the actual content directory
      case File.ls!(@cache_dir) |> Enum.filter(&File.dir?(Path.join(@cache_dir, &1))) do
        [single_dir] ->
          File.rename!(Path.join(@cache_dir, single_dir), extract_dir)

        _ ->
          raise "Unexpected archive structure in #{url}"
      end
    end

    Logger.info("Extracted Popcorn to #{extract_dir}")

    # 5. Copy our own orchestrator JS + CSS
    copy_extension_assets!()

    # 3. Bundle JS with esbuild
    bundle_js!(extract_dir)

    # 4. Copy WASM + static assets
    copy_wasm_assets!(extract_dir)


    Logger.info("Popcorn #{version} assets ready at #{@output_dir}")
    :ok
  end

  # ---------------------------------------------------------------
  # Step 3: Bundle JS with esbuild
  # ---------------------------------------------------------------

  defp bundle_js!(package_dir) do
    # Create a tiny entry point that imports Popcorn and re-exports
    # what we need for the eval frame
    entry_file = Path.join(@cache_dir, "popcorn_exdoc.js")

    # entry_content = File.read!(Path.join(@js_dir, "popcorn_exdoc.js"))

    # File.write!(entry_file, entry_content)

    # Read esbuild version from config, or use a sensible default
    # esbuild_args = [
    #   entry_file,
    #   "--bundle",
    #   "--format=iife",
    #   "--target=es2020",
    #   "--outfile=#{Path.join(@output_dir, "popcorn-runtime.js")}",
    #   "--platform=browser",
    #   "--minify"
    # ]

    esbuild_args = [
      entry_file,
      "--bundle",
      "--format=esm",
      "--outdir=#{@output_dir}"
    ]

    Logger.info("Bundling Popcorn JS with esbuild...")

    # Use the Elixir esbuild wrapper (same one Phoenix uses)
    case run_esbuild(esbuild_args) do
      0 ->
        Logger.info("esbuild bundle complete")

      exit_code ->
        raise """
        esbuild failed with exit code #{exit_code}.

        Make sure {:esbuild, "~> 0.10"} is in your deps and
        `config :esbuild, version: "0.25.5"` is in config.exs.
        """
    end
  end

  defp run_esbuild(args) do
    # Strategy 1: Use the Esbuild Elixir package if available
    if Code.ensure_loaded?(Esbuild) do
      # Esbuild.bin_path/0 gives us the local esbuild binary
      bin = Esbuild.bin_path()

      unless File.exists?(bin) do
        Esbuild.install()
      end

      {output, exit_code} = System.cmd(bin, args, stderr_to_stdout: true)
      if output != "", do: IO.write(output)
      exit_code
    else
      # Strategy 2: Try system esbuild
      case System.find_executable("esbuild") do
        nil ->
          raise """
          esbuild not found. Add {:esbuild, "~> 0.10"} to your deps
          or install esbuild globally.
          """

        bin ->
          {output, exit_code} = System.cmd(bin, args, stderr_to_stdout: true)
          if output != "", do: IO.write(output)
          exit_code
      end
    end
  end

  # ---------------------------------------------------------------
  # Step 4: Copy WASM files
  # ---------------------------------------------------------------

  defp copy_wasm_assets!(package_dir) do
    # These are the key files produced by Popcorn's build.
    # The exact paths depend on the npm package structure.
    wasm_files = [
      "AtomVM.wasm",
      "AtomVM.mjs",
      "iframe.mjs"
    ]

    for filename <- wasm_files do
      src = find_file_recursive(package_dir, filename)

      if src do
        dest = Path.join(@output_dir, filename)
        File.cp!(src, dest)
        Logger.debug("Copied #{filename}")
      else
        Logger.warning("WASM file #{filename} not found in package — skipping")
      end
    end

    # Also look for any .avm bundle files (pre-compiled BEAM bytecode)
    package_dir
    |> Path.join("**/*.avm")
    |> Path.wildcard()
    |> Enum.each(fn src ->
      dest = Path.join(@output_dir, Path.basename(src))
      File.cp!(src, dest)
      Logger.debug("Copied #{Path.basename(src)}")
    end)
  end

  defp find_file_recursive(dir, filename) do
    Path.join([dir, "**", filename])
    |> Path.wildcard()
    |> List.first()
  end

  # ---------------------------------------------------------------
  # Step 5: Copy our own extension JS + CSS
  # ---------------------------------------------------------------

  defp copy_extension_assets! do
    src_dir = extension_assets_dir()

    files = [
      %{src: "popcorn_exdoc.js", dest: @cache_dir},
      %{src: "popcorn_exdoc.css", dest: @output_dir}
    ]


    Enum.each(files, fn %{src: file, dest: dest} ->
      src = Path.join(src_dir, file)

      if File.exists?(src) do
        File.cp!(src, Path.join(dest, file))
        IO.inspect("File copied #{src} #{file}")
      else
        Logger.warning("Extension asset #{file} not found at #{src}")
      end
    end)
  end

  defp extension_assets_dir do
    case :code.priv_dir(:popcorn_ex_doc) do
      {:error, _} ->
        # Development fallback
        Path.join([__DIR__, "..", "priv", "static"]) |> Path.expand()

      priv ->
        Path.join(priv, "static")
    end
  end

  defp fetch_body!(url) do
    url = String.to_charlist(url)

    # Start inets + SSL if not already running
    {:ok, _} = Application.ensure_all_started(:inets)
    {:ok, _} = Application.ensure_all_started(:ssl)

    # Trust Mozilla's CA bundle shipped with Erlang if available,
    # fall back to public_key's default
    ssl_opts =
      if function_exported?(:public_key, :cacerts_get, 0) do
        [
          verify: :verify_peer,
          cacerts: :public_key.cacerts_get(),
          depth: 3,
          customize_hostname_check: [
            match_fun: :public_key.pkix_verify_hostname_match_fun(:https)
          ]
        ]
      else
        cacertfile =
          CAStore.file_path()
          |> String.to_charlist()

        [
          verify: :verify_peer,
          cacertfile: cacertfile,
          depth: 3,
          customize_hostname_check: [
            match_fun: :public_key.pkix_verify_hostname_match_fun(:https)
          ]
        ]
      end

    http_opts = [
      ssl: ssl_opts,
      # Follow redirects (npm registry may redirect)
      autoredirect: true
    ]

    case :httpc.request(:get, {url, []}, http_opts, body_format: :binary) do
      {:ok, {{_, 200, _}, _headers, body}} ->
        body

      {:ok, {{_, status, _}, _, _}} ->
        raise "couldn't fetch #{url}: HTTP #{status}"

      {:error, reason} ->
        raise "couldn't fetch #{url}: #{inspect(reason)}"
    end
  end

  # ---------------------------------------------------------------
  # Tar extraction
  # ---------------------------------------------------------------

  defp extract_tgz!(data, dest_dir) do
    # npm tarballs are .tgz (gzip-compressed tar)
    case :erl_tar.extract({:binary, data}, [:compressed, {:cwd, String.to_charlist(dest_dir)}]) do
      :ok ->
        :ok

      {:error, reason} ->
        raise "failed to extract archive: #{inspect(reason)}"
    end
  end

  # ---------------------------------------------------------------
  # ExDoc integration (public API for end users)
  # ---------------------------------------------------------------

  @doc """
  Returns ExDoc config keywords. Merge into your `docs` config:

      defp docs do
        [main: "readme", extras: ["README.md"]]
        |> Keyword.merge(PopcornExDoc.config())
      end
  """
  def config(opts \\ []) do
    # Ensure assets are installed before docs generation
    install()

    [
      assets: assets(),
      before_closing_head_tag: &head_tag/1,
      before_closing_body_tag: body_tag_fn(opts)
    ]
  end

  @doc "Asset map for ExDoc: points to the built output directory."
  def assets do
    %{@output_dir => "assets"}
  end

  @doc "CSS link tag for ExDoc head."
  def head_tag(:html) do
    ~s(<link rel="stylesheet" href="./assets/popcorn_exdoc.css">)
  end

  def head_tag(_), do: ""

  @doc "Config + script tag for ExDoc body."
  def body_tag(:html, opts \\ []) do
    """
    <script type="module" defer src="./assets/popcorn_exdoc.js"></script>
    """
  end

  def body_tag(_, _), do: ""

  defp body_tag_fn(opts), do: fn fmt -> body_tag(fmt, opts) end
end
