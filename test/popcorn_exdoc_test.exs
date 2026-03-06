defmodule PopcornExdocTest do
  use ExUnit.Case
  doctest PopcornExdoc

  test "greets the world" do
    assert PopcornExdoc.hello() == :world
  end
end
