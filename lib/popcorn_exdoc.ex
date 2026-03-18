defmodule PopcornExDoc do
  def config(user_opts \\ []) do
    existing_head = Keyword.get(user_opts, :before_closing_head_tag, fn _ -> "" end)
    existing_body = Keyword.get(user_opts, :before_closing_body_tag, fn _ -> "" end)

    Keyword.merge(user_opts, [
      assets: %{priv_static_dir() => "assets"},
      before_closing_head_tag: fn fmt -> existing_head.(fmt) <> head_tag(fmt) end,
      before_closing_body_tag: fn fmt -> existing_body.(fmt) <> body_tag(fmt) end
    ])
  end

  def head_tag(:html), do: ~s(<link rel="stylesheet" href="./assets/popcorn_exdoc.css">)
  def head_tag(_), do: ""

  def body_tag(fmt, opts \\ [])
  def body_tag(:html, _opts) do
    ~s(<script type="module" defer src="./assets/popcorn_exdoc.js"></script>)
  end

  def body_tag(_, _), do: ""

  defp priv_static_dir do
    case :code.priv_dir(:popcorn_ex_doc) do
      {:error, _} -> Path.expand("../priv/static", __DIR__)
      priv -> Path.join(priv, "static")
    end
  end
end
