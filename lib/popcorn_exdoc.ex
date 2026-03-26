defmodule PopcornExDoc do
  def config(user_opts \\ []) do
    {popcorn_opts, user_opts} = Keyword.split(user_opts, [:bundle_path])
    bundle_path = Keyword.get(popcorn_opts, :bundle_path) || default_bundle_path()

    existing_head = Keyword.get(user_opts, :before_closing_head_tag, fn _ -> "" end)
    existing_body = Keyword.get(user_opts, :before_closing_body_tag, fn _ -> "" end)
    existing_assets = Keyword.get(user_opts, :assets, %{})

    assets =
      case bundle_path do
        nil ->
          Map.merge(existing_assets, %{priv_static_dir() => "assets"})

        path ->
          bundle_dir = path |> Path.expand() |> Path.dirname()
          Map.merge(existing_assets, %{priv_static_dir() => "assets", bundle_dir => "assets"})
      end

    Keyword.merge(user_opts,
      assets: assets,
      before_closing_head_tag: fn fmt ->
        existing_head.(fmt) <> head_tag(fmt) <> user_bundle_meta_tag(fmt, bundle_path)
      end,
      before_closing_body_tag: fn fmt -> existing_body.(fmt) <> body_tag(fmt) end
    )
  end

  def head_tag(:html), do: ~s(<link rel="stylesheet" href="./assets/popcorn_exdoc.css">)
  def head_tag(_), do: ""

  def body_tag(fmt, opts \\ [])

  def body_tag(:html, _opts) do
    ~s(<script type="module" defer src="./assets/popcorn_exdoc.js"></script>)
  end

  def body_tag(_, _), do: ""

  defp user_bundle_meta_tag(:html, path) when is_binary(path) do
    name = Path.basename(path)
    ~s(<meta name="popcorn-user-bundle" content="./#{name}">)
  end

  defp user_bundle_meta_tag(_, _), do: ""

  defp default_bundle_path do
    app_name = Mix.Project.config()[:app]
    path = Path.expand("_build/popcorn_exdoc_bundle/output/#{app_name}.avm")
    if File.exists?(path), do: path, else: nil
  end

  defp priv_static_dir do
    case :code.priv_dir(:popcorn_ex_doc) do
      {:error, _} -> Path.expand("../priv/static", __DIR__)
      priv -> Path.join(priv, "static")
    end
  end
end
