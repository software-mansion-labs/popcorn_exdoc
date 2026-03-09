defmodule Mix.Tasks.PopcornExdoc.Build do
  use Mix.Task

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
      mix = find!("mix")
      cmd!(mix, ["deps.get"], @wasm_dir)
      cmd!(mix, ["popcorn.cook", "--out-dir", @build_tmp], @wasm_dir)
    end)

    step("Building JS bundle", fn ->
      npm = find!("npm")
      node = find!("node")
      cmd!(npm, ["install"], @client_dir)

      cmd!(
        node,
        ["build.mjs", @build_tmp, Path.join(@build_tmp, "bundle.avm")],
        @client_dir
      )
    end)

    step("Copying assets to priv/static", fn ->
      for file <- ~w(popcorn_exdoc.js AtomVM.mjs AtomVM.wasm bundle.avm iframe.mjs) do
        File.cp!(Path.join(@build_tmp, file), Path.join(@priv_static, file))
      end
    end)

    step("Cleaning bundle build temp", fn ->
      File.rm_rf!(@build_tmp)
    end)

    Mix.shell().info("Done.")
  end

  defp step(label, fun) do
    Mix.shell().info("==> #{label}...")
    fun.()
  end

  defp cmd!(exe, args, dir) do
    case System.cmd(exe, args, cd: dir, into: IO.stream()) do
      {_, 0} -> :ok
      {_, code} -> Mix.raise("`#{exe} #{Enum.join(args, " ")}` failed (exit #{code})")
    end
  end

  defp find!(name) do
    System.find_executable(name) ||
      Mix.raise("#{name} not found. Please install Node.js (https://nodejs.org).")
  end
end
