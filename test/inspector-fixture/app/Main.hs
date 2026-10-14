-- SPDX-FileCopyrightText: 2026 Edward Kmett
-- SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
module Main (main) where

import Shapes (Shape(..), area, totalArea)

main :: IO ()
main = do
  print (area (Circle 2))
  print (totalArea [Circle 1, Rect 2 3])
