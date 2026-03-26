# PopcornExDoc

An [ExDoc](https://github.com/elixir-lang/ex_doc) extension that adds interactive, runnable Elixir code blocks to your generated documentation — powered by [Popcorn](https://github.com/software-mansion/popcorn).

Readers can click **Run** directly in the docs and see live output, without leaving the page.

---

## How it works

- Your docs are generated normally with ExDoc.
- PopcornExDoc injects a small JS bundle and CSS into the HTML output.
- Code blocks marked with the `popcorn-eval` class get a **Run** button and an output area.
- Clicking **Run** executes the code via an [AtomVM](https://www.atomvm.net/) WASM runtime embedded in the page — no server required.
- Two bundles are loaded: a pre-built evaluator bundle (shipped with the package) and optionally your library's bundle, so code blocks can call your own modules.

**Stack:**

- Elixir + [Popcorn](https://github.com/software-mansion/popcorn) (WASM runtime bridge)
- AtomVM (runs compiled Elixir in the browser via WASM)
- esbuild (JS bundler)
- ExDoc hooks (`before_closing_head_tag` / `before_closing_body_tag`)

---

## Installation

Add to your `mix.exs`:

```elixir
def deps do
  [
    {:popcorn_exdoc, "~> 0.1.0"}
  ]
end
```

---

## Usage

### 1. Configure ExDoc

Pipe your ExDoc options into `PopcornExDoc.config/1`:

```elixir
defp docs do
  [
    main: "MyApp",
    extras: [
      "guides/introduction.md",
      "guides/examples.md"
    ]
  ]
  |> PopcornExDoc.config()
end
```

`PopcornExDoc.config/1` merges the required assets and hooks into your options. If you already use `before_closing_head_tag` or `before_closing_body_tag` for another extension, the functions are composed — both run.

### 2. Mark code blocks as runnable

In your module docs or guides, add the `popcorn-eval` class to a fenced code block using ExDoc's IAL syntax:

````markdown
```elixir
IO.puts("Hello from WASM!")
1 + 1
```
{: .popcorn-eval}
````

ExDoc will render this as an interactive block with a **Run** button. Clicking it evaluates the code in the browser and shows stdout, return value, and any errors inline.

### Example

![Example eval block](assets/example-eval-block.png)

---

## Using your library's modules in code blocks

By default, code blocks can only use Elixir's standard library. To make your own library's modules available in the WASM runtime, build a library bundle and load it alongside the pre-built evaluator.

### 1. Build the library bundle

Run this in your library's project root:

```bash
mix popcorn_exdoc.bundle
```

This compiles your library for AtomVM and writes the bundle to:

```
_build/popcorn_exdoc_bundle/output/<your_app>.avm
```

### 2. Generate docs

The bundle is picked up automatically from the default output path:

```bash
mix docs
```

`PopcornExDoc.config/1` checks for the bundle at `_build/popcorn_exdoc_bundle/output/<app>.avm` automatically — no extra configuration needed if you use the default path.

If you want to use a bundle from a different location, add `bundle_path:` to your docs options — `PopcornExDoc.config/1` will extract it:

```elixir
defp docs do
  [
    main: "MyApp",
    bundle_path: "path/to/my_app.avm"
  ]
  |> PopcornExDoc.config()
end
```

### 3. Write code blocks that use your library

````markdown
```elixir
MyApp.some_function()
```
{: .popcorn-eval}
````

The WASM runtime loads both the evaluator bundle and your library bundle, so all your modules are available.

---

## Project structure

```
lib/
  popcorn_exdoc.ex                      # ExDoc config hooks (injects CSS + JS)
  mix/tasks/
    popcorn_exdoc.build.ex              # mix popcorn_exdoc.build (maintainers only)
    popcorn_exdoc.bundle.ex             # mix popcorn_exdoc.bundle (library authors)
    popcorn_exdoc/helpers.ex            # Shared helpers (step, cmd!, find!, cook_bundle)

wasm/
  lib/eval_elixir.ex                    # WASM-side GenServer, handles eval calls
  lib/eval_elixir/evaluator.ex          # Runs Code.eval_string/3 with isolated bindings

client/
  popcorn_exdoc.js                      # JS entry point
  src/runtime.js                        # Initializes the Popcorn WASM instance
  src/blocks.js                         # Decorates <pre.popcorn-eval> with Run buttons
  src/render.js                         # Renders stdout / return values / errors
  build.mjs                             # esbuild config

priv/static/                            # Pre-built assets (committed, not generated at install time)
  popcorn_exdoc.js
  popcorn_exdoc.css
  bundle.avm                            # Evaluator bundle (EvalElixir + Elixir stdlib)
  AtomVM.{mjs,wasm}
  iframe.mjs
```

---

## Building assets (maintainers only)

Requires Node.js.

```bash
mix popcorn_exdoc.build
```

This compiles the evaluator Elixir WASM bundle, bundles the JS via esbuild, and copies everything to `priv/static/`. End users do **not** need to run this — built assets are included in the package.
