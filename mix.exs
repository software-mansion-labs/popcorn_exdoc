defmodule PopcornExDoc.MixProject do
  use Mix.Project

  @version "0.1.0"
  @source_url "https://github.com/software-mansion/popcorn"

  def project do
    [
      app: :popcorn_ex_doc,
      version: @version,
      elixir: "~> 1.15",
      start_permanent: false,
      deps: deps(),
      name: "PopcornExDoc",
      description: "ExDoc extension for interactive Elixir code evaluation via Popcorn/WASM",
      source_url: @source_url,
      package: package(),
      docs: docs()
    ]
  end

  def application do
    [extra_applications: [:inets, :ssl]]
  end

  defp deps do
    [
      {:esbuild, "~> 0.10", optional: true},
      {:castore, ">= 0.0.0"}
    ]
  end

  defp package do
    [
      name: "popcorn_ex_doc",
      # Note: priv/static contains our small orchestrator JS + CSS
      # (NOT the full WASM runtime — that's downloaded at install time)
      files: ~w(lib priv .formatter.exs mix.exs README* LICENSE*),
      licenses: ["Apache-2.0"],
      links: %{"GitHub" => @source_url}
    ]
  end

  defp docs do
    [main: "PopcornExDoc", extras: ["README.md"]]
  end
end
