defmodule PopcornExDocWasm.MixProject do
  use Mix.Project

  def project do
    [
      app: :popcorn_ex_doc_wasm,
      version: "0.1.0",
      elixir: "~> 1.17",
      start_permanent: false,
      deps: deps()
    ]
  end

  def application do
    [
      extra_applications: [:logger],
      mod: {EvalElixir.Application, []}
    ]
  end

  defp deps do
    [
      {:popcorn, "~> 0.2.0"}
    ]
  end
end
