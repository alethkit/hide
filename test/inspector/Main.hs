-- SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
-- | Module      : Main
-- Copyright   : (c) Edward Kmett 2026
-- License     : BSD-2-Clause OR Apache-2.0
-- Maintainer  : Edward Kmett
-- Stability   : experimental
-- Portability : Haskell2010
--
-- Framework-free driver for the inspector checks. An unmet check calls
-- 'error', so a failure is a nonzero exit status.
module Main (main) where

import qualified InspectorWindowCheck
import qualified PluginInspectCheck

main :: IO ()
main=PluginInspectCheck.checks >> InspectorWindowCheck.checks
