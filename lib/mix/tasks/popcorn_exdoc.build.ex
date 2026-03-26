defmodule Mix.Tasks.PopcornExdoc.Build do
  use Mix.Task

  import Mix.Tasks.PopcornExdoc.Helpers

  @shortdoc "Rebuilds prebuilt assets in priv/static (maintainers only)"

  @project_root Path.expand("../../..", __DIR__)
  @wasm_dir Path.join(@project_root, "wasm")
  @client_dir Path.join(@project_root, "client")
  @priv_static Path.join(@project_root, "priv/static")
  @build_tmp Path.join(@project_root, "_build/popcorn_exdoc_build")

  @impl true
  def run(_args) do
    File.mkdir_p!(@build_tmp)

    step("Building bundle.avm", fn ->
      cook_bundle(@wasm_dir, @build_tmp)
    end)

    step("Building JS bundle", fn ->
      npm = find!("npm")
      node = find!("node")
      cmd!(npm, ["install"], @client_dir)
      cmd!(node, ["build.mjs", @build_tmp, Path.join(@build_tmp, "bundle.avm")], @client_dir)
    end)

    step("Copying assets to priv/static", fn ->
      for file <- ~w(popcorn_exdoc.js AtomVM.mjs AtomVM.wasm bundle.avm iframe.mjs) do
        File.cp!(Path.join(@build_tmp, file), Path.join(@priv_static, file))
      end
    end)

    step("Cleaning up", fn ->
      File.rm_rf!(@build_tmp)
    end)

    Mix.shell().info("Done.")
  end
end
