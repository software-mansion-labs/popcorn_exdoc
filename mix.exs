defmodule PopcornExDoc.MixProject do
  use Mix.Project

  @version "0.1.0"
  @source_url "https://github.com/software-mansion/popcorn"

  def project do
    [
      app: :popcorn_ex_doc,
      version: @version,
      elixir: "~> 1.17",
      start_permanent: false,
      deps: deps(),
      name: "PopcornExDoc",
      description: "ExDoc extension for interactive Elixir code evaluation via Popcorn/WASM",
      source_url: @source_url,
      package: package(),
      docs: &docs/0
    ]
  end

  def application, do: []

  defp deps do
    [
      {:ex_doc, "~> 0.34", only: :dev, runtime: false, warn_if_outdated: true}
    ]
  end

  defp package do
    [
      name: "popcorn_ex_doc",
      files: ~w(lib priv .formatter.exs mix.exs README* LICENSE*),
      licenses: ["Apache-2.0"],
      links: %{"GitHub" => @source_url}
    ]
  end

  defp docs do
    [
      main: "PopcornExDoc",
      extras: ["README.md", "guides/examples.md"],
      assets: %{"docs_assets" => "."},
      before_closing_head_tag: fn
        :html -> ~s(<script src="coi-serviceworker.js"></script>)
        _ -> ""
      end
    ]
    |> PopcornExDoc.config()
  end
end
