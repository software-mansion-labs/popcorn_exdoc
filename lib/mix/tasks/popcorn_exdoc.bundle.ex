defmodule Mix.Tasks.PopcornExdoc.Bundle do
  use Mix.Task

  import Mix.Tasks.PopcornExdoc.Helpers

  @shortdoc "Builds a WASM bundle of your library for use with popcorn_exdoc"

  @impl true
  def run(_args) do
    project_root = File.cwd!()
    app_name = Mix.Project.config()[:app]
    build_dir = Path.join(project_root, "_build/popcorn_exdoc_bundle")
    wasm_project_dir = Path.join(build_dir, "wasm_project")
    bundle_out_dir = Path.join(build_dir, "output")

    step("Cleaning previous build", fn ->
      File.rm_rf!(build_dir)
      File.mkdir_p!(wasm_project_dir)
      File.mkdir_p!(bundle_out_dir)
    end)

    step("Setting up WASM project", fn ->
      write_mix_exs(wasm_project_dir, app_name, project_root)
    end)

    step("Building #{app_name}.avm", fn ->
      cook_bundle(wasm_project_dir, bundle_out_dir)
      File.rename!(
        Path.join(bundle_out_dir, "bundle.avm"),
        Path.join(bundle_out_dir, "#{app_name}.avm")
      )
    end)

    Mix.shell().info("""

    Bundle built successfully at:
      #{bundle_out_dir}/#{app_name}.avm

    """)
  end

  defp write_mix_exs(dir, app_name, project_root) do
    content = """
    defmodule WasmProject.MixProject do
      use Mix.Project

      def project do
        [
          app: :wasm_project,
          version: "0.1.0",
          elixir: "~> 1.17",
          start_permanent: false,
          deps: deps()
        ]
      end

      def application do
        [extra_applications: []]
      end

      defp deps do
        [
          {:popcorn, "~> 0.2.0"},
          {#{inspect(app_name)}, path: #{inspect(project_root)}, override: true}
        ]
      end
    end
    """

    File.write!(Path.join(dir, "mix.exs"), content)
  end
end
