# Interactive Examples

This page demonstrates the interactive code evaluation features provided by PopcornExDoc.
Click **Run** on any code block below to see it execute live in your browser — no server needed.

## Basic Expressions

Simple arithmetic and string operations:

```elixir
1 + 2 * 3
```
{: .popcorn-eval}

```elixir
"Hello, " <> "World!"
```
{: .popcorn-eval}

## Printing Output

Use `IO.puts/1` and `IO.inspect/1` to print to stdout. Both the printed output and the return value are shown:

```elixir
IO.puts("Hello from WASM!")
```
{: .popcorn-eval}

```elixir
list = [1, 2, 3, 4, 5]
IO.inspect(list, label: "my list")
```
{: .popcorn-eval}

## Working with Lists and Enums

```elixir
Enum.map(1..10, fn x -> x * x end)
```
{: .popcorn-eval}

```elixir
1..100
|> Enum.filter(&(rem(&1, 3) == 0))
|> Enum.take(10)
```
{: .popcorn-eval}

## Pattern Matching

```elixir
{a, b, c} = {1, :hello, "world"}
IO.puts("a = #{a}")
IO.puts("b = #{b}")
IO.puts("c = #{c}")
```
{: .popcorn-eval}

## Maps and Keyword Lists

```elixir
user = %{name: "Alice", age: 30, role: :admin}
IO.inspect(user)
"#{user.name} is #{user.age} years old"
```
{: .popcorn-eval}

## Defining and Calling Functions

```elixir
fizzbuzz = fn
  n when rem(n, 15) == 0 -> "FizzBuzz"
  n when rem(n, 3) == 0 -> "Fizz"
  n when rem(n, 5) == 0 -> "Buzz"
  n -> Integer.to_string(n)
end

Enum.map(1..20, fizzbuzz) |> Enum.join(", ")
```
{: .popcorn-eval}

## Warnings

Compiler warnings are shown inline — for example, unused variables:

```elixir
x = 42
:ok
```
{: .popcorn-eval}

```elixir
IO.puts("Hello World")

undefined_variable
```
{: .popcorn-eval}

## Errors

Errors are displayed inline so you can see what went wrong:

```elixir
String.to_integer("not a number")
```
{: .popcorn-eval}

```elixir
List.first(:not_a_list)
```
{: .popcorn-eval}
