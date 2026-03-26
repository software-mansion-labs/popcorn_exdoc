defmodule Mix.Tasks.PopcornExdoc.Helpers do
  @moduledoc false

  def step(label, fun) do
    Mix.shell().info("==> #{label}...")
    fun.()
  end

  def cmd!(exe, args, dir) do
    case System.cmd(exe, args, cd: dir, into: IO.stream()) do
      {_, 0} -> :ok
      {_, code} -> Mix.raise("`#{exe} #{Enum.join(args, " ")}` failed (exit #{code})")
    end
  end

  def find!(name) do
    System.find_executable(name) ||
      Mix.raise("#{name} not found. Please install it before running this task.")
  end

  def cook_bundle(wasm_dir, out_dir) do
    mix = find!("mix")
    cmd!(mix, ["deps.get"], wasm_dir)
    cmd!(mix, ["popcorn.cook", "--out-dir", out_dir], wasm_dir)
  end
end
