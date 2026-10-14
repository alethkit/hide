-- SPDX-FileCopyrightText: 2026 Edward Kmett
-- SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
-- | A tiny module whose symbols the inspector acceptance run investigates.
module Shapes (Shape(..), area, totalArea) where

data Shape = Circle Double | Rect Double Double

-- | The area of one shape.
area :: Shape -> Double
area (Circle r) = 3 * r * r
area (Rect w h) = w * h

-- | The summed area of several shapes.
totalArea :: [Shape] -> Double
totalArea = sum . map area
