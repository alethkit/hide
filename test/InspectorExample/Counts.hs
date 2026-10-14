-- SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
{-# LANGUAGE OverloadedStrings #-}
module InspectorExample.Counts (contribution) where
import qualified Data.Text as T
import Hide.PackageSources
import Hide.Plugin.Inspect
contribution :: Contribution
contribution=attach "example.counts" [either (error . show) id $
  viewDef "example.package.counts" "Counts" 30 (\here->
    Ready (Text [Facts [("Components",T.pack (show (length (sourceComponents (hereValue here)))))]]))]
